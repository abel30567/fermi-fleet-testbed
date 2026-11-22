/**
 * Default total-order comparator for homogeneous comparable primitives
 * (`number` excluding `NaN`, `string`, or `bigint`).
 *
 * @template T
 * @param {T} x
 * @param {T} y
 * @returns {number} Negative if `x < y`, positive if `x > y`, or `0` if equal.
 */
function defaultCompare(x, y) {
  if (x < y) return -1;
  if (x > y) return 1;
  return 0;
}

/**
 * Invokes a comparator and validates that it returns a non-NaN number.
 *
 * @template T
 * @param {(x: T, y: T) => number} compareFn
 * @param {T} x
 * @param {T} y
 * @returns {number}
 */
function safeCompare(compareFn, x, y) {
  const result = compareFn(x, y);
  if (typeof result !== 'number') {
    throw new TypeError('Comparator must return a number');
  }
  if (Number.isNaN(result)) {
    throw new RangeError('Comparator must not return NaN');
  }
  return result;
}

/**
 * Validates that an element is a supported comparable primitive when using the
 * default comparator, and matches the established primitive type.
 *
 * @param {unknown} value
 * @param {string} name
 * @param {number} index
 * @param {string | null} expectedType
 * @returns {string} The validated primitive type.
 */
function validateDefaultElement(value, name, index, expectedType) {
  const type = typeof value;
  if (type !== 'number' && type !== 'string' && type !== 'bigint') {
    throw new TypeError(
      `${name}[${index}] must be a number, string, or bigint when no comparator is provided`,
    );
  }
  if (type === 'number' && Number.isNaN(value)) {
    throw new RangeError(`${name}[${index}] must not be NaN`);
  }
  if (expectedType !== null && type !== expectedType) {
    throw new TypeError(
      `All elements across inputs must have the same type when no comparator is provided (expected ${expectedType}, got ${type})`,
    );
  }
  return type;
}

/**
 * Validates that an input is a dense array that is strictly ascending and
 * de-duplicated under the given comparator.
 *
 * @template T
 * @param {readonly T[]} arr
 * @param {string} name
 * @param {((x: T, y: T) => number) | null} customCompare
 * @param {string | null} expectedType
 * @returns {string | null} Updated expected primitive type for default mode.
 */
function validateSortedUniqueArray(arr, name, customCompare, expectedType) {
  if (!Array.isArray(arr)) {
    throw new TypeError(`${name} must be an array`);
  }

  let currentType = expectedType;
  const cmp = customCompare ?? defaultCompare;

  for (let i = 0; i < arr.length; i += 1) {
    if (!(i in arr)) {
      throw new TypeError(`${name} must not be a sparse array (hole at index ${i})`);
    }
    const item = arr[i];
    if (customCompare === null) {
      currentType = validateDefaultElement(item, name, i, currentType);
    }
    if (i > 0) {
      const order = customCompare === null
        ? cmp(arr[i - 1], item)
        : safeCompare(cmp, arr[i - 1], item);
      if (order >= 0) {
        throw new RangeError(
          `${name} must be sorted in strictly ascending order without duplicates (violation at index ${i})`,
        );
      }
    }
  }

  return currentType;
}

/**
 * Computes the symmetric difference (XOR) of two sorted, de-duplicated arrays
 * using a straightforward iterative two-pointer merge algorithm.
 *
 * Returns a new sorted, de-duplicated array containing elements that appear in
 * exactly one of `a` or `b`, without mutating either input array.
 *
 * Runs in O(|a| + |b|) time and O(|a| + |b|) space.
 *
 * @template T
 * @param {readonly T[]} a - First sorted, de-duplicated array.
 * @param {readonly T[]} b - Second sorted, de-duplicated array.
 * @param {(x: T, y: T) => number} [compare] - Optional strict weak ordering comparator
 *   returning a negative number if `x < y`, `0` if `x` and `y` are equivalent,
 *   or a positive number if `x > y`. Defaults to standard ascending order for
 *   homogeneous `number` (non-`NaN`), `string`, or `bigint` arrays.
 * @returns {T[]} New sorted, de-duplicated array containing the symmetric difference of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not a dense array, `compare` is neither
 *   `undefined` nor a function, `compare` returns a non-number, or default-mode
 *   elements are unsupported/mixed types.
 * @throws {RangeError} If `a` or `b` is not strictly sorted and de-duplicated,
 *   contains `NaN` in default mode, or `compare` returns `NaN`.
 */
export function xorSortedArrIterative(a, b, compare) {
  if (compare !== undefined && typeof compare !== 'function') {
    throw new TypeError('compare must be a function when provided');
  }

  const customCompare = compare ?? null;
  const expectedType = validateSortedUniqueArray(a, 'a', customCompare, null);
  validateSortedUniqueArray(b, 'b', customCompare, expectedType);

  const result = [];
  const lenA = a.length;
  const lenB = b.length;
  let i = 0;
  let j = 0;

  while (i < lenA && j < lenB) {
    const valA = a[i];
    const valB = b[j];
    const order = customCompare === null
      ? defaultCompare(valA, valB)
      : safeCompare(customCompare, valA, valB);

    if (order < 0) {
      result.push(valA);
      i += 1;
    } else if (order > 0) {
      result.push(valB);
      j += 1;
    } else {
      i += 1;
      j += 1;
    }
  }

  while (i < lenA) {
    result.push(a[i]);
    i += 1;
  }

  while (j < lenB) {
    result.push(b[j]);
    j += 1;
  }

  return result;
}
