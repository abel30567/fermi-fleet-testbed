/**
 * Computes the trace of a square matrix of exact BigInt values using a
 * straightforward iterative summation along the main diagonal.
 *
 * The trace of an n x n matrix A is defined as:
 *   tr(A) = sum_{i=0}^{n-1} A[i][i]
 *
 * For an empty 0 x 0 matrix (`[]`), the trace is the empty sum `0n`.
 * Because the trace is purely additive, exact BigInt entries (including
 * fixed-point BigInt values scaled by 10^18) produce exact BigInt results
 * with arbitrary precision and no rounding.
 *
 * @param {readonly (readonly bigint[])[]} matrix - Square n x n matrix of BigInt entries.
 * @returns {bigint} The exact BigInt trace (sum of main diagonal entries).
 * @throws {TypeError} If `matrix` is not an array, any row is not an array, or any entry is not a `bigint`.
 * @throws {RangeError} If `matrix` is not square (any row length differs from `matrix.length`).
 */
export function traceBigIntIterative(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be an array of BigInt arrays')
	}

	const n = matrix.length

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
		for (let j = 0; j < n; j++) {
			if (typeof row[j] !== 'bigint') {
				throw new TypeError(
					`matrix entry at [${i}][${j}] must be a bigint, got ${typeof row[j]}`
				)
			}
		}
	}

	let sum = 0n
	for (let i = 0; i < n; i++) {
		sum += matrix[i][i]
	}

	return sum
}
