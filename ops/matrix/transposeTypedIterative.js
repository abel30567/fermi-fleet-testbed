/**
 * Computes the matrix transpose of a row-major matrix stored in a Float64Array
 * using a straightforward iterative nested-loop algorithm.
 *
 * Given an `m × n` matrix `A` (`rows × cols`) stored in row-major order where
 * element `(r, c)` resides at index `r * cols + c`, returns a newly allocated
 * `Float64Array` representing the `n × m` transposed matrix `Aᵀ` where
 * `Aᵀ[c, r] = A[r, c]` at index `c * rows + r`.
 *
 * The input `matrix` is never mutated.
 *
 * @param {Float64Array} matrix - Input matrix elements in row-major order.
 * @param {number} rows - Number of rows (`m`), a non-negative safe integer.
 * @param {number} cols - Number of columns (`n`), a non-negative safe integer.
 * @returns {Float64Array} Newly allocated transposed matrix (`cols × rows`) in row-major order.
 * @throws {TypeError} If `matrix` is not a `Float64Array`, or if `rows` or `cols` is not a number.
 * @throws {RangeError} If `rows` or `cols` is negative, non-integer, non-finite (`NaN`/`Infinity`),
 *   exceeds `Number.MAX_SAFE_INTEGER`, or if `matrix.length !== rows * cols`.
 */
export function transposeTypedIterative(matrix, rows, cols) {
	if (!(matrix instanceof Float64Array)) {
		throw new TypeError('matrix must be a Float64Array')
	}
	if (typeof rows !== 'number') {
		throw new TypeError('rows must be a number')
	}
	if (typeof cols !== 'number') {
		throw new TypeError('cols must be a number')
	}
	if (!Number.isSafeInteger(rows) || rows < 0) {
		throw new RangeError('rows must be a non-negative safe integer')
	}
	if (!Number.isSafeInteger(cols) || cols < 0) {
		throw new RangeError('cols must be a non-negative safe integer')
	}

	const expectedLength = rows * cols
	if (!Number.isSafeInteger(expectedLength) || matrix.length !== expectedLength) {
		throw new RangeError(
			`matrix length (${matrix.length}) does not match rows * cols (${rows} * ${cols} = ${expectedLength})`
		)
	}

	const result = new Float64Array(expectedLength)
	for (let r = 0; r < rows; r++) {
		const rowOffset = r * cols
		for (let c = 0; c < cols; c++) {
			result[c * rows + r] = matrix[rowOffset + c]
		}
	}

	return result
}
