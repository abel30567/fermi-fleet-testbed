/**
 * Transposes a 2D matrix of IEEE-754 float64 numbers using a straightforward
 * iterative implementation.
 *
 * Given an `m × n` rectangular matrix `A`, returns a newly allocated `n × m`
 * matrix `Aᵀ` such that `Aᵀ[j][i] === A[i][j]` (preserving all IEEE-754 float64
 * values bit-for-bit, including `-0`, `NaN`, `±Infinity`, and subnormals).
 *
 * For an empty matrix (`[]`) or a matrix whose rows are all empty (`[[]]`,
 * `[[], []]`), returns `[]`. Does not mutate the input matrix.
 *
 * @param {readonly (readonly number[])[]} matrix - Rectangular 2D array of primitive IEEE-754 float64 numbers.
 * @returns {number[][]} Newly allocated transposed matrix.
 * @throws {TypeError} If `matrix` is not an array, any row is not an array, or any entry is missing (sparse) or not a primitive `number`.
 * @throws {RangeError} If `matrix` is jagged (rows do not all have the same length).
 */
export function transposeFloatIterative(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of IEEE-754 float64 numbers')
	}

	const rows = matrix.length
	if (rows === 0) {
		return []
	}

	if (!Array.isArray(matrix[0])) {
		throw new TypeError('matrix row 0 must be an array')
	}
	const cols = matrix[0].length

	for (let i = 0; i < rows; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix row ${i} must be an array`)
		}
		if (row.length !== cols) {
			throw new RangeError(
				`matrix must be rectangular: row ${i} has length ${row.length}, expected ${cols}`,
			)
		}
		for (let j = 0; j < cols; j++) {
			if (!(j in row) || typeof row[j] !== 'number') {
				throw new TypeError(
					`matrix[${i}][${j}] must be a primitive IEEE-754 float64 number`,
				)
			}
		}
	}

	if (cols === 0) {
		return []
	}

	const transposed = new Array(cols)
	for (let j = 0; j < cols; j++) {
		const outRow = new Array(rows)
		for (let i = 0; i < rows; i++) {
			outRow[i] = matrix[i][j]
		}
		transposed[j] = outRow
	}

	return transposed
}
