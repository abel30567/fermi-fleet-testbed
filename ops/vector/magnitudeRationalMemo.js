/**
 * @fileoverview Memoized, table-driven Euclidean vector magnitude over exact rationals.
 *
 * Each rational component is represented as `{ num: BigInt, den: BigInt }`.
 * Results are always returned in lowest terms (`gcd(|num|, den) === 1n`, `num >= 0n`, `den > 0n`).
 *
 * Strategy:
 * - Precomputed perfect-square lookup table (`0n..4096n`) for O(1) small square detection.
 * - Precomputed quadratic-residue bitmask tables (mod 64, 63, 65, 11) for O(1) non-square rejection.
 * - Precomputed initial rational seeds for small non-square integers (`2n..256n`).
 * - Bounded memoization caches for both canonical vector magnitudes and rational square roots.
 * - Exact rational output whenever the squared magnitude is a perfect rational square;
 *   high-precision rational Babylonian/Newton square root approximation otherwise.
 */

const PERFECT_SQUARE_TABLE_LIMIT = 4096n;
const MAX_TABLE_SQUARE = PERFECT_SQUARE_TABLE_LIMIT * PERFECT_SQUARE_TABLE_LIMIT;
const SMALL_SEED_LIMIT = 256n;
const MAX_CACHE_SIZE = 4096;
const DEFAULT_PRECISION = 30;
const MAX_ITERATIONS = 20;
const MAX_PRECISION = 1000;
const SORT_KEY_THRESHOLD = 64;

/**
 * Computes the greatest common divisor of two non-negative BigInts.
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/**
 * Computes the exact floor integer square root of a non-negative BigInt using Newton's method.
 * @param {bigint} n
 * @returns {bigint}
 */
function isqrt(n) {
  if (n < 2n) return n;
  const bitLen = n.toString(2).length;
  let x = 1n << BigInt((bitLen + 1) >> 1);
  while (true) {
    const next = (x + n / x) >> 1n;
    if (next >= x) return x;
    x = next;
  }
}

/**
 * Builds a quadratic residue lookup table modulo `mod`.
 * @param {number} mod
 * @returns {Uint8Array}
 */
function buildQuadraticResidueTable(mod) {
  const table = new Uint8Array(mod);
  for (let i = 0; i < mod; i++) {
    table[(i * i) % mod] = 1;
  }
  return table;
}

/** Precomputed quadratic residue tables for fast O(1) non-square rejection. */
const QR_MOD_64 = buildQuadraticResidueTable(64);
const QR_MOD_63 = buildQuadraticResidueTable(63);
const QR_MOD_65 = buildQuadraticResidueTable(65);
const QR_MOD_11 = buildQuadraticResidueTable(11);

/** Precomputed exact perfect-square lookup table: k^2 -> k for 0 <= k <= 4096. */
const PERFECT_SQUARE_TABLE = (() => {
  const table = new Map();
  for (let k = 0n; k <= PERFECT_SQUARE_TABLE_LIMIT; k++) {
    table.set(k * k, k);
  }
  return table;
})();

/** Precomputed tight initial rational seeds for small non-square integers 2..256. */
const INITIAL_SQRT_SEEDS = (() => {
  const seeds = new Map();
  for (let n = 2n; n <= SMALL_SEED_LIMIT; n++) {
    if (PERFECT_SQUARE_TABLE.has(n)) continue;
    const r = isqrt(n);
    // One Babylonian step from integer seed r: (r^2 + n) / (2r)
    const num = r * r + n;
    const den = 2n * r;
    const g = gcd(num, den);
    seeds.set(n, { num: num / g, den: den / g });
  }
  return seeds;
})();

/** Bounded memoization cache for rational square roots. */
const sqrtRationalMemo = new Map();

/** Bounded memoization cache for canonicalized vector magnitudes. */
const vectorMagnitudeMemo = new Map();

/**
 * Inserts an entry into a bounded Map cache with simple FIFO eviction.
 * @template K, V
 * @param {Map<K, V>} cache
 * @param {K} key
 * @param {V} value
 */
