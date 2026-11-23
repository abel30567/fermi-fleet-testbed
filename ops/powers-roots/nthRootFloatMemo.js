/**
 * @fileoverview Table-driven, precomputed, and memoized nth root over IEEE-754
 * float64 Numbers (`ops/powers-roots/nthRootFloatMemo.js`).
 *
 * Zero dependencies, ESM (Node 20+).
 */

/** Maximum root degree `n` stored in the reciprocal table `1 / n`. */
const MAX_RECIPROCAL_N = 64;

/** Maximum root degree `n` stored in the small-integer root lookup table. */
const MAX_SMALL_TABLE_N = 16;

/** Maximum radicand `x` stored in the small-integer root lookup table. */
const MAX_SMALL_TABLE_X = 256;

/** Maximum root degree `n` included in the exact perfect-power lookup table. */
const MAX_PERFECT_POWER_N = 12;

/** Maximum integer base included in the exact perfect-power lookup table. */
const MAX_PERFECT_POWER_BASE = 100;

/** Maximum root degree `n` for Newton-Raphson polish iterations. */
const MAX_NEWTON_N = 1024;

/** Maximum number of dynamic memoization entries retained (LRU eviction). */
const MAX_CACHE_SIZE = 4096;

/**
 * Precomputed reciprocal table for integer degrees `n` in `[1, MAX_RECIPROCAL_N]`.
 * @type {Float64Array}
 */
const RECIPROCAL_TABLE = new Float64Array(MAX_RECIPROCAL_N + 1);
for (let n = 1; n <= MAX_RECIPROCAL_N; n += 1) {
	RECIPROCAL_TABLE[n] = 1 / n;
}

/**
 * Computes the principal real nth root of a finite positive number `x > 0`
 * for a finite non-zero degree `n > 0` without touching tables or memo cache.
 *
 * Uses `Math.sqrt` / `Math.cbrt` for `n = 2, 3` and Newton-Raphson refinement
 * for integer degrees `4 <= n <= MAX_NEWTON_N` to eliminate 1-2 ULP drift from
 * non-exact binary representations of `1 / n`.
 *
 * @param {number} x - Finite strictly positive radicand (`x > 0`).
 * @param {number} n - Finite strictly positive root degree (`n > 0`).
 * @returns {number} IEEE-754 float64 approximation of `x ** (1 / n)`.
 */
function computePositiveRootCore(x, n) {
	if (x === 1) {
		return 1;
	}
	if (n === 1) {
		return x;
	}
	if (n === 2) {
		return Math.sqrt(x);
	}
	if (n === 3) {
		return Math.cbrt(x);
	}

	const isIntN = Number.isInteger(n);
	const invN = isIntN && n <= MAX_RECIPROCAL_N ? RECIPROCAL_TABLE[n] : 1 / n;
	let r = Math.pow(x, invN);

	if (!Number.isFinite(r) || r === 0) {
		return r;
	}

	// Polish integer roots using Newton-Raphson: r_{k+1} = r_k + (x / r_k^(n-1) - r_k) / n
	if (isIntN && n >= 4 && n <= MAX_NEWTON_N) {
		for (let iter = 0; iter < 2; iter += 1) {
			const rPowNm1 = Math.pow(r, n - 1);
			if (!Number.isFinite(rPowNm1) || rPowNm1 === 0) {
				break;
			}
			const quotient = x / rPowNm1;
			if (!Number.isFinite(quotient)) {
				break;
			}
			const next = r + (quotient - r) * invN;
			if (!Number.isFinite(next) || next <= 0 || next === r) {
				break;
			}
			r = next;
		}

		// Snap to exact integer when radicand is a safe integer perfect power.
		if (Number.isSafeInteger(x)) {
			const rounded = Math.round(r);
			if (
				rounded > 0 &&
				Math.abs(r - rounded) <= 1e-12 * rounded &&
				Math.pow(rounded, n) === x
			) {
				return rounded;
			}
		}
	}

	return r;
}

/**
 * Precomputed lookup table for small integer radicands `x in [0, 256]` and
 * integer degrees `n in [2, 16]`.
 *
 * Indexed as `SMALL_ROOT_TABLE[n][x]`.
 * @type {Array<Float64Array | null>}
 */
