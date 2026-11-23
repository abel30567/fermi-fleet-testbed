/**
 * @fileoverview Element-wise base-10 logarithm over Float64Array inputs using
 * precomputed lookup tables (small integers, powers of 10, and mantissa bins)
 * combined with a bounded LRU-style memoization cache.
 *
 * Zero dependencies, ESM, Node 20+.
 */

const PRECOMPUTED_INT_MAX = 1024;
const MANTISSA_BINS = 256;
const MAX_MEMO_CACHE_SIZE = 4096;

/**
 * High/low Cody-Waite split of log10(2) = 0.301029995663981195213738894724493027...
 * LOG10_2_HI has exact top bits so `exp * LOG10_2_HI` is exact for all IEEE-754
 * double exponents (|exp| <= 1074).
 */
const LOG10_2_HI = 0.3010299955494702;
const LOG10_2_LO = 1.1451100899212592e-10;
const LOG10_E = Math.LOG10E;
const TWO_POW_54 = 18014398509481984; // 2^54 for normalizing subnormals

/**
 * Precomputed log10(n) table for integers 0..PRECOMPUTED_INT_MAX.
 * @type {Float64Array}
 */
const INT_LOG10_TABLE = new Float64Array(PRECOMPUTED_INT_MAX + 1);
INT_LOG10_TABLE[0] = -Infinity;
for (let i = 1; i <= PRECOMPUTED_INT_MAX; i++) {
	INT_LOG10_TABLE[i] = Math.log10(i);
}

/**
 * Precomputed exact lookup table for finite IEEE-754 powers of 10 (10^-308 .. 10^308).
 * @type {Map<number, number>}
 */
const POW10_TABLE = new Map();
for (let exp = -308; exp <= 308; exp++) {
	POW10_TABLE.set(Number(`1e${exp}`), exp);
}

/**
 * Precomputed log10(1 + k / MANTISSA_BINS) table for k = 0..MANTISSA_BINS.
 * @type {Float64Array}
 */
const MANTISSA_LOG10_TABLE = new Float64Array(MANTISSA_BINS + 1);
for (let k = 0; k <= MANTISSA_BINS; k++) {
	MANTISSA_LOG10_TABLE[k] = Math.log10(1 + k / MANTISSA_BINS);
}

/**
 * Reusable 8-byte buffer for endian-independent IEEE-754 bit extraction.
 */
const scratchBuffer = new ArrayBuffer(8);
const scratchView = new DataView(scratchBuffer);

/**
 * Bounded memoization cache mapping positive finite Float64 values to log10(x).
 * @type {Map<number, number>}
 */
const memoCache = new Map();

/**
 * Internal counters for observing table hits, memo cache hits, and misses.
 */
const stats = {
	tableHits: 0,
	cacheHits: 0,
	cacheMisses: 0,
};

/**
 * Compute log10(x) for a positive finite number using IEEE-754 exponent/mantissa
 * decomposition, the precomputed mantissa table, and a degree-9 atanh series.
 *
 * @param {number} x - Positive finite number.
 * @returns {number} Base-10 logarithm of x.
 */
function computeTableDrivenLog10(x) {
	scratchView.setFloat64(0, x, false);
	let hi = scratchView.getUint32(0, false);
	let biasedExp = (hi >>> 20) & 0x7ff;
	let exp;

	if (biasedExp === 0) {
		// Subnormal positive value: scale up by 2^54 to normalize.
		scratchView.setFloat64(0, x * TWO_POW_54, false);
		hi = scratchView.getUint32(0, false);
		biasedExp = (hi >>> 20) & 0x7ff;
		exp = biasedExp - 1023 - 54;
	} else {
		exp = biasedExp - 1023;
	}

	// Set exponent to 1023 (bias 0) to extract mantissa m in [1, 2).
	scratchView.setUint32(0, (hi & 0x000fffff) | 0x3ff00000, false);
	const m = scratchView.getFloat64(0, false);

	// Select nearest precomputed mantissa bin center c = 1 + idx / 256.
	const idx = Math.round((m - 1) * MANTISSA_BINS);
	const center = 1 + idx / MANTISSA_BINS;

	// Relative residual u = (m - center) / center with |u| <= 1 / 512.
	const u = (m - center) / center;
	const t = u / (2 + u);
	const t2 = t * t;

	// ln(1 + u) = 2 * t * (1 + t^2/3 + t^4/5 + t^6/7 + t^8/9)
	const ln1p = 2 * t * (1 + t2 * (1 / 3 + t2 * (1 / 5 + t2 * (1 / 7 + t2 / 9))));
	const log10Mantissa = MANTISSA_LOG10_TABLE[idx] + ln1p * LOG10_E;

	return exp * LOG10_2_HI + (exp * LOG10_2_LO + log10Mantissa);
}

