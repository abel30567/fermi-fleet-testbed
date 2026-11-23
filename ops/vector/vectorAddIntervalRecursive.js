/**
 * @fileoverview Recursive divide-and-conquer interval vector addition with
 * genuine IEEE-754 binary64 outward rounding guaranteeing exact enclosure.
 */

const f64View = new Float64Array(1);
const u64View = new BigUint64Array(f64View.buffer);

/**
 * Returns the least IEEE-754 binary64 value strictly greater than `x`
 * (or `Infinity` if `x === Infinity`).
 *
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
  if (x === Infinity) return Infinity;
  if (x === 0) return Number.MIN_VALUE;
  f64View[0] = x;
  if (x > 0) {
    u64View[0] += 1n;
  } else {
    u64View[0] -= 1n;
  }
  const res = f64View[0];
  return res === 0 ? 0 : res;
}

/**
 * Returns the greatest IEEE-754 binary64 value strictly less than `x`
 * (or `-Infinity` if `x === -Infinity`).
 *
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
  if (x === -Infinity) return -Infinity;
  if (x === 0) return -Number.MIN_VALUE;
  f64View[0] = x;
  if (x > 0) {
    u64View[0] -= 1n;
  } else {
    u64View[0] += 1n;
  }
  const res = f64View[0];
  return res === 0 ? 0 : res;
}

/**
 * Computes exact Fast2Sum error-free transformation for finite binary64 numbers
 * `x` and `y`, returning `{ s, err }` such that `s + err === x + y` exactly
 * in the reals whenever `s` is finite.
 *
 * @param {number} x
 * @param {number} y
 * @returns {{ s: number, err: number }}
 */
function exactAddPair(x, y) {
  let a = x;
  let b = y;
  if (Math.abs(a) < Math.abs(b)) {
    a = y;
    b = x;
  }
  const s = a + b;
  if (!Number.isFinite(s)) {
    return { s, err: 0 };
  }
  const err = b - (s - a);
  return { s: s === 0 ? 0 : s, err };
}

/**
 * Computes the greatest IEEE-754 binary64 number less than or equal to the
 * exact real sum `x + y` (round toward -Infinity).
 *
 * @param {number} x Finite binary64 operand.
 * @param {number} y Finite binary64 operand.
 * @returns {number}
 */
function addDown(x, y) {
  const { s, err } = exactAddPair(x, y);
  if (s === Infinity) return Number.MAX_VALUE;
  if (s === -Infinity) return -Infinity;
  return err < 0 ? nextDown(s) : s;
}

/**
 * Computes the least IEEE-754 binary64 number greater than or equal to the
 * exact real sum `x + y` (round toward +Infinity).
 *
 * @param {number} x Finite binary64 operand.
 * @param {number} y Finite binary64 operand.
 * @returns {number}
 */
function addUp(x, y) {
  const { s, err } = exactAddPair(x, y);
  if (s === Infinity) return Infinity;
  if (s === -Infinity) return -Number.MAX_VALUE;
  return err > 0 ? nextUp(s) : s;
}

/**
 * Validates that `iv` is a well-formed finite interval `[lo, hi]` with `lo <= hi`.
 *
 * @param {unknown} iv
 * @param {string} name Vector parameter name for error reporting.
 * @param {number} index Component index for error reporting.
 * @returns {[number, number]}
 */
function validateInterval(iv, name, index) {
  if (!Array.isArray(iv)) {
    throw new TypeError(`${name}[${index}] must be an interval [lo, hi] array`);
  }
  if (iv.length !== 2) {
    throw new RangeError(`${name}[${index}] must have length 2, got ${iv.length}`);
  }
  const [lo, hi] = iv;
  if (typeof lo !== 'number' || typeof hi !== 'number') {
    throw new TypeError(`${name}[${index}] endpoints must be numbers`);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    throw new RangeError(`${name}[${index}] endpoints must be finite numbers`);
  }
  if (lo > hi) {
    throw new RangeError(`${name}[${index}] invalid interval: lo (${lo}) > hi (${hi})`);
  }
  return [lo, hi];
}

/**
 * Recursively computes interval vector addition over `[start, end)` by
 * splitting at the midpoint and combining the two halves.
 *
 * @param {Array<[number, number]>} a
 * @param {Array<[number, number]>} b
 * @param {number} start Inclusive start index.
 * @param {number} end Exclusive end index.
 * @returns {Array<[number, number]>}
 */
function addRangeRecursive(a, b, start, end) {
  const len = end - start;
  if (len === 0) {
    return [];
  }
  if (len === 1) {
    const [aLo, aHi] = validateInterval(a[start], 'a', start);
    const [bLo, bHi] = validateInterval(b[start], 'b', start);
    return [[addDown(aLo, bLo), addUp(aHi, bHi)]];
  }
  const mid = start + (len >>> 1);
  const left = addRangeRecursive(a, b, start, mid);
  const right = addRangeRecursive(a, b, mid, end);
  return left.concat(right);
}

/**
 * Adds two vectors of closed finite real intervals `[lo, hi]` component-wise
 * using a recursive divide-and-conquer strategy and genuine IEEE-754 outward
 * rounding.
 *
 * For every index `i` and every real `x in a[i]`, `y in b[i]`, the resulting
 * interval `[lo, hi] = result[i]` satisfies `lo <= x + y <= hi` in exact real
 * arithmetic (with overflow bounded outward by `±Infinity` / `±Number.MAX_VALUE`).
 *
 * @param {Array<[number, number]>} a First vector of `[lo, hi]` intervals.
 * @param {Array<[number, number]>} b Second vector of `[lo, hi]` intervals.
 * @returns {Array<[number, number]>} Outward-rounded interval vector sum.
 * @throws {TypeError} If `a` or `b` is not an array, or any interval/endpoint has invalid type.
 * @throws {RangeError} If `a` and `b` have different lengths, or any interval has length !== 2,
 *   non-finite endpoints, or `lo > hi`.
 */
export function vectorAddIntervalRecursive(a, b) {
  if (!Array.isArray(a)) {
    throw new TypeError('First argument "a" must be an array of [lo, hi] intervals');
  }
  if (!Array.isArray(b)) {
    throw new TypeError('Second argument "b" must be an array of [lo, hi] intervals');
  }
  if (a.length !== b.length) {
    throw new RangeError(`Vector length mismatch: a.length (${a.length}) !== b.length (${b.length})`);
  }
  return addRangeRecursive(a, b, 0, a.length);
}
