/**
 * Base-case block dimension threshold for cache-oblivious recursive splitting.
 * Submatrices with both dimensions <= BASE_BLOCK_SIZE are transposed directly.
 */
const BASE_BLOCK_SIZE = 8

/**
 * Recursively transposes a submatrix block `[r0, r1) x [c0, c1)` from `src`
 * into `[c0, c1) x [r0, r1)` of `dst` using a cache-oblivious divide-and-conquer
 * strategy that bisects the longer dimension until reaching `BASE_BLOCK_SIZE`.
 *
 * @param {readonly (readonly number[])[]} src - Source matrix (`rows x cols`).
 * @param {number[][]} dst - Preallocated destination matrix (`cols x rows`).
 * @param {number} r0 - Starting row index (inclusive).
 * @param {number} r1 - Ending row index (exclusive).
 * @param {number} c0 - Starting column index (inclusive).
 * @param {number} c1 - Ending column index (exclusive).
 */
function transposeBlock(src, dst, r0, r1, c0, c1) {
	const dr = r1 - r0
	const dc = c1 - c0

	if (dr <= BASE_BLOCK_SIZE && dc <= BASE_BLOCK_SIZE) {
		for (let r = r0; r < r1; r++) {
			const srcRow = src[r]
			for (let c = c0; c < c1; c++) {
				dst[c][r] = srcRow[c]
			}
		}
		return
	}

	if (dr >= dc) {
		const rm = r0 + (dr >> 1)
		transposeBlock(src, dst, r0, rm, c0, c1)
		transposeBlock(src, dst, rm, r1, c0, c1)
	} else {
		const cm = c0 + (dc >> 1)
		transposeBlock(src, dst, r0, r1, c0, cm)
		transposeBlock(src, dst, r0, r1, cm, c1)
	}
}

/**
 * Computes the transpose of a 2D matrix of IEEE-754 float64 numbers using a
 * recursive, cache-oblivious divide-and-conquer block-splitting algorithm.
 *
 * Does not mutate the input matrix. Preserves all IEEE-754 float64 values
 * faithfully, including `-0`, `NaN`, `Infinity`, `-Infinity`, and subnormals.
 *
 * @param {readonly (readonly number[])[]} matrix - A rectangular 2D array of IEEE-754 float64 numbers.
 * @returns {number[][]} A new 2D array representing the transposed matrix (`cols x rows`), or `[]` if empty.
 * @throws {TypeError} If `matrix` is not an array, any row is not an array, or any element is not a `number`.
 * @throws {RangeError} If rows do not all have the same length (ragged matrix).
 */
export function transposeFloatRecursive(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be an Array of number Arrays')
	}

	const rows = matrix.length
	if (rows === 0) {
		return []
	}

	const firstRow = matrix[0]
	if (!Array.isArray(firstRow)) {
		throw new TypeError('Expected matrix row 0 to be an Array')
	}
	const cols = firstRow.length

	for (let r = 0; r < rows; r++) {
		const row = matrix[r]
		if (!Array.isArray(row)) {
			throw new TypeError(`Expected matrix row ${r} to be an Array`)
		}
		if (row.length !== cols) {
			throw new RangeError(
				`Ragged matrix: row ${r} has length ${row.length}, expected ${cols}`
			)
		}
		for (let c = 0; c < cols; c++) {
			if (typeof row[c] !== 'number') {
				throw new TypeError(
					`Expected finite or non-finite IEEE-754 number at [${r}][${c}], got ${typeof row[c]}`
				)
			}
		}
	}

	if (cols === 0) {
		return []
	}

	const out = new Array(cols)
	for (let c = 0; c < cols; c++) {
		out[c] = new Array(rows)
	}

	transposeBlock(matrix, out, 0, rows, 0, cols)
	return out
}
