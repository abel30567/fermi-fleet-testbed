/**
 * Default strict ascending comparator for numbers, bigints, and strings.
 *
 * @template {number | bigint | string} T
 * @param {T} a
 * @param {T} b
 * @returns {number}
 */
function defaultCompare(a, b) {
	if (typeof a !== typeof b) {
		throw new TypeError(
			`Cannot compare values of different types (${typeof a} and ${typeof b}) without a custom comparator`,
		)
	}
	if (a < b) return -1
	if (a > b) return 1
	return 0
}

/**
 * Validates that a single element is supported by the default comparator.
 *
 * @param {unknown} value
 * @param {string} label
 * @param {number} index
 * @returns {'number' | 'string' | 'bigint'}
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
		`${label}[${index}] must be a number, bigint, or string when no custom comparator is provided`,
	)
}

/**
 * Invokes a comparator and validates that it returns a non-NaN number.
 *
 * @template T
 * @param {T} a
 * @param {T} b
 * @param {(a: T, b: T) => number} comparator
 * @returns {number}
 */
function safeCompare(a, b, comparator) {
	const cmp = comparator(a, b)
	if (typeof cmp !== 'number') {
		throw new TypeError('compare function must return a number')
	}
	if (Number.isNaN(cmp)) {
		throw new RangeError('compare function must not return NaN')
	}
	return cmp
}

/**
 * Validates that `arr` is a dense, strictly sorted, de-duplicated array.
 *
 * @template T
 * @param {unknown} arr
 * @param {string} label
 * @param {(a: T, b: T) => number} comparator
 * @param {boolean} isDefault
 */
function validateSortedUniqueArray(arr, label, comparator, isDefault) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${label} must be an array`)
	}

	let expectedType
	for (let k = 0; k < arr.length; k += 1) {
		if (!(k in arr)) {
			throw new TypeError(`${label} must not be a sparse array (hole at index ${k})`)
		}
		if (isDefault) {
			const elemType = validateDefaultElement(arr[k], label, k)
			if (expectedType === undefined) {
				expectedType = elemType
			} else if (elemType !== expectedType) {
				throw new TypeError(
					`${label} elements must have uniform comparable types when no custom comparator is provided`,
				)
			}
		}
		if (k > 0) {
			const cmp = safeCompare(arr[k - 1], arr[k], comparator)
			if (cmp === 0) {
				throw new RangeError(
					`${label} must be de-duplicated (duplicate element at index ${k})`,
				)
			}
			if (cmp > 0) {
				throw new RangeError(
					`${label} must be sorted in strictly ascending order (out-of-order at index ${k})`,
				)
			}
		}
	}
}

/**
 * Computes the logical set complement (NOT) of `exclude` relative to `universe`
 * (`universe \ exclude`) over strictly sorted, de-duplicated arrays using a
 * straightforward iterative merge-style two-pointer scan.
 *
 * Every element present in `universe` that does not appear in `exclude` is
 * returned in sorted, de-duplicated order. Elements in `exclude` that are not
 * in `universe` are ignored. Input arrays are not mutated.
 *
 * Time complexity: O(|universe| + |exclude|).
 * Auxiliary space (excluding output): O(1).
 *
 * @template T
 * @param {readonly T[]} universe - Strictly sorted, de-duplicated array representing the universal set.
 * @param {readonly T[]} exclude - Strictly sorted, de-duplicated array representing the set to negate/exclude.
 * @param {(a: T, b: T) => number} [compare] - Optional comparator returning `< 0` if `a < b`, `0` if equal, `> 0` if `a > b`.
 *   Defaults to ascending comparison for uniform `number`, `bigint`, or `string` arrays.
 * @returns {T[]} New strictly sorted, de-duplicated array of elements in `universe` and not in `exclude`.
 * @throws {TypeError} If inputs are not dense arrays, `compare` is not a function, comparator returns a non-number,
 *   or default comparison encounters unsupported/mixed element types.
 * @throws {RangeError} If either array is not strictly ascending, contains duplicates, contains `NaN`,
 *   or `compare` returns `NaN`.
 */
export function notSortedArrIterative(universe, exclude, compare) {
	if (compare !== undefined && typeof compare !== 'function') {
		throw new TypeError('compare must be a function when provided')
	}

	const isDefault = compare === undefined
	const comparator = isDefault ? defaultCompare : compare

	validateSortedUniqueArray(universe, 'universe', comparator, isDefault)
	validateSortedUniqueArray(exclude, 'exclude', comparator, isDefault)

	const result = []
	const uLen = universe.length
	const eLen = exclude.length
	let i = 0
	let j = 0

	while (i < uLen && j < eLen) {
		const uVal = universe[i]
		const eVal = exclude[j]
		const cmp = safeCompare(uVal, eVal, comparator)

		if (cmp < 0) {
			result.push(uVal)
			i += 1
		} else if (cmp === 0) {
			i += 1
			j += 1
		} else {
			j += 1
		}
	}

	while (i < uLen) {
		result.push(universe[i])
		i += 1
	}

	return result
}
