/**
 * @fileoverview Recursive divide-and-conquer matrix transpose over arbitrary-precision decimal strings.
 * @module ops/matrix/transposeDecimalRecursive
 */

const DECIMAL_PATTERN = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

/**
 * Parses, rounds (half away from zero), and normalizes a decimal string to at most
 * `precision` fractional digits using native `BigInt` arithmetic without `Number` precision loss.
 *
 * @param {string} raw - Valid decimal string (supports optional sign and scientific notation).
 * @param {number} precision - Non-negative integer maximum number of fractional digits.
 * @returns {string} Canonical normalized decimal string (no leading/trailing redundant zeros, no `-0`).
 */
function normalizeDecimal(raw, precision) {
	const trimmed = raw.trim();
	const match = DECIMAL_PATTERN.exec(trimmed);
	if (match === null) {
		throw new RangeError(`Invalid decimal string: ${JSON.stringify(raw)}`);
	}

	const isNegative = match[1] === '-';
	const intPart = match[2] ?? '';
	const fracPart = match[3] ?? match[4] ?? '';
	const expStr = match[5];

	let exp = 0;
	if (expStr !== undefined) {
		exp = Number(expStr);
		if (!Number.isSafeInteger(exp)) {
			throw new RangeError(`Exponent out of safe integer range in decimal string: ${JSON.stringify(raw)}`);
		}
	}

	const unscaled = BigInt(intPart + fracPart);
	if (unscaled === 0n) {
		return '0';
	}

	// Value magnitude is unscaled * 10^(-scale)
	const scale = fracPart.length - exp;

	let finalDigits;
	let finalScale;

	if (scale <= 0) {
		// Exact integer value: shift left by -scale
		finalDigits = unscaled * (10n ** BigInt(-scale));
		finalScale = 0;
	} else if (scale <= precision) {
		// No rounding needed; already within target precision
		finalDigits = unscaled;
		finalScale = scale;
	} else {
		// Round half away from zero to `precision` fractional digits
		const shift = scale - precision;
		const divisor = 10n ** BigInt(shift);
		const quotient = unscaled / divisor;
		const remainder = unscaled % divisor;
		finalDigits = remainder * 2n >= divisor ? quotient + 1n : quotient;
		finalScale = precision;
	}

	if (finalDigits === 0n) {
		return '0';
	}

	const signPrefix = isNegative ? '-' : '';
	const rawDigits = finalDigits.toString();

	if (finalScale === 0) {
		return signPrefix + rawDigits;
	}

	const padded = rawDigits.padStart(finalScale + 1, '0');
	const splitIndex = padded.length - finalScale;
	const whole = padded.slice(0, splitIndex);
	const fraction = padded.slice(splitIndex).replace(/0+$/, '');

	if (fraction.length === 0) {
		return signPrefix + whole;
	}

	return `${signPrefix}${whole}.${fraction}`;
}

/**
 * Validates that `matrix` is a non-empty rectangular 2D array of valid decimal strings
 * and `precision` is a valid non-negative safe integer.
 *
 * @param {unknown} matrix
 * @param {unknown} precision
 * @returns {{ rows: number, cols: number }}
 */
