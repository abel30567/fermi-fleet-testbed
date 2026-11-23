/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * @typedef {Object} DerivativeComplexOptions
 * @property {number} [h] - Positive real finite-difference step size. Defaults to a precomputed order-optimal step.
 * @property {2|4|6|8} [order=4] - Central finite-difference stencil accuracy order.
 * @property {'re'|'im'} [axis='re'] - Axis along which finite differences are sampled ('re' for real axis, 'im' for imaginary axis).
 */

/**
 * Precomputed antisymmetric central finite-difference stencil tables for first derivatives.
 * Each entry `{ offset: k, weight: w }` contributes `w * (f(z + k*h) - f(z - k*h))`.
 * Entries are ordered from outermost (smallest magnitude weight) to innermost (largest
 * magnitude weight) to minimize floating-point rounding error during accumulation.
 *
 * @type {Readonly<Record<number, ReadonlyArray<Readonly<{ offset: number, weight: number }>>>>}
 */
const STENCIL_TABLES = Object.freeze({
  2: Object.freeze([
    Object.freeze({ offset: 1, weight: 1 / 2 }),
  ]),
  4: Object.freeze([
    Object.freeze({ offset: 2, weight: -1 / 12 }),
    Object.freeze({ offset: 1, weight: 2 / 3 }),
  ]),
  6: Object.freeze([
    Object.freeze({ offset: 3, weight: 1 / 60 }),
    Object.freeze({ offset: 2, weight: -3 / 20 }),
    Object.freeze({ offset: 1, weight: 3 / 4 }),
  ]),
  8: Object.freeze([
    Object.freeze({ offset: 4, weight: -1 / 280 }),
    Object.freeze({ offset: 3, weight: 4 / 105 }),
    Object.freeze({ offset: 2, weight: -1 / 5 }),
    Object.freeze({ offset: 1, weight: 4 / 5 }),
  ]),
});

/**
 * Precomputed default step sizes tuned for IEEE-754 double precision per stencil order.
 * Balances truncation error O(h^order) against roundoff error O(eps / h).
 *
 * @type {Readonly<Record<number, number>>}
 */
const DEFAULT_STEP_BY_ORDER = Object.freeze({
  2: 1e-5,
  4: 1e-4,
  6: 1e-3,
  8: 3e-3,
});

const DEFAULT_ORDER = 4;
const DEFAULT_AXIS = 're';
const MAX_CACHE_ENTRIES = 1024;

/**
 * WeakMap keyed by holomorphic function `fn`, mapping to a bounded LRU Map
 * of serialized input parameters -> `{ re, im }` derivative results.
 *
 * @type {WeakMap<Function, Map<string, Complex>>}
 */
const memoStore = new WeakMap();

/**
 * Normalize -0 to +0 to keep cache keys and outputs canonical.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
  return value === 0 ? 0 : value;
}

/**
 * Validate a complex number object `{ re, im }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Complex}
 */
function validateComplex(value, label) {
  if (value === null || typeof value !== 'object') {
    throw new TypeError(`${label} must be a non-null object with numeric { re, im } properties`);
  }
  const { re, im } = /** @type {{ re: unknown, im: unknown }} */ (value);
  if (typeof re !== 'number' || typeof im !== 'number') {
    throw new TypeError(`${label}.re and ${label}.im must be numbers`);
  }
  if (!Number.isFinite(re) || !Number.isFinite(im)) {
    throw new RangeError(`${label}.re and ${label}.im must be finite numbers`);
  }
  return { re: normalizeZero(re), im: normalizeZero(im) };
}

/**
 * Validate and normalize options for `derivativeComplexMemo`.
 *
 * @param {unknown} options
 * @returns {{ h: number, order: number, axis: 're'|'im' }}
 */
function validateOptions(options) {
  if (options === undefined) {
    return {
      order: DEFAULT_ORDER,
      h: DEFAULT_STEP_BY_ORDER[DEFAULT_ORDER],
      axis: DEFAULT_AXIS,
    };
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be a plain object when provided');
  }

  const opts = /** @type {Record<string, unknown>} */ (options);

  let order = DEFAULT_ORDER;
  if (opts.order !== undefined) {
    if (typeof opts.order !== 'number') {
      throw new TypeError('options.order must be a number');
    }
    if (!Object.prototype.hasOwnProperty.call(STENCIL_TABLES, opts.order)) {
      throw new RangeError('options.order must be one of: 2, 4, 6, 8');
    }
    order = opts.order;
  }

  let h = DEFAULT_STEP_BY_ORDER[order];
  if (opts.h !== undefined) {
    if (typeof opts.h !== 'number') {
      throw new TypeError('options.h must be a number');
    }
    if (!Number.isFinite(opts.h) || opts.h <= 0) {
      throw new RangeError('options.h must be a finite positive number');
    }
    h = opts.h;
  }

  let axis = DEFAULT_AXIS;
  if (opts.axis !== undefined) {
    if (typeof opts.axis !== 'string') {
      throw new TypeError('options.axis must be a string');
    }
    if (opts.axis !== 're' && opts.axis !== 'im') {
      throw new RangeError("options.axis must be 're' or 'im'");
    }
    axis = opts.axis;
  }

  return { h, order, axis };
}

