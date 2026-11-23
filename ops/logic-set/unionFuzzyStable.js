/**
 * Numerically robust Zadeh union over fuzzy logic truth values and fuzzy sets.
 *
 * For fuzzy membership degrees μ ∈ [0, 1], the Zadeh union is defined pointwise as:
 *   μ_{A ∪ B}(x) = max(μ_A(x), μ_B(x))
 *
 * Numerical robustness guarantees:
 * - Evaluates the direct pointwise maximum rather than De Morgan's formulation
 *   `1 - min(1 - a, 1 - b)`, avoiding catastrophic cancellation near 0 (achieving
 *   0 ULP rounding error across the full IEEE-754 range [0, 1], including subnormals
 *   down to `Number.MIN_VALUE`).
 * - Validates every input membership value without short-circuiting so `NaN`,
 *   `±Infinity`, and out-of-range values are never silently masked by larger entries.
 * - Canonicalizes `-0` to `+0` so results are strictly order-invariant and satisfy
 *   `Object.is(result, +0)` at zero membership.
 * - Uses iterative scans rather than argument spreading (`Math.max(...xs)`) to avoid
 *   call-stack overflow on large fuzzy universes.
 * - Uses null-prototype internal aggregation and `Object.defineProperty` when
 *   constructing plain-object results to prevent prototype-pollution hazards
 *   (e.g., keys named `"__proto__"`).
 *
 * Supported input representations (all arguments must share the same kind):
 * - Scalar numbers in `[0, 1]` -> returns a number in `[0, 1]`.
 * - Plain objects (`Record<string, number>`) -> returns a new plain object over
 *   the union of keys (absent keys have implicit membership `0`).
 * - `Map<K, number>` instances -> returns a new `Map<K, number>` over the union
 *   of keys (absent keys have implicit membership `0`).
 * - Equal-length `Array<number>` instances -> returns a new `Array<number>`.
 * - Equal-length TypedArray instances (excluding `DataView` and `BigInt*Array`) ->
 *   returns a new `Float64Array`.
 *
 * @param {...(number|Record<string, number>|Map<*, number>|number[]|ArrayBufferView)} sets
 *   One or more fuzzy sets or scalar fuzzy membership values in `[0, 1]`.
 * @returns {number|Record<string, number>|Map<*, number>|number[]|Float64Array}
 *   The Zadeh fuzzy union in the same representation as the inputs (TypedArrays
 *   return a `Float64Array`).
 * @throws {RangeError} If no arguments are supplied, array/TypedArray lengths
 *   differ, or any membership value is non-finite or outside `[0, 1]`.
 * @throws {TypeError} If any argument has an unsupported type, arguments have
 *   mismatched representations, or any membership value is not a number.
 */
export function unionFuzzyStable(...sets) {
  if (sets.length === 0) {
    throw new RangeError('unionFuzzyStable requires at least one fuzzy set or membership value');
  }

  const kind = detectKind(sets[0], 0);
  for (let i = 1; i < sets.length; i += 1) {
    const k = detectKind(sets[i], i);
    if (k !== kind) {
      throw new TypeError(
        `Argument ${i} has representation "${k}", expected "${kind}" to match argument 0`
      );
    }
  }

  switch (kind) {
    case 'number':
      return unionScalars(sets);
    case 'array':
      return unionArrays(sets);
    case 'typedarray':
      return unionTypedArrays(sets);
    case 'map':
      return unionMaps(sets);
    case 'object':
      return unionPlainObjects(sets);
    default:
      throw new TypeError(`Unsupported fuzzy set representation: ${kind}`);
  }
}

/**
 * Validates that a value is a finite IEEE-754 number in [0, 1] and canonicalizes -0 to +0.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function validateMembership(value, label) {
  if (typeof value !== 'number') {
    throw new TypeError(`Expected numeric membership at ${label}, got ${typeof value}`);
  }
  if (!Number.isFinite(value)) {
    throw new RangeError(`Membership at ${label} must be finite, got ${value}`);
  }
  if (value < 0 || value > 1) {
    throw new RangeError(`Membership at ${label} must be in [0, 1], got ${value}`);
  }
  return value === 0 ? 0 : value;
}

/**
 * Classifies a supported fuzzy-set input representation.
 *
 * @param {unknown} value
 * @param {number} index
 * @returns {'number'|'array'|'typedarray'|'map'|'object'}
 */
