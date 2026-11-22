/**
 * Arbitrary-precision decimal matrix trace using recursive divide-and-conquer summation.
 *
 * Computes the trace of a square matrix of arbitrary-precision decimal strings:
 *   tr(A) = sum_{i=0}^{n-1} A[i][i]
 *
 * All intermediate arithmetic is exact using native `BigInt` scaled decimals.
 * Summation is performed recursively by splitting the diagonal index range
 * `[lo, hi]` in half until single-element base cases are reached, then
 * combining sub-sums bottom-up before rounding once at the end.
 *
 * @module ops/matrix/traceDecimalRecursive
 */

const DECIMAL_PATTERN =
	/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

const MAX_EXPONENT = 1_000_000;

/**
 * @typedef {object} BigDecimal
 * @property {bigint} coeff - Signed integer significand (0n iff value is zero).
 * @property {number} exp - Base-10 exponent such that value = coeff * 10^exp.
 */

/**
 * Parse a decimal string (fixed-point or scientific notation) into an exact BigDecimal.
 *
 * @param {string} value - Decimal string to parse.
 * @param {string} label - Descriptive label for error messages.
 * @returns {BigDecimal} Exact scaled BigInt representation.
 * @throws {TypeError} If `value` is not a string.
 * @throws {RangeError} If `value` is not a valid decimal string or its exponent exceeds bounds.
 */
function parseDecimal(value, label) {
	if (typeof value !== 'string') {
		throw new TypeError(`${label} must be a decimal string`);
	}

	const match = DECIMAL_PATTERN.exec(value);
	if (!match) {
		throw new RangeError(`${label} is not a valid decimal string: "${value}"`);
	}

	const sign = match[1] === '-' ? -1n : 1n;
	const intPart = match[2] ?? '';
	const fracPart = match[3] ?? match[4] ?? '';
	const expPart = match[5] !== undefined ? Number(match[5]) : 0;

	if (!Number.isSafeInteger(expPart)) {
		throw new RangeError(`${label} has an out-of-range exponent: "${value}"`);
	}

	const digits = intPart + fracPart;
	const trimmed = digits.replace(/^0+/, '');
	if (trimmed.length === 0) {
		return { coeff: 0n, exp: 0 };
	}

	// Strip trailing zeros to keep significand and exponent compact.
	const compact = trimmed.replace(/0+$/, '');
	const trailingZeros = trimmed.length - compact.length;
	const exp = expPart - fracPart.length + trailingZeros;

	if (!Number.isSafeInteger(exp) || Math.abs(exp) > MAX_EXPONENT) {
		throw new RangeError(`${label} has an out-of-range exponent: "${value}"`);
	}

	return {
		coeff: sign * BigInt(compact),
		exp,
	};
}

/**
 * Add two exact BigDecimal values without any precision loss.
 *
 * @param {BigDecimal} a - First addend.
 * @param {BigDecimal} b - Second addend.
 * @returns {BigDecimal} Exact sum `a + b`.
 */
function addDecimal(a, b) {
	if (a.coeff === 0n) return b;
	if (b.coeff === 0n) return a;

	let coeff;
	let exp;

	if (a.exp === b.exp) {
		coeff = a.coeff + b.coeff;
		exp = a.exp;
	} else if (a.exp > b.exp) {
		const diff = a.exp - b.exp;
		coeff = a.coeff * 10n ** BigInt(diff) + b.coeff;
		exp = b.exp;
	} else {
		const diff = b.exp - a.exp;
		coeff = a.coeff + b.coeff * 10n ** BigInt(diff);
		exp = a.exp;
	}

	if (coeff === 0n) {
		return { coeff: 0n, exp: 0 };
	}

	return { coeff, exp };
}

/**
 * Format a signed BigInt scaled by `10^(-scale)` into a canonical decimal string
 * with trailing fractional zeros removed and no negative zero.
 *
 * @param {bigint} value - Signed unscaled integer value.
 * @param {number} scale - Non-negative number of fractional digits.
 * @returns {string} Formatted decimal string.
 */
function formatScaled(value, scale) {
	if (value === 0n) {
		return '0';
	}

	const negative = value < 0n;
	const digits = (negative ? -value : value).toString();

	if (scale === 0) {
		return (negative ? '-' : '') + digits;
	}

	let intPart;
	let fracPart;

	if (digits.length <= scale) {
		intPart = '0';
		fracPart = digits.padStart(scale, '0');
	} else {
		const split = digits.length - scale;
		intPart = digits.slice(0, split);
		fracPart = digits.slice(split);
	}

	fracPart = fracPart.replace(/0+$/, '');
	if (fracPart.length === 0) {
		return (negative ? '-' : '') + intPart;
	}

	return `${negative ? '-' : ''}${intPart}.${fracPart}`;
}