/**
 * Compute the numerical complex derivative f'(z) of a holomorphic function
 * `fn({ re, im }) => { re, im }` at point `z` using precomputed central
 * finite-difference stencil coefficient tables and bounded WeakMap-backed memoization.
 *
 * Results are cached per function `fn` in a bounded LRU `Map` (up to 1024 entries),
 * and fresh `{ re, im }` objects are always returned so callers cannot mutate cache state.
 *
 * @param {(z: Complex) => Complex} fn - Holomorphic complex function taking `{ re, im }` and returning `{ re, im }`.
 * @param {Complex} z - Complex point `{ re, im }` at which to differentiate.
 * @param {DerivativeComplexOptions} [options] - Optional stencil configuration (`h`, `order`, `axis`).
 * @returns {Complex} Fresh `{ re, im }` object representing f'(z).
 */
export function derivativeComplexMemo(fn, z, options) {
  if (typeof fn !== 'function') {
    throw new TypeError('fn must be a function');
  }

  const point = validateComplex(z, 'z');
  const { h, order, axis } = validateOptions(options);

  let fnCache = memoStore.get(fn);
  if (fnCache === undefined) {
    fnCache = new Map();
    memoStore.set(fn, fnCache);
  }

  const cacheKey = `${point.re},${point.im}|${order}|${h}|${axis}`;
  const cached = fnCache.get(cacheKey);
  if (cached !== undefined) {
    // Refresh recency for LRU eviction
    fnCache.delete(cacheKey);
    fnCache.set(cacheKey, cached);
    return { re: cached.re, im: cached.im };
  }

  const stencil = STENCIL_TABLES[order];
  let sumRe = 0;
  let sumIm = 0;

  if (axis === 're') {
    for (let i = 0; i < stencil.length; i += 1) {
      const { offset, weight } = stencil[i];
      const delta = offset * h;
      const plusRe = point.re + delta;
      const minusRe = point.re - delta;
      if (!Number.isFinite(plusRe) || !Number.isFinite(minusRe)) {
        throw new RangeError('Stepped evaluation point overflowed finite range');
      }
      const fPlus = validateComplex(fn({ re: plusRe, im: point.im }), 'fn(z + k*h)');
      const fMinus = validateComplex(fn({ re: minusRe, im: point.im }), 'fn(z - k*h)');
      sumRe += weight * (fPlus.re - fMinus.re);
      sumIm += weight * (fPlus.im - fMinus.im);
    }
  } else {
    for (let i = 0; i < stencil.length; i += 1) {
      const { offset, weight } = stencil[i];
      const delta = offset * h;
      const plusIm = point.im + delta;
      const minusIm = point.im - delta;
      if (!Number.isFinite(plusIm) || !Number.isFinite(minusIm)) {
        throw new RangeError('Stepped evaluation point overflowed finite range');
      }
      const fPlus = validateComplex(fn({ re: point.re, im: plusIm }), 'fn(z + i*k*h)');
      const fMinus = validateComplex(fn({ re: point.re, im: minusIm }), 'fn(z - i*k*h)');
      sumRe += weight * (fPlus.re - fMinus.re);
      sumIm += weight * (fPlus.im - fMinus.im);
    }
  }

  // For real-axis differences: divide by h.
  // For imaginary-axis differences: divide by (i * h), i.e. (a + b*i) / (i*h) = (b/h) + (-a/h)*i.
  const rawRe = axis === 're' ? sumRe / h : sumIm / h;
  const rawIm = axis === 're' ? sumIm / h : -sumRe / h;

  if (!Number.isFinite(rawRe) || !Number.isFinite(rawIm)) {
    throw new RangeError('Computed derivative is not finite');
  }

  const outRe = normalizeZero(rawRe);
  const outIm = normalizeZero(rawIm);

  if (fnCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = fnCache.keys().next().value;
    fnCache.delete(oldestKey);
  }
  fnCache.set(cacheKey, { re: outRe, im: outIm });

  return { re: outRe, im: outIm };
}
