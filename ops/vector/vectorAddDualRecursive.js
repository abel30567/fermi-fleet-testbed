/**
 * A dual number representing a value and its forward-mode first derivative:
 * `v + d * ε` where `ε² = 0`.
 *
 * @typedef {Object} DualNumber
 * @property {number} v - The primal (real) value; must be a finite number.
 * @property {number} d - The tangent (derivative) component; must be a finite number.
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} value - Candidate dual number to validate.
 * @param {string} name - Parameter name for error reporting.
 * @param {number} index - Element index within the vector.
 * @throws {TypeError} If `value` is not a plain-like object with finite numeric `v` and `d` fields.
 */
function assertDualNumber(value, name, index) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${name}[${index}] must be a dual number object { v, d }`)
	}
	if (typeof value.v !== 'number' || !Number.isFinite(value.v)) {
		throw new TypeError(`${name}[${index}].v must be a finite number`)
	}
	if (typeof value.d !== 'number' || !Number.isFinite(value.d)) {
		throw new TypeError(`${name}[${index}].d must be a finite number`)
	}
}

/**
 * Recursively computes the elementwise dual-number sum over the half-open slice `[start, end)`
 * using a divide-and-conquer split-and-combine strategy.
 *
 * @param {DualNumber[]} a - First dual-number vector.
 * @param {DualNumber[]} b - Second dual-number vector.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {DualNumber[]} Resulting slice of dual-number sums.
 */
function addRange(a, b, start, end) {
	const length = end - start
	if (length === 0) {
		return []
	}
	if (length === 1) {
		const x = a[start]
		const y = b[start]
		assertDualNumber(x, 'a', start)
		assertDualNumber(y, 'b', start)
		return [{ v: x.v + y.v, d: x.d + y.d }]
	}

	const mid = start + Math.floor(length / 2)
	const left = addRange(a, b, start, mid)
	const right = addRange(a, b, mid, end)
	return left.concat(right)
}

/**
 * Adds two equal-length vectors of dual numbers `{ v, d }` carrying forward-mode derivatives
 * alongside primal values, using a recursive divide-and-conquer implementation.
 *
 * For each index `i`, `(a[i].v + a[i].d·ε) + (b[i].v + b[i].d·ε) = (a[i].v + b[i].v) + (a[i].d + b[i].d)·ε`.
 * Neither input vector nor its elements are mutated.
 *
 * @param {DualNumber[]} a - First input vector of dual numbers.
 * @param {DualNumber[]} b - Second input vector of dual numbers.
 * @returns {DualNumber[]} New vector containing the elementwise dual-number sums.
 * @throws {TypeError} If `a` or `b` is not an array, or any element is not a valid `{ v, d }` dual number with finite numbers.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function vectorAddDualRecursive(a, b) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an array of dual numbers')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an array of dual numbers')
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Vector lengths must match: received ${a.length} and ${b.length}`
		)
	}

	return addRange(a, b, 0, a.length)
}
