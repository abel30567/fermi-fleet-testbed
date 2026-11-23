/**
 * Zadeh fuzzy AND (minimum t-norm / fuzzy set intersection) implemented using
 * recursive divide-and-conquer.
 *
 * Supported call forms:
 * 1. Scalar fuzzy truth values: `andFuzzyRecursive(a, b, ...)` where every argument
 *    is a finite number in `[0, 1]`. Returns the Zadeh conjunction `min(a, b, ...)`.
 * 2. Single array of fuzzy truth values: `andFuzzyRecursive([v1, v2, ...])` where
 *    the array is non-empty and every element is in `[0, 1]`. Returns `min(v1, v2, ...)`.
 * 3. Multiple fuzzy membership vectors: `andFuzzyRecursive(vec1, vec2, ...)` where
 *    all arguments are arrays of the same length with entries in `[0, 1]`. Returns a
 *    new array containing the pointwise Zadeh intersection.
 * 4. Plain-object fuzzy sets: `andFuzzyRecursive(set1, set2, ...)` where every
 *    argument is a plain object mapping element keys to memberships in `[0, 1]`.
 *    Missing keys are treated as having membership `0`. Returns a new plain object
 *    over the union of keys.
 * 5. Map fuzzy sets: `andFuzzyRecursive(map1, map2, ...)` where every argument is a
 *    `Map` mapping element keys to memberships in `[0, 1]`. Missing keys are treated
 *    as having membership `0`. Returns a new `Map` over the union of keys.
 *
 * @module ops/logic-set/andFuzzyRecursive
 */

/**
 * Validates that a value is a finite fuzzy membership degree in `[0, 1]`.
 * Normalizes `-0` to `0`.
 *
 * @param {unknown} value - Candidate membership degree.
 * @param {string} label - Context label for error messages.
 * @returns {number} Validated membership degree in `[0, 1]`.
 * @throws {TypeError} If `value` is not a number.
 * @throws {RangeError} If `value` is NaN, non-finite, or outside `[0, 1]`.
 */
function validateDegree(value, label) {
	if (typeof value !== 'number') {
		throw new TypeError(`Expected a numeric fuzzy membership degree for ${label}, got ${value === null ? 'null' : typeof value}`)
	}
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(`Expected fuzzy membership degree in [0, 1] for ${label}, got ${value}`)
	}
	return value === 0 ? 0 : value
}

/**
 * Checks whether a value is a plain JavaScript object (`Object.prototype` or `null` prototype).
 *
 * @param {unknown} value - Value to inspect.
 * @returns {boolean} True when `value` is a plain object.
 */
function isPlainObject(value) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false
	}
	const proto = Object.getPrototypeOf(value)
	return proto === Object.prototype || proto === null
}

/**
 * Safely defines an enumerable data property on a plain object (avoiding `__proto__` pitfalls).
 *
 * @param {Record<string, number>} target - Destination object.
 * @param {string} key - Property key.
 * @param {number} value - Membership value.
 */
function defineMembership(target, key, value) {
	Object.defineProperty(target, key, {
		value,
		enumerable: true,
		writable: true,
		configurable: true,
	})
}

/**
 * Divide-and-conquer Zadeh minimum over `values[start..end)`.
 * Validates every element (no short-circuiting) to ensure invalid values are always caught.
 *
 * @param {readonly number[]} values - Array of candidate membership degrees.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {string} labelPrefix - Prefix for validation error messages.
 * @returns {number} Minimum membership degree in `[start, end)`.
 */
function reduceDegreesRecursive(values, start, end, labelPrefix) {
	const len = end - start
	if (len === 1) {
		if (!(start in values)) {
			throw new TypeError(`Sparse array hole at ${labelPrefix}[${start}] is not a valid fuzzy membership degree`)
		}
		return validateDegree(values[start], `${labelPrefix}[${start}]`)
	}
	const mid = start + (len >>> 1)
	const left = reduceDegreesRecursive(values, start, mid, labelPrefix)
	const right = reduceDegreesRecursive(values, mid, end, labelPrefix)
	return left <= right ? left : right
}

/**
 * Divide-and-conquer validation and copy of a single membership vector slice.
 *
 * @param {readonly number[]} source - Input vector.
 * @param {number[]} target - Preallocated output vector.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {number} argIndex - Argument index for error reporting.
 */
function copyValidatedVectorRecursive(source, target, start, end, argIndex) {
	const len = end - start
	if (len === 0) {
		return
	}
	if (len === 1) {
		if (!(start in source)) {
			throw new TypeError(`Sparse array hole at argument ${argIndex}[${start}] is not a valid fuzzy membership degree`)
		}
		target[start] = validateDegree(source[start], `argument ${argIndex}[${start}]`)
		return
	}
	const mid = start + (len >>> 1)
	copyValidatedVectorRecursive(source, target, start, mid, argIndex)
	copyValidatedVectorRecursive(source, target, mid, end, argIndex)
}

