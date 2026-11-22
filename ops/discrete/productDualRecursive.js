/**
 * @typedef {object} Dual
 * @property {number} v - Primal value (must be finite).
 * @property {number} d - Forward-mode derivative component (must be finite).
 */

/**
 * Multiply two dual numbers using the forward-mode product rule:
 * (a.v + a.d * ε)(b.v + b.d * ε) = (a.v * b.v) + (a.d * b.v + a.v * b.d) * ε.
 *
 * @param {Dual} a
 * @param {Dual} b
 * @returns {Dual}
 */
function multiplyDual(a, b) {
	return {
		v: a.v * b.v,
		d: a.d * b.v + a.v * b.d,
	}
}

/**
 * Divide-and-conquer recursive product over the half-open slice `[lo, hi)`.
 *
 * @param {ReadonlyArray<Dual>} duals
 * @param {number} lo - Inclusive lower index.
 * @param {number} hi - Exclusive upper index (must satisfy `hi > lo`).
 * @returns {Dual}
 */
function productRange(duals, lo, hi) {
	if (hi - lo === 1) {
		const el = duals[lo]
		return { v: el.v, d: el.d }
	}
	const mid = lo + ((hi - lo) >>> 1)
	const left = productRange(duals, lo, mid)
	const right = productRange(duals, mid, hi)
	return multiplyDual(left, right)
}

/**
 * Compute the discrete product of an array of dual numbers `{ v, d }` using
 * a divide-and-conquer recursive strategy.
 *
 * Each element represents a value `v` paired with its forward-mode derivative
 * `d` (`v + d·ε`, where `ε² = 0`). The empty product returns the dual
 * multiplicative identity `{ v: 1, d: 0 }`. Non-empty inputs are recursively
 * split into `[lo, mid)` and `[mid, hi)` and combined with the dual product
 * rule `{ v: a.v * b.v, d: a.d * b.v + a.v * b.d }`, running in O(n) time and
 * O(log n) recursion stack depth.
 *
 * @param {ReadonlyArray<Dual>} duals - Array of dual numbers `{ v, d }`.
 * @returns {Dual} The product dual number `{ v, d }`.
 * @throws {TypeError} If `duals` is not an array, or any element is missing,
 *   not an object, or has non-number `v` or `d`.
 * @throws {RangeError} If any element has a non-finite (`NaN`, `±Infinity`) `v` or `d`.
 *
 * @example
 * productDualRecursive([{ v: 2, d: 1 }, { v: 3, d: 4 }])
 * // => { v: 6, d: 11 }
 */
export function productDualRecursive(duals) {
	if (!Array.isArray(duals)) {
		throw new TypeError('duals must be an array of { v, d } objects')
	}

	const len = duals.length
	for (let i = 0; i < len; i++) {
		if (!(i in duals)) {
			throw new TypeError(`duals[${i}] must be a { v, d } object (sparse array entry)`)
		}
		const el = duals[i]
		if (el === null || typeof el !== 'object') {
			throw new TypeError(`duals[${i}] must be a non-null { v, d } object`)
		}
		if (typeof el.v !== 'number') {
			throw new TypeError(`duals[${i}].v must be a number`)
		}
		if (typeof el.d !== 'number') {
			throw new TypeError(`duals[${i}].d must be a number`)
		}
		if (!Number.isFinite(el.v)) {
			throw new RangeError(`duals[${i}].v must be a finite number`)
		}
		if (!Number.isFinite(el.d)) {
			throw new RangeError(`duals[${i}].d must be a finite number`)
		}
	}

	if (len === 0) {
		return { v: 1, d: 0 }
	}

	const res = productRange(duals, 0, len)
	return {
		v: res.v === 0 ? 0 : res.v,
		d: res.d === 0 ? 0 : res.d,
	}
}
