/**
 * Base-case tile threshold for cache-oblivious recursive matrix transposition.
 * Submatrices with both row and column spans at most this threshold are
 * transposed directly with a tight inner loop.
 */
const BASE_CASE = 4

/**
 * Recursively transposes a submatrix block `[r0, r1) x [c0, c1)` from a
 * row-major source matrix of shape `(rows x cols)` into a row-major
 * destination matrix of shape `(cols x rows)`, splitting along the larger
 * dimension.
 *
 * @param {Float64Array} src - Source matrix in row-major order.
 * @param {Float64Array} dst - Destination matrix in row-major order.
 * @param {number} rows - Total number of rows in `src`.
 * @param {number} cols - Total number of columns in `src`.
 * @param {number} r0 - Inclusive starting row index.
 * @param {number} r1 - Exclusive ending row index.
 * @param {number} c0 - Inclusive starting column index.
 * @param {number} c1 - Exclusive ending column index.
 */
function transposeBlock(src, dst, rows, cols, r0, r1, c0, c1) {
	const dr = r1 - r0
	const dc = c1 - c0

	if (dr <= BASE_CASE && dc <= BASE_CASE) {
		for (let r = r0; r < r1; r++) {
			const srcRowOffset = r * cols
			for (let c = c0; c < c1; c++) {
				dst[c * rows + r] = src[srcRowOffset + c]
			}
		}
		return
	}

	if (dr >= dc) {
		const rm = r0 + Math.floor(dr / 2)
		transposeBlock(src, dst, rows, cols, r0, rm, c0, c1)
		transposeBlock(src, dst, rows, cols, rm, r1, c0, c1)
	} else {
		const cm = c0 + Math.floor(dc / 2)
		transposeBlock(src, dst, rows, cols, r0, r1, c0, cm)
		transposeBlock(src, dst, rows, cols, r0, r1, cm, c1)
	}
}

/**
 * Transposes a row-major `Float64Array` matrix of shape `(rows x cols)` into a
 * new row-major `Float64Array` of shape `(cols x rows)` using a cache-oblivious
 * divide-and-conquer recursive algorithm.
 *
 * @param {Float64Array} matrix - Input matrix stored in row-major order.
 * @param {number} rows - Number of rows (non-negative safe integer).
 * @param {number} cols - Number of columns (non-negative safe integer).
 * @returns {Float64Array} New transposed matrix of shape `(cols x rows)` in row-major order.
 * @throws {TypeError} If `matrix` is not a `Float64Array`, or if `rows` or `cols` is not a number.
 * @throws {RangeError} If `rows` or `cols` is not a non-negative safe integer, or if `matrix.length !== rows * cols`.
 */
export function transposeTypedRecursive(matrix, rows, cols) {
	if (!(matrix instanceof Float64Array)) {
		throw new TypeError('matrix must be a Float64Array')
	}
	if (typeof rows !== 'number') {
		throw new TypeError('rows must be a number')
	}
	if (typeof cols !== 'number') {
		throw new TypeError('cols must be a number')
	}
	if (!Number.isSafeInteger(rows) || rows < 0) {
		throw new RangeError('rows must be a non-negative safe integer')
	}
	if (!Number.isSafeInteger(cols) || cols < 0) {
		throw new RangeError('cols must be a non-negative safe integer')
	}
	if (BigInt(rows) * BigInt(cols) !== BigInt(matrix.length)) {
		throw new RangeError(
			`matrix length (${matrix.length}) does not match rows * cols (${rows} * ${cols})`
		)
	}

	const result = new Float64Array(matrix.length)
	if (rows === 0 || cols === 0) {
		return result
	}

	transposeBlock(matrix, result, rows, cols, 0, rows, 0, cols)
	return result
}
