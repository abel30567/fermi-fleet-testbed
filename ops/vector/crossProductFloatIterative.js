/**
 * Validates that a value is a 3-element array of finite IEEE-754 float64 numbers.
 *
 * @param {unknown} vec - Candidate vector to validate.
 * @param {string} name - Parameter name for error reporting.
 * @throws {TypeError} If `vec` is not an Array or contains non-number elements.
 * @throws {RangeError} If `vec` does not have length 3 or contains NaN/Infinity/-Infinity.
 */
function validateVector3(vec, name) {
  if (!Array.isArray(vec)) {
    throw new TypeError(`${name} must be an Array of 3 finite numbers`);
  }
  if (vec.length !== 3) {
    throw new RangeError(`${name} must have length 3, got ${vec.length}`);
  }
  for (let i = 0; i < 3; i += 1) {
    const value = vec[i];
    if (typeof value !== 'number') {
      throw new TypeError(`${name}[${i}] must be a number, got ${typeof value}`);
    }
    if (!Number.isFinite(value)) {
      throw new RangeError(`${name}[${i}] must be a finite number, got ${value}`);
    }
  }
}

/**
 * Computes the 3D vector cross product `a × b` over IEEE-754 float64 numbers
 * using a straightforward iterative loop over cyclic component indices.
 *
 * For `a = [a0, a1, a2]` and `b = [b0, b1, b2]`, for each axis `k ∈ {0, 1, 2}`:
 *   `result[k] = a[(k + 1) % 3] * b[(k + 2) % 3] - a[(k + 2) % 3] * b[(k + 1) % 3]`
 *
 * Neither input vector is mutated.
 *
 * @param {readonly [number, number, number]} a - First 3D vector of finite float64 numbers.
 * @param {readonly [number, number, number]} b - Second 3D vector of finite float64 numbers.
 * @returns {[number, number, number]} The cross product vector `a × b`.
 * @throws {TypeError} If `a` or `b` is not an Array or contains non-number elements.
 * @throws {RangeError} If `a` or `b` does not have length 3 or contains non-finite numbers (NaN, ±Infinity).
 */
export function crossProductFloatIterative(a, b) {
  validateVector3(a, 'a');
  validateVector3(b, 'b');

  const result = new Array(3);
  for (let k = 0; k < 3; k += 1) {
    const i = (k + 1) % 3;
    const j = (k + 2) % 3;
    result[k] = a[i] * b[j] - a[j] * b[i];
  }

  return result;
}
