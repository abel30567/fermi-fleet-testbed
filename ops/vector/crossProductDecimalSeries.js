/**
 * Arbitrary-precision 3D vector cross product over decimal strings.
 *
 * Uses the closed-form Levi-Civita / determinant expansion:
 *   (a × b)_i = Σ_{j,k} ε_{ijk} a_j b_k
 *             = (a_1*b_2 - a_2*b_1, a_2*b_0 - a_0*b_2, a_0*b_1 - a_1*b_0)
 *
 * All intermediate multiplications and subtractions are performed with exact
 * BigInt base-10 arithmetic (eliminating floating-point catastrophic
 * cancellation) and rounded only once at the end to `precision` fractional
 * decimal places using round-half-away-from-zero.
 */

const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const MAX_EXPONENT = 1_000_000;
const MAX_PRECISION = 1_000_000;

/**
 * Cyclic index pairs (j, k) for each component i where ε_{ijk} = +1 and ε_{ikj} = -1.
 * @type {readonly [number, number][]}
 */
const LEVI_CIVITA_PAIRS = Object.freeze([
	[1, 2],
	[2, 0],
	[0, 1],
]);

/**
 * Parses a validated decimal string into an exact base-10 representation
 * `coeff * 10^exp`.
 *
 * @param {string} value - Decimal string to parse.
 * @param {string} label - Parameter label for error reporting.
 * @returns {{ coeff: bigint, exp: number }}
 */
function parseDecimal(value, label) {
	if (typeof value !== 'string') {
		throw new TypeError(`${label} must be a decimal string`);
	}
	if (!DECIMAL_PATTERN.test(value)) {
		throw new RangeError(`${label} is not a valid decimal string: "${value}"`);
	}

	let negative = false;
	let start = 0;
	if (value[0] === '-') {
		negative = true;
		start = 1;
	} else if (value[0] === '+') {
		start = 1;
	}

	let expIndex = value.indexOf('e', start);
	if (expIndex === -1) {
		expIndex = value.indexOf('E', start);
	}

	let mantissa;
	let explicitExp = 0;
	if (expIndex !== -1) {
		mantissa = value.slice(start, expIndex);
		explicitExp = Number(value.slice(expIndex + 1));
		if (!Number.isSafeInteger(explicitExp) || Math.abs(explicitExp) > MAX_EXPONENT) {
			throw new RangeError(`${label} exponent is out of supported range`);
		}
	} else {
		mantissa = value.slice(start);
	}

	const dotIndex = mantissa.indexOf('.');
	let digits;
	let fracLen = 0;
	if (dotIndex !== -1) {
		digits = mantissa.slice(0, dotIndex) + mantissa.slice(dotIndex + 1);
		fracLen = mantissa.length - dotIndex - 1;
	} else {
		digits = mantissa;
	}

	// Strip leading zeros
	let firstNonZero = 0;
	while (firstNonZero < digits.length && digits[firstNonZero] === '0') {
		firstNonZero += 1;
	}
	if (firstNonZero === digits.length) {
		return { coeff: 0n, exp: 0 };
	}

	// Strip trailing zeros to keep BigInt coefficients compact
	let lastNonZero = digits.length - 1;
	while (lastNonZero > firstNonZero && digits[lastNonZero] === '0') {
		lastNonZero -= 1;
	}
	const trailingZeros = digits.length - 1 - lastNonZero;
	const exp = explicitExp - fracLen + trailingZeros;

	if (Math.abs(exp) > MAX_EXPONENT) {
		throw new RangeError(`${label} effective exponent is out of supported range`);
	}

	let coeff = BigInt(digits.slice(firstNonZero, lastNonZero + 1));
	if (negative) {
		coeff = -coeff;
	}

	return { coeff, exp };
}

/**
 * Validates and parses a 3D vector of decimal strings.
 *
 * @param {unknown} vec - Candidate 3-element array of decimal strings.
 * @param {string} name - Parameter name for error messages.
 * @returns {[{ coeff: bigint, exp: number }, { coeff: bigint, exp: number }, { coeff: bigint, exp: number }]}
 */
function parseVector3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an array of 3 decimal strings`);
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3, received ${vec.length}`);
	}
	return [
		parseDecimal(vec[0], `${name}[0]`),
		parseDecimal(vec[1], `${name}[1]`),
		parseDecimal(vec[2], `${name}[2]`),
	];
}

/**
 * Computes the exact product of two base-10 decimals.
 *
 * @param {{ coeff: bigint, exp: number }} x
 * @param {{ coeff: bigint, exp: number }} y
 * @returns {{ coeff: bigint, exp: number }}
 */
function mulDecimal(x, y) {
	if (x.coeff === 0n || y.coeff === 0n) {
		return { coeff: 0n, exp: 0 };
	}
	return {
		coeff: x.coeff * y.coeff,
		exp: x.exp + y.exp,
	};
}

