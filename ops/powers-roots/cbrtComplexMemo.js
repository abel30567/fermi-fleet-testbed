/**
 * @fileoverview Principal cube root over complex numbers `{ re, im }` using a
 * table-driven trigonometric lookup, a precomputed exact-root table, and a
 * bounded LRU memoization cache.
 *
 * For a complex number $z = r e^{i\theta}$ with $r = |z| \ge 0$ and
 * $\theta = \operatorname{atan2}(\operatorname{im}, \operatorname{re}) \in (-\pi, \pi]$,
 * the principal cube root is defined as:
 * $$\sqrt[3]{z} = \sqrt[3]{r} \left(\cos\frac{\theta}{3} + i\sin\frac{\theta}{3}\right)$$
 * so that $\arg(\sqrt[3]{z}) \in (-\pi/3, \pi/3]$ and $(\sqrt[3]{z})^3 = z$.
 *
 * Signed zeros (`-0`) in inputs are canonicalized to `+0` so the negative real
 * axis consistently maps to the upper-closed principal branch ($\theta = +\pi$).
 */

const SQRT3_HALF = Math.sqrt(3) / 2;

/** Number of intervals in the precomputed trig lookup table over [-pi/3, pi/3]. */
const TRIG_TABLE_SIZE = 1024;
const PHI_MIN = -Math.PI / 3;
const PHI_SPAN = (2 * Math.PI) / 3;
const PHI_STEP = PHI_SPAN / TRIG_TABLE_SIZE;
const INV_PHI_STEP = TRIG_TABLE_SIZE / PHI_SPAN;

/** Precomputed cos(phi) and sin(phi) tables over [-pi/3, pi/3]. */
const COS_TABLE = new Float64Array(TRIG_TABLE_SIZE + 1);
const SIN_TABLE = new Float64Array(TRIG_TABLE_SIZE + 1);
for (let i = 0; i <= TRIG_TABLE_SIZE; i++) {
	const phi = PHI_MIN + i * PHI_STEP;
	COS_TABLE[i] = Math.cos(phi);
	SIN_TABLE[i] = Math.sin(phi);
}

/** Exact power-of-two scaling constants (2^600 / 2^200) to avoid overflow/underflow. */
const SCALE_DOWN_Z = 2 ** -600;
const SCALE_UP_W = 2 ** 200;
const SCALE_UP_Z = 2 ** 600;
const SCALE_DOWN_W = 2 ** -200;
const HIGH_THRESHOLD = 1e100;
const LOW_THRESHOLD = 1e-100;

/** Maximum number of dynamically memoized entries retained in the LRU cache. */
const MAX_CACHE_SIZE = 1024;

/**
 * Normalize `-0` to `+0`.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x;
}

/**
 * Build canonical cache key for a finite complex number (with `-0` normalized).
 * @param {number} re
 * @param {number} im
 * @returns {string}
 */
function makeKey(re, im) {
	return `${re},${im}`;
}

/**
 * Precomputed lookup table of exact / high-precision principal cube roots:
 * - Origin `0 + 0i`
 * - Small integer perfect cubes along all four axes (`±k^3`, `±k^3 i`)
 * - Principal Gaussian integer cubes `(a + bi)^3` where `a >= 1` and `b^2 < 3*a^2`
 *   (which strictly guarantees `atan2(b, a) in (-pi/3, pi/3)`).
 *
 * @type {ReadonlyMap<string, Readonly<{ re: number, im: number }>>}
 */
const PRECOMPUTED_ROOTS = (() => {
	const table = new Map();

	const addEntry = (zRe, zIm, wRe, wIm) => {
		const key = makeKey(normalizeZero(zRe), normalizeZero(zIm));
		table.set(key, Object.freeze({ re: normalizeZero(wRe), im: normalizeZero(wIm) }));
	};

	// Origin
	addEntry(0, 0, 0, 0);

	// Exact axis roots for small integer magnitudes
	for (const k of [1, 2, 3, 4, 5, 6, 8, 10]) {
		const k3 = k * k * k;
		addEntry(k3, 0, k, 0);
		addEntry(-k3, 0, k * 0.5, k * SQRT3_HALF);
		addEntry(0, k3, k * SQRT3_HALF, k * 0.5);
		addEntry(0, -k3, k * SQRT3_HALF, -k * 0.5);
	}

	// Exact principal Gaussian integer cubes (a + b*i)^3
	for (let a = 1; a <= 5; a++) {
		for (let b = -5; b <= 5; b++) {
			if (b !== 0 && b * b < 3 * a * a) {
				const zRe = a * a * a - 3 * a * b * b;
				const zIm = 3 * a * a * b - b * b * b;
				addEntry(zRe, zIm, a, b);
			}
		}
	}

	return table;
})();

/** @type {Map<string, { re: number, im: number }>} */
const memoCache = new Map();
let cacheHits = 0;
let cacheMisses = 0;

/**
 * Look up `(cos(phi), sin(phi))` for `phi` in `[-pi/3, pi/3]` using linear
 * interpolation over the precomputed trig tables.
 *
 * @param {number} phi - Angle in radians, within `[-Math.PI / 3, Math.PI / 3]`.
 * @returns {{ c: number, s: number }}
 */
function lookupTrig(phi) {
	const scaled = (phi - PHI_MIN) * INV_PHI_STEP;
	if (scaled <= 0) {
		return { c: COS_TABLE[0], s: SIN_TABLE[0] };
	}
	if (scaled >= TRIG_TABLE_SIZE) {
		return { c: COS_TABLE[TRIG_TABLE_SIZE], s: SIN_TABLE[TRIG_TABLE_SIZE] };
	}
	const idx = scaled | 0;
	const frac = scaled - idx;
	return {
		c: COS_TABLE[idx] + frac * (COS_TABLE[idx + 1] - COS_TABLE[idx]),
		s: SIN_TABLE[idx] + frac * (SIN_TABLE[idx + 1] - SIN_TABLE[idx]),
	};
}

