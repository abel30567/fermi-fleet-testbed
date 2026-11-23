/**
 * Compute the complex derivative f^(n)(z) of a holomorphic function at a complex
 * point z = { re, im } using the Cauchy integral formula discretized as a
 * discrete Fourier series (Lyness-Moler series identity) on a circle of radius r:
 *
 *   f^(n)(z) = (n! / (N * r^n)) * sum_{k=0}^{N-1} f(z + r * exp(2*pi*i*k/N)) * exp(-2*pi*i*n*k/N)
 *
 * Because f(z + r*e^{i*theta}) is 2*pi-periodic and analytic on an annulus around z,
 * all Taylor coefficients of order m < n cancel identically when N > n, and aliasing
 * errors decay exponentially as O((r / R)^N) where R is the distance to the nearest
 * singularity. For non-holomorphic smooth functions, the formula yields the Wirtinger
 * derivative (d/dz)^n f(z).
 *
 * @typedef {{ re: number, im: number }} Complex
 *
 * @typedef {object} DerivativeComplexSeriesOptions
 * @property {number} [order=1] Non-negative integer derivative order n.
 * @property {number} [radius] Positive sampling circle radius r around z.
 *   Defaults to min(0.1, 1e-3^(1 / order)) for order >= 1.
 * @property {number} [samples] Number of equally spaced roots-of-unity nodes N on
 *   the contour (must be an integer with samples > order). Defaults to max(16, 4 * order + 12).
 *
 * @param {(z: Complex) => Complex} f Complex-valued function mapping { re, im } -> { re, im }.
 * @param {Complex} z Complex point at which to differentiate.
 * @param {DerivativeComplexSeriesOptions} [options] Optional configuration.
 * @returns {Complex} The complex derivative f^(order)(z) as { re, im }.
 * @throws {TypeError} If arguments or function outputs have invalid types.
 * @throws {RangeError} If numeric parameters or function outputs are out of range or non-finite.
 */
export function derivativeComplexSeries(f, z, options = {}) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}

	const z0 = validateComplex(z, 'z')

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}

	const { order = 1, radius, samples } = options

	if (typeof order !== 'number') {
		throw new TypeError('options.order must be a number')
	}
	if (!Number.isInteger(order) || order < 0) {
		throw new RangeError('options.order must be a non-negative integer')
	}

	if (order === 0) {
		if (radius !== undefined) {
			validateRadius(radius)
		}
		if (samples !== undefined) {
			validateSamples(samples, order)
		}
		return validateComplex(f({ re: z0.re, im: z0.im }), 'f(z)')
	}

	const r = radius === undefined ? Math.min(0.1, Math.pow(1e-3, 1 / order)) : validateRadius(radius)
	const n = samples === undefined ? Math.max(16, order * 4 + 12) : validateSamples(samples, order)

	// Compute scale = order! / (n * r^order) iteratively to avoid premature overflow/underflow.
	let scale = 1 / n
	for (let j = 1; j <= order; j++) {
		scale = (scale * j) / r
		if (!Number.isFinite(scale)) {
			throw new RangeError('Derivative scale overflowed finite precision for the given order and radius')
		}
	}

	// Neumaier compensated summation for real and imaginary parts of the Fourier coefficient.
	let sumRe = 0
	let compRe = 0
	let sumIm = 0
	let compIm = 0

	const twoPiOverN = (2 * Math.PI) / n

	for (let k = 0; k < n; k++) {
		const theta = twoPiOverN * k
		const cosT = Math.cos(theta)
		const sinT = Math.sin(theta)

		const wk = {
			re: z0.re + r * cosT,
			im: z0.im + r * sinT,
		}
		const fk = validateComplex(f(wk), 'f(w)')

		// Multiply fk by exp(-i * order * theta) = cos(phi) - i * sin(phi),
		// reducing (order * k) mod n so phi stays in [0, 2*pi).
		const harmonicIndex = (order * k) % n
		const phi = twoPiOverN * harmonicIndex
		const cosP = Math.cos(phi)
		const sinP = Math.sin(phi)

		const termRe = fk.re * cosP + fk.im * sinP
		const termIm = fk.im * cosP - fk.re * sinP

		const nextRe = sumRe + termRe
		if (Math.abs(sumRe) >= Math.abs(termRe)) {
			compRe += (sumRe - nextRe) + termRe
		} else {
			compRe += (termRe - nextRe) + sumRe
		}
		sumRe = nextRe

		const nextIm = sumIm + termIm
		if (Math.abs(sumIm) >= Math.abs(termIm)) {
			compIm += (sumIm - nextIm) + termIm
		} else {
			compIm += (termIm - nextIm) + sumIm
		}
		sumIm = nextIm
	}

	const outRe = (sumRe + compRe) * scale
	const outIm = (sumIm + compIm) * scale

	if (!Number.isFinite(outRe) || !Number.isFinite(outIm)) {
		throw new RangeError('Computed complex derivative is not finite')
	}

	return {
		re: normalizeZero(outRe),
		im: normalizeZero(outIm),
	}
}

/**
 * Validate a complex number { re, im } and normalize -0 to 0.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Complex}
 */
function validateComplex(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object with numeric re and im properties`)
	}
	const { re, im } = /** @type {{ re: unknown, im: unknown }} */ (value)
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${label}.re and ${label}.im must be numbers`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${label}.re and ${label}.im must be finite numbers`)
	}
	return {
		re: normalizeZero(re),
		im: normalizeZero(im),
	}
}

/**
 * Validate sampling radius.
 *
 * @param {unknown} radius
 * @returns {number}
 */
function validateRadius(radius) {
	if (typeof radius !== 'number') {
		throw new TypeError('options.radius must be a number')
	}
	if (!Number.isFinite(radius) || radius <= 0) {
		throw new RangeError('options.radius must be a positive finite number')
	}
	return radius
}

/**
 * Validate contour sample count.
 *
 * @param {unknown} samples
 * @param {number} order
 * @returns {number}
 */
function validateSamples(samples, order) {
	if (typeof samples !== 'number') {
		throw new TypeError('options.samples must be a number')
	}
	if (!Number.isInteger(samples) || samples <= order || samples < 1) {
		throw new RangeError('options.samples must be an integer strictly greater than options.order')
	}
	return samples
}

/**
 * Normalize IEEE-754 negative zero to positive zero.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}
