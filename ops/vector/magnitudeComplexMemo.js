/**
 * @fileoverview Memoized, table-driven Euclidean (L2) magnitude for complex vectors.
 *
 * Computes `||v||_2 = sqrt(sum_k (re_k^2 + im_k^2))` for vectors of complex
 * numbers represented as `{ re, im }` objects, using:
 * 1. Overflow- and underflow-safe scaling (`scale * sqrt(sum((re/scale)^2 + (im/scale)^2))`).
 * 2. A precomputed lookup table for small integer component pairs `(|re|, |im|)` in `[0, 64]`.
 * 3. A bounded LRU `Map` cache for per-element squared norms in the safe scaling range.
 * 4. A bounded LRU `Map` cache for whole-vector results (value-keyed, mutation-safe).
 */

/** Maximum absolute integer component covered by the precomputed norm-squared table. */
const TABLE_LIMIT = 64;

/** Row stride of the flat precomputed norm-squared table. */
const TABLE_STRIDE = TABLE_LIMIT + 1;

/**
 * Precomputed lookup table storing `a^2 + b^2` for integer pairs `0 <= a, b <= TABLE_LIMIT`.
 * @type {Float64Array}
 */
const UNIT_NORM_SQ_TABLE = new Float64Array(TABLE_STRIDE * TABLE_STRIDE);
for (let a = 0; a <= TABLE_LIMIT; a++) {
	const aSq = a * a;
	const rowOffset = a * TABLE_STRIDE;
	for (let b = 0; b <= TABLE_LIMIT; b++) {
		UNIT_NORM_SQ_TABLE[rowOffset + b] = aSq + b * b;
	}
}

/**
 * Maximum vector length for exact unscaled integer-table summation without
 * exceeding `Number.MAX_SAFE_INTEGER`.
 */
const MAX_EXACT_INT_SUM_LEN = Math.floor(
	Number.MAX_SAFE_INTEGER / (2 * TABLE_LIMIT * TABLE_LIMIT),
);

/**
 * Safe scale bounds within which `scale * scale` stays well inside normal
 * IEEE-754 double precision (`~2.2e-308` to `~1.8e308`).
 */
const SAFE_SCALE_MIN = 1e-140;
const SAFE_SCALE_MAX = 1e140;

/** Maximum entries retained in the element norm-squared cache. */
const MAX_ELEMENT_CACHE_SIZE = 2048;

/** Maximum entries retained in the vector magnitude memoization cache. */
const MAX_VECTOR_CACHE_SIZE = 512;

/** Maximum vector length eligible for whole-vector string-key memoization. */
const MAX_MEMO_VECTOR_LEN = 1024;

/**
 * Bounded LRU cache mapping canonical symmetric pairs `"min,max"` to `min^2 + max^2`.
 * @type {Map<string, number>}
 */
const elementNormSqCache = new Map();

/**
 * Bounded LRU cache mapping canonical vector signatures to computed magnitudes.
 * @type {Map<string, number>}
 */
const vectorMemoCache = new Map();

/**
 * Retrieves a value from an LRU Map cache, refreshing its recency on hit.
 *
 * @param {Map<string, number>} cache
 * @param {string} key
 * @returns {number | undefined}
 */
function lruGet(cache, key) {
	if (!cache.has(key)) {
		return undefined;
	}
	const value = cache.get(key);
	cache.delete(key);
	cache.set(key, value);
	return value;
}

/**
 * Inserts a key/value pair into a bounded LRU Map cache, evicting the oldest
 * entry when capacity is reached.
 *
 * @param {Map<string, number>} cache
 * @param {string} key
 * @param {number} value
 * @param {number} maxSize
 * @returns {void}
 */
function lruSet(cache, key, value, maxSize) {
	if (cache.has(key)) {
		cache.delete(key);
	} else if (cache.size >= maxSize) {
		const oldestKey = cache.keys().next().value;
		cache.delete(oldestKey);
	}
	cache.set(key, value);
}

/**
 * Computes or looks up the squared modulus `absRe^2 + absIm^2` for non-negative
 * components guaranteed to lie within `[0, SAFE_SCALE_MAX]`.
 *
 * Uses the precomputed table for small integers and falls back to the bounded
 * element norm-squared LRU cache.
 *
 * @param {number} absRe - Non-negative real magnitude.
 * @param {number} absIm - Non-negative imaginary magnitude.
 * @returns {number} Squared modulus `absRe^2 + absIm^2`.
 */
function getSafeElementNormSq(absRe, absIm) {
	if (
		absRe <= TABLE_LIMIT &&
		absIm <= TABLE_LIMIT &&
		Number.isInteger(absRe) &&
		Number.isInteger(absIm)
	) {
		return UNIT_NORM_SQ_TABLE[absRe * TABLE_STRIDE + absIm];
	}

	const a = absRe <= absIm ? absRe : absIm;
	const b = absRe <= absIm ? absIm : absRe;
	const key = `${a},${b}`;
	const cached = lruGet(elementNormSqCache, key);
	if (cached !== undefined) {
		return cached;
	}

	const normSq = a * a + b * b;
	lruSet(elementNormSqCache, key, normSq, MAX_ELEMENT_CACHE_SIZE);
	return normSq;
}

