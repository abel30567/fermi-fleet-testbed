/**
 * @fileoverview Arbitrary-precision matrix trace over decimal strings using
 * exact closed-form BigInt decimal arithmetic.
 */

const DECIMAL_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

/**
 * Parse and validate a decimal string into a normalized `{ unscaled, scale }`
 * representation denoting `unscaled * 10^(-scale)`.
 *
 * @param {unknown} value
 * @param {number} row
 * @param {number} col
 * @returns {{ unscaled: bigint, scale: number }}
 */
function parseDecimal(value, row, col) {
	if (typeof value !== 'string') {
		throw new TypeError(`matrix[${row}][${col}] must be a decimal string`);
	}

	const match = DECIMAL_PATTERN.exec(value);
	if (!match) {
		throw new RangeError(`matrix[${row}][${col}] is not a valid decimal string: "${value}"`);
	}

	const sign = match[1] === '-' ? -1n : 1n;
	const intPart = match[2] ?? '';
	const fracPart = match[3] ?? match[4] ?? '';
	const expStr = match[5];

	let exponent = 0;
	if (expStr !== undefined) {
		exponent = Number(expStr);
		if (!Number.isSafeInteger(exponent)) {
			throw new RangeError(`matrix[${row}][${col}] has an unsupported exponent: "${value}"`);
		}
	}

	let digits = (intPart + fracPart).replace(/^0+/, '');
	if (digits.length === 0) {
		return { unscaled: 0n, scale: 0 };
	}

	const rawScale = fracPart.length - exponent;
	if (!Number.isSafeInteger(rawScale)) {
		throw new RangeError(`matrix[${row}][${col}] has an unsupported decimal scale: "${value}"`);
	}

	const trimmed = digits.replace(/0+$/, '');
	const trailingZeros = digits.length - trimmed.length;
	const scale = rawScale - trailingZeros;
	if (!Number.isSafeInteger(scale)) {
		throw new RangeError(`matrix[${row}][${col}] has an unsupported decimal scale: "${value}"`);
	}

	return {
		unscaled: sign * BigInt(trimmed),
		scale,
	};
}

/**
 * Format an exact `{ unscaled, scale }` BigInt decimal rounded half away from
 * zero to at most `precision` fractional digits (with trailing fractional
 * zeros stripped and canonical `"0"` for zero).
 *
 * @param {bigint} unscaled
 * @param {number} scale
 * @param {number} precision
 * @returns {string}
 */
function formatDecimal(unscaled, scale, precision) {
	if (unscaled === 0n) {
		return '0';
	}

	const isNegative = unscaled < 0n;
	let absVal = isNegative ? -unscaled : unscaled;

	if (scale <= 0) {
		return (isNegative ? '-' : '') + absVal.toString() + '0'.repeat(-scale);
	}

	let effectiveScale = scale;
	if (scale > precision) {
		const drop = scale - precision;
		const divisor = 10n ** BigInt(drop);
		const quotient = absVal / divisor;
		const remainder = absVal % divisor;
		const half = divisor / 2n;
		absVal = remainder >= half ? quotient + 1n : quotient;
		effectiveScale = precision;
	}

	if (absVal === 0n) {
		return '0';
	}

	if (effectiveScale === 0) {
		return (isNegative ? '-' : '') + absVal.toString();
	}

	const digits = absVal.toString();
	let intPart;
	let fracPart;

	if (digits.length <= effectiveScale) {
		intPart = '0';
		fracPart = '0'.repeat(effectiveScale - digits.length) + digits;
	} else {
		const splitIndex = digits.length - effectiveScale;
		intPart = digits.slice(0, splitIndex);
		fracPart = digits.slice(splitIndex);
	}

	fracPart = fracPart.replace(/0+$/, '');
	const signPrefix = isNegative ? '-' : '';
	return fracPart.length === 0 ? `${signPrefix}${intPart}` : `${signPrefix}${intPart}.${fracPart}`;
}

/**
 * Compute the trace of a square matrix of arbitrary-precision decimal strings:
 *
 *   tr(A) = sum_{i=0}^{n-1} A[i][i]
 *
 * The diagonal sum is computed exactly in BigInt fixed-point decimal arithmetic
 * (avoiding floating-point rounding and catastrophic cancellation) and then
 * rounded half away from zero to `precision` fractional digits, returning a
 * canonical decimal string without unnecessary trailing fractional zeros.
 *
 * @param {string[][]} matrix - Non-empty square 2D array of valid decimal strings
 *   (supports optional sign, decimal point, and scientific `e`/`E` notation).
 * @param {number} [precision=30] - Non-negative integer number of fractional
 *   digits to round the final result to.
 * @returns {string} The matrix trace formatted as a canonical decimal string.
 * @throws {TypeError} If `matrix` is not a 2D array of strings or `precision` is not a number.
 * @throws {RangeError} If `matrix` is empty, non-square, contains invalid decimal strings,
 *   or `precision` is not a non-negative integer.
 */
export function traceDecimalSeries(matrix, precision = 30) {
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a non-negative integer');
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative integer');
	}

	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a non-empty square 2D array of decimal strings');
	}

	const n = matrix.length;
	if (n === 0) {
		throw new RangeError('matrix must be non-empty');
	}

	/** @type {Array<{ unscaled: bigint, scale: number }>} */
	const diagonalTerms = [];

	for (let i = 0; i < n; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${i}] must be an array of decimal strings`);
		}
		if (row.length !== n) {
			throw new RangeError(`matrix must be square: expected row ${i} length ${n}, got ${row.length}`);
		}

		for (let j = 0; j < n; j++) {
			const parsed = parseDecimal(row[j], i, j);
			if (i === j && parsed.unscaled !== 0n) {
				diagonalTerms.push(parsed);
			}
		}
	}

	if (diagonalTerms.length === 0) {
		return '0';
	}

	let maxScale = diagonalTerms[0].scale;
	for (let i = 1; i < diagonalTerms.length; i++) {
		if (diagonalTerms[i].scale > maxScale) {
			maxScale = diagonalTerms[i].scale;
		}
	}

	let sumUnscaled = 0n;
	for (let i = 0; i < diagonalTerms.length; i++) {
		const term = diagonalTerms[i];
		const shift = maxScale - term.scale;
		sumUnscaled += shift === 0 ? term.unscaled : term.unscaled * (10n ** BigInt(shift));
	}

	return formatDecimal(sumUnscaled, maxScale, precision);
}
