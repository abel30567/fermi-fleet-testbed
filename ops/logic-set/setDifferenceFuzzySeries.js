/**
 * Computes the Zadeh fuzzy set difference `A \ B = A ∩ B̄` over fuzzy membership
 * values in `[0, 1]` using the exact closed-form algebraic identity:
 *
 *   μ_{A \ B}(x) = min(μ_A(x), 1 - μ_B(x))
 *                = (μ_A(x) + (1 - μ_B(x)) - |μ_A(x) - (1 - μ_B(x))|) / 2
 *
 * Supports four input representations (both arguments must share the same kind):
 * - Scalar membership degrees (`number` in `[0, 1]`)
 * - Equal-length `Array<number>` membership vectors over an indexed universe
 * - `Map<*, number>` fuzzy sets (absent keys have implicit membership `0`)
 * - Plain `Object<string, number>` fuzzy sets (absent keys have implicit membership `0`)
 *
 * @param {number|number[]|Map<*, number>|Record<string, number>} a - Minuend fuzzy set or membership degree in `[0, 1]`.
 * @param {number|number[]|Map<*, number>|Record<string, number>} b - Subtrahend fuzzy set or membership degree in `[0, 1]`.
 * @returns {number|number[]|Map<*, number>|Record<string, number>} Zadeh fuzzy set difference `A \ B` in the same representation as inputs.
 * @throws {TypeError} If inputs have invalid or mismatched types, or contain non-numeric membership values.
 * @throws {RangeError} If any membership value is non-finite or outside `[0, 1]`, or if input arrays have different lengths.
 */
export function setDifferenceFuzzySeries(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    validateMembership(a, 'a');
    validateMembership(b, 'b');
    return fuzzyDiffClosedForm(a, b);
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      throw new RangeError(
        `Input arrays must have equal length (received ${a.length} and ${b.length})`
      );
    }
    const result = new Array(a.length);
    for (let i = 0; i < a.length; i++) {
      validateMembership(a[i], `a[${i}]`);
      validateMembership(b[i], `b[${i}]`);
      result[i] = fuzzyDiffClosedForm(a[i], b[i]);
    }
    return result;
  }

  if (a instanceof Map && b instanceof Map) {
    for (const [key, val] of a.entries()) {
      validateMembership(val, `a.get(${String(key)})`);
    }
    for (const [key, val] of b.entries()) {
      validateMembership(val, `b.get(${String(key)})`);
    }

    const result = new Map();
    for (const [key, muA] of a.entries()) {
      const muB = b.has(key) ? b.get(key) : 0;
      result.set(key, fuzzyDiffClosedForm(muA, muB));
    }
    for (const [key, muB] of b.entries()) {
      if (!a.has(key)) {
        result.set(key, fuzzyDiffClosedForm(0, muB));
      }
    }
    return result;
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    for (const key of keysA) {
      validateMembership(a[key], `a[${JSON.stringify(key)}]`);
    }
    for (const key of keysB) {
      validateMembership(b[key], `b[${JSON.stringify(key)}]`);
    }

    const result = {};
    for (const key of keysA) {
      const muB = Object.hasOwn(b, key) ? b[key] : 0;
      defineOwnDataProperty(result, key, fuzzyDiffClosedForm(a[key], muB));
    }
    for (const key of keysB) {
      if (!Object.hasOwn(a, key)) {
        defineOwnDataProperty(result, key, fuzzyDiffClosedForm(0, b[key]));
      }
    }
    return result;
  }

  throw new TypeError(
    'Inputs a and b must both be numbers in [0, 1], equal-length arrays, Maps, or plain objects'
  );
}

/**
 * Closed-form algebraic identity for Zadeh fuzzy set difference:
 * min(muA, 1 - muB) = 0.5 * (muA + (1 - muB) - |muA - (1 - muB)|).
 *
 * @param {number} muA
 * @param {number} muB
 * @returns {number}
 */
function fuzzyDiffClosedForm(muA, muB) {
  const complementB = 1 - muB;
  const value = 0.5 * (muA + complementB - Math.abs(muA - complementB));
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * Validates that a membership degree is a finite number in `[0, 1]`.
 *
 * @param {unknown} value
 * @param {string} label
 */
function validateMembership(value, label) {
  if (typeof value !== 'number') {
    throw new TypeError(`${label} must be a number in [0, 1]`);
  }
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number in [0, 1], received ${value}`);
  }
  if (value < 0 || value > 1) {
    throw new RangeError(`${label} must be within [0, 1], received ${value}`);
  }
}

/**
 * Returns true if value is a plain object (prototype is Object.prototype or null).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Safely defines an enumerable data property without triggering prototype setters.
 *
 * @param {Record<string, number>} obj
 * @param {string} key
 * @param {number} value
 */
function defineOwnDataProperty(obj, key, value) {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}
