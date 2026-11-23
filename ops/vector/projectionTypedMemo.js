/**
 * @fileoverview Memoized and precomputed vector projection over Float64Array inputs.
 * Computes the orthogonal projection of vector `a` onto non-zero vector `b`:
 *   proj_b(a) = ((a · b) / (b · b)) * b
 */

const MAX_TARGET_CACHE_SIZE = 512;
const MAX_RESULT_CACHE_SIZE = 1024;
const RESCALE_HIGH = 1e150;
const RESCALE_LOW = 1e-150;

/**
 * Precomputed descriptor for a target vector `b`.
 * @typedef {Object} TargetDescriptor
 * @property {Float64Array} scaledB - Target vector `b`, rescaled by max absolute component when needed to avoid overflow/underflow.
 * @property {number} normSq - Squared Euclidean norm of `scaledB` (`scaledB · scaledB`).
 */

/** @type {Map<string, TargetDescriptor>} */
const targetCache = new Map();

/** @type {Map<string, Float64Array>} */
const resultCache = new Map();

/**
 * Validates that a value is a Float64Array with finite entries and computes its
 * canonical value key (normalizing `-0` to `0`) along with max absolute value.
 *
 * @param {unknown} vec - Candidate vector to validate.
 * @param {string} name - Parameter name for error diagnostics.
 * @returns {{ key: string, maxAbs: number }} Canonical key and max absolute entry.
 */
function validateAndKey(vec, name) {
  if (!(vec instanceof Float64Array)) {
    throw new TypeError(`Expected "${name}" to be a Float64Array`);
  }

  const len = vec.length;
  const parts = new Array(len);
  let maxAbs = 0;

  for (let i = 0; i < len; i++) {
    const val = vec[i];
    if (!Number.isFinite(val)) {
      throw new RangeError(
        `Expected all elements of "${name}" to be finite numbers (index ${i})`
      );
    }
    const normVal = val === 0 ? 0 : val;
    const absVal = Math.abs(normVal);
    if (absVal > maxAbs) {
      maxAbs = absVal;
    }
    parts[i] = String(normVal);
  }

  return { key: `${len}:${parts.join(',')}`, maxAbs };
}

/**
 * Retrieves an entry from an LRU Map, refreshing its recency on hit.
 *
 * @template T
 * @param {Map<string, T>} cache
 * @param {string} key
 * @returns {T | undefined}
 */
function lruGet(cache, key) {
  const value = cache.get(key);
  if (value !== undefined) {
    cache.delete(key);
    cache.set(key, value);
  }
  return value;
}

/**
 * Inserts an entry into a bounded LRU Map, evicting the least recently used entry if full.
 *
 * @template T
 * @param {Map<string, T>} cache
 * @param {string} key
 * @param {T} value
 * @param {number} maxSize
 */
function lruSet(cache, key, value, maxSize) {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= maxSize) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, value);
}

/**
 * Looks up or precomputes the target descriptor (`scaledB` and `normSq`) for `b`.
 *
 * @param {Float64Array} b - Non-zero target vector.
 * @param {string} bKey - Canonical key for `b`.
 * @param {number} bMaxAbs - Maximum absolute component of `b`.
 * @returns {TargetDescriptor}
 */
function getTargetDescriptor(b, bKey, bMaxAbs) {
  const cached = lruGet(targetCache, bKey);
  if (cached !== undefined) {
    return cached;
  }

  const len = b.length;
  const needsRescale = bMaxAbs > RESCALE_HIGH || bMaxAbs < RESCALE_LOW;
  const scaledB = new Float64Array(len);
  let normSq = 0;

  if (needsRescale) {
    const invScale = 1 / bMaxAbs;
    for (let i = 0; i < len; i++) {
      const s = b[i] * invScale;
      const clean = s === 0 ? 0 : s;
      scaledB[i] = clean;
      normSq += clean * clean;
    }
  } else {
    for (let i = 0; i < len; i++) {
      const v = b[i];
      const clean = v === 0 ? 0 : v;
      scaledB[i] = clean;
      normSq += clean * clean;
    }
  }

  const descriptor = { scaledB, normSq };
  lruSet(targetCache, bKey, descriptor, MAX_TARGET_CACHE_SIZE);
  return descriptor;
}

/**
 * Computes the vector projection of `a` onto `b`:
 *   proj_b(a) = ((a · b) / (b · b)) * b
 *
 * Uses a two-level memoized / precomputed table implementation:
 * 1. Precomputes and caches target vector descriptors (`scaledB`, `normSq`) per unique `b`.
 * 2. Memoizes full projection results per `(a, b)` value pair, returning a fresh
 *    `Float64Array` copy on every invocation to guarantee cache immutability.
 *
 * @param {Float64Array} a - Source vector to be projected.
 * @param {Float64Array} b - Non-zero target vector onto which `a` is projected.
 * @returns {Float64Array} A new `Float64Array` containing the projection of `a` onto `b`.
 * @throws {TypeError} If `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If `a` and `b` have different lengths, are empty, contain non-finite
 *   values, or if `b` is the zero vector.
 */
export function projectionTypedMemo(a, b) {
  if (!(a instanceof Float64Array)) {
    throw new TypeError('Expected "a" to be a Float64Array');
  }
  if (!(b instanceof Float64Array)) {
    throw new TypeError('Expected "b" to be a Float64Array');
  }
  if (a.length !== b.length) {
    throw new RangeError(
      `Vector length mismatch: a.length (${a.length}) !== b.length (${b.length})`
    );
  }
  if (a.length === 0) {
    throw new RangeError('Vectors must be non-empty');
  }

  const { key: aKey } = validateAndKey(a, 'a');
  const { key: bKey, maxAbs: bMaxAbs } = validateAndKey(b, 'b');

  if (bMaxAbs === 0) {
    throw new RangeError('Cannot project onto the zero vector');
  }

  const pairKey = `${aKey}|${bKey}`;
  const cachedResult = lruGet(resultCache, pairKey);
  if (cachedResult !== undefined) {
    return new Float64Array(cachedResult);
  }

  const { scaledB, normSq } = getTargetDescriptor(b, bKey, bMaxAbs);
  const len = a.length;

  let dot = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * scaledB[i];
  }

  const scalar = dot / normSq;
  const computed = new Float64Array(len);

  for (let i = 0; i < len; i++) {
    const val = scalar * scaledB[i];
    computed[i] = val === 0 ? 0 : val;
  }

  lruSet(resultCache, pairKey, computed, MAX_RESULT_CACHE_SIZE);
  return new Float64Array(computed);
}
