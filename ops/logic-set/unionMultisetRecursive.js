/**
 * Recursive (divide-and-conquer) multiset union over `Map<value, count>`.
 *
 * Computes the standard multiset union where the multiplicity of each element
 * `x` is `max(M_1(x), M_2(x), ..., M_k(x))`, omitting any entries with count 0.
 *
 * Both the list of input multisets and the entries of each multiset are
 * processed using divide-and-conquer recursion, keeping call-stack depth
 * `O(log k + log n)` and leaving all input maps unmodified.
 *
 * @module ops/logic-set/unionMultisetRecursive
 */

/**
 * Recursively validates all entries in `entries[lo..hi)` of a multiset.
 *
 * @param {Array<[unknown, unknown]>} entries - Array of `[value, count]` pairs.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @param {number} argIndex - Zero-based argument index for error reporting.
 * @throws {TypeError} If any count is not a number.
 * @throws {RangeError} If any count is negative, non-integer, or non-finite.
 */
function validateEntriesRecursive(entries, lo, hi, argIndex) {
  if (lo >= hi) {
    return;
  }
  if (hi - lo === 1) {
    const [, count] = entries[lo];
    if (typeof count !== 'number') {
      throw new TypeError(
        `Multiset at argument ${argIndex} has non-numeric count: ${String(count)}`
      );
    }
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError(
        `Multiset at argument ${argIndex} has invalid count ${count}; expected a non-negative integer`
      );
    }
    return;
  }
  const mid = (lo + hi) >>> 1;
  validateEntriesRecursive(entries, lo, mid, argIndex);
  validateEntriesRecursive(entries, mid, hi, argIndex);
}

/**
 * Recursively validates that every element in `multisets[lo..hi)` is a `Map`
 * with non-negative integer counts, returning normalized entry arrays.
 *
 * @param {Array<unknown>} multisets - Raw input arguments.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @param {Array<Array<[unknown, number]>>} outEntries - Output array of entry lists.
 * @throws {TypeError} If any input is not a `Map` or has a non-numeric count.
 * @throws {RangeError} If any count is negative, non-integer, or non-finite.
 */
function validateAllRecursive(multisets, lo, hi, outEntries) {
  if (lo >= hi) {
    return;
  }
  if (hi - lo === 1) {
    const candidate = multisets[lo];
    if (!(candidate instanceof Map)) {
      throw new TypeError(
        `Expected argument ${lo} to be a Map, received ${candidate === null ? 'null' : typeof candidate}`
      );
    }
    const entries = Array.from(candidate.entries());
    validateEntriesRecursive(entries, 0, entries.length, lo);
    outEntries[lo] = entries;
    return;
  }
  const mid = (lo + hi) >>> 1;
  validateAllRecursive(multisets, lo, mid, outEntries);
  validateAllRecursive(multisets, mid, hi, outEntries);
}

/**
 * Recursively merges `entries[lo..hi)` into `target` using max multiplicity,
 * omitting zero-count entries.
 *
 * @template T
 * @param {Map<T, number>} target - Accumulator map to update.
 * @param {Array<[T, number]>} entries - Validated `[value, count]` entries.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @returns {Map<T, number>} The updated `target` map.
 */
function mergeEntriesRecursive(target, entries, lo, hi) {
  if (lo >= hi) {
    return target;
  }
  if (hi - lo === 1) {
    const [key, count] = entries[lo];
    if (count > 0) {
      const existing = target.get(key) ?? 0;
      if (count > existing) {
        target.set(key, count);
      }
    }
    return target;
  }
  const mid = (lo + hi) >>> 1;
  mergeEntriesRecursive(target, entries, lo, mid);
  mergeEntriesRecursive(target, entries, mid, hi);
  return target;
}

/**
 * Combines two internally owned normalized multiset maps via divide-and-conquer.
 *
 * @template T
 * @param {Map<T, number>} left - Left normalized multiset.
 * @param {Map<T, number>} right - Right normalized multiset.
 * @returns {Map<T, number>} Union of `left` and `right`.
 */
function unionPairRecursive(left, right) {
  const rightEntries = Array.from(right.entries());
  return mergeEntriesRecursive(left, rightEntries, 0, rightEntries.length);
}

/**
 * Divide-and-conquer union over `entryLists[lo..hi)`.
 *
 * @template T
 * @param {Array<Array<[T, number]>>} entryLists - Validated entry arrays per multiset.
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @returns {Map<T, number>} Fresh multiset map representing the union.
 */
function unionRangeRecursive(entryLists, lo, hi) {
  const len = hi - lo;
  if (len === 0) {
    return new Map();
  }
  if (len === 1) {
    const entries = entryLists[lo];
    return mergeEntriesRecursive(new Map(), entries, 0, entries.length);
  }
  const mid = (lo + hi) >>> 1;
  const left = unionRangeRecursive(entryLists, lo, mid);
  const right = unionRangeRecursive(entryLists, mid, hi);
  return unionPairRecursive(left, right);
}

/**
 * Computes the multiset union of zero or more multisets represented as
 * `Map<value, count>`, where each element's resulting multiplicity is
 * `max(count_1, count_2, ..., count_k)` and zero-count entries are omitted.
 *
 * Uses divide-and-conquer recursion over both the argument list and each
 * multiset's entries. Does not mutate any input map.
 *
 * @template T
 * @param {...Map<T, number>} multisets - Zero or more multisets (`Map<value, count>`).
 * @returns {Map<T, number>} A new `Map` representing the multiset union.
 * @throws {TypeError} If any argument is not a `Map` or contains a non-numeric count.
 * @throws {RangeError} If any count is negative, non-integer, or non-finite.
 */
export function unionMultisetRecursive(...multisets) {
  if (multisets.length === 0) {
    return new Map();
  }
  const entryLists = new Array(multisets.length);
  validateAllRecursive(multisets, 0, multisets.length, entryLists);
  return unionRangeRecursive(entryLists, 0, entryLists.length);
}
