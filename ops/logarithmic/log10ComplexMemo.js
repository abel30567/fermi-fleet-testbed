/**
 * @typedef {Object} Complex
 * @property {number} re - The finite real part of the complex number.
 * @property {number} im - The finite imaginary part of the complex number.
 */

const LOG10E = Math.LOG10E;
const HALF_LOG10E = 0.5 * LOG10E;
const PI_OVER_LN10 = Math.PI * LOG10E;
const HALF_PI_OVER_LN10 = (Math.PI / 2) * LOG10E;
const QUARTER_PI_OVER_LN10 = (Math.PI / 4) * LOG10E;
const THREE_QUARTER_PI_OVER_LN10 = ((3 * Math.PI) / 4) * LOG10E;
const HALF_LOG10_2 = 0.5 * Math.log10(2);

/** Maximum number of dynamic entries retained in the LRU memoization cache. */
const MAX_CACHE_SIZE = 1024;

/**
 * Formats a numeric component for canonical cache keying, distinguishing -0 from +0
 * so IEEE 754 branch-cut continuity on the negative real axis is preserved.
 *
 * @param {number} value
 * @returns {string}
 */
function formatKeyComponent(value) {
	return Object.is(value, -0) ? '-0' : String(value);
}

/**
 * Builds a canonical cache key for a complex number `{ re, im }`.
 *
 * @param {number} re
 * @param {number} im
 * @returns {string}
 */
function makeCacheKey(re, im) {
	return `${formatKeyComponent(re)},${formatKeyComponent(im)}`;
}

/**
 * Precomputed lookup table for canonical complex numbers (powers of 10 along
 * the real and imaginary axes, and unit diagonal corners).
 *
 * @type {ReadonlyMap<string, Readonly<Complex>>}
 */
const PRECOMPUTED_TABLE = (() => {
	const table = new Map();

	for (let k = -6; k <= 6; k += 1) {
		const mag = Number(`1e${k}`);
		table.set(makeCacheKey(mag, 0), Object.freeze({ re: k, im: 0 }));
		table.set(makeCacheKey(-mag, 0), Object.freeze({ re: k, im: PI_OVER_LN10 }));
		table.set(makeCacheKey(-mag, -0), Object.freeze({ re: k, im: -PI_OVER_LN10 }));
		table.set(makeCacheKey(0, mag), Object.freeze({ re: k, im: HALF_PI_OVER_LN10 }));
		table.set(makeCacheKey(0, -mag), Object.freeze({ re: k, im: -HALF_PI_OVER_LN10 }));
	}

	table.set(makeCacheKey(1, 1), Object.freeze({ re: HALF_LOG10_2, im: QUARTER_PI_OVER_LN10 }));
	table.set(makeCacheKey(1, -1), Object.freeze({ re: HALF_LOG10_2, im: -QUARTER_PI_OVER_LN10 }));
	table.set(
		makeCacheKey(-1, 1),
		Object.freeze({ re: HALF_LOG10_2, im: THREE_QUARTER_PI_OVER_LN10 }),
	);
	table.set(
		makeCacheKey(-1, -1),
		Object.freeze({ re: HALF_LOG10_2, im: -THREE_QUARTER_PI_OVER_LN10 }),
	);

	return table;
})();

/**
 * Bounded LRU memoization cache for dynamically computed values.
 *
 * @type {Map<string, Readonly<Complex>>}
 */
const memoCache = new Map();

/**
 * Validates that `z` is a nonzero complex number object `{ re, im }` with finite numbers.
 *
 * @param {unknown} z
 * @returns {Complex}
 */
function validateComplexInput(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Expected complex number as an object with numeric { re, im } properties');
	}

	const { re, im } = /** @type {{ re?: unknown, im?: unknown }} */ (z);

	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError('Complex number properties "re" and "im" must both be numbers');
	}

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex number properties "re" and "im" must be finite numbers');
	}

	if (re === 0 && im === 0) {
		throw new RangeError('log10ComplexMemo is undefined for 0 + 0i (singularity at the origin)');
	}

	return { re, im };
}

/**
 * Computes the principal base-10 logarithm of a validated nonzero complex number
 * without overflow or underflow at extreme magnitudes.
 *
 * Uses:
 *   log10(|z|) = log10(M) + (log10(e) / 2) * log1p((m / M)^2)
 *   arg(z) / ln(10) = atan2(im, re) * log10(e)
 * where M = max(|re|, |im|) and m = min(|re|, |im|).
 *
 * @param {number} re
 * @param {number} im
 * @returns {Readonly<Complex>}
 */
function computeLog10Complex(re, im) {
	const absRe = Math.abs(re);
	const absIm = Math.abs(im);

	let maxAbs;
	let minAbs;
	if (absRe >= absIm) {
		maxAbs = absRe;
		minAbs = absIm;
	} else {
		maxAbs = absIm;
		minAbs = absRe;
	}

	const ratio = minAbs / maxAbs;
	const resultRe = Math.log10(maxAbs) + HALF_LOG10E * Math.log1p(ratio * ratio);
	const resultIm = Math.atan2(im, re) * LOG10E;

	return Object.freeze({ re: resultRe, im: resultIm });
}

/**
 * Computes the principal base-10 logarithm of a complex number `z = re + im * i`
 * using a precomputed lookup table for canonical values and a bounded LRU
 * memoization cache for repeated evaluations.
 *
 * Principal branch: `Im(log10(z))` lies in `(-pi / ln(10), pi / ln(10)]`, with
 * IEEE 754 signed-zero continuity along the negative real branch cut
 * (`log10(-a - 0i)` yields `-pi / ln(10)` for `a > 0`).
 *
 * Always returns a fresh `{ re, im }` object so caller mutations cannot corrupt
 * cached or precomputed entries.
 *
 * @param {Complex} z - Nonzero complex number with finite `{ re, im }` components.
 * @returns {Complex} The principal base-10 logarithm `{ re, im }`.
 * @throws {TypeError} If `z` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is non-finite (`NaN`, `±Infinity`), or if `z` is `0 + 0i`.
 */
export function log10ComplexMemo(z) {
	const { re, im } = validateComplexInput(z);
	const key = makeCacheKey(re, im);

	const precomputed = PRECOMPUTED_TABLE.get(key);
	if (precomputed !== undefined) {
		return { re: precomputed.re, im: precomputed.im };
	}

	const cached = memoCache.get(key);
	if (cached !== undefined) {
		// Refresh recency for LRU ordering.
		memoCache.delete(key);
		memoCache.set(key, cached);
		return { re: cached.re, im: cached.im };
	}

	const computed = computeLog10Complex(re, im);
	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		memoCache.delete(oldestKey);
	}
	memoCache.set(key, computed);

	return { re: computed.re, im: computed.im };
}
