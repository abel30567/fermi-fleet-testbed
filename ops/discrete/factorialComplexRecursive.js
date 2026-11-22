/**
 * @typedef {{ re: number, im: number }} Complex
 */

/**
 * Lanczos approximation parameter g = 7 and coefficients (n = 9, Paul Godfrey)
 * providing ~15 decimal digits of precision for Re(w) >= 0.5.
 */
const LANCZOS_G = 7
const LANCZOS_COEFFS = Object.freeze([
	0.99999999999980993,
	676.5203681218851,
	-1259.1392167224028,
	771.32342877765313,
	-176.61502916214059,
	12.507343278686905,
	-0.13857109526572012,
	9.9843695780195716e-6,
	1.5056327351493116e-7,
])

const HALF_LOG_2PI = 0.5 * Math.log(2 * Math.PI)
const LOG_PI = Math.log(Math.PI)
const MAX_SAFE_INT_FACTORIAL = 170

/**
 * Normalizes -0 to +0 while leaving all other numbers unchanged.
 * @param {number} x
 * @returns {number}
 */
function normalizeZero(x) {
	return x === 0 ? 0 : x
}

/**
 * Validates that the input is a complex object `{ re, im }` with finite numbers.
 * @param {unknown} z
 * @returns {Complex}
 */
function validateComplex(z) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError('Expected a complex number object { re, im }')
	}
	const { re, im } = /** @type {Record<string, unknown>} */ (z)
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError('Complex number properties "re" and "im" must be numbers')
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex number properties "re" and "im" must be finite numbers')
	}
	return { re: normalizeZero(re), im: normalizeZero(im) }
}

/**
 * Adds two complex numbers.
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function complexAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

/**
 * Multiplies two complex numbers.
 * @param {Complex} a
 * @param {Complex} b
 * @returns {Complex}
 */
function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

/**
 * Divides a real numerator by a non-zero complex denominator safely using scaling.
 * @param {number} num
 * @param {Complex} den
 * @returns {Complex}
 */
function realDivComplex(num, den) {
	const r = Math.hypot(den.re, den.im)
	if (!Number.isFinite(r)) {
		return { re: 0, im: 0 }
	}
	const dr = den.re / r
	const di = den.im / r
	return {
		re: (num * dr) / r,
		im: (-num * di) / r,
	}
}

/**
 * Computes the principal complex natural logarithm ln(z).
 * @param {Complex} z
 * @returns {Complex}
 */
function complexLog(z) {
	return {
		re: Math.log(Math.hypot(z.re, z.im)),
		im: Math.atan2(z.im, z.re),
	}
}

/**
 * Divide-and-conquer binary splitting product of consecutive integers [lo, hi].
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function binarySplitProduct(lo, hi) {
	if (lo > hi) return 1
	if (lo === hi) return lo
	if (hi - lo === 1) return lo * hi
	const mid = lo + Math.floor((hi - lo) / 2)
	return binarySplitProduct(lo, mid) * binarySplitProduct(mid + 1, hi)
}

/**
 * Divide-and-conquer recursive summation of the Lanczos rational series
 * A_g(w) = c_0 + sum_{k=1}^{8} c_k / (w - 1 + k).
 * @param {Complex} wm1 - w - 1
 * @param {number} lo - inclusive start index into LANCZOS_COEFFS
 * @param {number} hi - inclusive end index into LANCZOS_COEFFS
 * @returns {Complex}
 */
function sumLanczosTerms(wm1, lo, hi) {
	if (lo === hi) {
		if (lo === 0) {
			return { re: LANCZOS_COEFFS[0], im: 0 }
		}
		return realDivComplex(LANCZOS_COEFFS[lo], { re: wm1.re + lo, im: wm1.im })
	}
	const mid = lo + Math.floor((hi - lo) / 2)
	return complexAdd(
		sumLanczosTerms(wm1, lo, mid),
		sumLanczosTerms(wm1, mid + 1, hi),
	)
}

/**
 * Computes signed log(sin(pi * w)) as { re, im, sign } such that
 * sin(pi * w) = sign * exp(re + i * im), avoiding overflow for large |Im(w)|
 * and range-reducing Re(w) to [-0.5, 0.5] to preserve accuracy.
 * @param {Complex} w
 * @returns {{ re: number, im: number, sign: 1 | -1 }}
 */
