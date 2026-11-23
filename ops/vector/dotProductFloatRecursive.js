/**
 * Computes the dot product of two vectors of IEEE-754 float64 numbers using
 * recursive divide-and-conquer pairwise summation.
 *
 * Pairwise summation splits the index range in half recursively and combines
 * partial sums in a balanced binary tree of depth O(log n), reducing rounding
 * error accumulation compared to naive left-to-right summation while avoiding
 * deep call stacks.
 *
 * @param {number[] | Float64Array} a - First input vector of IEEE-754 float64 numbers.
 * @param {number[] | Float64Array} b - Second input vector of IEEE-754 float64 numbers.
 * @returns {number} The IEEE-754 float64 dot product of `a` and `b`.
 * @throws {TypeError} If either input is not an Array or Float64Array, or contains non-number elements.
 * @throws {RangeError} If the two input vectors do not have the same length.
 */
export function dotProductFloatRecursive(a, b) {
  validateVector(a, 'a');
  validateVector(b, 'b');

  if (a.length !== b.length) {
    throw new RangeError(
      `Vector lengths must match (received ${a.length} and ${b.length})`
    );
  }

  if (a.length === 0) {
    return 0;
  }

  return pairwiseDot(a, b, 0, a.length);
}

/**
 * Validates that a value is a dense Array of numbers or a Float64Array.
 *
 * @param {unknown} vec - Value to validate.
 * @param {string} name - Parameter name for error messages.
 */
function validateVector(vec, name) {
  if (vec instanceof Float64Array) {
    return;
  }

  if (!Array.isArray(vec)) {
    throw new TypeError(
      `Expected parameter "${name}" to be an Array or Float64Array`
    );
  }

  for (let i = 0; i < vec.length; i++) {
    if (!(i in vec) || typeof vec[i] !== 'number') {
      throw new TypeError(
        `Expected all elements of "${name}" to be numbers (invalid element at index ${i})`
      );
    }
  }
}

/**
 * Recursively computes the partial dot product over the half-open range [start, end).
 *
 * @param {number[] | Float64Array} a - First input vector.
 * @param {number[] | Float64Array} b - Second input vector.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {number} Partial dot product over [start, end).
 */
function pairwiseDot(a, b, start, end) {
  const len = end - start;
  if (len === 1) {
    return a[start] * b[start];
  }
  if (len === 2) {
    return a[start] * b[start] + a[start + 1] * b[start + 1];
  }

  const mid = start + Math.floor(len / 2);
  return pairwiseDot(a, b, start, mid) + pairwiseDot(a, b, mid, end);
}
