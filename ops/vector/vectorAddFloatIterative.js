/**
 * Computes the element-wise sum of two vectors of IEEE-754 float64 numbers
 * using a straightforward iterative loop.
 *
 * Neither input array is mutated; a new array of the same length is returned.
 * IEEE-754 special values (`NaN`, `Infinity`, `-Infinity`, `-0`) are accepted
 * as valid `number` elements and follow standard JavaScript floating-point
 * addition semantics.
 *
 * Time complexity: O(n), where n is the length of the vectors.
 * Space complexity: O(n) for the output vector.
 *
 * @param {readonly number[]} a - First input vector of IEEE-754 float64 numbers.
 * @param {readonly number[]} b - Second input vector of IEEE-754 float64 numbers.
 * @returns {number[]} A new array containing `a[i] + b[i]` for each index `i`.
 * @throws {TypeError} If either `a` or `b` is not an Array.
 * @throws {RangeError} If `a` and `b` do not have the same length.
 * @throws {TypeError} If any element in `a` or `b` is not a `number` (including sparse holes).
 *
 * @example
 * vectorAddFloatIterative([1.5, 2.25], [0.5, -1.25]);
 * // => [2, 1]
 */
export function vectorAddFloatIterative(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    throw new TypeError('Both inputs must be arrays of numbers.');
  }

  const len = a.length;
  if (len !== b.length) {
    throw new RangeError(
      `Vector length mismatch: expected equal lengths, got ${len} and ${b.length}.`
    );
  }

  const result = new Array(len);
  for (let i = 0; i < len; i += 1) {
    const va = a[i];
    const vb = b[i];
    if (typeof va !== 'number') {
      throw new TypeError(
        `Invalid element in first vector at index ${i}: expected a number, got ${typeof va}.`
      );
    }
    if (typeof vb !== 'number') {
      throw new TypeError(
        `Invalid element in second vector at index ${i}: expected a number, got ${typeof vb}.`
      );
    }
    result[i] = va + vb;
  }

  return result;
}
