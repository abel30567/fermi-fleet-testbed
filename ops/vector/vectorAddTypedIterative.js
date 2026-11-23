/**
 * Computes the element-wise sum of two Float64Array vectors using a
 * straightforward iterative loop.
 *
 * @param {Float64Array} a - First input vector.
 * @param {Float64Array} b - Second input vector.
 * @returns {Float64Array} A new Float64Array where `result[i] = a[i] + b[i]`.
 * @throws {TypeError} If `a` or `b` is not a Float64Array.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 */
export function vectorAddTypedIterative(a, b) {
  if (!(a instanceof Float64Array)) {
    throw new TypeError('First argument must be a Float64Array');
  }
  if (!(b instanceof Float64Array)) {
    throw new TypeError('Second argument must be a Float64Array');
  }
  if (a.length !== b.length) {
    throw new RangeError(
      `Input Float64Arrays must have equal length (got ${a.length} and ${b.length})`
    );
  }

  const length = a.length;
  const result = new Float64Array(length);

  for (let i = 0; i < length; i += 1) {
    result[i] = a[i] + b[i];
  }

  return result;
}
