/**
 * Dual number representation carrying a primal value and its forward-mode
 * first derivative.
 *
 * @typedef {{ v: number, d: number }} DualNumber
 */

const CONDITION_THRESHOLD = 1e-8

/**
 * Normalize IEEE-754 negative zero to positive zero.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Multiply two dual numbers: (a_v + ε a_d)(b_v + ε b_d).
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
 * Subtract two dual numbers: a - b.
 *
 * @param {DualNumber} a
 * @param {DualNumber} b
 * @returns {DualNumber}
 */
function dualSub(a, b) {
	return {
		v: a.v - b.v,
		d: a.d - b.d,
	}
}

/**
 * Add two dual numbers: a + b.
 *
 * @param {DualNumber} a
 * @param {DualNumber} b
 * @returns {DualNumber}
 */
function dualAdd(a, b) {
	return {
		v: a.v + b.v,
		d: a.d + b.d,
	}
}

/**
 * Compute LU factorization with partial pivoting of a real n x n matrix
 * stored in row-major order.
 *
 * Returns the in-place combined L\U factors, row permutation vector,
 * determinant, and extreme pivot magnitudes.
 *
 * @param {Float64Array} src
 * @param {number} n
 * @returns {{ lu: Float64Array, perm: Int32Array, det: number, uMax: number, uMin: number }}
 */
function luDecompose(src, n) {
	const lu = new Float64Array(src)
	const perm = new Int32Array(n)
	for (let i = 0; i < n; i++) {
		perm[i] = i
	}

	let sign = 1
	let uMax = 0
	let uMin = Infinity

	for (let k = 0; k < n; k++) {
		let pivotRow = k
		let pivotAbs = Math.abs(lu[k * n + k])
		for (let i = k + 1; i < n; i++) {
			const val = Math.abs(lu[i * n + k])
			if (val > pivotAbs) {
				pivotAbs = val
				pivotRow = i
			}
		}

		if (pivotRow !== k) {
			const kOff = k * n
			const pOff = pivotRow * n
			for (let j = 0; j < n; j++) {
				const tmp = lu[kOff + j]
				lu[kOff + j] = lu[pOff + j]
				lu[pOff + j] = tmp
			}
			const tmpP = perm[k]
			perm[k] = perm[pivotRow]
			perm[pivotRow] = tmpP
			sign = -sign
		}

		const pivot = lu[k * n + k]
		const absPivot = Math.abs(pivot)
		if (absPivot > uMax) uMax = absPivot
		if (absPivot < uMin) uMin = absPivot

		if (pivot === 0) {
			return { lu, perm, det: 0, uMax, uMin: 0 }
		}

		const kOff = k * n
		for (let i = k + 1; i < n; i++) {
			const iOff = i * n
			const factor = lu[iOff + k] / pivot
			lu[iOff + k] = factor
			for (let j = k + 1; j < n; j++) {
				lu[iOff + j] -= factor * lu[kOff + j]
			}
		}
	}

	let det = sign
	for (let i = 0; i < n; i++) {
		det *= lu[i * n + i]
	}

	return { lu, perm, det, uMax, uMin }
}

/**
 * Compute tr(V^{-1} D) from an LU factorization P V = L U.
 *
 * For each column j of D, solves L U x = P D_{:,j} and accumulates x_j.
 * Back-substitution stops at row j since only x_j is needed.
 *
 * @param {Float64Array} lu
 * @param {Int32Array} perm
 * @param {Float64Array} D
 * @param {number} n
 * @returns {number}
 */
function traceInvProduct(lu, perm, D, n) {
	const y = new Float64Array(n)
	let trace = 0

	for (let j = 0; j < n; j++) {
		// Apply row permutation P to column j of D
		for (let i = 0; i < n; i++) {
			y[i] = D[perm[i] * n + j]
		}

		// Forward substitution: L y = P d_j (unit diagonal)
		for (let i = 1; i < n; i++) {
			let sum = y[i]
			const iOff = i * n
			for (let k = 0; k < i; k++) {
				sum -= lu[iOff + k] * y[k]
			}
			y[i] = sum
		}

		// Back substitution: U x = y, stopping once x_j is computed
		for (let i = n - 1; i >= j; i--) {
			let sum = y[i]
			const iOff = i * n
			for (let k = i + 1; k < n; k++) {
				sum -= lu[iOff + k] * y[k]
			}
			y[i] = sum / lu[iOff + i]
		}

		trace += y[j]
	}

	return trace
}

/**
 * Compute the first-order derivative of det(V + ε D) using the exact
 * multilinearity series identity:
 *
 *   d/dε det(V + ε D)|_{ε=0} = Σ_{j=0}^{n-1} det(V^{(j ← D_j)})
 *
 * where column j of V is replaced by column j of D. This requires no
 * matrix inversion and remains accurate even when V is singular or
 * ill-conditioned (e.g. rank(V) = n - 1 where det(V) = 0 but d ≠ 0).
 *
 * @param {Float64Array} V
 * @param {Float64Array} D
 * @param {number} n
 * @returns {number}
 */
function derivativeMultilinear(V, D, n) {
	const work = new Float64Array(n * n)
	let dSum = 0

	for (let col = 0; col < n; col++) {
		let hasNonZero = false
		for (let i = 0; i < n; i++) {
			if (D[i * n + col] !== 0) {
				hasNonZero = true
				break
			}
		}
		if (!hasNonZero) continue

		work.set(V)
		for (let i = 0; i < n; i++) {
			work[i * n + col] = D[i * n + col]
		}
		dSum += luDecompose(work, n).det
	}

	return dSum
}