const SMALL_ROOT_TABLE = new Array(MAX_SMALL_TABLE_N + 1).fill(null);
for (let n = 2; n <= MAX_SMALL_TABLE_N; n += 1) {
	const row = new Float64Array(MAX_SMALL_TABLE_X + 1);
	row[0] = 0;
	row[1] = 1;
	for (let x = 2; x <= MAX_SMALL_TABLE_X; x += 1) {
		row[x] = computePositiveRootCore(x, n);
	}
	SMALL_ROOT_TABLE[n] = row;
}

/**
 * Precomputed exact lookup table for safe-integer perfect powers `(b^n, n) -> b`
 * for `b in [2, MAX_PERFECT_POWER_BASE]` and `n in [2, MAX_PERFECT_POWER_N]`.
 * @type {Map<string, number>}
 */
const PERFECT_POWER_TABLE = new Map();
for (let n = 2; n <= MAX_PERFECT_POWER_N; n += 1) {
	for (let base = 2; base <= MAX_PERFECT_POWER_BASE; base += 1) {
		const power = Math.pow(base, n);
		if (power > Number.MAX_SAFE_INTEGER) {
			break;
		}
		if (power > MAX_SMALL_TABLE_X) {
			PERFECT_POWER_TABLE.set(`${power}|${n}`, base);
		}
	}
}

/**
 * Bounded LRU memoization cache for dynamically computed `(x, n)` pairs.
 * Keys are canonical `${x}|${n}` strings for finite `x > 0` and finite `n !== 0`.
 * @type {Map<string, number>}
 */
const memoCache = new Map();

/**
 * Internal instrumentation counters for cache and table observability.
 */
const stats = {
	tableHits: 0,
	cacheHits: 0,
	cacheMisses: 0,
};

/**
 * Looks up or computes the root of a finite positive `x > 0` for a finite
 * strictly positive `n > 0`, utilizing precomputed tables and the LRU cache.
 *
 * @param {number} x - Finite strictly positive radicand (`x > 0`).
 * @param {number} n - Finite strictly positive root degree (`n > 0`).
 * @returns {number} Computed or cached root value.
 */
function resolvePositiveRoot(x, n) {
	if (x === 1) {
		return 1;
	}
	if (n === 1) {
		return x;
	}

	// 1. O(1) dense Float64Array lookup for small integer (x, n).
	if (
		Number.isInteger(n) &&
		n >= 2 &&
		n <= MAX_SMALL_TABLE_N &&
		Number.isInteger(x) &&
		x >= 2 &&
		x <= MAX_SMALL_TABLE_X
	) {
		stats.tableHits += 1;
		return SMALL_ROOT_TABLE[n][x];
	}

	// 2. Precomputed exact perfect-power lookup for larger safe-integer powers.
	const key = `${x}|${n}`;
	if (
		Number.isInteger(n) &&
		n >= 2 &&
		n <= MAX_PERFECT_POWER_N &&
		Number.isSafeInteger(x) &&
		x > MAX_SMALL_TABLE_X
	) {
		const exact = PERFECT_POWER_TABLE.get(key);
		if (exact !== undefined) {
			stats.tableHits += 1;
			return exact;
		}
	}

	// 3. Bounded LRU memoization cache lookup.
	if (memoCache.has(key)) {
		const cached = memoCache.get(key);
		// Refresh LRU recency.
		memoCache.delete(key);
		memoCache.set(key, cached);
		stats.cacheHits += 1;
		return cached;
	}

	// 4. Cache miss: compute, polish, and store with LRU eviction.
	stats.cacheMisses += 1;
	const result = computePositiveRootCore(x, n);

	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		memoCache.delete(oldestKey);
	}
	memoCache.set(key, result);
	return result;
}

/**
 * Looks up or computes `x ** (1 / n)` for finite `x > 0` and `-1 < n < 0`,
 * where `1 / n < -1` could cause `x ** (1 / |n|)` to overflow before taking
 * the reciprocal.
 *
 * @param {number} x - Finite strictly positive radicand (`x > 0`).
 * @param {number} n - Finite root degree with `-1 < n < 0`.
 * @returns {number} Computed or cached root value.
 */
function resolveNegativeFractionalRoot(x, n) {
	if (x === 1) {
		return 1;
	}

	const key = `${x}|${n}`;
	if (memoCache.has(key)) {
		const cached = memoCache.get(key);
		memoCache.delete(key);
		memoCache.set(key, cached);
		stats.cacheHits += 1;
		return cached;
	}

	stats.cacheMisses += 1;
	const result = Math.pow(x, 1 / n);

	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		memoCache.delete(oldestKey);
	}
	memoCache.set(key, result);
	return result;
}

