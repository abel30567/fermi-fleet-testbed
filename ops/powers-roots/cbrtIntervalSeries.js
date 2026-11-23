/**
 * Cube root over interval arithmetic on `[lo, hi]` with outward rounding
 * guaranteeing mathematical enclosure.
 *
 * Uses exact IEEE 754 binary64 exponent/mantissa decomposition
 * (`x = m * 2^(3q + r)`), exact binary anchor selection `s = k / 128`
 * (so `s^3` is exact in IEEE 754 binary64 and `|t| = |(y - s^3) / s^3| < 0.012`),
 * the binomial Taylor series `(1 + t)^(1/3) = sum_{n=0}^{12} C(1/3, n) t^n`,
 * and exact `BigInt` certification with IEEE 754 `nextDown`/`nextUp` outward
 * rounding to guarantee `outLo^3 <= lo` and `hi <= outHi^3` with optimal
 * 0-to-1 ULP tightness.
 *
 * @module ops/powers-roots/cbrtIntervalSeries
 */

const F64_VIEW = new Float64Array(1);
const U64_VIEW = new BigUint64Array(F64_VIEW.buffer);

const SIGN_MASK = 0x8000000000000000n;
const EXP_MASK = 0x7ffn;
const FRAC_MASK = (1n << 52n) - 1n;
const IMPLICIT_BIT = 1n << 52n;
const EXP_BIAS = 1023;
const SUBNORMAL_SCALE = 2 ** 54; // 2^54 normalizes every positive subnormal

const ANCHOR_SCALE = 128; // s = k / 128, k in [128, 256]; s^3 has <= 24 bits (exact in f64)
const ANCHOR_SCALE_CUBED = ANCHOR_SCALE ** 3; // 2^21 = 2097152

const SERIES_DEGREE = 12;
const SERIES_COEFFS = new Float64Array(SERIES_DEGREE + 1);
SERIES_COEFFS[0] = 1;
for (let n = 1; n <= SERIES_DEGREE; n++) {
	SERIES_COEFFS[n] = (SERIES_COEFFS[n - 1] * (4 - 3 * n)) / (3 * n);
}

/**
 * Return the smallest IEEE 754 binary64 value strictly greater than `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function nextUp(x) {
	if (Number.isNaN(x) || x === Infinity) return x;
	if (x === 0) return Number.MIN_VALUE;
	F64_VIEW[0] = x;
	if (x > 0) {
		U64_VIEW[0] += 1n;
	} else {
		U64_VIEW[0] -= 1n;
	}
	const res = F64_VIEW[0];
	return res === 0 ? 0 : res;
}

/**
 * Return the largest IEEE 754 binary64 value strictly less than `x`.
 *
 * @param {number} x
 * @returns {number}
 */
function nextDown(x) {
	if (Number.isNaN(x) || x === -Infinity) return x;
	if (x === 0) return -Number.MIN_VALUE;
	F64_VIEW[0] = x;
	if (x > 0) {
		U64_VIEW[0] -= 1n;
	} else {
		U64_VIEW[0] += 1n;
	}
	const res = F64_VIEW[0];
	return res === 0 ? 0 : res;
}

/**
 * Construct exact `2^exp` as an IEEE 754 binary64 normal number (`exp` in [-1022, 1023]).
 *
 * @param {number} exp
 * @returns {number}
 */
function exactPow2(exp) {
	U64_VIEW[0] = BigInt(exp + EXP_BIAS) << 52n;
	return F64_VIEW[0];
}

/**
 * Decode a finite positive binary64 `x` into exact `(mantissa, exponent)` such that
 * `x === Number(mantissa) * 2^exponent` mathematically with zero rounding error.
 *
 * @param {number} x - Finite positive number.
 * @returns {{ m: bigint, e: number }}
 */
