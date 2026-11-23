/**
 * @typedef {Object} Dual
 * @property {number} v - Primal (value) component.
 * @property {number} d - Tangent (first-order derivative) component.
 */

/**
 * Adds two dual numbers: (a.v + b.v) + (a.d + b.d)ε.
 *
 * @param {Dual} a
 * @param {Dual} b
 * @returns {Dual}
 */
function dualAdd(a, b) {
	return { v: a.v + b.v, d: a.d + b.d }
}

/**
 * Subtracts two dual numbers: (a.v - b.v) + (a.d - b.d)ε.
 *
 * @param {Dual} a
 * @param {Dual} b
 * @returns {Dual}
 */
function dualSub(a, b) {
	return { v: a.v - b.v, d: a.d - b.d }
}

/**
 * Multiplies two dual numbers: (a.v * b.v) + (a.v * b.d + a.d * b.v)ε.
 *
 * @param {Dual} a
 * @param {Dual} b
 * @returns {Dual}
 */
function dualMul(a, b) {
	return { v: a.v * b.v, d: a.v * b.d + a.d * b.v }
}

/**
 * Normalizes -0 to 0.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric fields.
 *
 * @param {unknown} entry
 * @param {number} row
 * @param {number} col
 */
function assertDual(entry, row, col) {
	if (entry === null || typeof entry !== 'object') {
		throw new TypeError(`matrix[${row}][${col}] must be a dual number object { v, d }`)
	}
	const { v, d } = /** @type {Record<string, unknown>} */ (entry)
	if (typeof v !== 'number' || !Number.isFinite(v)) {
		throw new TypeError(`matrix[${row}][${col}].v must be a finite number`)
	}
	if (typeof d !== 'number' || !Number.isFinite(d)) {
		throw new TypeError(`matrix[${row}][${col}].d must be a finite number`)
	}
}

/**
 * Validates that the input is an n×n square matrix of dual numbers `{ v, d }`.
 *
 * @param {unknown} matrix
 */
function validateMatrix(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('matrix must be a 2D array of dual numbers { v, d }')
	}
	const n = matrix.length
	for (let i = 0; i < n; i++) {
		if (!Array.isArray(matrix[i])) {
			throw new TypeError(`matrix[${i}] must be an array`)
		}
	}
	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (row.length !== n) {
			throw new RangeError(`matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`)
		}
		for (let j = 0; j < n; j++) {
			assertDual(row[j], i, j)
		}
	}
}

/**
 * Recursive cofactor expansion using a 32-bit column bitmask with memoization (for n <= 30).
 *
 * @param {Dual[][]} matrix
 * @param {number} row
 * @param {number} colMask
 * @param {number} remaining
 * @param {Map<number, Dual>} memo
 * @returns {Dual}
 */
function detBitmaskRecursive(matrix, row, colMask, remaining, memo) {
	const cached = memo.get(colMask)
	if (cached !== undefined) {
		return cached
	}

	if (remaining === 1) {
		const col = 31 - Math.clz32(colMask)
		const entry = matrix[row][col]
		const res = { v: entry.v, d: entry.d }
		memo.set(colMask, res)
		return res
	}

	if (remaining === 2) {
		const lowBit = colMask & -colMask
		const c0 = 31 - Math.clz32(lowBit)
		const c1 = 31 - Math.clz32(colMask ^ lowBit)
		const r0 = matrix[row]
		const r1 = matrix[row + 1]
		const res = dualSub(dualMul(r0[c0], r1[c1]), dualMul(r0[c1], r1[c0]))
		memo.set(colMask, res)
		return res
	}

	const currentRow = matrix[row]
	let acc = { v: 0, d: 0 }
	let bits = colMask
	let signIndex = 0

	while (bits !== 0) {
		const lowBit = bits & -bits
		const col = 31 - Math.clz32(lowBit)
		const entry = currentRow[col]

		if (entry.v !== 0 || entry.d !== 0) {
			const minor = detBitmaskRecursive(matrix, row + 1, colMask ^ lowBit, remaining - 1, memo)
			const term = dualMul(entry, minor)
			acc = (signIndex & 1) === 0 ? dualAdd(acc, term) : dualSub(acc, term)
		}

		bits ^= lowBit
		signIndex++
	}

	memo.set(colMask, acc)
	return acc
}

/**
 * Recursive cofactor expansion using an explicit active-column list (fallback for n > 30).
 *
 * @param {Dual[][]} matrix
 * @param {number} row
 * @param {number[]} activeCols
 * @returns {Dual}
 */
function detArrayRecursive(matrix, row, activeCols) {
	const k = activeCols.length
	if (k === 1) {
		const entry = matrix[row][activeCols[0]]
		return { v: entry.v, d: entry.d }
	}
	if (k === 2) {
		const c0 = activeCols[0]
		const c1 = activeCols[1]
		const r0 = matrix[row]
		const r1 = matrix[row + 1]
		return dualSub(dualMul(r0[c0], r1[c1]), dualMul(r0[c1], r1[c0]))
	}

	const currentRow = matrix[row]
	let acc = { v: 0, d: 0 }

	for (let i = 0; i < k; i++) {
		const col = activeCols[i]
		const entry = currentRow[col]
		if (entry.v === 0 && entry.d === 0) {
			continue
		}
		const nextCols = new Array(k - 1)
		for (let j = 0, p = 0; j < k; j++) {
			if (j !== i) {
				nextCols[p++] = activeCols[j]
			}
		}
		const minor = detArrayRecursive(matrix, row + 1, nextCols)
		const term = dualMul(entry, minor)
		acc = (i & 1) === 0 ? dualAdd(acc, term) : dualSub(acc, term)
	}

	return acc
}

/**
 * Computes the determinant of a square matrix over dual numbers `{ v, d }`,
 * carrying a forward-mode first-order derivative alongside the determinant value.
 *
 * Uses a division-free recursive Laplace cofactor expansion (with bitmask memoization
 * of overlapping minor subproblems for `n <= 30`), so it remains exact even when
 * the primal matrix is singular or contains zero pivots with non-zero tangents.
 *
 * By convention, the determinant of an empty 0×0 matrix `[]` is `{ v: 1, d: 0 }`.
 *
 * @param {Dual[][]} matrix - Square n×n matrix whose entries are dual numbers `{ v, d }`.
 * @returns {Dual} The determinant `{ v, d }` where `v = det(A)` and `d = d/dt det(A(t))`.
 * @throws {TypeError} If `matrix` is not a 2D array or any entry is not a valid finite dual number.
 * @throws {RangeError} If `matrix` is not square.
 */
export function determinantDualRecursive(matrix) {
	validateMatrix(matrix)

	const n = matrix.length
	if (n === 0) {
		return { v: 1, d: 0 }
	}
	if (n === 1) {
		return {
			v: normalizeZero(matrix[0][0].v),
			d: normalizeZero(matrix[0][0].d),
		}
	}
	if (n === 2) {
		const res = dualSub(
			dualMul(matrix[0][0], matrix[1][1]),
			dualMul(matrix[0][1], matrix[1][0]),
		)
		return {
			v: normalizeZero(res.v),
			d: normalizeZero(res.d),
		}
	}

	let res
	if (n <= 30) {
		const fullMask = (1 << n) - 1
		const memo = new Map()
		res = detBitmaskRecursive(matrix, 0, fullMask, n, memo)
	} else {
		const cols = Array.from({ length: n }, (_, idx) => idx)
		res = detArrayRecursive(matrix, 0, cols)
	}

	return {
		v: normalizeZero(res.v),
		d: normalizeZero(res.d),
	}
}
