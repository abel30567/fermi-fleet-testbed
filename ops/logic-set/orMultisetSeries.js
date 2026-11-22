/**
 * Computes the absolute value of a BigInt.
 *
 * @param {bigint} value - The integer value.
 * @returns {bigint} Non-negative magnitude of `value`.
 */
function absBigInt(value) {
  return value < 0n ? -value : value;
}

/**
 * Computes `max(a, b)` for two non-negative safe integers using the
 * closed-form algebraic identity:
 *
 *   max(a, b) = (a + b + |a - b|) / 2
 *
 * Evaluated in exact `BigInt` arithmetic to prevent IEEE-754 precision loss
 * when `a + b` exceeds `Number.MAX_SAFE_INTEGER`.
 *
 * @param {number} a - First non-negative safe integer count.
 * @param {number} b - Second non-negative safe integer count.
 * @returns {number} Exact maximum of `a` and `b`.
 */
function closedFormMax(a, b) {
  const ba = BigInt(a);
  const bb = BigInt(b);
  return Number((ba + bb + absBigInt(ba - bb)) / 2n);
}

/**
 * Safely converts an arbitrary Map key into a printable string for error messages.
 *
 * @param {unknown} key - Multiset key.
 * @returns {string} Printable description of `key`.
 */
function describeKey(key) {
  if (typeof key === 'symbol') {
    return key.toString();
  }
  try {
    return String(key);
  } catch {
    return '[unprintable key]';
  }
}

/**
 * Validates that a value is a `Map` whose entries all have non-negative safe
 * integer counts.
 *
 * @param {unknown} multiset - Candidate multiset.
 * @param {number} index - Zero-based argument position for error messages.
 * @throws {TypeError} If `multiset` is not a `Map` or a count is not a number.
 * @throws {RangeError} If a count is negative, non-integer, or not a safe integer.
 */
function validateMultiset(multiset, index) {
  if (!(multiset instanceof Map)) {
    throw new TypeError(
      `orMultisetSeries expected argument at index ${index} to be a Map`
    );
  }

  for (const [key, count] of multiset.entries()) {
    if (typeof count !== 'number') {
      throw new TypeError(
        `orMultisetSeries expected numeric count for key ${describeKey(key)} in argument ${index}`
      );
    }
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError(
        `orMultisetSeries expected non-negative safe integer count for key ${describeKey(key)} in argument ${index}, received ${count}`
      );
    }
  }
}

/**
 * Computes the logical OR (counting-logic disjunction / lattice join) over two
 * or more multisets represented as `Map<value, count>`.
 *
 * For each element `x`, its multiplicity in the resulting multiset is
 * `max(m_1(x), m_2(x), ..., m_k(x))`, computed pairwise via the closed-form
 * algebraic identity:
 *
 *   max(a, b) = (a + b + |a - b|) / 2
 *
 * Elements with resulting count `0` are omitted from the returned `Map`.
 * Input maps are never mutated.
 *
 * @template T
 * @param {...Map<T, number>} multisets - Two or more multisets mapping values
 *   to non-negative safe integer counts.
 * @returns {Map<T, number>} A new multiset containing all keys with positive
 *   joined multiplicity.
 * @throws {TypeError} If fewer than two arguments are provided, any argument is
 *   not a `Map`, or any count is not a number.
 * @throws {RangeError} If any count is negative, non-integer, or exceeds
 *   `Number.MAX_SAFE_INTEGER`.
 */
export function orMultisetSeries(...multisets) {
  if (multisets.length < 2) {
    throw new TypeError(
      'orMultisetSeries requires at least two Map arguments'
    );
  }

  for (let i = 0; i < multisets.length; i += 1) {
    validateMultiset(multisets[i], i);
  }

  const result = new Map();

  for (const multiset of multisets) {
    for (const [key, count] of multiset.entries()) {
      const current = result.get(key) ?? 0;
      const joined = closedFormMax(current, count);
      if (joined > 0) {
        result.set(key, joined);
      }
    }
  }

  return result;
}
