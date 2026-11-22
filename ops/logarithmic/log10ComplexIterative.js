/**
 * Compute the square root of a positive finite number using Newton-Raphson iteration.
 *
 * @param {number} value - Positive finite number.
 * @returns {number} Square root of `value`.
 */
function sqrtIterative(value) {
	if (value === 0) {
		return 0;
	}
	let estimate = value >= 1 ? 0.5 * (1 + value) : 1;
	for (let i = 0; i < 64; i++) {
		const next = 0.5 * (estimate + value / estimate);
		if (next === estimate || Math.abs(next - estimate) <= Number.EPSILON * next) {
			return next;
		}
		estimate = next;
	}
	return estimate;
}

/**
 * Compute ln(m) for m near 1 using the iterative artanh series:
 * ln(m) = 2 * sum_{n=0}^{\infty} t^(2n+1) / (2n+1), where t = (m - 1) / (m + 1).
 *
 * @param {number} m - Positive number near 1.
 * @returns {number} Natural logarithm of `m`.
 */
function lnNearOne(m) {
	const t = (m - 1) / (m + 1);
	const t2 = t * t;
	let power = t;
	let sum = t;

	for (let n = 1; n <= 128; n++) {
		power *= t2;
		const term = power / (2 * n + 1);
		const next = sum + term;
		if (next === sum || Math.abs(term) <= Number.EPSILON * Math.abs(next)) {
			sum = next;
			break;
		}
		sum = next;
	}

	return 2 * sum;
}

const SQRT2 = sqrtIterative(2);
const SQRT1_2 = 0.5 * SQRT2;
const LN2 = lnNearOne(2);
const LN10 = 3 * LN2 + lnNearOne(1.25);

const TWO_POW_32 = 4294967296;
const TWO_POW_NEG_32 = 1 / TWO_POW_32;

/**
 * Compute the natural logarithm of a positive finite number iteratively via
 * binary range reduction to [sqrt(1/2), sqrt(2)) and the artanh series.
 *
 * @param {number} x - Positive finite number.
 * @returns {number} Natural logarithm of `x`.
 */
function lnIterative(x) {
	let m = x;
	let k = 0;

	while (m >= TWO_POW_32) {
		m /= TWO_POW_32;
		k += 32;
	}
	while (m < TWO_POW_NEG_32) {
		m *= TWO_POW_32;
		k -= 32;
	}
	while (m >= SQRT2) {
		m *= 0.5;
		k += 1;
	}
	while (m < SQRT1_2) {
		m *= 2;
		k -= 1;
	}

	return k * LN2 + lnNearOne(m);
}

/**
 * Compute arctan(u) for u >= 0 iteratively using repeated half-angle reduction
 * (arctan(u) = 2 * arctan(u / (1 + sqrt(1 + u^2)))) followed by the Taylor series.
 *
 * @param {number} u - Non-negative finite number (typically in [0, 1]).
 * @returns {number} Arctangent of `u` in radians.
 */
function atanNonNegativeIterative(u) {
	if (u === 0) {
		return 0;
	}

	let reduced = u;
	let scale = 1;
	while (reduced > 0.05) {
		reduced = reduced / (1 + sqrtIterative(1 + reduced * reduced));
		scale *= 2;
	}

	const r2 = reduced * reduced;
	let power = reduced;
	let sum = reduced;
	let sign = -1;

	for (let n = 1; n <= 128; n++) {
		power *= r2;
		const term = (sign * power) / (2 * n + 1);
		const next = sum + term;
		if (next === sum || Math.abs(term) <= Number.EPSILON * Math.abs(next)) {
			sum = next;
			break;
		}
		sum = next;
		sign = -sign;
	}

	return scale * sum;
}

const PI = 4 * atanNonNegativeIterative(1);
const HALF_PI = 0.5 * PI;

/**
 * Compute the principal argument arg(x + i*y) in (-pi, pi] iteratively.
 *
 * @param {number} y - Imaginary part.
 * @param {number} x - Real part.
 * @returns {number} Principal argument in radians, in (-pi, pi].
 */
function argIterative(y, x) {
	if (y === 0) {
		return x > 0 ? 0 : PI;
	}
	if (x === 0) {
		return y > 0 ? HALF_PI : -HALF_PI;
	}

	const ax = Math.abs(x);
	const ay = Math.abs(y);
	const alpha =
		ay <= ax
			? atanNonNegativeIterative(ay / ax)
			: HALF_PI - atanNonNegativeIterative(ax / ay);

	if (x > 0) {
		return y > 0 ? alpha : alpha === 0 ? 0 : -alpha;
	}
	return y > 0 ? PI - alpha : alpha - PI;
}

/**
 * Compute the principal base-10 complex logarithm of a complex number `z = { re, im }`
 * using a straightforward iterative implementation.
 *
 * For a non-zero complex number `z = x + i*y`, the principal base-10 logarithm is:
 * `log10(z) = (ln(|z|) + i * arg(z)) / ln(10)`
 * where `arg(z)` lies in `(-pi, pi]` (with the branch cut along the negative real axis,
 * assigning `arg(-r) = +pi` for `r > 0`).
 *
 * Internally, `ln(|z|)` is evaluated via power-of-two range reduction and an iterative
 * artanh series (with magnitude scaling to prevent overflow and underflow), and `arg(z)`
 * is evaluated via iterative half-angle reduction with Newton-Raphson square roots and
 * an iterative arctangent Taylor series.
 *
 * @param {{ re: number, im: number }} z - Non-zero complex number with finite real and imaginary parts.
 * @returns {{ re: number, im: number }} The principal base-10 complex logarithm `{ re, im }`.
 * @throws {TypeError} If `z` is not a non-null plain object or if `z.re` or `z.im` is not a number.
 * @throws {RangeError} If `z.re` or `z.im` is not finite (`NaN`, `±Infinity`), or if `z` is zero (`0 + 0i`).
 */
export function log10ComplexIterative(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('log10ComplexIterative: input must be a complex number object { re, im }');
	}

	const { re, im } = z;
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError('log10ComplexIterative: re and im must be numbers');
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('log10ComplexIterative: re and im must be finite numbers');
	}
	if (re === 0 && im === 0) {
		throw new RangeError('log10ComplexIterative: logarithm of zero is undefined');
	}

	const ax = Math.abs(re);
	const ay = Math.abs(im);
	const maxAbs = ax >= ay ? ax : ay;

	let lnMag;
	if (ax === 0 || ay === 0) {
		lnMag = lnIterative(maxAbs);
	} else if (maxAbs > 1e-150 && maxAbs < 1e150) {
		lnMag = 0.5 * lnIterative(re * re + im * im);
	} else {
		const sx = re / maxAbs;
		const sy = im / maxAbs;
		lnMag = lnIterative(maxAbs) + 0.5 * lnIterative(sx * sx + sy * sy);
	}

	const theta = argIterative(im, re);
	const outRe = lnMag / LN10;
	const outIm = theta / LN10;

	return {
		re: outRe === 0 ? 0 : outRe,
		im: outIm === 0 ? 0 : outIm,
	};
}
