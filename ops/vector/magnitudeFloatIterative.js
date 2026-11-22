/**
 * Computes the square root of a non-negative finite number >= 1 using
 * iterative Newton-Raphson refinement.
 *
 * @param {number} value - Non-negative finite IEEE-754 float64 number.
 * @returns {number} Approximate square root of `value`.
 */
function sqrtIterative(value) {
  if (value === 0 || value === 1) {
    return value;
  }

  let guess = value > 1 ? value : 1;
  for (let i = 0; i < 100; i++) {
    const next = 0.5 * (guess + value / guess);
    if (next >= guess) {
      return next;
    }
    guess = next;
  }

  return guess;
}

/**
 * Computes the Euclidean magnitude (L2 norm) of a vector of IEEE-754 float64
 * numbers using a straightforward iterative implementation.
 *
 * Components are scaled by the maximum absolute value prior to squaring and
 * summing to avoid intermediate overflow and underflow. The final square root
 * is computed iteratively via Newton-Raphson refinement.
 *
 * Special value handling follows IEEE-754 / `Math.hypot` semantics:
 * - An empty vector returns `0`.
 * - If any component is `Infinity` or `-Infinity` (even alongside `NaN`),
 *   returns `Infinity`.
 * - Otherwise, if any component is `NaN`, returns `NaN`.
 *
 * @param {number[]} v - Array of IEEE-754 float64 numbers representing the vector.
 * @returns {number} The Euclidean magnitude (L2 norm) of `v`.
 * @throws {TypeError} If `v` is not an Array or if any element is not a number.
 */
export function magnitudeFloatIterative(v) {
  if (!Array.isArray(v)) {
    throw new TypeError('Expected input to be an array of numbers');
  }

  const len = v.length;
  let maxAbs = 0;
  let hasInfinity = false;
  let hasNaN = false;

  for (let i = 0; i < len; i++) {
    const component = v[i];
    if (typeof component !== 'number') {
      throw new TypeError(
        `Expected all vector elements to be numbers; found ${typeof component} at index ${i}`
      );
    }

    if (component === Infinity || component === -Infinity) {
      hasInfinity = true;
    } else if (Number.isNaN(component)) {
      hasNaN = true;
    } else {
      const absVal = component < 0 ? -component : component;
      if (absVal > maxAbs) {
        maxAbs = absVal;
      }
    }
  }

  if (hasInfinity) {
    return Infinity;
  }
  if (hasNaN) {
    return NaN;
  }
  if (len === 0 || maxAbs === 0) {
    return 0;
  }

  let scaledSumOfSquares = 0;
  for (let i = 0; i < len; i++) {
    const scaled = v[i] / maxAbs;
    scaledSumOfSquares += scaled * scaled;
  }

  return maxAbs * sqrtIterative(scaledSumOfSquares);
}