/**
 * Computes the exact difference `x - y` of two base-10 decimals.
 *
 * @param {{ coeff: bigint, exp: number }} x
 * @param {{ coeff: bigint, exp: number }} y
 * @returns {{ coeff: bigint, exp: number }}
 */
function subDecimal(x, y) {
	if (x.coeff === 0n && y.coeff === 0n) {
		return { coeff: 0n, exp: 0 };
	}
	if (x.coeff === 0n) {
		return { coeff: -y.coeff, exp: y.exp };
	}
	if (y.coeff === 0n) {
		return x;
	}

	const minExp = Math.min(x.exp, y.exp);
	const xScaled = x.exp === minExp ? x.coeff : x.coeff * (10n ** BigInt(x.exp - minExp));
	const yScaled = y.exp === minExp ? y.coeff : y.coeff * (10n ** BigInt(y.exp - minExp));
	const diff = xScaled - yScaled;

	if (diff === 0n) {
		return { coeff: 0n, exp: 0 };
	}
	return { coeff: diff, exp: minExp };
}

/**
 * Formats an exact base-10 decimal rounded to `precision` fractional decimal
 * places (round-half-away-from-zero) with trailing fractional zeros trimmed.
 *
 * @param {{ coeff: bigint, exp: number }} dec
 * @param {number} precision
 * @returns {string}
 */
function formatDecimal(dec, precision) {
	if (dec.coeff === 0n) {
		return '0';
	}

	const negative = dec.coeff < 0n;
	let absCoeff = negative ? -dec.coeff : dec.coeff;
	let exp = dec.exp;

	if (exp >= 0) {
		return (negative ? '-' : '') + absCoeff.toString() + '0'.repeat(exp);
	}

	const fracDigits = -exp;
	if (fracDigits > precision) {
		const drop = fracDigits - precision;
		const digitCount = absCoeff.toString().length;
		if (digitCount < drop) {
			return '0';
		}
		const divisor = 10n ** BigInt(drop);
		let quotient = absCoeff / divisor;
		const remainder = absCoeff % divisor;
		if (remainder * 2n >= divisor) {
			quotient += 1n;
		}
		if (quotient === 0n) {
			return '0';
		}
		absCoeff = quotient;
		exp = -precision;
	}

	const sign = negative ? '-' : '';
	const scale = -exp;
	const raw = absCoeff.toString();

	if (scale === 0) {
		return sign + raw;
	}

	let intPart;
	let fracPart;
	if (raw.length <= scale) {
		intPart = '0';
		fracPart = '0'.repeat(scale - raw.length) + raw;
	} else {
		const split = raw.length - scale;
		intPart = raw.slice(0, split);
		fracPart = raw.slice(split);
	}

	// Trim trailing fractional zeros
	let end = fracPart.length;
	while (end > 0 && fracPart[end - 1] === '0') {
		end -= 1;
	}
	if (end === 0) {
		return sign + intPart;
	}
	return `${sign}${intPart}.${fracPart.slice(0, end)}`;
}

/**
 * Computes the 3D cross product `a × b` over arbitrary-precision decimal strings.
 *
 * Uses the closed-form determinant / Levi-Civita identity with exact BigInt
 * decimal arithmetic for all intermediate operations, rounding each output
 * component once to `precision` fractional decimal places (round-half-away-from-zero)
 * and trimming trailing fractional zeros.
 *
 * @param {readonly [string, string, string]} a - First 3D vector of decimal strings.
 * @param {readonly [string, string, string]} b - Second 3D vector of decimal strings.
 * @param {number} [precision=30] - Non-negative integer number of fractional decimal places for rounding.
 * @returns {[string, string, string]} The resulting 3D cross product vector of decimal strings.
 * @throws {TypeError} If `a` or `b` is not an array, any element is not a string, or `precision` is not a number.
 * @throws {RangeError} If `a` or `b` does not have length 3, any element is not a valid decimal string, or `precision` is invalid.
 */
export function crossProductDecimalSeries(a, b, precision = 30) {
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a number');
	}
	if (!Number.isSafeInteger(precision) || precision < 0 || precision > MAX_PRECISION) {
		throw new RangeError(`precision must be an integer between 0 and ${MAX_PRECISION}`);
	}

	const vecA = parseVector3(a, 'a');
	const vecB = parseVector3(b, 'b');

	return /** @type {[string, string, string]} */ (
		LEVI_CIVITA_PAIRS.map(([j, k]) => {
			const posTerm = mulDecimal(vecA[j], vecB[k]);
			const negTerm = mulDecimal(vecA[k], vecB[j]);
			const component = subDecimal(posTerm, negTerm);
			return formatDecimal(component, precision);
		})
	);
}
