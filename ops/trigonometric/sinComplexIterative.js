/**
 * Constants for 5-part Cody-Waite range reduction of pi / 2.
 * The first four chunks each contain at most 21 significant bits so that
 * products with 26-bit integer limbs are exact in IEEE-754 float64.
 */
const PI_HALF_1 = 1.570796012878418;
const PI_HALF_2 = 3.1391664379043505e-7;
const PI_HALF_3 = -1.6513982022126061e-13;
const PI_HALF_4 = -1.3350291836057247e-19;
const PI_HALF_5 = -8.69513196328042e-26;

const INV_PI_HALF = 2 / Math.PI;
const SPLIT_26 = 67108864; // 2^26

/**
 * High-low split of ln(2) for exact range reduction of exp(|b|).
 * LN2_HI has 32 significant bits, so m * LN2_HI is exact for |m| <= 2^20.
 */
const LN2_HI = 0.6931471806019545;
const LN2_LO = -4.2009150726810846e-11;

/**
 * Threshold above which cosh(|b|) and sinh(|b|) overflow IEEE-754 float64.
 */
const HYPERBOLIC_OVERFLOW_LIMIT = 710.4758600739439;

/**
 * Upper bound on iterative Taylor series terms for reduced inputs.
 */
const MAX_TAYLOR_TERMS = 64;

/**
 * Scales a finite value by 2^exp without intermediate power-of-two overflow
 * or premature underflow.
 *
 * @param {number} value
 * @param {number} exp - Integer exponent.
 * @returns {number}
 */
function scalePow2(value, exp) {
	if (exp === 0 || value === 0) {
		return value;
	}
	const half = Math.trunc(exp / 2);
	const rem = exp - half;
	return value * (2 ** half) * (2 ** rem);
}

/**
 * Reduces a real angle `a` modulo pi/2 to a reduced angle `r` in [-pi/4, pi/4]
 * and quadrant `q` in {0, 1, 2, 3} such that a = k * (pi/2) + r.
 *
 * @param {number} a
 * @returns {{ r: number, q: number }}
 */
function reduceAngle(a) {
	if (Math.abs(a) <= Math.PI / 4) {
		return { r: a, q: 0 };
	}

	const k = Math.round(a * INV_PI_HALF);
	let r;

	if (Math.abs(k) <= 2147483648) {
		r =
			a -
			k * PI_HALF_1 -
			k * PI_HALF_2 -
			k * PI_HALF_3 -
			k * PI_HALF_4 -
			k * PI_HALF_5;
	} else {
		// Split k into two 26-bit integer limbs so products with 21-bit chunks stay exact.
		const kHi = Math.trunc(k / SPLIT_26) * SPLIT_26;
		const kLo = k - kHi;
		r =
			a -
			kHi * PI_HALF_1 -
			kLo * PI_HALF_1 -
			kHi * PI_HALF_2 -
			kLo * PI_HALF_2 -
			kHi * PI_HALF_3 -
			kLo * PI_HALF_3 -
			kHi * PI_HALF_4 -
			kLo * PI_HALF_4 -
			k * PI_HALF_5;
	}

	const q = ((k % 4) + 4) % 4;
	return { r, q };
}

/**
 * Computes sin(a) and cos(a) iteratively using range reduction and
 * Maclaurin series over [-pi/4, pi/4].
 *
 * @param {number} a
 * @returns {{ sinA: number, cosA: number }}
 */
function sinCosIterative(a) {
	if (a === 0) {
		return { sinA: 0, cosA: 1 };
	}

	const { r, q } = reduceAngle(a);
	const r2 = r * r;

	let sinSum = r;
	let sinTerm = r;
	let cosSum = 1;
	let cosTerm = 1;

	for (let n = 1; n <= MAX_TAYLOR_TERMS; n++) {
		cosTerm = (-cosTerm * r2) / ((2 * n - 1) * (2 * n));
		cosSum += cosTerm;

		sinTerm = (-sinTerm * r2) / (2 * n * (2 * n + 1));
		sinSum += sinTerm;

		if (
			Math.abs(sinTerm) <= Number.EPSILON * Math.abs(sinSum) &&
			Math.abs(cosTerm) <= Number.EPSILON * Math.abs(cosSum)
		) {
			break;
		}
	}

	switch (q) {
		case 0:
			return { sinA: sinSum, cosA: cosSum };
		case 1:
			return { sinA: cosSum, cosA: -sinSum };
		case 2:
			return { sinA: -sinSum, cosA: -cosSum };
		default:
			return { sinA: -cosSum, cosA: sinSum };
	}
}