function decodePositiveExact(x) {
	F64_VIEW[0] = x;
	const bits = U64_VIEW[0] & ~SIGN_MASK;
	const expField = Number((bits >> 52n) & EXP_MASK);
	const frac = bits & FRAC_MASK;
	if (expField === 0) {
		// Subnormal: value = frac * 2^(-1074)
		return { m: frac, e: -1074 };
	}
	// Normal: value = (2^52 + frac) * 2^(expField - 1023 - 52)
	return { m: IMPLICIT_BIT | frac, e: expField - 1075 };
}

/**
 * Exact sign comparison of `r^3` against `x` for finite positive binary64 numbers `r` and `x`.
 * Returns `-1` if `r^3 < x`, `0` if `r^3 === x`, and `1` if `r^3 > x`.
 *
 * @param {number} r - Candidate positive root.
 * @param {number} x - Positive target value.
 * @returns {-1 | 0 | 1}
 */
function compareCubeExact(r, x) {
	const dr = decodePositiveExact(r);
	const dx = decodePositiveExact(x);
	const lhsCube = dr.m * dr.m * dr.m;
	const shift = 3 * dr.e - dx.e;

	let lhs;
	let rhs;
	if (shift >= 0) {
		lhs = lhsCube << BigInt(shift);
		rhs = dx.m;
	} else {
		lhs = lhsCube;
		rhs = dx.m << BigInt(-shift);
	}

	if (lhs < rhs) return -1;
	if (lhs > rhs) return 1;
	return 0;
}

/**
 * Approximate `cbrt(x)` for a finite positive `x` using exact exponent/mantissa
 * reduction and the binomial Taylor series around an exact binary anchor `s = k / 128`.
 *
 * @param {number} x - Finite positive number.
 * @returns {number} Approximation within ~1-2 ULP of the true cube root.
 */
function approxCbrtPositiveSeries(x) {
	// Normalize subnormals cleanly before extracting exponent and mantissa m in [1, 2).
	F64_VIEW[0] = x;
	let bits = U64_VIEW[0];
	let expField = Number((bits >> 52n) & EXP_MASK);
	let expAdjust = 0;

	if (expField === 0) {
		F64_VIEW[0] = x * SUBNORMAL_SCALE;
		bits = U64_VIEW[0];
		expField = Number((bits >> 52n) & EXP_MASK);
		expAdjust = -54;
	}

	const e = expField - EXP_BIAS + expAdjust;
	// Reconstruct exact mantissa m in [1, 2) by setting biased exponent to 1023.
	U64_VIEW[0] = (BigInt(EXP_BIAS) << 52n) | (bits & FRAC_MASK);
	const m = F64_VIEW[0];

	// Exact Euclidean division e = 3q + r with r in {0, 1, 2}.
	const q = Math.floor(e / 3);
	const r = e - 3 * q;

	// y = m * 2^r is exact (r in {0, 1, 2}) and lies in [1, 8).
	const y = m * (1 << r);

	// Binary search integer k in [128, 256] such that k^3 <= y * 128^3 < (k + 1)^3.
	const scaledY = y * ANCHOR_SCALE_CUBED;
	let loK = ANCHOR_SCALE;
	let hiK = ANCHOR_SCALE * 2;
	while (loK + 1 < hiK) {
		const mid = (loK + hiK) >> 1;
		if (mid * mid * mid <= scaledY) {
			loK = mid;
		} else {
			hiK = mid;
		}
	}

	// Pick closer of loK and loK + 1 so |t| = |(y - s^3) / s^3| < 0.012.
	const loCube = loK * loK * loK;
	const hiKPlus = loK + 1;
	const hiCube = hiKPlus * hiKPlus * hiKPlus;
	const k = scaledY - loCube <= hiCube - scaledY ? loK : hiKPlus;

	const s = k / ANCHOR_SCALE;
	const sCubed = (k * k * k) / ANCHOR_SCALE_CUBED; // exact in binary64

	// By Sterbenz's Lemma, y - sCubed is exact; |t| < 0.012.
	const t = (y - sCubed) / sCubed;

	// Evaluate binomial series sum_{n=0}^{12} C(1/3, n) * t^n via Horner's method.
	let poly = SERIES_COEFFS[SERIES_DEGREE];
	for (let i = SERIES_DEGREE - 1; i >= 0; i--) {
		poly = poly * t + SERIES_COEFFS[i];
	}

	return s * poly * exactPow2(q);
}

