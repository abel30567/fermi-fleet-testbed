/**
 * Validates that a value is a well-formed interval `[lo, hi]` with `lo <= hi`.
 *
 * Allows finite endpoints as well as extended-real bounds `-Infinity` (for `lo`)
 * and `+Infinity` (for `hi`), while rejecting `NaN`, inverted bounds (`lo > hi`),
 * and empty degenerate infinities (`[Infinity, Infinity]`, `[-Infinity, -Infinity]`).
 *
 * @param {unknown} interval - Candidate interval to validate.
 * @param {number} row - Row index for diagnostic error messages.
 * @param {number} col - Column index for diagnostic error messages.
 * @returns {[number, number]} The validated `[lo, hi]` bounds.
 */
function validateInterval(interval, row, col) {
	if (!Array.isArray(interval)) {
		throw new TypeError(`Interval at (${row}, ${col}) must be an array [lo, hi]`)
	}
	if (interval.length !== 2) {
		throw new RangeError(
			`Interval at (${row}, ${col}) must have length 2, got ${interval.length}`,
		)
	}

	const [lo, hi] = interval
	if (typeof lo !== 'number' || typeof hi !== 'number') {
		throw new TypeError(`Interval endpoints at (${row}, ${col}) must be numbers`)
	}
	if (Number.isNaN(lo) || Number.isNaN(hi)) {
		throw new RangeError(`Interval endpoints at (${row}, ${col}) must not be NaN`)
	}
	if (lo === Infinity || hi === -Infinity) {
		throw new RangeError(
			`Interval at (${row}, ${col}) must not be a degenerate infinite interval`,
		)
	}
	if (lo > hi) {
		throw new RangeError(
			`Invalid interval at (${row}, ${col}): lower bound ${lo} exceeds upper bound ${hi}`,
		)
	}

	return [lo, hi]
}

/**
 * Computes the transpose of a matrix of real intervals `[lo, hi]` using a
 * straightforward iterative algorithm.
 *
 * For an `m x n` interval matrix `A` with entries `A[i][j] = [lo_ij, hi_ij]`,
 * returns a new `n x m` interval matrix `A^T` with entries
 * `A^T[j][i] = [lo_ij, hi_ij]`.
 *
 * Enclosure & outward rounding: matrix transposition permutes interval entries
 * without performing floating-point arithmetic, so exact IEEE-754 value copies
 * provide the tightest possible outward-rounded enclosure: for every scalar
 * matrix `M` with `M[i][j] in A[i][j]`, `M^T[j][i] in A^T[j][i]`.
 *
 * The input matrix and its interval tuples are never mutated; every output row
 * and `[lo, hi]` interval is freshly allocated.
 *
 * @param {Array<Array<[number, number]>>} matrix - Rectangular matrix of `[lo, hi]` intervals (or `[]` for 0x0).
 * @returns {Array<Array<[number, number]>>} Newly allocated transposed interval matrix.
 * @throws {TypeError} If `matrix` or any row is not an array, or any interval is not a numeric `[lo, hi]` tuple.
 * @throws {RangeError} If rows are empty, ragged, or any interval has invalid length, `NaN`, degenerate infinity, or `lo > hi`.
 */
export function transposeIntervalIterative(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Matrix must be an array of rows')
	}

	const rows = matrix.length
	if (rows === 0) {
		return []
	}

	if (!Array.isArray(matrix[0])) {
		throw new TypeError('Matrix row 0 must be an array')
	}

	const cols = matrix[0].length
	if (cols === 0) {
		throw new RangeError('Matrix rows must not be empty')
	}

	const result = new Array(cols)
	for (let j = 0; j < cols; j += 1) {
		result[j] = new Array(rows)
	}

	for (let i = 0; i < rows; i += 1) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Matrix row ${i} must be an array`)
		}
		if (row.length !== cols) {
			throw new RangeError(
				`Ragged matrix: row ${i} has length ${row.length}, expected ${cols}`,
			)
		}

		for (let j = 0; j < cols; j += 1) {
			const [lo, hi] = validateInterval(row[j], i, j)
			result[j][i] = [lo, hi]
		}
	}

	return result
}
