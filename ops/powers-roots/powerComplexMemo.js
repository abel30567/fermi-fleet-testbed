/**
 * Table-driven, memoized complex power: computes the principal value of z^w
 * for complex numbers represented as `{ re, im }`.
 *
 * Uses:
 * - Precomputed exact tables for cardinal unit bases (`-1`, `i`, `-i`) with
 *   integer exponents and common complex power identities (e.g. `i^i`, `(-1)^0.5`).
 * - Exact binary exponentiation for small integer exponents (`|n| <= 64`).
 * - Bounded LRU memoization caches for both polar decompositions (`ln|z|`, `Arg(z)`)
 *   and computed `z^w` results, returning defensive copies on every call.
 *
 * Principal branch definition (for z != 0):
 *   z^w = exp(w * Log(z))
 * where Log(z) = ln|z| + i * Arg(z) and Arg(z) = atan2(z.im, z.re) in (-pi, pi].
 *
 * Zero-base conventions:
 * - 0^0 = { re: 1, im: 0 }
 * - 0^w = { re: 0, im: 0 } when w.re > 0
 * - 0^w throws RangeError when w.re < 0 or (w.re === 0 && w.im !== 0)
 *
 * @module ops/powers-roots/powerComplexMemo
 */

const MAX_CACHE_SIZE = 4096;
const SMALL_INT_EXP_LIMIT = 64;

/** @type {ReadonlyArray<Readonly<{ re: number, im: number }>>} */
const I_POWERS_TABLE = Object.freeze([
  Object.freeze({ re: 1, im: 0 }),
  Object.freeze({ re: 0, im: 1 }),
  Object.freeze({ re: -1, im: 0 }),
  Object.freeze({ re: 0, im: -1 }),
]);

/** @type {ReadonlyArray<Readonly<{ re: number, im: number }>>} */
const NEG_I_POWERS_TABLE = Object.freeze([
  Object.freeze({ re: 1, im: 0 }),
  Object.freeze({ re: 0, im: -1 }),
  Object.freeze({ re: -1, im: 0 }),
  Object.freeze({ re: 0, im: 1 }),
]);

/** @type {ReadonlyArray<Readonly<{ re: number, im: number }>>} */
const NEG_ONE_POWERS_TABLE = Object.freeze([
  Object.freeze({ re: 1, im: 0 }),
  Object.freeze({ re: -1, im: 0 }),
]);

/**
 * Precomputed lookup table for common exact / high-precision complex powers.
 * Keys use normalized canonical form `${a},${b}|${c},${d}`.
 * @type {ReadonlyMap<string, Readonly<{ re: number, im: number }>>}
 */
const PRECOMPUTED_POWERS = new Map([
  ['-1,0|0.5,0', Object.freeze({ re: 0, im: 1 })],
  ['-1,0|-0.5,0', Object.freeze({ re: 0, im: -1 })],
  ['0,1|0.5,0', Object.freeze({ re: Math.SQRT1_2, im: Math.SQRT1_2 })],
  ['0,1|-0.5,0', Object.freeze({ re: Math.SQRT1_2, im: -Math.SQRT1_2 })],
  ['0,-1|0.5,0', Object.freeze({ re: Math.SQRT1_2, im: -Math.SQRT1_2 })],
  ['0,-1|-0.5,0', Object.freeze({ re: Math.SQRT1_2, im: Math.SQRT1_2 })],
  ['0,1|0,1', Object.freeze({ re: Math.exp(-Math.PI / 2), im: 0 })],
  ['0,1|0,-1', Object.freeze({ re: Math.exp(Math.PI / 2), im: 0 })],
  ['0,-1|0,1', Object.freeze({ re: Math.exp(Math.PI / 2), im: 0 })],
  ['0,-1|0,-1', Object.freeze({ re: Math.exp(-Math.PI / 2), im: 0 })],
  ['-1,0|0,1', Object.freeze({ re: Math.exp(-Math.PI), im: 0 })],
  ['-1,0|0,-1', Object.freeze({ re: Math.exp(Math.PI), im: 0 })],
]);

/**
 * Precomputed polar forms (`lnR`, `theta`) for common complex bases.
 * @type {ReadonlyMap<string, Readonly<{ lnR: number, theta: number }>>}
 */
