/**
 * Validate a single fuzzy membership degree in the closed interval [0, 1].
 *
 * @param {unknown} value - Candidate membership degree.
 * @param {string} label - Descriptive label for error messages.
 * @returns {number} Validated finite membership value in [0, 1].
 * @throws {TypeError} If value is not a number.
 * @throws {RangeError} If value is NaN, non-finite, or outside [0, 1].
 */
function validateMembership(value, label) {
  if (typeof value !== 'number') {
    throw new TypeError(`${label} must be a number, received ${value === null ? 'null' : typeof value}`);
  }
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number in [0, 1], received ${value}`);
  }
  if (value < 0 || value > 1) {
    throw new RangeError(`${label} must be in [0, 1], received ${value}`);
  }
  return value;
}

/**
 * Determine whether a value is a plain object (Object.prototype or null prototype).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Compute the Zadeh fuzzy NOT (standard complement) of a fuzzy truth value or fuzzy set.
 *
 * For each membership degree μ ∈ [0, 1], the Zadeh complement is defined as:
 *   ¬μ = 1 - μ
 *
 * Uses a straightforward iterative implementation without mutating the input.
 * Supports:
 * - Scalar membership value (`number` in [0, 1]) → returns `number`
 * - Indexed fuzzy set (`Array<number>`) → returns a new `Array<number>`
 * - Keyed fuzzy set (`Map<K, number>`) → returns a new `Map<K, number>`
 * - Record fuzzy set (plain `Object` mapping keys to numbers) → returns a new plain `Object`
 *
 * @template K
 * @param {number | number[] | Map<K, number> | Record<string, number>} input
 *   Fuzzy truth value or fuzzy set with membership degrees in [0, 1].
 * @returns {number | number[] | Map<K, number> | Record<string, number>}
 *   The Zadeh fuzzy complement of `input`, preserving its representation.
 * @throws {TypeError} If `input` is not a supported type, contains sparse array holes,
 *   or contains non-numeric membership degrees.
 * @throws {RangeError} If any membership degree is NaN, non-finite, or outside [0, 1].
 */
export function notFuzzyIterative(input) {
  if (typeof input === 'number') {
    const mu = validateMembership(input, 'Membership value');
    return 1 - mu;
  }

  if (Array.isArray(input)) {
    const len = input.length;
    const result = new Array(len);
    for (let i = 0; i < len; i++) {
      if (!(i in input)) {
        throw new TypeError(`Membership array cannot contain sparse hole at index ${i}`);
      }
      const mu = validateMembership(input[i], `Membership value at index ${i}`);
      result[i] = 1 - mu;
    }
    return result;
  }

  if (input instanceof Map) {
    const result = new Map();
    for (const [key, value] of input) {
      const mu = validateMembership(value, `Membership value for key "${String(key)}"`);
      result.set(key, 1 - mu);
    }
    return result;
  }

  if (isPlainObject(input)) {
    const keys = Object.keys(input);
    const result = Object.getPrototypeOf(input) === null ? Object.create(null) : {};
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const mu = validateMembership(input[key], `Membership value for key "${key}"`);
      Object.defineProperty(result, key, {
        value: 1 - mu,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return result;
  }

  throw new TypeError(
    `Input must be a number in [0, 1], an Array, a Map, or a plain Object; received ${
      input === null ? 'null' : typeof input === 'object' ? input.constructor?.name ?? 'object' : typeof input
    }`
  );
}
