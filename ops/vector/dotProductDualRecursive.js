/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value component.
 * @property {number} d - First-order forward-mode derivative (tangent) component.
 */

/**
 * Validates that a value is a DualNumber object `{ v, d }` with finite numeric components.
 *
 * @param {unknown} item - Candidate dual number element.
 * @param {string} vectorName - Parameter name for error messages.
 * @param {number} index - Element index within the vector.
 * @throws {TypeError} If the element is not an object with numeric `v` and `d` properties.
 * @throws {RangeError} If `v` or `d` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function assertDualNumber(item, vectorName, index) {
	if (item === null || typeof item !== 'object') {
		throw new TypeError(`${vectorName}[${index}] must be a dual number object { v, d }`)
	}
	const { v, d } = item
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${vectorName}[${index}] must have numeric v and d properties`)
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${vectorName}[${index}] must have finite v and d values`)
	}
}

/**
 * Recursively computes the dual-number dot product over the half-open index range `[lo, hi)`.
 *
 * Uses a binary divide-and-conquer split (pairwise summation), giving O(log n) recursion depth.
 * For each element pair `(x, y)` with `x = x.v + x.d*ε` and `y = y.v + y.d*ε` (`ε^2 = 0`),
 * the dual product is `{ v: x.v * y.v, d: x.v * y.d + x.d * y.v }`.
 *
 * @param {DualNumber[]} a - First validated vector of dual numbers.
 * @param {DualNumber[]} b - Second validated vector of dual numbers.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @returns {DualNumber} Partial dual dot product over `[lo, hi)`.
 */
function dotRange(a, b, lo, hi) {
	const len = hi - lo
	if (len === 0) {
		return { v: 0, d: 0 }
	}
	if (len === 1) {
		const x = a[lo]
		const y = b[lo]
		return {
			v: x.v * y.v,
			d: x.v * y.d + x.d * y.v,
		}
	}
	const mid = lo + (len >>> 1)
	const left = dotRange(a, b, lo, mid)
	const right = dotRange(a, b, mid, hi)
	return {
		v: left.v + right.v,
		d: left.d + right.d,
	}
}

/**
 * Computes the dot product of two equal-length vectors of dual numbers `{ v, d }`
 * using a recursive divide-and-conquer binary split.
 *
 * For dual vectors `a` and `b` representing `u(t)` and `w(t)` with tangents `u'(t)` and `w'(t)`,
 * the returned dual number `{ v, d }` satisfies:
 * - `v = sum_i (a[i].v * b[i].v)`
 * - `d = sum_i (a[i].v * b[i].d + a[i].d * b[i].v)`
 *
 * @param {DualNumber[]} a - First vector of dual numbers `{ v, d }`.
 * @param {DualNumber[]} b - Second vector of dual numbers `{ v, d }`.
 * @returns {DualNumber} Dual number `{ v, d }` containing the dot product value and derivative.
 * @throws {TypeError} If either argument is not an array or contains invalid dual number elements.
 * @throws {RangeError} If the vectors have different lengths or contain non-finite numbers.
 */
export function dotProductDualRecursive(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument must be an array of dual numbers')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument must be an array of dual numbers')
	}
	if (a.length !== b.length) {
		throw new RangeError(`Vector lengths must match (received ${a.length} and ${b.length})`)
	}

	for (let i = 0; i < a.length; i++) {
		assertDualNumber(a[i], 'a', i)
		assertDualNumber(b[i], 'b', i)
	}

	return dotRange(a, b, 0, a.length)
}
