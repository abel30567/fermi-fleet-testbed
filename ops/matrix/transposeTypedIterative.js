/**
 * Computes the matrix transpose of a row-major Float64Array matrix using a
 * straightforward iterative implementation.
 *
 * For an input matrix `A` of shape `rows x cols` stored in row-major order
 * (`A[r * cols + c]`), returns a new `Float64Array` representing `A^T` of shape
 * `cols x rows` in row-major order (`out[c * rows + r] = A[r * cols + c]`).
 *
 * @param {Float64Array} matrix - Row-major input matrix of length `rows * cols`.
 * @param {number} rows - Number of rows in the input matrix (non-negative integer).
 * @param {number} cols - Number of columns in the input matrix (non-negative integer).
 * @returns {Float64Array} New row-major Float64Array representing the transposed `cols x rows` matrix.
 * @throws {TypeError} If `matrix` is not a `Float64Array`.
 * @throws {RangeError} If `rows` or `cols` is not a non-negative safe integer, or if `rows * cols !== matrix.length`.
 */
export function transposeTypedIterative(matrix, rows, cols) {
	if (!(matrix instanceof Float64Array)) {
		throw new TypeError('matrix must be a Float64Array')
	}
	if (!Number.isSafeInteger(rows) || rows < 0) {
		throw new RangeError('rows must be a non-negative safe integer')
	}
	if (!Number.isSafeInteger(cols) || cols < 0) {
		throw new RangeError('cols must be a non-negative safe integer')
	}
	if (rows * cols !== matrix.length) {
		throw new RangeError(
			`matrix length (${matrix.length}) must equal rows * cols (${rows * cols})`,
		)
	}

	const result = new Float64Array(matrix.length)

	for (let r = 0; r < rows; r++) {
		const rowOffset = r * cols
		for (let c = 0; c < cols; c++) {
			result[c * rows + r] = matrix[rowOffset + c]
		}
	}

	return result
}
