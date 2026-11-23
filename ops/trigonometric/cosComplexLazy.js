/**
 * Complex trigonometric cosine over `{ re, im }` numbers with lazy iterable streaming.
 *
 * Uses the identity:
 *   cos(a + bi) = cos(a) * cosh(b) - i * sin(a) * sinh(b)
 *
 * @module ops/trigonometric/cosComplexLazy
 */

/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric parts.
 *
 * @param {unknown} value - Candidate complex number.
 * @returns {{ re: number, im: number }} The validated complex number parts.
 * @throws {TypeError} If `value` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is not finite (`NaN`, `Infinity`, or `-Infinity`).
 */
function validateComplex(value) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError('Complex number must be a non-null object with numeric { re, im } properties')
	}
	const { re, im } = value
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError('Complex number properties "re" and "im" must be numbers')
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex number properties "re" and "im" must be finite numbers')
	}
	return { re, im }
}

/**
 * Computes `cos(re + im*i)` for validated finite real and imaginary components.
 *
 * @param {number} re - Real part.
 * @param {number} im - Imaginary part.
 * @returns {{ re: number, im: number }} Complex cosine result.
 */
function computeCosComplex(re, im) {
	const cosRe = Math.cos(re)
	const sinRe = Math.sin(re)
	const coshIm = Math.cosh(im)
	const sinhIm = Math.sinh(im)

	// Avoid 0 * Infinity -> NaN when |im| is large enough to overflow cosh/sinh.
	const outRe = cosRe === 0 ? 0 : cosRe * coshIm
	const outIm = sinRe === 0 ? 0 : -sinRe * sinhIm

	return {
		re: outRe === 0 ? 0 : outRe,
		im: outIm === 0 ? 0 : outIm,
	}
}

/**
 * Internal generator that consumes an iterable of complex numbers lazily.
 *
 * @param {Iterable<{ re: number, im: number }>} iterable
 * @returns {Generator<{ re: number, im: number }, void, unknown>}
 */
function* cosComplexStream(iterable) {
	for (const item of iterable) {
		const { re, im } = validateComplex(item)
		yield computeCosComplex(re, im)
	}
}

/**
 * Internal generator for a single validated complex number.
 *
 * @param {{ re: number, im: number }} complex
 * @returns {Generator<{ re: number, im: number }, void, unknown>}
 */
function* cosComplexSingle(complex) {
	yield computeCosComplex(complex.re, complex.im)
}

/**
 * Lazily computes the trigonometric cosine of complex numbers represented as `{ re, im }`.
 *
 * Accepts either an iterable sequence of `{ re, im }` objects (consumed lazily one element
 * per `.next()` call, supporting infinite generators and early termination) or a single
 * `{ re, im }` object, returning a generator yielding `{ re, im }` results.
 *
 * @param {Iterable<{ re: number, im: number }> | { re: number, im: number }} input
 *   An iterable of complex numbers or a single complex number `{ re, im }`.
 * @returns {Generator<{ re: number, im: number }, void, unknown>}
 *   A lazy generator yielding `{ re, im }` cosine values.
 * @throws {TypeError} If `input` is neither an iterable (excluding strings) nor a valid `{ re, im }` object,
 *   or if a yielded element is not a valid `{ re, im }` object.
 * @throws {RangeError} If any `re` or `im` component is non-finite (`NaN`, `Infinity`, `-Infinity`).
 */
export function cosComplexLazy(input) {
	if (input === null || input === undefined || typeof input !== 'object') {
		throw new TypeError('Input must be an iterable of { re, im } complex numbers or a { re, im } object')
	}

	if (typeof input[Symbol.iterator] === 'function') {
		return cosComplexStream(input)
	}

	const complex = validateComplex(input)
	return cosComplexSingle(complex)
}
