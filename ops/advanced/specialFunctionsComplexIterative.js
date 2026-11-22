const TWO_PI = 2 * Math.PI
const SQRT_PI = Math.sqrt(Math.PI)
const HALF_LN_TWO_PI = 0.5 * Math.log(TWO_PI)

const LANCZOS_G = 7
const LANCZOS_COEFFS = [
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

// Even Bernoulli numbers B_2, B_4, ..., B_16
const BERNOULLI_EVEN = [
	1 / 6,
	-1 / 30,
	1 / 42,
	-1 / 30,
	5 / 66,
	-691 / 2730,
	7 / 6,
	-3617 / 510,
]

const SUPPORTED_FUNCTIONS = new Set([
	'gamma',
	'logGamma',
	'digamma',
	'erf',
	'erfc',
	'besselJ',
	'zeta',
])

const ZERO = { re: 0, im: 0 }
const ONE = { re: 1, im: 0 }

function normalizeZero(x) {
	return x === 0 ? 0 : x
}

function finalizeComplex(z, context) {
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError(`Result overflowed to non-finite value in ${context}`)
	}
	return { re: normalizeZero(z.re), im: normalizeZero(z.im) }
}

function validateComplex(z, name) {
	if (z === null || typeof z !== 'object' || Array.isArray(z)) {
		throw new TypeError(`${name} must be a complex number object { re, im }`)
	}
	if (typeof z.re !== 'number' || typeof z.im !== 'number') {
		throw new TypeError(`${name}.re and ${name}.im must be numbers`)
	}
	if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) {
		throw new RangeError(`${name}.re and ${name}.im must be finite numbers`)
	}
	return { re: z.re, im: z.im }
}

function validateOptions(options) {
	if (options === undefined) {
		return { order: ZERO, maxIterations: 500, tolerance: 1e-14 }
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}

	let order = ZERO
	if (options.order !== undefined) {
		if (typeof options.order === 'number') {
			if (!Number.isFinite(options.order)) {
				throw new RangeError('options.order must be a finite number')
			}
			order = { re: options.order, im: 0 }
		} else {
			order = validateComplex(options.order, 'options.order')
		}
	}

	let maxIterations = 500
	if (options.maxIterations !== undefined) {
		if (typeof options.maxIterations !== 'number') {
			throw new TypeError('options.maxIterations must be a number')
		}
		if (!Number.isInteger(options.maxIterations) || options.maxIterations < 1) {
			throw new RangeError('options.maxIterations must be a positive integer')
		}
		maxIterations = options.maxIterations
	}

	let tolerance = 1e-14
	if (options.tolerance !== undefined) {
		if (typeof options.tolerance !== 'number') {
			throw new TypeError('options.tolerance must be a number')
		}
		if (!Number.isFinite(options.tolerance) || options.tolerance <= 0) {
			throw new RangeError('options.tolerance must be a positive finite number')
		}
		tolerance = options.tolerance
	}

	return { order, maxIterations, tolerance }
}

// --- Complex arithmetic helpers ---

function cAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function cSub(a, b) {
	return { re: a.re - b.re, im: a.im - b.im }
}

function cMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function cScale(a, s) {
	return { re: a.re * s, im: a.im * s }
}

function cDiv(a, b) {
	if (b.re === 0 && b.im === 0) {
		throw new RangeError('Division by zero in complex arithmetic')
	}
	if (Math.abs(b.re) >= Math.abs(b.im)) {
		const r = b.im / b.re
		const denom = b.re + b.im * r
		return {
			re: (a.re + a.im * r) / denom,
			im: (a.im - a.re * r) / denom,
		}
	}
	const r = b.re / b.im
	const denom = b.im + b.re * r
	return {
		re: (a.re * r + a.im) / denom,
		im: (a.im * r - a.re) / denom,
	}
}

function cAbs(z) {
	return Math.hypot(z.re, z.im)
}

function cExp(z) {
	const r = Math.exp(z.re)
	if (z.im === 0) {
		return { re: r, im: 0 }
	}
	return { re: r * Math.cos(z.im), im: r * Math.sin(z.im) }
}

