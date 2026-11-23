/**
 * Zadeh fuzzy logical OR (fuzzy set union / standard S-norm) over membership
 * degrees in [0, 1], implemented with a precomputed lookup table for hundredths
 * grid values and a bounded memoization cache for off-grid floating-point inputs.
 *
 * Supports:
 * - Scalar membership values in [0, 1]: `orFuzzyMemo(a, b, ...rest)` -> `number`
 * - Indexed fuzzy sets as equal-length `number[]`: returns a new `number[]`
 * - Named fuzzy sets as plain objects (`Record<string, number>`): returns a new object over the union of keys (missing keys default to `0`)
 * - Named fuzzy sets as `Map<unknown, number>`: returns a new `Map` over the union of keys (missing keys default to `0`)
 *
 * @module ops/logic-set/orFuzzyMemo
 */

const GRID_STEPS = 100;
const GRID_SIZE = GRID_STEPS + 1;
const MAX_MEMO_SIZE = 4096;

/**
 * Precomputed (101 x 101) Zadeh OR lookup table for exact hundredths in [0, 1].
 * Entry `OR_TABLE[i * GRID_SIZE + j]` stores `max(i / 100, j / 100)`.
 */
const OR_TABLE = new Float64Array(GRID_SIZE * GRID_SIZE);
for (let i = 0; i < GRID_SIZE; i += 1) {
  const ai = i / GRID_STEPS;
  const rowOffset = i * GRID_SIZE;
  for (let j = 0; j < GRID_SIZE; j += 1) {
    const bj = j / GRID_STEPS;
    OR_TABLE[rowOffset + j] = ai >= bj ? ai : bj;
  }
}

/**
 * Bounded FIFO memoization cache for off-grid floating-point pairs.
 * @type {Map<string, number>}
 */
const memoCache = new Map();

/**
 * Validates that a value is a finite number in [0, 1] and normalizes -0 to 0.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function validateMembership(value, label) {
  if (typeof value !== 'number') {
    throw new TypeError(`${label} must be a number in [0, 1], received ${typeof value}`);
  }
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be a finite number in [0, 1], received ${value}`);
  }
  return value === 0 ? 0 : value;
}

/**
 * Returns the exact grid index in [0, GRID_STEPS] if `x` lies on the
 * precomputed hundredths grid, or -1 otherwise.
 *
 * @param {number} x
 * @returns {number}
 */
function toGridIndex(x) {
  const idx = Math.round(x * GRID_STEPS);
  return idx / GRID_STEPS === x ? idx : -1;
}

/**
 * Computes scalar Zadeh fuzzy OR using the precomputed table or memo cache.
 *
 * @param {number} a Validated membership in [0, 1]
 * @param {number} b Validated membership in [0, 1]
 * @returns {number}
 */
function orScalar(a, b) {
  const ia = toGridIndex(a);
  if (ia !== -1) {
    const ib = toGridIndex(b);
    if (ib !== -1) {
      return OR_TABLE[ia * GRID_SIZE + ib];
    }
  }

  const key = `${a}|${b}`;
  const cached = memoCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  const result = a >= b ? a : b;
  if (memoCache.size >= MAX_MEMO_SIZE) {
    const oldestKey = memoCache.keys().next().value;
    memoCache.delete(oldestKey);
  }
  memoCache.set(key, result);
  return result;
}

/**
 * Checks whether a value is a plain object (`Object.prototype` or `null` proto).
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
 * Classifies a supported fuzzy operand kind.
 *
 * @param {unknown} value
 * @returns {'scalar' | 'array' | 'map' | 'object'}
 */
function classifyOperand(value) {
  if (typeof value === 'number') {
    return 'scalar';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value instanceof Map) {
    return 'map';
  }
  if (isPlainObject(value)) {
    return 'object';
  }
  throw new TypeError(
    'Operands must be membership numbers in [0, 1], arrays, Maps, or plain objects representing fuzzy sets'
  );
}

