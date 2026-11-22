/**
 * Safely formats a map key for error messages without throwing on null-prototype objects.
 *
 * @param {unknown} key - Map key to format.
 * @returns {string} Human-readable representation of `key`.
 */
function formatKey(key) {
  try {
    return String(key);
  } catch {
    return '[unprintable key]';
  }
}

/**
 * Validates that a value is a valid multiset represented as a `Map<unknown, number>`
 * whose counts are finite non-negative safe integers.
 *
 * @param {unknown} multiset - Candidate multiset to validate.
 * @param {string} paramName - Parameter name for descriptive error messages.
 * @throws {TypeError} If `multiset` is not a `Map` or any count is not a `number`.
 * @throws {RangeError} If any count is non-finite, `NaN`, non-integer, negative, or exceeds `Number.MAX_SAFE_INTEGER`.
 */
function validateMultiset(multiset, paramName) {
  if (!(multiset instanceof Map)) {
    throw new TypeError(`Expected "${paramName}" to be a Map.`);
  }

  for (const [key, count] of multiset.entries()) {
    if (typeof count !== 'number') {
      throw new TypeError(
        `Invalid count for key ${formatKey(key)} in "${paramName}": expected a number, got ${typeof count}.`
      );
    }
    if (!Number.isFinite(count) || !Number.isSafeInteger(count) || count < 0) {
      throw new RangeError(
        `Invalid count for key ${formatKey(key)} in "${paramName}": expected a non-negative safe integer, got ${count}.`
      );
    }
  }
}

/**
 * Computes the multiset (bag) difference `A \ B` iteratively over multisets
 * represented as `Map<value, count>`.
 *
 * Mathematical semantics:
 * For every element `x`, its multiplicity in `A \ B` is
 * `m_{A \ B}(x) = max(0, m_A(x) - m_B(x))`, where missing keys have multiplicity `0`.
 * The returned `Map` is canonical (all entries have strictly positive integer counts,
 * omitting zero counts), and neither input `Map` is mutated.
 *
 * @template T
 * @param {Map<T, number>} a - Minuend multiset mapping elements to non-negative safe integer counts.
 * @param {Map<T, number>} b - Subtrahend multiset mapping elements to non-negative safe integer counts.
 * @returns {Map<T, number>} A new canonical multiset `Map` representing `a \ b`.
 * @throws {TypeError} If `a` or `b` is not a `Map`, or if any count in `a` or `b` is not a number.
 * @throws {RangeError} If any count in `a` or `b` is negative, `NaN`, non-finite, or not a safe integer.
 */
export function setDifferenceMultisetIterative(a, b) {
  validateMultiset(a, 'a');
  validateMultiset(b, 'b');

  const result = new Map();

  for (const [key, countA] of a.entries()) {
    if (countA === 0) {
      continue;
    }
    const countB = b.get(key) ?? 0;
    const remaining = countA - countB;
    if (remaining > 0) {
      result.set(key, remaining);
    }
  }

  return result;
}
