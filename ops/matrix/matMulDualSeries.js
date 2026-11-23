/**
 * @typedef {Object} Dual
 * @property {number} v - Primal (real) value component.
 * @property {number} d - Dual (forward-mode derivative) component.
 */

/**
 * Validates that a value is a finite dual number `{ v, d }`.
 *
 * @param {unknown} entry - Candidate dual number.
 * @param {string} name - Parameter name for error reporting.
 * @param {number} row - Row index.
 * @param {number} col - Column index.
 * @throws {TypeError} If the entry is not an object with finite numeric `v` and `d`.
 */
function assertDual(entry, name, row, col) {
	if (entry === null || typeof entry !== 'object') {
		throw new TypeError(`${name}[${row}][${col}] must be a dual number object { v, d }`)
	}
	if (typeof entry.v !== 'number' || !Number.isFinite(entry.v)) {
		throw new TypeError(`${name}[${row}][${col}].v must be a finite number`)
	}
	if (typeof entry.d !== 'number' || !Number.isFinite(entry.d)) {
		throw new TypeError(`${name}[${row}][${col}].d must be a finite number`)
	}
}

/**
 * Validates a 2D matrix of dual numbers and extracts its primal and dual real matrices.
 *
 * @param {unknown} matrix - Candidate 2D matrix of dual numbers.
 * @param {string} name - Parameter name for error reporting.
 * @returns {{ rows: number, cols: number, v: number[][], d: number[][] }}
 * @throws {TypeError} If the matrix structure or any entry is invalid.
 * @throws {RangeError} If the matrix is empty or ragged.
 */
function parseDualMatrix(matrix, name) {
	if (!Array.isArray(matrix)) {
		throw new TypeError(`${name} must be a 2D array of dual numbers`)
	}
	const rows = matrix.length
	if (rows === 0) {
		throw new RangeError(`${name} must not be empty`)
	}

	const firstRow = matrix[0]
	if (!Array.isArray(firstRow)) {
		throw new TypeError(`${name}[0] must be an array`)
	}
	const cols = firstRow.length
	if (cols === 0) {
		throw new RangeError(`${name} rows must not be empty`)
	}

	const v = new Array(rows)
	const d = new Array(rows)

	for (let i = 0; i < rows; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`${name}[${i}] must be an array`)
		}
		if (row.length !== cols) {
			throw new RangeError(
				`${name} must be rectangular: row ${i} has length ${row.length}, expected ${cols}`
			)
		}
		const vRow = new Array(cols)
		const dRow = new Array(cols)
		for (let j = 0; j < cols; j++) {
			const entry = row[j]
			assertDual(entry, name, i, j)
			vRow[j] = entry.v
			dRow[j] = entry.d
		}
		v[i] = vRow
		d[i] = dRow
	}

	return { rows, cols, v, d }
}

/**
 * Multiplies two real matrices of dimensions (rows x inner) and (inner x cols).
 *
 * @param {number[][]} lhs - Left real matrix.
 * @param {number[][]} rhs - Right real matrix.
 * @param {number} rows - Number of rows in `lhs`.
 * @param {number} inner - Shared inner dimension.
 * @param {number} cols - Number of columns in `rhs`.
 * @returns {number[][]} Real matrix product.
 */
function matMulReal(lhs, rhs, rows, inner, cols) {
	const out = new Array(rows)
	for (let i = 0; i < rows; i++) {
		const lhsRow = lhs[i]
		const outRow = new Array(cols).fill(0)
		for (let k = 0; k < inner; k++) {
			const a = lhsRow[k]
			if (a === 0) continue
			const rhsRow = rhs[k]
			for (let j = 0; j < cols; j++) {
				outRow[j] += a * rhsRow[j]
			}
		}
		out[i] = outRow
	}
	return out
}

/**
 * Multiplies two matrices over dual numbers `{ v, d }` carrying a forward-mode
 * derivative alongside the primal value.
 *
 * Uses the closed-form truncated first-order Taylor series identity in the
 * dual infinitesimal `e` (`e^2 = 0`):
 *
 *   (A_v + e * A_d) * (B_v + e * B_d) = (A_v * B_v) + e * (A_d * B_v + A_v * B_d)
 *
 * @param {Dual[][]} A - Left dual matrix of shape `m x k`.
 * @param {Dual[][]} B - Right dual matrix of shape `k x n`.
 * @returns {Dual[][]} Resulting dual matrix of shape `m x n`.
 * @throws {TypeError} If `A` or `B` is not a valid 2D array of `{ v, d }` finite dual numbers.
 * @throws {RangeError} If `A` or `B` is empty, ragged, or has incompatible inner dimensions.
 */
export function matMulDualSeries(A, B) {
	const parsedA = parseDualMatrix(A, 'A')
	const parsedB = parseDualMatrix(B, 'B')

	if (parsedA.cols !== parsedB.rows) {
		throw new RangeError(
			`Incompatible matrix dimensions: A is ${parsedA.rows}x${parsedA.cols}, B is ${parsedB.rows}x${parsedB.cols}`
		)
	}

	const rows = parsedA.rows
	const inner = parsedA.cols
	const cols = parsedB.cols

	// Closed-form dual series expansion (e^2 = 0):
	//   C_v = A_v * B_v
	//   C_d = A_d * B_v + A_v * B_d
	const cv = matMulReal(parsedA.v, parsedB.v, rows, inner, cols)
	const adBv = matMulReal(parsedA.d, parsedB.v, rows, inner, cols)
	const avBd = matMulReal(parsedA.v, parsedB.d, rows, inner, cols)

	const result = new Array(rows)
	for (let i = 0; i < rows; i++) {
		const row = new Array(cols)
		for (let j = 0; j < cols; j++) {
			const v = cv[i][j]
			const d = adBv[i][j] + avBd[i][j]
			row[j] = {
				v: v === 0 ? 0 : v,
				d: d === 0 ? 0 : d,
			}
		}
		result[i] = row
	}

	return result
}
