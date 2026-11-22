/**
 * Principal complex n-th root using the De Moivre / exponential-logarithm identity
 * with series-based elementary functions.
 *
 * Mathematical definition:
 * For a complex number z = x + i*y != 0 in polar form z = r * exp(i * theta),
 * where r = |z| = sqrt(x^2 + y^2) > 0 and theta = Arg(z) in (-pi, pi],
 * the principal n-th root for integer n >= 1 is:
 *
 *   z^(1/n) = exp(Log(z) / n)
 *           = exp((ln(r) + i * theta) / n)
 *           = r^(1/n) * (cos(theta / n) + i * sin(theta / n))
 *
 * Series methods used (all full double precision with range reduction):
 * - ln(m) for m in [1/sqrt(2), sqrt(2)]: hyperbolic arctangent series
 *     ln(m) = 2 * sum_{k=0}^inf t^(2k+1) / (2k + 1),  t = (m - 1) / (m + 1)
 * - exp(u) for |u| <= ln(2)/2: Maclaurin series
 *     exp(u) = sum_{k=0}^inf u^k / k!
 * - atan(t) for t in [0, 1]: pi/6 shift reduction to |u| <= 2 - sqrt(3), then
 *     atan(u) = sum_{k=0}^inf (-1)^k * u^(2k+1) / (2k + 1)
 * - cos(a), sin(a) for |a| <= pi/4 (via quadrant reduction): Taylor series
 *     cos(a) = sum_{k=0}^inf (-1)^k * a^(2k) / (2k)!
 *     sin(a) = sum_{k=0}^inf (-1)^k * a^(2k+1) / (2k + 1)!
 *
 * Overflow/underflow safety:
 * Scales by m = max(|x|, |y|) and extracts the binary exponent of m so that
 * r^(1/n) = 2^q * exp(w) never overflows or underflows across the full IEEE-754
 * finite range (including subnormals and values near Number.MAX_VALUE).
 */

const PI = Math.PI;
const HALF_PI = PI / 2;
const SIXTH_PI = PI / 6;
const SQRT2 = Math.SQRT2;
const SQRT3 = 1.7320508075688772; // Math.sqrt(3)
const TAN_PI_12 = 0.2679491924311227; // 2 - sqrt(3)
const LN2 = 0.6931471805599453; // Math.LN2
const LN2_HI = 0.6931471803691238; // Upper bits of ln(2) (fdlibm)
const LN2_LO = 1.9082149292705877e-10; // Lower bits of ln(2) (fdlibm)

const _buf = new ArrayBuffer(8);
const _dv = new DataView(_buf);

/**
 * Decomposes a positive finite float x into x = m * 2^k with m in [1/sqrt(2), sqrt(2)).
 * Handles subnormals cleanly without overflow or underflow.
 *
 * @param {number} x - Positive finite number.
 * @returns {{ m: number, k: number }}
 */
function frexpCentered(x) {
	let expAdjust = 0;
	if (x < 2.2250738585072014e-308) {
		// Subnormal: normalize by multiplying by 2^54.
		x *= 18014398509481984;
		expAdjust = -54;
	}
	_dv.setFloat64(0, x, false);
	const hi = _dv.getUint32(0, false);
	const exp = ((hi >>> 20) & 0x7ff) - 1023;
	_dv.setUint32(0, (hi & 0x800fffff) | 0x3ff00000, false);
	let m = _dv.getFloat64(0, false);
	let k = exp + expAdjust;
	if (m >= SQRT2) {
		m *= 0.5;
		k += 1;
	}
	return { m, k };
}

/**
 * Computes ln(m) for m in [1/sqrt(2), sqrt(2)] using the atanh series:
 *   ln(m) = 2 * sum_{j=0}^inf t^(2j+1) / (2j+1), where t = (m - 1) / (m + 1).
 *
 * @param {number} m
 * @returns {number}
 */
function lnReducedSeries(m) {
	const t = (m - 1) / (m + 1);
	const t2 = t * t;
	let term = t;
	let sum = t;
	for (let j = 1; j <= 20; j++) {
		term *= t2;
		const next = sum + term / (2 * j + 1);
		if (next === sum) break;
		sum = next;
	}
	return 2 * sum;
}

/**
 * Computes exp(w) as { value, shift } where exp(w) = value * 2^shift,
 * using range reduction w = shift * ln(2) + u with |u| <= ln(2)/2
 * and the Maclaurin series sum_{k=0}^inf u^k / k!.
 *
 * @param {number} w
 * @returns {{ value: number, shift: number }}
 */
function expSeriesSplit(w) {
	const shift = Math.round(w / LN2);
	const u = (w - shift * LN2_HI) - shift * LN2_LO;
	let term = 1;
	let sum = 1;
	for (let k = 1; k <= 25; k++) {
		term = (term * u) / k;
		const next = sum + term;
		if (next === sum) break;
		sum = next;
	}
	return { value: sum, shift };
}

/**
 * Computes atan(t) for t in [0, 1] using pi/6 shift reduction to |u| <= 2 - sqrt(3)
 * and the alternating Maclaurin series sum_{k=0}^inf (-1)^k * u^(2k+1) / (2k+1).
 *
 * @param {number} t
 * @returns {number}
 */
function atanUnitSeries(t) {
	let base = 0;
	let u = t;
	if (t > TAN_PI_12) {
		base = SIXTH_PI;
		u = (t * SQRT3 - 1) / (SQRT3 + t);
	}
	const u2 = u * u;
	let term = u;
	let sum = u;
	for (let k = 1; k <= 25; k++) {
		term = -term * u2;
		const next = sum + term / (2 * k + 1);
		if (next === sum) break;
		sum = next;
	}
	return base + sum;
}

