/**
 * Discrete product over arbitrary-precision decimal strings using exact
 * base-10 multiplicative factorization and a divide-and-conquer product tree.
 *
 * Mathematical identities used:
 * - Multiplicative homomorphism of finite decimal rationals:
 *     ∏ (s_k · m_k · 10^{e_k}) = (∏ s_k) · (∏ m_k) · 10^{∑ e_k}
 * - Empty product identity: ∏_{k ∈ ∅} x_k = 1
 * - Zero annihilation identity: if ∃k such that x_k = 0, then ∏ x_k = 0
 * - Associative binary-splitting product tree for balanced BigInt multiplication:
 *     ∏_{k=l}^{r} m_k = (∏_{k=l}^{mid} m_k) · (∏_{k=mid+1}^{r} m_k)
 *
 * Output is normalized without unnecessary trailing fractional zeros or "-0",
 * and rounded half-to-even (banker's rounding) to `precision` fractional decimal places.
 *
 * @module ops/discrete/productDecimalSeries
 */

const DECIMAL_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

const DEFAULT_PRECISION = 20;
const MAX_PRECISION = 100_000;
const MAX_OUTPUT_DIGITS = 200_000;

/**
 * Parse and strictly validate a finite arbitrary-precision decimal string
 * into its canonical factorized form `sign * mantissa * 10^exponent`.
 *
 * @param {unknown} raw - Candidate decimal string.
 * @param {number} index - Element index for diagnostic error messages.
 * @returns {{ isZero: boolean, sign: 1 | -1, mantissa: bigint, exponent: bigint }}
 */
function parseDecimalString(raw, index) {
	if (typeof raw !== "string") {
		throw new TypeError(`values[${index}] must be a decimal string, got ${typeof raw}`);
	}

	const match = DECIMAL_PATTERN.exec(raw);
	if (match === null) {
		throw new RangeError(`values[${index}] is not a valid finite decimal string: ${JSON.stringify(raw)}`);
	}

	const signStr = match[1];
	const intPart = match[2] ?? "";
	const fracPart = match[3] ?? match[4] ?? "";
	const expStr = match[5];

	const combined = intPart + fracPart;
	let start = 0;
	while (start < combined.length && combined.charCodeAt(start) === 48) {
		start++;
	}

	if (start === combined.length) {
		return { isZero: true, sign: 1, mantissa: 0n, exponent: 0n };
	}

	let end = combined.length;
	while (end > start && combined.charCodeAt(end - 1) === 48) {
		end--;
	}

	const trailingZeros = combined.length - end;
	const significantDigits = combined.slice(start, end);
	const baseExponent = expStr !== undefined ? BigInt(expStr) : 0n;
	const exponent = baseExponent - BigInt(fracPart.length) + BigInt(trailingZeros);

	return {
		isZero: false,
		sign: signStr === "-" ? -1 : 1,
		mantissa: BigInt(significantDigits),
		exponent,
	};
}

/**
 * Evaluate the product of a non-empty slice of positive BigInt mantissas
 * using a balanced divide-and-conquer product tree.
 *
 * @param {bigint[]} mantissas
 * @param {number} left
 * @param {number} right
 * @returns {bigint}
 */
function multiplyTree(mantissas, left, right) {
	if (left === right) {
		return mantissas[left];
	}
	if (right - left === 1) {
		return mantissas[left] * mantissas[right];
	}
	const mid = (left + right) >>> 1;
	return multiplyTree(mantissas, left, mid) * multiplyTree(mantissas, mid + 1, right);
}

/**
 * Format a non-negative scaled integer `intVal * 10^(-scale)` as a normalized
 * decimal string, stripping trailing fractional zeros and normalizing zero to "0".
 *
 * @param {bigint} intVal
 * @param {number} scale - Non-negative number of fractional digits.
 * @param {1 | -1} sign
 * @returns {string}
 */
function formatScaledDecimal(intVal, scale, sign) {
	if (intVal === 0n) {
		return "0";
	}

	const prefix = sign < 0 ? "-" : "";
	const digits = intVal.toString();

	if (scale === 0) {
		return prefix + digits;
	}

	let intPart;
	let fracPart;
	if (digits.length <= scale) {
		intPart = "0";
		fracPart = "0".repeat(scale - digits.length) + digits;
	} else {
		const split = digits.length - scale;
		intPart = digits.slice(0, split);
		fracPart = digits.slice(split);
	}

	let trimEnd = fracPart.length;
	while (trimEnd > 0 && fracPart.charCodeAt(trimEnd - 1) === 48) {
		trimEnd--;
	}

	if (trimEnd === 0) {
		return prefix + intPart;
	}

	const trimmedFrac = trimEnd === fracPart.length ? fracPart : fracPart.slice(0, trimEnd);
	return `${prefix}${intPart}.${trimmedFrac}`;
}

