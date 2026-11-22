/**
 * Computes the trace of a square matrix of exact BigInt values using an iterative loop.
 *
 * The trace of an n x n matrix A is the sum of its main diagonal entries:
 *   tr(A) = A[0][0] + A[1][1] + ... + A[n - 1][n - 1]
 *
 * Semantics & scaling:
 * - Operates on exact BigInt integers with arbitrary precision and zero rounding error.
 * - Because the trace of an integer matrix is always an exact integer, no implicit scaling
 *   is applied. By linearity, if inputs are already fixed-point BigInt values scaled by
 *   10n ** 18n (or any uniform factor S), the returned trace preserves that exact scale.
 * - For an empty 0 x 0 matrix (`[]`), the empty sum convention yields `0n`.
 * - Does not mutate the input matrix.
 *
 * @param {bigint[][]} matrix - A square 2D array (n x n) of BigInt values.
 * @returns {bigint} The exact BigInt trace of the matrix.
 * @throws {TypeError} If `matrix` is not an array, any row is not an array, or any element is not a BigInt.
 * @throws {RangeError} If `matrix` is not square (any row length differs from `matrix.length`).
 */
export function traceBigIntIterative(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of BigInt values')
	}

	const n = matrix.length
	if (n === 0) {
		return 0n
	}

	for (let i = 0; i < n; i += 1) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${i}] must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(
				`matrix must be square (${n}x${n}), but row ${i} has length ${row.length}`
			)
		}
		for (let j = 0; j < n; j += 1) {
			if (typeof row[j] !== 'bigint') {
				throw new TypeError(
					`matrix[${i}][${j}] must be a BigInt, received ${typeof row[j]}`
				)
			}
		}
	}

	let trace = 0n
	for (let i = 0; i < n; i += 1) {
		trace += matrix[i][i]
	}

	return trace
}
