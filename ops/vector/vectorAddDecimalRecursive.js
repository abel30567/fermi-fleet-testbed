/**
 * Arbitrary-precision decimal vector addition using a recursive
 * divide-and-conquer implementation.
 *
 * @module ops/vector/vectorAddDecimalRecursive
 */

const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

/**
 * Recursively computes 10^exp as a BigInt via divide-and-conquer
 * exponentiation by squaring.
 *
 * @param {number} exp - Non-negative integer exponent.
 * @returns {bigint} 10n raised to the power of exp.
 */
function pow10Recursive(exp) {
	if (exp === 0) return 1n;
	if (exp === 1) return 10n;
	const half = pow10Recursive(Math.floor(exp / 2));
	const squared = half * half;
	return exp % 2 === 1 ? squared * 10n : squared;
}

/**
 * Parses and validates an arbitrary-precision decimal string into a scaled
 * BigInt representation `{ unscaled, scale }` such that the exact numeric
 * value equals `unscaled * 10^(-scale)`.
 *
 * @param {unknown} value - Candidate decimal string.
 * @param {string} label - Descriptive label for error messages.
 * @returns {{ unscaled: bigint, scale: number }} Parsed scaled integer.
 * @throws {TypeError} If value is not a valid decimal string.
 */
function parseDecimal(value, label) {
	if (typeof value !== 'string') {
		throw new TypeError(`${label} must be a decimal string`);
	}
	if (!DECIMAL_PATTERN.test(value)) {
		throw new TypeError(`${label} is not a valid decimal string: ${JSON.stringify(value)}`);
	}

	let sign = 1n;
	let unsigned = value;
	if (unsigned[0] === '-') {
		sign = -1n;
		unsigned = unsigned.slice(1);
	} else if (unsigned[0] === '+') {
		unsigned = unsigned.slice(1);
	}

	const dotIndex = unsigned.indexOf('.');
	let intPart;
	let fracPart;
	if (dotIndex === -1) {
		intPart = unsigned;
		fracPart = '';
	} else {
		intPart = unsigned.slice(0, dotIndex) || '0';
		fracPart = unsigned.slice(dotIndex + 1).replace(/0+$/, '');
	}

	const magnitude = BigInt(intPart + fracPart);
	const unscaled = magnitude === 0n ? 0n : sign * magnitude;
	return { unscaled, scale: fracPart.length };
}

/**
 * Formats a scaled BigInt `{ unscaled, scale }` into a canonical exact decimal
 * string (no redundant leading/trailing zeros, never "-0").
 *
 * @param {bigint} unscaled - Exact scaled integer value.
 * @param {number} scale - Number of fractional digits represented by unscaled.
 * @returns {string} Canonical decimal string.
 */
function formatExact(unscaled, scale) {
	if (unscaled === 0n) return '0';

	const isNegative = unscaled < 0n;
	const abs = isNegative ? -unscaled : unscaled;
	const digits = abs.toString();

	if (scale === 0) {
		return (isNegative ? '-' : '') + digits;
	}

	const padded = digits.padStart(scale + 1, '0');
	const splitIndex = padded.length - scale;
	const intPart = padded.slice(0, splitIndex);
	const fracPart = padded.slice(splitIndex).replace(/0+$/, '');

	return (isNegative ? '-' : '') + intPart + (fracPart.length > 0 ? `.${fracPart}` : '');
}

/**
 * Formats a scaled BigInt `{ unscaled, scale }` to exactly `precision`
 * fractional digits using exact round-half-away-from-zero semantics.
 *
 * @param {bigint} unscaled - Exact scaled integer value.
 * @param {number} scale - Current fractional digit count.
 * @param {number} precision - Target fixed fractional digit count (>= 0).
 * @returns {string} Rounded fixed-precision decimal string.
 */