function cLog(z) {
	if (z.re === 0 && z.im === 0) {
		throw new RangeError('Complex logarithm is undefined at zero')
	}
	return {
		re: Math.log(Math.hypot(z.re, z.im)),
		im: Math.atan2(z.im, z.re),
	}
}

function cPow(base, exp) {
	if (base.re === 0 && base.im === 0) {
		if (exp.re === 0 && exp.im === 0) {
			return { re: 1, im: 0 }
		}
		if (exp.re > 0) {
			return { re: 0, im: 0 }
		}
		throw new RangeError('Zero raised to non-positive real-part power is undefined')
	}
	return cExp(cMul(exp, cLog(base)))
}

function cIntPow(base, n) {
	let result = { re: 1, im: 0 }
	let factor = { re: base.re, im: base.im }
	let exp = n
	while (exp > 0) {
		if ((exp & 1) === 1) {
			result = cMul(result, factor)
		}
		exp >>= 1
		if (exp > 0) {
			factor = cMul(factor, factor)
		}
	}
	return result
}

// Compute sin(pi * z) accurately by reducing z.re modulo 2
function cSinPi(z) {
	const xMod = ((z.re % 2) + 2) % 2
	let sinPx
	let cosPx
	if (xMod === 0) {
		sinPx = 0
		cosPx = 1
	} else if (xMod === 0.5) {
		sinPx = 1
		cosPx = 0
	} else if (xMod === 1) {
		sinPx = 0
		cosPx = -1
	} else if (xMod === 1.5) {
		sinPx = -1
		cosPx = 0
	} else {
		const px = Math.PI * xMod
		sinPx = Math.sin(px)
		cosPx = Math.cos(px)
	}
	if (z.im === 0) {
		return { re: sinPx, im: 0 }
	}
	const py = Math.PI * z.im
	return {
		re: sinPx * Math.cosh(py),
		im: cosPx * Math.sinh(py),
	}
}

// Compute cos(pi * z) accurately by reducing z.re modulo 2
function cCosPi(z) {
	const xMod = ((z.re % 2) + 2) % 2
	let sinPx
	let cosPx
	if (xMod === 0) {
		sinPx = 0
		cosPx = 1
	} else if (xMod === 0.5) {
		sinPx = 1
		cosPx = 0
	} else if (xMod === 1) {
		sinPx = 0
		cosPx = -1
	} else if (xMod === 1.5) {
		sinPx = -1
		cosPx = 0
	} else {
		const px = Math.PI * xMod
		sinPx = Math.sin(px)
		cosPx = Math.cos(px)
	}
	if (z.im === 0) {
		return { re: cosPx, im: 0 }
	}
	const py = Math.PI * z.im
	return {
		re: cosPx * Math.cosh(py),
		im: -sinPx * Math.sinh(py),
	}
}

function isNonPositiveInteger(z) {
	return z.im === 0 && z.re <= 0 && Number.isInteger(z.re)
}

// --- Special function implementations ---

function logGammaLanczosRight(z) {
	const w = { re: z.re - 1, im: z.im }
	let x = { re: LANCZOS_COEFFS[0], im: 0 }
	for (let k = 1; k < LANCZOS_COEFFS.length; k++) {
		const denom = { re: w.re + k, im: w.im }
		x = cAdd(x, cDiv({ re: LANCZOS_COEFFS[k], im: 0 }, denom))
	}
	const t = { re: w.re + LANCZOS_G + 0.5, im: w.im }
	const wPlusHalf = { re: w.re + 0.5, im: w.im }
	const term1 = cMul(wPlusHalf, cLog(t))
	const term2 = cSub(term1, t)
	const term3 = cAdd(term2, cLog(x))
	return { re: HALF_LN_TWO_PI + term3.re, im: term3.im }
}

