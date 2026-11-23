/**
 * Trigonometric cosine over dual numbers `{ v, d }` using a recursive
 * divide-and-conquer implementation based on angle halving and the
 * double-angle identity `cos(2x) = 2 * cos^2(x) - 1`.
 *
 * A dual number `x = v + d * ε` (with `ε^2 = 0`) carries a primal value `v`
 * alongside its forward-mode derivative `d`. Applying cosine yields:
 *
 *   cos(v + d * ε) = cos(v) + (-sin(v) * d) * ε
 *
 * To avoid catastrophic cancellation near `cos(0) = 1` during repeated
 * squaring, the recursion operates on the shifted dual function
 * `u(x) = cos(x) - 1`, which satisfies the exact dual-number recurrence:
 *
 *   u(2x) = 2 * u(x) * (u(x) + 2)
 *     primal:     u_v(2x) = 2 * u_v * (u_v + 2)
 *     derivative: u_d(2x) = 4 * u_d * (u_v + 1)
 *
 * @module ops/trigonometric/cosDualRecursive
 */

const TWO_PI = 2 * Math.PI

// Exact 24-bit Cody-Waite decomposition of 2*pi (96 bits total precision).
// Each chunk has at most 24 significant bits, so products with integers
// up to 2^28 are exact in IEEE 754 double precision.
const TWO_PI_0 = 6.2831850051879883
const TWO_PI_1 = 3.0199157663446385e-7
const TWO_PI_2 = 2.1561210119831059e-14
const TWO_PI_3 = 1.3128013663231652e-21

const TWO_24 = 16777216 // 2^24
const TWO_28 = 268435456 // 2^28

// Base-case threshold for recursive angle halving: 2^-10 (~9.77e-4 rad).
// At |v| <= 2^-10, the omitted degree-10 Taylor term v^10 / 10! is < 2.2e-37.
const BASE_THRESHOLD = 1 / 1024

/**
 * Reduces an angle `v` (in radians) to `[-Math.PI, Math.PI]` modulo `2 * Math.PI`
 * using multi-word Cody-Waite subtraction for high accuracy on large angles.
 *
 * @param {number} v - Finite angle in radians.
 * @returns {number} Equivalent angle in `[-Math.PI, Math.PI]`.
 */
function reduceAngle(v) {
	if (Math.abs(v) <= Math.PI) {
		return v
	}

	const k = Math.round(v / TWO_PI)
	let r

	if (Math.abs(k) < TWO_28) {
		r = v - k * TWO_PI_0
		r -= k * TWO_PI_1
		r -= k * TWO_PI_2
		r -= k * TWO_PI_3
	} else if (Math.abs(k) < Number.MAX_SAFE_INTEGER) {
		// Split k into an exact high part (<=29 sig. bits) and low part (<=24 sig. bits)
		// so every product with a 24-bit chunk stays exact in IEEE 754 double precision.
		const kHi = Math.trunc(k / TWO_24) * TWO_24
		const kLo = k - kHi
		r = v - kHi * TWO_PI_0
		r -= kLo * TWO_PI_0
		r -= kHi * TWO_PI_1
		r -= kLo * TWO_PI_1
		r -= kHi * TWO_PI_2
		r -= kLo * TWO_PI_2
		r -= kHi * TWO_PI_3
		r -= kLo * TWO_PI_3
	} else {
		r = v % TWO_PI
	}

	// Safety guard to guarantee |r| <= Math.PI even for extreme magnitudes.
	if (Math.abs(r) > Math.PI) {
		r = (((r + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI - Math.PI
	}

	return r
}

/**
 * Recursively computes the dual number `u(x) = cos(x) - 1` via angle halving
 * and the dual-number double-angle identity `u(2x) = 2 * u(x) * (u(x) + 2)`.
 *
 * @param {number} v - Reduced angle value in radians.
 * @param {number} d - Derivative component.
 * @returns {{ v: number, d: number }} Dual number `{ v: cos(v) - 1, d: -sin(v) * d }`.
 */
function cosMinusOneDualRec(v, d) {
	if (Math.abs(v) <= BASE_THRESHOLD) {
		const v2 = v * v
		// Horner evaluation of cos(v) - 1 = -v^2/2! + v^4/4! - v^6/6! + v^8/8!
		const uv = v2 * (-0.5 + v2 * (1 / 24 + v2 * (-1 / 720 + v2 / 40320)))
		// Horner evaluation of -sin(v) = -v + v^3/3! - v^5/5! + v^7/7!
		const negSinV = v * (-1 + v2 * (1 / 6 + v2 * (-1 / 120 + v2 / 5040)))
		return { v: uv, d: negSinV * d }
	}

	// Divide: recursively evaluate at half the dual number (v / 2, d / 2).
	const half = cosMinusOneDualRec(v * 0.5, d * 0.5)

	// Conquer: reconstruct u(2x) from u(x) via dual-number double-angle identity.
	return {
		v: 2 * half.v * (half.v + 2),
		d: 4 * (half.d * (half.v + 1)),
	}
}

/**
 * Computes the cosine of a dual number `{ v, d }` using a recursive
 * divide-and-conquer angle-halving algorithm.
 *
 * @param {{ v: number, d: number }} x - Input dual number with finite numeric
 *   primal value `v` (in radians) and derivative `d`.
 * @returns {{ v: number, d: number }} Resulting dual number
 *   `{ v: cos(x.v), d: -sin(x.v) * x.d }`.
 * @throws {TypeError} If `x` is not a plain object or if `x.v` or `x.d` is not a number.
 * @throws {RangeError} If `x.v` or `x.d` is `NaN`, `Infinity`, or `-Infinity`.
 */
export function cosDualRecursive(x) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('cosDualRecursive expects a dual number object { v, d }')
	}

	const { v, d } = x

	if (typeof v !== 'number' || typeof d !== 'number') {
		throw new TypeError('cosDualRecursive expects numeric properties v and d')
	}

	if (!Number.isFinite(v) || !Number.isFinite(d)) {
		throw new RangeError('cosDualRecursive expects finite numbers for v and d')
	}

	const reducedV = reduceAngle(v)
	const u = cosMinusOneDualRec(reducedV, d)

	const outV = 1 + u.v
	const outD = u.d

	return {
		v: outV === 0 ? 0 : outV,
		d: outD === 0 ? 0 : outD,
	}
}