/**
 * Divide-and-conquer pointwise Zadeh intersection of two already-validated vectors.
 *
 * @param {readonly number[]} left - Left vector.
 * @param {readonly number[]} right - Right vector.
 * @param {number[]} out - Preallocated output vector.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 */
function intersectTwoVectorsRecursive(left, right, out, start, end) {
	const len = end - start
	if (len === 0) {
		return
	}
	if (len === 1) {
		const a = left[start]
		const b = right[start]
		out[start] = a <= b ? a : b
		return
	}
	const mid = start + (len >>> 1)
	intersectTwoVectorsRecursive(left, right, out, start, mid)
	intersectTwoVectorsRecursive(left, right, out, mid, end)
}

/**
 * Divide-and-conquer Zadeh intersection across `vectors[start..end)`.
 *
 * @param {readonly (readonly number[])[]} vectors - List of membership vectors.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {number} expectedLength - Expected vector length.
 * @returns {number[]} Pointwise intersection vector.
 */
function intersectVectorListRecursive(vectors, start, end, expectedLength) {
	const len = end - start
	if (len === 1) {
		const vec = vectors[start]
		if (!Array.isArray(vec)) {
			throw new TypeError(`Expected an Array at argument ${start}, got ${vec === null ? 'null' : typeof vec}`)
		}
		if (vec.length !== expectedLength) {
			throw new RangeError(`Mismatched fuzzy vector length at argument ${start}: expected ${expectedLength}, got ${vec.length}`)
		}
		const validated = new Array(expectedLength)
		copyValidatedVectorRecursive(vec, validated, 0, expectedLength, start)
		return validated
	}
	const mid = start + (len >>> 1)
	const left = intersectVectorListRecursive(vectors, start, mid, expectedLength)
	const right = intersectVectorListRecursive(vectors, mid, end, expectedLength)
	const out = new Array(expectedLength)
	intersectTwoVectorsRecursive(left, right, out, 0, expectedLength)
	return out
}

/**
 * Divide-and-conquer validation and shallow copy of a plain-object fuzzy set.
 *
 * @param {Record<string, number>} source - Input plain object.
 * @param {readonly string[]} keys - Own enumerable keys of `source`.
 * @param {Record<string, number>} target - Destination plain object.
 * @param {number} start - Inclusive key index.
 * @param {number} end - Exclusive key index.
 * @param {number} argIndex - Argument index for error reporting.
 */
function copyValidatedPlainSetRecursive(source, keys, target, start, end, argIndex) {
	const len = end - start
	if (len === 0) {
		return
	}
	if (len === 1) {
		const key = keys[start]
		const deg = validateDegree(source[key], `argument ${argIndex}["${key}"]`)
		defineMembership(target, key, deg)
		return
	}
	const mid = start + (len >>> 1)
	copyValidatedPlainSetRecursive(source, keys, target, start, mid, argIndex)
	copyValidatedPlainSetRecursive(source, keys, target, mid, end, argIndex)
}

/**
 * Divide-and-conquer Zadeh intersection of two validated plain-object fuzzy sets
 * over the union of their keys (absent key implies membership `0`).
 *
 * @param {Record<string, number>} left - Left fuzzy set.
 * @param {Record<string, number>} right - Right fuzzy set.
 * @param {readonly string[]} keys - Union of keys from `left` and `right`.
 * @param {Record<string, number>} target - Destination plain object.
 * @param {number} start - Inclusive key index.
 * @param {number} end - Exclusive key index.
 */
function intersectTwoPlainSetsRecursive(left, right, keys, target, start, end) {
	const len = end - start
	if (len === 0) {
		return
	}
	if (len === 1) {
		const key = keys[start]
		const a = Object.hasOwn(left, key) ? left[key] : 0
		const b = Object.hasOwn(right, key) ? right[key] : 0
		defineMembership(target, key, a <= b ? a : b)
		return
	}
	const mid = start + (len >>> 1)
	intersectTwoPlainSetsRecursive(left, right, keys, target, start, mid)
	intersectTwoPlainSetsRecursive(left, right, keys, target, mid, end)
}

/**
 * Divide-and-conquer Zadeh intersection across plain-object fuzzy sets `sets[start..end)`.
 *
 * @param {readonly Record<string, number>[]} sets - Plain-object fuzzy sets.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {Record<string, number>} Intersected fuzzy set.
 */
function intersectPlainSetListRecursive(sets, start, end) {
	const len = end - start
	if (len === 1) {
		const setObj = sets[start]
		if (!isPlainObject(setObj)) {
			throw new TypeError(`Expected a plain object fuzzy set at argument ${start}`)
		}
		const keys = Object.keys(setObj)
		const validated = {}
		copyValidatedPlainSetRecursive(setObj, keys, validated, 0, keys.length, start)
		return validated
	}
	const mid = start + (len >>> 1)
	const left = intersectPlainSetListRecursive(sets, start, mid)
	const right = intersectPlainSetListRecursive(sets, mid, end)
	const unionKeys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)]))
	const out = {}
	intersectTwoPlainSetsRecursive(left, right, unionKeys, out, 0, unionKeys.length)
	return out
}

