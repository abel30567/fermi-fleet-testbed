/**
 * Lanczos approximation parameters (g = 7, n = 9) for double-precision
 * evaluation of the complex Gamma function across Re(z) >= -0.5.
 */
const LANCZOS_G = 7
const LANCZOS_P = [
	0.99999999999980993,
	676.5203681218851,
	-1259.1392167224028,
	771.32342877765313,
	-176.61502916214059,
	12.507343278686905,
	-0.13857109526572012,
	9.9843695780195716e-6,
	1.5056327351493116e-7,
]

const HALF_LOG_2PI = 0.5 * Math.log(2 * Math.PI)
const LOG_PI = Math.log(Math.PI)
const LN2 = Math.LN2
const MAX_EXP_ARG = 709.782712893384
const MIN_EXP_ARG = -745.2

function normalizeZero(value) {
	return value === 0 ? 0 : value
}

function complexLog(re, im) {
	return {
		re: Math.log(Math.hypot(re, im)),
		im: Math.atan2(im, re),
	}
}

function complexMul(aRe, aIm, bRe, bIm) {
	return {
		re: aRe * bRe - aIm * bIm,
		im: aRe * bIm + aIm * bRe,
	}
}

function complexExp(re, im) {
	if (re > MAX_EXP_ARG) {
		throw new RangeError('factorialComplexIterative: result overflows double precision')
	}
	if (re < MIN_EXP_ARG) {
		return { re: 0, im: 0 }
	}
	const mag = Math.exp(re)
	const outRe = mag * Math.cos(im)
	const outIm = mag * Math.sin(im)
	if (!Number.isFinite(outRe) || !Number.isFinite(outIm)) {
		throw new RangeError('factorialComplexIterative: result overflows double precision')
	}
	return {
		re: normalizeZero(outRe),
		im: normalizeZero(outIm),
	}
}

/**
 * Computes sin(pi * x) and cos(pi * x) accurately using range reduction.
 */
function sinCosPi(x) {
	const k = Math.round(x)
	const f = x - k
	const sign = Math.abs(k % 2) === 1 ? -1 : 1
	if (f === 0) {
		return { sin: 0, cos: sign }
	}
	if (Math.abs(f) === 0.5) {
		return { sin: sign * Math.sign(f), cos: 0 }
	}
	return {
		sin: sign * Math.sin(Math.PI * f),
		cos: sign * Math.cos(Math.PI * f),
	}
}

/**
 * Computes log(sin(pi * (x + i*y))) without intermediate overflow for large |y|.
 */
function logSinPi(x, y) {
	const b = Math.PI * y
	if (b > 500) {
		const reducedX = x - 2 * Math.round(x / 2)
		const a = Math.PI * reducedX
		return { re: b - LN2, im: Math.PI / 2 - a }
	}
	if (b < -500) {
		const reducedX = x - 2 * Math.round(x / 2)
		const a = Math.PI * reducedX
		return { re: -b - LN2, im: a - Math.PI / 2 }
	}
	const { sin, cos } = sinCosPi(x)
	const sRe = sin * Math.cosh(b)
	const sIm = cos * Math.sinh(b)
	return complexLog(sRe, sIm)
}

/**
 * Computes log(Gamma(u + 1)) for Re(u) >= -0.5 via iterative Lanczos summation.
 */
function logGammaPlusOneLanczos(uRe, uIm) {
	let aRe = LANCZOS_P[0]
	let aIm = 0
	for (let k = 1; k < LANCZOS_P.length; k++) {
		const dRe = uRe + k
		const dIm = uIm
		const scale = Math.max(Math.abs(dRe), Math.abs(dIm))
		const sRe = dRe / scale
		const sIm = dIm / scale
		const denom = scale * (sRe * sRe + sIm * sIm)
		aRe += (LANCZOS_P[k] * sRe) / denom
		aIm -= (LANCZOS_P[k] * sIm) / denom
	}

	const tRe = uRe + LANCZOS_G + 0.5
	const tIm = uIm
	const logT = complexLog(tRe, tIm)
	const powerTerm = complexMul(uRe + 0.5, uIm, logT.re, logT.im)
	const logA = complexLog(aRe, aIm)

	return {
		re: HALF_LOG_2PI + powerTerm.re - tRe + logA.re,
		im: powerTerm.im - tIm + logA.im,
	}
}

/**
 * Computes the factorial z! = Gamma(z + 1) of a complex number z = { re, im }
 * using a straightforward iterative implementation.
 *
 * - For non-negative integers (im === 0, integer re >= 0), computes the exact
 *   discrete product iteratively.
 * - For general complex values with Re(z) >= -0.5, evaluates log(Gamma(z + 1))
 *   via iterative Lanczos summation.
 * - For Re(z) < -0.5, applies Euler's reflection formula
 *   Gamma(z + 1) = -pi / (sin(pi * z) * Gamma(-z)) in log space without recursion.
 *
 * @param {{ re: number, im: number }} z - Complex number as { re, im }.
 * @returns {{ re: number, im: number }} The complex factorial z! = Gamma(z + 1).
 * @throws {TypeError} If z is not an object with numeric re and im properties.
 * @throws {RangeError} If z has non-finite components, is a negative integer pole,
 *   or if the result overflows IEEE 754 double precision.
 */
export function factorialComplexIterative(z) {
	if (typeof z !== 'object' || z === null || Array.isArray(z)) {
		throw new TypeError('factorialComplexIterative: z must be an object of the form { re, im }')
	}
	const { re, im } = z
	if (typeof re !== 'number' || typeof im !== 'number') {
		throw new TypeError('factorialComplexIterative: z.re and z.im must be numbers')
	}
	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('factorialComplexIterative: z.re and z.im must be finite numbers')
	}

	if (im === 0 && Number.isInteger(re)) {
		if (re < 0) {
			throw new RangeError('factorialComplexIterative: factorial has poles at negative integers')
		}
		let acc = 1
		for (let k = 2; k <= re; k++) {
			acc *= k
			if (!Number.isFinite(acc)) {
				throw new RangeError('factorialComplexIterative: result overflows double precision')
			}
		}
		return { re: acc, im: 0 }
	}

	let result
	if (re >= -0.5) {
		const logVal = logGammaPlusOneLanczos(re, im)
		result = complexExp(logVal.re, logVal.im)
	} else {
		// Reflection formula: Gamma(z + 1) = -pi / (sin(pi * z) * Gamma(-z))
		// With u = -z - 1, Re(u) > -0.5 and Gamma(u + 1) = Gamma(-z).
		const logGammaNegZ = logGammaPlusOneLanczos(-re - 1, -im)
		const logSin = logSinPi(re, im)
		const negVal = complexExp(
			LOG_PI - logSin.re - logGammaNegZ.re,
			-logSin.im - logGammaNegZ.im,
		)
		result = {
			re: normalizeZero(-negVal.re),
			im: normalizeZero(-negVal.im),
		}
	}

	if (im === 0) {
		return { re: result.re, im: 0 }
	}
	return result
}
