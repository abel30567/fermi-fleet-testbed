/**
 * Computes the element-wise sum of two vectors represented as Float64Array instances
 * using a straightforward iterative loop.
 *
 * Algorithm:
 * Allocates a new Float64Array of length `a.length` and iterates from index `0` to
 * `a.length - 1`, validating that each element is finite and storing `a[i] + b[i]`
 * in the output vector. Input arrays are not mutated.
 *
 * @param {Float64Array} a - First input vector of finite numbers.
 * @param {Float64Array} b - Second input vector of finite numbers, with the same length as `a`.
 * @returns {Float64Array} A new Float64Array containing element-wise sums `a[i] + b[i]`.
 * @throws {TypeError} If either `a` or `b` is not a Float64Array instance.
 * @throws {RangeError} If `a` and `b` have different lengths, or if any element in `a` or `b`
 *   is non-finite (`NaN`, `Infinity`, or `-Infinity`).
 */
export function vectorAddTypedIterative(a, b) {
  if (!(a instanceof Float64Array)) {
    throw new TypeError('First argument "a" must be a Float64Array.');
  }
  if (!(b instanceof Float64Array)) {
    throw new TypeError('Second argument "b" must be a Float64Array.');
  }

  const length = a.length;
  if (length !== b.length) {
    throw new RangeError(
      `Vector length mismatch: a has length ${length}, b has length ${b.length}.`
    );
  }

  const result = new Float64Array(length);
  for (let i = 0; i < length; i += 1) {
    const ai = a[i];
    const bi = b[i];
    if (!Number.isFinite(ai)) {
      throw new RangeError(`Element a[${i}] must be a finite number; received ${ai}.`);
    }
    if (!Number.isFinite(bi)) {
      throw new RangeError(`Element b[${i}] must be a finite number; received ${bi}.`);
    }
    result[i] = ai + bi;
  }

  return result;
}