function formatWithPrecision(unscaled, scale, precision) {
	const zeroResult = precision === 0 ? '0' : `0.${'0'.repeat(precision)}`;
	if (unscaled === 0n) return zeroResult;

	const isNegative = unscaled < 0n;
	const abs = isNegative ? -unscaled : unscaled;
	let adjusted;

	if (scale > precision) {
		const factor = pow10Recursive(scale - precision);
		const quotient = abs / factor;
		const remainder = abs % factor;
		const half = factor / 2n;
		adjusted = remainder >= half ? quotient + 1n : quotient;
	} else if (scale < precision) {
		adjusted = abs * pow10Recursive(precision - scale);
	} else {
		adjusted = abs;
	}

	if (adjusted === 0n) return zeroResult;

	const digits = adjusted.toString();
	if (precision === 0) {
		return (isNegative ? '-' : '') + digits;
	}

	const padded = digits.padStart(precision + 1, '0');
	const splitIndex = padded.length - precision;
	return `${isNegative ? '-' : ''}${padded.slice(0, splitIndex)}.${padded.slice(splitIndex)}`;
}

/**
 * Adds two arbitrary-precision decimal strings with optional rounding precision.
 *
 * @param {unknown} rawA - Element from vector a.
 * @param {unknown} rawB - Element from vector b.
 * @param {number} index - Element index for error reporting.
 * @param {number | undefined} precision - Optional fixed fractional precision.
 * @returns {string} Sum as a decimal string.
 */
function addDecimalPair(rawA, rawB, index, precision) {
	const x = parseDecimal(rawA, `a[${index}]`);
	const y = parseDecimal(rawB, `b[${index}]`);

	const maxScale = Math.max(x.scale, y.scale);
	const xAligned = x.scale < maxScale ? x.unscaled * pow10Recursive(maxScale - x.scale) : x.unscaled;
	const yAligned = y.scale < maxScale ? y.unscaled * pow10Recursive(maxScale - y.scale) : y.unscaled;
	const sum = xAligned + yAligned;

	return precision === undefined
		? formatExact(sum, maxScale)
		: formatWithPrecision(sum, maxScale, precision);
}

/**
 * Recursively computes element-wise decimal vector addition over slice
 * `[start, end)` using binary divide-and-conquer (O(log n) call-stack depth).
 *
 * @param {readonly string[]} a - First input vector.
 * @param {readonly string[]} b - Second input vector.
 * @param {number} start - Inclusive slice start index.
 * @param {number} end - Exclusive slice end index.
 * @param {number | undefined} precision - Optional fractional precision.
 * @param {string[]} out - Preallocated output vector.
 */
function addRangeRecursive(a, b, start, end, precision, out) {
	if (end <= start) return;
	if (end - start === 1) {
		out[start] = addDecimalPair(a[start], b[start], start, precision);
		return;
	}

	const mid = start + Math.floor((end - start) / 2);
	addRangeRecursive(a, b, start, mid, precision, out);
	addRangeRecursive(a, b, mid, end, precision, out);
}

/**
 * Adds two vectors of arbitrary-precision decimal strings element-wise using a
 * recursive divide-and-conquer algorithm.
 *
 * @param {readonly string[]} a - First vector of arbitrary-precision decimal strings.
 * @param {readonly string[]} b - Second vector of arbitrary-precision decimal strings (same length as `a`).
 * @param {number} [precision] - Optional non-negative safe integer specifying the
 *   number of fractional decimal places in each output element (rounded half away
 *   from zero). When omitted, exact normalized decimal strings are returned.
 * @returns {string[]} New vector containing the element-wise sums as decimal strings.
 * @throws {TypeError} If `a` or `b` is not an Array, if `precision` is provided
 *   and is not a number, or if any vector element is not a valid decimal string.
 * @throws {RangeError} If `a` and `b` have different lengths, or if `precision`
 *   is negative, non-integer, or not a safe integer.
 */
export function vectorAddDecimalRecursive(a, b, precision = undefined) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an array');
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an array');
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector length mismatch: a.length (${a.length}) !== b.length (${b.length})`
		);
	}
	if (precision !== undefined) {
		if (typeof precision !== 'number') {
			throw new TypeError('Optional argument "precision" must be a number');
		}
		if (!Number.isSafeInteger(precision) || precision < 0) {
			throw new RangeError(
				'Optional argument "precision" must be a non-negative safe integer'
			);
		}
	}

	const out = new Array(a.length);
	addRangeRecursive(a, b, 0, a.length, precision, out);
	return out;
}
