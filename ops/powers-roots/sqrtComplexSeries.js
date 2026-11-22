const LARGE_THRESHOLD = 2 ** 1020
const SMALL_THRESHOLD = 2 ** -512
const SCALE_LARGE = 2 ** -4
const UNSCALE_LARGE = 2 ** 2
const SCALE_SMALL = 2 ** 600
const UNSCALE_SMALL = 2 ** -300

/**
 * Computes the principal complex square root of `z = { re, im }`.
 *
 * Uses the cancellation-free closed-form algebraic identity derived from
 * `(u + iv)^2 = a + bi` with modulus `r = hypot(a, b)`:
 *
 * - `t = sqrt((r + |a|) / 2)` (computed as `sqrt(r * 0.5 + |a| * 0.5)`)
 * - `s = |b| / (2 * t)`
 * - For `a >= 0`: `re = t`, `im = b === 0 ? 0 : b / (2 * t)`
 * - For `a < 0`:  `re = s`, `im = b < 0 ? -t : t`
 * - For `a === 0 && b === 0`: `{ re: 0, im: 0 }`
 *
 * Exact power-of-two scaling (`sqrt(z) = c * sqrt(z / c^2)`) is applied for
 * extreme magnitudes (`max(|a|, |b|) > 2^1020` or `< 2^-512`) so intermediate
 * calculations neither overflow nor underflow across the full finite IEEE-754
 * double range.
 *
 * Branch convention: principal root with `Re(sqrt(z)) >= 0`, `sgn(Im(sqrt(z))) = sgn(Im(z))`
 * for `Im(z) !== 0`, and `Im(sqrt(z)) > 0` on the negative real axis (`re < 0, im = 0`).
 *
 * @param {{ re: number, im: number }} z - Finite complex number `{ re, im }`.
 * @returns {{ re: number, im: number }} Principal square root of `z`.
 * @throws {TypeError} If `z` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `z.re` or `z.im` is not a finite number (`NaN` or `±Infinity`).
 */
export function sqrtComplexSeries(z) {
	if (z === null || typeof z !== 'object') {
		throw new TypeError('z must be an object with numeric re and im properties')
	}

	const { re, im } = z

	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError('z.re and z.im must be numbers')
	}

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('z.re and z.im must be finite numbers')
	}

	if (re === 0 && im === 0) {
		return { re: 0, im: 0 }
	}

	const absRe = Math.abs(re)
	const absIm = Math.abs(im)
	const maxAbs = absRe > absIm ? absRe : absIm

	let a = re
	let b = im
	let unscale = 1

	if (maxAbs > LARGE_THRESHOLD) {
		a *= SCALE_LARGE
		b *= SCALE_LARGE
		unscale = UNSCALE_LARGE
	} else if (maxAbs < SMALL_THRESHOLD) {
		a *= SCALE_SMALL
		b *= SCALE_SMALL
		unscale = UNSCALE_SMALL
	}

	const r = Math.hypot(a, b)
	const t = Math.sqrt(r * 0.5 + Math.abs(a) * 0.5)

	let outRe
	let outIm

	if (a >= 0) {
		outRe = t
		outIm = b === 0 ? 0 : b / (2 * t)
	} else {
		outRe = Math.abs(b) / (2 * t)
		outIm = b < 0 ? -t : t
	}

	return {
		re: outRe === 0 ? 0 : outRe * unscale,
		im: outIm === 0 ? 0 : outIm * unscale,
	}
}
