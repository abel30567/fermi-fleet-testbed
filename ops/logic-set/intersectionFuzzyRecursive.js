/**
 * Checks whether a value is a plain object (created via `{}` or `Object.create(null)`).
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

/**
 * Validates that a candidate fuzzy set is a plain object whose own enumerable
 * membership degrees are all finite numbers in the closed interval [0, 1].
 *
 * @param {unknown} set
 * @param {number} index
 * @throws {TypeError} If `set` is not a plain object or any membership degree is not a finite number.
 * @throws {RangeError} If any membership degree is outside [0, 1].
 */
function validateFuzzySet(set, index) {
	if (!isPlainObject(set)) {
		throw new TypeError(
			`Expected fuzzy set at argument ${index} to be a plain object`,
		)
	}
	for (const key of Object.keys(set)) {
		const degree = set[key]
		if (typeof degree !== 'number' || !Number.isFinite(degree)) {
			throw new TypeError(
				`Invalid membership degree for key "${key}" in fuzzy set ${index}: expected a finite number`,
			)
		}
		if (degree < 0 || degree > 1) {
			throw new RangeError(
				`Invalid membership degree ${degree} for key "${key}" in fuzzy set ${index}: must be in [0, 1]`,
			)
		}
	}
}

/**
 * Safely defines an own enumerable data property on a plain object.
 *
 * @param {Record<string, number>} target
 * @param {string} key
 * @param {number} value
 */
function setOwnProperty(target, key, value) {
	Object.defineProperty(target, key, {
		value: value === 0 ? 0 : value,
		enumerable: true,
		writable: true,
		configurable: true,
	})
}

/**
 * Merges own enumerable properties from `source` into `target`.
 *
 * @param {Record<string, number>} target
 * @param {Record<string, number>} source
 * @returns {Record<string, number>}
 */
function mergeInto(target, source) {
	for (const key of Object.keys(source)) {
		setOwnProperty(target, key, source[key])
	}
	return target
}

/**
 * Divide-and-conquer Zadeh intersection over a slice `[start, end)` of keys
 * from `primary`, retaining keys also owned by `secondary` with membership
 * `Math.min(primary[k], secondary[k])`.
 *
 * @param {string[]} keys
 * @param {number} start
 * @param {number} end
 * @param {Record<string, number>} primary
 * @param {Record<string, number>} secondary
 * @returns {Record<string, number>}
 */
function intersectKeysDivideAndConquer(keys, start, end, primary, secondary) {
	if (start >= end) {
		return {}
	}
	if (end - start === 1) {
		const key = keys[start]
		const result = {}
		if (Object.hasOwn(secondary, key)) {
			setOwnProperty(result, key, Math.min(primary[key], secondary[key]))
		}
		return result
	}
	const mid = (start + end) >>> 1
	const left = intersectKeysDivideAndConquer(keys, start, mid, primary, secondary)
	const right = intersectKeysDivideAndConquer(keys, mid, end, primary, secondary)
	return mergeInto(left, right)
}

/**
 * Computes the Zadeh intersection of two validated fuzzy sets using
 * divide-and-conquer recursion over the smaller key set.
 *
 * @param {Record<string, number>} setA
 * @param {Record<string, number>} setB
 * @returns {Record<string, number>}
 */
function intersectPair(setA, setB) {
	const keysA = Object.keys(setA)
	const keysB = Object.keys(setB)
	if (keysA.length <= keysB.length) {
		return intersectKeysDivideAndConquer(keysA, 0, keysA.length, setA, setB)
	}
	return intersectKeysDivideAndConquer(keysB, 0, keysB.length, setB, setA)
}

/**
 * Divide-and-conquer cloning of a single validated fuzzy set over `[start, end)`.
 *
 * @param {string[]} keys
 * @param {number} start
 * @param {number} end
 * @param {Record<string, number>} set
 * @returns {Record<string, number>}
 */
function cloneDivideAndConquer(keys, start, end, set) {
	if (start >= end) {
		return {}
	}
	if (end - start === 1) {
		const key = keys[start]
		const result = {}
		setOwnProperty(result, key, set[key])
		return result
	}
	const mid = (start + end) >>> 1
	const left = cloneDivideAndConquer(keys, start, mid, set)
	const right = cloneDivideAndConquer(keys, mid, end, set)
	return mergeInto(left, right)
}

/**
 * Divide-and-conquer Zadeh intersection over a slice `[start, end)` of fuzzy sets.
 *
 * @param {Record<string, number>[]} sets
 * @param {number} start
 * @param {number} end
 * @returns {Record<string, number>}
 */
function intersectSetsDivideAndConquer(sets, start, end) {
	const count = end - start
	if (count === 1) {
		const single = sets[start]
		const keys = Object.keys(single)
		return cloneDivideAndConquer(keys, 0, keys.length, single)
	}
	if (count === 2) {
		return intersectPair(sets[start], sets[start + 1])
	}
	const mid = (start + end) >>> 1
	const left = intersectSetsDivideAndConquer(sets, start, mid)
	const right = intersectSetsDivideAndConquer(sets, mid, end)
	return intersectPair(left, right)
}

/**
 * Computes the Zadeh fuzzy set intersection (`min` t-norm) of one or more fuzzy
 * sets using a recursive divide-and-conquer algorithm across both the input
 * sets and their key spaces.
 *
 * Each fuzzy set is represented as a plain object mapping element keys to
 * membership degrees in the closed interval `[0, 1]`. Elements absent from any
 * input set have an implicit membership degree of `0` and are omitted from the
 * returned intersection; keys present in all input sets receive membership
 * `min(μ₁(x), μ₂(x), ..., μₙ(x))`.
 *
 * @param {...Record<string, number>} sets - One or more fuzzy sets with membership degrees in `[0, 1]`.
 * @returns {Record<string, number>} A new plain object representing the fuzzy intersection.
 * @throws {RangeError} If no sets are provided or if any membership degree is outside `[0, 1]`.
 * @throws {TypeError} If any argument is not a plain object or any membership degree is not a finite number.
 *
 * @example
 * intersectionFuzzyRecursive({ a: 0.8, b: 0.3 }, { a: 0.5, b: 0.9, c: 1 })
 * // => { a: 0.5, b: 0.3 }
 */
export function intersectionFuzzyRecursive(...sets) {
	if (sets.length === 0) {
		throw new RangeError(
			'intersectionFuzzyRecursive requires at least one fuzzy set',
		)
	}
	for (let i = 0; i < sets.length; i++) {
		validateFuzzySet(sets[i], i)
	}
	return intersectSetsDivideAndConquer(sets, 0, sets.length)
}
