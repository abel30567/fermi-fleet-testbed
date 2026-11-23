const INV_LN2 = 1 / Math.LN2
const SERIES_RADIUS = 0.25
const MAX_SERIES_TERMS = 40

/**
 * Computes the principal complex natural logarithm ln(z) near z = 1 using the
 * complex inverse hyperbolic tangent (atanh) power series:
 *
 *   ln(z) = 2 * sum_{k=0..inf} t^(2k+1) / (2k + 1),  where t = (z - 1) / (z + 1)
 *
 * For |re - 1| <= 0.25 and |im| <= 0.25, |t| <= 0.203 and the series converges
 * geometrically to full IEEE-754 double precision in fewer than 20 terms while
 * avoiding catastrophic cancellation near z = 1.
 *
 * @param {number} re Real part of z.
 * @param {number} im Imaginary part of z.
 * @returns {{ re: number, im: number }} Principal value of ln(z).
 */
function lnComplexAtanhSeries(re, im) {
	const dx = re - 1
	const sx = re + 1
	const denom = sx * sx + im * im

	// t = (z - 1) / (z + 1) = ((dx * sx + im^2) + i * 2 * im) / (sx^2 + im^2)
	const tRe = (dx * sx + im * im) / denom
	const tIm = (2 * im) / denom

	// t^2
	const t2Re = tRe * tRe - tIm * tIm
	const t2Im = 2 * tRe * tIm

	let powRe = tRe
	let powIm = tIm
	let sumRe = tRe
	let sumIm = tIm

	for (let k = 1; k < MAX_SERIES_TERMS; k++) {
		const nextRe = powRe * t2Re - powIm * t2Im
		const nextIm = powRe * t2Im + powIm * t2Re
		powRe = nextRe
		powIm = nextIm

		const denomTerm = 2 * k + 1
		const termRe = powRe / denomTerm
		const termIm = powIm / denomTerm

		sumRe += termRe
		sumIm += termIm

		if (
			Math.abs(termRe) <= Number.EPSILON * Math.abs(sumRe) &&
			Math.abs(termIm) <= Number.EPSILON * Math.abs(sumIm)
		) {
			break
		}
	}

	return {
		re: 2 * sumRe,
		im: 2 * sumIm,
	}
}

/**
 * Computes log2(|re + i * im|) without intermediate overflow/underflow and
 * without catastrophic cancellation near the unit circle |z| = 1.
 *
 * @param {number} re Real part of z.
 * @param {number} im Imaginary part of z.
 * @returns {number} Value of log2(|z|).
 */
function log2Hypot(re, im) {
	const a = Math.abs(re)
	const b = Math.abs(im)
	const max = a >= b ? a : b
	const min = a >= b ? b : a

	if (max > 0.5 && max < 1.5) {
		const u = (max - 1) * (max + 1) + min * min
		if (Math.abs(u) <= 0.5) {
			return (0.5 * Math.log1p(u)) * INV_LN2
		}
	}

	const ratio = min / max
	return Math.log2(max) + (0.5 * Math.log1p(ratio * ratio)) * INV_LN2
}

/**
 * Computes the principal value of the base-2 logarithm log2(z) for a nonzero
 * complex number z = { re, im }.
 *
 * Uses the complex atanh power series near z = 1 (|re - 1| <= 0.25 and
 * |im| <= 0.25) to avoid cancellation, and the overflow/underflow-safe
 * identity log2(z) = log2(|z|) + i * atan2(im, re) / ln(2) elsewhere, with
 * the principal branch cut along the negative real axis: Im(ln(z)) in (-pi, pi].
 *
 * @param {{ re: number, im: number }} z Nonzero complex number with finite real and imaginary parts.
 * @returns {{ re: number, im: number }} Principal base-2 logarithm of z.
 * @throws {TypeError} If z is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If `re` or `im` is non-finite (NaN or ±Infinity), or if z is zero (0 + 0i).
 */
export function log2ComplexSeries(z) {
	if (z === null || typeof z !== 'object') {
		throw new TypeError('Expected a complex number object { re, im }')
	}

	const { re, im } = z
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError('Complex number properties re and im must be numbers')
	}

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex number components re and im must be finite numbers')
	}

	if (re === 0 && im === 0) {
		throw new RangeError('log2ComplexSeries is undefined at zero (0 + 0i)')
	}

	let outRe
	let outIm

	if (Math.abs(re - 1) <= SERIES_RADIUS && Math.abs(im) <= SERIES_RADIUS) {
		const lnZ = lnComplexAtanhSeries(re, im)
		outRe = lnZ.re * INV_LN2
		outIm = lnZ.im * INV_LN2
	} else {
		outRe = log2Hypot(re, im)
		outIm = Math.atan2(im, re) * INV_LN2
	}

	return {
		re: outRe === 0 ? 0 : outRe,
		im: outIm,
	}
}
