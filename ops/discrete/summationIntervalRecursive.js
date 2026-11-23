/**
 * Pairwise recursive (divide-and-conquer) discrete summation over IEEE-754
 * intervals `[lo, hi]` with outward rounding guaranteeing enclosure.
 *
 * Uses Dekker's exact error-free transformation (`FastTwoSum`) paired with
 * bit-level IEEE-754 `nextDown` / `nextUp` to produce tight directed-rounded
 * interval sums without spurious widening on exact additions.
 *
 * @module ops/discrete/summationIntervalRecursive
 */

const _buf = new ArrayBuffer(8);
const _f64 = new Float64Array(_buf);
const _u64 = new BigUint64Array(_buf);

/**
 * Normalizes `-0` to `+0`.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
  return x === 0 ? 0 : x;
}

/**
 * Returns the least IEEE-754 binary64 number strictly greater than `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
  if (Number.isNaN(x) || x === Infinity) return x;
  if (x === -Infinity) return -Number.MAX_VALUE;
  if (x === 0) return Number.MIN_VALUE;
  _f64[0] = x;
  if (x > 0) {
    _u64[0] += 1n;
  } else {
    _u64[0] -= 1n;
  }
  return normalizeZero(_f64[0]);
}

/**
 * Returns the greatest IEEE-754 binary64 number strictly less than `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
  if (Number.isNaN(x) || x === -Infinity) return x;
  if (x === Infinity) return Number.MAX_VALUE;
  if (x === 0) return -Number.MIN_VALUE;
  _f64[0] = x;
  if (x > 0) {
    _u64[0] -= 1n;
  } else {
    _u64[0] += 1n;
  }
  return normalizeZero(_f64[0]);
}

/**
 * Computes the greatest IEEE-754 binary64 number less than or equal to the
 * exact real sum `a + b` (round toward -Infinity).
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addDown(a, b) {
  if (a === -Infinity || b === -Infinity) return -Infinity;
  if (a === Infinity || b === Infinity) return Infinity;
  let hi = a;
  let lo = b;
  if (Math.abs(hi) < Math.abs(lo)) {
    hi = b;
    lo = a;
  }
  const s = hi + lo;
  if (s === Infinity) return Number.MAX_VALUE;
  if (s === -Infinity) return -Infinity;
  const err = lo - (s - hi);
  return normalizeZero(err < 0 ? nextDown(s) : s);
}

/**
 * Computes the least IEEE-754 binary64 number greater than or equal to the
 * exact real sum `a + b` (round toward +Infinity).
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function addUp(a, b) {
  if (a === Infinity || b === Infinity) return Infinity;
  if (a === -Infinity || b === -Infinity) return -Infinity;
  let hi = a;
  let lo = b;
  if (Math.abs(hi) < Math.abs(lo)) {
    hi = b;
    lo = a;
  }
  const s = hi + lo;
  if (s === Infinity) return Infinity;
  if (s === -Infinity) return -Number.MAX_VALUE;
  const err = lo - (s - hi);
  return normalizeZero(err > 0 ? nextUp(s) : s);
}

/**
 * Adds two intervals `[aLo, aHi]` and `[bLo, bHi]` with outward rounding.
 *
 * @param {[number, number]} a
 * @param {[number, number]} b
 * @returns {[number, number]}
 */
function addInterval(a, b) {
  return [addDown(a[0], b[0]), addUp(a[1], b[1])];
}

/**
 * Validates that `interval` is a finite `[lo, hi]` pair with `lo <= hi` and
 * returns a fresh copy with `-0` normalized to `+0`.
 *
 * @param {unknown} interval
 * @param {number} index
 * @returns {[number, number]}
 */
function validateInterval(interval, index) {
  if (!Array.isArray(interval) || interval.length !== 2) {
    throw new TypeError(
      `Expected interval [lo, hi] at index ${index}, got ${typeof interval}`
    );
  }
  const lo = interval[0];
  const hi = interval[1];
  if (typeof lo !== 'number' || typeof hi !== 'number') {
    throw new TypeError(
      `Interval bounds at index ${index} must be numbers`
    );
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    throw new RangeError(
      `Interval bounds at index ${index} must be finite numbers`
    );
  }
  if (lo > hi) {
    throw new RangeError(
      `Invalid interval at index ${index}: lo (${lo}) > hi (${hi})`
    );
  }
  return [normalizeZero(lo), normalizeZero(hi)];
}

