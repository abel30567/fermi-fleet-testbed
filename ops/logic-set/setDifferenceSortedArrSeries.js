/**
 * Validates that a value is supported by the default ordering comparator
 * (finite/infinite number excluding NaN, string, or bigint).
 *
 * @param {unknown} value - Element to check.
 * @param {string} label - Parameter label for error messages.
 * @param {number} index - Element index in the array.
 * @returns {'number' | 'string' | 'bigint'} The primitive type of the element.
 * @throws {RangeError} If value is NaN.
 * @throws {TypeError} If value is not a number, string, or bigint.
 */
function validateDefaultElement(value, label, index) {
	const type = typeof value
	if (type === 'number') {
		if (Number.isNaN(value)) {
			throw new RangeError(`${label}[${index}] must not be NaN`)
		}
		return type
	}
	if (type === 'string' || type === 'bigint') {
		return type
	}
	throw new TypeError(
		`${label}[${index}] must be a number, string, or bigint when no custom comparator is provided`
	)
}

/**
 * Default strict-ordering comparator for homogeneous primitives
 * (number, string, or bigint). Uses `<` and `>` rather than subtraction
 * to avoid overflow and `Infinity - Infinity` NaN hazards.
 *
 * @template {number | string | bigint} T
 * @param {T} x - First element.
 * @param {T} y - Second element.
 * @returns {number} -1 if x < y, 1 if x > y, 0 if equal.
 */
function defaultCompare(x, y) {
	if (x < y) return -1
	if (x > y) return 1
	return 0
}

/**
 * Invokes a comparator and validates that its return value is a non-NaN number.
 *
 * @template T
 * @param {(x: T, y: T) => number} cmp - Comparator function.
 * @param {T} x - Left operand.
 * @param {T} y - Right operand.
 * @returns {number} Comparison result.
 * @throws {TypeError} If comparator does not return a non-NaN number.
 */
function invokeCompare(cmp, x, y) {
	const delta = cmp(x, y)
	if (typeof delta !== 'number' || Number.isNaN(delta)) {
		throw new TypeError('Comparator must return a non-NaN number')
	}
	return delta
}

/**
 * Validates that an input is a dense, strictly ascending (sorted and de-duplicated)
 * array under the given comparator.
 *
 * @template T
 * @param {unknown} arr - Candidate array.
 * @param {(x: T, y: T) => number} cmp - Comparator function.
 * @param {boolean} isDefault - Whether the default comparator is active.
 * @param {string} label - Parameter label for error messages.
 * @returns {'number' | 'string' | 'bigint' | null} Element primitive type when `isDefault` is true and array is non-empty, else null.
 * @throws {TypeError} If input is not a dense array, has invalid/mixed types, or comparator returns invalid value.
 * @throws {RangeError} If input contains NaN (with default comparator), duplicates, or out-of-order elements.
 */