/**
 * Resolve log10 for a single Float64 scalar using special-value handling,
 * precomputed lookup tables, and bounded memoization.
 *
 * @param {number} x - Scalar input value.
 * @returns {number} Base-10 logarithm of x (IEEE-754 semantics).
 */
function log10ScalarMemo(x) {
	if (Number.isNaN(x) || x < 0) {
		return NaN;
	}
	if (x === 0) {
		return -Infinity;
	}
	if (x === Infinity) {
		return Infinity;
	}

	// Fast path 1: precomputed small integer table (1..1024).
	if (x <= PRECOMPUTED_INT_MAX && Number.isInteger(x)) {
		stats.tableHits++;
		return INT_LOG10_TABLE[x];
	}

	// Fast path 2: precomputed exact powers of 10 (10^-308..10^308).
	const exactPow10 = POW10_TABLE.get(x);
	if (exactPow10 !== undefined) {
		stats.tableHits++;
		return exactPow10;
	}

	// Fast path 3: bounded memoization cache with LRU refresh.
	const cached = memoCache.get(x);
	if (cached !== undefined) {
		stats.cacheHits++;
		memoCache.delete(x);
		memoCache.set(x, cached);
		return cached;
	}

	// Cache miss: compute via table-driven mantissa/exponent decomposition.
	stats.cacheMisses++;
	const result = computeTableDrivenLog10(x);

	if (memoCache.size >= MAX_MEMO_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		memoCache.delete(oldestKey);
	}
	memoCache.set(x, result);
	return result;
}

/**
 * Compute the element-wise base-10 logarithm (log10) of a Float64Array using
 * precomputed lookup tables and a bounded memoization cache.
 *
 * Input validation is strict: only `Float64Array` instances are accepted.
 * Element-level edge cases follow IEEE-754 semantics:
 * - `x === 0` or `x === -0` yields `-Infinity`
 * - `x < 0` or `NaN` yields `NaN`
 * - `x === Infinity` yields `Infinity`
 *
 * The input array is never mutated, and a fresh `Float64Array` is always returned.
 *
 * @param {Float64Array} input - Input array of 64-bit floating-point values.
 * @returns {Float64Array} A new Float64Array containing element-wise log10 values.
 * @throws {TypeError} If `input` is not a `Float64Array`.
 */
export function log10TypedMemo(input) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('log10TypedMemo expects a Float64Array input');
	}

	const len = input.length;
	const out = new Float64Array(len);

	for (let i = 0; i < len; i++) {
		out[i] = log10ScalarMemo(input[i]);
	}

	return out;
}

/**
 * Return a snapshot of memoization and precomputed table statistics.
 *
 * @returns {{ tableHits: number, cacheHits: number, cacheMisses: number, cacheSize: number, maxCacheSize: number }}
 */
export function getLog10MemoStats() {
	return {
		tableHits: stats.tableHits,
		cacheHits: stats.cacheHits,
		cacheMisses: stats.cacheMisses,
		cacheSize: memoCache.size,
		maxCacheSize: MAX_MEMO_CACHE_SIZE,
	};
}

/**
 * Clear the runtime memoization cache and reset statistics counters.
 * Precomputed static lookup tables remain intact.
 */
export function clearLog10MemoCache() {
	memoCache.clear();
	stats.tableHits = 0;
	stats.cacheHits = 0;
	stats.cacheMisses = 0;
}
