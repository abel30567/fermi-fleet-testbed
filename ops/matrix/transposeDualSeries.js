/**
 * @typedef {{ v: number, d: number }} DualNumber
 * A dual number z = v + d*ε (with ε² = 0), carrying a primal value `v`
 * and its forward-mode derivative `d`.
 */

/**
 * Validates that a value is a well-formed DualNumber `{ v, d }` with finite numeric fields.
 *
 * @param {unknown} entry - Candidate dual number.
 * @param {number} rowIndex - Row index for error diagnostics.
 * @param {number} colIndex - Column index for error diagnostics.
 * @returns {DualNumber}
 */
function validateDualEntry(entry, rowIndex, colIndex) {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new TypeError(
			`Expected dual number object { v, d } at [${rowIndex}][${colIndex}]`
		)
	}

	const { v, d } = /** @type {{ v: unknown, d: unknown }} */ (entry)

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(
			`Expected numeric v and d properties at [${rowIndex}][${colIndex}]`
		)
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(
			`Expected finite numeric v and d at [${rowIndex}][${colIndex}]`
		)
	}

	return { v, d }
}

/**
 * Computes the matrix transpose over dual numbers `{ v, d }`.
 *
 * Because matrix transposition T(A) = Aᵀ is a linear operator, its Fréchet
 * derivative is itself (DT(A)[D] = Dᵀ) and all higher-order series terms vanish
 * identically. In dual arithmetic with ε² = 0, this yields the exact closed-form
 * identity:
 *
 *   (V + Dε)ᵀ = Vᵀ + Dᵀε
 *
 * so for an m×n dual matrix A, the result is an n×m dual matrix B with
 * B[j][i] = { v: A[i][j].v, d: A[i][j].d }. Returned dual entries are fresh
 * objects and do not alias the input.
 *
 * @param {DualNumber[][]} matrix - Rectangular 2D array of dual numbers `{ v, d }`.
 * @returns {DualNumber[][]} Transposed dual matrix of shape n×m (or `[]` when empty).
 * @throws {TypeError} If `matrix` is not an array of arrays of `{ v, d }` dual numbers.
 * @throws {RangeError} If `matrix` is ragged (inconsistent row lengths) or contains non-finite values.
 */
export function transposeDualSeries(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be an array of rows')
	}

	const rows = matrix.length
	if (rows === 0) {
		return []
	}

	if (!Array.isArray(matrix[0])) {
		throw new TypeError('Expected row 0 to be an array')
	}

	const cols = matrix[0].length

	for (let i = 0; i < rows; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Expected row ${i} to be an array`)
		}
		if (row.length !== cols) {
			throw new RangeError(
				`Ragged matrix: row ${i} has length ${row.length}, expected ${cols}`
			)
		}
		for (let j = 0; j < cols; j++) {
			validateDualEntry(row[j], i, j)
		}
	}

	if (cols === 0) {
		return []
	}

	/** @type {DualNumber[][]} */
	const result = new Array(cols)
	for (let j = 0; j < cols; j++) {
		/** @type {DualNumber[]} */
		const outRow = new Array(rows)
		for (let i = 0; i < rows; i++) {
			const cell = matrix[i][j]
			outRow[i] = { v: cell.v, d: cell.d }
		}
		result[j] = outRow
	}

	return result
}
