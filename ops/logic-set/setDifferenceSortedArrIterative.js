const SUPPORTED_DEFAULT_TYPES = new Set(['number', 'string', 'bigint', 'boolean'])

/**
 * Default strict-order comparator for homogeneous primitive values
 * (`number`, `string`, `bigint`, or `boolean`).
 *
 * @template T
 * @param {T} x
 * @param {T} y
 * @returns {number} `-1` if `x < y`, `1` if `x > y`, or `0` if equal.
 */
function defaultCompare(x, y) {
	if (x < y) return -1
	if (x > y) return 1
	return 0
}

/**
 * Invokes a comparator function and validates that it returns a non-NaN number.
 *
 * @template T
 * @param {(x: T, y: T) => number} comparator
 * @param {T} x
 * @param {T} y
 * @returns {number}
 * @throws {TypeError} If `comparator` does not return a number.
 * @throws {RangeError} If `comparator` returns `NaN`.
 */
function invokeCompare(comparator, x, y) {
	const result = comparator(x, y)
	if (typeof result !== 'number') {
		throw new TypeError(`Comparator must return a number, received ${typeof result}`)
	}
	if (Number.isNaN(result)) {
		throw new RangeError('Comparator must not return NaN')
	}
	return result
}

/**
 * Validates that an element is eligible for default comparison and type-compatible
 * with previously seen elements.
 *
 * @param {unknown} value
 * @param {string | null} expectedType
 * @param {string} arrayName
 * @param {number} index
 * @returns {string}
 * @throws {TypeError} If the element has an unsupported or mismatched type.
 * @throws {RangeError} If the element is `NaN`.
 */
function validateDefaultElement(value, expectedType, arrayName, index) {
	const valueType = typeof value
	if (!SUPPORTED_DEFAULT_TYPES.has(valueType)) {
		throw new TypeError(
			`${arrayName}[${index}] has unsupported type "${valueType}" for default comparison; provide a custom compare function`,
		)
	}
	if (valueType === 'number' && Number.isNaN(value)) {
		throw new RangeError(`${arrayName}[${index}] must not be NaN`)
	}
	if (expectedType !== null && valueType !== expectedType) {
		throw new TypeError(
			`Cannot compare incompatible element types "${expectedType}" and "${valueType}" without a custom compare function`,
		)
	}
	return valueType
}

/**
 * Validates that an input array is dense, element-valid, strictly sorted, and de-duplicated.
 *
 * @template T
 * @param {readonly T[]} arr
 * @param {string} arrayName
 * @param {(x: T, y: T) => number} comparator
 * @param {boolean} useDefault
 * @param {string | null} initialType
 * @returns {string | null}
 * @throws {TypeError} If the array is sparse or contains invalid element types.
 * @throws {RangeError} If the array is unsorted, contains duplicates, or contains `NaN`.
 */
function validateSortedUniqueArray(arr, arrayName, comparator, useDefault, initialType) {
	let expectedType = initialType

	for (let k = 0; k < arr.length; k += 1) {
		if (!(k in arr)) {
			throw new TypeError(`${arrayName} must not be a sparse array (missing index ${k})`)
		}
		if (useDefault) {
			expectedType = validateDefaultElement(arr[k], expectedType, arrayName, k)
		}
		if (k > 0) {
			const order = invokeCompare(comparator, arr[k - 1], arr[k])
			if (order > 0) {
				throw new RangeError(
					`${arrayName} must be sorted in strictly ascending order (out of order at index ${k})`,
				)
			}
			if (order === 0) {
				throw new RangeError(
					`${arrayName} must be de-duplicated (duplicate element at index ${k})`,
				)
			}
		}
	}

	return expectedType
}

/**
 * Computes the set difference `a \ b` (elements present in `a` but not in `b`)
 * over two sorted, de-duplicated arrays using an iterative two-pointer merge scan.
 *
 * Both input arrays must be dense, strictly sorted according to `compare`, and
 * free of duplicate elements. Neither input array is mutated.
 *
 * Time complexity: O(|a| + |b|).
 * Auxiliary space complexity: O(1) beyond the returned result array.
 *
 * @template T
 * @param {readonly T[]} a - Sorted, de-duplicated minuend array.
 * @param {readonly T[]} b - Sorted, de-duplicated subtrahend array.
 * @param {(x: T, y: T) => number} [compare] - Optional strict-order comparator returning a
 *   negative number if `x < y`, `0` if `x` and `y` are equivalent, or a positive number if `x > y`.
 *   Defaults to standard `<` / `>` ordering over homogeneous `number` (non-NaN), `string`,
 *   `bigint`, or `boolean` elements.
 * @returns {T[]} A new sorted, de-duplicated array containing every element in `a` not in `b`.
 * @throws {TypeError} If `a` or `b` is not an array, if either array is sparse, if `compare` is
 *   provided and not a function, if `compare` returns a non-number, or if default comparison
 *   encounters unsupported or mismatched element types.
 * @throws {RangeError} If `a` or `b` is not strictly sorted in ascending order, contains
 *   duplicate elements, contains `NaN` under default comparison, or if `compare` returns `NaN`.
 */
export function setDifferenceSortedArrIterative(a, b, compare) {
	if (!Array.isArray(a)) {
		throw new TypeError('Expected first argument "a" to be an array')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Expected second argument "b" to be an array')
	}
	if (compare !== undefined && typeof compare !== 'function') {
		throw new TypeError('Expected third argument "compare" to be a function')
	}

	const useDefault = compare === undefined
	const comparator = useDefault ? defaultCompare : compare

	const expectedType = validateSortedUniqueArray(a, 'a', comparator, useDefault, null)
	validateSortedUniqueArray(b, 'b', comparator, useDefault, expectedType)

	const result = []
	let i = 0
	let j = 0

	while (i < a.length && j < b.length) {
		const cmp = invokeCompare(comparator, a[i], b[j])
		if (cmp < 0) {
			result.push(a[i])
			i += 1
		} else if (cmp > 0) {
			j += 1
		} else {
			i += 1
			j += 1
		}
	}

	while (i < a.length) {
		result.push(a[i])
		i += 1
	}

	return result
}
