/**
 * @fileoverview Recursive / divide-and-conquer implementation of three-valued
 * Kleene strong logic (K3) exclusive OR (XOR) over scalar Kleene values,
 * arrays of Kleene values, and partial sets (plain objects or Maps).
 *
 * Truth table for Kleene K3 XOR: `A ⊕ B = (A ∨ B) ∧ ¬(A ∧ B)`
 *
 * | A \ B     | true      | false     | 'unknown' |
 * |-----------|-----------|-----------|-----------|
 * | true      | false     | true      | 'unknown' |
 * | false     | true      | false     | 'unknown' |
 * | 'unknown' | 'unknown' | 'unknown' | 'unknown' |
 *
 * Algebraic properties:
 * - Commutative: `A ⊕ B = B ⊕ A`
 * - Associative: `(A ⊕ B) ⊕ C = A ⊕ (B ⊕ C)`
 * - Identity element: `false` (`false ⊕ A = A`)
 * - Absorbing element: `'unknown'` (`'unknown' ⊕ A = 'unknown'`)
 */

/**
 * Valid Kleene three-valued truth value.
 * @typedef {boolean | 'unknown'} KleeneValue
 */

/**
 * Plain-object representation of a partial set mapping element keys to
 * three-valued Kleene membership values. Missing keys are treated as `false`.
 * @typedef {Record<string, KleeneValue>} KleenePlainPartialSet
 */

/**
 * Map representation of a partial set mapping arbitrary element keys to
 * three-valued Kleene membership values. Missing keys are treated as `false`.
 * @typedef {Map<unknown, KleeneValue>} KleeneMapPartialSet
 */

/**
 * Either plain-object or Map partial set representation.
 * @typedef {KleenePlainPartialSet | KleeneMapPartialSet} KleenePartialSet
 */

const UNKNOWN = 'unknown';

/**
 * Checks whether a value is a valid three-valued Kleene truth value.
 *
 * @param {unknown} value - Candidate value to test.
 * @returns {value is KleeneValue} `true` if value is `true`, `false`, or `'unknown'`.
 */
function isKleeneValue(value) {
  return value === true || value === false || value === UNKNOWN;
}

/**
 * Checks whether a value is a plain object (`Object.prototype` or `null` prototype).
 *
 * @param {unknown} value - Candidate value to test.
 * @returns {value is Record<string, unknown>} `true` if value is a plain object.
 */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Asserts that a value is a valid Kleene truth value.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} context - Error context description.
 * @throws {TypeError} If the value is not `true`, `false`, or `'unknown'`.
 */
function assertKleeneValue(value, context) {
  if (!isKleeneValue(value)) {
    throw new TypeError(
      `Invalid Kleene value at ${context}: expected true, false, or 'unknown', received ${describeValue(value)}`
    );
  }
}

/**
 * Formats a value concisely for validation error messages.
 *
 * @param {unknown} value - Value to describe.
 * @returns {string} Human-readable description.
 */
function describeValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'symbol') return value.toString();
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (typeof value === 'object') {
    const tag = Object.prototype.toString.call(value);
    return tag;
  }
  return String(value);
}

/**
 * Validates that an object is a valid plain-object partial set.
 *
 * @param {unknown} candidate - Candidate partial set.
 * @param {string} context - Error context description.
 * @throws {TypeError} If not a plain object or if any own value is not a Kleene value.
 */
function assertPlainPartialSet(candidate, context) {
  if (!isPlainObject(candidate)) {
    throw new TypeError(
      `Invalid plain-object partial set at ${context}: received ${describeValue(candidate)}`
    );
  }
  for (const key of Object.keys(candidate)) {
    assertKleeneValue(candidate[key], `${context}[${JSON.stringify(key)}]`);
  }
}

/**
 * Validates that a value is a valid Map partial set.
 *
 * @param {unknown} candidate - Candidate partial set.
 * @param {string} context - Error context description.
 * @throws {TypeError} If not a Map or if any entry value is not a Kleene value.
 */
function assertMapPartialSet(candidate, context) {
  if (!(candidate instanceof Map)) {
    throw new TypeError(
      `Invalid Map partial set at ${context}: received ${describeValue(candidate)}`
    );
  }
  for (const [key, value] of candidate.entries()) {
    assertKleeneValue(value, `${context}.get(${describeValue(key)})`);
  }
}

