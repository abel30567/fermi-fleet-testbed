/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * @typedef {object} GradientComplexSeriesOptions
 * @property {number} [radius=1e-3] - Radius of the contour circle in the complex plane (must be finite and > 0).
 * @property {number} [samples=16] - Number of roots-of-unity quadrature points on the contour (integer >= 2).
 */

/**
 * Validates that a value is a finite complex number `{ re, im }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Complex}
 */
function assertComplex(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object with numeric { re, im } properties`)
	}
	const { re, im } = /** @type {Record<string, unknown>} */ (value)
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${label}.re and ${label}.im must be numbers`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${label}.re and ${label}.im must be finite numbers`)
	}
	return { re, im }
}

/**
 * Normalizes IEEE-754 negative zero to positive zero.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Computes the complex gradient ∇f(z) = (∂f/∂z_0, ..., ∂f/∂z_{n-1}) of a
 * complex-valued function f: C^n -> C at `point`, using Cauchy's integral
 * formula discretized as a roots-of-unity Fourier series (Lyness-Moler identity):
 *
 *   ∂f/∂z_j(z) = (1 / (M * r)) * sum_{k=0}^{M-1} (f(z + r * w^k * e_j) - f(z)) * w^{-k}
 *
 * where w = exp(2*pi*i / M). By orthogonality of roots of unity, all Taylor
 * series terms of degree 0 and 2..M cancel identically, yielding O(r^M)
 * truncation error for holomorphic functions (exact up to rounding for
 * polynomials of degree <= M) and computing the Wirtinger derivative ∂f/∂z_j
 * for smooth non-holomorphic functions.
 *
 * @param {(z: Complex[]) => Complex} fn - Function mapping a complex vector `Complex[]` to a `Complex` value `{ re, im }`.
 * @param {Complex[]} point - Evaluation point in C^n as an array of `{ re, im }` objects.
 * @param {GradientComplexSeriesOptions} [options] - Optional series quadrature parameters.
 * @returns {Complex[]} The complex gradient vector at `point`, with one `{ re, im }` entry per coordinate.
 */
export function gradientComplexSeries(fn, point, options = {}) {
	if (typeof fn !== 'function') {
		throw new TypeError('fn must be a function')
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array of { re, im } complex numbers')
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}

	const { radius = 1e-3, samples = 16 } = options

	if (typeof radius !== 'number') {
		throw new TypeError('options.radius must be a number')
	}
	if (!Number.isFinite(radius) || radius <= 0) {
		throw new RangeError('options.radius must be a finite positive number')
	}

	if (typeof samples !== 'number') {
		throw new TypeError('options.samples must be a number')
	}
	if (!Number.isInteger(samples) || samples < 2) {
		throw new RangeError('options.samples must be an integer >= 2')
	}

	const n = point.length
	/** @type {Complex[]} */
	const basePoint = new Array(n)
	for (let j = 0; j < n; j++) {
		basePoint[j] = assertComplex(point[j], `point[${j}]`)
	}

	if (n === 0) {
		return []
	}

	// Evaluate f(z) once so constant terms cancel identically in the series sum.
	const baseVal = assertComplex(
		fn(basePoint.map((c) => ({ re: c.re, im: c.im }))),
		'fn(point)'
	)

	// Precompute M-th roots of unity: cos(2*pi*k/M), sin(2*pi*k/M).
	const cosTable = new Float64Array(samples)
	const sinTable = new Float64Array(samples)
	const angleStep = (2 * Math.PI) / samples
	for (let k = 0; k < samples; k++) {
		const theta = angleStep * k
		cosTable[k] = Math.cos(theta)
		sinTable[k] = Math.sin(theta)
	}

	const scale = 1 / (samples * radius)
	/** @type {Complex[]} */
	const grad = new Array(n)

	for (let j = 0; j < n; j++) {
		let sumRe = 0
		let sumIm = 0
		const zj = basePoint[j]

		for (let k = 0; k < samples; k++) {
			const c = cosTable[k]
			const s = sinTable[k]

			// Build probe point z + r * exp(i * theta_k) * e_j without mutating caller input.
			const probe = basePoint.map((coord) => ({ re: coord.re, im: coord.im }))
			probe[j] = {
				re: zj.re + radius * c,
				im: zj.im + radius * s,
			}

			const val = assertComplex(fn(probe), `fn(probe[${j},${k}])`)
			const diffRe = val.re - baseVal.re
			const diffIm = val.im - baseVal.im

			// Multiply (diffRe + i*diffIm) by exp(-i*theta_k) = (c - i*s).
			sumRe += diffRe * c + diffIm * s
			sumIm += diffIm * c - diffRe * s
		}

		grad[j] = {
			re: normalizeZero(sumRe * scale),
			im: normalizeZero(sumIm * scale),
		}
	}

	return grad
}
