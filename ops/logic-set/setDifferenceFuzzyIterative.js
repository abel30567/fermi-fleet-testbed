/**
 * Zadeh fuzzy set difference (`A \ B = A ∩ ¬B`) implemented iteratively.
 *
 * For membership degrees `a, b ∈ [0, 1]`, the Zadeh fuzzy set difference is
 * defined as `min(a, 1 - b)`.
 *
 * Supported input pairs (both operands must share the same representation):
 * - Scalar membership values (`number`, `number`) in `[0, 1]`
 * - Equal-length membership arrays (`number[]`, `number[]`) with entries in `[0, 1]`
 * - Plain object fuzzy sets (`Record<string, number>`, `Record<string, number>`)
 *   with own enumerable values in `[0, 1]`; keys absent from one operand have
 *   implicit membership `0`, and the returned object contains the combined key
 *   universe `keys(a) ∪ keys(b)`.
 *
 * @module ops/logic-set/setDifferenceFuzzyIterative
 */

/**
 * Checks whether a value is a plain object (`Object.prototype` or `null` prototype).
 *
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false
	}
	const proto = Object.getPrototypeOf(value)
	return proto === Object.prototype || proto === null
}

/**
 * Validates that a value is a finite number within the closed interval `[0, 1]`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function assertMembership(value, label) {
	if (typeof value !== 'number') {
		throw new TypeError(`${label} must be a number in [0, 1]`)
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(`${label} must be a finite number in [0, 1], received ${value}`)
	}
	return value === 0 ? 0 : value
}

/**
 * Computes scalar Zadeh fuzzy difference `min(a, 1 - b)` for validated values in `[0, 1]`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function zadehDifferenceScalar(a, b) {
	const complementB = 1 - b
	const result = a < complementB ? a : complementB
	return result === 0 ? 0 : result
}

/**
 * Safely defines an own enumerable data property on a target object.
 *
 * @param {Record<string, number>} target
 * @param {string} key
 * @param {number} value
 */
function defineEntry(target, key, value) {
	Object.defineProperty(target, key, {
		value,
		enumerable: true,
		writable: true,
		configurable: true,
	})
}

/**
 * Computes the Zadeh fuzzy set difference `A \ B` (`min(a, 1 - b)`) using a
 * straightforward iterative implementation.
 *
 * @overload
 * @param {number} a - Fuzzy membership value in `[0, 1]`.
 * @param {number} b - Fuzzy membership value in `[0, 1]`.
 * @returns {number} Fuzzy difference membership value in `[0, 1]`.
 */
/**
 * @overload
 * @param {number[]} a - Array of fuzzy membership values in `[0, 1]`.
 * @param {number[]} b - Array of fuzzy membership values in `[0, 1]` of the same length as `a`.
 * @returns {number[]} New array of element-wise fuzzy difference values in `[0, 1]`.
 */
/**
 * @overload
 * @param {Record<string, number>} a - Plain object mapping element keys to membership degrees in `[0, 1]`.
 * @param {Record<string, number>} b - Plain object mapping element keys to membership degrees in `[0, 1]`.
 * @returns {Record<string, number>} New plain object mapping each key in `keys(a) ∪ keys(b)` to its fuzzy difference in `[0, 1]`.
 */
/**
 * @param {number | number[] | Record<string, number>} a
 * @param {number | number[] | Record<string, number>} b
 * @returns {number | number[] | Record<string, number>}
 * @throws {TypeError} If inputs are missing, unsupported types, mismatched types, or contain non-numeric memberships.
 * @throws {RangeError} If any membership is non-finite or outside `[0, 1]`, or if array inputs have different lengths.
 */
export function setDifferenceFuzzyIterative(a, b) {
	if (typeof a === 'number' && typeof b === 'number') {
		const validA = assertMembership(a, 'a')
		const validB = assertMembership(b, 'b')
		return zadehDifferenceScalar(validA, validB)
	}

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) {
			throw new RangeError(`Array inputs must have equal length (received ${a.length} and ${b.length})`)
		}
		const result = new Array(a.length)
		for (let i = 0; i < a.length; i++) {
			if (!Object.hasOwn(a, i)) {
				throw new TypeError(`a[${i}] must be a number in [0, 1]`)
			}
			if (!Object.hasOwn(b, i)) {
				throw new TypeError(`b[${i}] must be a number in [0, 1]`)
			}
			const validA = assertMembership(a[i], `a[${i}]`)
			const validB = assertMembership(b[i], `b[${i}]`)
			result[i] = zadehDifferenceScalar(validA, validB)
		}
		return result
	}

	if (isPlainObject(a) && isPlainObject(b)) {
		const result = {}
		const keysA = Object.keys(a)
		for (let i = 0; i < keysA.length; i++) {
			const key = keysA[i]
			const validA = assertMembership(a[key], `a[${JSON.stringify(key)}]`)
			const validB = Object.hasOwn(b, key)
				? assertMembership(b[key], `b[${JSON.stringify(key)}]`)
				: 0
			defineEntry(result, key, zadehDifferenceScalar(validA, validB))
		}

		const keysB = Object.keys(b)
		for (let i = 0; i < keysB.length; i++) {
			const key = keysB[i]
			if (!Object.hasOwn(a, key)) {
				const validB = assertMembership(b[key], `b[${JSON.stringify(key)}]`)
				defineEntry(result, key, zadehDifferenceScalar(0, validB))
			}
		}

		return result
	}

	throw new TypeError(
		'Inputs a and b must both be numbers in [0, 1], arrays of numbers in [0, 1], or plain object fuzzy sets'
	)
}
