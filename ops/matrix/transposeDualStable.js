const BLOCK_SIZE = 32

/**
 * Computes the transpose of a matrix of dual numbers `{ v, d }` carrying a
 * forward-mode derivative alongside each primal value.
 *
 * For an m x n dual matrix A = V + epsilon * D (where epsilon^2 = 0),
 * returns the n x m dual matrix A^T = V^T + epsilon * D^T with
 * `(A^T)[j][i] = { v: A[i][j].v, d: A[i][j].d }`.
 *
 * Numerical robustness guarantees:
 * - Lossless IEEE-754 preservation (0 ULP error): copies primal and derivative
 *   components directly without intermediate arithmetic, preventing overflow
 *   at extreme exponents (up to `Number.MAX_VALUE`), underflow of subnormals
 *   (`Number.MIN_VALUE`), or signed-zero distortion.
 * - Strict input validation: rejects non-arrays, ragged matrices, malformed
 *   dual entries, and non-finite (`NaN`, `±Infinity`) components to prevent
 *   silent propagation of invalid floating-point state.
 * - Alias-free output: allocates fresh `{ v, d }` objects so mutating the
 *   input or output cannot corrupt the other.
 * - Cache-blocked (tiled) traversal for predictable memory locality on large
 *   matrices without recursion depth limits.
 *
 * @param {Array<Array<{ v: number, d: number }>>} matrix - Rectangular 2D array of dual numbers `{ v, d }`.
 * @returns {Array<Array<{ v: number, d: number }>>} Transposed 2D array of dual numbers `{ v, d }`.
 * @throws {TypeError} If `matrix` is not an array of arrays of `{ v: number, d: number }` objects.
 * @throws {RangeError} If `matrix` has ragged rows or contains non-finite (`NaN`, `±Infinity`) values.
 */
export function transposeDualStable(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of dual numbers { v, d }')
	}

	const rows = matrix.length
	if (rows === 0) {
		return []
	}

	if (!Array.isArray(matrix[0])) {
		throw new TypeError('matrix row 0 must be an array')
	}

	const cols = matrix[0].length

	// Validate rectangular shape upfront before allocating output
	for (let i = 1; i < rows; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix row ${i} must be an array`)
		}
		if (row.length !== cols) {
			throw new RangeError(
				`matrix must be rectangular: row 0 has length ${cols}, row ${i} has length ${row.length}`
			)
		}
	}

	if (cols === 0) {
		return []
	}

	// Pre-allocate n x m output rows
	const result = new Array(cols)
	for (let j = 0; j < cols; j++) {
		result[j] = new Array(rows)
	}

	// Cache-blocked transpose with per-element dual validation and lossless copy
	for (let i0 = 0; i0 < rows; i0 += BLOCK_SIZE) {
		const iEnd = Math.min(i0 + BLOCK_SIZE, rows)
		for (let j0 = 0; j0 < cols; j0 += BLOCK_SIZE) {
			const jEnd = Math.min(j0 + BLOCK_SIZE, cols)
			for (let i = i0; i < iEnd; i++) {
				const srcRow = matrix[i]
				for (let j = j0; j < jEnd; j++) {
					const cell = srcRow[j]
					if (cell === null || typeof cell !== 'object' || Array.isArray(cell)) {
						throw new TypeError(`matrix[${i}][${j}] must be a dual number object { v, d }`)
					}
					const { v, d } = cell
					if (typeof v !== 'number' || typeof d !== 'number') {
						throw new TypeError(
							`matrix[${i}][${j}] must have numeric properties v and d`
						)
					}
					if (!Number.isFinite(v) || !Number.isFinite(d)) {
						throw new RangeError(
							`matrix[${i}][${j}] must have finite v and d values`
						)
					}
					result[j][i] = { v, d }
				}
			}
		}
	}

	return result
}
