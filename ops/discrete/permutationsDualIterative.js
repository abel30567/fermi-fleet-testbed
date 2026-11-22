/**
 * @typedef {{ v: number, d: number }} DualNumber
 * A first-order dual number representing `v + d*ε` with `ε^2 = 0`,
 * carrying a primal value `v` and forward-mode derivative `d`.
 */

/**
 * Validates that a value is a well-formed finite dual number `{ v, d }`.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {DualNumber}
 */
function assertDualNumber(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be a dual number object { v, d }`)
	}
	const { v, d } = value
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${name}.v and ${name}.d must be numbers`)
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${name}.v and ${name}.d must be finite numbers`)
	}
	return { v, d }
}

/**
 * Extracts and validates the non-negative integer count `k`.
 * Accepts either a plain non-negative safe integer or a dual number `{ v, d }`
 * with non-negative safe integer `v` and `d === 0`.
 *
 * @param {unknown} k
 * @returns {number}
 */
function parseCount(k) {
	let count
	if (typeof k === 'number') {
		count = k
	} else if (k !== null && typeof k === 'object' && !Array.isArray(k)) {
		const dualK = assertDualNumber(k, 'k')
		if (dualK.d !== 0) {
			throw new RangeError('k.d must be 0 because k is a discrete integer count')
		}
		count = dualK.v
	} else {
		throw new TypeError('k must be a non-negative integer or a dual number { v, d } with d === 0')
	}

	if (!Number.isSafeInteger(count) || count < 0) {
		throw new RangeError('k must be a non-negative safe integer')
	}
	return count
}

/**
 * Computes k-permutations / the falling factorial
 * `P(n, k) = ∏_{i=0}^{k-1} (n - i)` over a dual number `n = { v, d }`
 * using a straightforward iterative forward-mode dual product.
 *
 * For `k = 0`, the empty product is `{ v: 1, d: 0 }`.
 * For any finite real `n.v` (integer or non-integer, positive, zero, or negative)
 * and non-negative integer `k`, the returned dual number holds:
 * - `v = P(n.v, k)`
 * - `d = P'(n.v, k) * n.d`
 *
 * Because the derivative is propagated directly via the dual product rule
 * `(a, a') * (n - i, n') = (a * (n - i), a' * (n - i) + a * n')`,
 * roots where `n.v ∈ {0, 1, ..., k - 1}` are evaluated without division by zero.
 *
 * @param {DualNumber} n - Dual number `{ v, d }` representing the base argument and its derivative.
 * @param {number | DualNumber} k - Non-negative integer count (or dual number with integer `v >= 0` and `d === 0`).
 * @returns {DualNumber} Dual number `{ v, d }` containing `P(n, k)` and its forward-mode derivative.
 * @throws {TypeError} If `n` is not a `{ v, d }` object with numeric fields, or `k` is not a number or dual object.
 * @throws {RangeError} If any component is non-finite, `k` is not a non-negative safe integer, or `k.d !== 0`.
 */
export function permutationsDualIterative(n, k) {
	const { v: nv, d: nd } = assertDualNumber(n, 'n')
	const count = parseCount(k)

	let v = 1
	let d = 0

	for (let i = 0; i < count; i++) {
		const factor = nv - i
		const nextD = nd === 0 ? 0 : d * factor + v * nd
		const nextV = v * factor
		v = nextV
		d = nextD
	}

	return {
		v: v === 0 ? 0 : v,
		d: d === 0 ? 0 : d,
	}
}