/**
 * Defines an own enumerable data property safely (avoiding `__proto__` mutation).
 *
 * @param {Record<string, KleeneValue>} target - Destination plain object.
 * @param {string} key - Property key.
 * @param {KleeneValue} value - Property value.
 */
function setOwnProperty(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/**
 * Computes binary Kleene strong K3 XOR: `(a ∨ b) ∧ ¬(a ∧ b)`.
 *
 * @param {KleeneValue} a - First Kleene operand.
 * @param {KleeneValue} b - Second Kleene operand.
 * @returns {KleeneValue} Kleene K3 XOR of `a` and `b`.
 */
function xorKleenePair(a, b) {
  if (a === UNKNOWN || b === UNKNOWN) {
    return UNKNOWN;
  }
  return a !== b;
}

/**
 * Recursively reduces a slice `[start, end)` of Kleene values using
 * divide-and-conquer bisection.
 *
 * @param {readonly KleeneValue[]} values - Validated Kleene values.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @returns {KleeneValue} Kleene K3 XOR reduction of the slice.
 */
function reduceKleeneValuesRecursive(values, start, end) {
  const length = end - start;
  if (length === 0) {
    return false;
  }
  if (length === 1) {
    return values[start];
  }
  if (length === 2) {
    return xorKleenePair(values[start], values[start + 1]);
  }
  const mid = start + (length >> 1);
  const left = reduceKleeneValuesRecursive(values, start, mid);
  const right = reduceKleeneValuesRecursive(values, mid, end);
  return xorKleenePair(left, right);
}

/**
 * Reads membership of a key from a partial set, defaulting absent keys to `false`.
 *
 * @param {KleenePartialSet} set - Source partial set.
 * @param {unknown} key - Element key.
 * @param {boolean} isMap - Whether `set` is a Map.
 * @returns {KleeneValue} Membership value (`false` if absent).
 */
function getMembership(set, key, isMap) {
  if (isMap) {
    const map = /** @type {KleeneMapPartialSet} */ (set);
    return map.has(key) ? /** @type {KleeneValue} */ (map.get(key)) : false;
  }
  const obj = /** @type {KleenePlainPartialSet} */ (set);
  const strKey = /** @type {string} */ (key);
  return Object.hasOwn(obj, strKey) ? obj[strKey] : false;
}

/**
 * Merges two disjoint partial-set halves into a single new partial set.
 *
 * @param {KleenePartialSet} left - Left partial-set half.
 * @param {KleenePartialSet} right - Right partial-set half.
 * @param {boolean} isMap - Whether operating on Maps.
 * @returns {KleenePartialSet} Combined partial set.
 */
function mergeDisjointPartialSets(left, right, isMap) {
  if (isMap) {
    const merged = new Map(/** @type {KleeneMapPartialSet} */ (left));
    for (const [k, v] of /** @type {KleeneMapPartialSet} */ (right).entries()) {
      merged.set(k, v);
    }
    return merged;
  }
  /** @type {KleenePlainPartialSet} */
  const merged = {};
  const leftObj = /** @type {KleenePlainPartialSet} */ (left);
  const rightObj = /** @type {KleenePlainPartialSet} */ (right);
  for (const k of Object.keys(leftObj)) {
    setOwnProperty(merged, k, leftObj[k]);
  }
  for (const k of Object.keys(rightObj)) {
    setOwnProperty(merged, k, rightObj[k]);
  }
  return merged;
}

/**
 * Recursively bisects a key slice `[start, end)` and computes the Kleene XOR
 * membership for each key across two partial sets.
 *
 * @param {readonly unknown[]} keys - Deduplicated union of keys.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {KleenePartialSet} setA - First partial set.
 * @param {KleenePartialSet} setB - Second partial set.
 * @param {boolean} isMap - Whether operating on Maps.
 * @returns {KleenePartialSet} Symmetric difference partial set for the key slice.
 */
function xorPartialSetKeysRecursive(keys, start, end, setA, setB, isMap) {
  const length = end - start;
  if (length === 0) {
    return isMap ? new Map() : {};
  }
  if (length === 1) {
    const key = keys[start];
    const value = xorKleenePair(
      getMembership(setA, key, isMap),
      getMembership(setB, key, isMap)
    );
    if (isMap) {
      return new Map([[key, value]]);
    }
    /** @type {KleenePlainPartialSet} */
    const single = {};
    setOwnProperty(single, /** @type {string} */ (key), value);
    return single;
  }
  const mid = start + (length >> 1);
  const left = xorPartialSetKeysRecursive(keys, start, mid, setA, setB, isMap);
  const right = xorPartialSetKeysRecursive(keys, mid, end, setA, setB, isMap);
  return mergeDisjointPartialSets(left, right, isMap);
}

/**
 * Recursively clones a partial set by bisecting its key list.
 *
 * @param {readonly unknown[]} keys - Keys of the partial set.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {KleenePartialSet} source - Source partial set.
 * @param {boolean} isMap - Whether operating on Maps.
 * @returns {KleenePartialSet} Cloned partial set for the key slice.
 */
function clonePartialSetKeysRecursive(keys, start, end, source, isMap) {
  const length = end - start;
  if (length === 0) {
    return isMap ? new Map() : {};
  }
  if (length === 1) {
    const key = keys[start];
    const value = getMembership(source, key, isMap);
    if (isMap) {
      return new Map([[key, value]]);
    }
    /** @type {KleenePlainPartialSet} */
    const single = {};
    setOwnProperty(single, /** @type {string} */ (key), value);
    return single;
  }
  const mid = start + (length >> 1);
  const left = clonePartialSetKeysRecursive(keys, start, mid, source, isMap);
  const right = clonePartialSetKeysRecursive(keys, mid, end, source, isMap);
  return mergeDisjointPartialSets(left, right, isMap);
}

/**
 * Computes the Kleene K3 symmetric difference of two partial sets by
 * recursively bisecting their combined key universe.
 *
 * @param {KleenePartialSet} setA - First partial set.
 * @param {KleenePartialSet} setB - Second partial set.
 * @param {boolean} isMap - Whether operating on Maps.
 * @returns {KleenePartialSet} Symmetric difference partial set.
 */
function xorPartialSetPairRecursive(setA, setB, isMap) {
  /** @type {Set<unknown>} */
  const keyUniverse = new Set();
  if (isMap) {
    for (const k of /** @type {KleeneMapPartialSet} */ (setA).keys()) {
      keyUniverse.add(k);
    }
    for (const k of /** @type {KleeneMapPartialSet} */ (setB).keys()) {
      keyUniverse.add(k);
    }
  } else {
    for (const k of Object.keys(/** @type {KleenePlainPartialSet} */ (setA))) {
      keyUniverse.add(k);
    }
    for (const k of Object.keys(/** @type {KleenePlainPartialSet} */ (setB))) {
      keyUniverse.add(k);
    }
  }
  const keys = Array.from(keyUniverse);
  return xorPartialSetKeysRecursive(keys, 0, keys.length, setA, setB, isMap);
}

/**
 * Recursively reduces a slice `[start, end)` of partial sets via
 * divide-and-conquer bisection.
 *
 * @param {readonly KleenePartialSet[]} sets - Validated partial sets.
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {boolean} isMap - Whether operating on Maps.
 * @returns {KleenePartialSet} Symmetric difference partial set.
 */
function reducePartialSetsRecursive(sets, start, end, isMap) {
  const length = end - start;
  if (length === 1) {
    const only = sets[start];
    const keys = isMap
      ? Array.from(/** @type {KleeneMapPartialSet} */ (only).keys())
      : Object.keys(/** @type {KleenePlainPartialSet} */ (only));
    return clonePartialSetKeysRecursive(keys, 0, keys.length, only, isMap);
  }
  if (length === 2) {
    return xorPartialSetPairRecursive(sets[start], sets[start + 1], isMap);
  }
  const mid = start + (length >> 1);
  const left = reducePartialSetsRecursive(sets, start, mid, isMap);
  const right = reducePartialSetsRecursive(sets, mid, end, isMap);
  return xorPartialSetPairRecursive(left, right, isMap);
}

/**
 * Computes the three-valued Kleene strong logic (K3) exclusive OR (XOR)
 * using a recursive divide-and-conquer algorithm.
 *
 * Supported call forms:
 * 1. Scalar Kleene values: `xorKleeneRecursive(a, b, ...)` where each argument
 *    is `true`, `false`, or `'unknown'`.
 * 2. Array of Kleene values: `xorKleeneRecursive([a, b, ...])`. An empty array
 *    returns the XOR identity element `false`.
 * 3. Partial sets (plain objects or `Map`s): `xorKleeneRecursive(setA, setB, ...)`
 *    or `xorKleeneRecursive([setA, setB, ...])`, computing the symmetric
 *    difference where each key's membership is reduced under Kleene K3 XOR
 *    (missing keys are treated as `false`). All partial sets in a call must use
 *    the same representation (all plain objects or all `Map` instances).
 *
 * @param {...(KleeneValue | readonly KleeneValue[] | KleenePartialSet | readonly KleenePartialSet[])} args
 *   One or more Kleene truth values, a single array of Kleene truth values (or
 *   partial sets), or one or more partial sets of matching representation.
 * @returns {KleeneValue | KleenePartialSet}
 *   The Kleene K3 XOR truth value, or a new partial set (matching input type)
 *   representing the Kleene symmetric difference.
 * @throws {TypeError} If no arguments are provided, if any value is outside
 *   `{true, false, 'unknown'}`, or if incompatible operand kinds are mixed.
 */
export function xorKleeneRecursive(...args) {
  if (args.length === 0) {
    throw new TypeError('xorKleeneRecursive requires at least one argument');
  }

  const first = args[0];

  // Mode 1: Single array argument (array of Kleene values or array of partial sets)
  if (Array.isArray(first)) {
    if (args.length > 1) {
      throw new TypeError(
        'xorKleeneRecursive accepts a single array argument, scalar Kleene values, or partial sets (received multiple arguments starting with an array)'
      );
    }
    if (first.length === 0) {
      return false;
    }

    const head = first[0];
    if (isKleeneValue(head)) {
      for (let i = 0; i < first.length; i += 1) {
        assertKleeneValue(first[i], `args[0][${i}]`);
      }
      return reduceKleeneValuesRecursive(
        /** @type {readonly KleeneValue[]} */ (first),
        0,
        first.length
      );
    }

    if (head instanceof Map) {
      for (let i = 0; i < first.length; i += 1) {
        assertMapPartialSet(first[i], `args[0][${i}]`);
      }
      return reducePartialSetsRecursive(
        /** @type {readonly KleeneMapPartialSet[]} */ (first),
        0,
        first.length,
        true
      );
    }

    if (isPlainObject(head)) {
      for (let i = 0; i < first.length; i += 1) {
        assertPlainPartialSet(first[i], `args[0][${i}]`);
      }
      return reducePartialSetsRecursive(
        /** @type {readonly KleenePlainPartialSet[]} */ (first),
        0,
        first.length,
        false
      );
    }

    throw new TypeError(
      `Invalid array element at args[0][0]: expected Kleene value or partial set, received ${describeValue(head)}`
    );
  }

  // Mode 2: Scalar Kleene values
  if (isKleeneValue(first)) {
    for (let i = 0; i < args.length; i += 1) {
      assertKleeneValue(args[i], `args[${i}]`);
    }
    return reduceKleeneValuesRecursive(
      /** @type {readonly KleeneValue[]} */ (args),
      0,
      args.length
    );
  }

  // Mode 3: Map partial sets
  if (first instanceof Map) {
    for (let i = 0; i < args.length; i += 1) {
      assertMapPartialSet(args[i], `args[${i}]`);
    }
    return reducePartialSetsRecursive(
      /** @type {readonly KleeneMapPartialSet[]} */ (args),
      0,
      args.length,
      true
    );
  }

  // Mode 4: Plain-object partial sets
  if (isPlainObject(first)) {
    for (let i = 0; i < args.length; i += 1) {
      assertPlainPartialSet(args[i], `args[${i}]`);
    }
    return reducePartialSetsRecursive(
      /** @type {readonly KleenePlainPartialSet[]} */ (args),
      0,
      args.length,
      false
    );
  }

  throw new TypeError(
    `Invalid argument at args[0]: expected Kleene value, array of Kleene values, or partial set, received ${describeValue(first)}`
  );
}
