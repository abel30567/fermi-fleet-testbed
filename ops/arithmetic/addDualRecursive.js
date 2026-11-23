/**
 * @typedef {Object} DualNumber
 * @property {number} v - Finite real primal value.
 * @property {number} d - Finite real forward-mode derivative (tangent).
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} value - Candidate value to validate.
 * @param {string} label - Contextual label for error reporting.
 * @returns {DualNumber} The validated dual number.
 * @throws {TypeError} If the value is not a plain-like object with numeric `v` and `d` properties.
 * @throws {RangeError} If `v` or `d` is `NaN`, `Infinity`, or `-Infinity`.
 */
function validateDual(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be a dual number object { v, d }`)
	}

	const { v, d } = /** @type {Record<string, unknown>} */ (value)

	if (typeof v !== 'number') {
		throw new TypeError(`${label}.v must be a number`)
	}
	if (typeof d !== 'number') {
		throw new TypeError(`${label}.d must be a number`)
	}
	if (!Number.isFinite(v)) {
		throw new RangeError(`${label}.v must be a finite number`)
	}
	if (!Number.isFinite(d)) {
		throw new RangeError(`${label}.d must be a finite number`)
	}

	return { v, d }
}

/**
 * Recursively sums a contiguous slice `[start, end)` of validated dual numbers
 * using divide-and-conquer pairwise reduction (`O(log n)` recursion depth).
 *
 * @param {readonly DualNumber[]} items - Validated dual numbers.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {DualNumber} The summed dual number.
 */
function sumRangeRecursive(items, start, end) {
	const length = end - start

	if (length === 1) {
		const single = items[start]
		return { v: single.v, d: single.d }
	}

	if (length === 2) {
		const left = items[start]
		const right = items[start + 1]
		return {
			v: left.v + right.v,
			d: left.d + right.d,
		}
	}

	const mid = start + (length >> 1)
	const leftSum = sumRangeRecursive(items, start, mid)
	const rightSum = sumRangeRecursive(items, mid, end)

	return {
		v: leftSum.v + rightSum.v,
		d: leftSum.d + rightSum.d,
	}
}

/**
 * Adds dual numbers `{ v, d }` carrying a forward-mode derivative alongside the primal value,
 * using a recursive divide-and-conquer pairwise summation.
 *
 * For two dual numbers `(a.v + a.d*ε)` and `(b.v + b.d*ε)` with `ε² = 0`,
 * their sum is `(a.v + b.v) + (a.d + b.d)*ε`.
 *
 * Supports:
 * - Binary addition: `addDualRecursive(a, b)`
 * - Variadic addition: `addDualRecursive(a, b, c, ...)`
 * - Single dual number: `addDualRecursive(a)` (returns a fresh `{ v, d }` copy)
 * - Array summation: `addDualRecursive([a, b, ...])` (empty array returns `{ v: 0, d: 0 }`)
 *
 * @param {...(DualNumber | readonly DualNumber[])} args - One or more dual numbers, or a single array of dual numbers.
 * @returns {DualNumber} A new dual number `{ v, d }` representing the sum.
 * @throws {TypeError} If called with no arguments or any input is not a valid `{ v, d }` dual number.
 * @throws {RangeError} If any dual number has non-finite `v` or `d`.
 */
export function addDualRecursive(...args) {
	if (args.length === 0) {
		throw new TypeError('addDualRecursive requires at least one dual number or an array of dual numbers')
	}

	const isArrayMode = args.length === 1 && Array.isArray(args[0])
	const rawItems = isArrayMode ? args[0] : args

	if (rawItems.length === 0) {
		return { v: 0, d: 0 }
	}

	/** @type {DualNumber[]} */
	const validated = new Array(rawItems.length)
	for (let i = 0; i < rawItems.length; i += 1) {
		if (!(i in rawItems)) {
			throw new TypeError(`items[${i}] must be a dual number object { v, d }`)
		}
		const label = isArrayMode ? `items[${i}]` : `arg[${i}]`
		validated[i] = validateDual(rawItems[i], label)
	}

	return sumRangeRecursive(validated, 0, validated.length)
}
