const DEFAULT_STEP = 1e-4

/**
 * Validate that a value is a finite complex number `{ re, im }`.
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
 * Evaluate `field(probe)` and validate that its output is a complex vector of length `dim`.
 *
 * @param {(z: Array<{ re: number, im: number }>) => Array<{ re: number, im: number }>} field
 * @param {Array<{ re: number, im: number }>} probe
 * @param {number} dim
 * @returns {Array<{ re: number, im: number }>}
 */
function evaluateField(field, probe, dim) {
	const result = field(probe)
	if (!Array.isArray(result)) {
		throw new TypeError('field must return an array of complex numbers { re, im }')
	}
	if (result.length !== dim) {
		throw new RangeError(
			`field returned vector of length ${result.length}, expected ${dim}`
		)
	}
	const validated = new Array(dim)
	for (let i = 0; i < dim; i++) {
		validated[i] = validateComplex(result[i], `field(z)[${i}]`)
	}
	return validated
}

/**
 * Compute the divergence of a complex vector field `F: C^n -> C^n` at `point`:
 *
 *   div(F)(z) = sum_{k=0}^{n-1} ∂F_k / ∂z_k
 *
 * Each partial derivative is evaluated via the Wirtinger operator
 *
 *   ∂F_k / ∂z_k = (1/2) * (∂F_k / ∂x_k - i * ∂F_k / ∂y_k),   z_k = x_k + i y_k
 *
 * using the 4th-order Taylor-series central difference stencil along both the
 * real and imaginary axes:
 *
 *   g'(0) = (-g(2h) + 8 g(h) - 8 g(-h) + g(-2h)) / (12 h) + O(h^4)
 *
 * For holomorphic vector fields this coincides with the holomorphic divergence
 * (trace of the complex Jacobian); for general smooth complex fields it gives
 * the exact Wirtinger divergence.
 *
 * @param {(z: Array<{ re: number, im: number }>) => Array<{ re: number, im: number }>} field
 *   Complex vector field mapping an n-element array of `{ re, im }` to an n-element array of `{ re, im }`.
 * @param {Array<{ re: number, im: number }>} point
 *   Non-empty evaluation point in C^n as an array of finite `{ re, im }` objects.
 * @param {{ h?: number }} [options]
 *   Optional configuration:
 *   - `h`: positive finite step size for the 4th-order central difference stencil (default `1e-4`).
 * @returns {{ re: number, im: number }}
 *   The complex divergence `{ re, im }` at `point`.
 */
export function divergenceComplexSeries(field, point, options = {}) {
	if (typeof field !== 'function') {
		throw new TypeError('field must be a function')
	}
	if (!Array.isArray(point)) {
		throw new TypeError('point must be a non-empty array of { re, im } objects')
	}
	const dim = point.length
	if (dim === 0) {
		throw new RangeError('point must be a non-empty array')
	}

	const basePoint = new Array(dim)
	for (let i = 0; i < dim; i++) {
		basePoint[i] = validateComplex(point[i], `point[${i}]`)
	}

	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}
	const h = options.h === undefined ? DEFAULT_STEP : options.h
	if (typeof h !== 'number') {
		throw new TypeError('options.h must be a number')
	}
	if (!Number.isFinite(h) || h <= 0) {
		throw new RangeError('options.h must be a positive finite number')
	}

	const denom = 12 * h
	let divRe = 0
	let divIm = 0

	/**
	 * Build a fresh perturbed point array with `z[k]` shifted by `(dre, dimShift)`.
	 */
	function evalComponent(k, dre, dimShift) {
		const probe = new Array(dim)
		for (let i = 0; i < dim; i++) {
			const c = basePoint[i]
			probe[i] = i === k
				? { re: c.re + dre, im: c.im + dimShift }
				: { re: c.re, im: c.im }
		}
		return evaluateField(field, probe, dim)[k]
	}

	for (let k = 0; k < dim; k++) {
		// 4th-order central difference along real axis (x_k)
		const fp2x = evalComponent(k, 2 * h, 0)
		const fp1x = evalComponent(k, h, 0)
		const fm1x = evalComponent(k, -h, 0)
		const fm2x = evalComponent(k, -2 * h, 0)

		const dxRe = (8 * (fp1x.re - fm1x.re) - (fp2x.re - fm2x.re)) / denom
		const dxIm = (8 * (fp1x.im - fm1x.im) - (fp2x.im - fm2x.im)) / denom

		// 4th-order central difference along imaginary axis (y_k)
		const fp2y = evalComponent(k, 0, 2 * h)
		const fp1y = evalComponent(k, 0, h)
		const fm1y = evalComponent(k, 0, -h)
		const fm2y = evalComponent(k, 0, -2 * h)

		const dyRe = (8 * (fp1y.re - fm1y.re) - (fp2y.re - fm2y.re)) / denom
		const dyIm = (8 * (fp1y.im - fm1y.im) - (fp2y.im - fm2y.im)) / denom

		// Wirtinger derivative: (1/2) * (∂F_k/∂x_k - i * ∂F_k/∂y_k)
		// -i * (dyRe + i*dyIm) = dyIm - i*dyRe
		divRe += 0.5 * (dxRe + dyIm)
		divIm += 0.5 * (dxIm - dyRe)
	}

	if (!Number.isFinite(divRe) || !Number.isFinite(divIm)) {
		throw new RangeError('divergence computation produced a non-finite result')
	}

	return {
		re: divRe === 0 ? 0 : divRe,
		im: divIm === 0 ? 0 : divIm,
	}
}
