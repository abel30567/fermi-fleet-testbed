/**
 * Normalizes negative zero (-0) to positive zero (+0).
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Constructs a complex number object avoiding -0 components.
 *
 * @param {number} re
 * @param {number} im
 * @returns {{ re: number, im: number }}
 */
function makeComplex(re, im) {
	return { re: normalizeZero(re), im: normalizeZero(im) }
}

/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric parts.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {{ re: number, im: number }}
 * @throws {TypeError} If value is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not a finite number.
 */
function validateComplex(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a complex object { re, im }`)
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`${label}.re and ${label}.im must be numbers`)
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`${label}.re and ${label}.im must be finite numbers`)
	}
	return makeComplex(value.re, value.im)
}

/**
 * Evaluates a complex Simpson's rule panel on a straight-line contour segment.
 *
 * @param {{ re: number, im: number }} dz - Total contour displacement z1 - z0.
 * @param {number} h - Parameter interval length (b - a) in [0, 1].
 * @param {{ re: number, im: number }} fa - f(z(a)).
 * @param {{ re: number, im: number }} fm - f(z((a + b) / 2)).
 * @param {{ re: number, im: number }} fb - f(z(b)).
 * @returns {{ re: number, im: number }}
 */
function simpsonPanel(dz, h, fa, fm, fb) {
	const sumRe = fa.re + 4 * fm.re + fb.re
	const sumIm = fa.im + 4 * fm.im + fb.im
	const scale = h / 6
	return {
		re: (dz.re * sumRe - dz.im * sumIm) * scale,
		im: (dz.re * sumIm + dz.im * sumRe) * scale,
	}
}

/**
 * Computes the complex line (contour) integral of `f(z)` along the straight-line
 * segment from `z0` to `z1` using recursive adaptive Simpson's rule (divide-and-conquer
 * quadrature with Richardson extrapolation).
 *
 * Parameterizing the contour as `z(t) = (1 - t) * z0 + t * z1` for `t` in `[0, 1]`,
 * the integral is evaluated as:
 *   `∫_{z0}^{z1} f(z) dz = (z1 - z0) * ∫_0^1 f(z(t)) dt`
 *
 * At each recursion step, the interval `[a, b]` is bisected into `[a, m]` and `[m, b]`.
 * If the modulus of the difference between the composite Simpson estimate and the coarse
 * Simpson estimate satisfies `|S_left + S_right - S| <= 15 * tol` (after reaching
 * `minDepth`), Richardson extrapolation `S_left + S_right + (S_left + S_right - S) / 15`
 * is returned; otherwise the algorithm recursively subdivides both halves with `tol / 2`.
 *
 * @param {(z: { re: number, im: number }) => { re: number, im: number }} f
 *   Complex-valued integrand function taking `{ re, im }` and returning `{ re, im }`.
 * @param {{ re: number, im: number }} z0
 *   Starting complex endpoint of the straight-line integration contour.
 * @param {{ re: number, im: number }} z1
 *   Ending complex endpoint of the straight-line integration contour.
 * @param {{ tolerance?: number, maxDepth?: number, minDepth?: number }} [options={}]
 *   Optional quadrature control parameters:
 *   - `tolerance`: positive finite error tolerance (default `1e-9`).
 *   - `maxDepth`: non-negative integer maximum recursion depth (default `20`).
 *   - `minDepth`: non-negative integer minimum recursion depth, `<= maxDepth`
 *     (default `Math.min(2, maxDepth)`).
 * @returns {{ re: number, im: number }}
 *   The approximated complex integral `{ re, im }` (with `-0` normalized to `0`).
 * @throws {TypeError} If `f` is not a function, `z0`/`z1`/`f(z)` are not valid complex
 *   objects, or `options` / its fields have invalid types.
 * @throws {RangeError} If complex coordinates/values are non-finite, `tolerance <= 0`
 *   or non-finite, `maxDepth`/`minDepth` are negative/non-integers or `minDepth > maxDepth`,
 *   or the computed integral overflows to a non-finite value.
 */
export function integralComplexRecursive(f, z0, z1, options = {}) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}

	const start = validateComplex(z0, 'z0')
	const end = validateComplex(z1, 'z1')

	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('options must be an object')
	}

	let tolerance = 1e-9
	if (options.tolerance !== undefined) {
		if (typeof options.tolerance !== 'number') {
			throw new TypeError('options.tolerance must be a number')
		}
		if (!Number.isFinite(options.tolerance) || options.tolerance <= 0) {
			throw new RangeError('options.tolerance must be a positive finite number')
		}
		tolerance = options.tolerance
	}

	let maxDepth = 20
	if (options.maxDepth !== undefined) {
		if (typeof options.maxDepth !== 'number') {
			throw new TypeError('options.maxDepth must be a number')
		}
		if (!Number.isInteger(options.maxDepth) || options.maxDepth < 0) {
			throw new RangeError('options.maxDepth must be a non-negative integer')
		}
		maxDepth = options.maxDepth
	}

	let minDepth = Math.min(2, maxDepth)
	if (options.minDepth !== undefined) {
		if (typeof options.minDepth !== 'number') {
			throw new TypeError('options.minDepth must be a number')
		}
		if (!Number.isInteger(options.minDepth) || options.minDepth < 0) {
			throw new RangeError('options.minDepth must be a non-negative integer')
		}
		if (options.minDepth > maxDepth) {
			throw new RangeError('options.minDepth must not exceed options.maxDepth')
		}
		minDepth = options.minDepth
	}

	const dz = {
		re: end.re - start.re,
		im: end.im - start.im,
	}
	if (!Number.isFinite(dz.re) || !Number.isFinite(dz.im)) {
		throw new RangeError('Contour displacement z1 - z0 overflowed to a non-finite value')
	}

	function evalAt(t) {
		const z =
			t === 0
				? makeComplex(start.re, start.im)
				: t === 1
					? makeComplex(end.re, end.im)
					: makeComplex(
							(1 - t) * start.re + t * end.re,
							(1 - t) * start.im + t * end.im,
						)
		return validateComplex(f(z), 'f(z)')
	}

	// Degenerate zero-length contour: still validate f(z0), then return 0 + 0i.
	if (dz.re === 0 && dz.im === 0) {
		evalAt(0)
		return { re: 0, im: 0 }
	}

	function adaptiveSimpson(a, b, fa, fm, fb, whole, tol, depth, remainingMinDepth) {
		const m = 0.5 * (a + b)
		const l = 0.5 * (a + m)
		const r = 0.5 * (m + b)

		if (l === a || l === m || r === m || r === b) {
			return whole
		}

		const fl = evalAt(l)
		const fr = evalAt(r)

		const halfH = m - a
		const left = simpsonPanel(dz, halfH, fa, fl, fm)
		const right = simpsonPanel(dz, b - m, fm, fr, fb)

		const sumRe = left.re + right.re
		const sumIm = left.im + right.im
		const deltaRe = sumRe - whole.re
		const deltaIm = sumIm - whole.im
		const errorEstimate = Math.hypot(deltaRe, deltaIm)

		if (!Number.isFinite(sumRe) || !Number.isFinite(sumIm) || !Number.isFinite(errorEstimate)) {
			throw new RangeError('Computed integral overflowed to a non-finite value')
		}

		if (depth <= 0 || (remainingMinDepth <= 0 && errorEstimate <= 15 * tol)) {
			return {
				re: sumRe + deltaRe / 15,
				im: sumIm + deltaIm / 15,
			}
		}

		const nextTol = tol * 0.5
		const nextDepth = depth - 1
		const nextMinDepth = remainingMinDepth > 0 ? remainingMinDepth - 1 : 0

		const leftIntegral = adaptiveSimpson(
			a,
			m,
			fa,
			fl,
			fm,
			left,
			nextTol,
			nextDepth,
			nextMinDepth,
		)
		const rightIntegral = adaptiveSimpson(
			m,
			b,
			fm,
			fr,
			fb,
			right,
			nextTol,
			nextDepth,
			nextMinDepth,
		)

		return {
			re: leftIntegral.re + rightIntegral.re,
			im: leftIntegral.im + rightIntegral.im,
		}
	}

	const f0 = evalAt(0)
	const fm = evalAt(0.5)
	const f1 = evalAt(1)
	const whole = simpsonPanel(dz, 1, f0, fm, f1)

	const result = adaptiveSimpson(0, 1, f0, fm, f1, whole, tolerance, maxDepth, minDepth)

	if (!Number.isFinite(result.re) || !Number.isFinite(result.im)) {
		throw new RangeError('Computed integral overflowed to a non-finite value')
	}

	return makeComplex(result.re, result.im)
}
