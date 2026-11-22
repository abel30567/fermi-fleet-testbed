/**
 * Validates that a value is a valid fuzzy membership degree in the closed interval [0, 1].
 *
 * @param {unknown} value - Candidate membership degree.
 * @param {string} label - Descriptive label for error reporting.
 * @returns {number} The validated membership degree.
 * @throws {TypeError} If `value` is not a number.
 * @throws {RangeError} If `value` is NaN, infinite, or outside [0, 1].
 */
function validateMembership(value, label) {
	if (typeof value !== 'number') {
		throw new TypeError(`${label} must be a number in [0, 1], received ${typeof value}`)
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(`${label} must be a finite number in [0, 1], received ${value}`)
	}
	return value
}

/**
 * Checks whether a value is a plain object (prototype is `Object.prototype` or `null`).
 *
 * @param {unknown} value - Value to inspect.
 * @returns {boolean} True if `value` is a plain object.
 */
function isPlainObject(value) {
	if (value === null || typeof value !== 'object') {
		return false
	}
	const proto = Object.getPrototypeOf(value)
	return proto === Object.prototype || proto === null
}

/**
 * Computes the Zadeh fuzzy logical negation / fuzzy set complement (`1 - μ`)
 * using a straightforward iterative implementation.
 *
 * Supports:
 * - A single fuzzy truth value (`number` in `[0, 1]`) -> returns `1 - μ`.
 * - An `Array<number>` of membership degrees in `[0, 1]` -> returns a new `Array<number>`.
 * - A `Map<K, number>` representing a fuzzy set -> returns a new `Map<K, number>` with the same keys.
 * - A plain object (`Record<string, number>`) representing a fuzzy set -> returns a new plain object
 *   (preserving `null` prototype if present) with the same own enumerable string keys.
 *
 * Input collections are never mutated.
 *
 * @template K
 * @param {number | number[] | Map<K, number> | Record<string, number>} input - Fuzzy truth value or fuzzy set with memberships in `[0, 1]`.
 * @returns {number | number[] | Map<K, number> | Record<string, number>} The Zadeh fuzzy complement (`1 - μ`) matching the input container type.
 * @throws {TypeError} If `input` is not a number, Array, Map, or plain object, or if any membership value is not a number (including sparse array holes).
 * @throws {RangeError} If any membership value is `NaN`, non-finite, less than `0`, or greater than `1`.
 */
export function notFuzzyIterative(input) {
	if (typeof input === 'number') {
		const mu = validateMembership(input, 'Fuzzy membership value')
		return 1 - mu
	}

	if (Array.isArray(input)) {
		const len = input.length
		const result = new Array(len)
		for (let i = 0; i < len; i += 1) {
			if (!(i in input)) {
				throw new TypeError(`Fuzzy membership at index ${i} is missing (sparse array)`)
			}
			const mu = validateMembership(input[i], `Fuzzy membership at index ${i}`)
			result[i] = 1 - mu
		}
		return result
	}

	if (input instanceof Map) {
		const result = new Map()
		for (const [key, value] of input.entries()) {
			const mu = validateMembership(value, `Fuzzy membership for key "${String(key)}"`)
			result.set(key, 1 - mu)
		}
		return result
	}

	if (isPlainObject(input)) {
		const keys = Object.keys(input)
		const result = Object.getPrototypeOf(input) === null ? Object.create(null) : {}
		for (let i = 0; i < keys.length; i += 1) {
			const key = keys[i]
			const mu = validateMembership(input[key], `Fuzzy membership for key "${key}"`)
			Object.defineProperty(result, key, {
				value: 1 - mu,
				enumerable: true,
				writable: true,
				configurable: true,
			})
		}
		return result
	}

	throw new TypeError(
		'Input must be a number in [0, 1], an Array, a Map, or a plain object representing a fuzzy set',
	)
}