/**
 * Compute exact outward-rounded cube root enclosure `[lo, hi]` for a finite positive `x`.
 * Guarantees `lo^3 <= x <= hi^3` mathematically, with `lo === hi` when `x` is an exact
 * binary64 cube and `hi === nextUp(lo)` otherwise.
 *
 * @param {number} x - Finite positive number.
 * @returns {[number, number]}
 */
function cbrtPositiveBounds(x) {
	let lo = approxCbrtPositiveSeries(x);
	let cmp = compareCubeExact(lo, x);

	if (cmp > 0) {
		do {
			lo = nextDown(lo);
			cmp = compareCubeExact(lo, x);
		} while (cmp > 0);
	} else if (cmp < 0) {
		let candidate = nextUp(lo);
		while (compareCubeExact(candidate, x) <= 0) {
			lo = candidate;
			candidate = nextUp(lo);
		}
		cmp = compareCubeExact(lo, x);
	}

	const hi = cmp === 0 ? lo : nextUp(lo);
	return [lo, hi];
}

/**
 * Compute the cube root of a closed finite real interval `[lo, hi]` with outward
 * rounding guaranteeing mathematical enclosure.
 *
 * Because `cbrt(x)` is strictly increasing and odd on `(-Infinity, Infinity)`,
 * the exact image of `[lo, hi]` is `[cbrt(lo), cbrt(hi)]`. Outward rounding
 * ensures that the returned interval `[outLo, outHi]` satisfies:
 * `outLo <= cbrt(x) <= outHi` for every real number `x` in `[lo, hi]`.
 *
 * @param {[number, number]} interval - Closed finite interval `[lo, hi]` with `lo <= hi`.
 * @returns {[number, number]} Outward-rounded enclosure `[outLo, outHi]` of `cbrt([lo, hi])`.
 * @throws {TypeError} If `interval` is not a 2-element array of numbers.
 * @throws {RangeError} If either bound is `NaN`, non-finite, or `lo > hi`.
 */
export function cbrtIntervalSeries(interval) {
	if (!Array.isArray(interval) || interval.length !== 2) {
		throw new TypeError('Expected interval to be a 2-element array [lo, hi]');
	}

	const [lo, hi] = interval;

	if (typeof lo !== 'number' || typeof hi !== 'number') {
		throw new TypeError('Interval bounds must be numbers');
	}

	if (Number.isNaN(lo) || Number.isNaN(hi)) {
		throw new RangeError('Interval bounds must not be NaN');
	}

	if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
		throw new RangeError('Interval bounds must be finite numbers');
	}

	if (lo > hi) {
		throw new RangeError(`Invalid interval: lo (${lo}) must be <= hi (${hi})`);
	}

	if (lo === hi) {
		if (lo === 0) return [0, 0];
		if (lo > 0) return cbrtPositiveBounds(lo);
		const [pLo, pHi] = cbrtPositiveBounds(-lo);
		return [-pHi, -pLo];
	}

	let outLo;
	if (lo === 0) {
		outLo = 0;
	} else if (lo > 0) {
		outLo = cbrtPositiveBounds(lo)[0];
	} else {
		outLo = -cbrtPositiveBounds(-lo)[1];
	}

	let outHi;
	if (hi === 0) {
		outHi = 0;
	} else if (hi > 0) {
		outHi = cbrtPositiveBounds(hi)[1];
	} else {
		outHi = -cbrtPositiveBounds(-hi)[0];
	}

	return [outLo, outHi];
}
