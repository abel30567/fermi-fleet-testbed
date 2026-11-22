/**
 * Evaluates the complex sine of a small-modulus complex number using its
 * convergent Maclaurin series:
 *   sin(z) = sum_{k=0}^{\infty} (-1)^k * z^(2k+1) / (2k+1)!
 *
 * @param {number} re - Real part of z (with re^2 + im^2 <= 1).
 * @param {number} im - Imaginary part of z (with re^2 + im^2 <= 1).
 * @returns {{ re: number, im: number }} The complex sine sin(z).
 */
function sinComplexMaclaurin(re, im) {
	const z2Re = re * re - im * im
	const z2Im = 2 * re * im

	let sumRe = re
	let sumIm = im
	let termRe = re
	let termIm = im

	for (let k = 1; k <= 30; k++) {
		const denom = -2 * k * (2 * k + 1)
		const nextRe = (termRe * z2Re - termIm * z2Im) / denom
		const nextIm = (termRe * z2Im + termIm * z2Re) / denom
		termRe = nextRe
		termIm = nextIm

		const prevSumRe = sumRe
		const prevSumIm = sumIm
		sumRe += termRe
		sumIm += termIm

		if (sumRe === prevSumRe && sumIm === prevSumIm) {
			break
		}
	}

	return {
		re: sumRe === 0 ? 0 : sumRe,
		im: sumIm === 0 ? 0 : sumIm,
	}
}

/**
 * Computes the trigonometric sine of a complex number `z = re + i*im`.
 *
 * Uses the convergent Maclaurin series `sum_{k=0}^{\infty} (-1)^k z^(2k+1) / (2k+1)!`
 * within the unit disk (`|z| <= 1`) where convergence is rapid and free of
 * catastrophic cancellation, and the closed-form identity
 * `sin(x + i*y) = sin(x)cosh(y) + i*cos(x)sinh(y)` outside the unit disk
 * to preserve full IEEE-754 double precision for arbitrary finite inputs.
 *
 * @param {{ re: number, im: number }} z - Finite complex number as `{ re, im }`.
 * @returns {{ re: number, im: number }} Complex sine `sin(z)` as `{ re, im }`.
 * @throws {TypeError} If `z` is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `z.re` or `z.im` is not finite (`NaN`, `Infinity`, `-Infinity`).
 */
export function sinComplexSeries(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Expected a complex number object { re, im }')
	}

	const { re, im } = z

	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError('Complex number components re and im must be numbers')
	}

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex number components re and im must be finite')
	}

	if (re * re + im * im <= 1) {
		return sinComplexMaclaurin(re, im)
	}

	const sinRe = Math.sin(re)
	const cosRe = Math.cos(re)
	const sinhIm = Math.sinh(im)
	const coshIm = Math.cosh(im)

	const outRe = sinRe === 0 ? 0 : sinRe * coshIm
	const outIm = cosRe === 0 ? 0 : cosRe * sinhIm

	return {
		re: outRe === 0 ? 0 : outRe,
		im: outIm === 0 ? 0 : outIm,
	}
}