/**
 * Recursively sums `intervals[left..right]` using pairwise divide-and-conquer.
 *
 * @param {Array<[number, number]>} intervals
 * @param {number} left
 * @param {number} right
 * @returns {[number, number]}
 */
function sumArrayRange(intervals, left, right) {
  if (left === right) {
    return validateInterval(intervals[left], left);
  }
  const mid = left + Math.floor((right - left) / 2);
  const leftSum = sumArrayRange(intervals, left, mid);
  const rightSum = sumArrayRange(intervals, mid + 1, right);
  return addInterval(leftSum, rightSum);
}

/**
 * Recursively sums `termFn(k)` for integer `k` in `[left, right]` using
 * pairwise divide-and-conquer.
 *
 * @param {number} left
 * @param {number} right
 * @param {(k: number) => [number, number]} termFn
 * @returns {[number, number]}
 */
function sumIndexedRange(left, right, termFn) {
  if (left === right) {
    return validateInterval(termFn(left), left);
  }
  const mid = left + Math.floor((right - left) / 2);
  const leftSum = sumIndexedRange(left, mid, termFn);
  const rightSum = sumIndexedRange(mid + 1, right, termFn);
  return addInterval(leftSum, rightSum);
}

/**
 * Computes the discrete summation over interval arithmetic `[lo, hi]` with
 * IEEE-754 outward rounding guaranteeing enclosure, using a recursive
 * divide-and-conquer (pairwise) summation algorithm.
 *
 * Supports two call signatures:
 * 1. `summationIntervalRecursive(intervals)` — sums an array of `[lo, hi]` intervals.
 * 2. `summationIntervalRecursive(start, end, termFn)` — sums `termFn(k)` for
 *    integers `k` from `start` through `end` inclusive. If `start > end`,
 *    returns the empty sum `[0, 0]`.
 *
 * Every input interval `[lo, hi]` must consist of finite numbers with `lo <= hi`.
 * If intermediate or final bounds overflow `Number.MAX_VALUE`, outward rounding
 * saturates the lower bound at `Number.MAX_VALUE` (or `-Infinity` on negative
 * overflow) and the upper bound at `+Infinity` (or `-Number.MAX_VALUE` on
 * negative overflow), preserving mathematical enclosure.
 *
 * @overload
 * @param {Array<[number, number]>} intervals - Array of `[lo, hi]` intervals.
 * @returns {[number, number]} Enclosing interval `[sumLo, sumHi]`.
 *
 * @overload
 * @param {number} start - Inclusive starting safe integer index.
 * @param {number} end - Inclusive ending safe integer index.
 * @param {(k: number) => [number, number]} termFn - Function mapping index `k` to `[lo, hi]`.
 * @returns {[number, number]} Enclosing interval `[sumLo, sumHi]`.
 *
 * @param {Array<[number, number]> | number} arg0
 * @param {number} [arg1]
 * @param {(k: number) => [number, number]} [arg2]
 * @returns {[number, number]}
 */
export function summationIntervalRecursive(arg0, arg1, arg2) {
  if (arguments.length === 1) {
    if (!Array.isArray(arg0)) {
      throw new TypeError(
        'Expected an array of [lo, hi] intervals when called with 1 argument'
      );
    }
    if (arg0.length === 0) {
      return [0, 0];
    }
    return sumArrayRange(arg0, 0, arg0.length - 1);
  }

  if (arguments.length === 3) {
    if (typeof arg0 !== 'number' || typeof arg1 !== 'number') {
      throw new TypeError('start and end must be numbers');
    }
    if (!Number.isSafeInteger(arg0) || !Number.isSafeInteger(arg1)) {
      throw new RangeError('start and end must be safe integers');
    }
    if (typeof arg2 !== 'function') {
      throw new TypeError('termFn must be a function');
    }
    if (arg0 > arg1) {
      return [0, 0];
    }
    return sumIndexedRange(arg0, arg1, arg2);
  }

  throw new TypeError(
    `Expected either 1 argument (intervals) or 3 arguments (start, end, termFn), got ${arguments.length}`
  );
}
