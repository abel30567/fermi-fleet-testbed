/**
 * Computes the principal base-10 complex logarithm log10(z) over { re, im }
 * using series and algebraic identities without calling Math.log, Math.log10,
 * Math.atan, Math.atan2, or Math.sqrt.
 *
 * Mathematical identities used:
 * - Change of base (principal branch, Arg(z) in (-pi, pi]):
 *     log10(z) = ln(z) / ln(10) = (ln|z| + i * Arg(z)) / ln(10)
 * - Overflow/underflow-safe log-modulus with m = max(|re|, |im|), s = min(|re|, |im|):
 *     ln|z| = ln(m) + 0.5 * ln(1 + (s / m)^2)
 * - Binary range reduction x = u * 2^k with u in [1/sqrt(2), sqrt(2)] and atanh series:
 *     ln(u) = 2 * sum_{n=0}^{inf} ((u - 1) / (u + 1))^(2n + 1) / (2n + 1)
 *     ln(1 + w) = 2 * sum_{n=0}^{inf} (w / (2 + w))^(2n + 1) / (2n + 1)
 * - Principal argument via octant reduction, half-angle identity
 *     atan(t) = 2 * atan(t / (1 + sqrt(1 + t^2))),
 *   and alternating Maclaurin series:
 *     atan(u) = sum_{n=0}^{inf} (-1)^n * u^(2n + 1) / (2n + 1)
 * - Fundamental constants derived from the same series:
 *     pi = 16 * atan(1/5) - 4 * atan(1/239)   (Machin's formula)
 *     ln(2) = 2 * atanh(1/3)
 *     ln(10) = 3 * ln(2) + 2 * atanh(1/9)
 *
 * @param {{ re: number, im: number }} z - Non-zero complex number with finite components.
 * @returns {{ re: number, im: number }} Principal value of log10(z).
 * @throws {TypeError} If z is not an object with numeric re and im properties.
 * @throws {RangeError} If re or im is not finite, or if z is 0 + 0i.
 */

const TWO_POW_54 = 18014398509481984; // 2^54 for subnormal scaling
const MIN_NORMAL = 2 ** -1022;

const POW2_TABLE = [512, 256, 128, 64, 32, 16, 8, 4, 2, 1].map((exp) => ({
	exp,
	pos: 2 ** exp,
	neg: 2 ** -exp,
}));

/**
 * Computes sqrt(x) for x in [1, 2] using Newton's method.
 *
 * @param {number} x
 * @returns {number}
 */
function sqrtUnitInterval(x) {
	let r = 0.5 * (1 + x);
	for (let i = 0; i < 6; i++) {
		r = 0.5 * (r + x / r);
	}
	return r;
}

/**
 * Evaluates atanh(y) = sum_{n=0}^{inf} y^(2n+1) / (2n+1) for |y| <= 1/3.
 *
 * @param {number} y
 * @returns {number}
 */
function atanhSeries(y) {
	const y2 = y * y;
	let power = y;
	let sum = y;
	for (let n = 1; n < 100; n++) {
		power *= y2;
		const delta = power / (2 * n + 1);
		const next = sum + delta;
		if (next === sum) {
			break;
		}
		sum = next;
	}
	return sum;
}

/**
 * Evaluates atan(u) = sum_{n=0}^{inf} (-1)^n * u^(2n+1) / (2n+1) for |u| <= 0.22.
 *
 * @param {number} u
 * @returns {number}
 */
function atanMaclaurin(u) {
	const u2 = u * u;
	let term = u;
	let sum = u;
	for (let n = 1; n < 100; n++) {
		term *= -u2;
		const delta = term / (2 * n + 1);
		const next = sum + delta;
		if (next === sum) {
			break;
		}
		sum = next;
	}
	return sum;
}

const SQRT2 = sqrtUnitInterval(2);
const SQRT1_2 = 0.5 * SQRT2;
const PI = 16 * atanMaclaurin(1 / 5) - 4 * atanMaclaurin(1 / 239);
const HALF_PI = 0.5 * PI;
const LN2 = 2 * atanhSeries(1 / 3);
const LN10 = 3 * LN2 + 2 * atanhSeries(1 / 9);