function validateSortedUniqueArray(arr, cmp, isDefault, label) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${label} must be an array`)
	}

	let expectedType = null
	for (let i = 0; i < arr.length; i += 1) {
		if (!(i in arr)) {
			throw new TypeError(`${label} must not be a sparse array (hole at index ${i})`)
		}
		if (isDefault) {
			const elemType = validateDefaultElement(arr[i], label, i)
			if (expectedType === null) {
				expectedType = elemType
			} else if (elemType !== expectedType) {
				throw new TypeError(
					`${label} must contain homogeneous element types (found ${elemType}, expected ${expectedType})`
				)
			}
		}
		if (i > 0) {
			const delta = invokeCompare(cmp, arr[i - 1], arr[i])
			if (delta === 0) {
				throw new RangeError(`${label} must be de-duplicated (duplicate at index ${i})`)
			}
			if (delta > 0) {
				throw new RangeError(
					`${label} must be sorted in strictly ascending order (out of order at index ${i})`
				)
			}
		}
	}

	return expectedType
}

/**
 * Computes the sorted set intersection `A ∩ B` using a two-pointer merge scan.
 * Retains elements from `a` where the indicator product `1_A(x) * 1_B(x) = 1`.
 *
 * @template T
 * @param {readonly T[]} a - Strictly sorted, de-duplicated array A.
 * @param {readonly T[]} b - Strictly sorted, de-duplicated array B.
 * @param {(x: T, y: T) => number} cmp - Comparator function.
 * @returns {T[]} Sorted, de-duplicated array representing `A ∩ B`.
 */
function mergeIntersection(a, b, cmp) {
	const result = []
	let i = 0
	let j = 0

	while (i < a.length && j < b.length) {
		const delta = invokeCompare(cmp, a[i], b[j])
		if (delta < 0) {
			i += 1
		} else if (delta > 0) {
			j += 1
		} else {
			result.push(a[i])
			i += 1
			j += 1
		}
	}

	return result
}

/**
 * Computes the sorted symmetric difference `X Δ Y` using a two-pointer merge scan.
 * Retains elements where the Boolean-ring sum `1_X(x) + 1_Y(x) - 2 * 1_X(x) * 1_Y(x) = 1`.
 *
 * @template T
 * @param {readonly T[]} x - Strictly sorted, de-duplicated array X.
 * @param {readonly T[]} y - Strictly sorted, de-duplicated array Y.
 * @param {(x: T, y: T) => number} cmp - Comparator function.
 * @returns {T[]} Sorted, de-duplicated array representing `X Δ Y`.
 */
function mergeSymmetricDifference(x, y, cmp) {
	const result = []
	let i = 0
	let j = 0

	while (i < x.length && j < y.length) {
		const delta = invokeCompare(cmp, x[i], y[j])
		if (delta < 0) {
			result.push(x[i])
			i += 1
		} else if (delta > 0) {
			result.push(y[j])
			j += 1
		} else {
			i += 1
			j += 1
		}
	}

	while (i < x.length) {
		result.push(x[i])
		i += 1
	}
	while (j < y.length) {
		result.push(y[j])
		j += 1
	}

	return result
}

/**
 * Computes the set difference `A \ B` over sorted, de-duplicated arrays using
 * merge-style algorithms derived from the Boolean-ring / indicator-series identity:
 *
 *   1_{A \ B}(x) = 1_A(x) * (1 - 1_B(x))
 *                = 1_A(x) - 1_A(x) * 1_B(x)
 *                = 1_A(x) + 1_{A ∩ B}(x) - 2 * 1_A(x) * 1_{A ∩ B}(x)
 *                = 1_{A Δ (A ∩ B)}(x)
 *
 * Therefore `A \ B = A Δ (A ∩ B)`, evaluated in `O(|A| + |B|)` time via two linear
 * merge passes (`mergeIntersection` followed by `mergeSymmetricDifference`).
 *
 * Neither input array is mutated; the returned array is a fresh, strictly ascending,
 * de-duplicated array preserving element references from `a`.
 *
 * @template T
 * @param {readonly T[]} a - Strictly sorted, de-duplicated minuend set `A`.
 * @param {readonly T[]} b - Strictly sorted, de-duplicated subtrahend set `B`.
 * @param {(x: T, y: T) => number} [compare] - Optional strict-order comparator returning
 *   a negative number if `x < y`, `0` if equal, or a positive number if `x > y`.
 *   Defaults to ascending primitive comparison for homogeneous numbers (excluding `NaN`),
 *   strings, or bigints.
 * @returns {T[]} A new strictly sorted, de-duplicated array representing `A \ B`.
 * @throws {TypeError} If `a` or `b` is not a dense array, `compare` is neither omitted
 *   nor a function, comparator returns a non-number/NaN, or default elements are unsupported/mixed.
 * @throws {RangeError} If `a` or `b` contains `NaN` (with default comparator), duplicate
 *   elements, or elements not in strictly ascending order under `compare`.
 */
export function setDifferenceSortedArrSeries(a, b, compare) {
	if (compare !== undefined && typeof compare !== 'function') {
		throw new TypeError('compare must be a function when provided')
	}

	const isDefault = compare === undefined
	const cmp = isDefault ? defaultCompare : compare

	const typeA = validateSortedUniqueArray(a, cmp, isDefault, 'a')
	const typeB = validateSortedUniqueArray(b, cmp, isDefault, 'b')

	if (isDefault && typeA !== null && typeB !== null && typeA !== typeB) {
		throw new TypeError(
			`a and b must have matching element types when no custom comparator is provided (got ${typeA} and ${typeB})`
		)
	}

	// Boolean-ring identity: A \ B = A Δ (A ∩ B)
	const intersection = mergeIntersection(a, b, cmp)
	return mergeSymmetricDifference(a, intersection, cmp)
}
