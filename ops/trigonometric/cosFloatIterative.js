/**
 * @fileoverview Iterative cosine implementation over IEEE-754 float64 numbers.
 *
 * Uses three-part Cody-Waite range reduction modulo pi/2 to map any finite input
 * angle into [-pi/4, pi/4], followed by an iterative Maclaurin series for
 * cos(r) or sin(r) summed until float64 convergence.
 */

const HALF_PI = Math.PI / 2;
const TWO_PI = 2 * Math.PI;

// Three-part Cody-Waite split of pi/2 (fdlibm constants).
// PIO2_HI and PIO2_LO each carry 33 significant bits so products k * PIO2_HI
// and k * PIO2_LO remain exact in IEEE-754 float64 for |k| <= 2^20 (|x| <= 1.6e6).
const PIO2_HI = 1.57079632673412561417e+00;
const PIO2_LO = 6.07710050650619224932e-11;
const PIO2_TINY = 2.02226624879595063154e-21;
const CODY_WAITE_LIMIT = 1e6;

const MAX_ITERATIONS = 64;

/**
 * Computes cos(r) via iterative Maclaurin series on |r| <= pi/4.
 *
 *   cos(r) = sum_{n=0..inf} (-1)^n * r^(2n) / (2n)!
 *
 * @param {number} r - Reduced angle in radians, |r| <= pi/4.
 * @returns {number} Approximate cos(r).
 */
function cosMaclaurin(r) {
	const r2 = r * r;
	let sum = 1;
	let term = 1;

	for (let n = 1; n <= MAX_ITERATIONS; n += 1) {
		term *= -r2 / ((2 * n - 1) * (2 * n));
		const next = sum + term;
		if (next === sum) {
			break;
		}
		sum = next;
	}

	return sum;
}

/**
 * Computes sin(r) via iterative Maclaurin series on |r| <= pi/4.
 *
 *   sin(r) = sum_{n=0..inf} (-1)^n * r^(2n+1) / (2n+1)!
 *
 * @param {number} r - Reduced angle in radians, |r| <= pi/4.
 * @returns {number} Approximate sin(r).
 */
function sinMaclaurin(r) {
	const r2 = r * r;
	let sum = r;
	let term = r;

	for (let n = 1; n <= MAX_ITERATIONS; n += 1) {
		term *= -r2 / (2 * n * (2 * n + 1));
		const next = sum + term;
		if (next === sum) {
			break;
		}
		sum = next;
	}

	return sum;
}

/**
 * Computes the cosine of an angle given in radians over IEEE-754 float64
 * Numbers using range reduction and an iterative Maclaurin series.
 *
 * @param {number} x - Angle in radians. Must be a JavaScript `number`.
 * @returns {number} The cosine of `x` in [-1, 1], or `NaN` if `x` is `NaN` or +/-Infinity.
 * @throws {TypeError} If `x` is not of type `'number'`.
 */
export function cosFloatIterative(x) {
	if (typeof x !== 'number') {
		throw new TypeError(
			`cosFloatIterative expected a number, got ${x === null ? 'null' : typeof x}`,
		);
	}

	if (!Number.isFinite(x)) {
		return Number.NaN;
	}

	if (x === 0) {
		return 1;
	}

	// Cosine is an even function: cos(-x) = cos(x).
	let ax = x < 0 ? -x : x;

	// For very large magnitudes where k * PIO2_HI would lose precision,
	// pre-reduce into [0, 2*pi) so the subsequent quadrant reduction always
	// lands in [-pi/4, pi/4].
	if (ax > CODY_WAITE_LIMIT) {
		ax %= TWO_PI;
	}

	// Reduce ax = k * (pi/2) + r with |r| <= pi/4 using Cody-Waite subtraction.
	const k = Math.round(ax / HALF_PI);
	const r = ax - k * PIO2_HI - k * PIO2_LO - k * PIO2_TINY;

	// Quadrant selection:
	//   k % 4 === 0 -> +cos(r)
	//   k % 4 === 1 -> -sin(r)
	//   k % 4 === 2 -> -cos(r)
	//   k % 4 === 3 -> +sin(r)
	const quadrant = k % 4;
	let result;
	if (quadrant === 0) {
		result = cosMaclaurin(r);
	} else if (quadrant === 1) {
		result = -sinMaclaurin(r);
	} else if (quadrant === 2) {
		result = -cosMaclaurin(r);
	} else {
		result = sinMaclaurin(r);
	}

	// Normalize -0 to +0.
	return result === 0 ? 0 : result;
}
