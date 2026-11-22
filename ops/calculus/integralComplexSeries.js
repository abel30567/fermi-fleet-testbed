/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * @typedef {Object} IntegralComplexOptions
 * @property {number} [steps=128] Positive even integer controlling the subdivision count
 *   (partitioned into `steps / 2` Gauss-Legendre panels).
 */

/**
 * Closed-form 5-point Gauss-Legendre quadrature nodes and weights on [-1, 1],
 * derived from the roots of the degree-5 Legendre polynomial
 * P_5(x) = (1/8)(63x^5 - 70x^3 + 15x) and the Christoffel-Darboux weight identity.
 * Exact for polynomials up to degree 9 on every panel.
 */
const SQRT_10_OVER_7 = Math.sqrt(10 / 7)
const GL5_X1 = Math.sqrt(5 - 2 * SQRT_10_OVER_7) / 3
const GL5_X2 = Math.sqrt(5 + 2 * SQRT_10_OVER_7) / 3
const SQRT_70 = Math.sqrt(70)
const GL5_W0 = 128 / 225
const GL5_W1 = (322 + 13 * SQRT_70) / 900
const GL5_W2 = (322 - 13 * SQRT_70) / 900

const GL5_NODES = Object.freeze([-GL5_X2, -GL5_X1, 0, GL5_X1, GL5_X2])
const GL5_WEIGHTS = Object.freeze([GL5_W2, GL5_W1, GL5_W0, GL5_W1, GL5_W2])

const DEFAULT_STEPS = 128

/**
 * Validate that a value is a finite complex number `{ re, im }`.
 * @param {unknown} value
 * @param {string} name
 */
function assertComplex(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be a complex object { re, im }`)
	}
	const { re, im } = /** @type {Record<string, unknown>} */ (value)
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${name}.re and ${name}.im must be numbers`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${name}.re and ${name}.im must be finite numbers`)
	}
}

/**
 * Normalize -0 to +0.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Compute the complex contour integral of `fn` along the straight-line segment
 * from `a` to `b`:
 *
 *   integral_a^b f(z) dz = (b - a) * integral_0^1 f(a + t * (b - a)) dt
 *
 * Uses composite 5-point Gauss-Legendre quadrature (derived from the orthogonal
 * Legendre polynomial series P_5) over `steps / 2` uniform panels with Neumaier
 * compensated summation for high floating-point accuracy.
 *
 * @param {(z: Complex) => Complex} fn Complex-valued integrand mapping `{ re, im }` to `{ re, im }`.
 * @param {Complex} a Starting complex endpoint `{ re, im }`.
 * @param {Complex} b Ending complex endpoint `{ re, im }`.
 * @param {IntegralComplexOptions} [options] Optional integration settings.
 * @returns {Complex} Approximated complex integral `{ re, im }`.
 * @throws {TypeError} If `fn` is not a function, `a`/`b`/integrand outputs are not `{ re, im }`
 *   objects with numeric components, or `options` / `options.steps` has an invalid type.
 * @throws {RangeError} If `a`, `b`, or an integrand output has non-finite components, or if
 *   `options.steps` is not a positive even integer.
 */
export function integralComplexSeries(fn, a, b, options = {}) {
	if (typeof fn !== 'function') {
		throw new TypeError('fn must be a function')
	}
	assertComplex(a, 'a')
	assertComplex(b, 'b')

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be an object')
	}

	let steps = DEFAULT_STEPS
	if (options.steps !== undefined) {
		if (typeof options.steps !== 'number') {
			throw new TypeError('options.steps must be a number')
		}
		if (
			!Number.isInteger(options.steps) ||
			options.steps <= 0 ||
			options.steps % 2 !== 0
		) {
			throw new RangeError('options.steps must be a positive even integer')
		}
		steps = options.steps
	}

	const dzRe = b.re - a.re
	const dzIm = b.im - a.im
	if (dzRe === 0 && dzIm === 0) {
		return { re: 0, im: 0 }
	}

	const panels = steps / 2
	const panelWidth = 1 / panels
	const halfWidth = panelWidth / 2

	// Neumaier compensated summation for real and imaginary parts of integral_0^1 f(z(t)) dt
	let sumRe = 0
	let compRe = 0
	let sumIm = 0
	let compIm = 0

	for (let k = 0; k < panels; k++) {
		const tMid = (k + 0.5) * panelWidth
		for (let j = 0; j < 5; j++) {
			const t = tMid + halfWidth * GL5_NODES[j]
			const z = {
				re: a.re + t * dzRe,
				im: a.im + t * dzIm,
			}
			const fz = fn(z)
			assertComplex(fz, 'fn(z)')

			const w = GL5_WEIGHTS[j]
			const termRe = w * fz.re
			const nextRe = sumRe + termRe
			if (Math.abs(sumRe) >= Math.abs(termRe)) {
				compRe += (sumRe - nextRe) + termRe
			} else {
				compRe += (termRe - nextRe) + sumRe
			}
			sumRe = nextRe

			const termIm = w * fz.im
			const nextIm = sumIm + termIm
			if (Math.abs(sumIm) >= Math.abs(termIm)) {
				compIm += (sumIm - nextIm) + termIm
			} else {
				compIm += (termIm - nextIm) + sumIm
			}
			sumIm = nextIm
		}
	}

	const intRe = (sumRe + compRe) * halfWidth
	const intIm = (sumIm + compIm) * halfWidth

	// Multiply by dz = (b - a)
	const re = dzRe * intRe - dzIm * intIm
	const im = dzRe * intIm + dzIm * intRe

	return {
		re: normalizeZero(re),
		im: normalizeZero(im),
	}
}
