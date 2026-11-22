/**
 * Iterative computation of the square root for v >= 1 using Newton-Raphson.
 *
 * @param {number} v - Positive finite number (v >= 1).
 * @returns {number} Square root of v.
 */
function sqrtIterative(v) {
	let s = 0.5 * (1 + v)
	for (let i = 0; i < 32; i++) {
		const next = 0.5 * (s + v / s)
		if (Math.abs(next - s) <= 1e-16 * next) {
			return next
		}
		s = next
	}
	return s
}

/**
 * Iterative alternating Taylor series for atan(t) with |t| <= 0.2.
 *
 * @param {number} t - Real value with small magnitude.
 * @returns {number} Approximation of atan(t).
 */
function atanSmallSeries(t) {
	if (t === 0) {
		return 0
	}
	const t2 = t * t
	let power = t
	let sum = t
	for (let n = 1; n <= 64; n++) {
		power *= -t2
		const term = power / (2 * n + 1)
		sum += term
		if (Math.abs(term) <= Math.abs(sum) * 1e-17) {
			break
		}
	}
	return sum
}

/**
 * Iterative computation of atan(t) for 0 <= t <= 1 using half-angle reduction
 * followed by the alternating Taylor series.
 *
 * @param {number} t - Real number in [0, 1].
 * @returns {number} Approximation of atan(t) in [0, pi/4].
 */
function atanUnitIterative(t) {
	let reduced = t
	let scale = 1
	while (reduced > 0.0625) {
		reduced = reduced / (1 + sqrtIterative(1 + reduced * reduced))
		scale *= 2
	}
	return scale * atanSmallSeries(reduced)
}

/**
 * Iterative computation of ln(x) via the atanh series:
 * ln(x) = 2 * sum_{n=0..inf} y^(2n+1) / (2n+1), where y = (x - 1) / (x + 1).
 *
 * @param {number} x - Positive number near 1 (typically in [1/sqrt(2), sqrt(2)]).
 * @returns {number} Natural logarithm of x.
 */
function lnReducedIterative(x) {
	const y = (x - 1) / (x + 1)
	if (y === 0) {
		return 0
	}
	const y2 = y * y
	let power = y
	let sum = y
	for (let n = 1; n <= 64; n++) {
		power *= y2
		const term = power / (2 * n + 1)
		sum += term
		if (Math.abs(term) <= Math.abs(sum) * 1e-17) {
			break
		}
	}
	return 2 * sum
}

// Constants computed iteratively via the series above:
// ln(2) = 2 * atanh(1/3), pi = 16 * atan(1/5) - 4 * atan(1/239) (Machin's formula).
const LN2_ITER = lnReducedIterative(2)
const PI_ITER = 16 * atanSmallSeries(0.2) - 4 * atanSmallSeries(1 / 239)
const HALF_PI_ITER = 0.5 * PI_ITER
const SQRT2_ITER = sqrtIterative(2)
const POW2_64 = 18446744073709551616
const POW2_NEG64 = 1 / POW2_64

/**
 * Iterative computation of log2(x) for any positive finite number x > 0.
 * Uses exact power-of-2 range reduction followed by the iterative atanh series.
 *
 * @param {number} x - Positive finite real number.
 * @returns {number} Base-2 logarithm of x.
 */
function log2PositiveIterative(x) {
	let m = x
	let exponent = 0

	while (m >= POW2_64) {
		m *= POW2_NEG64
		exponent += 64
	}
	while (m < POW2_NEG64) {
		m *= POW2_64
		exponent -= 64
	}
	while (m >= 2) {
		m *= 0.5
		exponent += 1
	}
	while (m < 1) {
		m *= 2
		exponent -= 1
	}

	if (m === 1) {
		return exponent
	}

	if (m > SQRT2_ITER) {
		m *= 0.5
		exponent += 1
	}

	return exponent + lnReducedIterative(m) / LN2_ITER
}

/**
 * Iterative computation of the principal argument Arg(re + i * im) in (-pi, pi].
 *
 * @param {number} im - Imaginary part.
 * @param {number} re - Real part (at least one of re, im is non-zero).
 * @returns {number} Principal argument in (-pi, pi].
 */
function atan2Iterative(im, re) {
	const absRe = re < 0 ? -re : re
	const absIm = im < 0 ? -im : im

	if (absIm <= absRe) {
		const theta = atanUnitIterative(absIm / absRe)
		if (re > 0) {
			return im >= 0 ? theta : -theta
		}
		return im >= 0 ? PI_ITER - theta : -(PI_ITER - theta)
	}

	const theta = atanUnitIterative(absRe / absIm)
	if (im > 0) {
		return re >= 0 ? HALF_PI_ITER - theta : HALF_PI_ITER + theta
	}
	return re >= 0 ? -(HALF_PI_ITER - theta) : -(HALF_PI_ITER + theta)
}

/**
 * Computes the principal base-2 logarithm of a complex number z = { re, im }
 * using a straightforward iterative implementation:
 *
 *   log2(z) = log2(|z|) + i * Arg(z) / ln(2)
 *
 * where |z| = sqrt(re^2 + im^2) is computed with scaling to prevent overflow
 * and underflow, and Arg(z) lies in the principal branch (-pi, pi].
 *
 * @param {{ re: number, im: number }} z - Complex number with finite numeric `re` and `im` properties.
 * @returns {{ re: number, im: number }} The principal base-2 complex logarithm of `z`.
 * @throws {TypeError} If `z` is not a non-null plain/object or if `z.re` or `z.im` is not a number.
 * @throws {RangeError} If `z.re` or `z.im` is non-finite (NaN or +/-Infinity), or if `z` is zero (0 + 0i).
 */
export function log2ComplexIterative(z) {
	if (typeof z !== 'object' || z === null || Array.isArray(z)) {
		throw new TypeError('Input must be a complex number object of the form { re, im }')
	}

	const { re, im } = z

	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError('Complex number properties `re` and `im` must be numbers')
	}

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex number properties `re` and `im` must be finite numbers')
	}

	if (re === 0 && im === 0) {
		throw new RangeError('Complex base-2 logarithm is undefined at 0 + 0i')
	}

	const absRe = re < 0 ? -re : re
	const absIm = im < 0 ? -im : im
	const scale = absRe >= absIm ? absRe : absIm

	// log2(|z|) = log2(scale * sqrt((re/scale)^2 + (im/scale)^2))
	//           = log2(scale) + 0.5 * log2((re/scale)^2 + (im/scale)^2)
	const scaledRe = absRe / scale
	const scaledIm = absIm / scale
	const normSq = scaledRe * scaledRe + scaledIm * scaledIm

	const outRe = log2PositiveIterative(scale) + 0.5 * log2PositiveIterative(normSq)
	const outIm = atan2Iterative(im, re) / LN2_ITER

	return {
		re: outRe === 0 ? 0 : outRe,
		im: outIm === 0 ? 0 : outIm,
	}
}