function validateInputs(matrix, precision) {
	if (typeof precision !== 'number') {
		throw new TypeError(`precision must be a number, got ${typeof precision}`);
	}
	if (!Number.isSafeInteger(precision) || precision < 0) {
		throw new RangeError(`precision must be a non-negative safe integer, got ${precision}`);
	}

	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of decimal strings');
	}
	if (matrix.length === 0) {
		throw new RangeError('matrix must be non-empty');
	}

	let cols = -1;
	for (let r = 0; r < matrix.length; r++) {
		const row = matrix[r];
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${r}] must be an array`);
		}
		if (row.length === 0) {
			throw new RangeError(`matrix[${r}] must be non-empty`);
		}
		if (cols === -1) {
			cols = row.length;
		} else if (row.length !== cols) {
			throw new RangeError(
				`matrix must be rectangular: row 0 has length ${cols}, but row ${r} has length ${row.length}`
			);
		}

		for (let c = 0; c < cols; c++) {
			const cell = row[c];
			if (typeof cell !== 'string') {
				throw new TypeError(`matrix[${r}][${c}] must be a decimal string, got ${typeof cell}`);
			}
			if (!DECIMAL_PATTERN.test(cell.trim())) {
				throw new RangeError(`matrix[${r}][${c}] is not a valid decimal string: ${JSON.stringify(cell)}`);
			}
		}
	}

	return { rows: matrix.length, cols };
}

/**
 * Recursively transposes a submatrix defined by `[rowStart, rowEnd) x [colStart, colEnd)`
 * using a divide-and-conquer strategy that splits along the larger dimension and
 * combines the transposed submatrices:
 *
 * - Row split: `[[A1], [A2]]^T = [A1^T, A2^T]` (horizontal combination)
 * - Column split: `[A1, A2]^T = [[A1^T], [A2^T]]` (vertical combination)
 *
 * @param {string[][]} matrix - Validated source matrix.
 * @param {number} rowStart - Inclusive start row index.
 * @param {number} rowEnd - Exclusive end row index.
 * @param {number} colStart - Inclusive start column index.
 * @param {number} colEnd - Exclusive end column index.
 * @param {number} precision - Non-negative integer fractional precision.
 * @returns {string[][]} Transposed submatrix of shape `(colEnd - colStart) x (rowEnd - rowStart)`.
 */
function transposeSubmatrix(matrix, rowStart, rowEnd, colStart, colEnd, precision) {
	const rowCount = rowEnd - rowStart;
	const colCount = colEnd - colStart;

	// Base case: 1x1 submatrix
	if (rowCount === 1 && colCount === 1) {
		return [[normalizeDecimal(matrix[rowStart][colStart], precision)]];
	}

	// Divide along the larger dimension and combine recursively
	if (rowCount >= colCount) {
		const rowMid = rowStart + Math.floor(rowCount / 2);
		const leftHalf = transposeSubmatrix(matrix, rowStart, rowMid, colStart, colEnd, precision);
		const rightHalf = transposeSubmatrix(matrix, rowMid, rowEnd, colStart, colEnd, precision);

		// Horizontal combination: concatenate corresponding rows
		const combined = new Array(colCount);
		for (let i = 0; i < colCount; i++) {
			combined[i] = leftHalf[i].concat(rightHalf[i]);
		}
		return combined;
	}

	const colMid = colStart + Math.floor(colCount / 2);
	const topHalf = transposeSubmatrix(matrix, rowStart, rowEnd, colStart, colMid, precision);
	const bottomHalf = transposeSubmatrix(matrix, rowStart, rowEnd, colMid, colEnd, precision);

	// Vertical combination: stack transposed column blocks
	return topHalf.concat(bottomHalf);
}

/**
 * Computes the transpose of a rectangular matrix of arbitrary-precision decimal strings
 * using a recursive divide-and-conquer algorithm.
 *
 * Each entry is parsed, rounded (half away from zero) to at most `precision` fractional
 * digits using native `BigInt` arithmetic, and formatted in canonical normalized form
 * (no redundant leading/trailing zeros and no negative zero).
 *
 * @param {string[][]} matrix - Non-empty rectangular 2D array of decimal strings.
 * @param {number} [precision=20] - Maximum number of fractional decimal places (non-negative integer).
 * @returns {string[][]} The transposed matrix of shape `cols x rows` with normalized decimal strings.
 * @throws {TypeError} If `matrix` is not a 2D array of strings or `precision` is not a number.
 * @throws {RangeError} If `matrix` is empty, jagged, contains invalid decimals, or `precision` is invalid.
 */
export function transposeDecimalRecursive(matrix, precision = 20) {
	const { rows, cols } = validateInputs(matrix, precision);
	return transposeSubmatrix(matrix, 0, rows, 0, cols, precision);
}
