/**
 * @typedef {{ v: number, d: number }} DualNumber
 * A first-order dual number representing `v + ε·d` with `ε² = 0`, where `v` is
 * the primal value and `d` is the forward-mode directional derivative.
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` whose
 * components are finite JavaScript numbers.
 *
 * @param {unknown} entry - Candidate dual number to validate.
 * @param {number} rowIndex - Row index for diagnostic error messages.
 * @param {number} colIndex - Column index for diagnostic error messages.
 * @returns {DualNumber} The validated dual number entry.
 * @throws {TypeError} If the entry is not a non-null plain-like object or `v`/`d` are not numbers.
 * @throws {RangeError} If `v` or `d` is `NaN` or not finite.
 */
function assertValidDual(entry, rowIndex, colIndex) {
	if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
		throw new TypeError(
			`Expected a dual number { v, d } at matrix[${rowIndex}][${colIndex}]`,
		)
	}
	if (typeof entry.v !== 'number' || typeof entry.d !== 'number') {
		throw new TypeError(
			`Expected finite numeric properties v and d at matrix[${rowIndex}][${colIndex}]`,
		)
	}
	if (!Number.isFinite(entry.v) || !Number.isFinite(entry.d)) {
		throw new RangeError(
			`Expected finite numbers for v and d at matrix[${rowIndex}][${colIndex}]`,
		)
	}
	return entry
}

/**
 * Computes the matrix transpose over first-order dual numbers `{ v, d }`
 * carrying a forward-mode derivative alongside each primal value.
 *
 * Treating a dual matrix as a truncated Taylor series in the nilpotent dual
 * unit `ε` (`ε² = 0`), `A(ε) = A_v + ε·A_d`, transposition is a linear
 * operator and therefore distributes term-by-term in closed form:
 *
 *     (A_v + ε·A_d)^T = A_v^T + ε·A_d^T
 *
 * Equivalently, for an `m × n` dual matrix `A`, the output `B = A^T` is an
 * `n × m` dual matrix with `B[j][i] = { v: A[i][j].v, d: A[i][j].d }`.
 * Every output entry is a freshly allocated `{ v, d }` object so that the
 * returned matrix never aliases input objects.
 *
 * @param {DualNumber[][]} matrix - Non-empty rectangular 2D array of dual numbers `{ v, d }`.
 * @returns {DualNumber[][]} A new transposed 2D array of fresh `{ v, d }` dual numbers.
 * @throws {TypeError} If `matrix` is not an array, any row is not an array, or any element is not a `{ v, d }` object with numeric fields.
 * @throws {RangeError} If `matrix` is empty, any row is empty, rows have inconsistent lengths (ragged), or any `v`/`d` value is non-finite.
 */
export function transposeDualSeries(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be a 2D array of dual numbers')
	}
	const rowCount = matrix.length
	if (rowCount === 0) {
		throw new RangeError('Expected matrix to be non-empty')
	}

	let colCount = -1
	for (let i = 0; i < rowCount; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Expected row ${i} to be an array`)
		}
		if (row.length === 0) {
			throw new RangeError(`Expected row ${i} to be non-empty`)
		}
		if (colCount === -1) {
			colCount = row.length
		} else if (row.length !== colCount) {
			throw new RangeError(
				`Expected rectangular matrix: row ${i} has length ${row.length}, expected ${colCount}`,
			)
		}
		for (let j = 0; j < colCount; j++) {
			assertValidDual(row[j], i, j)
		}
	}

	const result = new Array(colCount)
	for (let j = 0; j < colCount; j++) {
		const transposedRow = new Array(rowCount)
		for (let i = 0; i < rowCount; i++) {
			const cell = matrix[i][j]
			transposedRow[i] = { v: cell.v, d: cell.d }
		}
		result[j] = transposedRow
	}

	return result
}
