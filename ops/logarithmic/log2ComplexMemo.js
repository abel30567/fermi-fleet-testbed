/**
 * @fileoverview Principal complex base-2 logarithm with a precomputed lookup
 * table for exact common inputs and bounded LRU memoization.
 */

const PI_OVER_LN2 = Math.PI / Math.LN2;
const HALF_PI_OVER_LN2 = PI_OVER_LN2 / 2;
const QUARTER_PI_OVER_LN2 = PI_OVER_LN2 / 4;
const THREE_QUARTER_PI_OVER_LN2 = ((3 * Math.PI) / 4) / Math.LN2;

/** Maximum number of dynamically computed entries retained in the memo cache. */
const MAX_CACHE_SIZE = 1024;

/**
 * Normalize signed zero (`-0`) to `+0` so cache keys and branch-cut behavior
 * are consistent with the principal argument range (-π, π].
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x;
}

/**
 * Build the canonical string key for a normalized complex number.
 *
 * @param {number} re
 * @param {number} im
 * @returns {string}
 */
function makeKey(re, im) {
	return `${re},${im}`;
}

/**
 * Precomputed exact lookup table for common complex values:
 * - Cardinal powers of 2: ±2^k, ±2^k·i for k ∈ [-16, 16] (includes 1, -1, i, -i)
 * - Diagonal powers of 2: (±2^k, ±2^k) for k ∈ [-8, 8] (|z| = 2^(k + 0.5))
 *
 * @type {Map<string, Readonly<{ re: number, im: number }>>}
 */
const PRECOMPUTED_TABLE = new Map();

for (let k = -16; k <= 16; k++) {
	const p = 2 ** k;
	PRECOMPUTED_TABLE.set(makeKey(p, 0), Object.freeze({ re: normalizeZero(k), im: 0 }));
	PRECOMPUTED_TABLE.set(
		makeKey(-p, 0),
		Object.freeze({ re: normalizeZero(k), im: PI_OVER_LN2 })
	);
	PRECOMPUTED_TABLE.set(
		makeKey(0, p),
		Object.freeze({ re: normalizeZero(k), im: HALF_PI_OVER_LN2 })
	);
	PRECOMPUTED_TABLE.set(
		makeKey(0, -p),
		Object.freeze({ re: normalizeZero(k), im: -HALF_PI_OVER_LN2 })
	);
}

for (let k = -8; k <= 8; k++) {
	const p = 2 ** k;
	const re = k + 0.5;
	PRECOMPUTED_TABLE.set(
		makeKey(p, p),
		Object.freeze({ re, im: QUARTER_PI_OVER_LN2 })
	);
	PRECOMPUTED_TABLE.set(
		makeKey(p, -p),
		Object.freeze({ re, im: -QUARTER_PI_OVER_LN2 })
	);
	PRECOMPUTED_TABLE.set(
		makeKey(-p, p),
		Object.freeze({ re, im: THREE_QUARTER_PI_OVER_LN2 })
	);
	PRECOMPUTED_TABLE.set(
		makeKey(-p, -p),
		Object.freeze({ re, im: -THREE_QUARTER_PI_OVER_LN2 })
	);
}

/**
 * Bounded LRU memoization cache for dynamically computed results.
 *
 * @type {Map<string, Readonly<{ re: number, im: number }>>}
 */
const memoCache = new Map();

/**
 * Compute log2(|re + i*im|) without intermediate overflow or underflow for
 * extreme finite IEEE-754 magnitudes.
 *
 * @param {number} re
 * @param {number} im
 * @returns {number}
 */
function log2Abs(re, im) {
	const absRe = Math.abs(re);
	const absIm = Math.abs(im);
	const max = absRe >= absIm ? absRe : absIm;
	const min = absRe >= absIm ? absIm : absRe;
	if (min === 0) {
		return Math.log2(max);
	}
	const ratio = min / max;
	return Math.log2(max) + Math.log1p(ratio * ratio) / (2 * Math.LN2);
}

/**
 * Compute the principal complex base-2 logarithm `ln(z) / ln(2)` for a complex
 * number `z = { re, im }`.
 *
 * Uses the principal branch with argument `Arg(z) ∈ (-π, π]` (branch cut along
 * the negative real axis, where `Arg(-r) = +π` for `r > 0`). Common exact
 * values (cardinal and diagonal powers of 2, including `1`, `-1`, `i`, `-i`)
 * are served from a precomputed table, and other values are memoized in a
 * bounded Map cache. Always returns a fresh `{ re, im }` object so internal
 * tables and cache entries cannot be mutated by callers.
 *
 * @param {{ re: number, im: number }} z - Non-zero finite complex number.
 * @returns {{ re: number, im: number }} Principal value of log2(z).
 * @throws {TypeError} If `z` is not a plain object with numeric `re` and `im`.
 * @throws {RangeError} If `re` or `im` is non-finite (`NaN`, `±Infinity`), or if `z` is zero.
 */
export function log2ComplexMemo(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Expected z to be a complex number object { re, im }');
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError('Expected z.re and z.im to be numbers');
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError('Expected z.re and z.im to be finite numbers');
	}
	if (z.re === 0 && z.im === 0) {
		throw new RangeError('Complex log2 is undefined at zero (0 + 0i)');
	}

	const re = normalizeZero(z.re);
	const im = normalizeZero(z.im);
	const key = makeKey(re, im);

	const precomputed = PRECOMPUTED_TABLE.get(key);
	if (precomputed !== undefined) {
		return { re: precomputed.re, im: precomputed.im };
	}

	const cached = memoCache.get(key);
	if (cached !== undefined) {
		// Refresh LRU recency
		memoCache.delete(key);
		memoCache.set(key, cached);
		return { re: cached.re, im: cached.im };
	}

	const outRe = normalizeZero(log2Abs(re, im));
	const outIm = normalizeZero(Math.atan2(im, re) / Math.LN2);
	const entry = Object.freeze({ re: outRe, im: outIm });

	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		memoCache.delete(oldestKey);
	}
	memoCache.set(key, entry);

	return { re: entry.re, im: entry.im };
}
