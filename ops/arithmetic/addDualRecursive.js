/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value f(x).
 * @property {number} d - Forward-mode derivative f'(x).
 */

/**
 * Validates that a value is a well-formed dual number `{ v, d }` with finite numeric fields.
 *
 * @param {unknown} dual - Candidate dual number.
 * @param {number} index - Argument or element index for error reporting.
 * @returns {DualNumber} The validated dual number.
 * @throws {TypeError} If the input is not a non-null plain-like object with numeric `v` and `d`.
 * @throws {RangeError} If `v` or `d` is not a finite number (`NaN`, `Infinity`, `-Infinity`).
 */
function validateDual(dual, index) {
	if (typeof dual !== 'object' || dual === null || Array.isArray(dual)) {
		throw new TypeError(`Dual number at index ${index} must be a non-null object with { v, d }`)
	}
	if (!('v' in dual) || !('d' in dual)) {
		throw new TypeError(`Dual number at index ${index} must define both "v" and "d" properties`)
	}
	if (typeof dual.v !== 'number' || typeof dual.d !== 'number') {
		throw new TypeError(`Dual number at index ${index} must have numeric "v" and "d" properties`)
	}
	if (!Number.isFinite(dual.v) || !Number.isFinite(dual.d)) {
		throw new RangeError(`Dual number at index ${index} must have finite "v" and "d" values`)
	}
	return /** @type {DualNumber} */ (dual)
}

/**
 * Recursively sums dual numbers in `terms[start..end)` using pairwise divide-and-conquer.
 *
 * Recurrence:
 * - Empty slice (`length === 0`): additive identity `{ v: 0, d: 0 }`.
 * - Single element (`length === 1`): shallow copy `{ v, d }`.
 * - Two or more elements: splits at midpoint `mid = start + Math.floor((end - start) / 2)`,
 *   recursively sums left and right halves, and combines component-wise.
 *
 * @param {readonly DualNumber[]} terms - Validated array of dual numbers.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {DualNumber} Sum of `terms[start..end)`.
 */
function sumDualRange(terms, start, end) {
	const count = end - start
	if (count === 0) {
		return { v: 0, d: 0 }
	}
	if (count === 1) {
		const term = terms[start]
		return { v: term.v, d: term.d }
	}
	const mid = start + Math.floor(count / 2)
	const left = sumDualRange(terms, start, mid)
	const right = sumDualRange(terms, mid, end)
	return {
		v: left.v + right.v,
		d: left.d + right.d,
	}
}

/**
 * Adds dual numbers `{ v, d }` carrying a forward-mode derivative alongside the primal value,
 * using a recursive divide-and-conquer (pairwise) summation.
 *
 * For dual numbers `(a_v, a_d)` and `(b_v, b_d)`:
 *   `(a_v, a_d) + (b_v, b_d) = (a_v + b_v, a_d + b_d)`
 *
 * Supports:
 * - Binary addition: `addDualRecursive(a, b)`
 * - Variadic addition: `addDualRecursive(a, b, c, ...)`
 * - Array addition: `addDualRecursive([a, b, c, ...])` (empty array yields `{ v: 0, d: 0 }`)
 *
 * Runs in O(N) time and O(log N) recursion depth, reducing accumulated floating-point
 * rounding error relative to naive left-to-right summation.
 *
 * @param {DualNumber | readonly DualNumber[]} first - First dual number, or an array of dual numbers.
 * @param {...DualNumber} rest - Additional dual numbers when calling with variadic arguments.
 * @returns {DualNumber} Resulting dual number `{ v, d }`.
 * @throws {TypeError} If called with no arguments, invalid argument structure, or malformed dual numbers.
 * @throws {RangeError} If any dual number contains non-finite `v` or `d`.
 */
export function addDualRecursive(first, ...rest) {
	if (arguments.length === 0) {
		throw new TypeError('addDualRecursive requires at least one dual number or an array of dual numbers')
	}

	/** @type {readonly unknown[]} */
	let rawTerms
	if (Array.isArray(first)) {
		if (rest.length > 0) {
			throw new TypeError('When passing an array of dual numbers, no additional arguments are allowed')
		}
		rawTerms = first
	} else {
		rawTerms = [first, ...rest]
	}

	const terms = new Array(rawTerms.length)
	for (let i = 0; i < rawTerms.length; i++) {
		if (!(i in rawTerms)) {
			throw new TypeError(`Dual number at index ${i} must be a non-null object with { v, d }`)
		}
		terms[i] = validateDual(rawTerms[i], i)
	}

	return sumDualRange(terms, 0, terms.length)
}
