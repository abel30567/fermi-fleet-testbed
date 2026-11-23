/**
 * @fileoverview Memoized and table-driven Euclidean magnitude for vectors of dual numbers.
 *
 * A dual number is represented as `{ v, d }`, where `v` is the primal value and `d`
 * is the forward-mode first derivative (tangent component).
 *
 * For a vector `x = [x_0, ..., x_{n-1}]` of dual numbers:
 *   - Primal magnitude: `v = ||x|| = sqrt(sum_i x_i.v^2)`
 *   - Forward-mode derivative: `d = (sum_i x_i.v * x_i.d) / v`
 *
 * Singularity at the zero vector (`v === 0`):
 *   - If every `x_i.d === 0`, the function returns `{ v: 0, d: 0 }`.
 *   - If any `x_i.d !== 0`, the Euclidean norm is not differentiable at the origin
 *     along a non-zero tangent direction, so a `RangeError` is thrown.
 *
 * Implementation details:
 *   - Uses a precomputed canonical lookup table for common small/basis/Pythagorean
 *     dual vectors, backed by a bounded LRU memoization cache (capacity 1024).
 *   - Uses max-magnitude scaling (`M = max_i |x_i.v|`) during computation to avoid
 *     spurious intermediate overflow and underflow.
 *   - Always returns a fresh `{ v, d }` object so callers cannot mutate cached state.
 */

/**
 * @typedef {{ v: number, d: number }} DualNumber
 */

/** Maximum number of entries retained in the bounded LRU memoization cache. */
const MAX_CACHE_SIZE = 1024;

/**
 * Normalizes `-0` to `+0` so cache keys and returned numbers are canonical.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
  return value === 0 ? 0 : value;
}

/**
 * Builds an exact, collision-free canonical cache key for a validated vector of
 * finite dual numbers.
 *
 * @param {readonly DualNumber[]} vec
 * @returns {string}
 */
function buildCacheKey(vec) {
  const parts = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    const item = vec[i];
    parts[i] = `${normalizeZero(item.v)},${normalizeZero(item.d)}`;
  }
  return `${vec.length}|${parts.join(';')}`;
}

/**
 * Validates that `vec` is a non-empty array of finite `{ v, d }` dual numbers.
 *
 * @param {unknown} vec
 * @throws {TypeError} If `vec` is not an array or any element is not a dual number object.
 * @throws {RangeError} If `vec` is empty or any `v` or `d` component is non-finite.
 */
function validateDualVector(vec) {
  if (!Array.isArray(vec)) {
    throw new TypeError('Expected an array of dual numbers { v, d }');
  }
  if (vec.length === 0) {
    throw new RangeError('Vector must be non-empty');
  }
  for (let i = 0; i < vec.length; i++) {
    const item = vec[i];
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError(`Element at index ${i} must be an object with numeric { v, d } properties`);
    }
    if (typeof item.v !== 'number' || typeof item.d !== 'number') {
      throw new TypeError(`Element at index ${i} must have numeric v and d properties`);
    }
    if (!Number.isFinite(item.v) || !Number.isFinite(item.d)) {
      throw new RangeError(`Element at index ${i} must have finite v and d values`);
    }
  }
}

/**
 * Computes the dual-number Euclidean magnitude using max-component scaling to prevent
 * overflow/underflow in intermediate squares and products.
 *
 * @param {readonly DualNumber[]} vec Validated non-empty vector of finite dual numbers.
 * @returns {DualNumber}
 * @throws {RangeError} If all `v === 0` while at least one `d !== 0`.
 */
function computeMagnitudeDual(vec) {
  let maxAbsV = 0;
  let hasNonZeroD = false;

  for (let i = 0; i < vec.length; i++) {
    const absV = Math.abs(vec[i].v);
    if (absV > maxAbsV) {
      maxAbsV = absV;
    }
    if (vec[i].d !== 0) {
      hasNonZeroD = true;
    }
  }

  if (maxAbsV === 0) {
    if (hasNonZeroD) {
      throw new RangeError(
        'Derivative of Euclidean magnitude is undefined at the zero vector for non-zero derivative components'
      );
    }
    return { v: 0, d: 0 };
  }

  let scaledSumSq = 0;
  let scaledDot = 0;

  for (let i = 0; i < vec.length; i++) {
    const scaledV = vec[i].v / maxAbsV;
    scaledSumSq += scaledV * scaledV;
    scaledDot += scaledV * vec[i].d;
  }

  const scaledNorm = Math.sqrt(scaledSumSq);
  const v = normalizeZero(maxAbsV * scaledNorm);
  const d = normalizeZero(scaledDot / scaledNorm);

  return { v, d };
}

/**
 * Declarative seed table of canonical dual vectors whose magnitudes and derivatives
 * are precomputed at module initialization.
 *
 * @type {ReadonlyArray<[ReadonlyArray<DualNumber>, DualNumber]>}
 */
