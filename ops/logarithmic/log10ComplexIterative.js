/**
 * Compute the square root of a non-negative finite number iteratively via Newton-Raphson.
 *
 * @param {number} x - Non-negative finite number.
 * @returns {number} Square root of x.
 */
function sqrtIter(x) {
	if (x === 0) return 0
	let guess = x > 1 ? 0.5 * (x + 1) : 1
	for (let i = 0; i < 32; i += 1) {
		const next = 0.5 * (guess + x / guess)
		if (next === guess || Math.abs(next - guess) <= Number.EPSILON * next) {
			return next
		}
		guess = next
	}
	return guess
}

/**
 * Compute ln(1 + y) iteratively via the atanh power series:
 * ln(1 + y) = 2 * sum_{k=0..inf} u^(2k+1) / (2k+1), where u = y / (2 + y).
 *
 * @param {number} y - Finite number greater than -1 (ideally in [-0.3, 1]).
 * @returns {number} Natural logarithm of (1 + y).
 */
function ln1pIter(y) {
	if (y === 0) return 0
	const u = y / (2 + y)
	const u2 = u * u
	let term = u
	let sum = term
	for (let k = 1; k <= 64; k += 1) {
		term *= u2
		const delta = term / (2 * k + 1)
		const next = sum + delta
		if (next === sum) {
			break
		}
		sum = next
	}
	return 2 * sum
}

const SQRT2 = sqrtIter(2)
const SQRT1_2 = 1 / SQRT2
const LN2 = ln1pIter(1)

/**
 * Compute ln(x) for any positive finite number x iteratively via power-of-two
 * range reduction followed by the iterative ln1p series.
 *
 * @param {number} x - Positive finite number.
 * @returns {number} Natural logarithm of x.
 */
function lnIter(x) {
	let k = 0
	let scaled = x
	while (scaled >= 2) {
		scaled *= 0.5
		k += 1
	}
	while (scaled < 0.5) {
		scaled *= 2
		k -= 1
	}
	if (scaled > SQRT2) {
		scaled *= 0.5
		k += 1
	} else if (scaled < SQRT1_2) {
		scaled *= 2
		k -= 1
	}
	return ln1pIter(scaled - 1) + k * LN2
}

const LN10 = lnIter(10)

/**
 * Compute atan(t) for t in [0, 1] iteratively using repeated half-angle
 * reduction followed by the alternating Taylor series.
 *
 * @param {number} t - Non-negative finite number in [0, 1].
 * @returns {number} Arctangent of t in radians.
 */
function atanIter(t) {
	if (t === 0) return 0
	let reduced = t
	let scale = 1
	while (reduced > 0.125) {
		reduced = reduced / (1 + sqrtIter(1 + reduced * reduced))
		scale *= 2
	}
	const u2 = reduced * reduced
	let term = reduced
	let sum = term
	for (let k = 1; k <= 64; k += 1) {
		term = -term * u2
		const delta = term / (2 * k + 1)
		const next = sum + delta
		if (next === sum) {
			break
		}
		sum = next
	}
	return scale * sum
}

const PI = 4 * atanIter(1)
const HALF_PI = 0.5 * PI

/**
 * Compute the principal argument arg(re + i*im) in (-pi, pi] iteratively.
 *
 * @param {number} im - Imaginary part.
 * @param {number} re - Real part.
 * @returns {number} Principal argument in (-pi, pi].
 */
function argIter(im, re) {
	if (im === 0) {
		return re > 0 ? 0 : PI
	}
	if (re === 0) {
		return im > 0 ? HALF_PI : -HALF_PI
	}
	const absRe = re < 0 ? -re : re
	const absIm = im < 0 ? -im : im
	if (absRe >= absIm) {
		const theta = atanIter(absIm / absRe)
		if (re > 0) {
			return im > 0 ? theta : -theta
		}
		return im > 0 ? PI - theta : theta - PI
	}
	const phi = atanIter(absRe / absIm)
	if (re > 0) {
		return im > 0 ? HALF_PI - phi : phi - HALF_PI
	}
	return im > 0 ? HALF_PI + phi : -(HALF_PI + phi)
}

/**
 * Normalize -0 to 0.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Compute the principal base-10 logarithm of a complex number z = { re, im }
 * using a straightforward iterative implementation:
 *
 *   log10(z) = (ln(|z|) + i * arg(z)) / ln(10),  with arg(z) in (-pi, pi].
 *
 * Overflow and underflow in |z| are avoided by scaling by max(|re|, |im|),
 * and ln, atan, and sqrt are evaluated via iterative range reduction and series.
 *
 * @param {{ re: number, im: number }} z - Non-zero finite complex number.
 * @returns {{ re: number, im: number }} Principal base-10 logarithm of z.
 * @throws {TypeError} If z is not an object with numeric re and im properties.
 * @throws {RangeError} If re or im is non-finite, or if z is 0 + 0i.
 */
export function log10ComplexIterative(z) {
	if (typeof z !== 'object' || z === null || Array.isArray(z)) {
		throw new TypeError('Expected a complex number object { re, im }')
	}
	const { re, im } = z
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError('Complex number components re and im must be numbers')
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex number components re and im must be finite numbers')
	}
	if (re === 0 && im === 0) {
		throw new RangeError('log10ComplexIterative is undefined at 0 + 0i')
	}

	const absRe = re < 0 ? -re : re
	const absIm = im < 0 ? -im : im
	const maxAbs = absRe >= absIm ? absRe : absIm
	const ratio = absRe >= absIm ? absIm / absRe : absRe / absIm

	const lnModulus = lnIter(maxAbs) + 0.5 * ln1pIter(ratio * ratio)
	const argument = argIter(im, re)

	return {
		re: normalizeZero(lnModulus / LN10),
		im: normalizeZero(argument / LN10),
	}
}
