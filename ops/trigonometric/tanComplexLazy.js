/**
 * Computes the complex tangent of a single finite complex number z = re + i*im.
 *
 * Uses the cancellation-free identity
 *   tan(a + bi) = (sin(a)cos(a) + i*sinh(b)cosh(b)) / (cos^2(a) + sinh^2(b))
 * for |b| <= 20, and the overflow-free exponential form
 *   tan(a + bi) = (2*sin(2a)*e + i*sgn(b)*(1 - e^2)) / (1 + 2*cos(2a)*e + e^2),
 * where e = exp(-2|b|), for |b| > 20.
 *
 * @param {number} re - Real part of z (finite number).
 * @param {number} im - Imaginary part of z (finite number).
 * @returns {{ re: number, im: number }} Complex tangent tan(z).
 */
function computeTanComplex(re, im) {
	if (im === 0) {
		const realTan = Math.tan(re)
		return { re: realTan === 0 ? 0 : realTan, im: 0 }
	}

	const sinA = Math.sin(re)
	const cosA = Math.cos(re)
	const absIm = Math.abs(im)

	if (absIm > 20) {
		const sin2A = 2 * sinA * cosA
		const cos2A = cosA * cosA - sinA * sinA
		const e = Math.exp(-2 * absIm)
		const e2 = e * e
		const denom = 1 + 2 * cos2A * e + e2
		const outRe = (2 * sin2A * e) / denom
		const outIm = (Math.sign(im) * (1 - e2)) / denom
		return {
			re: outRe === 0 ? 0 : outRe,
			im: outIm === 0 ? 0 : outIm,
		}
	}

	const sinhB = Math.sinh(im)
	const coshB = Math.cosh(im)
	const denom = cosA * cosA + sinhB * sinhB
	const outRe = (sinA * cosA) / denom
	const outIm = (sinhB * coshB) / denom
	return {
		re: outRe === 0 ? 0 : outRe,
		im: outIm === 0 ? 0 : outIm,
	}
}

/**
 * Validates that a value is a complex number object `{ re, im }` with finite numeric parts.
 *
 * @param {unknown} value - Candidate complex number.
 * @param {number} index - Zero-based stream position for error diagnostics.
 * @returns {{ re: number, im: number }} Validated complex number.
 * @throws {TypeError} If `value` is not an object or `re`/`im` are not numbers.
 * @throws {RangeError} If `re` or `im` is NaN or infinite.
 */
function validateComplex(value, index) {
	if (value === null || typeof value !== 'object') {
		throw new TypeError(
			`Expected complex number object { re, im } at index ${index}, got ${value === null ? 'null' : typeof value}`,
		)
	}
	const { re, im } = value
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError(
			`Expected numeric { re, im } properties at index ${index}, got { re: ${typeof re}, im: ${typeof im} }`,
		)
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError(
			`Expected finite { re, im } values at index ${index}, got { re: ${re}, im: ${im} }`,
		)
	}
	return { re, im }
}

/**
 * Internal generator that lazily consumes complex numbers and yields their tangents.
 *
 * @param {Iterable<{ re: number, im: number }>} source - Validated iterable of complex numbers.
 * @returns {Generator<{ re: number, im: number }, void, unknown>}
 */
function* tanComplexGenerator(source) {
	let index = 0
	for (const item of source) {
		const { re, im } = validateComplex(item, index)
		index += 1
		yield computeTanComplex(re, im)
	}
}

/**
 * Lazily computes the trigonometric tangent `tan(z)` over a sequence of complex numbers
 * represented as `{ re, im }` objects.
 *
 * The input iterable is validated eagerly (must be a non-string iterable), while its
 * elements are consumed, validated, and transformed on demand one at a time via a
 * generator, supporting finite and infinite streams with proper early-exit cleanup.
 *
 * @param {Iterable<{ re: number, im: number }>} values - Iterable of complex numbers `{ re, im }`.
 * @returns {Generator<{ re: number, im: number }, void, unknown>} Lazy generator yielding `{ re, im }` tangent values.
 * @throws {TypeError} Synchronously if `values` is not a non-string iterable; lazily on `.next()` if an element is malformed.
 * @throws {RangeError} Lazily on `.next()` if an element has non-finite `re` or `im`.
 */
export function tanComplexLazy(values) {
	if (
		values === null ||
		values === undefined ||
		typeof values === 'string' ||
		typeof values[Symbol.iterator] !== 'function'
	) {
		throw new TypeError(
			'Expected a non-string iterable of complex numbers { re, im }',
		)
	}
	return tanComplexGenerator(values)
}
