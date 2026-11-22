/**
 * Exact discrete summation over BigInt values using balanced binary reduction
 * and Gauss's closed-form identity for arithmetic ranges.
 *
 * Because summation is linear, fixed-point BigInt values scaled by `10n ** 18n`
 * (or any uniform scale factor) are summed with exact precision and no rounding.
 *
 * Supported call signatures:
 * 1. `summationBigIntSeries(terms)`
 *    Sums an array of `BigInt` values using balanced binary (pairwise) reduction.
 *    Returns `0n` for an empty array.
 *
 * 2. `summationBigIntSeries(start, end, [termFn])`
 *    Sums `termFn(k)` for every `BigInt` integer `k` in `[start, end]` inclusive.
 *    - When `start > end`, returns `0n` (empty sum).
 *    - When `termFn` is omitted or `undefined`, defaults to the identity series
 *      `k => k` and evaluates in O(1) via Gauss's closed-form formula:
 *      `(end - start + 1n) * (start + end) / 2n`.
 *    - When `termFn` is provided, evaluates `termFn(k)` in ascending order from
 *      `start` to `end` and combines the returned `BigInt` terms using balanced
 *      binary reduction.
 *
 * @overload
 * @param {readonly bigint[]} terms - Array of BigInt terms to sum.
 * @returns {bigint} Exact sum of all elements in `terms` (`0n` if empty).
 *
 * @overload
 * @param {bigint} start - Inclusive lower bound of the summation index.
 * @param {bigint} end - Inclusive upper bound of the summation index.
 * @param {(k: bigint) => bigint} [termFn] - Optional term generator returning a BigInt for each index `k`.
 * @returns {bigint} Exact discrete sum over `[start, end]` (`0n` if `start > end`).
 *
 * @throws {TypeError} If argument count is not 1, 2, or 3, or any argument/term is invalid.
 */
export function summationBigIntSeries(first, end, termFn) {
  const argCount = arguments.length;

  if (argCount < 1 || argCount > 3) {
    throw new TypeError(
      `summationBigIntSeries expects 1, 2, or 3 arguments, received ${argCount}`
    );
  }

  if (argCount === 1) {
    if (!Array.isArray(first)) {
      throw new TypeError(
        `Expected an array of BigInts when called with 1 argument, received ${describeType(first)}`
      );
    }

    const len = first.length;
    for (let i = 0; i < len; i += 1) {
      if (typeof first[i] !== 'bigint') {
        throw new TypeError(
          `Expected BigInt at index ${i}, received ${describeType(first[i])}`
        );
      }
    }

    return sumArrayPairwise(first, 0, len);
  }

  const start = first;
  if (typeof start !== 'bigint') {
    throw new TypeError(
      `Expected BigInt for start, received ${describeType(start)}`
    );
  }
  if (typeof end !== 'bigint') {
    throw new TypeError(
      `Expected BigInt for end, received ${describeType(end)}`
    );
  }
  if (termFn !== undefined && typeof termFn !== 'function') {
    throw new TypeError(
      `Expected function or undefined for termFn, received ${describeType(termFn)}`
    );
  }

  if (start > end) {
    return 0n;
  }

  if (termFn === undefined) {
    // Gauss's closed-form arithmetic series identity.
    // count = (end - start + 1n) and (start + end) always have opposite parity,
    // so their product is guaranteed to be evenly divisible by 2n.
    const count = end - start + 1n;
    return (count * (start + end)) / 2n;
  }

  return sumRangePairwise(start, end, termFn);
}

/**
 * Balanced binary (pairwise) reduction over a validated BigInt array slice `[lo, hi)`.
 *
 * @param {readonly bigint[]} terms
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 * @returns {bigint}
 */
function sumArrayPairwise(terms, lo, hi) {
  const len = hi - lo;
  if (len === 0) {
    return 0n;
  }
  if (len === 1) {
    return terms[lo];
  }
  if (len === 2) {
    return terms[lo] + terms[lo + 1];
  }
  const mid = lo + (len >>> 1);
  return sumArrayPairwise(terms, lo, mid) + sumArrayPairwise(terms, mid, hi);
}

/**
 * Balanced binary (pairwise) reduction over `termFn(k)` for `k` in `[lo, hi]`.
 * Evaluates `termFn` strictly in ascending order from `lo` to `hi`.
 *
 * @param {bigint} lo - Inclusive lower bound (`lo <= hi`).
 * @param {bigint} hi - Inclusive upper bound (`lo <= hi`).
 * @param {(k: bigint) => bigint} termFn
 * @returns {bigint}
 */
function sumRangePairwise(lo, hi, termFn) {
  if (lo === hi) {
    const value = termFn(lo);
    if (typeof value !== 'bigint') {
      throw new TypeError(
        `termFn(${lo}n) must return a BigInt, received ${describeType(value)}`
      );
    }
    return value;
  }

  const mid = lo + ((hi - lo) >> 1n);
  return sumRangePairwise(lo, mid, termFn) + sumRangePairwise(mid + 1n, hi, termFn);
}

/**
 * Formats a concise type label for error messages.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describeType(value) {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'Array';
  }
  return typeof value;
}