/**
 * Compute the determinant of a square matrix of dual numbers `{ v, d }`,
 * returning `{ v, d }` where `v = det(V)` is the primal determinant and
 * `d = d/dε det(V + ε D)|_{ε=0}` is its forward-mode derivative.
 *
 * Uses closed-form dual arithmetic for small dimensions (`n <= 3`), and for
 * larger dimensions (`n >= 4`) uses Jacobi's identity / first-order
 * determinant series expansion:
 *
 *   det(V + ε D) = det(V) * det(I + ε V^{-1} D)
 *                = det(V) * (1 + ε tr(V^{-1} D))
 *
 * via LU factorization with partial pivoting, falling back automatically to
 * the exact division-free multilinearity series identity
 * `Σ_j det(V^{(j ← D_j)})` whenever `V` is singular or ill-conditioned.
 *
 * @param {DualNumber[][]} matrix - Square n x n array of `{ v, d }` dual numbers.
 * @returns {DualNumber} Dual determinant `{ v, d }`.
 * @throws {TypeError} If `matrix` is not an array of arrays of `{ v, d }` objects with numeric components.
 * @throws {RangeError} If `matrix` is not square or contains non-finite numbers (`NaN`, `±Infinity`).
 */
export function determinantDualSeries(matrix) {
	if (!Array.isArray(matrix)) {
		throw new TypeError('Expected matrix to be an array of rows')
	}

	const n = matrix.length
	if (n === 0) {
		return { v: 1, d: 0 }
	}

	const V = new Float64Array(n * n)
	const D = new Float64Array(n * n)
	let hasNonZeroV = false
	let hasNonZeroD = false

	for (let i = 0; i < n; i++) {
		const row = matrix[i]
		if (!Array.isArray(row)) {
			throw new TypeError(`Expected row ${i} to be an array`)
		}
		if (row.length !== n) {
			throw new RangeError(
				`Matrix must be square: expected row ${i} to have length ${n}, got ${row.length}`
			)
		}

		const rowOff = i * n
		for (let j = 0; j < n; j++) {
			const cell = row[j]
			if (cell === null || typeof cell !== 'object') {
				throw new TypeError(
					`Expected dual number object { v, d } at [${i}][${j}]`
				)
			}
			const { v, d } = cell
			if (typeof v !== 'number' || typeof d !== 'number') {
				throw new TypeError(
					`Expected numeric { v, d } properties at [${i}][${j}]`
				)
			}
			if (!Number.isFinite(v) || !Number.isFinite(d)) {
				throw new RangeError(
					`Expected finite { v, d } values at [${i}][${j}]`
				)
			}
			V[rowOff + j] = v
			D[rowOff + j] = d
			if (v !== 0) hasNonZeroV = true
			if (d !== 0) hasNonZeroD = true
		}
	}

	// Closed-form fast paths for n = 1, 2, 3 (exact, division-free)
	if (n === 1) {
		return {
			v: normalizeZero(V[0]),
			d: normalizeZero(D[0]),
		}
	}

	if (n === 2) {
		const a00 = { v: V[0], d: D[0] }
		const a01 = { v: V[1], d: D[1] }
		const a10 = { v: V[2], d: D[2] }
		const a11 = { v: V[3], d: D[3] }
		const res = dualSub(dualMul(a00, a11), dualMul(a01, a10))
		return {
			v: normalizeZero(res.v),
			d: normalizeZero(res.d),
		}
	}

	if (n === 3) {
		const a00 = { v: V[0], d: D[0] }
		const a01 = { v: V[1], d: D[1] }
		const a02 = { v: V[2], d: D[2] }
		const a10 = { v: V[3], d: D[3] }
		const a11 = { v: V[4], d: D[4] }
		const a12 = { v: V[5], d: D[5] }
		const a20 = { v: V[6], d: D[6] }
		const a21 = { v: V[7], d: D[7] }
		const a22 = { v: V[8], d: D[8] }

		const m0 = dualSub(dualMul(a11, a22), dualMul(a12, a21))
		const m1 = dualSub(dualMul(a10, a22), dualMul(a12, a20))
		const m2 = dualSub(dualMul(a10, a21), dualMul(a11, a20))

		const term0 = dualMul(a00, m0)
		const term1 = dualMul(a01, m1)
		const term2 = dualMul(a02, m2)
		const res = dualAdd(dualSub(term0, term1), term2)

		return {
			v: normalizeZero(res.v),
			d: normalizeZero(res.d),
		}
	}

	// For n >= 4: if V is identically zero, every term in det(V + ε D) is O(ε^n) = 0
	if (!hasNonZeroV) {
		return { v: 0, d: 0 }
	}

	const { lu, perm, det, uMax, uMin } = luDecompose(V, n)

	// Constant matrix shortcut: zero derivative
	if (!hasNonZeroD) {
		return { v: normalizeZero(det), d: 0 }
	}

	// Well-conditioned invertible V: Jacobi's identity / determinant series
	// det(V + ε D) = det(V) * (1 + ε tr(V^{-1} D))
	if (
		Number.isFinite(det) &&
		det !== 0 &&
		uMax > 0 &&
		uMin / uMax > CONDITION_THRESHOLD
	) {
		const trace = traceInvProduct(lu, perm, D, n)
		const deriv = det * trace
		if (Number.isFinite(deriv)) {
			return {
				v: normalizeZero(det),
				d: normalizeZero(deriv),
			}
		}
	}

	// Singular or ill-conditioned V: exact multilinearity series expansion
	const deriv = derivativeMultilinear(V, D, n)
	return {
		v: normalizeZero(det),
		d: normalizeZero(deriv),
	}
}