/**
 * Computes the real `n`th root of an IEEE-754 float64 number `x` using
 * precomputed lookup tables (`Float64Array` small-root table, reciprocal table,
 * exact perfect-power table) backed by a bounded LRU memoization cache.
 *
 * Semantics:
 * - Throws `TypeError` if either `x` or `n` is not a `number`.
 * - Returns `NaN` if either `x` or `n` is `NaN`.
 * - Throws `RangeError` if `n === 0` (including `-0`), since the 0th root is undefined.
 * - For `n === ±Infinity`: returns `1` for finite `x > 0`, and `NaN` otherwise.
 * - For `x < 0`: returns the real negative root when `n` is an odd safe integer,
 *   and `NaN` for even integers or non-integer `n`.
 * - For `x === ±0`: returns `-0` for `-0` with positive odd integer `n`, `+0` for
 *   other positive `n`, `-Infinity` for `-0` with negative odd integer `n`, and
 *   `+Infinity` for other negative `n`.
 * - For `x === +Infinity`: returns `+Infinity` when `n > 0` and `0` when `n < 0`.
 * - For `x === -Infinity`: returns `-Infinity` for positive odd integer `n`, `-0`
 *   for negative odd integer `n`, and `NaN` otherwise.
 *
 * @param {number} x - Radicand (IEEE-754 float64 Number).
 * @param {number} n - Root degree (IEEE-754 float64 Number, must be non-zero).
 * @returns {number} Real `n`th root of `x`, or `NaN` when no real root exists.
 * @throws {TypeError} If `x` or `n` is not of type `number`.
 * @throws {RangeError} If `n` is `0` or `-0`.
 */
export function nthRootFloatMemo(x, n) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected x to be a number, got ${typeof x}`);
	}
	if (typeof n !== 'number') {
		throw new TypeError(`Expected n to be a number, got ${typeof n}`);
	}

	if (Number.isNaN(x) || Number.isNaN(n)) {
		return NaN;
	}

	if (n === 0) {
		throw new RangeError('Root degree n must be non-zero');
	}

	if (!Number.isFinite(n)) {
		return x > 0 && Number.isFinite(x) ? 1 : NaN;
	}

	// Note: IEEE-754 integers above Number.MAX_SAFE_INTEGER are all even.
	const isOddInt = Number.isSafeInteger(n) && Math.abs(n) % 2 === 1;

	if (x === 0) {
		const isNegZero = Object.is(x, -0);
		if (n > 0) {
			return isNegZero && isOddInt ? -0 : 0;
		}
		return isNegZero && isOddInt ? -Infinity : Infinity;
	}

	if (x === Infinity) {
		return n > 0 ? Infinity : 0;
	}

	if (x === -Infinity) {
		if (!isOddInt) {
			return NaN;
		}
		return n > 0 ? -Infinity : -0;
	}

	if (x < 0) {
		if (!isOddInt) {
			return NaN;
		}
		if (n === 1) {
			return x;
		}
		if (n === -1) {
			return 1 / x;
		}
		const absRoot = resolvePositiveRoot(-x, Math.abs(n));
		return n > 0 ? -absRoot : -1 / absRoot;
	}

	// Finite x > 0 and finite n !== 0.
	if (n === 1) {
		return x;
	}
	if (n === -1) {
		return 1 / x;
	}
	if (n > 0) {
		return resolvePositiveRoot(x, n);
	}
	if (n <= -1) {
		return 1 / resolvePositiveRoot(x, -n);
	}
	return resolveNegativeFractionalRoot(x, n);
}

/**
 * Clears the dynamic LRU memoization cache and resets instrumentation counters.
 * Static precomputed tables remain intact.
 */
nthRootFloatMemo.clearCache = function clearCache() {
	memoCache.clear();
	stats.tableHits = 0;
	stats.cacheHits = 0;
	stats.cacheMisses = 0;
};

/**
 * Returns a snapshot of cache and precomputed table statistics.
 *
 * @returns {{
 *   tableHits: number,
 *   cacheHits: number,
 *   cacheMisses: number,
 *   cacheSize: number,
 *   maxCacheSize: number
 * }}
 */
nthRootFloatMemo.getStats = function getStats() {
	return {
		tableHits: stats.tableHits,
		cacheHits: stats.cacheHits,
		cacheMisses: stats.cacheMisses,
		cacheSize: memoCache.size,
		maxCacheSize: MAX_CACHE_SIZE,
	};
};
