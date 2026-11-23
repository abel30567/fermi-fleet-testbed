/**
 * Dual-number representation `{ v, d }` carrying a primal value `v`
 * and its forward-mode derivative `d` (representing `v + d*eps`, `eps^2 = 0`).
 *
 * @typedef {{ v: number, d: number }} DualNumber
 */

/**
 * Normalizes `-0` to `+0`.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
  return x === 0 ? 0 : x;
}

/**
 * Validates that the input is an array of finite dual-number objects `{ v, d }`.
 *
 * @param {unknown} duals
 * @throws {TypeError} If `duals` is not an array or contains invalid element types.
 * @throws {RangeError} If any `v` or `d` property is not a finite number.
 */
function validateDualArray(duals) {
  if (!Array.isArray(duals)) {
    throw new TypeError('Expected an array of dual numbers { v, d }');
  }

  for (let i = 0; i < duals.length; i += 1) {
    if (!(i in duals)) {
      throw new TypeError(`Element at index ${i} is missing (sparse arrays are not allowed)`);
    }
    const item = duals[i];
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError(`Element at index ${i} must be an object of shape { v, d }`);
    }
    if (typeof item.v !== 'number' || typeof item.d !== 'number') {
      throw new TypeError(`Element at index ${i} must have numeric "v" and "d" properties`);
    }
    if (!Number.isFinite(item.v) || !Number.isFinite(item.d)) {
      throw new RangeError(`Element at index ${i} must have finite "v" and "d" values`);
    }
  }
}

/**
 * Multiplies two dual numbers using the forward-mode product rule:
 * `(v1 + d1*eps)(v2 + d2*eps) = (v1*v2) + (v1*d2 + d1*v2)*eps`.
 *
 * @param {DualNumber} a
 * @param {DualNumber} b
 * @returns {DualNumber}
 */
function multiplyDual(a, b) {
  return {
    v: normalizeZero(a.v * b.v),
    d: normalizeZero(a.v * b.d + a.d * b.v),
  };
}

/**
 * Recursively computes the product of `duals[lo..hi)` via divide-and-conquer.
 *
 * @param {DualNumber[]} duals
 * @param {number} lo Inclusive start index.
 * @param {number} hi Exclusive end index.
 * @returns {DualNumber}
 */
function productRange(duals, lo, hi) {
  const len = hi - lo;
  if (len === 1) {
    const item = duals[lo];
    return {
      v: normalizeZero(item.v),
      d: normalizeZero(item.d),
    };
  }
  const mid = lo + (len >>> 1);
  const left = productRange(duals, lo, mid);
  const right = productRange(duals, mid, hi);
  return multiplyDual(left, right);
}

/**
 * Computes the discrete product of an array of dual numbers `{ v, d }`
 * carrying forward-mode derivatives alongside values, using a recursive
 * divide-and-conquer product tree (`O(log n)` call depth).
 *
 * For an empty array, returns the multiplicative identity `{ v: 1, d: 0 }`.
 *
 * @param {DualNumber[]} duals Array of dual numbers `{ v, d }`.
 * @returns {DualNumber} The dual product `{ v, d }`.
 * @throws {TypeError} If `duals` is not an array or any element is not a valid `{ v, d }` object with numeric fields.
 * @throws {RangeError} If any `v` or `d` value is `NaN`, `Infinity`, or `-Infinity`.
 */
export function productDualRecursive(duals) {
  validateDualArray(duals);
  if (duals.length === 0) {
    return { v: 1, d: 0 };
  }
  return productRange(duals, 0, duals.length);
}