/**
 * Round and format a BigDecimal to at most `precision` fractional digits
 * using symmetric round-half-away-from-zero.
 *
 * @param {BigDecimal} dec - Exact BigDecimal value.
 * @param {number} precision - Non-negative integer number of decimal places.
 * @returns {string} Rounded canonical decimal string.
 */
function formatDecimal(dec, precision) {
	const { coeff, exp } = dec;
	if (coeff === 0n) {
		return '0';
	}

	const targetExp = -precision;

	if (exp >= targetExp) {
		if (exp >= 0) {
			return (coeff * 10n ** BigInt(exp)).toString();
		}
		return formatScaled(coeff, -exp);
	}

	const drop = targetExp - exp;
	const negative = coeff < 0n;
	const absCoeff = negative ? -coeff : coeff;
	const divisor = 10n ** BigInt(drop);
	let quotient = absCoeff / divisor;
	const remainder = absCoeff % divisor;
	const half = divisor / 2n;

	if (remainder >= half) {
		quotient += 1n;
	}

	if (quotient === 0n) {
		return '0';
	}

	return formatScaled(negative ? -quotient : quotient, precision);
}

/**
 * Validate the input matrix and precision argument, ensuring every cell is a
 * valid decimal string and the matrix is non-empty and square.
 *
 * @param {unknown} matrix - Candidate 2D square array of decimal strings.
 * @param {unknown} precision - Candidate non-negative integer precision.
 * @throws {TypeError} If `matrix`, any row, any entry, or `precision` has an invalid type.
 * @throws {RangeError} If `matrix` is empty or non-square, any entry is not a valid decimal string,
 *   or `precision` is negative, non-integer, or non-finite.
 */
function validateInputs(matrix, precision) {
	if (typeof precision !== 'number') {
		throw new TypeError('precision must be a non-negative integer');
	}
	if (!Number.isInteger(precision) || precision < 0) {
		throw new RangeError('precision must be a non-negative integer');
	}

	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a non-empty square 2D array');
	}

	const n = matrix.length;
	if (n === 0) {
		throw new RangeError('matrix must be non-empty');
	}

	for (let i = 0; i < n; i++) {
		const row = matrix[i];
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${i}] must be an array`);
		}
		if (row.length !== n) {
			throw new RangeError(
				`matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`
			);
		}
		for (let j = 0; j < n; j++) {
			parseDecimal(row[j], `matrix[${i}][${j}]`);
		}
	}
}

/**
 * Recursively compute the exact sum of diagonal entries `matrix[k][k]` for `k` in `[lo, hi]`
 * using divide-and-conquer splitting.
 *
 * @param {string[][]} matrix - Validated square matrix of decimal strings.
 * @param {number} lo - Inclusive lower diagonal index.
 * @param {number} hi - Inclusive upper diagonal index.
 * @returns {BigDecimal} Exact sum of diagonal entries in `[lo, hi]`.
 */
function sumDiagonalRecursive(matrix, lo, hi) {
	if (lo === hi) {
		return parseDecimal(matrix[lo][lo], `matrix[${lo}][${lo}]`);
	}

	const mid = lo + Math.floor((hi - lo) / 2);
	const leftSum = sumDiagonalRecursive(matrix, lo, mid);
	const rightSum = sumDiagonalRecursive(matrix, mid + 1, hi);
	return addDecimal(leftSum, rightSum);
}

/**
 * Compute the trace of a square matrix of arbitrary-precision decimal strings
 * using a recursive divide-and-conquer summation over the main diagonal.
 *
 * All intermediate additions are exact (no floating-point rounding error), and
 * the final sum is rounded once to `precision` fractional digits using
 * round-half-away-from-zero with trailing fractional zeros omitted.
 *
 * @param {string[][]} matrix - Non-empty `n x n` 2D array of valid decimal strings
 *   (supports fixed-point and scientific notation such as `"1e30"` or `"-0.0005"`).
 * @param {number} [precision=20] - Non-negative integer number of decimal places
 *   for rounding the final result.
 * @returns {string} Exact (rounded to `precision` decimal places) trace as a canonical decimal string.
 * @throws {TypeError} If `matrix`, any row, any element, or `precision` has an invalid type.
 * @throws {RangeError} If `matrix` is empty or non-square, any element is not a valid decimal string,
 *   or `precision` is not a non-negative integer.
 */
export function traceDecimalRecursive(matrix, precision = 20) {
	validateInputs(matrix, precision);
	const exactTrace = sumDiagonalRecursive(matrix, 0, matrix.length - 1);
	return formatDecimal(exactTrace, precision);
}
