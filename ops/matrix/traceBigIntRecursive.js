/**
 * Validates that the input is a square (n x n) matrix of BigInt values.
 *
 * @param {unknown} matrix - Candidate matrix to validate.
 * @throws {TypeError} If `matrix` is not an array, any row is not an array, or any element is not a `bigint`.
 * @throws {RangeError} If `matrix` is not square (any row length differs from `matrix.length`).
 */
function validateSquareBigIntMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be an Array of Arrays of BigInt values')
	}

	const n = matrix.length

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Expected row ${i} to be an Array`)
		}
		if (row.length !== n) {
			throw new RangeError(
				`Expected a square ${n}x${n} matrix, but row ${i} has length ${row.length}`
			)
		}
		for (let j = 0; j < n; j++) {
			if (typeof row[j] !== 'bigint') {
				throw new TypeError(
					`Expected BigInt at matrix[${i}][${j}], got ${row[j] === null ? 'null' : typeof row[j]}`
				)
			}
		}
	}
}

/**
 * Recursively computes the sum of diagonal elements matrix[i][i] for i in [start, end)
 * using divide-and-conquer binary splitting (O(log n) recursion depth).
 *
 * Conceptually partitions the diagonal block into upper-left [start, mid) and
 * lower-right [mid, end) blocks: tr(diag(A, D)) = tr(A) + tr(D).
 *
 * @param {readonly (readonly bigint[])[]} matrix - Validated square BigInt matrix.
 * @param {number} start - Inclusive starting diagonal index.
 * @param {number} end - Exclusive ending diagonal index.
 * @returns {bigint} Exact BigInt sum of diagonal entries in [start, end).
 */
function sumDiagonalRecursive(matrix, start, end) {
	const count = end - start
	if (count === 0) {
		return 0n
	}
	if (count === 1) {
		return matrix[start][start]
	}

	const mid = start + (count >> 1)
	return sumDiagonalRecursive(matrix, start, mid) + sumDiagonalRecursive(matrix, mid, end)
}

/**
 * Computes the trace (sum of main diagonal entries) of a square matrix over exact
 * BigInt integers using a recursive divide-and-conquer implementation.
 *
 * Since the trace of an integer matrix is always an exact integer, no scaling is
 * applied; if entries represent fixed-point BigInts scaled by 10^18, linearity of
 * the trace preserves the 10^18 scale factor exactly.
 *
 * For an empty 0x0 matrix (`[]`), returns `0n` (the empty sum).
 *
 * @param {readonly (readonly bigint[])[]} matrix - Square n x n matrix of BigInt values.
 * @returns {bigint} The exact BigInt trace of `matrix`.
 * @throws {TypeError} If `matrix` is not a 2D array of `bigint` values.
 * @throws {RangeError} If `matrix` is not square.
 */
export function traceBigIntRecursive(matrix) {
	validateSquareBigIntMatrix(matrix)
	return sumDiagonalRecursive(matrix, 0, matrix.length)
}
