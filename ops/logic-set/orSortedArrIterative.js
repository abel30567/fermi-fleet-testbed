/**
 * Validates that a value is a comparable primitive supported by the default comparator.
 *
 * @param {unknown} value - Element to validate.
 * @param {string} label - Descriptive label for error messages.
 * @returns {'number' | 'bigint' | 'string'} The validated primitive type.
 * @throws {RangeError} If value is NaN.
 * @throws {TypeError} If value is not a number, bigint, or string.
 */
function validateDefaultValue(value, label) {
	const type = typeof value;
	if (type === 'number') {
		if (Number.isNaN(value)) {
			throw new RangeError(`${label} must not contain NaN when using the default comparator`);
		}
		return type;
	}
	if (type === 'bigint' || type === 'string') {
		return type;
	}
	throw new TypeError(
		`${label} elements must be numbers, bigints, or strings when using the default comparator`
	);
}

/**
 * Default strict total-order comparator for numbers, bigints, or strings of the same type.
 *
 * @param {number | bigint | string} x - Left operand.
 * @param {number | bigint | string} y - Right operand.
 * @returns {-1 | 0 | 1} Negative if x < y, positive if x > y, zero if equal.
 */
function defaultCompare(x, y) {
	const tx = validateDefaultValue(x, 'Input array');
	const ty = validateDefaultValue(y, 'Input array');
	if (tx !== ty) {
		throw new TypeError(
			`Cannot compare values of different types (${tx} and ${ty}) with the default comparator`
		);
	}
	return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * Invokes a comparator and validates that it returns a non-NaN number.
 *
 * @template T
 * @param {(x: T, y: T) => number} compare - Comparator function.
 * @param {T} x - Left operand.
 * @param {T} y - Right operand.
 * @returns {number} Comparison result.
 * @throws {TypeError} If the comparator returns a non-number or NaN.
 */
function safeCompare(compare, x, y) {
	const cmp = compare(x, y);
	if (typeof cmp !== 'number' || Number.isNaN(cmp)) {
		throw new TypeError('Comparator must return a non-NaN number');
	}
	return cmp;
}

/**
 * Validates that an input is a dense, strictly ascending (sorted and de-duplicated) array.
 *
 * @template T
 * @param {readonly T[]} arr - Array to validate.
 * @param {string} name - Parameter name for error messages.
 * @param {(x: T, y: T) => number} compare - Comparator function.
 * @param {boolean} useDefault - Whether the default comparator is active.
 * @throws {TypeError} If arr is not a dense array or contains unsupported types.
 * @throws {RangeError} If arr is unsorted, contains duplicates, or contains NaN.
 */
function validateSortedSet(arr, name, compare, useDefault) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${name} must be an array`);
	}

	for (let i = 0; i < arr.length; i++) {
		if (!(i in arr)) {
			throw new TypeError(`${name} must not be a sparse array`);
		}
		if (useDefault) {
			validateDefaultValue(arr[i], name);
		}
		if (i > 0) {
			const cmp = safeCompare(compare, arr[i - 1], arr[i]);
			if (cmp > 0) {
				throw new RangeError(`${name} must be sorted in ascending order`);
			}
			if (cmp === 0) {
				throw new RangeError(`${name} must be de-duplicated (strictly ascending)`);
			}
		}
	}
}

/**
 * Computes the logic-set OR (set union) of two sorted, de-duplicated arrays
 * using a straightforward iterative two-pointer merge algorithm.
 *
 * Both input arrays must be strictly ascending according to `compare` (no unsorted
 * elements and no duplicates). The returned array is a newly allocated sorted,
 * de-duplicated array containing every element present in `a`, `b`, or both.
 * When elements from `a` and `b` compare equal, the element from `a` is kept.
 *
 * Time complexity: O(a.length + b.length).
 * Auxiliary space complexity: O(a.length + b.length) for the output array.
 *
 * @template T
 * @param {readonly T[]} a - First sorted, de-duplicated array.
 * @param {readonly T[]} b - Second sorted, de-duplicated array.
 * @param {(x: T, y: T) => number} [compare] - Optional comparator defining strict ascending order.
 * @returns {T[]} New sorted, de-duplicated array representing `a ∪ b`.
 * @throws {TypeError} If `a` or `b` is not a dense array, `compare` is not a function,
 *   comparator returns an invalid value, or incompatible types are used with the default comparator.
 * @throws {RangeError} If `a` or `b` is unsorted, contains duplicates, or contains NaN with the default comparator.
 */
export function orSortedArrIterative(a, b, compare) {
	const useDefault = compare === undefined;
	if (!useDefault && typeof compare !== 'function') {
		throw new TypeError('compare must be a function when provided');
	}
	const cmpFn = useDefault ? defaultCompare : compare;

	validateSortedSet(a, 'a', cmpFn, useDefault);
	validateSortedSet(b, 'b', cmpFn, useDefault);

	const result = [];
	let i = 0;
	let j = 0;

	while (i < a.length && j < b.length) {
		const cmp = safeCompare(cmpFn, a[i], b[j]);
		if (cmp < 0) {
			result.push(a[i]);
			i++;
		} else if (cmp > 0) {
			result.push(b[j]);
			j++;
		} else {
			result.push(a[i]);
			i++;
			j++;
		}
	}

	while (i < a.length) {
		result.push(a[i]);
		i++;
	}

	while (j < b.length) {
		result.push(b[j]);
		j++;
	}

	return result;
}
