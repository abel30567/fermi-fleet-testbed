/**
 * Computes the trigonometric cosine of a complex number `z = re + i*im`.
 *
 * Uses the closed-form complex trigonometric identity derived from the
 * power series and Euler's formula:
 *
 *   cos(x + i*y) = cos(x) * cosh(y) - i * sin(x) * sinh(y)
 *
 * @param {{ re: number, im: number }} z - Complex input with finite real (`re`)
 *   and imaginary (`im`) components.
 * @returns {{ re: number, im: number }} The complex cosine `cos(z)` as `{ re, im }`.
 * @throws {TypeError} If `z` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `z.re` or `z.im` is not a finite number (`NaN` or `±Infinity`).
 */
export function cosComplexSeries(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Expected complex number as an object { re, im }')
	}

	const { re: x, im: y } = z

	if (typeof x !== 'number' || typeof y !== 'number') {
		throw new TypeError('Complex number components "re" and "im" must be numbers')
	}

	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		throw new RangeError('Complex number components "re" and "im" must be finite numbers')
	}

	if (y === 0) {
		const re = Math.cos(x)
		return { re: Object.is(re, -0) ? 0 : re, im: 0 }
	}

	if (x === 0) {
		return { re: Math.cosh(y), im: 0 }
	}

	const re = Math.cos(x) * Math.cosh(y)
	const im = -Math.sin(x) * Math.sinh(y)

	return {
		re: Object.is(re, -0) ? 0 : re,
		im: Object.is(im, -0) ? 0 : im,
	}
}
