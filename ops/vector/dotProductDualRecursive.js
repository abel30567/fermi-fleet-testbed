/**
 * @typedef {Object} DualNumber
 * @property {number} v - Primal value (finite number).
 * @property {number} d - Forward-mode derivative / tangent component (finite number).
 */

/**
 * Validates that a value is an array of valid dual numbers `{ v, d }`.
 *
 * @param {unknown} vec - Candidate vector to validate.
 * @param {string} name - Parameter name for descriptive error messages.
 * @throws {TypeError} If `vec` is not an array or contains an invalid dual element.
 * @throws {RangeError} If any dual component `v` or `d` is not a finite number.
 */
function validateDualVector(vec, name) {
  if (!Array.isArray(vec)) {
    throw new TypeError(`${name} must be an array of dual numbers { v, d }`);
  }
  for (let i = 0; i < vec.length; i += 1) {
    const el = vec[i];
    if (el === null || typeof el !== 'object' || Array.isArray(el)) {
      throw new TypeError(`${name}[${i}] must be a dual number object { v, d }`);
    }
    if (typeof el.v !== 'number' || typeof el.d !== 'number') {
      throw new TypeError(`${name}[${i}] must have numeric properties v and d`);
    }
    if (!Number.isFinite(el.v) || !Number.isFinite(el.d)) {
      throw new RangeError(`${name}[${i}] must have finite v and d components`);
    }
  }
}

/**
 * Recursively computes the dual dot product over the half-open slice `[start, end)`.
 *
 * @param {DualNumber[]} a - First validated dual vector.
 * @param {DualNumber[]} b - Second validated dual vector.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index (must satisfy `end > start`).
 * @returns {DualNumber} Dual dot product of the slice.
 */
function dotRange(a, b, start, end) {
  if (end - start === 1) {
    const x = a[start];
    const y = b[start];
    return {
      v: x.v * y.v,
      d: x.v * y.d + x.d * y.v,
    };
  }

  const mid = start + ((end - start) >>> 1);
  const left = dotRange(a, b, start, mid);
  const right = dotRange(a, b, mid, end);

  return {
    v: left.v + right.v,
    d: left.d + right.d,
  };
}

/**
 * Computes the vector dot product over arrays of dual numbers `{ v, d }`
 * carrying forward-mode derivatives alongside values, using a recursive
 * divide-and-conquer split-and-sum strategy.
 *
 * For two dual numbers `x = (x.v, x.d)` and `y = (y.v, y.d)`:
 * - Product: `(x.v * y.v, x.v * y.d + x.d * y.v)`
 * - Sum: `(x.v + y.v, x.d + y.d)`
 *
 * @param {DualNumber[]} a - First vector of dual numbers.
 * @param {DualNumber[]} b - Second vector of dual numbers (same length as `a`).
 * @returns {DualNumber} The resulting dual number `{ v, d }`.
 * @throws {TypeError} If `a` or `b` is not an array or contains invalid dual elements.
 * @throws {RangeError} If `a` and `b` have different lengths or contain non-finite components.
 */
export function dotProductDualRecursive(a, b) {
  validateDualVector(a, 'a');
  validateDualVector(b, 'b');

  if (a.length !== b.length) {
    throw new RangeError(
      `Vectors must have the same length (got ${a.length} and ${b.length})`,
    );
  }

  if (a.length === 0) {
    return { v: 0, d: 0 };
  }

  return dotRange(a, b, 0, a.length);
}
