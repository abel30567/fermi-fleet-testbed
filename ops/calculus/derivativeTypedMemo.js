/**
 * Numerical differentiation over Float64Array sampled values using precomputed
 * finite-difference stencil weight tables and bounded memoization.
 *
 * Stencil scheme (for uniform spacing `h > 0`):
 * - `n === 0`: returns an empty `Float64Array(0)`.
 * - `n === 1`: returns `Float64Array([0])` (0th-order constant fit).
 * - `n === 2`: 2-point 1st-order forward/backward differences, exact for linear functions.
 * - `n >= 3`: 3-point 2nd-order forward (`i = 0`), central (`0 < i < n - 1`), and
 *   backward (`i = n - 1`) differences, exact for polynomials up to degree 2 (O(h^2)).
 *
 * Precomputed stencil weights are scaled per step size `h` and cached, and full
 * derivative outputs are memoized in a bounded LRU cache keyed by exact input
 * IEEE-754 bit patterns and `h`. Every call returns a fresh `Float64Array` copy
 * so caller mutations to inputs or outputs never corrupt cached entries.
 *
 * @module ops/calculus/derivativeTypedMemo
 */

/**
 * Precomputed unit-step (h = 1) finite-difference stencil tables.
 * Each entry pairs relative index offsets with their corresponding weights.
 */
const BASE_STENCILS = Object.freeze({
  forward2: Object.freeze({
    offsets: new Int8Array([0, 1]),
    weights: new Float64Array([-1, 1]),
  }),
  backward2: Object.freeze({
    offsets: new Int8Array([-1, 0]),
    weights: new Float64Array([-1, 1]),
  }),
  forward3: Object.freeze({
    offsets: new Int8Array([0, 1, 2]),
    weights: new Float64Array([-1.5, 2, -0.5]),
  }),
  central3: Object.freeze({
    offsets: new Int8Array([-1, 1]),
    weights: new Float64Array([-0.5, 0.5]),
  }),
  backward3: Object.freeze({
    offsets: new Int8Array([-2, -1, 0]),
    weights: new Float64Array([0.5, -2, 1.5]),
  }),
});

const MAX_STENCIL_CACHE_SIZE = 256;
const MAX_RESULT_CACHE_SIZE = 256;
const MAX_MEMO_LENGTH = 65536;

/** @type {Map<number, Readonly<Record<keyof typeof BASE_STENCILS, { offsets: Int8Array, weights: Float64Array }>>>} */
const scaledStencilCache = new Map();

/** @type {Map<string, Float64Array>} */
const resultCache = new Map();

const hScratchBuf = new ArrayBuffer(8);
const hScratchF64 = new Float64Array(hScratchBuf);
const hScratchU32 = new Uint32Array(hScratchBuf);

/**
 * Retrieve or build the pre-scaled finite-difference stencil table for step size `h`.
 *
 * @param {number} h - Finite positive step size.
 * @returns {Readonly<Record<keyof typeof BASE_STENCILS, { offsets: Int8Array, weights: Float64Array }>>}
 */
function getScaledStencils(h) {
  const cached = scaledStencilCache.get(h);
  if (cached !== undefined) {
    // Refresh LRU position
    scaledStencilCache.delete(h);
    scaledStencilCache.set(h, cached);
    return cached;
  }

  const invH = 1 / h;
  /** @type {Record<string, { offsets: Int8Array, weights: Float64Array }>} */
  const table = {};

  for (const name of Object.keys(BASE_STENCILS)) {
    const base = BASE_STENCILS[name];
    const scaled = new Float64Array(base.weights.length);
    for (let k = 0; k < base.weights.length; k++) {
      scaled[k] = base.weights[k] * invH;
    }
    table[name] = Object.freeze({
      offsets: base.offsets,
      weights: scaled,
    });
  }

  const frozen = Object.freeze(table);
  if (scaledStencilCache.size >= MAX_STENCIL_CACHE_SIZE) {
    const oldestKey = scaledStencilCache.keys().next().value;
    scaledStencilCache.delete(oldestKey);
  }
  scaledStencilCache.set(h, frozen);
  return frozen;
}

