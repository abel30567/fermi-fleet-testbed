/**
 * Numerical contour integration over complex numbers using recursive
 * divide-and-conquer adaptive Simpson's rule.
 *
 * @module ops/calculus/integralComplexRecursive
 */

/**
 * @typedef {object} Complex
 * @property {number} re - Real part (finite number).
 * @property {number} im - Imaginary part (finite number).
 */

/**
 * @typedef {object} IntegralComplexOptions
 * @property {number} [tolerance=1e-9] - Desired absolute error tolerance (> 0).
 * @property {number} [maxDepth=20] - Maximum recursion depth (integer >= 0).
 * @property {number} [minDepth=2] - Minimum recursion depth before accepting convergence (integer, 0 <= minDepth <= maxDepth).
 */

/**
 * Validates that a value is a well-formed complex number `{ re, im }` with finite components.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Complex}
 */
function validateComplex(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be a complex number object { re, im }`)
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
 * Validates and normalizes integration options.
 *
 * @param {unknown} options
 * @returns {{ tolerance: number, maxDepth: number, minDepth: number }}
 */
function validateOptions(options) {
	if (options === undefined) {
		return { tolerance: 1e-9, maxDepth: 20, minDepth: 2 }
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}

	const opts = /** @type {Record<string, unknown>} */ (options)

	let tolerance = 1e-9
	if (opts.tolerance !== undefined) {
		if (typeof opts.tolerance !== 'number') {
			throw new TypeError('options.tolerance must be a number')
		}
		if (!Number.isFinite(opts.tolerance) || opts.tolerance <= 0) {
			throw new RangeError('options.tolerance must be a finite positive number')
		}
		tolerance = opts.tolerance
	}

	let maxDepth = 20
	if (opts.maxDepth !== undefined) {
		if (typeof opts.maxDepth !== 'number') {
			throw new TypeError('options.maxDepth must be a number')
		}
		if (!Number.isInteger(opts.maxDepth) || opts.maxDepth < 0) {
			throw new RangeError('options.maxDepth must be a non-negative integer')
		}
		maxDepth = opts.maxDepth
	}

	let minDepth = Math.min(2, maxDepth)
	if (opts.minDepth !== undefined) {
		if (typeof opts.minDepth !== 'number') {
			throw new TypeError('options.minDepth must be a number')
		}
		if (!Number.isInteger(opts.minDepth) || opts.minDepth < 0 || opts.minDepth > maxDepth) {
			throw new RangeError('options.minDepth must be an integer between 0 and maxDepth')
		}
		minDepth = opts.minDepth
	}

	return { tolerance, maxDepth, minDepth }
}

/**
 * Normalizes `-0` to `0`.
 *
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * @param {Complex} u
 * @param {Complex} v
 * @returns {Complex}
 */
function complexAdd(u, v) {
	return { re: u.re + v.re, im: u.im + v.im }
}

/**
 * @param {Complex} u
 * @param {Complex} v
 * @returns {Complex}
 */
function complexSub(u, v) {
	return { re: u.re - v.re, im: u.im - v.im }
}

/**
 * @param {Complex} u
 * @param {Complex} v
 * @returns {Complex}
 */
function complexMul(u, v) {
	return {
		re: u.re * v.re - u.im * v.im,
		im: u.re * v.im + u.im * v.re,
	}
}

/**
 * @param {Complex} u
 * @param {number} s
 * @returns {Complex}
 */
function complexScale(u, s) {
	return { re: u.re * s, im: u.im * s }
}

/**
 * @param {Complex} u
 * @param {Complex} v
 * @returns {Complex}
 */
function complexMidpoint(u, v) {
	return { re: (u.re + v.re) / 2, im: (u.im + v.im) / 2 }
}

/**
 * @param {Complex} u
 * @returns {number}
 */
function complexAbs(u) {
	return Math.hypot(u.re, u.im)
}

/**
 * Evaluates the complex integrand and validates its output.
 *
 * @param {(z: Complex) => Complex} fn
 * @param {Complex} z
 * @returns {Complex}
 */
function evalIntegrand(fn, z) {
	const value = fn({ re: z.re, im: z.im })
	return validateComplex(value, 'fn(z)')
}

/**
 * Computes Simpson's 1/3 estimate on the straight-line complex segment `[z0, z1]`:
 * `((z1 - z0) / 6) * (f(z0) + 4 * f(zm) + f(z1))`.
 *
 * @param {Complex} z0
 * @param {Complex} z1
 * @param {Complex} f0
 * @param {Complex} fm
 * @param {Complex} f1
 * @returns {Complex}
 */
function simpsonSegment(z0, z1, f0, fm, f1) {
	const dz = complexSub(z1, z0)
	const weightedSum = {
		re: f0.re + 4 * fm.re + f1.re,
		im: f0.im + 4 * fm.im + f1.im,
	}
	return complexScale(complexMul(dz, weightedSum), 1 / 6)
}

/**
 * Recursive divide-and-conquer adaptive Simpson integration over `[z0, z1]`.
 *
 * @param {(z: Complex) => Complex} fn
 * @param {Complex} z0
 * @param {Complex} z1
 * @param {Complex} f0
 * @param {Complex} fm
 * @param {Complex} f1
 * @param {Complex} whole
 * @param {number} tol
 * @param {number} remainingDepth
 * @param {number} remainingMinDepth
 * @returns {Complex}
 */
function adaptiveSimpson(fn, z0, z1, f0, fm, f1, whole, tol, remainingDepth, remainingMinDepth) {
	if (remainingDepth <= 0) {
		return whole
	}

	const zm = complexMidpoint(z0, z1)
	const zlm = complexMidpoint(z0, zm)
	const zrm = complexMidpoint(zm, z1)

	// Guard against floating-point underflow where sub-midpoints collapse to endpoints.
	if (
		(zlm.re === z0.re && zlm.im === z0.im) ||
		(zrm.re === z1.re && zrm.im === z1.im)
	) {
		return whole
	}

	const flm = evalIntegrand(fn, zlm)
	const frm = evalIntegrand(fn, zrm)

	const left = simpsonSegment(z0, zm, f0, flm, fm)
	const right = simpsonSegment(zm, z1, fm, frm, f1)
	const combined = complexAdd(left, right)
	const delta = complexSub(combined, whole)

	if ((remainingMinDepth <= 0 && complexAbs(delta) <= 15 * tol) || remainingDepth === 1) {
		return complexAdd(combined, complexScale(delta, 1 / 15))
	}

	const leftIntegral = adaptiveSimpson(
		fn,
		z0,
		zm,
		f0,
		flm,
		fm,
		left,
		tol / 2,
		remainingDepth - 1,
		remainingMinDepth - 1,
	)
	const rightIntegral = adaptiveSimpson(
		fn,
		zm,
		z1,
		fm,
		frm,
		f1,
		right,
		tol / 2,
		remainingDepth - 1,
		remainingMinDepth - 1,
	)
	return complexAdd(leftIntegral, rightIntegral)
}

/**
 * Computes the definite complex contour integral of `fn` along the straight-line
 * segment from `a` to `b` in the complex plane using recursive divide-and-conquer
 * adaptive Simpson's rule with Richardson extrapolation.
 *
 * @param {(z: Complex) => Complex} fn - Complex integrand mapping `{ re, im }` to `{ re, im }`.
 * @param {Complex} a - Starting point of the integration path.
 * @param {Complex} b - Ending point of the integration path.
 * @param {IntegralComplexOptions} [options] - Optional tolerance and recursion depth controls.
 * @returns {Complex} The approximated complex integral `{ re, im }`.
 * @throws {TypeError} If `fn`, `a`, `b`, `options`, or any value returned by `fn` has an invalid type.
 * @throws {RangeError} If any complex component or option is non-finite or out of valid bounds.
 */
export function integralComplexRecursive(fn, a, b, options) {
	if (typeof fn !== 'function') {
		throw new TypeError('fn must be a function')
	}

	const start = validateComplex(a, 'a')
	const end = validateComplex(b, 'b')
	const { tolerance, maxDepth, minDepth } = validateOptions(options)

	if (start.re === end.re && start.im === end.im) {
		return { re: 0, im: 0 }
	}

	const mid = complexMidpoint(start, end)
	const fa = evalIntegrand(fn, start)
	const fm = evalIntegrand(fn, mid)
	const fb = evalIntegrand(fn, end)

	const whole = simpsonSegment(start, end, fa, fm, fb)
	const raw = adaptiveSimpson(fn, start, end, fa, fm, fb, whole, tolerance, maxDepth, minDepth)

	if (!Number.isFinite(raw.re) || !Number.isFinite(raw.im)) {
		throw new RangeError('integral result overflowed to a non-finite value')
	}

	return {
		re: normalizeZero(raw.re),
		im: normalizeZero(raw.im),
	}
}
