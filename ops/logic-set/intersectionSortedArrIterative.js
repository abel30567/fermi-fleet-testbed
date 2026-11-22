/**
 * Default strict-weak-order comparator for homogeneous primitive values
 * (numbers, strings, or bigints).
 *
 * @param {number|string|bigint} x
 * @param {number|string|bigint} y
 * @returns {number}
 */
function defaultCompare(x, y) {
	if (x < y) return -1;
	if (x > y) return 1;
	return 0;
}

const DEFAULT_COMPARABLE_TYPES = new Set(['number', 'string', 'bigint']);

/**
 * Invokes a comparator and validates that it returns a non-NaN number.
 *
 * @template T
 * @param {(x: T, y: T) => number} compare
 * @param {T} x
 * @param {T} y
 * @returns {number}
 * @throws {TypeError} If the comparator does not return a non-NaN number.
 */
function safeCompare(compare, x, y) {
	const cmp = compare(x, y);
	if (typeof cmp !== 'number' || Number.isNaN(cmp)) {
		throw new TypeError('Comparator must return a non-NaN number');
	}
	return cmp;
}

/**
 * Validates that an array is dense, contains valid elements for the active
 * comparator, and is strictly ascending (sorted and de-duplicated).
 *
 * @template T
 * @param {readonly T[]} arr
 * @param {string} name
 * @param {(x: T, y: T) => number} compare
 * @param {boolean} useDefault
 * @param {string|null} expectedType
 * @returns {string|null} The detected primitive type when using the default comparator.
 */
function validateSortedUniqueArray(arr, name, compare, useDefault, expectedType) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${name} must be an array`);
	}

	let elementType = expectedType;

	for (let i = 0; i < arr.length; i += 1) {
		if (!(i in arr)) {
			throw new TypeError(`${name} must not be a sparse array`);
		}

		const value = arr[i];

		if (useDefault) {
			const valueType = typeof value;
			if (!DEFAULT_COMPARABLE_TYPES.has(valueType)) {
				throw new TypeError(
					`${name}[${i}] must be a number, string, or bigint when no custom comparator is provided`
				);
			}
			if (valueType === 'number' && Number.isNaN(value)) {
				throw new RangeError(`${name}[${i}] must not be NaN`);
			}
			if (elementType === null) {
				elementType = valueType;
			} else if (valueType !== elementType) {
				throw new TypeError(
					`All elements across both arrays must have the same type (${elementType}) when no custom comparator is provided`
				);
			}
		}

		if (i > 0) {
			const cmp = safeCompare(compare, arr[i - 1], value);
			if (cmp > 0) {
				throw new RangeError(
					`${name} must be sorted in strictly ascending order (out of order at index ${i})`
				);
			}
			if (cmp === 0) {
				throw new RangeError(
					`${name} must be de-duplicated (duplicate element at index ${i})`
				);
			}
		}
	}

	return elementType;
}

/**
 * Computes the set intersection of two sorted, de-duplicated arrays using an
 * iterative two-pointer merge algorithm.
 *
 * Both input arrays must be dense, strictly ascending, and free of duplicates
 * with respect to `compare`. Neither input array is mutated. When an element
 * matches in both arrays (`compare(a[i], b[j]) === 0`), the element from `a`
 * is placed in the returned sorted, de-duplicated array.
 *
 * @template T
 * @param {readonly T[]} a - First sorted, de-duplicated array.
 * @param {readonly T[]} b - Second sorted, de-duplicated array.
 * @param {(x: T, y: T) => number} [compare] - Optional comparator returning a
 *   negative number if `x < y`, `0` if `x` and `y` are equivalent, or a
 *   positive number if `x > y`. Defaults to ascending comparison over numbers,
 *   strings, or bigints.
 * @returns {T[]} New sorted, de-duplicated array containing elements common to `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not a dense array, if `compare` is
 *   provided and not a function, if `compare` returns a non-number or `NaN`, or
 *   if elements have unsupported or mixed types under the default comparator.
 * @throws {RangeError} If any element is `NaN` under the default comparator, or
 *   if either array is not strictly ascending (unsorted or contains duplicates).
 */
export function intersectionSortedArrIterative(a, b, compare) {
	const useDefault = compare === undefined;
	if (!useDefault && typeof compare !== 'function') {
		throw new TypeError('compare must be a function when provided');
	}

	const comparator = useDefault ? defaultCompare : compare;

	const detectedType = validateSortedUniqueArray(a, 'a', comparator, useDefault, null);
	validateSortedUniqueArray(b, 'b', comparator, useDefault, detectedType);

	const result = [];
	let i = 0;
	let j = 0;

	while (i < a.length && j < b.length) {
		const cmp = safeCompare(comparator, a[i], b[j]);
		if (cmp < 0) {
			i += 1;
		} else if (cmp > 0) {
			j += 1;
		} else {
			result.push(a[i]);
			i += 1;
			j += 1;
		}
	}

	return result;
}