/**
 * Round and format `sign * mantissa * 10^exponent` to at most `precision`
 * fractional decimal places using round-half-to-even (banker's rounding).
 *
 * @param {1 | -1} sign
 * @param {bigint} mantissa - Positive BigInt.
 * @param {bigint} exponent - Base-10 exponent.
 * @param {number} precision - Non-negative integer fractional decimal places.
 * @returns {string}
 */
function roundAndFormat(sign, mantissa, exponent, precision) {
	const mStr = mantissa.toString();
	const digitCount = BigInt(mStr.length);
	const precisionBig = BigInt(precision);

	// Guard against unbounded fixed-point expansion of huge positive exponents.
	if (digitCount + exponent > BigInt(MAX_OUTPUT_DIGITS)) {
		throw new RangeError(
			`Product exceeds maximum fixed-point output length of ${MAX_OUTPUT_DIGITS} integer digits`,
		);
	}

	// shift = exponent + precision. Value * 10^precision = mantissa * 10^shift.
	const shift = exponent + precisionBig;

	// Case 1: exact representation fits within `precision` fractional places.
	if (shift >= 0n) {
		if (exponent >= 0n) {
			const prefix = sign < 0 ? "-" : "";
			return prefix + mStr + "0".repeat(Number(exponent));
		}
		return formatScaledDecimal(mantissa, Number(-exponent), sign);
	}

	// Case 2: shift < 0, drop k = -shift trailing decimal digits with half-to-even rounding.
	const dropCount = -shift;

	// Underflow shortcut: if digitCount < dropCount, then mantissa < 10^(dropCount - 1) < 0.5 * 10^dropCount.
	if (digitCount < dropCount) {
		return "0";
	}

	const k = Number(dropCount);
	const splitIdx = mStr.length - k;
	const keepStr = mStr.slice(0, splitIdx);
	const firstDroppedDigit = mStr.charCodeAt(splitIdx) - 48;

	let roundUp = false;
	if (firstDroppedDigit > 5) {
		roundUp = true;
	} else if (firstDroppedDigit === 5) {
		let hasNonZeroTail = false;
		for (let i = splitIdx + 1; i < mStr.length; i++) {
			if (mStr.charCodeAt(i) !== 48) {
				hasNonZeroTail = true;
				break;
			}
		}

		if (hasNonZeroTail) {
			roundUp = true;
		} else {
			// Exact tie: round to even.
			const lastKeptDigit = keepStr.length > 0 ? keepStr.charCodeAt(keepStr.length - 1) - 48 : 0;
			roundUp = (lastKeptDigit & 1) === 1;
		}
	}

	let scaled = keepStr.length > 0 ? BigInt(keepStr) : 0n;
	if (roundUp) {
		scaled += 1n;
	}

	return formatScaledDecimal(scaled, precision, sign);
}

/**
 * Compute the discrete product of an array of arbitrary-precision decimal strings,
 * rounded half-to-even to the requested number of fractional decimal places.
 *
 * Accepts standard finite decimal strings (optional leading `+`/`-`, optional
 * decimal point with digits on either side, and optional scientific notation
 * `e`/`E` with integer exponent). Leading/trailing whitespace is not permitted.
 *
 * @param {readonly string[]} values - Array of finite arbitrary-precision decimal strings.
 * @param {number} [precision=20] - Non-negative integer number of fractional decimal places (0..100000).
 * @returns {string} Normalized decimal string representing the discrete product.
 * @throws {TypeError} If `values` is not an Array, any element is not a string, or `precision` is not a number.
 * @throws {RangeError} If any element is not a valid finite decimal string, `precision` is out of range / non-integer, or the integer output exceeds maximum length.
 */
export function productDecimalSeries(values, precision = DEFAULT_PRECISION) {
	if (!Array.isArray(values)) {
		throw new TypeError("values must be an Array of decimal strings");
	}

	if (typeof precision !== "number") {
		throw new TypeError(`precision must be a number, got ${typeof precision}`);
	}

	if (!Number.isInteger(precision) || precision < 0 || precision > MAX_PRECISION) {
		throw new RangeError(`precision must be an integer between 0 and ${MAX_PRECISION}, got ${precision}`);
	}

	// Empty product identity: ∏_{∅} = 1
	if (values.length === 0) {
		return "1";
	}

	// Validate and parse all elements before applying zero annihilation so invalid
	// elements after a zero are never silently ignored.
	let hasZero = false;
	let sign = 1;
	let totalExponent = 0n;
	const mantissas = [];

	for (let i = 0; i < values.length; i++) {
		const parsed = parseDecimalString(values[i], i);
		if (parsed.isZero) {
			hasZero = true;
		} else if (!hasZero) {
			sign *= parsed.sign;
			totalExponent += parsed.exponent;
			mantissas.push(parsed.mantissa);
		}
	}

	// Zero annihilation identity: 0 * x = 0
	if (hasZero) {
		return "0";
	}

	const totalMantissa = multiplyTree(mantissas, 0, mantissas.length - 1);
	return roundAndFormat(sign, totalMantissa, totalExponent, precision);
}
