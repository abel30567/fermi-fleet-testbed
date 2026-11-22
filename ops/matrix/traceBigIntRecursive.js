/**
 * Validates that a value is a well-formed square (n x n) 2D array of BigInt values.
 *
 * @param {unknown} matrix - Candidate matrix to validate.
 * @returns {number} The dimension n of the square matrix.
 * @throws {TypeError} If `matrix` is not an array, any row is not an array,
 *   or any entry (diagonal or off-diagonal) is not a `bigint`.
 * @throws {RangeError} If the matrix is not square (any row length !== matrix.length).
 */
function validateSquareBigIntMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of BigInt values')
	}

	const n = matrix.length

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix row at index ${i} must be an array`)
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

	return n
}

/**
 * Divide-and-conquer recursive helper computing the trace of the principal
 * submatrix spanning diagonal indices `[lo, hi)`.
 *
 * Partitions the submatrix into top-left `[lo, mid)` and bottom-right `[mid, hi)`
 * principal blocks and combines their traces: `tr(A) = tr(A_11) + tr(A_22)`.
 *
 * @param {readonly (readonly bigint[])[]} matrix - Validated square BigInt matrix.
 * @param {number} lo - Inclusive start index on the main diagonal.
 * @param {number} hi - Exclusive end index on the main diagonal.
 * @returns {bigint} Exact sum of diagonal entries `matrix[i][i]` for `lo <= i < hi`.
 */
function traceDivideAndConquer(matrix, lo, hi) {
	const size = hi - lo
	if (size <= 0) {
		return 0n
	}
	if (size === 1) {
		return matrix[lo][lo]
	}

	const mid = (lo + hi) >>> 1
	const topLeftTrace = traceDivideAndConquer(matrix, lo, mid)
	const bottomRightTrace = traceDivideAndConquer(matrix, mid, hi)
	return topLeftTrace + bottomRightTrace
}

/**
 * Computes the trace of an n x n square matrix of exact BigInt values using a
 * recursive divide-and-conquer algorithm.
 *
 * Mathematical definition:
 *   tr(A) = sum_{i = 0}^{n - 1} A[i][i]
 *
 * Scaling note:
 *   Because the trace of an integer matrix is always an exact integer, no fixed-point
 *   scaling is applied to the result. By linearity of the trace, if all input entries
 *   are fixed-point BigInts scaled by `10n ** 18n`, the returned BigInt automatically
 *   carries the same `10n ** 18n` scale factor.
 *
 * Algorithm:
 *   Recursively partitions the square matrix along its main diagonal into two
 *   principal submatrices A_11 (indices `[lo, mid)`) and A_22 (indices `[mid, hi)`),
 *   returning `tr(A_11) + tr(A_22)`. Recursion depth is `O(log n)`, avoiding call-stack
 *   overflows while keeping intermediate BigInt summands balanced.
 *
 * @param {readonly (readonly bigint[])[]} matrix - Square 2D array of `bigint` entries.
 *   An empty `[]` (0 x 0 matrix) is valid and has trace `0n`.
 * @returns {bigint} The exact BigInt trace of `matrix`.
 * @throws {TypeError} If `matrix` is not a 2D array or contains any non-`bigint` entry.
 * @throws {RangeError} If `matrix` is not square (any row length differs from `matrix.length`).
 */
export function traceBigIntRecursive(matrix) {
	const n = validateSquareBigIntMatrix(matrix)
	return traceDivideAndConquer(matrix, 0, n)
}
