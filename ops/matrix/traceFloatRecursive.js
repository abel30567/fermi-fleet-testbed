/**
 * Validates that the input is a non-empty square 2D array of finite IEEE-754 float64 numbers.
 *
 * @param {unknown} M - Candidate matrix to validate.
 * @throws {TypeError} If `M` is not a 2D array or contains non-number entries.
 * @throws {RangeError} If `M` is empty, non-square, ragged, or contains non-finite numbers (`NaN`, `±Infinity`).
 */
function validateSquareNumericMatrix(M) {
	if (!Array.isArray(M)) {
		throw new TypeError('Matrix must be a 2D array of finite numbers')
	}

	const n = M.length
	if (n === 0) {
		throw new RangeError('Matrix must be non-empty')
	}

	for (let i = 0; i < n; i++) {
		if (!(i in M) || !Array.isArray(M[i])) {
			throw new TypeError(`Matrix row ${i} must be an array`)
		}

		const row = M[i]
		if (row.length !== n) {
			throw new RangeError(
				`Matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`
			)
		}

		for (let j = 0; j < n; j++) {
			if (!(j in row) || typeof row[j] !== 'number') {
				throw new TypeError(`Matrix entry at [${i}][${j}] must be a number`)
			}
			if (!Number.isFinite(row[j])) {
				throw new RangeError(
					`Matrix entry at [${i}][${j}] must be a finite number`
				)
			}
		}
	}
}

/**
 * Recursively sums the main diagonal entries `M[i][i]` over the half-open index
 * range `[lo, hi)` using divide-and-conquer pairwise bisection.
 *
 * @param {number[][]} M - Validated square matrix of finite numbers.
 * @param {number} lo - Inclusive lower diagonal index.
 * @param {number} hi - Exclusive upper diagonal index.
 * @returns {number} Pairwise sum of `M[i][i]` for `lo <= i < hi`.
 */
function sumDiagonalRange(M, lo, hi) {
	const len = hi - lo
	if (len <= 0) {
		return 0
	}
	if (len === 1) {
		return M[lo][lo]
	}

	const mid = lo + (len >>> 1)
	return sumDiagonalRange(M, lo, mid) + sumDiagonalRange(M, mid, hi)
}

/**
 * Computes the trace of a square matrix of IEEE-754 float64 numbers using a
 * recursive divide-and-conquer (pairwise summation) algorithm over the main diagonal.
 *
 * The trace is defined as `tr(M) = sum_{i=0}^{n-1} M[i][i]`. Recursively bisecting
 * the diagonal index range `[lo, hi)` runs in `O(n)` arithmetic operations with
 * `O(log n)` recursion depth and pairwise summation error bounds.
 *
 * @param {number[][]} M - Non-empty `n × n` matrix of finite IEEE-754 float64 numbers.
 * @returns {number} The trace (sum of main diagonal elements) of `M`.
 * @throws {TypeError} If `M` is not a 2D array or contains non-number entries.
 * @throws {RangeError} If `M` is empty, non-square, ragged, or contains non-finite numbers.
 */
export function traceFloatRecursive(M) {
	validateSquareNumericMatrix(M)
	return sumDiagonalRange(M, 0, M.length)
}