/**
 * Divide-and-conquer validation and copy of a Map fuzzy set.
 *
 * @template K
 * @param {readonly [K, number][]} entries - Entries from the source Map.
 * @param {Map<K, number>} target - Destination Map.
 * @param {number} start - Inclusive entry index.
 * @param {number} end - Exclusive entry index.
 * @param {number} argIndex - Argument index for error reporting.
 */
function copyValidatedMapSetRecursive(entries, target, start, end, argIndex) {
	const len = end - start
	if (len === 0) {
		return
	}
	if (len === 1) {
		const [key, value] = entries[start]
		target.set(key, validateDegree(value, `argument ${argIndex} Map key "${String(key)}"`))
		return
	}
	const mid = start + (len >>> 1)
	copyValidatedMapSetRecursive(entries, target, start, mid, argIndex)
	copyValidatedMapSetRecursive(entries, target, mid, end, argIndex)
}

/**
 * Divide-and-conquer Zadeh intersection of two validated Map fuzzy sets
 * over the union of their keys (absent key implies membership `0`).
 *
 * @template K
 * @param {Map<K, number>} left - Left fuzzy set.
 * @param {Map<K, number>} right - Right fuzzy set.
 * @param {readonly K[]} keys - Union of keys.
 * @param {Map<K, number>} target - Destination Map.
 * @param {number} start - Inclusive key index.
 * @param {number} end - Exclusive key index.
 */
function intersectTwoMapSetsRecursive(left, right, keys, target, start, end) {
	const len = end - start
	if (len === 0) {
		return
	}
	if (len === 1) {
		const key = keys[start]
		const a = left.has(key) ? left.get(key) : 0
		const b = right.has(key) ? right.get(key) : 0
		target.set(key, a <= b ? a : b)
		return
	}
	const mid = start + (len >>> 1)
	intersectTwoMapSetsRecursive(left, right, keys, target, start, mid)
	intersectTwoMapSetsRecursive(left, right, keys, target, mid, end)
}

/**
 * Divide-and-conquer Zadeh intersection across Map fuzzy sets `maps[start..end)`.
 *
 * @template K
 * @param {readonly Map<K, number>[]} maps - List of Map fuzzy sets.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {Map<K, number>} Intersected Map fuzzy set.
 */
function intersectMapListRecursive(maps, start, end) {
	const len = end - start
	if (len === 1) {
		const map = maps[start]
		if (!(map instanceof Map)) {
			throw new TypeError(`Expected a Map fuzzy set at argument ${start}`)
		}
		const entries = Array.from(map.entries())
		const validated = new Map()
		copyValidatedMapSetRecursive(entries, validated, 0, entries.length, start)
		return validated
	}
	const mid = start + (len >>> 1)
	const left = intersectMapListRecursive(maps, start, mid)
	const right = intersectMapListRecursive(maps, mid, end)
	const unionKeys = Array.from(new Set([...left.keys(), ...right.keys()]))
	const out = new Map()
	intersectTwoMapSetsRecursive(left, right, unionKeys, out, 0, unionKeys.length)
	return out
}

/**
 * Computes the Zadeh fuzzy AND (minimum t-norm / fuzzy set intersection)
 * using a recursive divide-and-conquer algorithm.
 *
 * @param {...(number | readonly number[] | Record<string, number> | Map<unknown, number>)} args
 *   One or more fuzzy truth values in `[0, 1]`, a single non-empty array of truth values,
 *   multiple equal-length membership vectors, one or more plain-object fuzzy sets, or
 *   one or more `Map` fuzzy sets.
 * @returns {number | number[] | Record<string, number> | Map<unknown, number>}
 *   The Zadeh fuzzy AND result matching the input form.
 * @throws {TypeError} If called with no arguments, unsupported types, mixed input forms,
 *   non-numeric membership degrees, or sparse arrays.
 * @throws {RangeError} If any membership degree is outside `[0, 1]` (or NaN/Infinite),
 *   if a single array argument is empty, or if multiple membership vectors differ in length.
 */
export function andFuzzyRecursive(...args) {
	if (args.length === 0) {
		throw new TypeError('andFuzzyRecursive requires at least one argument')
	}

	const first = args[0]

	if (typeof first === 'number') {
		return reduceDegreesRecursive(args, 0, args.length, 'argument')
	}

	if (Array.isArray(first)) {
		if (args.length === 1) {
			if (first.length === 0) {
				throw new RangeError('andFuzzyRecursive requires a non-empty array of fuzzy membership degrees')
			}
			return reduceDegreesRecursive(first, 0, first.length, 'degrees')
		}
		return intersectVectorListRecursive(args, 0, args.length, first.length)
	}

	if (first instanceof Map) {
		return intersectMapListRecursive(args, 0, args.length)
	}

	if (isPlainObject(first)) {
		return intersectPlainSetListRecursive(args, 0, args.length)
	}

	throw new TypeError(
		`Unsupported input type for andFuzzyRecursive: expected number, Array, plain object, or Map, got ${first === null ? 'null' : typeof first}`,
	)
}
