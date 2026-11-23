/**
 * Default strict total-order comparator for primitive values.
 *
 * Supports `number` (excluding `NaN`), `bigint`, `string`, and `boolean` values
 * of matching types.
 *
 * @template T
 * @param {T} a - First value to compare.
 * @param {T} b - Second value to compare.
 * @returns {-1 | 0 | 1} Negative if `a < b`, `0` if `a === b`, positive if `a > b`.
 * @throws {RangeError} If either value is `NaN`.
 * @throws {TypeError} If values have unsupported or mismatched types.
 */
function defaultCompare(a, b) {
	const typeA = typeof a
	const typeB = typeof b

	if (typeA !== typeB) {
		throw new TypeError(
			`Default comparator requires elements of the same type (got ${typeA} and ${typeB})`,
		)
	}

	if (
		typeA !== 'number' &&
		typeA !== 'bigint' &&
		typeA !== 'string' &&
		typeA !== 'boolean'
	) {
		throw new TypeError(
			`Default comparator does not support type "${typeA}"; provide a custom compare function`,
		)
	}

	if (typeA === 'number' && (Number.isNaN(a) || Number.isNaN(b))) {
		throw new RangeError('NaN is not allowed with the default comparator')
	}

	return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Invokes a comparator and ensures it produces a valid numeric ordering result.
 *
 * @template T
 * @param {(a: T, b: T) => number} compare - Comparator function.
 * @param {T} a - First operand.
 * @param {T} b - Second operand.
 * @returns {number} Numeric comparison result.
 * @throws {TypeError} If the comparator does not return a non-NaN number.
 */
function invokeCompare(compare, a, b) {
	const cmp = compare(a, b)
	if (typeof cmp !== 'number' || Number.isNaN(cmp)) {
		throw new TypeError('Comparator must return a valid number (not NaN)')
	}
	return cmp
}

/**
 * Validates that an input is a dense, strictly increasing (sorted and
 * de-duplicated) array under the given comparator.
 *
 * @template T
 * @param {unknown} arr - Value to validate.
 * @param {string} name - Parameter name for error reporting.
 * @param {(a: T, b: T) => number} compare - Comparator function.
 * @throws {TypeError} If `arr` is not a dense array or elements are invalid.
 * @throws {RangeError} If `arr` is unsorted or contains duplicate elements.
 */
function validateSortedUniqueArray(arr, name, compare) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${name} must be an Array`)
	}

	if (arr.length === 0) {
		return
	}

	if (!(0 in arr)) {
		throw new TypeError(`${name} must not be a sparse array`)
	}

	// Validate the first element even for single-element arrays.
	const selfCmp = invokeCompare(compare, arr[0], arr[0])
	if (selfCmp !== 0) {
		throw new RangeError(`Comparator must be reflexive (compare(x, x) === 0)`)
	}

	for (let i = 1; i < arr.length; i += 1) {
		if (!(i in arr)) {
			throw new TypeError(`${name} must not be a sparse array`)
		}

		const cmp = invokeCompare(compare, arr[i - 1], arr[i])
		if (cmp === 0) {
			throw new RangeError(
				`${name} must be de-duplicated (duplicate element at index ${i})`,
			)
		}
		if (cmp > 0) {
			throw new RangeError(
				`${name} must be sorted in strictly ascending order (out-of-order element at index ${i})`,
			)
		}
	}
}

/**
 * Computes the logical set complement (`NOT`: `universe \ excluded`) over two
 * sorted, de-duplicated arrays using a straightforward iterative merge-style
 * two-pointer algorithm.
 *
 * Returns a new sorted, de-duplicated array containing every element present in
 * `universe` that is not present in `excluded`. Elements in `excluded` that do
 * not appear in `universe` are ignored. Neither input array is mutated.
 *
 * Time complexity: `O(universe.length + excluded.length)`
 * Space complexity: `O(universe.length)` for the returned array (plus `O(1)` auxiliary space)
 *
 * @template T
 * @param {readonly T[]} universe - Sorted, de-duplicated universal set array.
 * @param {readonly T[]} excluded - Sorted, de-duplicated array of elements to exclude.
 * @param {(a: T, b: T) => number} [compare] - Optional strict total-order comparator
 *   matching the sort order of both arrays. Defaults to ascending primitive comparison.
 * @returns {T[]} A new sorted, de-duplicated array containing elements in `universe`
 *   that are not in `excluded`.
 * @throws {TypeError} If `universe` or `excluded` is not a dense array, if `compare`
 *   is provided and not a function, or if elements cannot be validly compared.
 * @throws {RangeError} If either array is not strictly sorted or contains duplicates.
 */
export function notSortedArrIterative(universe, excluded, compare = defaultCompare) {
	if (typeof compare !== 'function') {
		throw new TypeError('compare must be a function')
	}

	validateSortedUniqueArray(universe, 'universe', compare)
	validateSortedUniqueArray(excluded, 'excluded', compare)

	const result = []
	let i = 0
	let j = 0

	while (i < universe.length && j < excluded.length) {
		const cmp = invokeCompare(compare, universe[i], excluded[j])
		if (cmp < 0) {
			result.push(universe[i])
			i += 1
		} else if (cmp > 0) {
			j += 1
		} else {
			i += 1
			j += 1
		}
	}

	while (i < universe.length) {
		result.push(universe[i])
		i += 1
	}

	return result
}