const PRECOMPUTED_POLAR = new Map([
  ['1,0', Object.freeze({ lnR: 0, theta: 0 })],
  ['-1,0', Object.freeze({ lnR: 0, theta: Math.PI })],
  ['0,1', Object.freeze({ lnR: 0, theta: Math.PI / 2 })],
  ['0,-1', Object.freeze({ lnR: 0, theta: -Math.PI / 2 })],
  ['1,1', Object.freeze({ lnR: 0.5 * Math.LN2, theta: Math.PI / 4 })],
  ['1,-1', Object.freeze({ lnR: 0.5 * Math.LN2, theta: -Math.PI / 4 })],
  ['-1,1', Object.freeze({ lnR: 0.5 * Math.LN2, theta: (3 * Math.PI) / 4 })],
  ['-1,-1', Object.freeze({ lnR: 0.5 * Math.LN2, theta: (-3 * Math.PI) / 4 })],
]);

/** @type {Map<string, Readonly<{ re: number, im: number }>>} */
const resultCache = new Map();

/** @type {Map<string, Readonly<{ lnR: number, theta: number }>>} */
const polarCache = new Map();

/**
 * Normalizes `-0` to `0`.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
  return x === 0 ? 0 : x;
}

/**
 * Validates that a value is a complex number object `{ re, im }` with finite numbers.
 * @param {unknown} value
 * @param {string} name
 * @returns {{ re: number, im: number }}
 */
