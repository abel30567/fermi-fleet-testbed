/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value component.
 * @property {number} d - First-order forward-mode derivative (tangent) component.
 */

/**
 * Validate that a value is a finite dual number `{ v, d }`.
 *
 * @param {unknown} term - Value to validate.
 * @param {string} label - Context label for error messages.
 * @returns {DualNumber} The validated dual number.
 */
function assertDual(term, label) {
	if (term === null || typeof term !== 'object' || Array.isArray(term)) {
		throw new TypeError(`${label} must be a dual number object { v, d }`)
	}
	const { v, d } = /** @type {Record<string, unknown>} */ (term)
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${label} must have numeric v and d properties`)
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${label} must have finite v and d values`)
	}
	return /** @type {DualNumber} */ ({ v, d })
}

/**
 * Validate that a summation bound is a safe integer.
 *
 * @param {unknown} bound - Bound value to validate.
 * @param {string} name - Parameter name for error messages.
 * @returns {number} The validated safe integer.
 */
function assertSafeIntBound(bound, name) {
	if (typeof bound !== 'number') {
		throw new TypeError(`${name} must be a number`)
	}
	if (!Number.isSafeInteger(bound)) {
		throw new RangeError(`${name} must be a finite safe integer`)
	}
	return bound
}

/**
 * Add two dual numbers component-wise.
 *
 * @param {DualNumber} a - Left addend.
 * @param {DualNumber} b - Right addend.
 * @returns {DualNumber} Sum `{ v: a.v + b.v, d: a.d + b.d }`.
 */
function addDual(a, b) {
	return { v: a.v + b.v, d: a.d + b.d }
}

/**
 * Pairwise divide-and-conquer recursive summation over an array slice `[lo, hi)`.
 *
 * @param {DualNumber[]} terms - Array of dual numbers.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @returns {DualNumber} Recursive sum over `[lo, hi)`.
 */
function sumArrayRecursive(terms, lo, hi) {
	const count = hi - lo
	if (count === 0) {
		return { v: 0, d: 0 }
	}
	if (count === 1) {
		if (!(lo in terms)) {
			throw new TypeError(`terms[${lo}] must be a dual number object { v, d }`)
		}
		return assertDual(terms[lo], `terms[${lo}]`)
	}
	const mid = lo + Math.floor(count / 2)
	return addDual(
		sumArrayRecursive(terms, lo, mid),
		sumArrayRecursive(terms, mid, hi),
	)
}

/**
 * Pairwise divide-and-conquer recursive summation over integer index range `[lo, hi]`.
 *
 * @param {(k: number) => DualNumber} termFn - Function producing a dual number for index `k`.
 * @param {number} lo - Inclusive lower bound.
 * @param {number} hi - Inclusive upper bound.
 * @returns {DualNumber} Recursive sum over `[lo, hi]`.
 */
function sumRangeRecursive(termFn, lo, hi) {
	if (lo === hi) {
		return assertDual(termFn(lo), `termFn(${lo})`)
	}
	const mid = lo + Math.floor((hi - lo) / 2)
	return addDual(
		sumRangeRecursive(termFn, lo, mid),
		sumRangeRecursive(termFn, mid + 1, hi),
	)
}

/**
 * Compute the discrete summation of dual numbers `{ v, d }` carrying a forward-mode
 * derivative alongside the primal value, using a recursive divide-and-conquer
 * (pairwise summation) algorithm with O(log n) stack depth.
 *
 * Supports two calling conventions:
 * 1. `summationDualRecursive(terms)` — sums an array of dual numbers `{ v, d }`.
 * 2. `summationDualRecursive(termFn, start, end)` — sums `termFn(k)` for integer
 *    indices `k` from `start` through `end` inclusive (returns `{ v: 0, d: 0 }`
 *    when `start > end`).
 *
 * @param {DualNumber[] | ((k: number) => DualNumber)} termsOrFn - Array of dual numbers
 *   or generator function mapping an integer index `k` to a dual number `{ v, d }`.
 * @param {number} [start] - Inclusive lower integer bound (required when first argument is a function).
 * @param {number} [end] - Inclusive upper integer bound (required when first argument is a function).
 * @returns {DualNumber} The accumulated dual number `{ v, d }`.
 * @throws {TypeError} If arguments or dual number terms have invalid types.
 * @throws {RangeError} If bounds are not safe integers or dual components are non-finite.
 */
export function summationDualRecursive(termsOrFn, start, end) {
	if (Array.isArray(termsOrFn)) {
		if (start !== undefined || end !== undefined) {
			throw new TypeError(
				'summationDualRecursive(terms) does not accept start/end bounds when given an array',
			)
		}
		return sumArrayRecursive(termsOrFn, 0, termsOrFn.length)
	}

	if (typeof termsOrFn === 'function') {
		const lo = assertSafeIntBound(start, 'start')
		const hi = assertSafeIntBound(end, 'end')
		if (lo > hi) {
			return { v: 0, d: 0 }
		}
		if (!Number.isSafeInteger(hi - lo)) {
			throw new RangeError('Summation range (end - start) exceeds safe integer limit')
		}
		return sumRangeRecursive(termsOrFn, lo, hi)
	}

	throw new TypeError(
		'First argument must be an array of dual numbers { v, d } or a term function (k) => { v, d }',
	)
}
