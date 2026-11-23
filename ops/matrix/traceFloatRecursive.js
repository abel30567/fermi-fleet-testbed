/**
 * Computes the trace of a square matrix over IEEE-754 float64 numbers using
 * recursive divide-and-conquer (pairwise) summation of the main diagonal.
 *
 * Pairwise summation splits the diagonal range `[start, end)` in half at each
 * recursive step, keeping call-stack depth O(log n) and reducing rounding error
 * growth from O(n * eps) to O(eps * log n) compared to naive sequential summation.
 *
 * @param {readonly (readonly number[])[]} matrix - Square n x n matrix of IEEE-754 float64 numbers.
 * @returns {number} The sum of the diagonal entries `matrix[i][i]` for `0 <= i < n` (0 for a 0 x 0 matrix).
 * @throws {TypeError} If `matrix` is not an array, any row is not an array, or any entry is not a number.
 * @throws {RangeError} If `matrix` is not square (any row length differs from `matrix.length`).
 */
export function traceFloatRecursive(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be a 2D array of numbers')
	}

	const n = matrix.length

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Expected row ${i} to be an array of numbers`)
		}
		if (row.length !== n) {
			throw new RangeError(
				`Expected a square ${n}x${n} matrix, but row ${i} has length ${row.length}`
			)
		}
		for (let j = 0; j < n; j++) {
			if (typeof row[j] !== 'number') {
				throw new TypeError(
					`Expected matrix[${i}][${j}] to be a number, got ${typeof row[j]}`
				)
			}
		}
	}

	if (n === 0) {
		return 0
	}

	return sumDiagonalDivideAndConquer(matrix, 0, n)
}

/**
 * Recursively sums `matrix[i][i]` for `i` in the half-open interval `[start, end)`
 * via divide-and-conquer pairwise summation.
 *
 * @param {readonly (readonly number[])[]} matrix - Validated square matrix.
 * @param {number} start - Inclusive starting diagonal index.
 * @param {number} end - Exclusive ending diagonal index (`end > start`).
 * @returns {number} Pairwise sum of diagonal entries in `[start, end)`.
 */
function sumDiagonalDivideAndConquer(matrix, start, end) {
	const count = end - start
	if (count === 1) {
		return matrix[start][start]
	}

	const mid = start + ((end - start) >>> 1)
	return (
		sumDiagonalDivideAndConquer(matrix, start, mid) +
		sumDiagonalDivideAndConquer(matrix, mid, end)
	)
}
