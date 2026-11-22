/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Normalizes negative zero (`-0`) to positive zero (`0`).
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Validates that a value is a complex number `{ re, im }` with finite numeric components.
 *
 * @param {unknown} value
 * @param {number} row
 * @param {number} col
 * @throws {TypeError} If the entry is not a `{ re, im }` object with numeric fields.
 * @throws {RangeError} If `re` or `im` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplexEntry(value, row, col) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`matrix[${row}][${col}] must be a complex number object { re, im }`);
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`matrix[${row}][${col}] must have numeric re and im properties`);
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`matrix[${row}][${col}] must have finite re and im values`);
	}
}

/**
 * Validates a 2D complex matrix and returns its dimensions `{ rows, cols }`.
 *
 * @param {unknown} matrix
 * @returns {{ rows: number, cols: number }}
 * @throws {TypeError} If `matrix` is not a 2D array of `{ re, im }` objects.
 * @throws {RangeError} If `matrix` is empty, jagged, or contains non-finite numbers.
 */
function validateComplexMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of complex numbers');
	}
	const rows = matrix.length;
	if (rows === 0) {
		throw new RangeError('matrix must have at least one row');
	}
	if (!Array.isArray(matrix[0])) {
		throw new TypeError('matrix[0] must be an array');
	}
	const cols = matrix[0].length;
	if (cols === 0) {
		throw new RangeError('matrix must have at least one column');
	}

	for (let r = 0; r < rows; r++) {
		const row = matrix[r];
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${r}] must be an array`);
		}
		if (row.length !== cols) {
			throw new RangeError(
				`matrix must be rectangular: row ${r} has length ${row.length}, expected ${cols}`,
			);
		}
		for (let c = 0; c < cols; c++) {
			validateComplexEntry(row[c], r, c);
		}
	}

	return { rows, cols };
}

/**
 * Recursively transposes a submatrix block using cache-oblivious divide-and-conquer.
 *
 * Splits along the larger dimension (`rowCount` vs. `colCount`) until reaching a `1 x 1`
 * base case, copying `{ re, im }` with `-0` normalized to `0`.
 *
 * @param {Complex[][]} src
 * @param {Complex[][]} dst
 * @param {number} rowStart
 * @param {number} rowCount
 * @param {number} colStart
 * @param {number} colCount
 */
function transposeBlock(src, dst, rowStart, rowCount, colStart, colCount) {
	if (rowCount === 1 && colCount === 1) {
		const cell = src[rowStart][colStart];
		dst[colStart][rowStart] = {
			re: normalizeZero(cell.re),
			im: normalizeZero(cell.im),
		};
		return;
	}

	if (rowCount >= colCount) {
		const mid = Math.floor(rowCount / 2);
		transposeBlock(src, dst, rowStart, mid, colStart, colCount);
		transposeBlock(src, dst, rowStart + mid, rowCount - mid, colStart, colCount);
	} else {
		const mid = Math.floor(colCount / 2);
		transposeBlock(src, dst, rowStart, rowCount, colStart, mid);
		transposeBlock(src, dst, rowStart, rowCount, colStart + mid, colCount - mid);
	}
}

/**
 * Computes the algebraic (non-conjugate) transpose of a matrix of complex numbers
 * using a recursive divide-and-conquer algorithm.
 *
 * Algorithm:
 * - Cache-oblivious divide-and-conquer block transpose: recursively splits the current
 *   `m x n` submatrix along its larger dimension (`Math.floor(dim / 2)`) down to `1 x 1`
 *   base cases, placing `matrix[r][c]` at `result[c][r]`.
 * - Time complexity: `O(rows * cols)`. Recursion depth: `O(log(rows) + log(cols))`.
 *
 * Conventions:
 * - Complex numbers are represented as `{ re, im }` with finite real numbers.
 * - Performs the standard transpose `(A^T)_{j,i} = A_{i,j}` (imaginary parts are NOT conjugated).
 * - Returns a new matrix with fresh `{ re, im }` objects; the input matrix is never mutated.
 * - Normalizes `-0` to `0` in both real and imaginary components.
 *
 * @param {Complex[][]} matrix Non-empty rectangular `m x n` matrix of complex numbers `{ re, im }`.
 * @returns {Complex[][]} The `n x m` transposed matrix of complex numbers.
 * @throws {TypeError} If `matrix` is not a 2D array or any entry is not a valid `{ re, im }` object.
 * @throws {RangeError} If `matrix` is empty, has zero columns, is non-rectangular (jagged),
 *   or contains `NaN` / `Infinity` / `-Infinity` components.
 */
export function transposeComplexRecursive(matrix) {
	const { rows, cols } = validateComplexMatrix(matrix);
	const result = Array.from({ length: cols }, () => new Array(rows));
	transposeBlock(matrix, result, 0, rows, 0, cols);
	return result;
}
