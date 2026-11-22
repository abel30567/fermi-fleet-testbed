/**
 * Trigonometric sine (`sin`) over IEEE-754 float64 Numbers using
 * Cody-Waite range reduction and an iterative Maclaurin series.
 *
 * @module ops/trigonometric/sinFloatIterative
 */

const TWO_PI = 2 * Math.PI
const HALF_PI = Math.PI / 2

// Exact high/mid/low split of π (hex: 3.243F6A88 85A308D3 13198A2E...)
// PI_1 has 26 significant bits and PI_2 has 24, so k * PI_1 and k * PI_2 are
// exact in IEEE-754 float64 for |k| <= 2^27 (|x| <= ~4.2e8).
const PI_1 = 0x3243f6a / 2 ** 24
const PI_2 = 0x8885a3 / 2 ** 48
const PI_3 = 0x08d313198a2e / 2 ** 96

const CODY_WAITE_LIMIT = 1e8
const MAX_ITERATIONS = 100

/**
 * Computes the sine of an angle given in radians over IEEE-754 float64 Numbers
 * using a straightforward iterative implementation (range reduction into
 * `[-π/2, π/2]` followed by iterative Maclaurin series summation until
 * float64 convergence).
 *
 * @param {number} x - Angle in radians (must be a primitive JavaScript number).
 * @returns {number} The sine of `x` in `[-1, 1]`, preserving signed zero (`-0`),
 *   or `NaN` if `x` is `NaN`, `Infinity`, or `-Infinity`.
 * @throws {TypeError} If `x` is not a primitive `number`.
 */
export function sinFloatIterative(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected a number for x, received ${x === null ? 'null' : typeof x}`)
	}

	if (!Number.isFinite(x)) {
		return Number.NaN
	}

	// Preserve IEEE-754 signed zero: sin(+0) = +0, sin(-0) = -0.
	if (x === 0) {
		return x
	}

	let r
	let negate = false

	if (Math.abs(x) <= CODY_WAITE_LIMIT) {
		// Reduce x = k * π + r with r ∈ [-π/2, π/2]; sin(kπ + r) = (-1)^k * sin(r).
		const k = Math.round(x / Math.PI)
		r = (x - k * PI_1) - k * PI_2 - k * PI_3
		negate = k % 2 !== 0
	} else {
		// Fallback modulo reduction for very large magnitudes to prevent overflow in k * PI_1.
		let reduced = x % TWO_PI
		if (reduced > Math.PI) {
			reduced -= TWO_PI
		} else if (reduced < -Math.PI) {
			reduced += TWO_PI
		}

		if (reduced > HALF_PI) {
			r = Math.PI - reduced
		} else if (reduced < -HALF_PI) {
			r = -Math.PI - reduced
		} else {
			r = reduced
		}
	}

	// Iterative Maclaurin series: sin(r) = Σ_{n=0}^∞ (-1)^n * r^(2n+1) / (2n+1)!
	const r2 = r * r
	let term = r
	let sum = r

	for (let n = 1; n <= MAX_ITERATIONS; n++) {
		term = (-term * r2) / (2 * n * (2 * n + 1))
		const next = sum + term
		if (next === sum) {
			break
		}
		sum = next
	}

	let result = negate ? -sum : sum
	if (result > 1) {
		result = 1
	} else if (result < -1) {
		result = -1
	}

	return result === 0 ? 0 : result
}
