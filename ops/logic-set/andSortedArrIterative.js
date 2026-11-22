/**
 * Default total-order comparator for homogeneous primitive values
 * (finite/infinite numbers excluding NaN, strings, or bigints).
 *
 * @template T
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
 * Invokes a comparator and ensures it returns a non-NaN number.
 *
 * @template T
 * @param {(x: T, y: T) => number} compare
 * @param {T} x
 * @param {T} y
 * @returns {number}
 */
function invokeCompare(compare, x, y) {
	const order = compare(x, y)
	if (typeof order !== 'number' || Number.isNaN(order)) {
		throw new TypeError('Comparator must return a non-NaN number')
	}
	return order
}

/**
 * Validates an input array for dense storage, element comparability (when using
 * the default comparator), and strictly increasing (sorted, de-duplicated) order.
 *
 * @template T
 * @param {unknown} arr
 * @param {string} name
 * @param {((x: T, y: T) => number) | undefined} customCompare
 * @param {string | null} expectedType
 * @returns {string | null}
 */
function validateSortedUniqueArray(arr, name, customCompare, expectedType) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${name} must be an array`)
	}

	const cmp = customCompare ?? defaultCompare
	let elemType = expectedType

	for (let i = 0; i < arr.length; i += 1) {
		if (!(i in arr)) {
			throw new TypeError(`${name} must not be a sparse array (hole at index ${i})`)
		}

		const value = arr[i]
		if (customCompare === undefined) {
			const t = typeof value
			if (t !== 'number' && t !== 'string' && t !== 'bigint') {
				throw new TypeError(
					`${name}[${i}] must be a number, string, or bigint when using the default comparator`,
				)
			}
			if (t === 'number' && Number.isNaN(value)) {
				throw new RangeError(`${name}[${i}] must not be NaN`)
			}
			if (elemType === null) {
				elemType = t
			} else if (elemType !== t) {
				throw new TypeError(
					`All elements across input arrays must share the same type when using the default comparator (expected ${elemType}, got ${t})`,
				)
			}
		}

		if (i > 0) {
			const order = invokeCompare(cmp, arr[i - 1], value)
			if (order === 0) {
				throw new RangeError(`${name} must be de-duplicated (duplicate at index ${i})`)
			}
			if (order > 0) {
				throw new RangeError(`${name} must be sorted in strictly ascending order (out of order at index ${i})`)
			}
		}
	}

	return elemType
}

/**
 * Computes the logical-set intersection (`AND`, i.e., `a ∩ b`) of two sorted,
 * de-duplicated arrays using a straightforward iterative two-pointer
 * merge-style algorithm.
 *
 * Runs in O(|a| + |b|) time and does not mutate either input array.
 *
 * @template T
 * @param {readonly T[]} a - First sorted, de-duplicated array in strictly ascending order.
 * @param {readonly T[]} b - Second sorted, de-duplicated array in strictly ascending order.
 * @param {(x: T, y: T) => number} [compare] - Optional strict weak-order comparator returning
 *   `< 0` if `x < y`, `0` if `x === y`, and `> 0` if `x > y`. Defaults to standard `<`/`>`
 *   ordering over homogeneous `number` (non-NaN), `string`, or `bigint` elements.
 * @returns {T[]} New sorted, de-duplicated array containing elements present in both `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not a dense array, `compare` is provided and not a function,
 *   the comparator returns a non-number/NaN, or default-compared elements are unsupported/mixed types.
 * @throws {RangeError} If `a` or `b` contains `NaN` (with default comparator), duplicate elements,
 *   or elements not sorted in strictly ascending order.
 */
export function andSortedArrIterative(a, b, compare) {
	if (compare !== undefined && typeof compare !== 'function') {
		throw new TypeError('compare must be a function when provided')
	}

	let expectedType = validateSortedUniqueArray(a, 'a', compare, null)
	expectedType = validateSortedUniqueArray(b, 'b', compare, expectedType)

	const cmp = compare ?? defaultCompare
	const result = []
	let i = 0
	let j = 0

	while (i < a.length && j < b.length) {
		const order = invokeCompare(cmp, a[i], b[j])
		if (order < 0) {
			i += 1
		} else if (order > 0) {
			j += 1
		} else {
			result.push(a[i])
			i += 1
			j += 1
		}
	}

	return result
}