function complexGamma(z) {
	if (isNonPositiveInteger(z)) {
		throw new RangeError('gamma has a pole at non-positive integers')
	}
	if (z.re < 0.5) {
		const oneMinusZ = { re: 1 - z.re, im: -z.im }
		const sinPiZ = cSinPi(z)
		const gammaOneMinusZ = cExp(logGammaLanczosRight(oneMinusZ))
		const denom = cMul(sinPiZ, gammaOneMinusZ)
		const result = cDiv({ re: Math.PI, im: 0 }, denom)
		if (z.im === 0) {
			result.im = 0
		}
		return result
	}
	const result = cExp(logGammaLanczosRight(z))
	if (z.im === 0) {
		result.im = 0
	}
	return result
}

function complexLogGamma(z) {
	if (isNonPositiveInteger(z)) {
		throw new RangeError('logGamma has a pole at non-positive integers')
	}
	if (z.re >= 0.5) {
		const res = logGammaLanczosRight(z)
		if (z.im === 0) {
			res.im = 0
		}
		return res
	}
	// Iterative upward recurrence: logGamma(z) = logGamma(z + m) - sum_{j=0}^{m-1} log(z + j)
	const shiftCount = Math.ceil(0.5 - z.re)
	if (shiftCount <= 1000) {
		let sumLogs = { re: 0, im: 0 }
		let cur = { re: z.re, im: z.im }
		for (let j = 0; j < shiftCount; j++) {
			sumLogs = cAdd(sumLogs, cLog(cur))
			cur = { re: cur.re + 1, im: cur.im }
		}
		const base = logGammaLanczosRight(cur)
		return cSub(base, sumLogs)
	}
	// Far-left half-plane fallback via Euler reflection
	const oneMinusZ = { re: 1 - z.re, im: -z.im }
	const sinPiZ = cSinPi(z)
	const logPi = { re: Math.log(Math.PI), im: 0 }
	return cSub(cSub(logPi, cLog(sinPiZ)), logGammaLanczosRight(oneMinusZ))
}

function complexDigamma(z) {
	if (isNonPositiveInteger(z)) {
		throw new RangeError('digamma has a pole at non-positive integers')
	}

	let w = { re: z.re, im: z.im }
	let acc = { re: 0, im: 0 }

	// Reflection formula for Re(z) < 0.5: psi(z) = psi(1 - z) - pi * cot(pi * z)
	if (w.re < 0.5) {
		const cotPiZ = cDiv(cCosPi(w), cSinPi(w))
		acc = cSub(acc, cScale(cotPiZ, Math.PI))
		w = { re: 1 - w.re, im: -w.im }
	}

	// Iterative recurrence shift: psi(w) = psi(w + 1) - 1/w until |w| >= 10
	while (cAbs(w) < 10) {
		acc = cSub(acc, cDiv(ONE, w))
		w = { re: w.re + 1, im: w.im }
	}

	// Asymptotic Bernoulli expansion: psi(w) ~ ln(w) - 1/(2w) - sum_{m=1}^{8} B_{2m} / (2m * w^{2m})
	const invW = cDiv(ONE, w)
	const invW2 = cMul(invW, invW)
	let series = cSub(cLog(w), cScale(invW, 0.5))
	let powInvW2 = invW2

	for (let m = 1; m <= BERNOULLI_EVEN.length; m++) {
		const coeff = BERNOULLI_EVEN[m - 1] / (2 * m)
		series = cSub(series, cScale(powInvW2, coeff))
		powInvW2 = cMul(powInvW2, invW2)
	}

	const result = cAdd(acc, series)
	if (z.im === 0) {
		result.im = 0
	}
	return result
}

function erfMaclaurin(z, maxIterations, tolerance) {
	const negZ2 = cScale(cMul(z, z), -1)
	let power = { re: z.re, im: z.im }
	let sum = { re: z.re, im: z.im }

	for (let n = 1; n <= maxIterations; n++) {
		power = cScale(cMul(power, negZ2), 1 / n)
		const term = cScale(power, 1 / (2 * n + 1))
		sum = cAdd(sum, term)
		if (cAbs(term) <= tolerance * Math.max(1, cAbs(sum))) {
			break
		}
	}
	return cScale(sum, 2 / SQRT_PI)
}

