/**
 * Performs element-wise multiplication of two {@link Float64Array} instances
 * using a divide-and-conquer recursive algorithm over the index range `[lo, hi)`.
 *
 * @param {Float64Array} a - The first input typed array.
 * @param {Float64Array} b - The second input typed array (must have the same length as `a`).
 * @returns {Float64Array} A new `Float64Array` containing the element-wise products `a[i] * b[i]`.
 * @throws {TypeError} If either `a` or `b` is not an instance of `Float64Array`.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function multiplyTypedRecursive(a, b) {
  if (!(a instanceof Float64Array)) {
    throw new TypeError('First argument must be a Float64Array');
  }
  if (!(b instanceof Float64Array)) {
    throw new TypeError('Second argument must be a Float64Array');
  }
  if (a.length !== b.length) {
    throw new RangeError(
      `Float64Array lengths must match (received ${a.length} and ${b.length})`
    );
  }

  const out = new Float64Array(a.length);
  multiplyRange(a, b, out, 0, a.length);
  return out;
}

/**
 * Recursively computes `out[i] = a[i] * b[i]` for `i` in `[lo, hi)` by splitting
 * the index interval into two halves.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @param {Float64Array} out
 * @param {number} lo - Inclusive start index.
 * @param {number} hi - Exclusive end index.
 */
function multiplyRange(a, b, out, lo, hi) {
  const len = hi - lo;
  if (len <= 0) {
    return;
  }
  if (len === 1) {
    out[lo] = a[lo] * b[lo];
    return;
  }

  const mid = lo + (len >>> 1);
  multiplyRange(a, b, out, lo, mid);
  multiplyRange(a, b, out, mid, hi);
}
