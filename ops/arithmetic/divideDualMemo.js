/**
 * @typedef {Object} DualNumber
 * @property {number} v - The primal (real) value component.
 * @property {number} d - The tangent (forward-mode derivative) component.
 */

/**
 * @typedef {Object} DivideDualMemoStats
 * @property {number} cacheSize - Current number of entries in the bounded LRU memoization cache.
 * @property {number} maxCacheSize - Maximum number of entries allowed in the memoization cache.
 * @property {number} precomputedSize - Number of entries in the precomputed small-integer table.
 * @property {number} precomputedHits - Count of calls served from the precomputed table.
 * @property {number} cacheHits - Count of calls served from the dynamic memoization cache.
 * @property {number} cacheMisses - Count of calls that required fresh computation.
 * @property {number} evictions - Count of LRU entries evicted due to the cache size bound.
 */

const MAX_CACHE_SIZE = 1024;

/**
 * Converts a finite number to a canonical string key that distinguishes `-0` from `+0`.
 *
 * @param {number} n
 * @returns {string}
 */
function numKey(n) {
	return Object.is(n, -0) ? '-0' : String(n);
}

/**
 * Builds a unique cache key for a pair of dual numbers.
 *
 * @param {number} av
 * @param {number} ad
 * @param {number} bv
 * @param {number} bd
 * @returns {string}
 */
function makeKey(av, ad, bv, bd) {
	return `${numKey(av)},${numKey(ad)},${numKey(bv)},${numKey(bd)}`;
}

/**
 * Computes the quotient of two validated dual numbers.
 *
 * Formula:
 *   v = a.v / b.v
 *   d = (a.d * b.v - a.v * b.d) / (b.v * b.v)
 *
 * Falls back to the algebraically equivalent scaled form `(a.d - v * b.d) / b.v`
 * if intermediate products overflow or underflow to zero.
 *
 * @param {number} av
 * @param {number} ad
 * @param {number} bv
 * @param {number} bd
 * @returns {Readonly<DualNumber>}
 */
function computeDualQuotient(av, ad, bv, bd) {
	const v = av / bv;
	const bv2 = bv * bv;
	const num = ad * bv - av * bd;
	const d =
		bv2 !== 0 && Number.isFinite(bv2) && Number.isFinite(num)
			? num / bv2
			: (ad - v * bd) / bv;
	return Object.freeze({ v, d });
}

/**
 * Builds a precomputed lookup table for small integer dual-number quotients:
 * av, ad, bd in [-2..2] and bv in [-2, -1, 1, 2].
 *
 * @returns {Map<string, Readonly<DualNumber>>}
 */
function buildPrecomputedTable() {
	const table = new Map();
	const ints = [-2, -1, 0, 1, 2];
	const nonZeroInts = [-2, -1, 1, 2];
	for (const av of ints) {
		for (const ad of ints) {
			for (const bv of nonZeroInts) {
				for (const bd of ints) {
					table.set(makeKey(av, ad, bv, bd), computeDualQuotient(av, ad, bv, bd));
				}
			}
		}
	}
	return table;
}

const PRECOMPUTED_TABLE = buildPrecomputedTable();

/** @type {Map<string, Readonly<DualNumber>>} */
const memoCache = new Map();

const stats = {
	precomputedHits: 0,
	cacheHits: 0,
	cacheMisses: 0,
	evictions: 0,
};

/**
 * Validates that an input is a well-formed dual number `{ v, d }` with finite numeric components.
 *
 * @param {unknown} input
 * @param {string} name
 * @returns {DualNumber}
 */
function validateDual(input, name) {
	if (input === null || typeof input !== 'object' || Array.isArray(input)) {
		throw new TypeError(`${name} must be a dual number object { v, d }`);
	}
	const { v, d } = /** @type {Record<string, unknown>} */ (input);
	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError(`${name}.v and ${name}.d must be numbers`);
	}
	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError(`${name}.v and ${name}.d must be finite numbers`);
	}
	return { v, d };
}

/**
 * Divides dual number `a` by dual number `b` using a precomputed table for common
 * small-integer operands and a bounded LRU memoization cache for general inputs.
 *
 * Dual-number division carries forward-mode automatic differentiation via the quotient rule:
 * - `v = a.v / b.v`
 * - `d = (a.d * b.v - a.v * b.d) / (b.v * b.v)`
 *
 * Always returns a fresh `{ v, d }` object so callers cannot mutate cached entries.
 *
 * @param {DualNumber} a - Numerator dual number `{ v, d }`.
 * @param {DualNumber} b - Denominator dual number `{ v, d }` with `b.v !== 0`.
 * @returns {DualNumber} The quotient dual number `{ v, d }`.
 * @throws {TypeError} If `a` or `b` is not an object with numeric `v` and `d` properties.
 * @throws {RangeError} If any component is non-finite (`NaN`, `±Infinity`) or if `b.v === 0`.
 */
export function divideDualMemo(a, b) {
	const da = validateDual(a, 'a');
	const db = validateDual(b, 'b');

	if (db.v === 0) {
		throw new RangeError('Division by zero: b.v must be non-zero');
	}

	const key = makeKey(da.v, da.d, db.v, db.d);

	const precomputed = PRECOMPUTED_TABLE.get(key);
	if (precomputed !== undefined) {
		stats.precomputedHits += 1;
		return { v: precomputed.v, d: precomputed.d };
	}

	const cached = memoCache.get(key);
	if (cached !== undefined) {
		stats.cacheHits += 1;
		// Refresh LRU recency
		memoCache.delete(key);
		memoCache.set(key, cached);
		return { v: cached.v, d: cached.d };
	}

	stats.cacheMisses += 1;
	const result = computeDualQuotient(da.v, da.d, db.v, db.d);

	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		if (oldestKey !== undefined) {
			memoCache.delete(oldestKey);
			stats.evictions += 1;
		}
	}
	memoCache.set(key, result);

	return { v: result.v, d: result.d };
}

/**
 * Clears the dynamic memoization cache and resets hit/miss/eviction statistics.
 */
export function clearDivideDualMemoCache() {
	memoCache.clear();
	stats.precomputedHits = 0;
	stats.cacheHits = 0;
	stats.cacheMisses = 0;
	stats.evictions = 0;
}

/**
 * Returns a snapshot of the memoization cache and precomputed table statistics.
 *
 * @returns {DivideDualMemoStats}
 */
export function getDivideDualMemoStats() {
	return {
		cacheSize: memoCache.size,
		maxCacheSize: MAX_CACHE_SIZE,
		precomputedSize: PRECOMPUTED_TABLE.size,
		precomputedHits: stats.precomputedHits,
		cacheHits: stats.cacheHits,
		cacheMisses: stats.cacheMisses,
		evictions: stats.evictions,
	};
}
