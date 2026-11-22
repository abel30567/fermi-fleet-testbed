/**
 * Recursively computes the element-wise trigonometric sine over the index
 * range `[lo, hi)` using divide-and-conquer, writing results into `out`.
 *
 * @param {Float64Array} input - Source array of finite angles in radians.
 * @param {Float64Array} out - Destination array receiving computed sine values.
 * @param {number} lo - Inclusive lower index bound.
 * @param {number} hi - Exclusive upper index bound.
 * @throws {RangeError} If any element in `[lo, hi)` is `NaN`, `Infinity`, or `-Infinity`.
 */
function computeSinRange(input, out, lo, hi) {
  const len = hi - lo;
  if (len <= 0) {
    return;
  }

  if (len === 1) {
    const angle = input[lo];
    if (!Number.isFinite(angle)) {
      throw new RangeError(
        `sinTypedRecursive: expected finite number at index ${lo}, received ${angle}`,
      );
    }
    out[lo] = Math.sin(angle);
    return;
  }

  const mid = lo + Math.floor(len / 2);
  computeSinRange(input, out, lo, mid);
  computeSinRange(input, out, mid, hi);
}

/**
 * Computes the element-wise trigonometric sine of a `Float64Array` of angles
 * (in radians) using a divide-and-conquer recursive algorithm that splits the
 * index range `[lo, hi)` into halves.
 *
 * The input array is never mutated; a new `Float64Array` of the same length is
 * returned.
 *
 * @param {Float64Array} values - Input angles in radians. Must be a `Float64Array`
 *   containing only finite numbers.
 * @returns {Float64Array} A new `Float64Array` containing `Math.sin(values[i])`
 *   for each index `i`.
 * @throws {TypeError} If `values` is not a `Float64Array`.
 * @throws {RangeError} If any element of `values` is non-finite (`NaN`, `Infinity`, `-Infinity`).
 */
export function sinTypedRecursive(values) {
  if (!(values instanceof Float64Array)) {
    throw new TypeError(
      'sinTypedRecursive: expected values to be a Float64Array',
    );
  }

  const result = new Float64Array(values.length);
  computeSinRange(values, result, 0, values.length);
  return result;
}