/**
 * Computes the Euclidean (L2) magnitude of a complex vector `v`:
 * `sqrt(sum_{k=0}^{n-1} (v[k].re^2 + v[k].im^2))`.
 *
 * Uses overflow- and underflow-safe scaling (`scale * sqrt(sum((re/scale)^2 + (im/scale)^2))`),
 * Kahan compensated summation, a precomputed lookup table for small integer components,
 * and bounded LRU `Map` memoization for both elements and vectors.
 *
 * @param {Array<{re: number, im: number}>} v - Array of complex numbers as `{ re, im }`.
 * @returns {number} Non-negative Euclidean norm of `v` (`0` for an empty or zero vector).
 * @throws {TypeError} If `v` is not an Array, any element is not a non-null object,
 *   or any `re`/`im` property is not a `number`.
 * @throws {RangeError} If any `re` or `im` value is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
export function magnitudeComplexMemo(v) {
	if (!Array.isArray(v)) {
		throw new TypeError("Expected an array of complex numbers { re, im }");
	}

	const len = v.length;
	if (len === 0) {
		return 0;
	}

	let scale = 0;
	let allSmallIntegers = true;
	const canMemoVector = len <= MAX_MEMO_VECTOR_LEN;
	const keyParts = canMemoVector ? new Array(len) : null;

	// Pass 1: validate every element, compute scale = max(|re|, |im|), and build canonical key.
	for (let i = 0; i < len; i++) {
		const el = v[i];
		if (el === null || typeof el !== "object") {
			throw new TypeError(`Element at index ${i} must be a non-null object { re, im }`);
		}

		const { re, im } = el;
		if (typeof re !== "number" || typeof im !== "number") {
			throw new TypeError(`Element at index ${i} must have numeric re and im properties`);
		}
		if (!Number.isFinite(re) || !Number.isFinite(im)) {
			throw new RangeError(`Element at index ${i} must have finite re and im values`);
		}

		const absRe = Math.abs(re);
		const absIm = Math.abs(im);

		if (absRe > scale) {
			scale = absRe;
		}
		if (absIm > scale) {
			scale = absIm;
		}

		if (
			allSmallIntegers &&
			(absRe > TABLE_LIMIT ||
				absIm > TABLE_LIMIT ||
				!Number.isInteger(absRe) ||
				!Number.isInteger(absIm))
		) {
			allSmallIntegers = false;
		}

		if (canMemoVector) {
			// Magnitude depends only on (|re|, |im|) and is invariant to sign and -0.
			const lo = absRe <= absIm ? absRe : absIm;
			const hi = absRe <= absIm ? absIm : absRe;
			keyParts[i] = `${lo},${hi}`;
		}
	}

	if (scale === 0) {
		return 0;
	}

	let vectorKey = null;
	if (canMemoVector) {
		vectorKey = keyParts.join(";");
		const cachedMagnitude = lruGet(vectorMemoCache, vectorKey);
		if (cachedMagnitude !== undefined) {
			return cachedMagnitude;
		}
	}

	let result;

	if (allSmallIntegers && len <= MAX_EXACT_INT_SUM_LEN) {
		// Exact table-driven summation for small integer complex vectors.
		let sumSq = 0;
		for (let i = 0; i < len; i++) {
			const absRe = Math.abs(v[i].re);
			const absIm = Math.abs(v[i].im);
			sumSq += UNIT_NORM_SQ_TABLE[absRe * TABLE_STRIDE + absIm];
		}
		result = Math.sqrt(sumSq);
	} else {
		// Overflow- and underflow-safe scaled accumulation with Kahan compensation.
		const useElementNormSqCache = scale >= SAFE_SCALE_MIN && scale <= SAFE_SCALE_MAX;
		const scaleSq = useElementNormSqCache ? scale * scale : 0;

		let sumScaledSq = 0;
		let comp = 0;

		for (let i = 0; i < len; i++) {
			const absRe = Math.abs(v[i].re);
			const absIm = Math.abs(v[i].im);

			let term;
			if (useElementNormSqCache) {
				term = getSafeElementNormSq(absRe, absIm) / scaleSq;
			} else {
				const sr = absRe / scale;
				const si = absIm / scale;
				term = sr * sr + si * si;
			}

			const y = term - comp;
			const t = sumScaledSq + y;
			comp = t - sumScaledSq - y;
			sumScaledSq = t;
		}

		result = scale * Math.sqrt(sumScaledSq);
	}

	if (vectorKey !== null) {
		lruSet(vectorMemoCache, vectorKey, result, MAX_VECTOR_CACHE_SIZE);
	}

	return result;
}