function detectKind(value, index) {
  if (typeof value === 'number') {
    return 'number';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (ArrayBuffer.isView(value)) {
    if (
      value instanceof DataView ||
      value instanceof BigInt64Array ||
      value instanceof BigUint64Array
    ) {
      throw new TypeError(`Argument ${index} uses unsupported buffer view type`);
    }
    return 'typedarray';
  }
  if (value instanceof Map) {
    return 'map';
  }
  if (isPlainObject(value)) {
    return 'object';
  }
  throw new TypeError(
    `Argument ${index} must be a number, Array, TypedArray, Map, or plain object`
  );
}

/**
 * Checks whether a value is a plain object (prototype is Object.prototype or null).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Computes exact Zadeh union of validated scalar memberships without short-circuiting.
 *
 * @param {number[]} values
 * @returns {number}
 */
function unionScalars(values) {
  let maxVal = validateMembership(values[0], 'argument 0');
  for (let i = 1; i < values.length; i += 1) {
    const v = validateMembership(values[i], `argument ${i}`);
    if (v > maxVal) {
      maxVal = v;
    }
  }
  return maxVal;
}

/**
 * Computes pointwise Zadeh union over equal-length dense arrays of memberships.
 *
 * @param {number[][]} arrays
 * @returns {number[]}
 */
function unionArrays(arrays) {
  const len = arrays[0].length;
  for (let s = 1; s < arrays.length; s += 1) {
    if (arrays[s].length !== len) {
      throw new RangeError(
        `Array length mismatch at argument ${s}: expected ${len}, got ${arrays[s].length}`
      );
    }
  }

  const out = new Array(len);
  const first = arrays[0];
  for (let i = 0; i < len; i += 1) {
    if (!(i in first)) {
      throw new TypeError(`Sparse array hole at argument 0 index ${i}`);
    }
    out[i] = validateMembership(first[i], `argument 0[${i}]`);
  }

  for (let s = 1; s < arrays.length; s += 1) {
    const arr = arrays[s];
    for (let i = 0; i < len; i += 1) {
      if (!(i in arr)) {
        throw new TypeError(`Sparse array hole at argument ${s} index ${i}`);
      }
      const v = validateMembership(arr[i], `argument ${s}[${i}]`);
      if (v > out[i]) {
        out[i] = v;
      }
    }
  }

  return out;
}

/**
 * Computes pointwise Zadeh union over equal-length numeric TypedArrays.
 *
 * @param {ArrayBufferView[]} arrays
 * @returns {Float64Array}
 */
function unionTypedArrays(arrays) {
  const len = arrays[0].length;
  for (let s = 1; s < arrays.length; s += 1) {
    if (arrays[s].length !== len) {
      throw new RangeError(
        `TypedArray length mismatch at argument ${s}: expected ${len}, got ${arrays[s].length}`
      );
    }
  }

  const out = new Float64Array(len);
  const first = arrays[0];
  for (let i = 0; i < len; i += 1) {
    out[i] = validateMembership(first[i], `argument 0[${i}]`);
  }

  for (let s = 1; s < arrays.length; s += 1) {
    const arr = arrays[s];
    for (let i = 0; i < len; i += 1) {
      const v = validateMembership(arr[i], `argument ${s}[${i}]`);
      if (v > out[i]) {
        out[i] = v;
      }
    }
  }

  return out;
}

/**
 * Computes pointwise Zadeh union over Map fuzzy sets.
 * Absent keys are treated as having membership 0.
 *
 * @param {Map<*, number>[]} maps
 * @returns {Map<*, number>}
 */
function unionMaps(maps) {
  const out = new Map();
  for (let s = 0; s < maps.length; s += 1) {
    for (const [key, raw] of maps[s].entries()) {
      const v = validateMembership(raw, `argument ${s} key ${String(key)}`);
      if (!out.has(key) || v > out.get(key)) {
        out.set(key, v);
      }
    }
  }
  return out;
}

/**
 * Computes pointwise Zadeh union over plain-object fuzzy sets.
 * Absent keys are treated as having membership 0.
 *
 * @param {Record<string, number>[]} objects
 * @returns {Record<string, number>}
 */
function unionPlainObjects(objects) {
  const acc = new Map();
  for (let s = 0; s < objects.length; s += 1) {
    const obj = objects[s];
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const v = validateMembership(obj[key], `argument ${s}["${key}"]`);
      if (!acc.has(key) || v > acc.get(key)) {
        acc.set(key, v);
      }
    }
  }

  const out = {};
  for (const [key, value] of acc.entries()) {
    Object.defineProperty(out, key, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return out;
}