function erfScaledSeries(z, maxIterations, tolerance) {
	const z2 = cMul(z, z)
	const twoZ2 = cScale(z2, 2)
	let term = { re: 1, im: 0 }
	let sum = { re: 1, im: 0 }

	for (let n = 1; n <= maxIterations; n++) {
		term = cScale(cMul(term, twoZ2), 1 / (2 * n + 1))
		sum = cAdd(sum, term)
		if (cAbs(term) <= tolerance * Math.max(1, cAbs(sum))) {
			break
		}
	}

	const prefactor = cScale(cMul(z, cExp(cScale(z2, -1))), 2 / SQRT_PI)
	return cMul(prefactor, sum)
}

// Laplace continued fraction for erfc(z) in Re(z) > 0 via modified Lentz iteration
function erfcContinuedFraction(z, maxIterations, tolerance) {
	const tiny = 1e-30
	let f = z
	if (cAbs(f) < tiny) {
		f = { re: tiny, im: 0 }
	}
	let c = f
	let d = ZERO

	for (let k = 1; k <= maxIterations; k++) {
		const a = { re: k / 2, im: 0 }
		d = cAdd(z, cMul(a, d))
		if (cAbs(d) < tiny) {
			d = { re: tiny, im: 0 }
		}
		c = cAdd(z, cDiv(a, c))
		if (cAbs(c) < tiny) {
			c = { re: tiny, im: 0 }
		}
		d = cDiv(ONE, d)
		const delta = cMul(c, d)
		f = cMul(f, delta)
		if (cAbs(cSub(delta, ONE)) <= tolerance) {
			break
		}
	}

	const negZ2 = cScale(cMul(z, z), -1)
	const factor = cScale(cExp(negZ2), 1 / SQRT_PI)
	return cDiv(factor, f)
}

function complexErfAndErfc(z, maxIterations, tolerance) {
	if (z.re === 0 && z.im === 0) {
		return { erf: { re: 0, im: 0 }, erfc: { re: 1, im: 0 } }
	}

	const flip = z.re < 0
	const w = flip ? { re: -z.re, im: -z.im } : { re: z.re, im: z.im }
	const r = cAbs(w)
	const reZ2 = w.re * w.re - w.im * w.im

	let erfW
	let erfcW

	if (w.re >= 1.8 && (r > 3.5 || w.re >= Math.abs(w.im))) {
		erfcW = erfcContinuedFraction(w, maxIterations, tolerance)
		erfW = cSub(ONE, erfcW)
	} else if (reZ2 >= 0 && r <= 4.5) {
		erfW = erfScaledSeries(w, maxIterations, tolerance)
		erfcW = cSub(ONE, erfW)
	} else if (w.re > 0.5 && r > 4.5) {
		erfcW = erfcContinuedFraction(w, maxIterations, tolerance)
		erfW = cSub(ONE, erfcW)
	} else {
		erfW = erfMaclaurin(w, maxIterations, tolerance)
		erfcW = cSub(ONE, erfW)
	}

	if (flip) {
		erfW = cScale(erfW, -1)
		erfcW = cSub({ re: 2, im: 0 }, erfcW)
	}
	if (z.im === 0) {
		erfW.im = 0
		erfcW.im = 0
	}
	return { erf: erfW, erfc: erfcW }
}

