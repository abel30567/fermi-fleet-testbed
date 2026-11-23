/**
 * Default strict-order comparator for primitive values (numbers, strings, bigints).
 *
 * @template T
 * @param {T} x - First value to compare.
 * @param {T} y - Second value to compare.
 * @returns {number} `-1` if `x < y`, `1` if `x > y`, or `0` if `x === y`.
 * @throws {TypeError} If either value is `NaN` or the values cannot be cleanly ordered.
 */
function defaultCompare(x, y) {
	if (typeof x === 'number' && Number.isNaN(x)) {
		throw new TypeError('Default comparator does not support NaN elements')
	}
	if (typeof y === 'number' && Number.isNaN(y)) {
		throw new TypeError('Default comparator does not support NaN elements')
	}
	if (typeof x !== typeof y) {
		throw new TypeError('Default comparator requires elements of the same type')
	}
	if (x < y) return -1
	if (x > y) return 1
	if (x === y) return 0
	throw new TypeError('Elements are not comparable with the default comparator')
}

/**
 * Invokes `cmp(x, y)` and verifies it returns a valid (non-NaN) number.
 *
 * @template T
 * @param {(x: T, y: T) => number} cmp - Comparator function.
 * @param {T} x - Left operand.
 * @param {T} y - Right operand.
 * @returns {number} Comparison result.
 * @throws {TypeError} If the comparator does not return a valid number.
 */
function safeCompare(cmp, x, y) {
	const order = cmp(x, y)
	if (typeof order !== 'number' || Number.isNaN(order)) {
		throw new TypeError('Comparator must return a non-NaN number')
	}
	return order
}

/**
 * Validates that an array has no holes and is strictly increasing (sorted and de-duplicated)
 * under the provided comparator.
 *
 * @template T
 * @param {readonly T[]} arr - Array to validate.
 * @param {(x: T, y: T) => number} cmp - Strict weak ordering comparator.
 * @param {string} label - Parameter label for error messages.
 * @throws {TypeError} If `arr` is sparse or contains uncomparable elements.
 * @throws {RangeError} If `arr` is not strictly sorted and de-duplicated.
 */
function assertStrictlySorted(arr, cmp, label) {
	const len = arr.length
	if (len === 0) return

	if (!(0 in arr)) {
		throw new TypeError(`Argument "${label}" must not be a sparse array`)
	}
	// Validate the first element is comparable (e.g. catches single-element [NaN]).
	const selfOrder = safeCompare(cmp, arr[0], arr[0])
	if (selfOrder !== 0) {
		throw new RangeError(`Comparator must be reflexive (cmp(x, x) === 0) for "${label}"`)
	}

	for (let i = 1; i < len; i += 1) {
		if (!(i in arr)) {
			throw new TypeError(`Argument "${label}" must not be a sparse array`)
		}
		const order = safeCompare(cmp, arr[i - 1], arr[i])
		if (order === 0) {
			throw new RangeError(
				`Argument "${label}" must be de-duplicated (duplicate found at index ${i})`
			)
		}
		if (order > 0) {
			throw new RangeError(
				`Argument "${label}" must be sorted in strictly ascending order (out of order at index ${i})`
			)
		}
	}
}

/**
 * Computes the set difference `a \ b` (all elements in `a` that are not in `b`)
 * over two sorted, de-duplicated arrays using a straightforward iterative merge-style scan.
 *
 * Neither input array is mutated. Runs in O(|a| + |b|) time and O(1) auxiliary space
 * (excluding the returned array).
 *
 * @template T
 * @param {readonly T[]} a - First sorted, de-duplicated array (minuend).
 * @param {readonly T[]} b - Second sorted, de-duplicated array (subtrahend).
 * @param {(x: T, y: T) => number} [compare] - Optional comparator returning `< 0` if `x < y`,
 *   `0` if `x` and `y` are equivalent, or `> 0` if `x > y`. Defaults to ascending `<` / `>` order
 *   for same-type primitives (numbers, strings, bigints).
 * @returns {T[]} A new sorted, de-duplicated array containing every element of `a` not present in `b`.
 * @throws {TypeError} If `a` or `b` is not an array, is sparse, `compare` is provided and not a
 *   function, or elements cannot be compared.
 * @throws {RangeError} If `a` or `b` is not strictly sorted and de-duplicated according to `compare`.
 */
export function setDifferenceSortedArrIterative(a, b, compare) {
	if (!Array.isArray(a)) {
		throw new TypeError('First argument "a" must be an array')
	}
	if (!Array.isArray(b)) {
		throw new TypeError('Second argument "b" must be an array')
	}
	if (compare !== undefined && typeof compare !== 'function') {
		throw new TypeError('Third argument "compare" must be a function when provided')
	}

	const cmp = compare ?? defaultCompare

	assertStrictlySorted(a, cmp, 'a')
	assertStrictlySorted(b, cmp, 'b')

	const result = []
	let i = 0
	let j = 0

	while (i < a.length && j < b.length) {
		const order = safeCompare(cmp, a[i], b[j])
		if (order < 0) {
			result.push(a[i])
			i += 1
		} else if (order > 0) {
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
