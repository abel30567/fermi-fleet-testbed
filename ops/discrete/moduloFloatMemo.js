/**
 * Precomputed lookup table dimensions for small non-negative integer pairs.
 * Covers dividends a in [0, TABLE_A_LIMIT) and divisors b in [1, TABLE_B_LIMIT].
 */
const TABLE_A_LIMIT = 64;
const TABLE_B_LIMIT = 64;

/**
 * Maximum number of dynamically memoized entries retained in the LRU cache.
 */
const MAX_CACHE_SIZE = 4096;

/**
 * Flat precomputed modulo table for small non-negative integer inputs.
 * Indexed by `a * TABLE_B_LIMIT + (b - 1)`.
 * @type {Uint8Array}
 */
const SMALL_MOD_TABLE = new Uint8Array(TABLE_A_LIMIT * TABLE_B_LIMIT);

for (let a = 0; a < TABLE_A_LIMIT; a++) {
	const rowOffset = a * TABLE_B_LIMIT;
	for (let b = 1; b <= TABLE_B_LIMIT; b++) {
		SMALL_MOD_TABLE[rowOffset + (b - 1)] = a % b;
	}
}

/**
 * Bounded LRU memoization cache keyed by canonical finite float64 pairs.
 * @type {Map<string, number>}
 */
const memoCache = new Map();

/**
 * Computes the discrete (floored / Knuth) modulo of two finite IEEE-754 float64
 * numbers `a` and `b` without using the memoization table.
 *
 * The result `r` satisfies:
 * - If `b > 0`: `0 <= r < b`
 * - If `b < 0`: `b < r <= 0`
 * - Signed zero (`-0`) is normalized to `+0`.
 *
 * @param {number} a - Finite IEEE-754 float64 dividend.
 * @param {number} b - Finite non-zero IEEE-754 float64 modulus.
 * @returns {number} The floored modulo `a mod b`.
 */
function computeModuloFloat(a, b) {
	let r = a % b;
	if (r === 0) {
		return 0;
	}
	if ((r < 0) !== (b < 0)) {
		r += b;
		// Guard against float64 rounding where tiny opposite-sign r satisfies r + b === b.
		if (r === b) {
			return 0;
		}
	}
	return r === 0 ? 0 : r;
}

/**
 * Computes the discrete (floored) modulo `a mod b` over IEEE-754 float64 Numbers
 * using a precomputed lookup table for small non-negative integer pairs and a
 * bounded LRU memoization cache for general finite float64 inputs.
 *
 * Unlike JavaScript's truncated remainder operator (`%`), this function implements
 * floored (discrete mathematical) modulo: the result always has the sign of `b`
 * (or is `+0`), lying in `[0, b)` when `b > 0` and `(b, 0]` when `b < 0`.
 *
 * @param {number} a - Finite IEEE-754 float64 dividend.
 * @param {number} b - Finite non-zero IEEE-754 float64 modulus.
 * @returns {number} The discrete modulo `a mod b`.
 * @throws {TypeError} If `a` or `b` is not of type `number`.
 * @throws {RangeError} If `a` or `b` is not finite (`NaN`, `Infinity`, `-Infinity`), or if `b === 0`.
 */
export function moduloFloatMemo(a, b) {
	if (typeof a !== 'number' || typeof b !== 'number') {
		throw new TypeError('moduloFloatMemo expects both arguments a and b to be numbers');
	}
	if (!Number.isFinite(a) || !Number.isFinite(b)) {
		throw new RangeError('moduloFloatMemo expects finite IEEE-754 float64 numbers');
	}
	if (b === 0) {
		throw new RangeError('moduloFloatMemo modulus b must be non-zero');
	}

	// Normalize -0 to +0 for consistent table lookup and cache keying.
	const na = a === 0 ? 0 : a;
	const nb = b;

	// Fast path 1: precomputed lookup table for small non-negative integers.
	if (
		na >= 0 &&
		na < TABLE_A_LIMIT &&
		nb >= 1 &&
		nb <= TABLE_B_LIMIT &&
		Number.isInteger(na) &&
		Number.isInteger(nb)
	) {
		return SMALL_MOD_TABLE[na * TABLE_B_LIMIT + (nb - 1)];
	}

	// Fast path 2: bounded LRU memoization cache.
	const key = `${na},${nb}`;
	if (memoCache.has(key)) {
		const cached = memoCache.get(key);
		// Refresh recency for LRU ordering.
		memoCache.delete(key);
		memoCache.set(key, cached);
		return cached;
	}

	const result = computeModuloFloat(na, nb);

	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		memoCache.delete(oldestKey);
	}
	memoCache.set(key, result);

	return result;
}
