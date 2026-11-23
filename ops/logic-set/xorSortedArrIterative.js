/**
 * Computes the symmetric difference (XOR) of two sorted, de-duplicated arrays
 * using a straightforward iterative two-pointer merge algorithm.
 *
 * Returns a new sorted, de-duplicated array containing elements that appear in
 * exactly one of `a` or `b` (i.e., `(a \ b) ∪ (b \ a)`). Neither input array
 * is mutated.
 *
 * When `compare` is omitted, elements must all share one of the supported
 * ordered primitive types (`'number'` excluding `NaN`, `'string'`, or
 * `'bigint'`) and are ordered with `<` / `>`. When `compare` is supplied, any
 * element type supported by `compare` is permitted.
 *
 * @template T
 * @param {readonly T[]} a - First strictly ascending, de-duplicated array.
 * @param {readonly T[]} b - Second strictly ascending, de-duplicated array.
 * @param {(x: T, y: T) => number} [compare] - Optional comparator returning a
 *   negative number if `x < y`, `0` if `x` and `y` are equivalent, or a
 *   positive number if `x > y`.
 * @returns {T[]} New strictly ascending, de-duplicated array representing `a XOR b`.
 * @throws {TypeError} If `a` or `b` is not an Array, contains sparse holes,
 *   `compare` is provided and not a function, `compare` returns a non-number or
 *   `NaN`, or (with default comparison) elements are unsupported or mixed types.
 * @throws {RangeError} If `a` or `b` contains `NaN` (with default comparison),
 *   is not sorted in ascending order, or contains duplicate elements.
 */

const VALID_DEFAULT_TYPES = new Set(['number', 'string', 'bigint'])

/**
 * Default total-order comparator for homogeneous primitives.
 *
 * @template {number | string | bigint} T
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
 * Invokes `cmp(x, y)` and verifies it returns a non-NaN number.
 *
 * @template T
 * @param {(x: T, y: T) => number} cmp
 * @param {T} x
 * @param {T} y
 * @returns {number}
 */
function invokeCompare(cmp, x, y) {
	const diff = cmp(x, y)
	if (typeof diff !== 'number' || Number.isNaN(diff)) {
		throw new TypeError('Comparator must return a non-NaN number')
	}
	return diff
}

/**
 * Validates that an element is acceptable under the default comparator and
 * matches the established primitive type across both inputs.
 *
 * @param {unknown} value
 * @param {string} name
 * @param {number} index
 * @param {{ type: string | null }} state
 */
function validateDefaultElement(value, name, index, state) {
	const t = typeof value
	if (!VALID_DEFAULT_TYPES.has(t)) {
		throw new TypeError(
			`${name}[${index}] has unsupported type "${t}" for default comparison; provide a custom compare function`,
		)
	}
	if (t === 'number' && Number.isNaN(value)) {
		throw new RangeError(`${name}[${index}] must not be NaN`)
	}
	if (state.type === null) {
		state.type = t
	} else if (state.type !== t) {
		throw new TypeError(
			`Mixed element types ("${state.type}" and "${t}") are not supported with default comparison; provide a custom compare function`,
		)
	}
}

/**
 * Validates that `arr` is a dense, strictly ascending, de-duplicated array.
 *
 * @template T
 * @param {readonly T[]} arr
 * @param {string} name
 * @param {(x: T, y: T) => number} cmp
 * @param {boolean} useDefault
 * @param {{ type: string | null }} defaultState
 */
function validateInputArray(arr, name, cmp, useDefault, defaultState) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${name} must be an Array`)
	}

	for (let i = 0; i < arr.length; i += 1) {
		if (!(i in arr)) {
			throw new TypeError(`${name} must not be a sparse array (hole at index ${i})`)
		}
		if (useDefault) {
			validateDefaultElement(arr[i], name, i, defaultState)
		}
		if (i > 0) {
			const diff = invokeCompare(cmp, arr[i - 1], arr[i])
			if (diff > 0) {
				throw new RangeError(
					`${name} must be sorted in ascending order (out of order at indices ${i - 1} and ${i})`,
				)
			}
			if (diff === 0) {
				throw new RangeError(
					`${name} must be de-duplicated (duplicate elements at indices ${i - 1} and ${i})`,
				)
			}
		}
	}
}

export function xorSortedArrIterative(a, b, compare) {
	if (compare !== undefined && typeof compare !== 'function') {
		throw new TypeError('compare must be a function when provided')
	}

	const useDefault = compare === undefined
	const cmp = useDefault ? defaultCompare : compare
	const defaultState = { type: null }

	validateInputArray(a, 'a', cmp, useDefault, defaultState)
	validateInputArray(b, 'b', cmp, useDefault, defaultState)

	const result = []
	let i = 0
	let j = 0

	while (i < a.length && j < b.length) {
		const diff = invokeCompare(cmp, a[i], b[j])
		if (diff < 0) {
			result.push(a[i])
			i += 1
		} else if (diff > 0) {
			result.push(b[j])
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

	while (j < b.length) {
		result.push(b[j])
		j += 1
	}

	return result
}
