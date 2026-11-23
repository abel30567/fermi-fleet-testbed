/**
 * Computes the complex trigonometric sine `sin(z)` for a complex number `z = re + i*im`.
 *
 * Uses the exact closed-form identity derived from the complex exponential / Maclaurin series:
 *   sin(x + i*y) = sin(x) * cosh(y) + i * cos(x) * sinh(y)
 *
 * For large `|im|` where `Math.cosh(im)` or `Math.sinh(im)` would overflow `Number.MAX_VALUE`,
 * intermediate scaling via `exp(|im| / 2)` is applied to avoid premature overflow and `0 * Infinity` NaNs.
 *
 * @param {{ re: number, im: number }} z - Complex number with finite real (`re`) and imaginary (`im`) parts.
 * @returns {{ re: number, im: number }} The complex value `sin(z)` as `{ re, im }`.
 * @throws {TypeError} If `z` is not a non-null plain object or if `z.re` or `z.im` is not a number.
 * @throws {RangeError} If `z.re` or `z.im` is not finite (`NaN`, `Infinity`, or `-Infinity`).
 */
export function sinComplexSeries(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Expected complex number as an object { re, im }')
	}

	const { re: x, im: y } = z

	if (typeof x !== 'number' || typeof y !== 'number') {
		throw new TypeError('Expected numeric properties z.re and z.im')
	}

	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		throw new RangeError('Expected finite numeric properties z.re and z.im')
	}

	const sinX = Math.sin(x)
	const cosX = Math.cos(x)

	let outRe
	let outIm

	if (y === 0) {
		outRe = sinX
		outIm = 0
	} else {
		const coshY = Math.cosh(y)
		const sinhY = Math.sinh(y)

		if (Number.isFinite(coshY) && Number.isFinite(sinhY)) {
			outRe = sinX === 0 ? 0 : sinX * coshY
			outIm = cosX === 0 ? 0 : cosX * sinhY
		} else {
			// |y| > ~710.47586: cosh(y) ~ 0.5 * exp(|y|), sinh(y) ~ sign(y) * 0.5 * exp(|y|).
			// Split exp(|y|) as exp(|y|/2) * exp(|y|/2) to prevent premature overflow when |sinX| or |cosX| is tiny.
			const halfExp = Math.exp(Math.abs(y) / 2)
			const signY = Math.sign(y)
			outRe = sinX === 0 ? 0 : (0.5 * sinX * halfExp) * halfExp
			outIm = cosX === 0 ? 0 : (0.5 * cosX * signY * halfExp) * halfExp
		}
	}

	return {
		re: outRe === 0 ? 0 : outRe,
		im: outIm === 0 ? 0 : outIm,
	}
}
