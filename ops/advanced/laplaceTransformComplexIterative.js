/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric components.
 *
 * @param {unknown} value - Value to validate.
 * @param {string} name - Parameter or value name for error messages.
 * @throws {TypeError} If value is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not a finite number.
 */
function assertValidComplex(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${name} must be a complex number object { re, im }`)
	}
	if (typeof value.re !== 'number' || typeof value.im !== 'number') {
		throw new TypeError(`${name}.re and ${name}.im must be numbers`)
	}
	if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
		throw new RangeError(`${name}.re and ${name}.im must be finite numbers`)
	}
}

/**
 * Computes the unilateral Laplace transform F(s) = ∫₀^∞ f(t) e^(-s t) dt
 * over complex numbers represented as `{ re, im }`, using a straightforward
 * iterative composite Simpson's rule over `[0, tMax]`.
 *
 * @param {(t: number) => { re: number, im: number }} fn - Time-domain function returning a finite complex number `{ re, im }` for `t >= 0`.
 * @param {{ re: number, im: number }} s - Complex frequency `{ re, im }` with finite real and imaginary parts.
 * @param {{ tMax?: number, steps?: number }} [options={}] - Numerical integration options.
 * @param {number} [options.tMax=50] - Positive finite upper integration bound approximating infinity.
 * @param {number} [options.steps=10000] - Positive even integer number of subintervals (`>= 2`) for composite Simpson's rule.
 * @returns {{ re: number, im: number }} The approximated complex Laplace transform `F(s)` as `{ re, im }`.
 * @throws {TypeError} If `fn` is not a function, `s` or `fn(t)` is not a `{ re, im }` object with numeric fields, or `options` / its fields have invalid types.
 * @throws {RangeError} If `s` or `fn(t)` has non-finite components, `options.tMax <= 0` or is non-finite, `options.steps` is not an even integer `>= 2`, or the integral overflows to a non-finite value.
 */
export function laplaceTransformComplexIterative(fn, s, options = {}) {
	if (typeof fn !== 'function') {
		throw new TypeError('fn must be a function')
	}

	assertValidComplex(s, 's')

	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}

	const tMax = options.tMax === undefined ? 50 : options.tMax
	if (typeof tMax !== 'number') {
		throw new TypeError('options.tMax must be a number')
	}
	if (!Number.isFinite(tMax) || tMax <= 0) {
		throw new RangeError('options.tMax must be a positive finite number')
	}

	const steps = options.steps === undefined ? 10000 : options.steps
	if (typeof steps !== 'number') {
		throw new TypeError('options.steps must be a number')
	}
	if (!Number.isSafeInteger(steps) || steps < 2 || steps % 2 !== 0) {
		throw new RangeError('options.steps must be a positive even integer >= 2')
	}

	const h = tMax / steps
	let sumRe = 0
	let sumIm = 0

	for (let k = 0; k <= steps; k++) {
		const t = k === steps ? tMax : k * h
		const fVal = fn(t)
		assertValidComplex(fVal, 'fn(t)')

		if (fVal.re === 0 && fVal.im === 0) {
			continue
		}

		const expDecay = Math.exp(-s.re * t)
		if (!Number.isFinite(expDecay)) {
			throw new RangeError('Laplace transform integrand overflowed to a non-finite value')
		}

		const angle = -s.im * t
		const cosA = Math.cos(angle)
		const sinA = Math.sin(angle)

		// Complex product: f(t) * e^(-s t) = (f.re + i f.im) * e^(-s.re * t) * (cos(-s.im * t) + i sin(-s.im * t))
		const intRe = (fVal.re * cosA - fVal.im * sinA) * expDecay
		const intIm = (fVal.re * sinA + fVal.im * cosA) * expDecay

		const weight = k === 0 || k === steps ? 1 : (k % 2 === 1 ? 4 : 2)
		sumRe += weight * intRe
		sumIm += weight * intIm
	}

	const scale = h / 3
	const re = sumRe * scale
	const im = sumIm * scale

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Laplace transform integral overflowed to a non-finite value')
	}

	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	}
}
