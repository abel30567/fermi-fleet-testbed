/**
 * Recursively computes the sum of main diagonal entries for index range [start, end)
 * using divide-and-conquer (pairwise) summation.
 *
 * @param {Float64Array} matrix - Flat square matrix of length n * n.
 * @param {number} stride - Distance between consecutive diagonal elements (n + 1).
 * @param {number} start - Inclusive starting diagonal index.
 * @param {number} end - Exclusive ending diagonal index.
 * @returns {number} Sum of diagonal entries in [start, end).
 */
function sumDiagonalRecursive(matrix, stride, start, end) {
	const count = end - start
	if (count === 0) {
		return 0
	}
	if (count === 1) {
		return matrix[start * stride]
	}
	const mid = start + Math.floor(count / 2)
	return (
		sumDiagonalRecursive(matrix, stride, start, mid) +
		sumDiagonalRecursive(matrix, stride, mid, end)
	)
}

/**
 * Computes the trace (sum of main diagonal elements) of a square n x n matrix
 * stored in a flat Float64Array, using a recursive divide-and-conquer
 * (pairwise summation) algorithm with O(log n) call stack depth.
 *
 * Works identically for row-major and column-major flat storage because
 * main diagonal entries lie at flat indices `i * (n + 1)` for `0 <= i < n`.
 *
 * @param {Float64Array} matrix - Flat square matrix of length `n * n`.
 * @param {number} [n] - Optional matrix dimension (non-negative safe integer).
 *   When omitted, `n` is inferred as `Math.sqrt(matrix.length)` and validated
 *   to ensure `matrix.length` is a perfect square.
 * @returns {number} The trace of the matrix (`0` for an empty 0x0 matrix).
 * @throws {TypeError} If `matrix` is not a `Float64Array`, or if `n` is provided and not a number.
 * @throws {RangeError} If `n` is not a non-negative safe integer, if `matrix.length`
 *   is not a perfect square (when `n` is omitted), or if `matrix.length !== n * n`.
 */
export function traceTypedRecursive(matrix, n) {
	if (!(matrix instanceof Float64Array)) {
		throw new TypeError('Expected matrix to be a Float64Array')
	}

	let dim
	if (n === undefined) {
		dim = Math.round(Math.sqrt(matrix.length))
		if (dim * dim !== matrix.length) {
			throw new RangeError(
				`Expected a square matrix (perfect square length), received length ${matrix.length}`
			)
		}
	} else {
		if (typeof n !== 'number') {
			throw new TypeError('Expected dimension n to be a number')
		}
		if (!Number.isSafeInteger(n) || n < 0) {
			throw new RangeError(
				`Expected dimension n to be a non-negative safe integer, received ${n}`
			)
		}
		if (matrix.length !== n * n) {
			throw new RangeError(
				`Matrix length ${matrix.length} does not match expected size ${n} * ${n} (${n * n})`
			)
		}
		dim = n
	}

	return sumDiagonalRecursive(matrix, dim + 1, 0, dim)
}
