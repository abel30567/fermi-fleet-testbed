/**
 * Table-driven, memoized IEEE-754 float64 arccosine implementation.
 *
 * Precomputes a uniform lookup table of arcsin(t_k) and cos(arcsin(t_k)) on
 * [0, 0.5] at module initialization using the convergent Maclaurin series for
 * arcsin. Runtime evaluation reduces any in-domain input x in [-1, 1] into
 * [0, 0.5] via half-angle and symmetry identities, refines from the nearest
 * precomputed table node using a cancellation-free angle-difference formula
 * and a 4-term odd polynomial (error < 1e-22), and memoizes results in a
 * bounded LRU cache.
 *
 * @module ops/trigonometric/arccosFloatMemo
 */

const HALF_PI = Math.PI / 2;

/** Number of uniform subintervals on [0, 0.5] (step size 2^-9 = 1/512). */
const TABLE_STEPS = 256;
const TABLE_SIZE = TABLE_STEPS + 1;
const STEP_INV = TABLE_STEPS * 2; // 512, exact power of two

/** Maximum number of entries retained in the LRU memoization cache. */
const MAX_CACHE_SIZE = 4096;

/**
 * Computes arcsin(t) for t in [0, 0.5] using its Maclaurin series.
 * Used once at module load to populate the precomputed lookup table.
 *
 * @param {number} t - Input value in [0, 0.5].
 * @returns {number} arcsin(t) in radians.
 */
function seriesArcsin(t) {
	if (t === 0) return 0;
	const t2 = t * t;
	let coeff = t;
	let sum = t;
	for (let n = 1; n <= 40; n++) {
		const twoN = 2 * n;
		coeff *= ((twoN - 1) / twoN) * t2;
		const term = coeff / (twoN + 1);
		sum += term;
		if (term <= sum * 1e-17) break;
	}
	return sum;
}

/** Precomputed arcsin(k / 512) for k = 0..256. */
const THETA_TABLE = new Float64Array(TABLE_SIZE);
/** Precomputed sqrt(1 - (k / 512)^2) for k = 0..256. */
const COS_TABLE = new Float64Array(TABLE_SIZE);

for (let k = 0; k < TABLE_SIZE; k++) {
	const t = k / STEP_INV;
	THETA_TABLE[k] = seriesArcsin(t);
	COS_TABLE[k] = Math.sqrt(1 - t * t);
}

/** Bounded LRU memoization cache mapping normalized float64 x -> arccos(x). */
const memoCache = new Map();
let cacheHits = 0;
let cacheMisses = 0;

/**
 * Evaluates arcsin(x) for x in [0, 0.5] using the precomputed lookup table
 * and a local angle-difference polynomial around the nearest table node.
 *
 * @param {number} x - Non-negative float64 in [0, 0.5].
 * @returns {number} arcsin(x) in radians.
 */
function arcsinFromTable(x) {
	const k = Math.round(x * STEP_INV);
	const tk = k / STEP_INV;
	if (x === tk) {
		return THETA_TABLE[k];
	}

	let u;
	if (k === 0) {
		u = x;
	} else {
		// Cancellation-free form of sin(arcsin(x) - arcsin(tk))
		u = ((x - tk) * (x + tk)) / (x * COS_TABLE[k] + tk * Math.sqrt(1 - x * x));
	}

	const u2 = u * u;
	// |u| < 1.2e-3, so the 4-term odd series is accurate past float64 precision.
	const delta = u + u * u2 * (1 / 6 + u2 * (3 / 40 + u2 * (5 / 112)));
	return THETA_TABLE[k] + delta;
}

/**
 * Computes arccos(x) for a validated in-domain float64 x in [-1, 1].
 *
 * @param {number} x - Validated float64 in [-1, 1].
 * @returns {number} arccos(x) in [0, pi].
 */
function computeArccos(x) {
	if (x === 1) return 0;
	if (x === -1) return Math.PI;
	if (x === 0) return HALF_PI;

	if (x > 0.5) {
		return 2 * arcsinFromTable(Math.sqrt((1 - x) * 0.5));
	}
	if (x < -0.5) {
		return Math.PI - 2 * arcsinFromTable(Math.sqrt((1 + x) * 0.5));
	}
	if (x > 0) {
		return HALF_PI - arcsinFromTable(x);
	}
	return HALF_PI + arcsinFromTable(-x);
}

/**
 * Computes the trigonometric arccosine (inverse cosine) of an IEEE-754 float64
 * number using a precomputed lookup table and bounded LRU memoization.
 *
 * @param {number} x - Input IEEE-754 float64 number. Must be of primitive type `number`.
 * @returns {number} The arccosine of `x` in radians within `[0, Math.PI]`, or `NaN`
 *   if `x` is `NaN`, `±Infinity`, or outside the closed domain `[-1, 1]`.
 * @throws {TypeError} If `x` is not a primitive `number` (e.g., string, null,
 *   undefined, boolean, bigint, object, symbol, or boxed `Number`).
 */
export function arccosFloatMemo(x) {
	if (typeof x !== 'number') {
		throw new TypeError(
			`arccosFloatMemo expected a primitive number, received ${x === null ? 'null' : typeof x}`,
		);
	}

	if (Number.isNaN(x) || x < -1 || x > 1) {
		return Number.NaN;
	}

	// Normalize -0 to +0 for consistent memoization keys.
	const key = x === 0 ? 0 : x;

	if (memoCache.has(key)) {
		const cached = memoCache.get(key);
		// Refresh LRU recency.
		memoCache.delete(key);
		memoCache.set(key, cached);
		cacheHits += 1;
		return cached;
	}

	const result = computeArccos(key);
	cacheMisses += 1;

	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		memoCache.delete(oldestKey);
	}
	memoCache.set(key, result);

	return result;
}

/**
 * Clears the memoization cache and resets hit/miss counters.
 * The precomputed lookup tables remain intact.
 */
arccosFloatMemo.clearCache = function clearCache() {
	memoCache.clear();
	cacheHits = 0;
	cacheMisses = 0;
};

/**
 * Returns a snapshot of the memoization cache and precomputed table statistics.
 *
 * @returns {{ size: number, maxSize: number, hits: number, misses: number, tableSize: number }}
 */
arccosFloatMemo.getCacheStats = function getCacheStats() {
	return {
		size: memoCache.size,
		maxSize: MAX_CACHE_SIZE,
		hits: cacheHits,
		misses: cacheMisses,
		tableSize: TABLE_SIZE,
	};
};
