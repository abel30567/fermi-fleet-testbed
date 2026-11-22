/**
 * @fileoverview Recursive divide-and-conquer Zadeh fuzzy set difference.
 */

/**
 * Checks whether a value is a plain object (standard object literal or null-prototype object).
 *
 * @param {unknown} value
 * @returns {value is Record<string, number>}
 */
function isPlainObject(value) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return false
	}
	const proto = Object.getPrototypeOf(value)
	return proto === Object.prototype || proto === null
}

/**
 * Validates that a single membership value is a finite number in [0, 1].
 *
 * @param {unknown} value
 * @param {string} key
 * @param {string} setName
 */
function validateMembership(value, key, setName) {
	if (typeof value !== 'number') {
		throw new TypeError(
			`${setName}["${key}"] must be a finite number in [0, 1], received ${typeof value}`
		)
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(
			`${setName}["${key}"] must be a finite number in [0, 1], received ${value}`
		)
	}
}

/**
 * Recursively validates all entries in a fuzzy set over the slice [start, end)
 * using divide-and-conquer.
 *
 * @param {Record<string, unknown>} set
 * @param {string[]} keys
 * @param {number} start
 * @param {number} end
 * @param {string} setName
 */
function validateEntriesRecursive(set, keys, start, end, setName) {
	const len = end - start
	if (len <= 0) {
		return
	}
	if (len === 1) {
		const key = keys[start]
		validateMembership(set[key], key, setName)
		return
	}
	const mid = start + Math.floor(len / 2)
	validateEntriesRecursive(set, keys, start, mid, setName)
	validateEntriesRecursive(set, keys, mid, end, setName)
}

/**
 * Safely defines an own enumerable property on a target object without triggering
 * prototype setters (e.g., for keys like "__proto__").
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
 * Merges two disjoint partial fuzzy-set objects into a new plain object.
 *
 * @param {Record<string, number>} left
 * @param {Record<string, number>} right
 * @returns {Record<string, number>}
 */
function mergeDisjoint(left, right) {
	const merged = {}
	for (const key of Object.keys(left)) {
		defineEntry(merged, key, left[key])
	}
	for (const key of Object.keys(right)) {
		defineEntry(merged, key, right[key])
	}
	return merged
}

/**
 * Divide-and-conquer recursive computation of Zadeh fuzzy set difference
 * over `keysA[start..end)`.
 *
 * @param {string[]} keysA
 * @param {number} start
 * @param {number} end
 * @param {Record<string, number>} setA
 * @param {Record<string, number>} setB
 * @returns {Record<string, number>}
 */
function differenceRange(keysA, start, end, setA, setB) {
	const len = end - start
	if (len <= 0) {
		return {}
	}
	if (len === 1) {
		const key = keysA[start]
		const muA = setA[key]
		const muB = Object.hasOwn(setB, key) ? setB[key] : 0
		const degree = Math.min(muA, 1 - muB)
		const result = {}
		if (degree > 0) {
			defineEntry(result, key, degree)
		}
		return result
	}
	const mid = start + Math.floor(len / 2)
	const left = differenceRange(keysA, start, mid, setA, setB)
	const right = differenceRange(keysA, mid, end, setA, setB)
	return mergeDisjoint(left, right)
}

/**
 * Computes the Zadeh fuzzy set difference `A \ B` using a recursive
 * divide-and-conquer algorithm.
 *
 * For each element `x`, the resulting membership degree is defined by the
 * standard Zadeh intersection with complement:
 *
 *     μ_{A \ B}(x) = min(μ_A(x), 1 - μ_B(x))
 *
 * Absent keys are treated as having membership `0`. The returned fuzzy set is
 * in canonical support form: only keys with strictly positive resulting
 * membership (`degree > 0`) are included. Input objects are not mutated.
 *
 * @param {Record<string, number>} setA - Minuend fuzzy set mapping element keys to membership degrees in [0, 1].
 * @param {Record<string, number>} setB - Subtrahend fuzzy set mapping element keys to membership degrees in [0, 1].
 * @returns {Record<string, number>} New plain object representing `A \ B` containing all keys with positive membership in (0, 1].
 * @throws {TypeError} If `setA` or `setB` is not a plain object, or if any membership value is not a number.
 * @throws {RangeError} If any membership value in `setA` or `setB` is not a finite number within [0, 1].
 */
export function setDifferenceFuzzyRecursive(setA, setB) {
	if (!isPlainObject(setA)) {
		throw new TypeError('setA must be a plain object mapping keys to membership values in [0, 1]')
	}
	if (!isPlainObject(setB)) {
		throw new TypeError('setB must be a plain object mapping keys to membership values in [0, 1]')
	}

	const keysA = Object.keys(setA)
	const keysB = Object.keys(setB)

	validateEntriesRecursive(setA, keysA, 0, keysA.length, 'setA')
	validateEntriesRecursive(setB, keysB, 0, keysB.length, 'setB')

	return differenceRange(keysA, 0, keysA.length, setA, setB)
}
