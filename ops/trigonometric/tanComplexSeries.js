/**
 * Computes the complex tangent tan(z) for a complex number z = { re, im }.
 *
 * Uses the exact trigonometric/hyperbolic identity:
 *   tan(x + i·y) = (sin(x)·cos(x) + i·sinh(y)·cosh(y)) / (cos²(x) + sinh²(y))
 *
 * For |y| > 10, switches to the algebraically equivalent scaled form with
 * t = exp(-2|y|) to prevent overflow in sinh(y) and cosh(y):
 *   tan(x + i·y) = (2t·sin(2x) + i·sign(y)·(1 - t²)) / (1 + t² + 2t·cos(2x))
 *
 * @param {{ re: number, im: number }} z - Complex number with finite real (`re`) and imaginary (`im`) parts.
 * @returns {{ re: number, im: number }} The complex tangent tan(z) as `{ re, im }`.
 * @throws {TypeError} If `z` is not a plain complex-like object or `re`/`im` are not numbers.
 * @throws {RangeError} If `z.re` or `z.im` is not finite (NaN or ±Infinity).
 */
export function tanComplexSeries(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Expected complex number object { re, im }')
	}

	const { re: x, im: y } = z
	if (typeof x !== 'number' || typeof y !== 'number') {
		throw new TypeError('Complex parts re and im must be numbers')
	}
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		throw new RangeError('Complex parts re and im must be finite numbers')
	}

	if (y === 0) {
		const realTan = Math.tan(x)
		return { re: realTan === 0 ? 0 : realTan, im: 0 }
	}

	if (x === 0) {
		const imagTanh = Math.tanh(y)
		return { re: 0, im: imagTanh === 0 ? 0 : imagTanh }
	}

	if (Math.abs(y) > 10) {
		const t = Math.exp(-2 * Math.abs(y))
		const denom = 1 + t * t + 2 * t * Math.cos(2 * x)
		const re = (2 * t * Math.sin(2 * x)) / denom
		const im = (Math.sign(y) * (1 - t * t)) / denom
		return {
			re: re === 0 ? 0 : re,
			im: im === 0 ? 0 : im,
		}
	}

	const sinX = Math.sin(x)
	const cosX = Math.cos(x)
	const sinhY = Math.sinh(y)
	const coshY = Math.cosh(y)
	const denom = cosX * cosX + sinhY * sinhY

	const re = (sinX * cosX) / denom
	const im = (sinhY * coshY) / denom

	return {
		re: re === 0 ? 0 : re,
		im: im === 0 ? 0 : im,
	}
}
