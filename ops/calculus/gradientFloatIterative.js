/**
 * Default step size for central finite differences over IEEE-754 float64 values.
 * Chosen near cbrt(Number.EPSILON) (~6.05e-6) to balance truncation and rounding error.
 */
const DEFAULT_STEP = 1e-6

/**
 * Computes the numerical gradient of a multivariate scalar field `f` at `point`
 * using an iterative central finite-difference scheme over IEEE-754 float64 Numbers.
 *
 * For each coordinate `i` of `point`, the partial derivative is approximated as:
 *   `df/dx_i ≈ (f(x + h * e_i) - f(x - h * e_i)) / ((x_i + h) - (x_i - h))`
 *
 * The input `point` array is never mutated.
 *
 * @param {(x: number[]) => number} f - Scalar field mapping a coordinate array to a finite float64 number.
 * @param {readonly number[]} point - Non-empty array of finite numbers representing the evaluation point.
 * @param {number} [h=1e-6] - Optional strictly positive finite step size for central differences.
 * @returns {number[]} Gradient vector of the same dimension as `point`.
 * @throws {TypeError} If `f` is not a function, `point` is not an array of numbers, `h` is not a number (when provided), or `f` returns a non-number.
 * @throws {RangeError} If `point` is empty or contains non-finite numbers, `h` is not finite and positive, `h` underflows relative to a coordinate, or `f`/derivative produces a non-finite value.
 */
export function gradientFloatIterative(f, point, h = DEFAULT_STEP) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}

	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array of finite numbers')
	}

	const dim = point.length
	if (dim === 0) {
		throw new RangeError('point must be a non-empty array')
	}

	for (let i = 0; i < dim; i++) {
		if (!(i in point) || typeof point[i] !== 'number') {
			throw new TypeError(`point[${i}] must be a finite number`)
		}
		if (!Number.isFinite(point[i])) {
			throw new RangeError(`point[${i}] must be a finite number`)
		}
	}

	if (typeof h !== 'number') {
		throw new TypeError('h must be a positive finite number')
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('h must be a positive finite number')
	}

	const grad = new Array(dim)
	const probe = point.slice()

	for (let i = 0; i < dim; i++) {
		const original = point[i]
		const xPlus = original + h
		const xMinus = original - h
		const span = xPlus - xMinus

		if (!Number.isFinite(xPlus) || !Number.isFinite(xMinus) || !Number.isFinite(span) || span === 0) {
			throw new RangeError(`Step size h=${h} is not representable at point[${i}]=${original}`)
		}

		probe[i] = xPlus
		const fPlus = f(probe)
		if (typeof fPlus !== 'number') {
			throw new TypeError('f must return a finite number')
		}
		if (!Number.isFinite(fPlus)) {
			throw new RangeError(`f returned a non-finite value (${fPlus}) at +h perturbation of coordinate ${i}`)
		}

		probe[i] = xMinus
		const fMinus = f(probe)
		if (typeof fMinus !== 'number') {
			throw new TypeError('f must return a finite number')
		}
		if (!Number.isFinite(fMinus)) {
			throw new RangeError(`f returned a non-finite value (${fMinus}) at -h perturbation of coordinate ${i}`)
		}

		probe[i] = original

		const partial = (fPlus - fMinus) / span
		if (!Number.isFinite(partial)) {
			throw new RangeError(`Computed partial derivative at coordinate ${i} is not finite`)
		}
		grad[i] = partial === 0 ? 0 : partial
	}

	return grad
}
