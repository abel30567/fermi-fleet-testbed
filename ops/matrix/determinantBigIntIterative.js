/**
 * Computes the exact determinant of a square matrix of BigInt integers
 * using iterative Bareiss fraction-free Gaussian elimination with partial
 * row pivoting (searching for a non-zero pivot).
 *
 * Because every entry is an exact BigInt integer, the determinant is always
 * an exact BigInt integer. Bareiss elimination guarantees that every intermediate
 * division is exact with zero remainder, avoiding rational arithmetic overhead
 * and floating-point precision loss.
 *
 * Conventions:
 * - An empty 0x0 matrix (`[]`) has determinant `1n` (the empty product).
 * - The input matrix is never mutated.
 *
 * @param {bigint[][]} matrix - A square n x n matrix of BigInt integers.
 * @returns {bigint} The exact determinant of `matrix`.
 * @throws {TypeError} If `matrix` is not an array of arrays of `bigint` values.
 * @throws {RangeError} If `matrix` is not square (any row length differs from `matrix.length`).
 */
export function determinantBigIntIterative(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be an array of rows')
	}

	const n = matrix.length

	// Copy and validate every row and element up front so callers' data is never
	// mutated and invalid entries are never masked by early singular returns.
	const a = new Array(n)
	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix row ${i} must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(
				`matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`
			)
		}
		const copyRow = new Array(n)
		for (let j = 0; j < n; j++) {
			const val = row[j]
			if (typeof val !== 'bigint') {
				throw new TypeError(
					`matrix[${i}][${j}] must be a bigint, got ${typeof val}`
				)
			}
			copyRow[j] = val
		}
		a[i] = copyRow
	}

	if (n === 0) {
		return 1n
	}
	if (n === 1) {
		return a[0][0]
	}

	let sign = 1n
	let prevPivot = 1n

	for (let k = 0; k < n - 1; k++) {
		// Find the first non-zero pivot at or below row k in column k.
		let pivotRow = k
		while (pivotRow < n && a[pivotRow][k] === 0n) {
			pivotRow++
		}
		if (pivotRow === n) {
			return 0n
		}

		if (pivotRow !== k) {
			const tmp = a[k]
			a[k] = a[pivotRow]
			a[pivotRow] = tmp
			sign = -sign
		}

		const pivot = a[k][k]
		const rowK = a[k]

		for (let i = k + 1; i < n; i++) {
			const rowI = a[i]
			const factor = rowI[k]
			for (let j = k + 1; j < n; j++) {
				// By Sylvester's determinant identity, this division is always exact.
				rowI[j] = (pivot * rowI[j] - factor * rowK[j]) / prevPivot
			}
		}

		prevPivot = pivot
	}

	return sign * a[n - 1][n - 1]
}
