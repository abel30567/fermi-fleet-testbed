const LN2_HI = 0.6931471803691238; // 0x1.62e42fee00000p-1 (exact 28-bit significand)
const LN2_LO = 1.9082149292705877e-10; // ln(2) - LN2_HI to >80 bits

const TWO_PI = 2 * Math.PI;
const TWO_PI_HI = 6.283185303211212; // 0x6.487ed5p+0 (exact 27-bit significand)
const TWO_PI_MID = 3.968374295837407e-9; // next 28 bits of 2*pi
const TWO_PI_LO = 2.2884754904439333e-17; // remaining bits of 2*pi

const EXP_RECURSION_THRESHOLD = 0.0625; // 2^-4
const EXP_TAYLOR_ORDER = 14;
const MAX_CODY_WAITE_K = 33554432; // 2^25
const EXP_OVERFLOW_RE = 710;
const EXP_UNDERFLOW_RE = -746;

/**
 * Normalizes negative zero (-0) to positive zero (+0).
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value;
}

/**
 * Validates that an input is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {{ re: number, im: number }}
 * @throws {TypeError} If `value` is not a plain-like object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not finite (NaN, Infinity, -Infinity).
 */
function validateComplex(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object with finite numeric re and im properties`);
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`${name}.re and ${name}.im must be numbers`);
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`${name}.re and ${name}.im must be finite numbers`);
	}
	return {
		re: normalizeZero(value.re),
		im: normalizeZero(value.im),
	};
}

/**
 * Multiplies two complex numbers.
 *
 * @param {{ re: number, im: number }} a
 * @param {{ re: number, im: number }} b
 * @returns {{ re: number, im: number }}
 */
function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

/**
 * Computes the multiplicative inverse `1 / z` using Smith's overflow/underflow-safe formula,
 * with exact binary pre/post scaling for extreme magnitudes.
 *
 * @param {{ re: number, im: number }} z Non-zero finite complex number.
 * @returns {{ re: number, im: number }}
 */
function complexReciprocal(z) {
	let a = z.re;
	let b = z.im;
	const maxAbs = Math.max(Math.abs(a), Math.abs(b));

	let postScale = 1;
	if (maxAbs > 1e300) {
		a *= 0.25;
		b *= 0.25;
		postScale = 0.25;
	} else if (maxAbs < 1e-300) {
		const up = 2 ** 60;
		a *= up;
		b *= up;
		postScale = up;
	}

	let re;
	let im;
	if (Math.abs(a) >= Math.abs(b)) {
		const ratio = b / a;
		const denom = a + b * ratio;
		re = 1 / denom;
		im = -ratio / denom;
	} else {
		const ratio = a / b;
		const denom = b + a * ratio;
		re = ratio / denom;
		im = -1 / denom;
	}

	return {
		re: re * postScale,
		im: im * postScale,
	};
}

/**
 * Computes `base^n` for a positive safe integer `n` via divide-and-conquer
 * recursive exponentiation by squaring in O(log n) multiplications.
 *
 * @param {{ re: number, im: number }} base
 * @param {number} n Positive safe integer.
 * @returns {{ re: number, im: number }}
 */
function powPositiveIntRecursive(base, n) {
	if (n === 1) {
		return base;
	}
	const half = powPositiveIntRecursive(base, Math.floor(n / 2));
	const squared = complexMul(half, half);
	return n % 2 === 0 ? squared : complexMul(squared, base);
}

/**
 * Computes the principal natural logarithm `Log(z) = ln|z| + i * Arg(z)`
 * with `Arg(z) in (-pi, pi]`, avoiding overflow/underflow and preserving
 * precision near the unit circle `|z| = 1`.
 *
 * @param {{ re: number, im: number }} z Non-zero finite complex number.
 * @returns {{ re: number, im: number }}
 */
function complexLogPrincipal(z) {
	const absRe = Math.abs(z.re);
	const absIm = Math.abs(z.im);
	const maxAbs = Math.max(absRe, absIm);
	const minAbs = Math.min(absRe, absIm);

	let lnMag;
	if (maxAbs >= 0.5 && maxAbs <= 2) {
		lnMag = 0.5 * Math.log1p((maxAbs - 1) * (maxAbs + 1) + minAbs * minAbs);
	} else {
		const ratio = minAbs / maxAbs;
		lnMag = Math.log(maxAbs) + 0.5 * Math.log1p(ratio * ratio);
	}

	const arg = Math.atan2(z.im, z.re);
	return { re: lnMag, im: arg };
}

/**
 * Recursively evaluates the nested Horner tail of `(exp(z) - 1) / z`:
 * `H(k) = 1 + (z / k) * H(k + 1)`, with base case `H(maxOrder + 1) = 1`.
 *
 * @param {{ re: number, im: number }} z
 * @param {number} k Current factorial divisor index.
 * @param {number} maxOrder Maximum series order.
 * @returns {{ re: number, im: number }}
 */
function hornerExpTailRecursive(z, k, maxOrder) {
	if (k > maxOrder) {
		return { re: 1, im: 0 };
	}
	const tail = hornerExpTailRecursive(z, k + 1, maxOrder);
	const scaled = { re: z.re / k, im: z.im / k };
	const prod = complexMul(scaled, tail);
	return { re: 1 + prod.re, im: prod.im };
}

/**
 * Recursively computes `exp(z) - 1` via divide-and-conquer scaling and doubling:
 * `expm1(2u) = expm1(u) * (expm1(u) + 2)`, terminating at `|z| <= 2^-4` with a
 * recursive Horner Taylor series to avoid catastrophic cancellation near zero.
 *
 * @param {{ re: number, im: number }} z
 * @returns {{ re: number, im: number }}
 */
function complexExpm1Recursive(z) {
	if (Math.hypot(z.re, z.im) <= EXP_RECURSION_THRESHOLD) {
		return complexMul(z, hornerExpTailRecursive(z, 2, EXP_TAYLOR_ORDER));
	}
	const half = complexExpm1Recursive({ re: z.re * 0.5, im: z.im * 0.5 });
	return complexMul(half, { re: half.re + 2, im: half.im });
}

/**
 * Multiplies a real value by `2^exp` recursively, splitting large exponents
 * so that intermediate powers of two remain exact normal floats.
 *
 * @param {number} value
 * @param {number} exp Integer binary exponent.
 * @returns {number}
 */
function scaleByPow2Recursive(value, exp) {
	if (exp === 0 || value === 0) {
		return value;
	}
	if (Math.abs(exp) <= 512) {
		return value * 2 ** exp;
	}
	const halfExp = Math.trunc(exp / 2);
	return scaleByPow2Recursive(scaleByPow2Recursive(value, halfExp), exp - halfExp);
}

/**
 * Computes `exp(zeta)` for a complex number `zeta` using Cody-Waite range
 * reduction followed by recursive divide-and-conquer scaling-and-squaring.
 *
 * @param {{ re: number, im: number }} zeta
 * @returns {{ re: number, im: number }}
 * @throws {RangeError} If the real part exceeds IEEE 754 double overflow bounds.
 */
function complexExpRecursive(zeta) {
	if (zeta.re > EXP_OVERFLOW_RE) {
		throw new RangeError('Complex power result overflows finite floating-point range');
	}
	if (zeta.re < EXP_UNDERFLOW_RE) {
		return { re: 0, im: 0 };
	}

	const m = Math.round(zeta.re / Math.LN2);
	const x = zeta.re - m * LN2_HI - m * LN2_LO;

	const k = Math.round(zeta.im / TWO_PI);
	let y;
	if (Math.abs(k) <= MAX_CODY_WAITE_K) {
		y = zeta.im - k * TWO_PI_HI - k * TWO_PI_MID - k * TWO_PI_LO;
	} else {
		y = zeta.im - k * TWO_PI;
	}

	const expm1Val = complexExpm1Recursive({ re: x, im: y });
	const expReduced = { re: 1 + expm1Val.re, im: expm1Val.im };

	return {
		re: scaleByPow2Recursive(expReduced.re, m),
		im: scaleByPow2Recursive(expReduced.im, m),
	};
}

/**
 * Computes the complex power `base^exponent` over complex numbers `{ re, im }`
 * using recursive divide-and-conquer algorithms.
 *
 * Algorithm:
 * - For safe integer exponents (`exponent.im === 0` and `Number.isSafeInteger(exponent.re)`),
 *   uses recursive divide-and-conquer exponentiation by squaring in `O(log |n|)` multiplications,
 *   paired with Smith's overflow-safe complex reciprocal for negative integers.
 * - For general complex exponents, evaluates the principal branch `exp(exponent * Log(base))`
 *   using Cody-Waite range reduction and recursive scaling-and-squaring of `expm1(z)`
 *   (`expm1(2u) = expm1(u) * (expm1(u) + 2)`) with a recursive Horner Taylor base case.
 *
 * Conventions:
 * - Uses the principal branch of the complex logarithm with `Arg(z) in (-pi, pi]`.
 * - Negative zero (`-0`) in inputs and outputs is normalized to `+0` so branch-cut
 *   values on the negative real axis consistently use `Arg(-x) = +pi`.
 * - `z^0 = 1 + 0i` for all finite `z` (including `0^0 = 1 + 0i`).
 * - `0^w = 0 + 0i` when `Re(w) > 0`.
 *
 * @param {{ re: number, im: number }} base Complex base `{ re, im }` with finite real parts.
 * @param {{ re: number, im: number }} exponent Complex exponent `{ re, im }` with finite real parts.
 * @returns {{ re: number, im: number }} Principal value of `base^exponent` as `{ re, im }`.
 * @throws {TypeError} If `base` or `exponent` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If any component is non-finite (`NaN`, `Infinity`, `-Infinity`),
 *   if `base` is `0 + 0i` and `exponent.re < 0` or (`exponent.re === 0` and `exponent.im !== 0`),
 *   or if the result overflows finite IEEE 754 floating-point range.
 */
export function powerComplexRecursive(base, exponent) {
	const z = validateComplex(base, 'base');
	const w = validateComplex(exponent, 'exponent');

	if (w.re === 0 && w.im === 0) {
		return { re: 1, im: 0 };
	}

	if (w.re === 1 && w.im === 0) {
		return { re: z.re, im: z.im };
	}

	if (z.re === 0 && z.im === 0) {
		if (w.re > 0) {
			return { re: 0, im: 0 };
		}
		throw new RangeError('0 raised to a power with non-positive real part is undefined');
	}

	if (z.re === 1 && z.im === 0) {
		return { re: 1, im: 0 };
	}

	let result;
	if (w.im === 0 && Number.isSafeInteger(w.re)) {
		if (w.re > 0) {
			result = powPositiveIntRecursive(z, w.re);
		} else {
			const inv = complexReciprocal(z);
			if (!Number.isFinite(inv.re) || !Number.isFinite(inv.im)) {
				throw new RangeError('Complex power result overflows finite floating-point range');
			}
			result = powPositiveIntRecursive(inv, -w.re);
		}
	} else {
		const lnZ = complexLogPrincipal(z);
		const zeta = complexMul(w, lnZ);
		if (!Number.isFinite(zeta.re) || !Number.isFinite(zeta.im)) {
			throw new RangeError('Complex power intermediate logarithm product overflows finite range');
		}
		result = complexExpRecursive(zeta);
	}

	if (!Number.isFinite(result.re) || !Number.isFinite(result.im)) {
		throw new RangeError('Complex power result overflows finite floating-point range');
	}

	return {
		re: normalizeZero(result.re),
		im: normalizeZero(result.im),
	};
}