function cacheSet(cache, key, value) {
  if (cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(key, value);
}

/**
 * Returns the exact integer square root of `n` if `n` is a perfect square, or `null` otherwise.
 * Uses the precomputed table for small values and quadratic-residue filters before `isqrt`.
 * @param {bigint} n Non-negative BigInt.
 * @returns {bigint | null}
 */
function exactIntSqrt(n) {
  if (n <= MAX_TABLE_SQUARE) {
    const hit = PERFECT_SQUARE_TABLE.get(n);
    return hit === undefined ? null : hit;
  }
  if (
    QR_MOD_64[Number(n & 63n)] === 0 ||
    QR_MOD_63[Number(n % 63n)] === 0 ||
    QR_MOD_65[Number(n % 65n)] === 0 ||
    QR_MOD_11[Number(n % 11n)] === 0
  ) {
    return null;
  }
  const root = isqrt(n);
  return root * root === n ? root : null;
}

/**
 * Computes the exact or Babylonian-approximated rational square root of a positive reduced rational `p / q`.
 * @param {bigint} p Positive numerator (`gcd(p, q) === 1n`).
 * @param {bigint} q Positive denominator.
 * @param {number | null} iterations Optional iteration count.
 * @param {number | null} precision Optional decimal-digit relative precision target.
 * @returns {{ num: bigint, den: bigint }}
 */
function sqrtRational(p, q, iterations, precision) {
  if (p === 0n) {
    return { num: 0n, den: 1n };
  }

  // Exact square check first (independent of approximation options)
  const exactKey = `${p}/${q}|exact`;
  const exactCached = sqrtRationalMemo.get(exactKey);
  if (exactCached !== undefined) {
    return { num: exactCached.num, den: exactCached.den };
  }

  const rootP = exactIntSqrt(p);
  if (rootP !== null) {
    const rootQ = exactIntSqrt(q);
    if (rootQ !== null) {
      const exactResult = { num: rootP, den: rootQ };
      cacheSet(sqrtRationalMemo, exactKey, exactResult);
      return { num: exactResult.num, den: exactResult.den };
    }
  }

  const approxKey = `${p}/${q}|${iterations ?? ''}|${precision ?? ''}`;
  const approxCached = sqrtRationalMemo.get(approxKey);
  if (approxCached !== undefined) {
    return { num: approxCached.num, den: approxCached.den };
  }

  // Initial rational seed a / b
  let a;
  let b;
  if (q === 1n && INITIAL_SQRT_SEEDS.has(p)) {
    const seed = INITIAL_SQRT_SEEDS.get(p);
    a = seed.num;
    b = seed.den;
  } else {
    const scaled = isqrt(p * q * 64n);
    const baseDen = 8n * q;
    const g = gcd(scaled, baseDen);
    a = scaled / g;
    b = baseDen / g;
  }

  const maxIter = iterations !== null ? iterations : 30;
  const targetScale = precision !== null ? 10n ** BigInt(precision) : null;

  for (let i = 0; i < maxIter; i++) {
    // Babylonian step: x_{k+1} = (a^2 * q + p * b^2) / (2 * a * b * q)
    const nextNum = a * a * q + p * b * b;
    const nextDen = 2n * a * b * q;
    const g = gcd(nextNum, nextDen);
    a = nextNum / g;
    b = nextDen / g;

    if (targetScale !== null) {
      // Relative squared error: |x^2 - S| / S = (a^2 * q - p * b^2) / (p * b^2)
      const diff = a * a * q - p * b * b;
      const absDiff = diff < 0n ? -diff : diff;
      if (absDiff * targetScale <= p * b * b) {
        break;
      }
    }
  }

  const approxResult = { num: a, den: b };
  cacheSet(sqrtRationalMemo, approxKey, approxResult);
  return { num: approxResult.num, den: approxResult.den };
}

/**
 * Validates and parses options for `magnitudeRationalMemo`.
 * @param {object | undefined} options
 * @returns {{ iterations: number | null, precision: number | null }}
 */
function parseOptions(options) {
  if (options === undefined) {
    return { iterations: null, precision: DEFAULT_PRECISION };
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be a plain object');
  }

  let iterations = null;
  let precision = null;

  if (options.iterations !== undefined) {
    if (typeof options.iterations !== 'number') {
      throw new TypeError('options.iterations must be a number');
    }
    if (
      !Number.isInteger(options.iterations) ||
      options.iterations < 1 ||
      options.iterations > MAX_ITERATIONS
    ) {
      throw new RangeError(`options.iterations must be an integer between 1 and ${MAX_ITERATIONS}`);
    }
    iterations = options.iterations;
  }

  if (options.precision !== undefined) {
    if (typeof options.precision !== 'number') {
      throw new TypeError('options.precision must be a number');
    }
    if (
      !Number.isInteger(options.precision) ||
      options.precision < 1 ||
      options.precision > MAX_PRECISION
    ) {
      throw new RangeError(`options.precision must be an integer between 1 and ${MAX_PRECISION}`);
    }
    precision = options.precision;
  }

  if (iterations === null && precision === null) {
    precision = DEFAULT_PRECISION;
  }

  return { iterations, precision };
}

/**
 * Validates a rational vector element and returns its normalized absolute form `{ absNum, den }`.
 * @param {unknown} elem
 * @param {number} index
 * @returns {{ absNum: bigint, den: bigint }}
 */
function normalizeComponent(elem, index) {
  if (elem === null || typeof elem !== 'object' || Array.isArray(elem)) {
    throw new TypeError(`vector[${index}] must be an object with { num: BigInt, den: BigInt }`);
  }
  const { num, den } = elem;
  if (typeof num !== 'bigint' || typeof den !== 'bigint') {
    throw new TypeError(`vector[${index}].num and vector[${index}].den must be BigInts`);
  }
  if (den === 0n) {
    throw new RangeError(`vector[${index}].den must not be 0n`);
  }
  if (num === 0n) {
    return { absNum: 0n, den: 1n };
  }
  const absNum = num < 0n ? -num : num;
  const absDen = den < 0n ? -den : den;
  const g = gcd(absNum, absDen);
  return { absNum: absNum / g, den: absDen / g };
}

/**
 * Computes the Euclidean magnitude of a vector of exact rationals using a
 * precomputed table-driven and memoized implementation.
 *
 * Returns an exact rational `{ num: BigInt, den: BigInt }` in lowest terms when
 * the sum of squares is a perfect rational square, and a high-precision rational
 * Babylonian/Newton approximation otherwise.
 *
 * @param {Array<{ num: bigint, den: bigint }>} vector Array of rational components.
 * @param {{ iterations?: number, precision?: number }} [options] Optional approximation controls:
 *   - `iterations`: Exact/maximum Babylonian iterations (`1..20`).
 *   - `precision`: Target relative accuracy in decimal digits (`1..1000`, default `30` when neither option is given).
 * @returns {{ num: bigint, den: bigint }} Non-negative magnitude in lowest terms (`gcd(num, den) === 1n`, `den > 0n`).
 * @throws {TypeError} If `vector` is not an array, any component is malformed, or `options` has invalid types.
 * @throws {RangeError} If any component has `den === 0n` or options are out of range.
 */
export function magnitudeRationalMemo(vector, options) {
  if (!Array.isArray(vector)) {
    throw new TypeError('vector must be an array of { num: BigInt, den: BigInt }');
  }

  const { iterations, precision } = parseOptions(options);

  if (vector.length === 0) {
    return { num: 0n, den: 1n };
  }

  const normalized = new Array(vector.length);
  const keyParts = new Array(vector.length);
  for (let i = 0; i < vector.length; i++) {
    const comp = normalizeComponent(vector[i], i);
    normalized[i] = comp;
    keyParts[i] = `${comp.absNum}/${comp.den}`;
  }

  // Canonicalize order for small/medium vectors so permutations share cache entries
  if (keyParts.length <= SORT_KEY_THRESHOLD) {
    keyParts.sort();
  }
  const vectorKey = `${keyParts.join(',')}|${iterations ?? ''}|${precision ?? ''}`;
  const cached = vectorMagnitudeMemo.get(vectorKey);
  if (cached !== undefined) {
    return { num: cached.num, den: cached.den };
  }

  // Exact reduced sum of squares: sumNum / sumDen
  let sumNum = 0n;
  let sumDen = 1n;
  for (let i = 0; i < normalized.length; i++) {
    const { absNum, den } = normalized[i];
    if (absNum === 0n) continue;
    const sqNum = absNum * absNum;
    const sqDen = den * den;
    if (sumNum === 0n) {
      sumNum = sqNum;
      sumDen = sqDen;
    } else {
      const gDen = gcd(sumDen, sqDen);
      const nextNum = sumNum * (sqDen / gDen) + sqNum * (sumDen / gDen);
      const nextDen = (sumDen / gDen) * sqDen;
      const g = gcd(nextNum, nextDen);
      sumNum = nextNum / g;
      sumDen = nextDen / g;
    }
  }

  const result = sqrtRational(sumNum, sumDen, iterations, precision);
  cacheSet(vectorMagnitudeMemo, vectorKey, result);
  return { num: result.num, den: result.den };
}
