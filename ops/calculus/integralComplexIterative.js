/**
 * Validates that a value is a finite complex number object `{ re, im }`.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} name - Parameter or result name for error messages.
 * @returns {{ re: number, im: number }} The validated complex object.
 * @throws {TypeError} If `value` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not a finite number.
 */
function validateComplex(value, name) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(`${name} must be a complex number object { re, im }`)
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`${name}.re and ${name}.im must be numbers`)
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`${name}.re and ${name}.im must be finite numbers`)
	}
	return value
}

/**
 * Computes the definite complex line integral of `f(z)` along the straight-line
 * segment from `a` to `b` in the complex plane using an iterative composite
 * Simpson's rule.
 *
 * Parameterizes the contour as `z(t) = a + t * (b - a)` for `t` in `[0, 1]` and
 * evaluates `(b - a) * ∫₀¹ f(z(t)) dt` over `steps` equal subintervals.
 *
 * @param {(z: { re: number, im: number }) => { re: number, im: number }} f - Integrand mapping `{ re, im }` to `{ re, im }`.
 * @param {{ re: number, im: number }} a - Lower complex limit of integration.
 * @param {{ re: number, im: number }} b - Upper complex limit of integration.
 * @param {number} [steps=1000] - Number of subintervals (positive safe integer).
 * @returns {{ re: number, im: number }} The approximated complex integral `{ re, im }`.
 * @throws {TypeError} If `f` is not a function, `a`/`b`/`f(z)` is not a `{ re, im }` object with numeric parts, or `steps` is not a number.
 * @throws {RangeError} If any complex component is non-finite, `steps` is not a positive safe integer, or the result overflows.
 */
export function integralComplexIterative(f, a, b, steps = 1000) {
	if (typeof f !== 'function') {
		throw new TypeError('f must be a function')
	}
	validateComplex(a, 'a')
	validateComplex(b, 'b')
	if (typeof steps !== 'number') {
		throw new TypeError('steps must be a number')
	}
	if (!Number.isSafeInteger(steps) || steps < 1) {
		throw new RangeError('steps must be a positive safe integer')
	}

	const dr = b.re - a.re
	const di = b.im - a.im

	if (dr === 0 && di === 0) {
		validateComplex(f({ re: a.re, im: a.im }), 'f(z)')
		return { re: 0, im: 0 }
	}

	const fStart = validateComplex(f({ re: a.re, im: a.im }), 'f(z)')
	const fEnd = validateComplex(f({ re: b.re, im: b.im }), 'f(z)')

	let sumRe = fStart.re + fEnd.re
	let sumIm = fStart.im + fEnd.im

	for (let i = 0; i < steps; i++) {
		const tMid = (i + 0.5) / steps
		const fMid = validateComplex(
			f({ re: a.re + tMid * dr, im: a.im + tMid * di }),
			'f(z)'
		)
		sumRe += 4 * fMid.re
		sumIm += 4 * fMid.im

		if (i > 0) {
			const tNode = i / steps
			const fNode = validateComplex(
				f({ re: a.re + tNode * dr, im: a.im + tNode * di }),
				'f(z)'
			)
			sumRe += 2 * fNode.re
			sumIm += 2 * fNode.im
		}
	}

	const scale = 1 / (6 * steps)
	const avgRe = sumRe * scale
	const avgIm = sumIm * scale

	const re = dr * avgRe - di * avgIm
	const im = dr * avgIm + di * avgRe

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Integral result overflowed to a non-finite complex number')
	}

	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	}
}
