/**
 * Cache-blocking tile size used for L1-friendly matrix transposition.
 * Chosen so a tile of IEEE-754 float64 values (32 x 32 x 8 bytes = 8 KiB)
 * fits comfortably within typical L1 data caches.
 */
const BLOCK_SIZE = 32

/**
 * Computes the transpose of a 2D matrix of finite IEEE-754 float64 numbers.
 *
 * Numerically robust properties:
 * - Bit-exact (0 ULP error): entries are copied without arithmetic, preserving
 *   signed zeros (`-0` vs `+0`), subnormals, and extreme finite float64 values.
 * - Strict input validation: rejects non-arrays, ragged rows, sparse holes,
 *   non-number values, `NaN`, and `±Infinity` to prevent silent error propagation.
 * - Cache-blocked tiling (`32 × 32`) for consistent performance on large matrices.
 * - Pure / non-mutating: returns a newly allocated `cols × rows` matrix.
 *
 * @param {number[][]} matrix - Rectangular 2D array of finite IEEE-754 float64 numbers (`m × n`).
 * @returns {number[][]} Newly allocated transposed matrix (`n × m`), or `[]` for empty dimensions.
 * @throws {TypeError} If `matrix` is not an array, any row is not an array, or any entry is not a `number`.
 * @throws {RangeError} If `matrix` is ragged (inconsistent row lengths) or contains `NaN` / `±Infinity`.
 */
export function transposeFloatStable(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be an array of row arrays')
	}

	const rows = matrix.length
	if (rows === 0) {
		return []
	}

	if (!Array.isArray(matrix[0])) {
		throw new TypeError('Expected row 0 to be an array')
	}

	const cols = matrix[0].length

	for (let r = 0; r < rows; r++) {
		const row = matrix[r]
		if (!Array.isArray(row)) {
			throw new TypeError(`Expected row ${r} to be an array`)
		}
		if (row.length !== cols) {
			throw new RangeError(
				`Ragged matrix: row ${r} has length ${row.length}, expected ${cols}`
			)
		}
		for (let c = 0; c < cols; c++) {
			const value = row[c]
			if (typeof value !== 'number') {
				throw new TypeError(
					`Expected finite number at (${r}, ${c}), got ${typeof value}`
				)
			}
			if (!Number.isFinite(value)) {
				throw new RangeError(
					`Expected finite number at (${r}, ${c}), got ${value}`
				)
			}
		}
	}

	if (cols === 0) {
		return []
	}

	const result = new Array(cols)
	for (let c = 0; c < cols; c++) {
		result[c] = new Array(rows)
	}

	for (let r0 = 0; r0 < rows; r0 += BLOCK_SIZE) {
		const rMax = r0 + BLOCK_SIZE < rows ? r0 + BLOCK_SIZE : rows
		for (let c0 = 0; c0 < cols; c0 += BLOCK_SIZE) {
			const cMax = c0 + BLOCK_SIZE < cols ? c0 + BLOCK_SIZE : cols
			for (let r = r0; r < rMax; r++) {
				const srcRow = matrix[r]
				for (let c = c0; c < cMax; c++) {
					result[c][r] = srcRow[c]
				}
			}
		}
	}

	return result
}
