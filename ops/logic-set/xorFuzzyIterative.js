/**
 * Validates that a value is a fuzzy membership degree in the closed interval [0, 1].
 *
 * @param {unknown} value - Candidate membership degree.
 * @param {string} label - Descriptive label for error messages.
 * @returns {number} Validated membership degree in [0, 1].
 * @throws {TypeError} If `value` is not a number or is `NaN`.
 * @throws {RangeError} If `value` is infinite or outside [0, 1].
 */
function validateMembership(value, label) {
	if (typeof value !== 'number' || Number.isNaN(value)) {
		throw new TypeError(`${label} must be a valid number in [0, 1]`)
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(`${label} must be within [0, 1], received ${value}`)
	}
	return value
}

/**
 * Checks whether a value is a plain object (prototype is `Object.prototype` or `null`).
 *
 * @param {unknown} value - Value to inspect.
 * @returns {boolean} True when `value` is a plain object fuzzy set.
 */
function isPlainObject(value) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return false
	}
	const proto = Object.getPrototypeOf(value)
	return proto === Object.prototype || proto === null
}

/**
 * Computes Zadeh fuzzy XOR on two validated scalar membership values:
 * `max(min(a, 1 - b), min(1 - a, b))`.
 *
 * @param {number} a - Membership degree in [0, 1].
 * @param {number} b - Membership degree in [0, 1].
 * @returns {number} Resulting fuzzy membership degree in [0, 1].
 */
function zadehXorScalar(a, b) {
	const left = Math.min(a, 1 - b)
	const right = Math.min(1 - a, b)
	const result = Math.max(left, right)
	return result === 0 ? 0 : result
}

/**
 * Safely assigns a property onto a result object, avoiding prototype mutation for `__proto__`.
 *
 * @param {Record<string, number>} target - Destination object.
 * @param {string} key - Property key.
 * @param {number} value - Membership degree.
 */
function assignKey(target, key, value) {
	if (key === '__proto__') {
		Object.defineProperty(target, key, {
			value,
			enumerable: true,
			writable: true,
			configurable: true,
		})
	} else {
		target[key] = value
	}
}

/**
 * Computes the Zadeh fuzzy logical XOR / fuzzy symmetric difference iteratively
 * over fuzzy membership values, equal-length arrays of membership values, or
 * plain-object fuzzy sets with membership degrees in [0, 1].
 *
 * Uses standard Zadeh operators:
 * - NOT(x) = 1 - x
 * - AND(x, y) = min(x, y)
 * - OR(x, y) = max(x, y)
 * - XOR(a, b) = max(min(a, 1 - b), min(1 - a, b))
 *
 * For plain-object fuzzy sets, absent keys are treated as having membership degree `0`,
 * and the returned object contains the union of own enumerable keys from both sets.
 *
 * @param {number | number[] | Record<string, number>} a - First fuzzy membership value, array, or fuzzy set object.
 * @param {number | number[] | Record<string, number>} b - Second fuzzy membership value, array, or fuzzy set object (must match type of `a`).
 * @returns {number | number[] | Record<string, number>} Zadeh fuzzy XOR result matching the input structure.
 * @throws {TypeError} If inputs have invalid or mismatched types, non-numeric/NaN memberships, or sparse array holes.
 * @throws {RangeError} If any membership value is outside [0, 1] or if array lengths differ.
 */
export function xorFuzzyIterative(a, b) {
	if (typeof a === 'number' && typeof b === 'number') {
		const muA = validateMembership(a, 'a')
		const muB = validateMembership(b, 'b')
		return zadehXorScalar(muA, muB)
	}

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) {
			throw new RangeError(
				`Input arrays must have the same length (received ${a.length} and ${b.length})`
			)
		}

		const result = new Array(a.length)
		for (let i = 0; i < a.length; i += 1) {
			if (!(i in a)) {
				throw new TypeError(`a[${i}] must be a valid number in [0, 1] (sparse hole found)`)
			}
			if (!(i in b)) {
				throw new TypeError(`b[${i}] must be a valid number in [0, 1] (sparse hole found)`)
			}
			const muA = validateMembership(a[i], `a[${i}]`)
			const muB = validateMembership(b[i], `b[${i}]`)
			result[i] = zadehXorScalar(muA, muB)
		}
		return result
	}

	if (isPlainObject(a) && isPlainObject(b)) {
		const result = {}
		const keysA = Object.keys(a)
		const keysB = Object.keys(b)

		for (let i = 0; i < keysA.length; i += 1) {
			const key = keysA[i]
			const muA = validateMembership(a[key], `a.${key}`)
			const muB = Object.hasOwn(b, key)
				? validateMembership(b[key], `b.${key}`)
				: 0
			assignKey(result, key, zadehXorScalar(muA, muB))
		}

		for (let i = 0; i < keysB.length; i += 1) {
			const key = keysB[i]
			if (Object.hasOwn(a, key)) {
				continue
			}
			const muB = validateMembership(b[key], `b.${key}`)
			assignKey(result, key, zadehXorScalar(0, muB))
		}

		return result
	}

	throw new TypeError(
		'Inputs a and b must both be numbers in [0, 1], both be arrays of numbers in [0, 1], or both be plain object fuzzy sets'
	)
}
