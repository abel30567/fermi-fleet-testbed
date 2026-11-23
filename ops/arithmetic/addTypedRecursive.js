/**
 * Element-wise addition of two `Float64Array` instances using a recursive
 * divide-and-conquer strategy.
 *
 * Splits the index range `[start, end)` at its midpoint until reaching
 * single-element base cases, writing sums into a newly allocated output
 * `Float64Array` without mutating either input.
 *
 * @param {Float64Array} a - First input `Float64Array`.
 * @param {Float64Array} b - Second input `Float64Array` (must have the same length as `a`).
 * @returns {Float64Array} A new `Float64Array` where each element `i` equals `a[i] + b[i]`.
 * @throws {TypeError} If `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If `a.length !== b.length`.
 */
export function addTypedRecursive(a, b) {
  if (!(a instanceof Float64Array)) {
    throw new TypeError('First argument must be a Float64Array');
  }
  if (!(b instanceof Float64Array)) {
    throw new TypeError('Second argument must be a Float64Array');
  }
  if (a.length !== b.length) {
    throw new RangeError(
      `Float64Array length mismatch: ${a.length} !== ${b.length}`
    );
  }

  const result = new Float64Array(a.length);
  if (a.length === 0) {
    return result;
  }

  addRange(a, b, result, 0, a.length);
  return result;
}

/**
 * Recursively computes `out[i] = a[i] + b[i]` for `i` in `[start, end)` via
 * divide-and-conquer.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @param {Float64Array} out
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 */
function addRange(a, b, out, start, end) {
  const count = end - start;
  if (count <= 0) {
    return;
  }
  if (count === 1) {
    out[start] = a[start] + b[start];
    return;
  }

  const mid = start + Math.floor(count / 2);
  addRange(a, b, out, start, mid);
  addRange(a, b, out, mid, end);
}
