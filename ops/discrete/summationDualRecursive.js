/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal (real) value component.
 * @property {number} d - Tangent (first-order derivative) component.
 */

/**
 * Validates that an element is a finite dual number `{ v, d }`.
 *
 * @param {unknown} element - Candidate dual number element.
 * @param {number} index - Index in the input array for error diagnostics.
 * @throws {TypeError} If the element is not a non-null non-array object with numeric `v` and `d`.
 * @throws {RangeError} If `v` or `d` is not a finite number (NaN or ±Infinity).
 */
function assertValidDual(element, index) {
	if (element === null || typeof element !== 'object' || Array.isArray(element)) {
		throw new TypeError(`Element at index ${index} must be a dual number object { v, d }`)
	}
	const { v, d } = element
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`Element at index ${index} must have numeric properties v and d`)
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`Element at index ${index} must have finite numeric properties v and d`)
	}
}

/**
 * Recursively sums the half-open slice `terms[lo..hi)` using pairwise
 * divide-and-conquer dual addition.
 *
 * @param {readonly DualNumber[]} terms - Validated array of dual numbers.
 * @param {number} lo - Inclusive lower index.
 * @param {number} hi - Exclusive upper index (`hi > lo`).
 * @returns {DualNumber} Sum of dual numbers in `terms[lo..hi)`.
 */
function sumRange(terms, lo, hi) {
	const len = hi - lo
	if (len === 1) {
		const term = terms[lo]
		return { v: term.v, d: term.d }
	}
	const mid = lo + (len >>> 1)
	const left = sumRange(terms, lo, mid)
	const right = sumRange(terms, mid, hi)
	return {
		v: left.v + right.v,
		d: left.d + right.d,
	}
}

/**
 * Computes the discrete summation of an array of dual numbers `{ v, d }` using
 * a recursive divide-and-conquer (pairwise) summation algorithm.
 *
 * Dual numbers represent values with a forward-mode first derivative
 * `v + d * ε` (with `ε² = 0`). Because differentiation is linear, the sum of
 * dual numbers is the component-wise sum of their primal values `v` and
 * tangent derivatives `d`:
 *
 *   ∑ (vᵢ + dᵢε) = (∑ vᵢ) + (∑ dᵢ)ε
 *
 * Pairwise divide-and-conquer summation splits `[lo, hi)` at the midpoint into
 * `[lo, mid)` and `[mid, hi)` recursively, achieving O(n) time, O(log n) call
 * stack depth, and improved floating-point error bounds (O(ε log n) vs O(ε n)
 * for naive left-to-right summation).
 *
 * @param {readonly DualNumber[]} terms - Array of finite dual numbers `{ v, d }`.
 * @returns {DualNumber} The dual sum `{ v, d }` (`{ v: 0, d: 0 }` for an empty array).
 * @throws {TypeError} If `terms` is not an Array or any element is not a valid `{ v, d }` object.
 * @throws {RangeError} If any element has a non-finite (`NaN`, `±Infinity`) `v` or `d`.
 */
export function summationDualRecursive(terms) {
	if (!Array.isArray(terms)) {
		throw new TypeError('terms must be an Array of dual numbers { v, d }')
	}

	const n = terms.length
	for (let i = 0; i < n; i++) {
		if (!(i in terms)) {
			throw new TypeError(`Element at index ${i} is missing (sparse arrays are not allowed)`)
		}
		assertValidDual(terms[i], i)
	}

	if (n === 0) {
		return { v: 0, d: 0 }
	}

	return sumRange(terms, 0, n)
}