function logSinPi(w) {
	const k = Math.round(w.re)
	const r = w.re - k
	const y = w.im
	const paritySign = Math.abs(k) % 2 === 1 ? -1 : 1

	if (y === 0) {
		const s = Math.sin(Math.PI * r)
		return {
			re: Math.log(Math.abs(s)),
			im: 0,
			sign: /** @type {1 | -1} */ (paritySign * (s < 0 ? -1 : 1)),
		}
	}

	const py = Math.PI * y
	if (Math.abs(py) <= 20) {
		const sinPiR = Math.sin(Math.PI * r)
		const cosPiR = Math.abs(r) === 0.5 ? 0 : Math.cos(Math.PI * r)
		const rePart = sinPiR * Math.cosh(py)
		const imPart = cosPiR * Math.sinh(py)
		return {
			re: Math.log(Math.hypot(rePart, imPart)),
			im: Math.atan2(imPart, rePart),
			sign: paritySign,
		}
	}

	// For |pi * y| > 20, exp(-2 * |pi * y|) < 4.3e-18 < eps/2
	if (y > 0) {
		return {
			re: py - Math.LN2,
			im: Math.PI * (0.5 - r),
			sign: paritySign,
		}
	}
	return {
		re: -py - Math.LN2,
		im: Math.PI * (r - 0.5),
		sign: paritySign,
	}
}

/**
 * Recursively computes signed log(Gamma(w)) as { re, im, sign } such that
 * Gamma(w) = sign * exp(re + i * im).
 *
 * - For Re(w) < 0.5: uses recursive Euler reflection
 *   Gamma(w) = pi / (sin(pi * w) * Gamma(1 - w)).
 * - For Re(w) >= 0.5: evaluates the Lanczos approximation using
 *   divide-and-conquer series summation.
 *
 * @param {Complex} w
 * @returns {{ re: number, im: number, sign: 1 | -1 }}
 */
function logGammaRecursive(w) {
	if (w.re < 0.5) {
		const reflected = logGammaRecursive({ re: 1 - w.re, im: -w.im })
		const sinPi = logSinPi(w)
		return {
			re: LOG_PI - sinPi.re - reflected.re,
			im: -sinPi.im - reflected.im,
			sign: /** @type {1 | -1} */ (sinPi.sign * reflected.sign),
		}
	}

	const wm1 = { re: w.re - 1, im: w.im }
	const series = sumLanczosTerms(wm1, 0, LANCZOS_COEFFS.length - 1)
	const t = { re: wm1.re + LANCZOS_G + 0.5, im: wm1.im }
	const logT = complexLog(t)
	const expTerm = complexMul({ re: wm1.re + 0.5, im: wm1.im }, logT)
	const logSeries = complexLog(series)

	return {
		re: HALF_LOG_2PI + expTerm.re - t.re + logSeries.re,
		im: expTerm.im - t.im + logSeries.im,
		sign: 1,
	}
}

/**
 * Computes the complex factorial z! = Gamma(z + 1) over complex numbers `{ re, im }`
 * using a recursive / divide-and-conquer implementation:
 *
 * - For non-negative integers `z = n` (`im === 0`), evaluates `n!` via
 *   divide-and-conquer binary splitting (`binarySplitProduct`).
 * - For general complex values, analytically continues `Gamma(z + 1)` using
 *   recursive Euler reflection (`Re(w) < 0.5`) combined with the Lanczos
 *   approximation (`g = 7`, `n = 9`) summed via divide-and-conquer recursion.
 *
 * @param {Complex} z - Complex number `{ re, im }` with finite numeric components.
 * @returns {Complex} The complex factorial `z! = Gamma(z + 1)` as `{ re, im }` (no `-0`).
 * @throws {TypeError} If `z` is not an object `{ re, im }` with numeric `re` and `im`.
 * @throws {RangeError} If `re` or `im` is non-finite (`NaN`, `±Infinity`),
 *   if `z` is a negative integer (simple pole of Gamma(z + 1)), or if the result
 *   overflows IEEE-754 double precision.
 */
export function factorialComplexRecursive(z) {
	const { re, im } = validateComplex(z)

	if (im === 0 && Number.isInteger(re)) {
		if (re < 0) {
			throw new RangeError(`Complex factorial has a pole at negative integer z = ${re}`)
		}
		if (re > MAX_SAFE_INT_FACTORIAL) {
			throw new RangeError(
				`Complex factorial overflows IEEE-754 double precision at z = ${re}`,
			)
		}
		if (re <= 1) {
			return { re: 1, im: 0 }
		}
		return { re: normalizeZero(binarySplitProduct(1, re)), im: 0 }
	}

	const lg = logGammaRecursive({ re: re + 1, im })
	const mag = Math.exp(lg.re)

	if (mag === 0) {
		return { re: 0, im: 0 }
	}

	if (!Number.isFinite(mag) || !Number.isFinite(lg.im)) {
		throw new RangeError(
			`Complex factorial overflows IEEE-754 double precision at z = ${re} + ${im}i`,
		)
	}

	if (lg.im === 0) {
		return { re: normalizeZero(lg.sign * mag), im: 0 }
	}

	const outRe = lg.sign * mag * Math.cos(lg.im)
	const outIm = lg.sign * mag * Math.sin(lg.im)

	if (!Number.isFinite(outRe) || !Number.isFinite(outIm)) {
		throw new RangeError(
			`Complex factorial overflows IEEE-754 double precision at z = ${re} + ${im}i`,
		)
	}

	return {
		re: normalizeZero(outRe),
		im: normalizeZero(outIm),
	}
}
