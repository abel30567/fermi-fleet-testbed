/**
 * Validates that a value is a complex number object `{ re, im }` with finite
 * numeric components.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {{ re: number, im: number }}
 */
function validateComplex(value, label) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${label} must be an object with numeric re and im properties`)
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`${label}.re and ${label}.im must be numbers`)
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`${label}.re and ${label}.im must be finite numbers`)
	}
	return { re: value.re, im: value.im }
}

/**
 * Normalizes -0 components to +0 and ensures finite complex output.
 *
 * @param {{ re: number, im: number }} value
 * @returns {{ re: number, im: number }}
 */
function normalizeComplex(value) {
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError('Derivative evaluation produced a non-finite result')
	}
	return {
		re: value.re === 0 ? 0 : value.re,
		im: value.im === 0 ? 0 : value.im,
	}
}

/**
 * Precomputes signed binomial coefficients (-1)^(order - m) * C(order, m)
 * iteratively for symmetric central differences.
 *
 * @param {number} order
 * @returns {number[]}
 */
function centralDifferenceCoefficients(order) {
	const coeffs = new Array(order + 1)
	let binom = 1
	for (let m = 0; m <= order; m++) {
		const sign = (order - m) % 2 === 0 ? 1 : -1
		coeffs[m] = sign * binom
		binom = (binom * (order - m)) / (m + 1)
	}
	return coeffs
}

/**
 * Evaluates the symmetric central finite difference of order `order` with step
 * size `h` along the real axis at complex point `z`.
 *
 * @param {(z: { re: number, im: number }) => { re: number, im: number }} fn
 * @param {{ re: number, im: number }} z
 * @param {number} h
 * @param {number} order
 * @param {number[]} coeffs
 * @returns {{ re: number, im: number }}
 */
function centralDifference(fn, z, h, order, coeffs) {
	if (order === 1) {
		const fPlus = validateComplex(fn({ re: z.re + h, im: z.im }), 'fn(z + h)')
		const fMinus = validateComplex(fn({ re: z.re - h, im: z.im }), 'fn(z - h)')
		const denom = 2 * h
		return {
			re: (fPlus.re - fMinus.re) / denom,
			im: (fPlus.im - fMinus.im) / denom,
		}
	}

	let sumRe = 0
	let sumIm = 0
	const halfOrder = order / 2
	for (let m = 0; m <= order; m++) {
		const delta = (m - halfOrder) * h
		const sample = validateComplex(fn({ re: z.re + delta, im: z.im }), 'fn(z + delta)')
		const weight = coeffs[m]
		sumRe += weight * sample.re
		sumIm += weight * sample.im
	}

	const denom = Math.pow(h, order)
	return {
		re: sumRe / denom,
		im: sumIm / denom,
	}
}

/**
 * Computes the numerical derivative of a complex-valued function `fn(z)` at a
 * complex point `z = { re, im }` using an iterative Richardson extrapolation
 * algorithm over symmetric central finite differences.
 *
 * For a holomorphic function `f: C -> C`, the complex derivative `f^(n)(z)`
 * equals the directional derivative along the real axis. Each iteration halves
 * the step size `h` and updates the Richardson extrapolation table in O(k)
 * space without recursion, tracking the lowest-error estimate to guard against
 * floating-point cancellation.
 *
 * @param {(z: { re: number, im: number }) => { re: number, im: number }} fn
 *   Complex function to differentiate. Must accept `{ re, im }` and return
 *   `{ re, im }` with finite numeric components.
 * @param {{ re: number, im: number }} z
 *   Complex point `{ re, im }` at which to compute the derivative.
 * @param {object} [options]
 *   Optional configuration object.
 * @param {number} [options.h]
 *   Initial positive finite step size. Defaults to `1e-3` for `order === 1`,
 *   or `Math.min(0.25, Math.pow(1e-4, 1 / order))` for higher orders.
 * @param {number} [options.order=1]
 *   Positive integer order of the derivative (`1 <= order <= 10`).
 * @param {number} [options.maxIterations=8]
 *   Maximum number of Richardson extrapolation iterations (`1 <= maxIterations <= 20`).
 * @param {number} [options.tolerance=1e-10]
 *   Non-negative finite convergence tolerance for successive estimates.
 * @returns {{ re: number, im: number }}
 *   Approximated complex derivative `{ re, im }`.
 * @throws {TypeError} If `fn` is not a function, `z` or `fn`'s return value is
 *   not a `{ re, im }` numeric object, or `options` / option types are invalid.
 * @throws {RangeError} If `z` or `fn`'s return value has non-finite components,
 *   or if `h`, `order`, `maxIterations`, or `tolerance` are out of bounds.
 */
export function derivativeComplexIterative(fn, z, options = {}) {
	if (typeof fn !== 'function') {
		throw new TypeError('fn must be a function')
	}

	const point = validateComplex(z, 'z')

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}

	const order = options.order === undefined ? 1 : options.order
	if (typeof order !== 'number') {
		throw new TypeError('options.order must be a number')
	}
	if (!Number.isInteger(order) || order < 1 || order > 10) {
		throw new RangeError('options.order must be an integer between 1 and 10')
	}

	const maxIterations = options.maxIterations === undefined ? 8 : options.maxIterations
	if (typeof maxIterations !== 'number') {
		throw new TypeError('options.maxIterations must be a number')
	}
	if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 20) {
		throw new RangeError('options.maxIterations must be an integer between 1 and 20')
	}

	const tolerance = options.tolerance === undefined ? 1e-10 : options.tolerance
	if (typeof tolerance !== 'number') {
		throw new TypeError('options.tolerance must be a number')
	}
	if (!Number.isFinite(tolerance) || tolerance < 0) {
		throw new RangeError('options.tolerance must be a finite non-negative number')
	}

	let h =
		options.h === undefined
			? order === 1
				? 1e-3
				: Math.min(0.25, Math.pow(1e-4, 1 / order))
			: options.h
	if (typeof h !== 'number') {
		throw new TypeError('options.h must be a number')
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('options.h must be a finite positive number')
	}

	const coeffs = order === 1 ? [] : centralDifferenceCoefficients(order)

	let prevRow = [centralDifference(fn, point, h, order, coeffs)]
	let best = prevRow[0]
	let bestError = Infinity

	for (let k = 1; k < maxIterations; k++) {
		const nextH = h / 2
		if (nextH === 0 || (point.re + nextH === point.re && point.re - nextH === point.re)) {
			break
		}
		h = nextH

		const currRow = new Array(k + 1)
		currRow[0] = centralDifference(fn, point, h, order, coeffs)

		let factor = 4
		for (let j = 1; j <= k; j++) {
			const denom = factor - 1
			const re = currRow[j - 1].re + (currRow[j - 1].re - prevRow[j - 1].re) / denom
			const im = currRow[j - 1].im + (currRow[j - 1].im - prevRow[j - 1].im) / denom
			currRow[j] = { re, im }
			factor *= 4

			const errPrev = Math.hypot(re - prevRow[j - 1].re, im - prevRow[j - 1].im)
			const errCurr = Math.hypot(re - currRow[j - 1].re, im - currRow[j - 1].im)
			const err = Math.max(errPrev, errCurr)

			if (err <= bestError) {
				bestError = err
				best = currRow[j]
			}
		}

		const scale = Math.max(1, Math.hypot(best.re, best.im))
		if (bestError <= tolerance * scale) {
			break
		}

		const diagDiff = Math.hypot(
			currRow[k].re - prevRow[k - 1].re,
			currRow[k].im - prevRow[k - 1].im,
		)
		if (k >= 2 && diagDiff > 2 * bestError) {
			break
		}

		prevRow = currRow
	}

	return normalizeComplex(best)
}
