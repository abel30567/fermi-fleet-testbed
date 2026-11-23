/**
 * Recursively computes the scaled sum of squares `{ scale, sumSq }` for the
 * slice `vector[lo..hi)` using divide-and-conquer pairwise combination.
 *
 * Invariant: for finite non-zero inputs, the true sum of squares of
 * `vector[lo..hi)` equals `scale * scale * sumSq` with `scale = max |x_i|`
 * and `1 <= sumSq <= hi - lo`, preventing intermediate overflow and underflow.
 *
 * @param {number[] | Float64Array} vector
 * @param {number} lo Inclusive start index.
 * @param {number} hi Exclusive end index (`hi > lo`).
 * @returns {{ scale: number, sumSq: number }}
 */
function scaledSumSquares(vector, lo, hi) {
  if (hi - lo === 1) {
    const ax = Math.abs(vector[lo]);
    if (ax === 0) {
      return { scale: 0, sumSq: 0 };
    }
    if (ax === Infinity) {
      return { scale: Infinity, sumSq: 1 };
    }
    if (Number.isNaN(ax)) {
      return { scale: NaN, sumSq: NaN };
    }
    return { scale: ax, sumSq: 1 };
  }

  const mid = lo + ((hi - lo) >>> 1);
  const left = scaledSumSquares(vector, lo, mid);
  const right = scaledSumSquares(vector, mid, hi);

  // IEEE-754 hypot semantics: Infinity dominates NaN.
  if (left.scale === Infinity || right.scale === Infinity) {
    return { scale: Infinity, sumSq: 1 };
  }
  if (Number.isNaN(left.scale) || Number.isNaN(right.scale)) {
    return { scale: NaN, sumSq: NaN };
  }
  if (left.scale === 0) {
    return right;
  }
  if (right.scale === 0) {
    return left;
  }

  if (left.scale >= right.scale) {
    const ratio = right.scale / left.scale;
    return {
      scale: left.scale,
      sumSq: left.sumSq + right.sumSq * (ratio * ratio),
    };
  }

  const ratio = left.scale / right.scale;
  return {
    scale: right.scale,
    sumSq: right.sumSq + left.sumSq * (ratio * ratio),
  };
}

/**
 * Computes the Euclidean magnitude (L2 norm) of a vector of IEEE-754 float64
 * numbers using a recursive divide-and-conquer algorithm with overflow- and
 * underflow-safe scaling.
 *
 * Follows IEEE-754 `hypot` semantics for special values:
 * - Empty vector returns `0`.
 * - If any element is `Infinity` or `-Infinity`, returns `Infinity` (even if
 *   another element is `NaN`).
 * - Otherwise, if any element is `NaN`, returns `NaN`.
 *
 * @param {number[] | Float64Array} vector Input vector of float64 numbers.
 * @returns {number} Non-negative Euclidean magnitude of `vector` (or `NaN`).
 * @throws {TypeError} If `vector` is not an Array or Float64Array, or if any
 *   element is not a number.
 */
export function magnitudeFloatRecursive(vector) {
  if (!Array.isArray(vector) && !(vector instanceof Float64Array)) {
    throw new TypeError('vector must be an Array or Float64Array of numbers');
  }

  const n = vector.length;
  for (let i = 0; i < n; i++) {
    if (typeof vector[i] !== 'number') {
      throw new TypeError(`vector element at index ${i} must be a number`);
    }
  }

  if (n === 0) {
    return 0;
  }

  const { scale, sumSq } = scaledSumSquares(vector, 0, n);
  if (scale === Infinity) {
    return Infinity;
  }
  if (Number.isNaN(scale)) {
    return NaN;
  }
  if (scale === 0) {
    return 0;
  }

  return scale * Math.sqrt(sumSq);
}
