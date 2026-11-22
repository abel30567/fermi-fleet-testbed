/**
 * Computes the exact transpose of a rectangular m×n matrix of BigInt values.
 *
 * Uses the closed-form transposition identity `(A^T)[j][i] = A[i][j]` over exact
 * arbitrary-precision BigInt entries (including 10^18-scaled fixed-point BigInt
 * values). Always returns a newly allocated n×m matrix without mutating the input.
 *
 * @param {readonly (readonly bigint[])[]} matrix - Non-empty rectangular m×n matrix of BigInt values.
 * @returns {bigint[][]} The exact n×m transposed BigInt matrix.
 * @throws {TypeError} If `matrix` is not a 2D array or contains any non-BigInt entry.
 * @throws {RangeError} If `matrix` has zero rows, zero columns, or ragged rows.
 */
export function transposeBigIntSeries(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of BigInt values')
	}

	const rows = matrix.length
	if (rows === 0) {
		throw new RangeError('matrix must not be empty')
	}

	const firstRow = matrix[0]
	if (!Array.isArray(firstRow)) {
		throw new TypeError('matrix row 0 must be an array of BigInt values')
	}

	const cols = firstRow.length
	if (cols === 0) {
		throw new RangeError('matrix rows must not be empty')
	}

	for (let i = 0; i < rows; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix row ${i} must be an array of BigInt values`)
		}
		if (row.length !== cols) {
			throw new RangeError(
				`matrix must be rectangular: expected ${cols} columns in row ${i}, got ${row.length}`
			)
		}
		for (let j = 0; j < cols; j++) {
			if (typeof row[j] !== 'bigint') {
				throw new TypeError(
					`matrix entry at (${i}, ${j}) must be a BigInt, got ${typeof row[j]}`
				)
			}
		}
	}

	const result = new Array(cols)
	for (let j = 0; j < cols; j++) {
		const outRow = new Array(rows)
		for (let i = 0; i < rows; i++) {
			outRow[i] = matrix[i][j]
		}
		result[j] = outRow
	}

	return result
}