/**
 * Computes ln(x) for any finite x > 0 via binary range reduction into
 * [1/sqrt(2), sqrt(2)] followed by the atanh series.
 *
 * @param {number} x
 * @returns {number}
 */
function lnPositive(x) {
	let u = x;
	let k = 0;

	if (u < MIN_NORMAL) {
		u *= TWO_POW_54;
		k -= 54;
	}

	for (let i = 0; i < POW2_TABLE.length; i++) {
		const { exp, pos, neg } = POW2_TABLE[i];
		if (u >= pos) {
			u *= neg;
			k += exp;
		} else if (u < neg) {
			u *= pos;
			k -= exp;
		}
	}

	if (u >= SQRT2) {
		u *= 0.5;
		k += 1;
	} else if (u < SQRT1_2) {
		u *= 2;
		k -= 1;
	}

	const y = (u - 1) / (u + 1);
	return 2 * atanhSeries(y) + k * LN2;
}

/**
 * Computes ln(1 + w) for w in [0, 1] without cancellation via
 * ln(1 + w) = 2 * atanh(w / (2 + w)).
 *
 * @param {number} w
 * @returns {number}
 */
function ln1pUnit(w) {
	if (w === 0) {
		return 0;
	}
	return 2 * atanhSeries(w / (2 + w));
}

/**
 * Computes atan(t) for t in [0, 1] using half-angle reduction and the
 * Maclaurin series.
 *
 * @param {number} t
 * @returns {number}
 */
function atanUnit(t) {
	if (t <= 0.2) {
		return atanMaclaurin(t);
	}
	let u = t / (1 + sqrtUnitInterval(1 + t * t));
	if (t <= 0.45) {
		return 2 * atanMaclaurin(u);
	}
	u = u / (1 + sqrtUnitInterval(1 + u * u));
	return 4 * atanMaclaurin(u);
}

/**
 * Computes the principal argument Arg(x + i*y) in (-pi, pi] for (x, y) != (0, 0).
 *
 * @param {number} y
 * @param {number} x
 * @returns {number}
 */
function atan2Principal(y, x) {
	if (y === 0) {
		return x > 0 ? 0 : PI;
	}
	if (x === 0) {
		return y > 0 ? HALF_PI : -HALF_PI;
	}

	const ax = x < 0 ? -x : x;
	const ay = y < 0 ? -y : y;

	if (ay <= ax) {
		const base = atanUnit(ay / ax);
		if (x > 0) {
			return y > 0 ? base : -base;
		}
		return y > 0 ? PI - base : -(PI - base);
	}

	const base = atanUnit(ax / ay);
	if (x > 0) {
		return y > 0 ? HALF_PI - base : -(HALF_PI - base);
	}
	return y > 0 ? HALF_PI + base : -(HALF_PI + base);
}

/**
 * Validates that z is a complex number { re, im } with finite components.
 *
 * @param {unknown} z
 * @returns {{ re: number, im: number }}
 */
function validateComplex(z) {
	if (z === null || typeof z !== 'object') {
		throw new TypeError('Expected complex number object { re, im }');
	}
	const { re, im } = z;
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError('Complex components re and im must be numbers');
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex components re and im must be finite numbers');
	}
	return { re, im };
}

export function log10ComplexSeries(z) {
	const { re, im } = validateComplex(z);

	if (re === 0 && im === 0) {
		throw new RangeError('log10ComplexSeries is undefined at z = 0 + 0i');
	}

	const ax = re < 0 ? -re : re;
	const ay = im < 0 ? -im : im;
	const maxComp = ax >= ay ? ax : ay;
	const minComp = ax >= ay ? ay : ax;
	const ratio = minComp / maxComp;

	const lnModulus = lnPositive(maxComp) + 0.5 * ln1pUnit(ratio * ratio);
	const arg = atan2Principal(im, re);

	const outRe = lnModulus / LN10;
	const outIm = arg / LN10;

	return {
		re: outRe === 0 ? 0 : outRe,
		im: outIm === 0 ? 0 : outIm,
	};
}
