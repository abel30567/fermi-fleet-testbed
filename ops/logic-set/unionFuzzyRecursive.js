/**
 * Validates that a value is a plain object representing a fuzzy set whose
 * own enumerable membership degrees are all finite numbers in [0, 1].
 *
 * @param {unknown} set - Candidate fuzzy set.
 * @param {number} index - Argument position for error messages.
 * @returns {Record<string, number>} The validated fuzzy set.
 * @throws {TypeError} If `set` is not a plain object or any membership value is not a number.
 * @throws {RangeError} If any membership value is not finite or lies outside [0, 1].
 */
function validateFuzzySet(set, index) {
	if (set === null || typeof set !== 'object' || Array.isArray(set)) {
		throw new TypeError(
			`Expected fuzzy set at argument ${index} to be a plain object`,
		)
	}

	const proto = Object.getPrototypeOf(set)
	if (proto !== Object.prototype && proto !== null) {
		throw new TypeError(
			`Expected fuzzy set at argument ${index} to be a plain object`,
		)
	}

	for (const key of Object.keys(set)) {
		const value = set[key]
		if (typeof value !== 'number') {
			throw new TypeError(
				`Expected membership value for key "${key}" at argument ${index} to be a number`,
			)
		}
		if (!Number.isFinite(value) || value < 0 || value > 1) {
			throw new RangeError(
				`Expected membership value for key "${key}" at argument ${index} to be a finite number in [0, 1], got ${value}`,
			)
		}
	}

	return set
}

/**
 * Safely defines all own enumerable properties of `source` onto `target`.
 *
 * @param {Record<string, number>} target
 * @param {Record<string, number>} source
 * @returns {Record<string, number>}
 */
function mergeDisjointObjects(target, source) {
	for (const key of Object.keys(source)) {
		Object.defineProperty(target, key, {
			value: source[key],
			writable: true,
			enumerable: true,
			configurable: true,
		})
	}
	return target
}

/**
 * Normalizes a membership value in [0, 1] (converts -0 to +0).
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeDegree(value) {
	return value === 0 ? 0 : value
}

/**
 * Divide-and-conquer Zadeh union (`max`) across a slice `[start, end)` of keys.
 *
 * @param {string[]} keys - Deduplicated union of keys from `a` and `b`.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {Record<string, number>} a - First validated fuzzy set.
 * @param {Record<string, number>} b - Second validated fuzzy set.
 * @returns {Record<string, number>} Fuzzy set for the key slice.
 */
function unionKeysRecursive(keys, start, end, a, b) {
	if (start >= end) {
		return {}
	}
	if (end - start === 1) {
		const key = keys[start]
		const muA = Object.hasOwn(a, key) ? a[key] : 0
		const muB = Object.hasOwn(b, key) ? b[key] : 0
		const result = {}
		Object.defineProperty(result, key, {
			value: normalizeDegree(Math.max(muA, muB)),
			writable: true,
			enumerable: true,
			configurable: true,
		})
		return result
	}

	const mid = start + ((end - start) >> 1)
	const left = unionKeysRecursive(keys, start, mid, a, b)
	const right = unionKeysRecursive(keys, mid, end, a, b)
	return mergeDisjointObjects(left, right)
}

/**
 * Computes the Zadeh fuzzy union of two validated fuzzy sets using
 * divide-and-conquer recursion over their combined key universe.
 *
 * @param {Record<string, number>} a
 * @param {Record<string, number>} b
 * @returns {Record<string, number>}
 */
function unionPairRecursive(a, b) {
	const keySet = new Set(Object.keys(a))
	for (const key of Object.keys(b)) {
		keySet.add(key)
	}
	const keys = Array.from(keySet)
	return unionKeysRecursive(keys, 0, keys.length, a, b)
}

/**
 * Divide-and-conquer Zadeh fuzzy union over a slice `[start, end)` of fuzzy sets.
 *
 * @param {Array<Record<string, number>>} sets
 * @param {number} start
 * @param {number} end
 * @returns {Record<string, number>}
 */
function unionSetsRecursive(sets, start, end) {
	if (start >= end) {
		return {}
	}
	if (end - start === 1) {
		const validated = validateFuzzySet(sets[start], start)
		const keys = Object.keys(validated)
		return unionKeysRecursive(keys, 0, keys.length, validated, validated)
	}

	const mid = start + ((end - start) >> 1)
	const left = unionSetsRecursive(sets, start, mid)
	const right = unionSetsRecursive(sets, mid, end)
	return unionPairRecursive(left, right)
}

/**
 * Computes the Zadeh fuzzy set union over one or more fuzzy sets using a
 * recursive divide-and-conquer strategy (both across input sets and across
 * element keys).
 *
 * Each fuzzy set is represented as a plain object mapping element keys to
 * membership degrees in the closed interval `[0, 1]`. Missing elements are
 * treated as having membership degree `0`. For each element `x` in the union
 * of keys, the resulting membership degree is:
 *
 *     mu(A ∪ B)(x) = max(mu_A(x), mu_B(x))
 *
 * Calling with zero arguments returns the empty fuzzy set `{}` (the identity
 * element of fuzzy union). Input objects are never mutated.
 *
 * @param {...Record<string, number>} sets - Fuzzy sets with finite membership degrees in `[0, 1]`.
 * @returns {Record<string, number>} New fuzzy set representing the Zadeh union of all inputs.
 * @throws {TypeError} If any argument is not a plain object or any membership value is not a number.
 * @throws {RangeError} If any membership value is not finite or outside `[0, 1]`.
 */
export function unionFuzzyRecursive(...sets) {
	return unionSetsRecursive(sets, 0, sets.length)
}
