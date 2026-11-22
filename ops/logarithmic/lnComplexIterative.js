const POW2_64 = 2 ** 64
const INV_POW2_64 = 2 ** -64
const HALF_PI = Math.PI / 2
const ATAN_THRESHOLD = 0.125
const MAX_SERIES_ITERATIONS = 100

/**
 * Evaluates atanh(t) = sum_{n=0..inf} t^(2n+1) / (2n+1) iteratively for |t| < 1.
 *
 * @param {number} t - Input value with |t| < 1.
 * @returns {number} Approximate value of atanh(t).
 */
function atanhSeries(t) {
	if (t === 0) return 0
	const t2 = t * t
	let power = t
	let sum = t
	for (let k = 3; k < 2 * MAX_SERIES_ITERATIONS + 1; k += 2) {
		power *= t2
		const term = power / k
		sum += term
		if (Math.abs(term) <= Number.EPSILON * Math.abs(sum)) {
			break
		}
	}
	return sum
}

/**
 * Computes ln(u) for a finite positive number u > 0 using exact power-of-2
 * range reduction into [sqrt(1/2), sqrt(2)) followed by the iterative atanh series.
 *
 * @param {number} u - Positive finite real number.
 * @returns {number} Natural logarithm of u.
 */
function lnPositiveIterative(u) {
	let m = u
	let k = 0

	while (m >= POW2_64) {
		m *= INV_POW2_64
		k += 64
	}
	while (m < INV_POW2_64) {
		m *= POW2_64
		k -= 64
	}
	while (m >= Math.SQRT2) {
		m *= 0.5
		k += 1
	}
	while (m < Math.SQRT1_2) {
		m *= 2
		k -= 1
	}

	const t = (m - 1) / (m + 1)
	const lnM = 2 * atanhSeries(t)
	return k === 0 ? lnM : k * Math.LN2 + lnM
}

/**
 * Computes 0.5 * ln(1 + r^2) for r in [0, 1] without catastrophic cancellation
 * near r = 0, using atanh(r^2 / (2 + r^2)).
 *
 * @param {number} r - Ratio in [0, 1].
 * @returns {number} Value of 0.5 * ln(1 + r^2).
 */
function halfLn1PlusSqIterative(r) {
	if (r === 0) return 0
	const r2 = r * r
	return atanhSeries(r2 / (2 + r2))
}

/**
 * Computes atan(r) for r in (0, 1] using iterative half-angle tangent reduction
 * followed by the alternating Taylor series.
 *
 * @param {number} r - Input value in (0, 1].
 * @returns {number} Value of atan(r) in (0, pi/4].
 */
function atanUnitIterative(r) {
	let reduced = r
	let scale = 1

	while (reduced > ATAN_THRESHOLD) {
		reduced = reduced / (1 + Math.sqrt(1 + reduced * reduced))
		scale *= 2
	}

	const r2 = reduced * reduced
	let power = reduced
	let sum = reduced
	let sign = -1

	for (let k = 3; k < 2 * MAX_SERIES_ITERATIONS + 1; k += 2) {
		power *= r2
		const term = (sign * power) / k
		sum += term
		sign = -sign
		if (Math.abs(term) <= Number.EPSILON * Math.abs(sum)) {
			break
		}
	}

	return scale * sum
}

/**
 * Computes the principal argument Arg(re + i * im) in (-pi, pi] iteratively.
 *
 * @param {number} re - Real part.
 * @param {number} im - Imaginary part.
 * @returns {number} Principal argument in (-pi, pi].
 */
function argIterative(re, im) {
	if (im === 0) {
		return re > 0 ? 0 : Math.PI
	}
	if (re === 0) {
		return im > 0 ? HALF_PI : -HALF_PI
	}

	const absRe = Math.abs(re)
	const absIm = Math.abs(im)
	const ratio = absIm <= absRe ? absIm / absRe : absRe / absIm
	const alpha = atanUnitIterative(ratio)

	let angle = absIm <= absRe ? alpha : HALF_PI - alpha
	if (re < 0) {
		angle = Math.PI - angle
	}
	return im < 0 ? -angle : angle
}

/**
 * Computes the principal natural logarithm of a complex number using a
 * straightforward iterative algorithm:
 *
 *   ln(re + i * im) = ln(|z|) + i * Arg(z),   Arg(z) in (-pi, pi]
 *
 * The real part is computed via overflow/underflow-safe scaling
 * ln(max(|re|, |im|)) + 0.5 * ln(1 + (min/max)^2) using power-of-2 range
 * reduction and the iterative atanh series. The imaginary part is computed via
 * iterative half-angle tangent reduction and the alternating arctangent series.
 *
 * @param {{ re: number, im: number }} z - Complex number with finite real and imaginary parts.
 * @returns {{ re: number, im: number }} Principal complex natural logarithm of z.
 * @throws {TypeError} If z is not a plain object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not finite (NaN, Infinity, -Infinity), or if z equals 0 + 0i.
 */
export function lnComplexIterative(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Expected a complex number object { re, im }')
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError('Complex number properties re and im must be numbers')
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError('Complex number properties re and im must be finite')
	}
	if (z.re === 0 && z.im === 0) {
		throw new RangeError('Complex logarithm is undefined at 0')
	}

	const absRe = Math.abs(z.re)
	const absIm = Math.abs(z.im)
	const maxAbs = absRe >= absIm ? absRe : absIm
	const minAbs = absRe >= absIm ? absIm : absRe
	const ratio = minAbs / maxAbs

	const re = lnPositiveIterative(maxAbs) + halfLn1PlusSqIterative(ratio)
	const im = argIterative(z.re, z.im)

	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	}
}
