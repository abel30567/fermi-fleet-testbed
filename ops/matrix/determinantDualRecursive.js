/**
 * @typedef {{ v: number, d: number }} DualNumber
 * A dual number representing a value `v` and its forward-mode derivative `d`
 * (i.e. `v + d * ε` where `ε² = 0`).
 */

/**
 * Adds two dual numbers: `(a.v + b.v) + (a.d + b.d)ε`.
 *
 * @param {DualNumber} a
 * @param {DualNumber} b
 * @returns {DualNumber}
 */
function dualAdd(a, b) {
	return { v: a.v + b.v, d: a.d + b.d }
}

/**
 * Subtracts two dual numbers: `(a.v - b.v) + (a.d - b.d)ε`.
 *
 * @param {DualNumber} a
 * @param {DualNumber} b
 * @returns {DualNumber}
 */
function dualSub(a, b) {
	return { v: a.v - b.v, d: a.d - b.d }
}

/**
 * Multiplies two dual numbers using the product rule:
 * `(a.v * b.v) + (a.v * b.d + a.d * b.v)ε`.
 *
 * @param {DualNumber} a
 * @param {DualNumber} b
 * @returns {DualNumber}
 */
function dualMul(a, b) {
	return {
		v: a.v * b.v,
		d: a.v * b.d + a.d * b.v,
	}
}

/**
 * Negates a dual number: `(-a.v) + (-a.d)ε`.
 *
 * @param {DualNumber} a
 * @returns {DualNumber}
 */
function dualNeg(a) {
	return { v: -a.v, d: -a.d }
}

/**
 * Validates that `matrix` is a non-empty square 2D array of finite dual numbers `{ v, d }`.
 *
 * @param {unknown} matrix
 * @throws {TypeError} If `matrix` is not a 2D array or any element is not a `{ v, d }` dual with numeric fields.
 * @throws {RangeError} If `matrix` is empty, non-square, or contains non-finite values.
 */
function validateDualMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a non-empty square 2D array of dual numbers { v, d }')
	}

	const n = matrix.length
	if (n === 0) {
		throw new RangeError('matrix must be non-empty')
	}

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`matrix[${i}] must be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(`matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`)
		}
		for (let j = 0; j < n; j++) {
			const cell = row[j]
			if (cell === null || typeof cell !== 'object' || Array.isArray(cell)) {
				throw new TypeError(`matrix[${i}][${j}] must be a dual number object { v, d }`)
			}
			if (typeof cell.v !== 'number' || typeof cell.d !== 'number') {
				throw new TypeError(`matrix[${i}][${j}] must have numeric properties v and d`)
			}
			if (!Number.isFinite(cell.v) || !Number.isFinite(cell.d)) {
				throw new RangeError(`matrix[${i}][${j}] must have finite v and d values`)
			}
		}
	}
}

/**
 * Divide-and-conquer summation of cofactor terms along `matrix[row]` across `cols[start..end)`.
 *
 * @param {DualNumber[][]} matrix
 * @param {number} row
 * @param {number[]} cols
 * @param {number} start
 * @param {number} end
 * @returns {DualNumber}
 */
function sumCofactors(matrix, row, cols, start, end) {
	if (end - start === 1) {
		const colPos = start
		const entry = matrix[row][cols[colPos]]

		// Only skip when both value and derivative are zero; a zero value with non-zero
		// derivative still contributes `entry.d * minor.v` to the derivative.
		if (entry.v === 0 && entry.d === 0) {
			return { v: 0, d: 0 }
		}

		const minorCols = new Array(cols.length - 1)
		for (let i = 0, p = 0; i < cols.length; i++) {
			if (i !== colPos) {
				minorCols[p++] = cols[i]
			}
		}

		const minor = detRecursive(matrix, row + 1, minorCols)
		const term = dualMul(entry, minor)
		return colPos % 2 === 0 ? term : dualNeg(term)
	}

	const mid = (start + end) >>> 1
	const left = sumCofactors(matrix, row, cols, start, mid)
	const right = sumCofactors(matrix, row, cols, mid, end)
	return dualAdd(left, right)
}

/**
 * Recursively computes the dual determinant of the submatrix formed by rows `row..n-1`
 * and columns listed in `cols`.
 *
 * @param {DualNumber[][]} matrix
 * @param {number} row
 * @param {number[]} cols
 * @returns {DualNumber}
 */
function detRecursive(matrix, row, cols) {
	const m = cols.length
	if (m === 1) {
		const cell = matrix[row][cols[0]]
		return { v: cell.v, d: cell.d }
	}
	if (m === 2) {
		const a = matrix[row][cols[0]]
		const b = matrix[row][cols[1]]
		const c = matrix[row + 1][cols[0]]
		const d = matrix[row + 1][cols[1]]
		return dualSub(dualMul(a, d), dualMul(b, c))
	}
	return sumCofactors(matrix, row, cols, 0, m)
}

/**
 * Computes the determinant of an `n × n` square matrix of dual numbers `{ v, d }`
 * carrying a forward-mode derivative alongside the primal value.
 *
 * Uses recursive Laplace cofactor expansion along the top row of each submatrix
 * with divide-and-conquer pairwise summation of cofactor terms over dual arithmetic.
 *
 * @param {DualNumber[][]} matrix - Non-empty `n × n` square 2D array of finite dual numbers `{ v, d }`.
 * @returns {DualNumber} The determinant as a dual number `{ v, d }`, where `v = det(A)`
 *   and `d = d/dt det(A(t))` evaluated via forward-mode automatic differentiation.
 * @throws {TypeError} If `matrix` is not a 2D array of `{ v, d }` objects with numeric fields.
 * @throws {RangeError} If `matrix` is empty, non-square, or contains `NaN` / `±Infinity`.
 */
export function determinantDualRecursive(matrix) {
	validateDualMatrix(matrix)

	const n = matrix.length
	const cols = new Array(n)
	for (let j = 0; j < n; j++) {
		cols[j] = j
	}

	const result = detRecursive(matrix, 0, cols)
	return {
		v: result.v === 0 ? 0 : result.v,
		d: result.d === 0 ? 0 : result.d,
	}
}
