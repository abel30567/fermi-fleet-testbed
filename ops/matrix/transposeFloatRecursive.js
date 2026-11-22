/**
 * Cache-oblivious divide-and-conquer matrix transpose over IEEE-754 float64 numbers.
 *
 * Splits the active submatrix recursively along its larger dimension (rows when
 * `dr >= dc`, columns otherwise) until both dimensions are at most `BASE_CASE`,
 * then transposes the leaf block directly into the pre-allocated output matrix.
 */

const BASE_CASE = 8

/**
 * Recursively transpose submatrix `M[r0..r1)[c0..c1)` into `out[c0..c1)[r0..r1)`.
 *
 * @param {number[][]} M - Validated source matrix.
 * @param {number[][]} out - Pre-allocated destination matrix of shape `cols x rows`.
 * @param {number} r0 - Inclusive start row index in `M`.
 * @param {number} r1 - Exclusive end row index in `M`.
 * @param {number} c0 - Inclusive start column index in `M`.
 * @param {number} c1 - Exclusive end column index in `M`.
 */
function transposeBlock(M, out, r0, r1, c0, c1) {
	const dr = r1 - r0
	const dc = c1 - c0

	if (dr <= BASE_CASE && dc <= BASE_CASE) {
		for (let r = r0; r < r1; r++) {
			const srcRow = M[r]
			for (let c = c0; c < c1; c++) {
				out[c][r] = srcRow[c]
			}
		}
		return
	}

	if (dr >= dc) {
		const rm = r0 + (dr >>> 1)
		transposeBlock(M, out, r0, rm, c0, c1)
		transposeBlock(M, out, rm, r1, c0, c1)
	} else {
		const cm = c0 + (dc >>> 1)
		transposeBlock(M, out, r0, r1, c0, cm)
		transposeBlock(M, out, r0, r1, cm, c1)
	}
}

/**
 * Computes the transpose of a 2D matrix of IEEE-754 float64 `Number` values
 * using a cache-oblivious recursive divide-and-conquer block-splitting algorithm.
 *
 * Preserves all IEEE-754 float64 bit-level values (including `-0`, subnormals,
 * `Infinity`, `-Infinity`, and `NaN`) without mutating the input matrix.
 *
 * Time complexity: O(m * n)
 * Space complexity: O(m * n) for the output matrix, O(log(max(m, n))) call stack.
 *
 * @param {number[][]} M - Non-empty rectangular 2D array of IEEE-754 float64 numbers.
 * @returns {number[][]} Transposed matrix of dimensions `M[0].length x M.length`.
 * @throws {TypeError} If `M` is not an array, any row is not an array, or any element is not a `number`.
 * @throws {RangeError} If `M` is empty, has empty rows, or is ragged (rows of inconsistent length).
 */
export function transposeFloatRecursive(M) {
	if (!Array.isArray(M)) {
		throw new TypeError('Expected matrix M to be a 2D array of numbers')
	}
	const rows = M.length
	if (rows === 0) {
		throw new RangeError('Matrix M must not be empty')
	}

	const firstRow = M[0]
	if (!Array.isArray(firstRow)) {
		throw new TypeError('Expected row 0 of matrix M to be an array')
	}
	const cols = firstRow.length
	if (cols === 0) {
		throw new RangeError('Matrix M rows must not be empty')
	}

	for (let r = 0; r < rows; r++) {
		const row = M[r]
		if (!Array.isArray(row)) {
			throw new TypeError(`Expected row ${r} of matrix M to be an array`)
		}
		if (row.length !== cols) {
			throw new RangeError(
				`Matrix M must be rectangular: row ${r} has length ${row.length}, expected ${cols}`
			)
		}
		for (let c = 0; c < cols; c++) {
			if (typeof row[c] !== 'number') {
				throw new TypeError(
					`Expected numeric entry at M[${r}][${c}], got ${typeof row[c]}`
				)
			}
		}
	}

	const out = new Array(cols)
	for (let c = 0; c < cols; c++) {
		out[c] = new Array(rows)
	}

	transposeBlock(M, out, 0, rows, 0, cols)
	return out
}
