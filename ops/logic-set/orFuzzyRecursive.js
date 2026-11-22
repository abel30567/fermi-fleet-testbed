/**
 * Validates that a value is a finite fuzzy membership degree in [0, 1].
 *
 * @param {unknown} value - Candidate membership degree.
 * @param {number} index - Position in the input sequence for error reporting.
 * @returns {number} Validated membership degree in [0, 1] (with -0 normalized to 0).
 * @throws {TypeError} If value is not of type 'number'.
 * @throws {RangeError} If value is not finite or falls outside [0, 1].
 */
function validateMembership(value, index) {
	if (typeof value !== 'number') {
		throw new TypeError(
			`Expected membership value at index ${index} to be a finite number in [0, 1], got ${typeof value}`,
		)
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(
			`Expected membership value at index ${index} to be a finite number in [0, 1], got ${value}`,
		)
	}
	return value === 0 ? 0 : value
}

/**
 * Computes the Zadeh OR (maximum) over values[low..high] using divide-and-conquer recursion.
 *
 * @param {readonly number[]} values - Sequence of candidate membership degrees.
 * @param {number} low - Inclusive lower index.
 * @param {number} high - Inclusive upper index.
 * @returns {number} Maximum membership degree in [low, high].
 */
function divideAndConquerOr(values, low, high) {
	if (low === high) {
		return validateMembership(values[low], low)
	}
	const mid = (low + high) >>> 1
	const left = divideAndConquerOr(values, low, mid)
	const right = divideAndConquerOr(values, mid + 1, high)
	return left >= right ? left : right
}

/**
 * Computes the Zadeh fuzzy OR (disjunction / union membership: max) over one or
 * more fuzzy membership degrees in [0, 1] using a recursive divide-and-conquer
 * algorithm (O(n) time, O(log n) stack depth).
 *
 * Accepts either variadic membership numbers (`orFuzzyRecursive(0.2, 0.8, 0.5)`)
 * or a single array of membership numbers (`orFuzzyRecursive([0.2, 0.8, 0.5])`).
 * An empty array returns `0`, the identity element of Zadeh disjunction.
 * Every input element is validated to be a finite number strictly within [0, 1].
 *
 * @param {...(number | readonly number[])} args - Membership degrees in [0, 1], or a single array thereof.
 * @returns {number} The Zadeh OR membership degree in [0, 1].
 * @throws {TypeError} If called with no arguments or if any element is not a number.
 * @throws {RangeError} If any element is NaN, non-finite, or outside [0, 1].
 */
export function orFuzzyRecursive(...args) {
	if (args.length === 0) {
		throw new TypeError(
			'orFuzzyRecursive requires at least one membership value or an array of membership values',
		)
	}

	const values = args.length === 1 && Array.isArray(args[0]) ? args[0] : args

	if (values.length === 0) {
		return 0
	}

	return divideAndConquerOr(values, 0, values.length - 1)
}
