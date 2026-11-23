/**
 * Validates that a value is a finite complex number represented as `{ re, im }`.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} label - Parameter or context name for error messages.
 * @returns {{ re: number, im: number }} Validated complex number.
 * @throws {TypeError} If `value` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not finite (`NaN`, `Infinity`, or `-Infinity`).
 */
function assertComplex(value, label) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${label} must be a complex number object { re, im }`)
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
 * Parses and validates integration options (either a step count or an options object).
 *
 * @param {number | { steps?: number, method?: 'simpson' | 'trapezoid' | 'midpoint' } | undefined} stepsOrOptions
 * @returns {{ steps: number, method: 'simpson' | 'trapezoid' | 'midpoint' }}
 */
function parseOptions(stepsOrOptions) {
	if (stepsOrOptions === undefined) {
		return { steps: 1000, method: 'simpson' }
	}

	let steps = 1000
	let method = 'simpson'

	if (typeof stepsOrOptions === 'number') {
		steps = stepsOrOptions
	} else if (
		typeof stepsOrOptions === 'object' &&
		stepsOrOptions !== null &&
		!Array.isArray(stepsOrOptions)
	) {
		if (stepsOrOptions.steps !== undefined) {
			if (typeof stepsOrOptions.steps !== 'number') {
				throw new TypeError('options.steps must be a number')
			}
			steps = stepsOrOptions.steps
		}
		if (stepsOrOptions.method !== undefined) {
			if (typeof stepsOrOptions.method !== 'string') {
				throw new TypeError('options.method must be a string')
			}
			method = stepsOrOptions.method
		}
	} else {
		throw new TypeError(
			'stepsOrOptions must be a positive integer or an options object { steps, method }'
		)
	}

	if (!Number.isInteger(steps) || steps < 1 || !Number.isSafeInteger(steps)) {
		throw new RangeError('steps must be a positive safe integer')
	}

	if (method !== 'simpson' && method !== 'trapezoid' && method !== 'midpoint') {
		throw new RangeError(
			`Unsupported integration method "${method}"; expected "simpson", "trapezoid", or "midpoint"`
		)
	}

	return { steps, method }
}

/**
 * Evaluates the complex integrand and validates its return value.
 *
 * @param {(z: { re: number, im: number }) => { re: number, im: number }} fn
 * @param {number} re
 * @param {number} im
 * @returns {{ re: number, im: number }}
 */
function evalIntegrand(fn, re, im) {
	return assertComplex(fn({ re, im }), 'fn(z)')
}

/**
 * Normalizes `-0` to `0`.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Computes the definite / straight-line contour integral of a complex-valued function
 * along the line segment from `a` to `b` in the complex plane using a straightforward
 * iterative composite quadrature rule:
 *
 *   ∫_a^b f(z) dz = (b - a) ∫_0^1 f(a + t(b - a)) dt
 *
 * Complex numbers are represented as plain objects `{ re, im }`.
 *
 * @param {(z: { re: number, im: number }) => { re: number, im: number }} fn
 *   Integrand mapping a complex number `{ re, im }` to a complex number `{ re, im }`.
 * @param {{ re: number, im: number }} a
 *   Lower limit / starting point of the straight-line contour in the complex plane.
 * @param {{ re: number, im: number }} b
 *   Upper limit / ending point of the straight-line contour in the complex plane.
 * @param {number | { steps?: number, method?: 'simpson' | 'trapezoid' | 'midpoint' }} [stepsOrOptions=1000]
 *   Number of subintervals (positive integer) or an options object:
 *   - `steps` (default `1000`): number of equal subintervals along `[a, b]`.
 *   - `method` (default `'simpson'`): `'simpson'` (composite Simpson's rule, O(h^4)),
 *     `'trapezoid'` (composite trapezoidal rule, O(h^2)), or
 *     `'midpoint'` (composite midpoint rule, O(h^2)).
 * @returns {{ re: number, im: number }} Approximate complex integral `{ re, im }`.
 * @throws {TypeError} If `fn` is not a function, endpoints/options have invalid types,
 *   or `fn(z)` does not return `{ re, im }` with numeric fields.
 * @throws {RangeError} If any coordinate is non-finite, `steps` is not a positive safe
 *   integer, `method` is unknown, or the computed integral overflows to non-finite values.
 */
export function integralComplexIterative(fn, a, b, stepsOrOptions = 1000) {
	if (typeof fn !== 'function') {
		throw new TypeError('fn must be a function')
	}

	const start = assertComplex(a, 'a')
	const end = assertComplex(b, 'b')
	const { steps, method } = parseOptions(stepsOrOptions)

	const dzRe = end.re - start.re
	const dzIm = end.im - start.im

	let avgRe = 0
	let avgIm = 0

	if (method === 'simpson') {
		const fStart = evalIntegrand(fn, start.re, start.im)
		const fEnd = evalIntegrand(fn, end.re, end.im)

		let sumRe = fStart.re + fEnd.re
		let sumIm = fStart.im + fEnd.im

		for (let i = 1; i < steps; i++) {
			const t = i / steps
			const fNode = evalIntegrand(fn, start.re + t * dzRe, start.im + t * dzIm)
			sumRe += 2 * fNode.re
			sumIm += 2 * fNode.im
		}

		for (let i = 0; i < steps; i++) {
			const t = (i + 0.5) / steps
			const fMid = evalIntegrand(fn, start.re + t * dzRe, start.im + t * dzIm)
			sumRe += 4 * fMid.re
			sumIm += 4 * fMid.im
		}

		const denom = 6 * steps
		avgRe = sumRe / denom
		avgIm = sumIm / denom
	} else if (method === 'trapezoid') {
		const fStart = evalIntegrand(fn, start.re, start.im)
		const fEnd = evalIntegrand(fn, end.re, end.im)

		let sumRe = 0.5 * (fStart.re + fEnd.re)
		let sumIm = 0.5 * (fStart.im + fEnd.im)

		for (let i = 1; i < steps; i++) {
			const t = i / steps
			const fNode = evalIntegrand(fn, start.re + t * dzRe, start.im + t * dzIm)
			sumRe += fNode.re
			sumIm += fNode.im
		}

		avgRe = sumRe / steps
		avgIm = sumIm / steps
	} else {
		let sumRe = 0
		let sumIm = 0

		for (let i = 0; i < steps; i++) {
			const t = (i + 0.5) / steps
			const fMid = evalIntegrand(fn, start.re + t * dzRe, start.im + t * dzIm)
			sumRe += fMid.re
			sumIm += fMid.im
		}

		avgRe = sumRe / steps
		avgIm = sumIm / steps
	}

	// Complex product: avg * dz = (avgRe + i*avgIm) * (dzRe + i*dzIm)
	const re = avgRe * dzRe - avgIm * dzIm
	const im = avgRe * dzIm + avgIm * dzRe

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Computed integral overflowed to a non-finite value')
	}

	return {
		re: normalizeZero(re),
		im: normalizeZero(im),
	}
}
