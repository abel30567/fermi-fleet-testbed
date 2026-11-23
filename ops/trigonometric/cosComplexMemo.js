/**
 * @fileoverview Table-driven, memoized complex cosine implementation.
 *
 * Computes `cos(z)` for a complex number `z = a + bi` represented as `{ re, im }`,
 * using the analytical identity:
 *
 *   cos(a + bi) = cos(a) * cosh(b) - i * sin(a) * sinh(b)
 *
 * Real trigonometric terms (`cos(a)`, `sin(a)`) and bounded hyperbolic terms
 * (`cosh(b)`, `sinh(b)`) are evaluated via precomputed lookup tables combined
 * with high-order local Taylor angle/argument addition refinements so full
 * IEEE-754 double precision is preserved. Results are cached in a bounded LRU
 * `Map` that always returns fresh `{ re, im }` objects to preserve immutability.
 */

const TWO_PI = 2 * Math.PI;
// High/low split of 2*pi for accurate Cody-Waite range reduction.
const TWO_PI_HI = 6.2831854820251465; // Math.fround(2 * Math.PI)
const TWO_PI_MID = -1.7484556002460506e-7; // 2 * Math.PI - TWO_PI_HI
const TWO_PI_LO = 2.4492935982947064e-16; // exact 2*pi - Number(2*pi)

/** Number of precomputed grid points across [0, 2*pi). Must be a power of 2. */
const TRIG_TABLE_SIZE = 1024;
const TRIG_TABLE_MASK = TRIG_TABLE_SIZE - 1;
const TRIG_STEP = TWO_PI / TRIG_TABLE_SIZE;
const TRIG_INV_STEP = TRIG_TABLE_SIZE / TWO_PI;

/** Precomputed cosine lookup table over [0, 2*pi). */
const COS_TABLE = new Float64Array(TRIG_TABLE_SIZE);
/** Precomputed sine lookup table over [0, 2*pi). */
const SIN_TABLE = new Float64Array(TRIG_TABLE_SIZE);

for (let k = 0; k < TRIG_TABLE_SIZE; k++) {
	const theta = k * TRIG_STEP;
	COS_TABLE[k] = Math.cos(theta);
	SIN_TABLE[k] = Math.sin(theta);
}
// Pin exact cardinal values at 0, pi/2, pi, 3*pi/2.
COS_TABLE[0] = 1;
SIN_TABLE[0] = 0;
COS_TABLE[TRIG_TABLE_SIZE >> 2] = 0;
SIN_TABLE[TRIG_TABLE_SIZE >> 2] = 1;
COS_TABLE[TRIG_TABLE_SIZE >> 1] = -1;
SIN_TABLE[TRIG_TABLE_SIZE >> 1] = 0;
COS_TABLE[(TRIG_TABLE_SIZE * 3) >> 2] = 0;
SIN_TABLE[(TRIG_TABLE_SIZE * 3) >> 2] = -1;

/** Precomputed hyperbolic lookup table over [0, HYP_TABLE_MAX] with step 1/64. */
const HYP_TABLE_MAX = 8;
const HYP_STEPS_PER_UNIT = 64;
const HYP_STEP = 1 / HYP_STEPS_PER_UNIT;
const HYP_TABLE_SIZE = HYP_TABLE_MAX * HYP_STEPS_PER_UNIT + 1;

const COSH_TABLE = new Float64Array(HYP_TABLE_SIZE);
const SINH_TABLE = new Float64Array(HYP_TABLE_SIZE);

for (let k = 0; k < HYP_TABLE_SIZE; k++) {
	const x = k * HYP_STEP;
	COSH_TABLE[k] = Math.cosh(x);
	SINH_TABLE[k] = Math.sinh(x);
}
COSH_TABLE[0] = 1;
SINH_TABLE[0] = 0;

/** Maximum number of entries retained in the memoization cache. */
const MAX_CACHE_SIZE = 1024;

/** @type {Map<string, { re: number, im: number }>} */
const memoCache = new Map();

/**
 * Normalizes `-0` to `+0` for consistent numeric output and cache keys.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Evaluates `[cos(a), sin(a)]` using the precomputed trig table and a 4-term
 * Taylor expansion around the nearest table grid point.
 *
 * @param {number} a - Finite real angle in radians.
 * @returns {[number, number]} Tuple `[cos(a), sin(a)]`.
 */
