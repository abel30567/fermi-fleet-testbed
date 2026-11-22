/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {{ re: number, im: number }}
 */
function validateComplex(value, label) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${label} must be an object with numeric { re, im } properties`)
	}
	const { re, im } = value
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(`${label}.re and ${label}.im must be numbers`)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(`${label}.re and ${label}.im must be finite numbers`)
	}
	return { re, im }
}

/**
 * Normalizes -0 to 0.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Computes the complex gradient ∇f(point) of a scalar-valued function
 * f: C^n -> C at `point` using a straightforward iterative central-difference
 * approximation of the Wirtinger derivative.
 *
 * For each coordinate z_k = x_k + i*y_k, evaluates central differences along
 * the real and imaginary axes with step size `step`:
 *
 *   ∂f/∂z_k = (1 / 2) * (∂f/∂x_k - i * ∂f/∂y_k)
 *
 * For holomorphic functions this equals the standard complex partial
 * derivative vector [∂f/∂z_0, ..., ∂f/∂z_{n-1}]. For non-holomorphic smooth
 * functions it yields the exact Wirtinger gradient.
 *
 * @param {(z: Array<{ re: number, im: number }>) => { re: number, im: number }} fn
 *   Scalar-valued function taking an array of complex numbers `{ re, im }`
 *   and returning a complex number `{ re, im }`.
 * @param {Array<{ re: number, im: number }>} point
 *   Non-empty array of complex coordinates `{ re, im }` at which to compute
 *   the gradient. Neither `point` nor its elements are mutated.
 * @param {number} [step=1e-6]
 *   Positive finite step size for central finite differences.
 * @returns {Array<{ re: number, im: number }>}
 *   Gradient vector of length `point.length`, with each entry as `{ re, im }`.
 * @throws {TypeError} If `fn` is not a function, `point` is not an array,
 *   any coordinate or function output is not a `{ re, im }` numeric object,
 *   or `step` is not a number.
 * @throws {RangeError} If `point` is empty, `step` is not finite and positive,
 *   or any coordinate or function output has non-finite components.
 */
export function gradientComplexIterative(fn, point, step = 1e-6) {
	if (typeof fn !== 'function') {
		throw new TypeError('fn must be a function')
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be an array of complex numbers')
	}
	if (point.length === 0) {
		throw new RangeError('point must be a non-empty array')
	}
	if (typeof step !== 'number') {
		throw new TypeError('step must be a number')
	}
	if (!Number.isFinite(step) || step <= 0) {
		throw new RangeError('step must be a positive finite number')
	}

	const n = point.length
	const base = new Array(n)
	for (let i = 0; i < n; i++) {
		base[i] = validateComplex(point[i], `point[${i}]`)
	}

	const evalAt = (index, deltaRe, deltaIm) => {
		const args = new Array(n)
		for (let i = 0; i < n; i++) {
			args[i] = { re: base[i].re, im: base[i].im }
		}
		args[index].re += deltaRe
		args[index].im += deltaIm
		return validateComplex(fn(args), 'fn(z)')
	}

	const denom = 4 * step
	const grad = new Array(n)

	for (let k = 0; k < n; k++) {
		const fPlusX = evalAt(k, step, 0)
		const fMinusX = evalAt(k, -step, 0)
		const fPlusY = evalAt(k, 0, step)
		const fMinusY = evalAt(k, 0, -step)

		// ∂f/∂z_k = (1/2) * (∂f/∂x_k - i * ∂f/∂y_k)
		// Re(∂f/∂z_k) = ((fPlusX.re - fMinusX.re) + (fPlusY.im - fMinusY.im)) / (4 * step)
		// Im(∂f/∂z_k) = ((fPlusX.im - fMinusX.im) - (fPlusY.re - fMinusY.re)) / (4 * step)
		const re = ((fPlusX.re - fMinusX.re) + (fPlusY.im - fMinusY.im)) / denom
		const im = ((fPlusX.im - fMinusX.im) - (fPlusY.re - fMinusY.re)) / denom

		if (!Number.isFinite(re) || !Number.isFinite(im)) {
			throw new RangeError(`gradient component at index ${k} is not finite`)
		}

		grad[k] = {
			re: normalizeZero(re),
			im: normalizeZero(im),
		}
	}

	return grad
}
