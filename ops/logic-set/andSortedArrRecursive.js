/**
 * Default strict-weak-ordering comparator for primitive numbers, bigints, and strings.
 *
 * @template {number | bigint | string} T
 * @param {T} x
 * @param {T} y
 * @returns {-1 | 0 | 1}
 */
function defaultCompare(x, y) {
	if (x < y) return -1
	if (x > y) return 1
	return 0
}

/**
 * Validates that a value is a supported primitive for {@link defaultCompare}
 * and matches the expected primitive type (if already established).
 *
 * @param {unknown} value
 * @param {string | null} expectedType
 * @param {string} label
 * @returns {string}
 */
function validateDefaultElement(value, expectedType, label) {
	const type = typeof value
	if (type !== 'number' && type !== 'bigint' && type !== 'string') {
		throw new TypeError(
			`${label} contains unsupported element type "${type}" for default comparator; expected number, bigint, or string`,
		)
	}
	if (type === 'number' && Number.isNaN(value)) {
		throw new RangeError(`${label} must not contain NaN`)
	}
	if (expectedType !== null && type !== expectedType) {
		throw new TypeError(
			`Mismatched element types ("${expectedType}" vs "${type}") for default comparator`,
		)
	}
	return type
}

/**
 * Calls a comparator and verifies that it returns a non-NaN number.
 *
 * @template T
 * @param {(x: T, y: T) => number} compare
 * @param {T} x
 * @param {T} y
 * @returns {number}
 */
function checkedCompare(compare, x, y) {
	const result = compare(x, y)
	if (typeof result !== 'number' || Number.isNaN(result)) {
		throw new TypeError('Comparator must return a non-NaN number')
	}
	return result
}

/**
 * Validates that `arr` is an array sorted in strictly ascending order
 * (sorted and de-duplicated) with respect to `compare`.
 *
 * @template T
 * @param {unknown} arr
 * @param {string} label
 * @param {(x: T, y: T) => number} compare
 * @param {boolean} useDefault
 * @param {string | null} expectedType
 * @returns {string | null}
 */