/**
 * Computes exp(t) iteratively via its Maclaurin series for reduced |t| <= ln(2)/2.
 *
 * @param {number} t
 * @returns {number}
 */
function expReducedIterative(t) {
	let sum = 1;
	let term = 1;

	for (let n = 1; n <= MAX_TAYLOR_TERMS; n++) {
		term = (term * t) / n;
		sum += term;
		if (Math.abs(term) <= Number.EPSILON * Math.abs(sum)) {
			break;
		}
	}

	return sum;
}

/**
 * Computes sinh(b) and cosh(b) iteratively.
 * Uses direct Maclaurin series for |b| <= 1 and range-reduced iterative
 * exponential evaluation for |b| > 1.
 *
 * @param {number} b
 * @returns {{ sinhB: number, coshB: number }}
 */
function sinhCoshIterative(b) {
	if (b === 0) {
		return { sinhB: 0, coshB: 1 };
	}

	const absB = Math.abs(b);

	if (absB <= 1) {
		const b2 = b * b;
		let sinhSum = b;
		let sinhTerm = b;
		let coshSum = 1;
		let coshTerm = 1;

		for (let n = 1; n <= MAX_TAYLOR_TERMS; n++) {
			coshTerm = (coshTerm * b2) / ((2 * n - 1) * (2 * n));
			coshSum += coshTerm;

			sinhTerm = (sinhTerm * b2) / (2 * n * (2 * n + 1));
			sinhSum += sinhTerm;

			if (
				Math.abs(sinhTerm) <= Number.EPSILON * Math.abs(sinhSum) &&
				Math.abs(coshTerm) <= Number.EPSILON * Math.abs(coshSum)
			) {
				break;
			}
		}

		return { sinhB: sinhSum, coshB: coshSum };
	}

	const sign = b < 0 ? -1 : 1;

	if (absB > HYPERBOLIC_OVERFLOW_LIMIT) {
		return { sinhB: sign * Infinity, coshB: Infinity };
	}

	const m = Math.round(absB / Math.LN2);
	const t = absB - m * LN2_HI - m * LN2_LO;
	const expT = expReducedIterative(t);

	const halfExpPos = scalePow2(expT, m - 1);
	const halfExpNeg = m > 1075 ? 0 : scalePow2(1 / expT, -m - 1);

	return {
		sinhB: sign * (halfExpPos - halfExpNeg),
		coshB: halfExpPos + halfExpNeg,
	};
}

/**
 * Computes the trigonometric sine of a complex number `z = { re, im }`
 * using a straightforward iterative implementation of the identity:
 *
 *   sin(a + bi) = sin(a) * cosh(b) + i * cos(a) * sinh(b)
 *
 * where `sin(a)`, `cos(a)`, `sinh(b)`, and `cosh(b)` are evaluated iteratively
 * via range reduction and Taylor series without relying on `Math.sin`,
 * `Math.cos`, `Math.sinh`, `Math.cosh`, or `Math.exp`.
 *
 * @param {{ re: number, im: number }} z - Complex number with finite real and imaginary parts.
 * @returns {{ re: number, im: number }} Complex sine of `z`.
 * @throws {TypeError} If `z` is not a non-null plain object or if `z.re` / `z.im` are not numbers.
 * @throws {RangeError} If `z.re` or `z.im` is NaN or infinite.
 */
export function sinComplexIterative(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Expected a complex number object { re, im }');
	}

	const { re: a, im: b } = z;

	if (typeof a !== 'number' || typeof b !== 'number') {
		throw new TypeError('Complex number components re and im must be numbers');
	}

	if (!Number.isFinite(a) || !Number.isFinite(b)) {
		throw new RangeError('Complex number components re and im must be finite numbers');
	}

	const { sinA, cosA } = sinCosIterative(a);
	const { sinhB, coshB } = sinhCoshIterative(b);

	const re = sinA === 0 ? 0 : sinA * coshB;
	const im = cosA === 0 ? 0 : cosA * sinhB;

	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	};
}
