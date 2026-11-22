/**
 * Computes the discrete product of all elements in a Float64Array using a
 * straightforward iterative accumulation loop.
 *
 * Algorithm:
 * Initializes an accumulator to the multiplicative identity `1` and iterates
 * sequentially over `values`, validating that each element is finite before
 * multiplying it into the accumulator. By convention, the empty product
 * (for a zero-length Float64Array) returns `1`. Negative zero (`-0`) results
 * are normalized to `+0`.
 *
 * @param {Float64Array} values - Input typed array of finite numbers whose product will be computed.
 * @returns {number} The discrete product of all elements in `values` (`1` if `values` is empty).
 * @throws {TypeError} If `values` is not an instance of `Float64Array`.
 * @throws {RangeError} If any element in `values` is `NaN`, `Infinity`, or `-Infinity`.
 */
export function productTypedIterative(values) {
  if (!(values instanceof Float64Array)) {
    throw new TypeError('values must be a Float64Array');
  }

  let product = 1;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (!Number.isFinite(value)) {
      throw new RangeError(`values[${i}] must be a finite number, got ${value}`);
    }
    product *= value;
  }

  return product === 0 ? 0 : product;
}
