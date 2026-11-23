/**
 * @fileoverview Recursive divide-and-conquer cosine over IEEE-754 float64 numbers.
 */

// Exact 26-bit Cody-Waite chunks of pi/2 (sum equals pi/2 to 130 bits of precision).
const PIO2_0 = 1.5707963109016418
const PIO2_1 = 1.5893254712295857e-8
const PIO2_2 = 6.123233932053594e-17
const PIO2_3 = 6.368317055225283e-25
const PIO2_4 = 1.0828566716053562e-32

const INV_PIO2 = 2 / Math.PI
const TWO_PI = 2 * Math.PI
const SPLIT = 67108864 // 2^26
const LARGE_ANGLE_LIMIT = 35184372088832 // 2^45
const BASE_THRESHOLD = 1 / 256 // 2^-8

/**
 * Recursively computes [sin(t), 1 - cos(t)] for a non-negative reduced angle t
 * by halving the angle down to the small-angle base case and recombining via
 * double-angle identities:
 *   sin(2h) = 2 * sin(h) * (1 - u(h))
 *   u(2h)   = 1 - cos(2h) = 2 * sin(h)^2
 *
 * Tracking u(t) = 1 - cos(t) (the versed cosine) avoids catastrophic
 * cancellation near t = 0 while unwinding the recursion.
 *
 * @param {number} t Non-negative reduced angle in radians.
 * @returns {[number, number]} Tuple of [sin(t), 1 - cos(t)].
 */
function sinVersedCosRecursive(t) {
	if (t <= BASE_THRESHOLD) {
		const t2 = t * t
		// Degree-7 Taylor polynomial for sin(t) and degree-8 for 1 - cos(t);
		// truncation error is < 2^-76 for t <= 2^-8 (below float64 machine epsilon).
		const s = t * (1 - t2 * (1 / 6 - t2 * (1 / 120 - t2 / 5040)))
		const u = t2 * (0.5 - t2 * (1 / 24 - t2 * (1 / 720 - t2 / 40320)))
		return [s, u]
	}

	const [sHalf, uHalf] = sinVersedCosRecursive(t * 0.5)
	const s = 2 * sHalf * (1 - uHalf)
	const u = 2 * sHalf * sHalf
	return [s, u]
}

/**
 * Reduces a non-negative finite angle into quadrant index (0..3) and residual
 * r in [-pi/4, pi/4] using multi-part Cody-Waite reduction.
 *
 * @param {number} ax Non-negative finite angle in radians.
 * @returns {[number, number]} Tuple of [quadrant, residual].
 */
function reduceAngle(ax) {
	if (ax >= LARGE_ANGLE_LIMIT) {
		const wrapped = ax % TWO_PI
		const q = Math.round(wrapped * INV_PIO2)
		const r = wrapped - q * (Math.PI / 2)
		return [q % 4, r]
	}

	const q = Math.round(ax * INV_PIO2)
	let r
	if (q < SPLIT) {
		r =
			((((ax - q * PIO2_0) - q * PIO2_1) - q * PIO2_2) - q * PIO2_3) -
			q * PIO2_4
	} else {
		const qHi = Math.floor(q / SPLIT) * SPLIT
		const qLo = q - qHi
		r =
			((((((((ax - qHi * PIO2_0) - qLo * PIO2_0) - qHi * PIO2_1) - qLo * PIO2_1) -
				qHi * PIO2_2) -
				qLo * PIO2_2) -
				qHi * PIO2_3) -
				qLo * PIO2_3) -
			q * PIO2_4
	}
	return [q % 4, r]
}

/**
 * Computes the trigonometric cosine of an IEEE-754 float64 angle (in radians)
 * using a recursive divide-and-conquer angle-halving algorithm.
 *
 * @param {number} x Angle in radians (IEEE-754 float64 number).
 * @returns {number} The cosine of x in [-1, 1], or NaN for non-finite numbers.
 * @throws {TypeError} If x is not of type "number".
 */
export function cosFloatRecursive(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected a float64 number, received ${typeof x}`)
	}
	if (!Number.isFinite(x)) {
		return Number.NaN
	}

	const ax = Math.abs(x)
	if (ax === 0) {
		return 1
	}

	const [quad, r] = reduceAngle(ax)
	const [s, u] = sinVersedCosRecursive(Math.abs(r))
	const sinR = r < 0 ? -s : s
	const cosR = 1 - u

	switch (quad) {
		case 0:
			return cosR
		case 1:
			return sinR === 0 ? 0 : -sinR
		case 2:
			return -cosR
		case 3:
			return sinR
	}
}
