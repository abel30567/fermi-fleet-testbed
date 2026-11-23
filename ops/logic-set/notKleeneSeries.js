/**
 * Three-valued Kleene logic ($K_3$) negation (`not`) over scalar truth values
 * and partial sets, implemented via a closed-form series identity.
 *
 * Mathematical formulation:
 * Embedding Kleene truth values into the unit interval $[0, 1]$ via
 * $\phi(\text{false}) = 0$, $\phi(\text{unknown}) = \tfrac{1}{2}$,
 * $\phi(\text{true}) = 1$, strong Kleene negation admits the exact finite
 * Taylor/Newton series around the fixed point $x_0 = \tfrac{1}{2}$:
 *
 * $$N(x) = \frac{1}{2} - \left(x - \frac{1}{2}\right) = 1 - x$$
 *
 * All higher-order terms vanish identically, and $0, \tfrac{1}{2}, 1$ are
 * exact in IEEE-754 binary floating point, giving an exact closed-form
 * involution $N(N(x)) = x$.
 *
 * For partial sets:
 * - Characteristic representations (`Array`, `Map`, or plain `Object` mapping
 *   elements to Kleene truth values) apply $\chi_{\neg A}(u) = 1 - \chi_A(u)$
 *   pointwise.
 * - Dual-set representations `{ include: Set, exclude: Set }` (disjoint
 *   positive/negative extensions $(A^+, A^-)$) satisfy the exact complement
 *   identity $\neg(A^+, A^-) = (A^-, A^+)$.
 *
 * @typedef {boolean | null | 'unknown'} KleeneValue
 * @typedef {{ include: Set<unknown>, exclude: Set<unknown> }} DualPartialSet
 * @typedef {KleeneValue[] | Map<unknown, KleeneValue> | Record<string, KleeneValue> | DualPartialSet} PartialSet
 */

/**
 * Checks whether a value is a valid scalar Kleene truth value.
 *
 * @param {unknown} value
 * @returns {value is KleeneValue}
 */
function isKleeneScalar(value) {
  return value === true || value === false || value === null || value === 'unknown';
}

/**
 * Encodes a validated scalar Kleene truth value into $[0, 1]$.
 *
 * @param {KleeneValue} value
 * @returns {0 | 0.5 | 1}
 */
function encodeUnit(value) {
  if (value === true) return 1;
  if (value === false) return 0;
  return 0.5;
}

/**
 * Decodes a unit-interval truth value in $\{0, 0.5, 1\}$ back to a Kleene
 * scalar, preserving the caller's representation of unknown (`null` vs
 * `'unknown'`) so involution holds strictly.
 *
 * @param {number} x
 * @param {null | 'unknown'} unknownToken
 * @returns {KleeneValue}
 */
function decodeUnit(x, unknownToken) {
  if (x === 1) return true;
  if (x === 0) return false;
  return unknownToken;
}

/**
 * Closed-form series evaluation of Kleene negation on a validated scalar:
 * $N(x) = \tfrac{1}{2} - (x - \tfrac{1}{2}) = 1 - x$.
 *
 * @param {KleeneValue} value
 * @returns {KleeneValue}
 */
function negateScalar(value) {
  const x = encodeUnit(value);
  const fixedPoint = 0.5;
  // Exact 1st-order Taylor/Newton series around x0 = 0.5 (all k >= 2 terms are 0).
  const negated = fixedPoint - (x - fixedPoint);
  const unknownToken = value === 'unknown' ? 'unknown' : null;
  return decodeUnit(negated, unknownToken);
}

/**
 * Checks whether a value is a plain object (`Object.prototype` or `null` proto).
 *
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Checks whether a plain object uses the dual-set `{ include: Set, exclude: Set }`
 * partial-set representation.
 *
 * @param {Record<string, unknown>} obj
 * @param {string[]} keys
 * @returns {boolean}
 */
function isDualPartialSet(obj, keys) {
  return (
    keys.length === 2 &&
    Object.hasOwn(obj, 'include') &&
    Object.hasOwn(obj, 'exclude') &&
    obj.include instanceof Set &&
    obj.exclude instanceof Set
  );
}

/**
 * Computes Kleene three-valued logical negation (`not`) over a scalar Kleene
 * value (`true`, `false`, `null`, or `'unknown'`) or a partial set (`Array`,
 * `Map`, plain characteristic `Object`, or disjoint `{ include: Set, exclude: Set }`).
 *
 * Returns a new value/container of the same kind without mutating the input.
 *
 * @param {KleeneValue | PartialSet} input - A Kleene truth value or partial set.
 * @returns {KleeneValue | PartialSet} The Kleene negation of `input`.
 * @throws {TypeError} If `input` is not a valid Kleene value or supported partial set,
 *   contains invalid membership values, is a sparse array, or has symbol keys on a plain object.
 * @throws {RangeError} If a dual-set partial set has overlapping `include` and `exclude` sets.
 */
export function notKleeneSeries(input) {
  if (isKleeneScalar(input)) {
    return negateScalar(input);
  }

  if (Array.isArray(input)) {
    const result = new Array(input.length);
    for (let i = 0; i < input.length; i++) {
      if (!Object.hasOwn(input, i)) {
        throw new TypeError(`Sparse array hole at index ${i} is not a valid Kleene value`);
      }
      const elem = input[i];
      if (!isKleeneScalar(elem)) {
        throw new TypeError(`Invalid Kleene value at array index ${i}: ${String(elem)}`);
      }
      result[i] = negateScalar(elem);
    }
    return result;
  }

  if (input instanceof Map) {
    const result = new Map();
    for (const [key, val] of input.entries()) {
      if (!isKleeneScalar(val)) {
        throw new TypeError(`Invalid Kleene value in Map for key ${String(key)}: ${String(val)}`);
      }
      result.set(key, negateScalar(val));
    }
    return result;
  }

  if (isPlainObject(input)) {
    if (Object.getOwnPropertySymbols(input).length > 0) {
      throw new TypeError('Plain object partial sets must not contain symbol keys; use a Map instead');
    }

    const keys = Object.keys(input);
    if (isDualPartialSet(input, keys)) {
      const includeSet = /** @type {Set<unknown>} */ (input.include);
      const excludeSet = /** @type {Set<unknown>} */ (input.exclude);

      const [smaller, larger] =
        includeSet.size <= excludeSet.size ? [includeSet, excludeSet] : [excludeSet, includeSet];
      for (const item of smaller) {
        if (larger.has(item)) {
          throw new RangeError(
            `Inconsistent partial set: element ${String(item)} appears in both include and exclude`
          );
        }
      }

      return {
        include: new Set(excludeSet),
        exclude: new Set(includeSet),
      };
    }

    const result = Object.getPrototypeOf(input) === null ? Object.create(null) : {};
    for (const key of keys) {
      const val = input[key];
      if (!isKleeneScalar(val)) {
        throw new TypeError(`Invalid Kleene value for property "${key}": ${String(val)}`);
      }
      result[key] = negateScalar(val);
    }
    return result;
  }

  throw new TypeError(
    'Expected a Kleene truth value (true, false, null, "unknown") or partial set (Array, Map, plain Object, or { include: Set, exclude: Set })'
  );
}