function validateComplex(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be a non-null object with numeric re and im properties`);
  }
  const { re, im } = /** @type {{ re: unknown, im: unknown }} */ (value);
  if (typeof re !== 'number' || typeof im !== 'number') {
    throw new TypeError(`${name}.re and ${name}.im must be numbers`);
  }
  if (!Number.isFinite(re) || !Number.isFinite(im)) {
    throw new RangeError(`${name}.re and ${name}.im must be finite numbers`);
  }
  return { re: normalizeZero(re), im: normalizeZero(im) };
}

/**
 * Bounded LRU get for a Map.
 * @template V
 * @param {Map<string, V>} cache
 * @param {string} key
 * @returns {V | undefined}
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
 * Bounded LRU set for a Map.
 * @template V
 * @param {Map<string, V>} cache
 * @param {string} key
 * @param {V} value
 */
function lruSet(cache, key, value) {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, value);
}

/**
 * Returns memoized or precomputed polar decomposition `(ln|z|, Arg(z))` for non-zero `z`.
 * Uses scaling by `max(|a|, |b|)` to prevent spurious overflow or underflow in `hypot`.
 * @param {number} a
 * @param {number} b
 * @returns {Readonly<{ lnR: number, theta: number }>}
 */
function getPolar(a, b) {
  const key = `${a},${b}`;
  const precomputed = PRECOMPUTED_POLAR.get(key);
  if (precomputed !== undefined) {
    return precomputed;
  }
  const cached = lruGet(polarCache, key);
  if (cached !== undefined) {
    return cached;
  }

  const maxAbs = Math.max(Math.abs(a), Math.abs(b));
  const scaledA = a / maxAbs;
  const scaledB = b / maxAbs;
  const lnR = Math.log(maxAbs) + 0.5 * Math.log(scaledA * scaledA + scaledB * scaledB);
  const theta = Math.atan2(b, a);

  const entry = Object.freeze({ lnR, theta });
  lruSet(polarCache, key, entry);
  return entry;
}

/**
 * Computes `z^n` via binary exponentiation for small integer `n` (`|n| <= 64`).
 * Returns `null` if intermediate arithmetic overflows/underflows to non-finite values,
 * signaling the caller to fall back to the polar formula.
 * @param {number} a
 * @param {number} b
 * @param {number} n
 * @returns {{ re: number, im: number } | null}
 */
function smallIntPowComplex(a, b, n) {
  let absN = Math.abs(n);
  let resRe = 1;
  let resIm = 0;
  let baseRe = a;
  let baseIm = b;

  while (absN > 0) {
    if ((absN & 1) === 1) {
      const nextRe = resRe * baseRe - resIm * baseIm;
      const nextIm = resRe * baseIm + resIm * baseRe;
      resRe = nextRe;
      resIm = nextIm;
    }
    absN >>>= 1;
    if (absN > 0) {
      const nextBaseRe = baseRe * baseRe - baseIm * baseIm;
      const nextBaseIm = 2 * baseRe * baseIm;
      baseRe = nextBaseRe;
      baseIm = nextBaseIm;
    }
  }

  if (!Number.isFinite(resRe) || !Number.isFinite(resIm)) {
    return null;
  }

  if (n < 0) {
    if (resRe === 0 && resIm === 0) {
      return null;
    }
    if (Math.abs(resRe) >= Math.abs(resIm)) {
      const ratio = resIm / resRe;
      const denom = resRe + resIm * ratio;
      resRe = 1 / denom;
      resIm = -ratio / denom;
    } else {
      const ratio = resRe / resIm;
      const denom = resIm + resRe * ratio;
      resRe = ratio / denom;
      resIm = -1 / denom;
    }
    if (!Number.isFinite(resRe) || !Number.isFinite(resIm)) {
      return null;
    }
  }

  return { re: normalizeZero(resRe), im: normalizeZero(resIm) };
}

/**
 * Computes the principal value of `base` raised to `exponent` over complex numbers
 * represented as `{ re, im }`, using precomputed lookup tables and LRU memoization.
 *
 * @param {{ re: number, im: number }} base - The complex base `z = re + im*i`.
 * @param {{ re: number, im: number }} exponent - The complex exponent `w = re + im*i`.
 * @returns {{ re: number, im: number }} A new `{ re, im }` object representing `z^w`.
 * @throws {TypeError} If `base` or `exponent` is not an object with numeric `re` and `im`.
 * @throws {RangeError} If any component is non-finite, if `0^w` is undefined (`Re(w) < 0`
 *   or `Re(w) === 0 && Im(w) !== 0`), or if the result overflows finite IEEE-754 numbers.
 */
export function powerComplexMemo(base, exponent) {
  const z = validateComplex(base, 'base');
  const w = validateComplex(exponent, 'exponent');

  const a = z.re;
  const b = z.im;
  const c = w.re;
  const d = w.im;

  // Handle zero base before cache lookup so singular cases consistently throw.
  if (a === 0 && b === 0) {
    if (c === 0 && d === 0) {
      return { re: 1, im: 0 };
    }
    if (c > 0) {
      return { re: 0, im: 0 };
    }
    throw new RangeError('0 raised to a complex exponent with non-positive real part is undefined');
  }

  // Exact algebraic short-circuits (no cache space consumed).
  if (c === 0 && d === 0) {
    return { re: 1, im: 0 };
  }
  if (c === 1 && d === 0) {
    return { re: a, im: b };
  }
  if (a === 1 && b === 0) {
    return { re: 1, im: 0 };
  }

  // Table-driven exact integer powers of cardinal unit bases (-1, i, -i).
  if (d === 0 && Number.isSafeInteger(c)) {
    if (a === -1 && b === 0) {
      const entry = NEG_ONE_POWERS_TABLE[Math.abs(c % 2)];
      return { re: entry.re, im: entry.im };
    }
    if (a === 0 && b === 1) {
      const entry = I_POWERS_TABLE[((c % 4) + 4) % 4];
      return { re: entry.re, im: entry.im };
    }
    if (a === 0 && b === -1) {
      const entry = NEG_I_POWERS_TABLE[((c % 4) + 4) % 4];
      return { re: entry.re, im: entry.im };
    }
  }

  // Precomputed identity table lookup.
  const cacheKey = `${a},${b}|${c},${d}`;
  const precomputed = PRECOMPUTED_POWERS.get(cacheKey);
  if (precomputed !== undefined) {
    return { re: precomputed.re, im: precomputed.im };
  }

  // Dynamic memoization cache lookup.
  const cached = lruGet(resultCache, cacheKey);
  if (cached !== undefined) {
    return { re: cached.re, im: cached.im };
  }

  let computed = null;

  // Exact binary exponentiation for small integer exponents.
  if (d === 0 && Number.isInteger(c) && Math.abs(c) <= SMALL_INT_EXP_LIMIT) {
    computed = smallIntPowComplex(a, b, c);
  }

  // General principal branch: z^w = exp(w * Log(z)).
  if (computed === null) {
    const { lnR, theta } = getPolar(a, b);
    const u = c * lnR - d * theta;
    const v = d * lnR + c * theta;

    if (!Number.isFinite(u) || !Number.isFinite(v)) {
      throw new RangeError('Complex power result overflows finite floating-point range');
    }

    const mag = Math.exp(u);
    if (!Number.isFinite(mag)) {
      throw new RangeError('Complex power result overflows finite floating-point range');
    }

    const re = normalizeZero(mag * Math.cos(v));
    const im = normalizeZero(mag * Math.sin(v));
    if (!Number.isFinite(re) || !Number.isFinite(im)) {
      throw new RangeError('Complex power result overflows finite floating-point range');
    }
    computed = { re, im };
  }

  const frozen = Object.freeze({ re: computed.re, im: computed.im });
  lruSet(resultCache, cacheKey, frozen);
  return { re: frozen.re, im: frozen.im };
}
