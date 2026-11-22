/**
 * Computes the square root of a non-negative IEEE-754 float64 number using a
 * straightforward iterative Newton-Raphson (Babylonian) method.
 *
 * To avoid intermediate overflow and underflow on very large, very small, or
 * subnormal inputs, finite positive values are first normalized into `[1, 4)`
 * by exact even powers of two (`x = m * 2^(2k)`), the square root of `m` is
 * found iteratively in `[1, 2)`, and the result is rescaled by `2^k`.
 *
 * Edge cases:
 * - `sqrtFloatIterative(0)` returns `0` (`-0` returns `-0`, matching IEEE-754).
 * - `sqrtFloatIterative(Infinity)` returns `Infinity`.
 * - `sqrtFloatIterative(NaN)` returns `NaN`.
 *
 * @param {number} x - The non-negative float64 radicand.
 * @returns {number} The principal square root of `x`.
 * @throws {TypeError} If `x` is not a `number`.
 * @throws {RangeError} If `x` is strictly negative (`x < 0`).
 */
export function sqrtFloatIterative(x) {
	if (typeof x !== 'number') {
		throw new TypeError(`Expected a number, received ${typeof x}`)
	}
	if (Number.isNaN(x)) {
		return NaN
	}
	if (x < 0) {
		throw new RangeError(`Expected a non-negative number, received ${x}`)
	}
	if (x === 0 || x === Infinity) {
		return x
	}

	// Scale x into [1, 4) using exact even powers of two so that
	// x = m * scale^2 with zero rounding error during normalization.
	const SCALE_UP_LARGE = 2 ** 512
	const SCALE_DOWN_LARGE = 2 ** -512
	const SQRT_SCALE_UP_LARGE = 2 ** 256
	const SQRT_SCALE_DOWN_LARGE = 2 ** -256
	const MAX_ITERATIONS = 64

	let m = x
	let scale = 1

	while (m >= SCALE_UP_LARGE) {
		m *= SCALE_DOWN_LARGE
		scale *= SQRT_SCALE_UP_LARGE
	}
	while (m < SCALE_DOWN_LARGE) {
		m *= SCALE_UP_LARGE
		scale *= SQRT_SCALE_DOWN_LARGE
	}
	while (m >= 4) {
		m *= 0.25
		scale *= 2
	}
	while (m < 1) {
		m *= 4
		scale *= 0.5
	}

	// Initial overestimate by AM-GM: 0.5 * (m + 1) >= sqrt(m) for all m in [1, 4).
	let guess = 0.5 * (m + 1)

	for (let i = 0; i < MAX_ITERATIONS; i++) {
		const next = 0.5 * (guess + m / guess)
		// Since guess approaches sqrt(m) monotonically from above, next >= guess
		// indicates convergence to machine precision (avoids 1-ULP oscillation).
		if (next >= guess) {
			break
		}
		guess = next
	}

	return guess * scale
}
