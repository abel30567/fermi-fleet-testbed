/**
 * Default strict-weak-ordering comparator for ascending order.
 * Supports numbers (excluding NaN), strings, BigInts, and other orderable values.
 *
 * @template T
 * @param {T} x
 * @param {T} y
 * @returns {number}
 */
function defaultCompare(x, y) {
	if (Number.isNaN(x) || Number.isNaN(y)) {
		throw new RangeError('Elements must not be NaN when using the default comparator')
	}
	if (x < y) return -1
	if (x > y) return 1
	if (x <= y && x >= y) return 0
	throw new TypeError('Elements are not comparable with the default comparator')
}

/**
 * Invokes the comparator and validates its return value.
 *
 * @template T
 * @param {(x: T, y: T) => number} compare
 * @param {T} x
 * @param {T} y
 * @returns {number}
 */
function safeCompare(compare, x, y) {
	const diff = compare(x, y)
	if (typeof diff !== 'number' || Number.isNaN(diff)) {
		throw new TypeError('Comparator must return a non-NaN number')
	}
	return diff
}

/**
 * Validates that an input is a dense, sorted, de-duplicated array under `compare`.
 *
 * @template T
 * @param {unknown} arr
 * @param {string} name
 * @param {(x: T, y: T) => number} compare
 */
function validateSortedUniqueArray(arr, name, compare) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${name} must be an array`)
	}
	for (let i = 0; i < arr.length; i++) {
		if (!(i in arr)) {
			throw new TypeError(`${name} must not be a sparse array`)
		}
		if (i === 0) {
			const selfCmp = safeCompare(compare, arr[0], arr[0])
			if (selfCmp !== 0) {
				throw new RangeError(`${name} contains an element that violates comparator reflexivity`)
			}
		} else {
			const diff = safeCompare(compare, arr[i - 1], arr[i])
			if (diff > 0) {
				throw new RangeError(`${name} must be sorted in ascending order`)
			}
			if (diff === 0) {
				throw new RangeError(`${name} must be de-duplicated (strictly ascending)`)
			}
		}
	}
}

/**
 * Computes the set union of two sorted, de-duplicated arrays using a
 * straightforward iterative two-pointer merge algorithm.
 *
 * Does not mutate either input array. When elements compare equal according to
 * `compare`, the element from `a` is kept (left-biased).
 *
 * Time complexity: O(a.length + b.length)
 * Space complexity: O(a.length + b.length) for the returned array, O(1) auxiliary
 *
 * @template T
 * @param {readonly T[]} a - First sorted, de-duplicated array.
 * @param {readonly T[]} b - Second sorted, de-duplicated array.
 * @param {(x: T, y: T) => number} [compare] - Optional comparator returning < 0, 0, or > 0.
 * @returns {T[]} New sorted, de-duplicated array containing all elements present in `a` or `b`.
 * @throws {TypeError} If `a` or `b` is not a dense array, or if `compare` is invalid.
 * @throws {RangeError} If `a` or `b` is not strictly sorted according to `compare`.
 */
export function unionSortedArrIterative(a, b, compare = defaultCompare) {
	if (typeof compare !== 'function') {
		throw new TypeError('compare must be a function')
	}
	validateSortedUniqueArray(a, 'a', compare)
	validateSortedUniqueArray(b, 'b', compare)

	const result = []
	let i = 0
	let j = 0

	while (i < a.length && j < b.length) {
		const diff = safeCompare(compare, a[i], b[j])
		if (diff < 0) {
			result.push(a[i])
			i++
		} else if (diff > 0) {
			result.push(b[j])
			j++
		} else {
			result.push(a[i])
			i++
			j++
		}
	}

	while (i < a.length) {
		result.push(a[i])
		i++
	}

	while (j < b.length) {
		result.push(b[j])
		j++
	}

	return result
}
