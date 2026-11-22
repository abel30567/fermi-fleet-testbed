/**
 * @typedef {Object} Dual
 * @property {number} v - Finite primal value.
 * @property {number} d - Finite forward-mode derivative.
 */

/**
 * Validates that the input is a non-empty rectangular 2D array of finite dual
 * numbers `{ v, d }`.
 *
 * @param {unknown} matrix - Candidate matrix to validate.
 * @returns {{ rows: number, cols: number }} Dimensions of the validated matrix.
 * @throws {TypeError} If `matrix` is not a 2D array of dual-number objects with numeric `v` and `d`.
 * @throws {RangeError} If `matrix` is empty, has empty rows, is ragged, or contains non-finite values.
 */
function validateDualMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of dual numbers { v, d }')
	}
	const rows = matrix.length
	if (rows === 0) {
		throw new RangeError('matrix must be non-empty')
	}

	let cols = 0
	for (let r = 0; r < rows; r++) {
		const row = matrix[r]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix row ${r} must be an array`)
		}
		if (r === 0) {
			cols = row.length
			if (cols === 0) {
				throw new RangeError('matrix rows must be non-empty')
			}
		} else if (row.length !== cols) {
			throw new RangeError(
				`matrix must be rectangular: row ${r} has length ${row.length}, expected ${cols}`
			)
		}

		for (let c = 0; c < cols; c++) {
			const cell = row[c]
			if (cell === null || typeof cell !== 'object' || Array.isArray(cell)) {
				throw new TypeError(
					`matrix[${r}][${c}] must be a dual number object { v, d }`
				)
			}
			if (typeof cell.v !== 'number' || typeof cell.d !== 'number') {
				throw new TypeError(
					`matrix[${r}][${c}] must have numeric v and d properties`
				)
			}
			if (!Number.isFinite(cell.v) || !Number.isFinite(cell.d)) {
				throw new RangeError(
					`matrix[${r}][${c}] must have finite v and d values`
				)
			}
		}
	}

	return { rows, cols }
}

/**
 * Recursively transposes submatrix `src[r0..r1)[c0..c1)` into `dst[c0..c1)[r0..r1)`
 * using a divide-and-conquer quadrant/bisection split.
 *
 * @param {Dual[][]} src - Source m×n matrix of dual numbers.
 * @param {Dual[][]} dst - Destination n×m matrix buffer.
 * @param {number} r0 - Inclusive start row index.
 * @param {number} r1 - Exclusive end row index.
 * @param {number} c0 - Inclusive start column index.
 * @param {number} c1 - Exclusive end column index.
 */
function transposeBlock(src, dst, r0, r1, c0, c1) {
	const dr = r1 - r0
	const dc = c1 - c0

	if (dr === 1 && dc === 1) {
		const cell = src[r0][c0]
		dst[c0][r0] = { v: cell.v, d: cell.d }
		return
	}

	if (dr > 1 && dc > 1) {
		const rm = r0 + Math.floor(dr / 2)
		const cm = c0 + Math.floor(dc / 2)
		transposeBlock(src, dst, r0, rm, c0, cm)
		transposeBlock(src, dst, r0, rm, cm, c1)
		transposeBlock(src, dst, rm, r1, c0, cm)
		transposeBlock(src, dst, rm, r1, cm, c1)
	} else if (dr > 1) {
		const rm = r0 + Math.floor(dr / 2)
		transposeBlock(src, dst, r0, rm, c0, c1)
		transposeBlock(src, dst, rm, r1, c0, c1)
	} else {
		const cm = c0 + Math.floor(dc / 2)
		transposeBlock(src, dst, r0, r1, c0, cm)
		transposeBlock(src, dst, r0, r1, cm, c1)
	}
}

/**
 * Computes the transpose of an m×n matrix of dual numbers `{ v, d }` using a
 * recursive divide-and-conquer block/quadrant split.
 *
 * Because transposition is a linear permutation of entries, the forward-mode
 * derivative of the transpose equals the transpose of the derivatives:
 * `(M^T)[c][r] = { v: M[r][c].v, d: M[r][c].d }`.
 *
 * Every output entry is a freshly allocated `{ v, d }` object so the returned
 * matrix never aliases objects from the input.
 *
 * @param {Dual[][]} matrix - Non-empty rectangular m×n matrix of finite dual numbers `{ v, d }`.
 * @returns {Dual[][]} New n×m transposed matrix of freshly cloned dual numbers `{ v, d }`.
 * @throws {TypeError} If `matrix` is not a 2D array of dual-number objects with numeric `v` and `d`.
 * @throws {RangeError} If `matrix` is empty, ragged, or contains non-finite numbers.
 */
export function transposeDualRecursive(matrix) {
	const { rows, cols } = validateDualMatrix(matrix)
	const result = Array.from({ length: cols }, () => new Array(rows))
	transposeBlock(matrix, result, 0, rows, 0, cols)
	return result
}