function trigTableLookup(a) {
	if (a === 0) {
		return [1, 0];
	}
	// For very large magnitudes where Cody-Waite split loses precision, fall back
	// to platform Payne-Hanek reduction via Math.cos / Math.sin.
	if (Math.abs(a) > 1e6) {
		return [Math.cos(a), Math.sin(a)];
	}

	const q = Math.round(a / TWO_PI);
	let r = (a - q * TWO_PI_HI) - q * TWO_PI_MID - q * TWO_PI_LO;
	if (r < 0) {
		r += TWO_PI;
	} else if (r >= TWO_PI) {
		r -= TWO_PI;
	}

	const idxRaw = Math.round(r * TRIG_INV_STEP);
	const idx = idxRaw & TRIG_TABLE_MASK;
	const d = r - idxRaw * TRIG_STEP;
	const d2 = d * d;

	// |d| <= pi / 1024 ≈ 0.00307, so truncation error is < 1e-31 (well below 1 ULP).
	const cosD = 1 + d2 * (-0.5 + d2 * (1 / 24 + d2 * (-1 / 720 + d2 / 40320)));
	const sinD = d * (1 + d2 * (-1 / 6 + d2 * (1 / 120 + d2 * (-1 / 5040 + d2 / 362880))));

	const c0 = COS_TABLE[idx];
	const s0 = SIN_TABLE[idx];

	return [c0 * cosD - s0 * sinD, s0 * cosD + c0 * sinD];
}

/**
 * Evaluates `[cosh(b), sinh(b)]` using the precomputed hyperbolic table on
 * `|b| <= 8` with Taylor addition refinement, and `Math.cosh`/`Math.sinh` beyond.
 *
 * @param {number} b - Finite real number.
 * @returns {[number, number]} Tuple `[cosh(b), sinh(b)]`.
 */
function hypTableLookup(b) {
	if (b === 0) {
		return [1, 0];
	}

	const absB = Math.abs(b);
	if (absB > HYP_TABLE_MAX) {
		return [Math.cosh(b), Math.sinh(b)];
	}

	const idx = Math.round(absB * HYP_STEPS_PER_UNIT);
	const d = absB - idx * HYP_STEP;
	const d2 = d * d;

	// |d| <= 1/128 ≈ 0.0078125, so truncation error is < 1e-28 (well below 1 ULP).
	const coshD = 1 + d2 * (0.5 + d2 * (1 / 24 + d2 * (1 / 720 + d2 / 40320)));
	const sinhD = d * (1 + d2 * (1 / 6 + d2 * (1 / 120 + d2 * (1 / 5040 + d2 / 362880))));

	const ch0 = COSH_TABLE[idx];
	const sh0 = SINH_TABLE[idx];

	const coshVal = ch0 * coshD + sh0 * sinhD;
	const sinhAbs = sh0 * coshD + ch0 * sinhD;

	return [coshVal, b < 0 ? -sinhAbs : sinhAbs];
}

/**
 * Validates that `z` is a complex number object `{ re, im }` with finite numeric
 * components.
 *
 * @param {unknown} z
 * @returns {{ re: number, im: number }}
 */
function validateComplex(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('cosComplexMemo expects a complex number object { re, im }');
	}
	const { re, im } = /** @type {{ re?: unknown, im?: unknown }} */ (z);
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError('cosComplexMemo requires numeric re and im properties');
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('cosComplexMemo requires finite re and im values');
	}
	return { re: normalizeZero(re), im: normalizeZero(im) };
}

/**
 * Computes the complex cosine `cos(z)` for `z = a + bi` using precomputed
 * trigonometric/hyperbolic lookup tables and bounded LRU memoization.
 *
 * Formula:
 *   cos(a + bi) = cos(a) * cosh(b) - i * sin(a) * sinh(b)
 *
 * @param {{ re: number, im: number }} z - Complex input `{ re, im }` with finite numbers.
 * @returns {{ re: number, im: number }} Fresh `{ re, im }` object representing `cos(z)`.
 * @throws {TypeError} If `z` is not an object or `z.re`/`z.im` are not numbers.
 * @throws {RangeError} If `z.re` or `z.im` is `NaN`, `Infinity`, or `-Infinity`.
 */
export function cosComplexMemo(z) {
	const { re: a, im: b } = validateComplex(z);
	const key = `${a},${b}`;

	const cached = memoCache.get(key);
	if (cached !== undefined) {
		// Refresh recency for LRU eviction.
		memoCache.delete(key);
		memoCache.set(key, cached);
		return { re: cached.re, im: cached.im };
	}

	const [cosA, sinA] = trigTableLookup(a);
	const [coshB, sinhB] = hypTableLookup(b);

	// Avoid 0 * Infinity -> NaN when one factor is exact zero and the other overflows.
	const realPart = cosA === 0 ? 0 : cosA * coshB;
	const imagPart = sinA === 0 || sinhB === 0 ? 0 : -sinA * sinhB;

	const entry = {
		re: normalizeZero(realPart),
		im: normalizeZero(imagPart),
	};

	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value;
		if (oldestKey !== undefined) {
			memoCache.delete(oldestKey);
		}
	}
	memoCache.set(key, entry);

	return { re: entry.re, im: entry.im };
}
