/**
 * Computes the Zadeh fuzzy logical NOT (`1 - x`) over a fuzzy membership value
 * or fuzzy set using a recursive divide-and-conquer strategy.
 *
 * Supported inputs:
 * - A single finite number `x` in `[0, 1]`: returns `1 - x`.
 * - A dense array of membership values in `[0, 1]`: recursively splits the
 *   index range in half (divide-and-conquer) and returns a new array of
 *   complemented memberships without mutating the input.
 * - A plain object mapping element keys to membership values in `[0, 1]`:
 *   recursively splits the key list in half (divide-and-conquer) and returns a
 *   new object with complemented memberships without mutating the input.
 *
 * @param {number | number[] | Record<string, number>} input - A fuzzy truth
 *   value in `[0, 1]`, an array of membership values, or a plain-object fuzzy
 *   set whose values lie in `[0, 1]`.
 * @returns {number | number[] | Record<string, number>} The Zadeh fuzzy
 *   complement (`1 - x`) matching the input shape.
 * @throws {TypeError} If `input` is not a number, array, or plain object, if an
 *   array is sparse, or if any membership value is not of type `number`.
 * @throws {RangeError} If any membership value is `NaN`, non-finite, `< 0`, or `> 1`.
 */
export function notFuzzyRecursive(input) {
	if (typeof input === 'number') {
		return negateMembership(input, 'input')
	}

	if (Array.isArray(input)) {
		const output = new Array(input.length)
		negateArrayRange(input, 0, input.length, output)
		return output
	}

	if (isPlainObject(input)) {
		const keys = Object.keys(input)
		const output = Object.getPrototypeOf(input) === null ? Object.create(null) : {}
		negateObjectRange(input, keys, 0, keys.length, output)
		return output
	}

	throw new TypeError(
		'notFuzzyRecursive expects a number in [0, 1], an array of numbers, or a plain object mapping keys to numbers'
	)
}

/**
 * Validates a single fuzzy membership value and returns its Zadeh complement.
 *
 * @param {unknown} value - Candidate membership degree.
 * @param {string} label - Location label for error messages.
 * @returns {number} The complement `1 - value` in `[0, 1]`.
 */
function negateMembership(value, label) {
	if (typeof value !== 'number') {
		throw new TypeError(`${label} must be a number, received ${value === null ? 'null' : typeof value}`)
	}
	if (!Number.isFinite(value)) {
		throw new RangeError(`${label} must be a finite number in [0, 1], received ${value}`)
	}
	if (value < 0 || value > 1) {
		throw new RangeError(`${label} must be within [0, 1], received ${value}`)
	}
	const complement = 1 - value
	return complement === 0 ? 0 : complement
}

/**
 * Divide-and-conquer Zadeh NOT over array slice `[start, end)`.
 *
 * @param {number[]} input
 * @param {number} start
 * @param {number} end
 * @param {number[]} output
 */
function negateArrayRange(input, start, end, output) {
	const length = end - start
	if (length === 0) {
		return
	}
	if (length === 1) {
		if (!Object.hasOwn(input, start)) {
			throw new TypeError(`input[${start}] is missing (sparse arrays are not allowed)`)
		}
		output[start] = negateMembership(input[start], `input[${start}]`)
		return
	}
	const mid = start + (length >>> 1)
	negateArrayRange(input, start, mid, output)
	negateArrayRange(input, mid, end, output)
}

/**
 * Divide-and-conquer Zadeh NOT over object key slice `[start, end)`.
 *
 * @param {Record<string, number>} input
 * @param {string[]} keys
 * @param {number} start
 * @param {number} end
 * @param {Record<string, number>} output
 */
function negateObjectRange(input, keys, start, end, output) {
	const length = end - start
	if (length === 0) {
		return
	}
	if (length === 1) {
		const key = keys[start]
		const negated = negateMembership(input[key], `input.${key}`)
		Object.defineProperty(output, key, {
			value: negated,
			enumerable: true,
			writable: true,
			configurable: true
		})
		return
	}
	const mid = start + (length >>> 1)
	negateObjectRange(input, keys, start, mid, output)
	negateObjectRange(input, keys, mid, end, output)
}

/**
 * Returns true if `value` is a plain object (`{}` or `Object.create(null)`).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false
	}
	const proto = Object.getPrototypeOf(value)
	return proto === Object.prototype || proto === null
}
