/**
 * Validates that `arr` is an Array of strictly increasing finite numbers
 * (sorted in ascending order with no duplicates).
 *
 * @param {unknown} arr - Value to validate.
 * @param {number} argIndex - Zero-based parameter index for error reporting.
 * @throws {TypeError} If `arr` is not an Array or contains a non-number element (including holes).
 * @throws {RangeError} If any element is non-finite (`NaN`, `Infinity`, `-Infinity`) or if `arr` is not strictly increasing (unsorted or contains duplicates).
 */
function validateSortedUniqueNumericArray(arr, argIndex) {
  if (!Array.isArray(arr)) {
    throw new TypeError(
      `Expected argument ${argIndex} to be an array of strictly increasing finite numbers`
    );
  }

  let prev = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (!(i in arr)) {
      throw new TypeError(
        `Argument ${argIndex} must not be a sparse array (hole at index ${i})`
      );
    }
    const val = arr[i];
    if (typeof val !== 'number') {
      throw new TypeError(
        `Argument ${argIndex} element at index ${i} must be a number, got ${typeof val}`
      );
    }
    if (!Number.isFinite(val)) {
      throw new RangeError(
        `Argument ${argIndex} element at index ${i} must be a finite number, got ${val}`
      );
    }
    if (i > 0) {
      if (val === prev) {
        throw new RangeError(
          `Argument ${argIndex} must be de-duplicated (duplicate value ${val} at index ${i})`
        );
      }
      if (val < prev) {
        throw new RangeError(
          `Argument ${argIndex} must be sorted in strictly increasing order (${val} < ${prev} at index ${i})`
        );
      }
    }
    prev = val;
  }
}

/**
 * Computes the binary set difference `A \ B` for two validated strictly
 * increasing numeric arrays using a two-pointer linear merge scan.
 *
 * Time complexity: O(|A| + |B|).
 * Space complexity: O(|A \ B|).
 *
 * @param {readonly number[]} a - Validated strictly increasing minuend array.
 * @param {readonly number[]} b - Validated strictly increasing subtrahend array.
 * @returns {number[]} Strictly increasing array of elements in `a` and not in `b`.
 */
function diffTwoSorted(a, b) {
  const result = [];
  const n = a.length;
  const m = b.length;
  let i = 0;
  let j = 0;

  while (i < n && j < m) {
    const av = a[i];
    const bv = b[j];
    if (av < bv) {
      result.push(av === 0 ? 0 : av);
      i++;
    } else if (av > bv) {
      j++;
    } else {
      i++;
      j++;
    }
  }

  while (i < n) {
    const av = a[i++];
    result.push(av === 0 ? 0 : av);
  }

  return result;
}

/**
 * Computes the set difference `A \ B` (and, in general, the left-associative
 * series `A \ B₁ \ B₂ \ ... \ Bₖ`) over sorted, de-duplicated finite numeric
 * arrays using a merge-style linear scan algorithm.
 *
 * ## Mathematical Definition & Identities
 * For finite sets of real numbers represented as strictly increasing arrays:
 * - Binary difference:
 *   `A \ B = { x ∈ A : x ∉ B }`
 * - Left-associative series identity (union absorption / De Morgan reduction):
 *   `(((A \ B₁) \ B₂) ... \ Bₖ) = A \ (⋃_{m=1}^{k} Bₘ)`
 * - Empty subtrahend series (`k = 0`):
 *   `A \ ∅ = A` (returns a shallow copy of `a` with `-0` normalized to `0`).
 * - Partition identity:
 *   `(A \ B) ∪ (A ∩ B) = A` and `(A \ B) ∩ (A ∩ B) = ∅`.
 *
 * ## Algorithm
 * 1. Validates `a` and every subtrahend `bₘ` up front (ensuring deterministic
 *    validation even when `a` is empty).
 * 2. For `k = 0`: returns a normalized copy of `a` in O(|A|).
 * 3. For `k = 1`: performs a classic two-pointer merge scan in O(|A| + |B₁|).
 * 4. For `k ≥ 2`: performs a single-pass simultaneous multi-pointer merge scan
 *    over `a` and all subtrahends `b₁, ..., bₖ` using the identity
 *    `A \ B₁ \ ... \ Bₖ = A \ (⋃ Bₘ)`, advancing each subtrahend cursor
 *    monotonically with zero intermediate array allocations, in
 *    O(k · |A| + ∑|Bₘ|) time and O(|result| + k) auxiliary space.
 *
 * `-0` is treated as equal to `+0` and normalized to `+0` in the returned
 * array, matching JavaScript `Set` (SameValueZero) semantics. Input arrays are
 * never mutated.
 *
 * @param {readonly number[]} a - Minuend: strictly increasing array of finite numbers.
 * @param {...(readonly number[])} subtrahends - Zero or more subtrahend arrays, each strictly increasing with finite numbers.
 * @returns {number[]} New strictly increasing array containing `A \ (⋃ subtrahends)`.
 * @throws {TypeError} If `a` or any subtrahend is not an Array, is sparse, or contains a non-number element.
 * @throws {RangeError} If any element is non-finite (`NaN`, `±Infinity`), unsorted, or duplicated within its array.
 */
export function setDifferenceSortedArrSeries(a, ...subtrahends) {
  validateSortedUniqueNumericArray(a, 0);
  const k = subtrahends.length;
  for (let m = 0; m < k; m++) {
    validateSortedUniqueNumericArray(subtrahends[m], m + 1);
  }

  const n = a.length;
  if (n === 0) {
    return [];
  }

  if (k === 0) {
    const copy = new Array(n);
    for (let i = 0; i < n; i++) {
      const av = a[i];
      copy[i] = av === 0 ? 0 : av;
    }
    return copy;
  }

  if (k === 1) {
    return diffTwoSorted(a, subtrahends[0]);
  }

  // Simultaneous multi-pointer merge scan computing A \ (B_1 ∪ B_2 ∪ ... ∪ B_k)
  const ptrs = new Array(k).fill(0);
  const result = [];

  for (let i = 0; i < n; i++) {
    const x = a[i];
    let excluded = false;

    for (let m = 0; m < k; m++) {
      const b = subtrahends[m];
      const len = b.length;
      let p = ptrs[m];

      while (p < len && b[p] < x) {
        p++;
      }

      if (p < len && b[p] === x) {
        ptrs[m] = p + 1;
        excluded = true;
        break;
      }

      ptrs[m] = p;
    }

    if (!excluded) {
      result.push(x === 0 ? 0 : x);
    }
  }

  return result;
}