const CANONICAL_TABLE_SEEDS = [
  // Zero vectors (1D..4D) with zero derivatives
  [[{ v: 0, d: 0 }], { v: 0, d: 0 }],
  [[{ v: 0, d: 0 }, { v: 0, d: 0 }], { v: 0, d: 0 }],
  [[{ v: 0, d: 0 }, { v: 0, d: 0 }, { v: 0, d: 0 }], { v: 0, d: 0 }],
  [[{ v: 0, d: 0 }, { v: 0, d: 0 }, { v: 0, d: 0 }, { v: 0, d: 0 }], { v: 0, d: 0 }],
  // Unit scalars
  [[{ v: 1, d: 0 }], { v: 1, d: 0 }],
  [[{ v: 1, d: 1 }], { v: 1, d: 1 }],
  [[{ v: -1, d: 0 }], { v: 1, d: 0 }],
  [[{ v: -1, d: 1 }], { v: 1, d: -1 }],
  // 2D standard basis vectors
  [[{ v: 1, d: 0 }, { v: 0, d: 0 }], { v: 1, d: 0 }],
  [[{ v: 0, d: 0 }, { v: 1, d: 0 }], { v: 1, d: 0 }],
  [[{ v: 1, d: 1 }, { v: 0, d: 0 }], { v: 1, d: 1 }],
  [[{ v: 0, d: 0 }, { v: 1, d: 1 }], { v: 1, d: 1 }],
  // 3D standard basis vectors
  [[{ v: 1, d: 0 }, { v: 0, d: 0 }, { v: 0, d: 0 }], { v: 1, d: 0 }],
  [[{ v: 0, d: 0 }, { v: 1, d: 0 }, { v: 0, d: 0 }], { v: 1, d: 0 }],
  [[{ v: 0, d: 0 }, { v: 0, d: 0 }, { v: 1, d: 0 }], { v: 1, d: 0 }],
  [[{ v: 1, d: 1 }, { v: 0, d: 0 }, { v: 0, d: 0 }], { v: 1, d: 1 }],
  [[{ v: 0, d: 0 }, { v: 1, d: 1 }, { v: 0, d: 0 }], { v: 1, d: 1 }],
  [[{ v: 0, d: 0 }, { v: 0, d: 0 }, { v: 1, d: 1 }], { v: 1, d: 1 }],
  // Canonical Pythagorean triples
  [[{ v: 3, d: 0 }, { v: 4, d: 0 }], { v: 5, d: 0 }],
  [[{ v: 4, d: 0 }, { v: 3, d: 0 }], { v: 5, d: 0 }],
  [[{ v: 3, d: 1 }, { v: 4, d: 0 }], { v: 5, d: 0.6 }],
  [[{ v: 3, d: 0 }, { v: 4, d: 1 }], { v: 5, d: 0.8 }],
  [[{ v: 3, d: 1 }, { v: 4, d: 1 }], { v: 5, d: 1.4 }],
  [[{ v: 5, d: 0 }, { v: 12, d: 0 }], { v: 13, d: 0 }],
  [[{ v: 3, d: 0 }, { v: 4, d: 0 }, { v: 12, d: 0 }], { v: 13, d: 0 }],
  [[{ v: 3, d: 1 }, { v: 4, d: 1 }, { v: 12, d: 1 }], { v: 13, d: 19 / 13 }],
];

/**
 * Immutable precomputed lookup table keyed by canonical dual-vector key.
 *
 * @type {Map<string, Readonly<DualNumber>>}
 */
const PRECOMPUTED_TABLE = new Map(
  CANONICAL_TABLE_SEEDS.map(([vec, result]) => [
    buildCacheKey(vec),
    Object.freeze({ v: result.v, d: result.d }),
  ])
);

/**
 * Bounded LRU memoization cache mapping canonical keys to frozen `{ v, d }` results.
 *
 * @type {Map<string, Readonly<DualNumber>>}
 */
const memoCache = new Map();

/**
 * Inserts an entry into the bounded LRU cache, evicting the least-recently-used entry
 * when capacity is reached.
 *
 * @param {string} key
 * @param {DualNumber} result
 */
function setCacheEntry(key, result) {
  if (memoCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = memoCache.keys().next().value;
    memoCache.delete(oldestKey);
  }
  memoCache.set(key, Object.freeze({ v: result.v, d: result.d }));
}

/**
 * Computes the Euclidean magnitude of a vector of dual numbers `{ v, d }`,
 * carrying forward-mode derivatives alongside the primal value, accelerated by
 * a precomputed canonical table and a bounded LRU memoization cache.
 *
 * Formula:
 *   - `v = sqrt(sum(x_i.v^2))`
 *   - `d = sum(x_i.v * x_i.d) / v`
 *
 * Zero-vector behavior:
 *   - If all `x_i.v === 0` and all `x_i.d === 0`, returns `{ v: 0, d: 0 }`.
 *   - If all `x_i.v === 0` and any `x_i.d !== 0`, throws `RangeError` because the
 *     Euclidean norm is non-differentiable at the origin along non-zero tangents.
 *
 * @param {readonly DualNumber[]} vec Non-empty array of finite dual numbers `{ v, d }`.
 * @returns {DualNumber} Fresh `{ v, d }` object representing magnitude and its derivative.
 * @throws {TypeError} If `vec` is not an array or contains invalid dual number objects.
 * @throws {RangeError} If `vec` is empty, contains non-finite values, or is the zero vector with non-zero derivatives.
 */
export function magnitudeDualMemo(vec) {
  validateDualVector(vec);

  const key = buildCacheKey(vec);

  const precomputed = PRECOMPUTED_TABLE.get(key);
  if (precomputed !== undefined) {
    return { v: precomputed.v, d: precomputed.d };
  }

  const cached = memoCache.get(key);
  if (cached !== undefined) {
    // Refresh LRU recency
    memoCache.delete(key);
    memoCache.set(key, cached);
    return { v: cached.v, d: cached.d };
  }

  const result = computeMagnitudeDual(vec);
  setCacheEntry(key, result);
  return { v: result.v, d: result.d };
}