/**
 * Build a deterministic cache key from the exact IEEE-754 bit patterns of `values` and `h`.
 *
 * @param {Float64Array} values
 * @param {number} h
 * @returns {string}
 */
function buildCacheKey(values, h) {
  hScratchF64[0] = h;
  const words = new Uint32Array(values.buffer, values.byteOffset, values.length * 2);
  const parts = new Array(words.length + 2);
  parts[0] = hScratchU32[0].toString(36);
  parts[1] = hScratchU32[1].toString(36);
  for (let i = 0; i < words.length; i++) {
    parts[i + 2] = words[i].toString(36);
  }
  return parts.join(',');
}

/**
 * Apply a precomputed stencil at index `index` of `values`.
 *
 * @param {Float64Array} values
 * @param {number} index
 * @param {{ offsets: Int8Array, weights: Float64Array }} stencil
 * @returns {number}
 */
function applyStencil(values, index, stencil) {
  const { offsets, weights } = stencil;
  let acc = 0;
  for (let k = 0; k < offsets.length; k++) {
    acc += weights[k] * values[index + offsets[k]];
  }
  return acc;
}

/**
 * Compute the numerical first derivative of uniformly sampled values in a `Float64Array`
 * using precomputed finite-difference stencil weight tables and memoization.
 *
 * @param {Float64Array} values - Uniformly sampled function values.
 * @param {number} [h=1] - Uniform grid spacing between consecutive samples (must be finite and > 0).
 * @returns {Float64Array} A new `Float64Array` of the same length containing the estimated derivatives.
 * @throws {TypeError} If `values` is not a `Float64Array` or `h` is not a number.
 * @throws {RangeError} If `h` is not finite or `h <= 0`.
 */
export function derivativeTypedMemo(values, h = 1) {
  if (!(values instanceof Float64Array)) {
    throw new TypeError('values must be a Float64Array');
  }
  if (typeof h !== 'number') {
    throw new TypeError('h must be a number');
  }
  if (!Number.isFinite(h) || h <= 0) {
    throw new RangeError('h must be a finite positive number');
  }

  const n = values.length;
  if (n === 0) {
    return new Float64Array(0);
  }
  if (n === 1) {
    return new Float64Array([0]);
  }

  const canMemoize = n <= MAX_MEMO_LENGTH;
  let cacheKey = '';
  if (canMemoize) {
    cacheKey = buildCacheKey(values, h);
    const cached = resultCache.get(cacheKey);
    if (cached !== undefined) {
      // Refresh LRU position and return an isolated copy
      resultCache.delete(cacheKey);
      resultCache.set(cacheKey, cached);
      return cached.slice();
    }
  }

  const stencils = getScaledStencils(h);
  const out = new Float64Array(n);

  if (n === 2) {
    out[0] = applyStencil(values, 0, stencils.forward2);
    out[1] = applyStencil(values, 1, stencils.backward2);
  } else {
    out[0] = applyStencil(values, 0, stencils.forward3);
    const { weights: cw } = stencils.central3;
    const wLeft = cw[0];
    const wRight = cw[1];
    for (let i = 1; i < n - 1; i++) {
      out[i] = wLeft * values[i - 1] + wRight * values[i + 1];
    }
    out[n - 1] = applyStencil(values, n - 1, stencils.backward3);
  }

  if (canMemoize) {
    if (resultCache.size >= MAX_RESULT_CACHE_SIZE) {
      const oldestKey = resultCache.keys().next().value;
      resultCache.delete(oldestKey);
    }
    // Store an internal copy so the returned buffer is completely isolated
    resultCache.set(cacheKey, out.slice());
  }

  return out;
}