function validateSortedUniqueArray(arr, label, compare, useDefault, expectedType) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${label} must be an Array`)
	}

	let elementType = expectedType
	if (useDefault && arr.length > 0) {
		elementType = validateDefaultElement(arr[0], elementType, label)
	}

	for (let i = 1; i < arr.length; i++) {
		if (useDefault) {
			elementType = validateDefaultElement(arr[i], elementType, label)
		}
		const cmp = checkedCompare(compare, arr[i - 1], arr[i])
		if (cmp > 0) {
			throw new RangeError(`${label} must be sorted in ascending order (violation at index ${i})`)
		}
		if (cmp === 0) {
			throw new RangeError(`${label} must be de-duplicated (duplicate at index ${i})`)
		}
	}

	return elementType
}

/**
 * Finds the first index in `arr[start..end)` whose element is `>= target`
 * according to `compare` (lower bound).
 *
 * @template T
 * @param {readonly T[]} arr
 * @param {number} start
 * @param {number} end
 * @param {T} target
 * @param {(x: T, y: T) => number} compare
 * @returns {number}
 */
function lowerBound(arr, start, end, target, compare) {
	let lo = start
	let hi = end
	while (lo < hi) {
		const mid = lo + ((hi - lo) >>> 1)
		if (checkedCompare(compare, arr[mid], target) < 0) {
			lo = mid + 1
		} else {
			hi = mid
		}
	}
	return lo
}

/**
 * Recursive divide-and-conquer merge-style intersection (Baeza-Yates algorithm)
 * over slices `a[aStart..aEnd)` and `b[bStart..bEnd)`.
 *
 * Always splits the smaller active slice at its midpoint and partitions the
 * larger slice via binary search, appending matches in strictly ascending order
 * while keeping recursion depth bounded by O(log(min(|a|, |b|))).
 *
 * @template T
 * @param {readonly T[]} a
 * @param {number} aStart
 * @param {number} aEnd
 * @param {readonly T[]} b
 * @param {number} bStart
 * @param {number} bEnd
 * @param {(x: T, y: T) => number} compare
 * @param {T[]} out
 * @returns {void}
 */
function intersectRecursive(a, aStart, aEnd, b, bStart, bEnd, compare, out) {
	const lenA = aEnd - aStart
	const lenB = bEnd - bStart
	if (lenA <= 0 || lenB <= 0) {
		return
	}

	// Prune completely disjoint value ranges before recursing.
	if (
		checkedCompare(compare, a[aEnd - 1], b[bStart]) < 0 ||
		checkedCompare(compare, b[bEnd - 1], a[aStart]) < 0
	) {
		return
	}

	if (lenA <= lenB) {
		const midA = aStart + (lenA >>> 1)
		const pivot = a[midA]
		const posB = lowerBound(b, bStart, bEnd, pivot, compare)

		intersectRecursive(a, aStart, midA, b, bStart, posB, compare, out)

		let nextBStart = posB
		if (posB < bEnd && checkedCompare(compare, b[posB], pivot) === 0) {
			out.push(pivot)
			nextBStart = posB + 1
		}

		intersectRecursive(a, midA + 1, aEnd, b, nextBStart, bEnd, compare, out)
	} else {
		const midB = bStart + (lenB >>> 1)
		const pivot = b[midB]
		const posA = lowerBound(a, aStart, aEnd, pivot, compare)

		intersectRecursive(a, aStart, posA, b, bStart, midB, compare, out)

		let nextAStart = posA
		if (posA < aEnd && checkedCompare(compare, a[posA], pivot) === 0) {
			// Preserve the matching element from `a`.
			out.push(a[posA])
			nextAStart = posA + 1
		}

		intersectRecursive(a, nextAStart, aEnd, b, midB + 1, bEnd, compare, out)
	}
}

/**
 * Computes the logical AND (set intersection) of two sorted, de-duplicated arrays
 * using a recursive divide-and-conquer merge-style algorithm.
 *
 * Neither input array is mutated. When a custom comparator is provided and two
 * elements compare equal, the element from `a` is placed in the output.
 *
 * Time complexity: O(n + m) for validation, and O(min(n, m) * log(max(n, m) / min(n, m) + 1))
 * for the recursive intersection phase.
 * Recursion stack depth: O(log(min(n, m))).
 *
 * @template T
 * @param {readonly T[]} a - First strictly ascending (sorted, de-duplicated) array.
 * @param {readonly T[]} b - Second strictly ascending (sorted, de-duplicated) array.
 * @param {(x: T, y: T) => number} [compare] - Optional strict weak ordering comparator
 *   returning a negative number if `x < y`, `0` if equal, or a positive number if `x > y`.
 *   Defaults to ascending comparison for homogeneous `number`, `bigint`, or `string` arrays.
 * @returns {T[]} New sorted, de-duplicated array containing elements present in both `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not an array, `compare` is not a function,
 *   the comparator returns a non-number/NaN, or default-comparator elements have
 *   unsupported or mismatched types.
 * @throws {RangeError} If `a` or `b` is not strictly sorted (unsorted or contains duplicates)
 *   or contains `NaN` when using the default comparator.
 */
export function andSortedArrRecursive(a, b, compare) {
	if (compare !== undefined && typeof compare !== 'function') {
		throw new TypeError('compare must be a function when provided')
	}

	const useDefault = compare === undefined
	const cmp = useDefault ? defaultCompare : compare

	let expectedType = validateSortedUniqueArray(a, 'a', cmp, useDefault, null)
	expectedType = validateSortedUniqueArray(b, 'b', cmp, useDefault, expectedType)

	/** @type {T[]} */
	const result = []
	intersectRecursive(a, 0, a.length, b, 0, b.length, cmp, result)
	return result
}
