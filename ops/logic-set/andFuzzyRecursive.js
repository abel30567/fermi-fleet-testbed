/**
 * Validates that a value is a finite fuzzy membership degree in [0, 1].
 *
 * @param {unknown} value - Candidate membership degree.
 * @param {number} index - Zero-based position of the value in the input sequence.
 * @returns {number} The validated membership degree (with -0 normalized to 0).
 * @throws {TypeError} If the value is not a number.
 * @throws {RangeError} If the value is NaN, infinite, or outside [0, 1].
 */
function validateMembership(value, index) {
	if (typeof value !== 'number') {
		throw new TypeError(
			`Expected membership value at index ${index} to be a number, got ${value === null ? 'null' : typeof value}`
		)
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(
			`Expected membership value at index ${index} to be a finite number in [0, 1], got ${value}`
		)
	}
	return value === 0 ? 0 : value
}

/**
 * Recursively computes the Zadeh fuzzy conjunction (minimum) over a slice
 * of validated membership degrees using divide-and-conquer.
 *
 * @param {number[]} values - Validated membership degrees in [0, 1].
 * @param {number} start - Inclusive start index.
 * @param {number} end - Inclusive end index.
 * @returns {number} Minimum membership degree in values[start..end].
 */
function divideAndConquerMin(values, start, end) {
	if (start === end) {
		return values[start]
	}
	const mid = start + Math.floor((end - start) / 2)
	const left = divideAndConquerMin(values, start, mid)
	const right = divideAndConquerMin(values, mid + 1, end)
	return left <= right ? left : right
}

/**
 * Computes the Zadeh fuzzy logical AND (fuzzy set intersection membership)
 * of one or more membership degrees in [0, 1] using a recursive
 * divide-and-conquer minimum reduction.
 *
 * Accepts either variadic numeric arguments (`andFuzzyRecursive(a, b, ...)`)
 * or a single non-empty array of numeric membership values
 * (`andFuzzyRecursive([a, b, ...])`).
 *
 * @param {...(number|number[])} args - One or more membership values in [0, 1],
 *   or a single non-empty array of membership values in [0, 1].
 * @returns {number} The Zadeh conjunction `min(x_1, ..., x_n)` in [0, 1].
 * @throws {TypeError} If any membership value is not a number (or is an empty array slot).
 * @throws {RangeError} If no values are provided, or any value is non-finite or outside [0, 1].
 */
export function andFuzzyRecursive(...args) {
	if (args.length === 0) {
		throw new RangeError('andFuzzyRecursive requires at least one membership value')
	}

	const input = args.length === 1 && Array.isArray(args[0]) ? args[0] : args

	if (input.length === 0) {
		throw new RangeError('andFuzzyRecursive requires at least one membership value')
	}

	const validated = new Array(input.length)
	for (let i = 0; i < input.length; i += 1) {
		if (!(i in input)) {
			throw new TypeError(`Expected membership value at index ${i} to be a number, got empty slot`)
		}
		validated[i] = validateMembership(input[i], i)
	}

	return divideAndConquerMin(validated, 0, validated.length - 1)
}
