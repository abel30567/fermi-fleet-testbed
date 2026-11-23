/**
 * Memoized and table-driven base-10 logarithm over dual numbers `{ v, d }`.
 *
 * For a dual number `x = v + d·ε` (with `ε² = 0` and `v > 0`):
 *   log10(v + d·ε) = log10(v) + (d / (v · ln(10)))·ε
 *
 * Uses precomputed lookup tables for exact powers of 10 (`10^-308`..`10^308`),
 * small positive integers (`1`..`1024`), and `1 / ln(10)`, combined with a
 * bounded FIFO memoization cache that always returns fresh result objects.
 *
 * @module ops/logarithmic/log10DualMemo
 */

/** Precomputed reciprocal of ln(10), equal to log10(e). */
const INV_LN10 = Math.LOG10E;

/** Maximum number of cached dual-number evaluations. */
const MAX_CACHE_SIZE = 1024;

/** Upper bound (inclusive) for the precomputed small-integer table. */
const SMALL_INT_LIMIT = 1024;

/**
 * Precomputed exact powers of 10 (`10^k -> k`) for integer exponents `k` in [-308, 308].
 * Ensures exact integer primal outputs for exact powers of 10.
 * @type {Map<number, number>}
 */
const POW10_TABLE = new Map();
for (let k = -308; k <= 308; k += 1) {
	const value = Number(`1e${k}`);
	if (value > 0 && Number.isFinite(value)) {
		POW10_TABLE.set(value, k);
	}
}

/**
 * Precomputed `log10(n)` values for small integers `1 <= n <= SMALL_INT_LIMIT`.
 * @type {Float64Array}
 */
const SMALL_INT_LOG10 = new Float64Array(SMALL_INT_LIMIT + 1);

/**
 * Precomputed derivative scale factors `1 / (n * ln(10))` for `1 <= n <= SMALL_INT_LIMIT`.
 * @type {Float64Array}
 */
const SMALL_INT_DERIV_FACTOR = new Float64Array(SMALL_INT_LIMIT + 1);

for (let n = 1; n <= SMALL_INT_LIMIT; n += 1) {
	SMALL_INT_LOG10[n] = POW10_TABLE.has(n) ? POW10_TABLE.get(n) : Math.log10(n);
	SMALL_INT_DERIV_FACTOR[n] = INV_LN10 / n;
}

/**
 * Bounded memoization cache mapping canonical `(v, d)` keys to cached `{ v, d }` results.
 * @type {Map<string, { v: number, d: number }>}
 */
const MEMO_CACHE = new Map();

/**
 * Validates that `x` is a dual number `{ v, d }` with finite numeric components and `v > 0`.
 *
 * @param {unknown} x - Candidate dual number.
 * @throws {TypeError} If `x` is not a non-null plain/object dual number or its components are not numbers.
 * @throws {RangeError} If `x.v` or `x.d` is non-finite or `x.v <= 0`.
 */
function validateDualInput(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('log10DualMemo expects a dual number object { v, d }');
	}
	const { v, d } = x;
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('log10DualMemo requires numeric v and d properties');
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('log10DualMemo requires finite v and d values');
	}
	if (v <= 0) {
		throw new RangeError('log10DualMemo requires x.v > 0');
	}
}

/**
 * Builds a canonical cache key for `(v, d)`, preserving the distinction between `0` and `-0` in `d`.
 *
 * @param {number} v - Primal value (`v > 0`).
 * @param {number} d - Dual derivative component.
 * @returns {string} Canonical cache key.
 */
function makeCacheKey(v, d) {
	const dKey = Object.is(d, -0) ? '-0' : String(d);
	return `${v}:${dKey}`;
}

/**
 * Computes the base-10 logarithm of a dual number `{ v, d }` using precomputed tables
 * and a bounded memoization cache.
 *
 * @param {{ v: number, d: number }} x - Input dual number with finite `v > 0` and finite `d`.
 * @returns {{ v: number, d: number }} Fresh dual number `{ v: log10(x.v), d: x.d / (x.v * Math.LN10) }`.
 * @throws {TypeError} If `x` is not a valid dual number object with numeric `v` and `d`.
 * @throws {RangeError} If `x.v` or `x.d` is not finite, or if `x.v <= 0`.
 */
export function log10DualMemo(x) {
	validateDualInput(x);

	const { v, d } = x;
	const key = makeCacheKey(v, d);
	const cached = MEMO_CACHE.get(key);
	if (cached !== undefined) {
		return { v: cached.v, d: cached.d };
	}

	let outV;
	let outD;

	if (Number.isInteger(v) && v >= 1 && v <= SMALL_INT_LIMIT) {
		outV = SMALL_INT_LOG10[v];
		outD = d * SMALL_INT_DERIV_FACTOR[v];
	} else {
		const exactPow10 = POW10_TABLE.get(v);
		outV = exactPow10 !== undefined ? exactPow10 : Math.log10(v);
		// Avoid premature overflow for huge |d| and premature underflow for subnormal |d|.
		outD = Math.abs(d) > 1e150 ? (d * INV_LN10) / v : (d / v) * INV_LN10;
	}

	if (MEMO_CACHE.size >= MAX_CACHE_SIZE) {
		const oldestKey = MEMO_CACHE.keys().next().value;
		MEMO_CACHE.delete(oldestKey);
	}
	MEMO_CACHE.set(key, { v: outV, d: outD });

	return { v: outV, d: outD };
}