/**
 * Compute the principal cube root of a non-zero finite complex number `(re, im)`
 * using precomputed trig table lookup followed by two complex Newton-Raphson
 * refinement steps in scaled coordinates for full IEEE-754 double precision.
 *
 * @param {number} re
 * @param {number} im
 * @returns {{ re: number, im: number }}
 */
function computePrincipalCbrt(re, im) {
	// Fast exact paths along the coordinate axes
	if (im === 0) {
		if (re > 0) {
			return { re: Math.cbrt(re), im: 0 };
		}
		const c = Math.cbrt(-re);
		return { re: c * 0.5, im: c * SQRT3_HALF };
	}
	if (re === 0) {
		if (im > 0) {
			const c = Math.cbrt(im);
			return { re: c * SQRT3_HALF, im: c * 0.5 };
		}
		const c = Math.cbrt(-im);
		return { re: c * SQRT3_HALF, im: -c * 0.5 };
	}

	// Power-of-two scaling to keep intermediates well inside normal double range
	const maxAbs = Math.max(Math.abs(re), Math.abs(im));
	let sRe = re;
	let sIm = im;
	let wScale = 1;
	if (maxAbs > HIGH_THRESHOLD) {
		sRe *= SCALE_DOWN_Z;
		sIm *= SCALE_DOWN_Z;
		wScale = SCALE_UP_W;
	} else if (maxAbs < LOW_THRESHOLD) {
		sRe *= SCALE_UP_Z;
		sIm *= SCALE_UP_Z;
		wScale = SCALE_DOWN_W;
	}

	const r = Math.hypot(sRe, sIm);
	const cbrtR = Math.cbrt(r);
	const phi = Math.atan2(sIm, sRe) / 3;

	// Table-driven initial approximation (relative error < 1e-6)
	const { c, s } = lookupTrig(phi);
	let wRe = cbrtR * c;
	let wIm = cbrtR * s;

	// Two complex Newton iterations: w_{n+1} = (2 * w_n + z / w_n^2) / 3
	// Converges quadratically from ~1e-6 -> ~1e-12 -> full 53-bit precision.
	for (let iter = 0; iter < 2; iter++) {
		const w2Re = wRe * wRe - wIm * wIm;
		const w2Im = 2 * wRe * wIm;
		const denom = w2Re * w2Re + w2Im * w2Im;
		const qRe = (sRe * w2Re + sIm * w2Im) / denom;
		const qIm = (sIm * w2Re - sRe * w2Im) / denom;
		wRe = (2 * wRe + qRe) / 3;
		wIm = (2 * wIm + qIm) / 3;
	}

	return {
		re: normalizeZero(wRe * wScale),
		im: normalizeZero(wIm * wScale),
	};
}

/**
 * Validate input as a finite complex number `{ re, im }`.
 *
 * @param {unknown} z
 * @returns {{ re: number, im: number }}
 * @throws {TypeError} If `z` is not a non-null plain/object with numeric `re` and `im`.
 * @throws {RangeError} If `z.re` or `z.im` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
function validateComplex(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Expected a complex number object { re, im }');
	}
	const { re, im } = /** @type {{ re: unknown, im: unknown }} */ (z);
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError('Complex number properties "re" and "im" must be numbers');
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex number properties "re" and "im" must be finite numbers');
	}
	return { re: normalizeZero(re), im: normalizeZero(im) };
}

/**
 * Compute the principal cube root of a complex number `{ re, im }` using a
 * precomputed exact-root table, a precomputed trig lookup table, and a bounded
 * LRU memoization cache.
 *
 * @param {{ re: number, im: number }} z - Finite complex input `{ re, im }`.
 * @returns {{ re: number, im: number }} A fresh `{ re, im }` object representing the principal cube root.
 * @throws {TypeError} If `z` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `z.re` or `z.im` is `NaN`, `Infinity`, or `-Infinity`.
 */
export function cbrtComplexMemo(z) {
	const { re, im } = validateComplex(z);
	const key = makeKey(re, im);

	const precomputed = PRECOMPUTED_ROOTS.get(key);
	if (precomputed !== undefined) {
		cacheHits++;
		return { re: precomputed.re, im: precomputed.im };
	}

	const cached = memoCache.get(key);
	if (cached !== undefined) {
		cacheHits++;
		// Refresh LRU recency
		memoCache.delete(key);
		memoCache.set(key, cached);
		return { re: cached.re, im: cached.im };
	}

	cacheMisses++;
	const result = computePrincipalCbrt(re, im);

	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		memoCache.delete(oldestKey);
	}
	memoCache.set(key, result);

	return { re: result.re, im: result.im };
}

/**
 * Clear the dynamic LRU memoization cache and reset hit/miss counters.
 * The precomputed exact-root and trig tables remain intact.
 */
export function clearCbrtComplexMemoCache() {
	memoCache.clear();
	cacheHits = 0;
	cacheMisses = 0;
}

/**
 * Return inspection statistics for the precomputed table and memoization cache.
 *
 * @returns {{ precomputedSize: number, cacheSize: number, maxCacheSize: number, hits: number, misses: number }}
 */
export function getCbrtComplexMemoStats() {
	return {
		precomputedSize: PRECOMPUTED_ROOTS.size,
		cacheSize: memoCache.size,
		maxCacheSize: MAX_CACHE_SIZE,
		hits: cacheHits,
		misses: cacheMisses,
	};
}