function complexBesselJ(z, order, maxIterations, tolerance) {
	let nu = { re: order.re, im: order.im }
	let sign = 1

	// Use symmetry J_{-n}(z) = (-1)^n J_n(z) for negative integer orders
	if (nu.im === 0 && nu.re < 0 && Number.isInteger(nu.re)) {
		const n = -nu.re
		sign = n % 2 === 0 ? 1 : -1
		nu = { re: n, im: 0 }
	}

	if (z.re === 0 && z.im === 0) {
		if (nu.re === 0 && nu.im === 0) {
			return { re: 1, im: 0 }
		}
		if (nu.re > 0) {
			return { re: 0, im: 0 }
		}
		throw new RangeError('besselJ is singular at z = 0 for Re(order) <= 0 (non-integer)')
	}

	const halfZ = cScale(z, 0.5)
	const negZ2Over4 = cScale(cMul(halfZ, halfZ), -1)

	let term = cDiv(ONE, complexGamma({ re: nu.re + 1, im: nu.im }))
	let sum = { re: term.re, im: term.im }

	for (let k = 1; k <= maxIterations; k++) {
		const denom = cMul({ re: k, im: 0 }, { re: nu.re + k, im: nu.im })
		term = cDiv(cMul(term, negZ2Over4), denom)
		sum = cAdd(sum, term)
		if (cAbs(term) <= tolerance * Math.max(1, cAbs(sum))) {
			break
		}
	}

	let prefactor
	if (nu.im === 0 && nu.re >= 0 && Number.isInteger(nu.re)) {
		prefactor = cIntPow(halfZ, nu.re)
	} else {
		prefactor = cPow(halfZ, nu)
	}

	const result = cScale(cMul(prefactor, sum), sign)
	if (z.im === 0 && order.im === 0 && (z.re > 0 || Number.isInteger(order.re))) {
		result.im = 0
	}
	return result
}

// Euler-Maclaurin summation for zeta(s) with Re(s) >= 0, s != 1
function zetaEulerMaclaurin(s, maxIterations) {
	const absS = cAbs(s)
	const m = Math.min(Math.max(16, Math.ceil(1.5 * absS) + 4), Math.max(16, maxIterations))

	let sum = { re: 0, im: 0 }
	const negS = { re: -s.re, im: -s.im }
	for (let n = 1; n < m; n++) {
		const lnN = Math.log(n)
		sum = cAdd(sum, cExp({ re: negS.re * lnN, im: negS.im * lnN }))
	}

	const lnM = Math.log(m)
	const mPowNegS = cExp({ re: negS.re * lnM, im: negS.im * lnM })
	const mPowOneMinusS = cScale(mPowNegS, m)

	// Integral term M^{1-s} / (s - 1) and endpoint term 0.5 * M^{-s}
	const integralTerm = cDiv(mPowOneMinusS, { re: s.re - 1, im: s.im })
	sum = cAdd(sum, integralTerm)
	sum = cAdd(sum, cScale(mPowNegS, 0.5))

	// Bernoulli correction series: sum_{k=1}^{8} (B_{2k} / (2k)!) * (s)_{2k-1} * M^{1-s-2k}
	const invM2 = 1 / (m * m)
	let rising = { re: s.re, im: s.im } // (s)_1 = s
	let fact = 2 // (2*1)! = 2
	let mFactor = cScale(mPowNegS, 1 / m) // M^{-s - 1} = M^{1 - s - 2}

	for (let k = 1; k <= BERNOULLI_EVEN.length; k++) {
		const coeff = BERNOULLI_EVEN[k - 1] / fact
		const term = cScale(cMul(rising, mFactor), coeff)
		sum = cAdd(sum, term)

		if (k < BERNOULLI_EVEN.length) {
			rising = cMul(rising, { re: s.re + 2 * k - 1, im: s.im })
			rising = cMul(rising, { re: s.re + 2 * k, im: s.im })
			fact *= (2 * k + 1) * (2 * k + 2)
			mFactor = cScale(mFactor, invM2)
		}
	}

	if (s.im === 0) {
		sum.im = 0
	}
	return sum
}

