const DECIMAL_REGEX = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

/**
 * Parse a decimal string (supporting optional sign and scientific notation)
 * into a normalized BigInt coefficient and base-10 exponent such that
 * value = coeff * 10^exp.
 *
 * @param {string} raw - Input decimal string.
 * @param {number} index - Element index for error reporting.
 * @returns {{ coeff: bigint, exp: number }} Normalized decimal representation.
 * @throws {TypeError} If the element is not a valid decimal string.
 * @throws {RangeError} If the scientific notation exponent is not a safe integer.
 */
function parseDecimal(raw, index) {
	if (typeof raw !== "string") {
		throw new TypeError(`values[${index}] must be a decimal string, received ${typeof raw}`);
	}

	const trimmed = raw.trim();
	const match = DECIMAL_REGEX.exec(trimmed);
	if (!match) {
		throw new TypeError(`values[${index}] is not a valid decimal string: "${raw}"`);
	}

	const sign = match[1];
	const intPart = match[2] ?? "";
	const fracPart = match[3] ?? match[4] ?? "";
	const sciExpStr = match[5];

	let sciExp = 0;
	if (sciExpStr !== undefined) {
		sciExp = Number(sciExpStr);
		if (!Number.isSafeInteger(sciExp)) {
			throw new RangeError(`values[${index}] has an exponent outside safe integer range: "${raw}"`);
		}
	}

	const rawDigits = (intPart + fracPart).replace(/^0+/, "");
	if (rawDigits.length === 0) {
		return { coeff: 0n, exp: 0 };
	}

	// Strip trailing zeros to keep coefficient and exponent minimal.
	let end = rawDigits.length;
	while (end > 0 && rawDigits.charCodeAt(end - 1) === 48) {
		end--;
	}
	const trailingZeros = rawDigits.length - end;
	const significantDigits = rawDigits.slice(0, end);
	const exp = sciExp - fracPart.length + trailingZeros;

	if (!Number.isSafeInteger(exp)) {
		throw new RangeError(`values[${index}] resulting base-10 exponent is outside safe integer range`);
	}

	let coeff = BigInt(significantDigits);
	if (sign === "-") {
		coeff = -coeff;
	}

	return { coeff, exp };
}

/**
 * Format an exact decimal value (coeff * 10^exp) rounded half-away-from-zero
 * to at most `precision` fractional digits, returning a normalized decimal string.
 *
 * @param {bigint} coeff - Exact integer coefficient.
 * @param {number} exp - Base-10 exponent.
 * @param {number} precision - Maximum number of fractional digits (non-negative integer).
 * @returns {string} Normalized decimal string without "-0" or trailing fractional zeros.
 */
function formatDecimal(coeff, exp, precision) {
	if (coeff === 0n) {
		return "0";
	}

	const negative = coeff < 0n;
	const absCoeff = negative ? -coeff : coeff;

	if (exp >= 0) {
		return (negative ? "-" : "") + absCoeff.toString() + "0".repeat(exp);
	}

	const scale = -exp;
	let scaledMag = absCoeff;
	let outScale = scale;

	if (scale > precision) {
		const drop = scale - precision;
		const divisor = 10n ** BigInt(drop);
		let quotient = absCoeff / divisor;
		const remainder = absCoeff % divisor;
		if (remainder * 2n >= divisor) {
			quotient += 1n;
		}
		if (quotient === 0n) {
			return "0";
		}
		scaledMag = quotient;
		outScale = precision;
	}

	if (outScale === 0) {
		return (negative ? "-" : "") + scaledMag.toString();
	}

	const digits = scaledMag.toString();
	let intPart;
	let fracPart;

	if (digits.length <= outScale) {
		intPart = "0";
		fracPart = "0".repeat(outScale - digits.length) + digits;
	} else {
		const splitIdx = digits.length - outScale;
		intPart = digits.slice(0, splitIdx);
		fracPart = digits.slice(splitIdx);
	}

	let fracEnd = fracPart.length;
	while (fracEnd > 0 && fracPart.charCodeAt(fracEnd - 1) === 48) {
		fracEnd--;
	}
	fracPart = fracPart.slice(0, fracEnd);

	if (fracPart.length === 0) {
		return (negative ? "-" : "") + intPart;
	}

	return (negative ? "-" : "") + intPart + "." + fracPart;
}

/**
 * Computes the discrete summation of an array of arbitrary-precision decimal strings
 * using an iterative BigInt fixed-point algorithm with zero floating-point loss.
 *
 * All terms are accumulated exactly at their common base-10 scale before rounding
 * once at the end using round-half-away-from-zero to at most `precision` fractional
 * digits. Output strings are normalized (no leading zeros except `"0"`, no trailing
 * fractional zeros, and never `"-0"`).
 *
 * @param {string[]} values - Array of decimal strings (integers, decimals, leading `+`/`-`, optional scientific notation).
 * @param {number} [precision=20] - Non-negative integer maximum number of fractional digits in the output.
 * @returns {string} The exact sum formatted and rounded to `precision` decimal places.
 * @throws {TypeError} If `values` is not an array, any element is not a valid decimal string, or `precision` is not a number.
 * @throws {RangeError} If `precision` is not a non-negative safe integer, or if scale differences exceed safe integer bounds.
 */
export function summationDecimalIterative(values, precision = 20) {
	if (!Array.isArray(values)) {
		throw new TypeError("values must be an array of decimal strings");
	}
	if (typeof precision !== "number" || Number.isNaN(precision)) {
		throw new TypeError("precision must be a non-negative integer");
	}
	if (!Number.isInteger(precision) || precision < 0 || !Number.isSafeInteger(precision)) {
		throw new RangeError("precision must be a non-negative safe integer");
	}

	const terms = [];
	let minExp = Infinity;

	for (let i = 0; i < values.length; i++) {
		const parsed = parseDecimal(values[i], i);
		if (parsed.coeff !== 0n) {
			terms.push(parsed);
			if (parsed.exp < minExp) {
				minExp = parsed.exp;
			}
		}
	}

	if (terms.length === 0) {
		return "0";
	}

	let total = 0n;
	for (let i = 0; i < terms.length; i++) {
		const { coeff, exp } = terms[i];
		const shift = exp - minExp;
		if (!Number.isSafeInteger(shift) || shift < 0) {
			throw new RangeError("Scale difference between terms exceeds safe integer bounds");
		}
		if (shift === 0) {
			total += coeff;
		} else {
			total += coeff * (10n ** BigInt(shift));
		}
	}

	return formatDecimal(total, minExp, precision);
}