/**
 * Computes the principal argument Arg(x + i*y) in (-pi, pi] using atanUnitSeries.
 * Assumes (x, y) != (0, 0).
 *
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function argPrincipalSeries(x, y) {
	if (y === 0) {
		return x > 0 ? 0 : PI;
	}
	if (x === 0) {
		return y > 0 ? HALF_PI : -HALF_PI;
	}
	const ax = x < 0 ? -x : x;
	const ay = y < 0 ? -y : y;
	let theta;
	if (ay <= ax) {
		const a = atanUnitSeries(ay / ax);
		theta = x > 0 ? a : PI - a;
	} else {
		const a = atanUnitSeries(ax / ay);
		theta = x > 0 ? HALF_PI - a : HALF_PI + a;
	}
	return y < 0 ? -theta : theta;
}

/**
 * Computes cos(a) for |a| <= pi/4 via Taylor series.
 *
 * @param {number} a
 * @returns {number}
 */
function cosTaylor(a) {
	const a2 = a * a;
	let term = 1;
	let sum = 1;
	for (let k = 1; k <= 16; k++) {
		term = (-term * a2) / ((2 * k - 1) * (2 * k));
		const next = sum + term;
		if (next === sum) break;
		sum = next;
	}
	return sum;
}

/**
 * Computes sin(a) for |a| <= pi/4 via Taylor series.
 *
 * @param {number} a
 * @returns {number}
 */
function sinTaylor(a) {
	const a2 = a * a;
	let term = a;
	let sum = a;
	for (let k = 1; k <= 16; k++) {
		term = (-term * a2) / ((2 * k) * (2 * k + 1));
		const next = sum + term;
		if (next === sum) break;
		sum = next;
	}
	return sum;
}

/**
 * Computes { cos, sin } for phi in (-pi, pi] via quadrant reduction to [-pi/4, pi/4]
 * followed by Taylor series evaluation.
 *
 * @param {number} phi
 * @returns {{ cos: number, sin: number }}
 */
function cosSinSeries(phi) {
	const q = Math.round(phi / HALF_PI);
	const a = phi - q * HALF_PI;
	const c = cosTaylor(a);
	const s = sinTaylor(a);
	const quad = ((q % 4) + 4) % 4;
	if (quad === 0) return { cos: c, sin: s };
	if (quad === 1) return { cos: -s, sin: c };
	if (quad === 2) return { cos: -c, sin: -s };
	return { cos: s, sin: -c };
}

/**
 * Computes the principal n-th root of a complex number z = { re, im } for
 * positive integer n >= 1 using the De Moivre / exponential-logarithm identity:
 *
 *   z^(1/n) = exp(Log(z) / n) = r^(1/n) * (cos(theta / n) + i * sin(theta / n))
 *
 * where r = |z| and theta = Arg(z) in (-pi, pi], evaluated with series-based
 * logarithm, exponential, arctangent, cosine, and sine functions.
 *
 * @param {{ re: number, im: number }} z - Complex number with finite real and imaginary parts.
 * @param {number} n - Positive safe integer root degree (n >= 1).
 * @returns {{ re: number, im: number }} The principal n-th root of z.
 * @throws {TypeError} If z is not an object with numeric re/im properties, or if n is not a number.
 * @throws {RangeError} If z.re or z.im is non-finite, or if n is not a safe integer >= 1.
 */
export function nthRootComplexSeries(z, n) {
	if (z === null || typeof z !== 'object') {
		throw new TypeError('z must be a complex number object { re, im }');
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError('z.re and z.im must be numbers');
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError('z.re and z.im must be finite numbers');
	}
	if (typeof n !== 'number') {
		throw new TypeError('n must be a number');
	}
	if (!Number.isSafeInteger(n) || n < 1) {
		throw new RangeError('n must be a positive safe integer >= 1');
	}

	const x = z.re === 0 ? 0 : z.re;
	const y = z.im === 0 ? 0 : z.im;

	if (x === 0 && y === 0) {
		return { re: 0, im: 0 };
	}
	if (n === 1) {
		return { re: x, im: y };
	}

	// Overflow/underflow-safe polar modulus decomposition:
	// r = m * sqrt(u^2 + v^2), with m = max(|x|, |y|) and s = u^2 + v^2 in [1, 2].
	const ax = x < 0 ? -x : x;
	const ay = y < 0 ? -y : y;
	const m = ax >= ay ? ax : ay;
	const u = x / m;
	const v = y / m;
	const s = u * u + v * v;

	const { m: fm, k: km } = frexpCentered(m);
	const lnFm = lnReducedSeries(fm);

	let ks = 0;
	let fs = s;
	if (fs >= SQRT2) {
		fs *= 0.5;
		ks = 1;
	}
	const lnFs = lnReducedSeries(fs);

	// Split binary exponent km = q * n + rm to keep exp argument small and exact.
	const q = Math.round(km / n);
	const rm = km - q * n;
	const remExp = rm + 0.5 * ks;
	const w = (remExp * LN2_HI + (remExp * LN2_LO + lnFm + 0.5 * lnFs)) / n;

	const { value: expVal, shift } = expSeriesSplit(w);
	const rRoot = expVal * (2 ** (q + shift));

	const theta = argPrincipalSeries(x, y);
	const phi = theta / n;
	const { cos, sin } = cosSinSeries(phi);

	const re = rRoot * cos;
	const im = rRoot * sin;

	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	};
}
