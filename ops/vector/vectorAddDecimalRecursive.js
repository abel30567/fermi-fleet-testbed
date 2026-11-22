/**
 * @fileoverview Arbitrary-precision element-wise vector addition over decimal
 * strings using BigInt arithmetic and a recursive divide-and-conquer strategy.
 */

const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * Parses a validated decimal string into a scaled BigInt representation
 * (`value * 10^(-scale)`).
 *
 * @param {string} raw - Decimal string to parse.
 * @param {string} label - Parameter label for error messages.
 * @param {number} index - Vector element index for error messages.
 * @returns {{ value: bigint, scale: number }} Scaled BigInt representation.
 * @throws {TypeError} If `raw` is not a string.
 * @throws {RangeError} If `raw` is not a valid decimal string.
 */
function parseDecimal(raw, label, index) {
	if (typeof raw !== 'string') {
		throw new TypeError(`${label}[${index}] must be a decimal string`);
	}
	if (!DECIMAL_PATTERN.test(raw)) {
		throw new RangeError(`${label}[${index}] is not a valid decimal string: "${raw}"`);
	}

	let sign = 1n;
	let unsigned = raw;
	if (unsigned[0] === '-') {
		sign = -1n;
		unsigned = unsigned.slice(1);
	} else if (unsigned[0] === '+') {
		unsigned = unsigned.slice(1);
	}

	const dotIdx = unsigned.indexOf('.');
	let intPart;
	let fracPart;
	if (dotIdx === -1) {
		intPart = unsigned;
		fracPart = '';
	} else {
		intPart = unsigned.slice(0, dotIdx);
		fracPart = unsigned.slice(dotIdx + 1);
	}

	const digits = (intPart || '0') + fracPart;
	const magnitude = BigInt(digits);
	const value = magnitude === 0n ? 0n : sign * magnitude;

	return { value, scale: fracPart.length };
}

/**
 * Rounds a scaled BigInt value (`value * 10^(-scale)`) to at most `precision`
 * fractional digits using half-away-from-zero rounding and formats it as a
 * canonical decimal string (no trailing fractional zeros, no `-0`).
 *
 * @param {bigint} value - Unrounded scaled integer value.
 * @param {number} scale - Current number of fractional digits.
 * @param {number} precision - Maximum fractional digits to retain.
 * @returns {string} Canonical decimal string representation.
 */
function roundAndFormatDecimal(value, scale, precision) {
	let adjustedValue = value;
	let adjustedScale = scale;

	if (scale > precision) {
		const diff = scale - precision;
		const factor = 10n ** BigInt(diff);
		const isNeg = adjustedValue < 0n;
		const absVal = isNeg ? -adjustedValue : adjustedValue;
		const quotient = absVal / factor;
		const remainder = absVal % factor;
		const half = factor / 2n;
		const roundedAbs = remainder >= half ? quotient + 1n : quotient;
		adjustedValue = isNeg ? -roundedAbs : roundedAbs;
		adjustedScale = precision;
	}

	if (adjustedValue === 0n) {
		return '0';
	}

	const isNeg = adjustedValue < 0n;
	const digits = (isNeg ? -adjustedValue : adjustedValue).toString();

	if (adjustedScale === 0) {
		return isNeg ? `-${digits}` : digits;
	}

	const padded = digits.padStart(adjustedScale + 1, '0');
	const intPart = padded.slice(0, padded.length - adjustedScale);
	const fracPart = padded.slice(padded.length - adjustedScale).replace(/0+$/, '');
	const prefix = isNeg ? '-' : '';

	return fracPart.length > 0 ? `${prefix}${intPart}.${fracPart}` : `${prefix}${intPart}`;
}

/**
 * Adds two arbitrary-precision decimal strings and rounds to `precision`
 * fractional digits.
 *
 * @param {string} rawA - First decimal string operand.
 * @param {string} rawB - Second decimal string operand.
 * @param {number} precision - Maximum fractional digits in the result.
 * @param {number} index - Element index for error reporting.
 * @returns {string} Canonical decimal string of `rawA + rawB`.
 */
function addDecimalPair(rawA, rawB, precision, index) {
	const a = parseDecimal(rawA, 'vecA', index);
	const b = parseDecimal(rawB, 'vecB', index);

	const commonScale = Math.max(a.scale, b.scale);
	const scaledA = a.scale < commonScale ? a.value * (10n ** BigInt(commonScale - a.scale)) : a.value;
	const scaledB = b.scale < commonScale ? b.value * (10n ** BigInt(commonScale - b.scale)) : b.value;

	return roundAndFormatDecimal(scaledA + scaledB, commonScale, precision);
}

/**
 * Recursively splits `[start, end)` in half (divide-and-conquer) and computes
 * element-wise decimal sums into `result`.
 *
 * @param {string[]} vecA - First input vector.
 * @param {string[]} vecB - Second input vector.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {number} precision - Maximum fractional digits to retain.
 * @param {string[]} result - Output array populated in place.
 */
function addRangeDivideAndConquer(vecA, vecB, start, end, precision, result) {
	const length = end - start;
	if (length <= 0) {
		return;
	}
	if (length === 1) {
		result[start] = addDecimalPair(vecA[start], vecB[start], precision, start);
		return;
	}

	const mid = start + Math.floor(length / 2);
	addRangeDivideAndConquer(vecA, vecB, start, mid, precision, result);
	addRangeDivideAndConquer(vecA, vecB, mid, end, precision, result);
}

/**
 * Computes element-wise addition of two equal-length vectors of
 * arbitrary-precision decimal strings using BigInt arithmetic and a recursive
 * divide-and-conquer strategy.
 *
 * Each element sum is computed exactly in BigInt and then rounded to at most
 * `precision` fractional digits using half-away-from-zero rounding, with
 * trailing fractional zeros stripped.
 *
 * @param {string[]} vecA - First vector of decimal strings.
 * @param {string[]} vecB - Second vector of decimal strings.
 * @param {number} [precision=20] - Non-negative integer specifying maximum
 *   fractional digits in each output element.
 * @returns {string[]} New vector of canonical decimal strings representing the
 *   element-wise sum of `vecA` and `vecB`.
 * @throws {TypeError} If `vecA` or `vecB` is not an array, `precision` is not a
 *   number, or any element is not a string.
 * @throws {RangeError} If `vecA` and `vecB` have different lengths, `precision`
 *   is not a non-negative safe integer, or any element is not a valid decimal
 *   string.
 */
export function vectorAddDecimalRecursive(vecA, vecB, precision = 20) {
	if (!Array.isArray(vecA)) {
		throw new TypeError('vecA must be an array');
	}
	if (!Array.isArray(vecB)) {
		throw new TypeError('vecB must be an array');
	}
	if (vecA.length !== vecB.length) {
		throw new RangeError(
			`Vectors must have equal length (received ${vecA.length} and ${vecB.length})`
		);
	}
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a number');
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative safe integer');
	}

	const result = new Array(vecA.length);
	addRangeDivideAndConquer(vecA, vecB, 0, vecA.length, precision, result);
	return result;
}
