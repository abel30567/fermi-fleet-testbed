/**
 * High-precision 24/26-bit pieces of π for exact Cody-Waite range reduction.
 * Each piece has at most 26 significant bits, so `k * PI_i` is exact in
 * IEEE-754 float64 for any integer |k| < 2^27 (|x| < ~4.2e8).
 * Hex expansion of π: 3.243f6a 8885a3 08d313 198a2e ...
 */
const PI_1 = 0x3243f6a * 2 ** -24;
const PI_2 = 0x8885a3 * 2 ** -48;
const PI_3 = 0x08d313 * 2 ** -72;
const PI_4 = 0x198a2e * 2 ** -96;

const TWO_PI = 2 * Math.PI;
const HALF_PI = Math.PI / 2;

/**
 * Upper bound on |x| for which `k = Math.round(x / Math.PI)` satisfies
 * |k| < 2^27, guaranteeing exact products `k * PI_i` during Cody-Waite reduction.
 */
const MAX_CODY_WAITE_X = 1e8;

/**
 * Safety cap on Maclaurin series iterations. For |r| <= π/2, terms drop below
 * float64 machine epsilon (~2.22e-16) within 12 iterations.
 */
const MAX_ITERATIONS = 32;

/**
 * Computes the trigonometric sine of an angle in radians over IEEE-754 float64
 * Numbers using a straightforward iterative Maclaurin series after range
 * reduction to [-π/2, π/2].
 *
 * Special IEEE-754 cases:
 * - `NaN`, `+Infinity`, `-Infinity` return `NaN`.
 * - `+0` returns `+0` and `-0` returns `-0` (sign preserved).
 *
 * @param {number} x - Angle in radians (must be an IEEE-754 Number).
 * @returns {number} The sine of `x` in `[-1, 1]`, or `NaN` for non-finite inputs.
 * @throws {TypeError} If `x` is not of type `'number'`.
 */
export function sinFloatIterative(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected x to be a number, got ${x === null ? 'null' : typeof x}`);
	}

	if (Number.isNaN(x) || !Number.isFinite(x)) {
		return Number.NaN;
	}

	if (x === 0) {
		return x;
	}

	let r;
	let negate = false;

	if (Math.abs(x) <= MAX_CODY_WAITE_X) {
		const k = Math.round(x / Math.PI);
		r = x - k * PI_1 - k * PI_2 - k * PI_3 - k * PI_4;
		negate = (k & 1) !== 0;
	} else {
		r = x % TWO_PI;
		if (r > Math.PI) {
			r -= TWO_PI;
		} else if (r < -Math.PI) {
			r += TWO_PI;
		}
		if (r > HALF_PI) {
			r = Math.PI - r;
		} else if (r < -HALF_PI) {
			r = -Math.PI - r;
		}
	}

	// Iterative Maclaurin series: sin(r) = sum_{n=0}^\infty (-1)^n r^(2n+1) / (2n+1)!
	const r2 = r * r;
	let term = r;
	let sum = r;

	for (let n = 1; n <= MAX_ITERATIONS; n++) {
		term = (-term * r2) / (2 * n * (2 * n + 1));
		const next = sum + term;
		if (next === sum) {
			break;
		}
		sum = next;
	}

	const result = negate ? -sum : sum;
	if (result > 1) {
		return 1;
	}
	if (result < -1) {
		return -1;
	}
	return result;
}