/**
 * Combines two validated operands of the same kind via Zadeh fuzzy OR.
 *
 * @param {number | number[] | Map<unknown, number> | Record<string, number>} left
 * @param {number | number[] | Map<unknown, number> | Record<string, number>} right
 * @param {'scalar' | 'array' | 'map' | 'object'} kind
 * @returns {number | number[] | Map<unknown, number> | Record<string, number>}
 */
function orPair(left, right, kind) {
  if (kind === 'scalar') {
    return orScalar(
      validateMembership(left, 'a'),
      validateMembership(right, 'b')
    );
  }

  if (kind === 'array') {
    if (left.length !== right.length) {
      throw new RangeError(
        `Fuzzy set arrays must have equal length (received ${left.length} and ${right.length})`
      );
    }
    const out = new Array(left.length);
    for (let i = 0; i < left.length; i += 1) {
      const a = validateMembership(left[i], `left[${i}]`);
      const b = validateMembership(right[i], `right[${i}]`);
      out[i] = orScalar(a, b);
    }
    return out;
  }

  if (kind === 'map') {
    const out = new Map();
    for (const [k, v] of left.entries()) {
      const a = validateMembership(v, `left.get(${String(k)})`);
      const b = right.has(k)
        ? validateMembership(right.get(k), `right.get(${String(k)})`)
        : 0;
      out.set(k, orScalar(a, b));
    }
    for (const [k, v] of right.entries()) {
      if (!left.has(k)) {
        const b = validateMembership(v, `right.get(${String(k)})`);
        out.set(k, orScalar(0, b));
      }
    }
    return out;
  }

  const out = {};
  const leftKeys = Object.keys(left);
  for (let i = 0; i < leftKeys.length; i += 1) {
    const k = leftKeys[i];
    const a = validateMembership(left[k], `left.${k}`);
    const b = Object.hasOwn(right, k)
      ? validateMembership(right[k], `right.${k}`)
      : 0;
    Object.defineProperty(out, k, {
      value: orScalar(a, b),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  const rightKeys = Object.keys(right);
  for (let i = 0; i < rightKeys.length; i += 1) {
    const k = rightKeys[i];
    if (!Object.hasOwn(left, k)) {
      const b = validateMembership(right[k], `right.${k}`);
      Object.defineProperty(out, k, {
        value: orScalar(0, b),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  return out;
}

/**
 * Computes the Zadeh fuzzy OR (union) of two or more fuzzy truth values or
 * fuzzy sets using a precomputed table and bounded memoization cache.
 *
 * For scalar memberships `a, b ∈ [0, 1]`, returns `max(a, b)`.
 * For fuzzy sets (`Array`, `Map`, or plain object), applies Zadeh OR pointwise
 * across the universe of elements (missing keys in objects/Maps default to `0`).
 *
 * @template {number | number[] | Map<unknown, number> | Record<string, number>} T
 * @param {T} a First fuzzy membership degree in [0, 1] or fuzzy set
 * @param {T} b Second fuzzy membership degree in [0, 1] or fuzzy set
 * @param {...T} rest Additional fuzzy membership degrees or fuzzy sets of the same representation
 * @returns {T} The Zadeh fuzzy OR result in the same representation as the inputs
 * @throws {TypeError} If fewer than two arguments are provided, operand kinds mismatch, or any membership is not a number
 * @throws {RangeError} If any membership is outside [0, 1], non-finite, or array fuzzy sets have different lengths
 */
export function orFuzzyMemo(a, b, ...rest) {
  if (arguments.length < 2) {
    throw new TypeError(`orFuzzyMemo requires at least 2 arguments, received ${arguments.length}`);
  }

  const kind = classifyOperand(a);
  if (classifyOperand(b) !== kind) {
    throw new TypeError(`All operands must have the same fuzzy representation (expected ${kind})`);
  }

  let acc = orPair(a, b, kind);
  for (let i = 0; i < rest.length; i += 1) {
    const next = rest[i];
    if (classifyOperand(next) !== kind) {
      throw new TypeError(`All operands must have the same fuzzy representation (expected ${kind})`);
    }
    acc = orPair(acc, next, kind);
  }
  return acc;
}