function complexZeta(z, maxIterations) {
	if (z.re === 1 && z.im === 0) {
		throw new RangeError('zeta has a simple pole at z = 1')
	}

	if (z.re >= 0) {
		return zetaEulerMaclaurin(z, maxIterations)
	}

	// Trivial zeros at negative even integers: zeta(-2k) = 0
	if (z.im === 0 && z.re < 0 && Number.isInteger(z.re) && z.re % 2 === 0) {
		return { re: 0, im: 0 }
	}

	// Riemann functional equation: zeta(z) = 2^z * pi^{z-1} * sin(pi*z/2) * Gamma(1-z) * zeta(1-z)
	const oneMinusZ = { re: 1 - z.re, im: -z.im }
	const twoPowZ = cExp(cScale(z, Math.LN2))
	const piPowZMinus1 = cExp(cScale({ re: z.re - 1, im: z.im }, Math.log(Math.PI)))
	const sinHalfPiZ = cSinPi({ re: z.re / 2, im: z.im / 2 })
	const gammaOneMinusZ = complexGamma(oneMinusZ)
	const zetaOneMinusZ = zetaEulerMaclaurin(oneMinusZ, maxIterations)

	let result = cMul(twoPowZ, piPowZMinus1)
	result = cMul(result, sinHalfPiZ)
	result = cMul(result, gammaOneMinusZ)
	result = cMul(result, zetaOneMinusZ)

	if (z.im === 0) {
		result.im = 0
	}
	return result
}

/**
 * Evaluates classical advanced special functions over complex numbers `{ re, im }`
 * using straightforward iterative numerical algorithms.
 *
 * Supported functions (`fnName`):
 * - `'gamma'`: Complex Gamma function Γ(z) via iterative Lanczos summation and Euler reflection.
 * - `'logGamma'`: Complex log-Gamma function ln Γ(z) via Lanczos and iterative upward recurrence.
 * - `'digamma'`: Complex Digamma function ψ(z) = Γ'(z)/Γ(z) via recurrence and Bernoulli series.
 * - `'erf'`: Complex error function erf(z) via iterative power series and Lentz continued fraction.
 * - `'erfc'`: Complex complementary error function erfc(z) = 1 - erf(z).
 * - `'besselJ'`: Complex Bessel function of the first kind J_ν(z) via iterative power series.
 * - `'zeta'`: Complex Riemann zeta function ζ(z) via iterative Euler-Maclaurin summation and reflection.
 *
 * @param {'gamma'|'logGamma'|'digamma'|'erf'|'erfc'|'besselJ'|'zeta'} fnName - Name of the special function to evaluate.
 * @param {{ re: number, im: number }} z - Complex input value as `{ re, im }` with finite numeric components.
 * @param {{ order?: number | { re: number, im: number }, maxIterations?: number, tolerance?: number }} [options={}] - Optional evaluation parameters (`order` for `'besselJ'`, iteration cap, and convergence tolerance).
 * @returns {{ re: number, im: number }} Complex function value `{ re, im }`.
 * @throws {TypeError} If `fnName` is not a string, `z` is not a valid `{ re, im }` object, or `options` fields have invalid types.
 * @throws {RangeError} If `fnName` is unsupported, inputs are non-finite or out of range, `z` lies on a pole/singularity, or the result overflows.
 */
export function specialFunctionsComplexIterative(fnName, z, options = {}) {
	if (typeof fnName !== 'string') {
		throw new TypeError('fnName must be a string')
	}
	if (!SUPPORTED_FUNCTIONS.has(fnName)) {
		throw new RangeError(
			`Unsupported special function "${fnName}". Supported functions: ${[...SUPPORTED_FUNCTIONS].join(', ')}`
		)
	}

	const complexZ = validateComplex(z, 'z')
	const { order, maxIterations, tolerance } = validateOptions(options)

	let result
	switch (fnName) {
		case 'gamma':
			result = complexGamma(complexZ)
			break
		case 'logGamma':
			result = complexLogGamma(complexZ)
			break
		case 'digamma':
			result = complexDigamma(complexZ)
			break
		case 'erf':
			result = complexErfAndErfc(complexZ, maxIterations, tolerance).erf
			break
		case 'erfc':
			result = complexErfAndErfc(complexZ, maxIterations, tolerance).erfc
			break
		case 'besselJ':
			result = complexBesselJ(complexZ, order, maxIterations, tolerance)
			break
		case 'zeta':
			result = complexZeta(complexZ, maxIterations)
			break
	}

	return finalizeComplex(result, fnName)
}
