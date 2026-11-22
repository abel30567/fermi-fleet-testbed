/**
 * Computes the exact determinant of a square matrix of `BigInt` integers using
 * iterative Bareiss fraction-free Gaussian elimination.
 *
 * Because the determinant of an integer matrix is always an exact integer, no
 * fixed-point scaling is needed: the returned `BigInt` is the exact unscaled
 * determinant. By convention, the determinant of a 0x0 matrix (`[]`) is `1n`.
 *
 * The input matrix is never mutated.
 *
 * Complexity: O(n^3) arithmetic operations over `BigInt` and O(n^2) working space.
 *
 * @param {readonly (readonly bigint[])[]} matrix - An n x n 2D array of `BigInt` integers.
 * @returns {bigint} The exact `BigInt` determinant of `matrix`.
 * @throws {TypeError} If `matrix` is not a 2D array or contains non-`BigInt` entries.
 * @throws {RangeError} If `matrix` is not square (any row length differs from `matrix.length`).
 */
export function determinantBigIntIterative(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of BigInt values')
	}

	const n = matrix.length
	if (n === 0) {
		return 1n
	}

	/** @type {bigint[][]} */
	const work = new Array(n)
	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${i}] must be an array of BigInt values`)
		}
		if (row.length !== n) {
			throw new RangeError(
				`matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`
			)
		}

		const copy = new Array(n)
		for (let j = 0; j < n; j++) {
			const val = row[j]
			if (typeof val !== 'bigint') {
				throw new TypeError(
					`matrix[${i}][${j}] must be a BigInt, got ${val === null ? 'null' : typeof val}`
				)
			}
			copy[j] = val
		}
		work[i] = copy
	}

	if (n === 1) {
		return work[0][0]
	}

	if (n === 2) {
		return work[0][0] * work[1][1] - work[0][1] * work[1][0]
	}

	let sign = 1n
	let prevPivot = 1n

	for (let k = 0; k < n - 1; k++) {
		if (work[k][k] === 0n) {
			let pivotRow = -1
			for (let r = k + 1; r < n; r++) {
				if (work[r][k] !== 0n) {
					pivotRow = r
					break
				}
			}
			if (pivotRow === -1) {
				return 0n
			}

			const tmp = work[k]
			work[k] = work[pivotRow]
			work[pivotRow] = tmp
			sign = -sign
		}

		const pivot = work[k][k]
		const pivotRowArr = work[k]

		for (let i = k + 1; i < n; i++) {
			const rowI = work[i]
			const factor = rowI[k]
			for (let j = k + 1; j < n; j++) {
				// By Sylvester's determinant identity, prevPivot divides the numerator exactly.
				rowI[j] = (pivot * rowI[j] - factor * pivotRowArr[j]) / prevPivot
			}
		}

		prevPivot = pivot
	}

	return sign * work[n - 1][n - 1]
}
