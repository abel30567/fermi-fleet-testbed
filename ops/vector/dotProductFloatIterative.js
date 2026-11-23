/**
 * Computes the dot product (inner product) of two vectors over IEEE-754
 * float64 Numbers using a straightforward iterative summation.
 *
 * For vectors `a` and `b` of equal length `n`, returns:
 *   sum_{i = 0}^{n - 1} (a[i] * b[i])
 *
 * Returns `0` for empty vectors.
 *
 * @param {number[] | Float64Array} a - First input vector of finite float64 numbers.
 * @param {number[] | Float64Array} b - Second input vector of finite float64 numbers.
 * @returns {number} The IEEE-754 float64 dot product of `a` and `b`.
 * @throws {TypeError} If `a` or `b` is not an Array or Float64Array, or contains any non-number element (including sparse holes).
 * @throws {RangeError} If `a` and `b` have different lengths, or contain any non-finite number (`NaN`, `Infinity`, `-Infinity`).
 */
export function dotProductFloatIterative(a, b) {
  if (!Array.isArray(a) && !(a instanceof Float64Array)) {
    throw new TypeError('First argument must be an Array or Float64Array of finite numbers');
  }
  if (!Array.isArray(b) && !(b instanceof Float64Array)) {
    throw new TypeError('Second argument must be an Array or Float64Array of finite numbers');
  }

  const len = a.length;
  if (len !== b.length) {
    throw new RangeError(`Vectors must have the same length (got ${len} and ${b.length})`);
  }

  let sum = 0;
  for (let i = 0; i < len; i++) {
    const ai = a[i];
    const bi = b[i];

    if (typeof ai !== 'number') {
      throw new TypeError(`Expected a[${i}] to be a number, got ${typeof ai}`);
    }
    if (!Number.isFinite(ai)) {
      throw new RangeError(`Expected a[${i}] to be a finite number, got ${ai}`);
    }
    if (typeof bi !== 'number') {
      throw new TypeError(`Expected b[${i}] to be a number, got ${typeof bi}`);
    }
    if (!Number.isFinite(bi)) {
      throw new RangeError(`Expected b[${i}] to be a finite number, got ${bi}`);
    }

    sum += ai * bi;
  }

  return sum;
}
