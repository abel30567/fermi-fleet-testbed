/**
 * Validates that a value is a finite number in the closed unit interval [0, 1].
 *
 * @param {unknown} value - Candidate fuzzy membership value.
 * @param {string} label - Descriptive label for error reporting.
 * @returns {number} Normalized membership value in [0, 1] (-0 normalized to 0).
 * @throws {TypeError} If the value is not a number.
 * @throws {RangeError} If the value is non-finite or outside [0, 1].
 */
function validateMembership(value, label) {
	if (typeof value !== 'number') {
		throw new TypeError(`${label} must be a number in [0, 1], received ${value === null ? 'null' : typeof value}`)
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(`${label} must be a finite number in [0, 1], received ${value}`)
	}
	return value === 0 ? 0 : value
}

/**
 * Checks whether a value is a plain object (prototype is Object.prototype or null).
 *
 * @param {unknown} value - Candidate value to check.
 * @returns {boolean} True if value is a plain object.
 */
function isPlainObject(value) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return false
	}
	const proto = Object.getPrototypeOf(value)
	return proto === Object.prototype || proto === null
}

/**
 * Safely assigns an own enumerable data property on a plain object.
 *
 * @param {Record<string, number>} target - Target plain object.
 * @param {string} key - Property key.
 * @param {number} value - Membership value to assign.
 */
function setOwnProperty(target, key, value) {
	if (key === '__proto__') {
		Object.defineProperty(target, key, {
			value,
			writable: true,
			enumerable: true,
			configurable: true,
		})
	} else {
		target[key] = value
	}
}

/**
 * Computes the Zadeh fuzzy union (`max(a, b, ...)`) iteratively over one or more
 * fuzzy membership representations with degrees in `[0, 1]`.
 *
 * Supports three homogeneous input forms:
 * - Scalar membership numbers in `[0, 1]`: returns their maximum.
 * - Arrays of membership numbers in `[0, 1]` of equal length: returns a new array
 *   containing the element-wise maximum.
 * - Plain object fuzzy sets mapping keys to membership degrees in `[0, 1]`: returns
 *   a new plain object over the union of all keys, treating absent keys as having
 *   implicit membership `0`.
 *
 * @param {...(number | number[] | Record<string, number>)} inputs - One or more fuzzy
 *   values, membership arrays, or plain object fuzzy sets of the same kind.
 * @returns {number | number[] | Record<string, number>} The Zadeh fuzzy union.
 * @throws {TypeError} If no arguments are provided, input types are unsupported or
 *   mismatched, or any membership entry is not a number.
 * @throws {RangeError} If any membership value is non-finite or outside `[0, 1]`,
 *   or if input arrays have differing lengths.
 */
export function unionFuzzyIterative(...inputs) {
	if (inputs.length === 0) {
		throw new TypeError('unionFuzzyIterative requires at least one argument')
	}

	const first = inputs[0]

	if (typeof first === 'number') {
		let maxVal = validateMembership(first, 'argument 0')
		for (let i = 1; i < inputs.length; i++) {
			const val = validateMembership(inputs[i], `argument ${i}`)
			if (val > maxVal) {
				maxVal = val
			}
		}
		return maxVal
	}

	if (Array.isArray(first)) {
		const len = first.length
		for (let k = 1; k < inputs.length; k++) {
			if (!Array.isArray(inputs[k])) {
				throw new TypeError(`argument ${k} must be an array to match argument 0`)
			}
			if (inputs[k].length !== len) {
				throw new RangeError(
					`argument ${k} length (${inputs[k].length}) must match argument 0 length (${len})`,
				)
			}
		}

		const result = new Array(len)
		for (let i = 0; i < len; i++) {
			result[i] = validateMembership(first[i], `argument 0[${i}]`)
		}

		for (let k = 1; k < inputs.length; k++) {
			const current = inputs[k]
			for (let i = 0; i < len; i++) {
				const val = validateMembership(current[i], `argument ${k}[${i}]`)
				if (val > result[i]) {
					result[i] = val
				}
			}
		}

		return result
	}

	if (isPlainObject(first)) {
		for (let k = 1; k < inputs.length; k++) {
			if (!isPlainObject(inputs[k])) {
				throw new TypeError(`argument ${k} must be a plain object to match argument 0`)
			}
		}

		const result = {}
		for (let k = 0; k < inputs.length; k++) {
			const current = inputs[k]
			const keys = Object.keys(current)
			for (let j = 0; j < keys.length; j++) {
				const key = keys[j]
				const val = validateMembership(current[key], `argument ${k}.${key}`)
				if (!Object.hasOwn(result, key) || val > result[key]) {
					setOwnProperty(result, key, val)
				}
			}
		}

		return result
	}

	throw new TypeError(
		'unionFuzzyIterative expects numbers, arrays, or plain objects representing fuzzy sets',
	)
}
