/**
 * Computes the discrete floored modulo `a mod m` over IEEE-754 float64 numbers
 * using an iterative binary doubling/halving (shift-and-subtract) algorithm.
 *
 * Convention (Knuth floored modulo):
 * - Defined mathematically as `r = a - m * floor(a / m)`.
 * - For `m > 0`, returns `r` in the half-open interval `[0, m)`.
 * - For `m < 0`, returns `r` in the half-open interval `(m, 0]`.
 * - Exact multiples always return `+0` (never `-0`).
 * - When `a` and `m` have opposite signs and the exact remainder is so close
 *   to `m` that `signedRem + m` rounds to `m` in float64, the result wraps to
 *   `0` so the half-open range invariant is always preserved.
 *
 * Algorithm:
 * - Scales `|m|` upward by repeated doubling (`step *= 2`) while
 *   `step <= rem - step` (avoiding overflow and subnormal rounding issues).
 * - Halves `step` back down to `|m|`, subtracting `step` whenever
 *   `rem >= step`. By Sterbenz's lemma each subtraction is exact in IEEE-754
 *   float64, and total iterations are O(log2(|a| / |m|)) (at most ~2098
 *   doublings even across the full float64 dynamic range), preventing
 *   infinite loops or hangs on large magnitudes.
 * - Adjusts the sign of the reduced magnitude to match the floored modulo
 *   convention without intermediate overflow.
 *
 * @param {number} a - Finite IEEE-754 float64 dividend.
 * @param {number} m - Finite, non-zero IEEE-754 float64 divisor.
 * @returns {number} The floored modulo `a mod m` in `[0, m)` (if `m > 0`) or `(m, 0]` (if `m < 0`).
 * @throws {TypeError} If `a` or `m` is not a number.
 * @throws {RangeError} If `a` or `m` is not finite (`NaN`, `±Infinity`), or if `m === 0`.
 */
export function moduloFloatIterative(a, m) {
	if (typeof a !== 'number' || typeof m !== 'number') {
		throw new TypeError('Expected finite numbers for a and m')
	}
	if (!Number.isFinite(a) || !Number.isFinite(m)) {
		throw new RangeError('Arguments a and m must be finite numbers')
	}
	if (m === 0) {
		throw new RangeError('Divisor m must be non-zero')
	}

	let rem = Math.abs(a)
	const absM = Math.abs(m)

	if (rem >= absM) {
		let step = absM
		let shifts = 0
		while (step <= rem - step) {
			step *= 2
			shifts += 1
		}
		for (let i = shifts; i >= 0; i -= 1) {
			if (rem >= step) {
				rem -= step
			}
			step *= 0.5
		}
	}

	if (rem === 0) {
		return 0
	}

	const signedRem = a < 0 ? -rem : rem
	if ((a < 0 && m > 0) || (a > 0 && m < 0)) {
		const adjusted = signedRem + m
		return adjusted === m ? 0 : adjusted
	}

	return signedRem
}
