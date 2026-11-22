/**
 * Fixed-point scale factor (`10^18`) used for non-integer inputs and outputs.
 */
export const SCALE = 10n ** 18n

const EXTRA_DIGITS = 20n
const EXTRA_SCALE = 10n ** EXTRA_DIGITS
const WORK_SCALE = SCALE * EXTRA_SCALE // 10^38 internal fixed-point precision

const TRIG_EXTRA = 10n ** 18n
const TRIG_SCALE = WORK_SCALE * TRIG_EXTRA // 10^56 precision for near-pole sin(pi * x)

const MAX_EXACT_N = 10000n
const MAX_BINOMIAL_N = 100000n
const MAX_HARMONIC_N = 100000n
const MAX_GAMMA_ABS = 1000n * SCALE
const MAX_BESSEL_X = 200n * SCALE
const MAX_BESSEL_N = 200n

const SUPPORTED_OPS = new Set([
	'factorial',
	'risingFactorial',
	'fallingFactorial',
	'binomial',
	'harmonic',
	'gamma',
	'lgamma',
	'beta',
	'erf',
	'erfc',
	'besselJ0',
	'besselJ1',
	'besselJn',
])

// ---------------------------------------------------------------------------
// Exact BigInt & Fixed-Point Iterative Arithmetic Helpers
// ---------------------------------------------------------------------------

function absBigInt(x) {
	return x < 0n ? -x : x
}

function gcdBigInt(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Rounds `num / den` to the nearest BigInt (ties rounded away from zero).
 */
function divRound(num, den) {
	if (den === 0n) {
		throw new RangeError('Division by zero')
	}
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const neg = n < 0n
	const absN = neg ? -n : n
	const q = absN / d
	const r = absN % d
	const rounded = r * 2n >= d ? q + 1n : q
	return neg ? -rounded : rounded
}

function mulFp(a, b, scale) {
	return divRound(a * b, scale)
}

function divFp(a, b, scale) {
	return divRound(a * scale, b)
}

/**
 * Iterative integer square root: returns floor(sqrt(n)) for n >= 0n.
 */
function isqrt(n) {
	if (n < 0n) {
		throw new RangeError('Square root of negative integer')
	}
	if (n < 2n) {
		return n
	}
	const bitLen = n.toString(2).length
	let x = 1n << BigInt((bitLen + 1) >> 1)
	while (true) {
		const next = (x + n / x) >> 1n
		if (next >= x) {
			return x
		}
		x = next
	}
}

/**
 * Fixed-point square root rounded to nearest ULP at `scale`.
 */
function sqrtFp(x, scale) {
	if (x < 0n) {
		throw new RangeError('Square root of negative fixed-point value')
	}
	if (x === 0n) {
		return 0n
	}
	const s = isqrt(4n * x * scale)
	return (s + 1n) >> 1n
}

/**
 * Iterative Machin-style arctan(1/m) at the given fixed-point scale.
 */
function atanRecipFp(m, scale) {
	const m2 = m * m
	let power = scale / m
	let sum = power
	let k = 1n
	let sign = -1n
	while (power > 0n) {
		power = power / m2
		const term = power / (2n * k + 1n)
		if (term === 0n) {
			break
		}
		sum += sign * term
		sign = -sign
		k += 1n
	}
	return sum
}

/**
 * Computes pi at `scale` via Machin's formula: pi/4 = 4*atan(1/5) - atan(1/239).
 */
function computePiFp(scale) {
	const guard = 10n ** 6n
	const w = scale * guard
	const piW = 4n * (4n * atanRecipFp(5n, w) - atanRecipFp(239n, w))
	return divRound(piW, guard)
}

/**
 * Computes ln(2) at `scale` via 2 * sum_{k>=0} 1 / ((2k+1) * 3^(2k+1)).
 */
function computeLn2Fp(scale) {
	const guard = 10n ** 6n
	const w = scale * guard
	let power = w / 3n
	let sum = power
	let k = 1n
	while (power > 0n) {
		power = power / 9n
		const term = power / (2n * k + 1n)
		if (term === 0n) {
			break
		}
		sum += term
		k += 1n
	}
	return divRound(2n * sum, guard)
}

const LOG_GUARD = 10n ** 6n
const LOG_SCALE = WORK_SCALE * LOG_GUARD
const PI_WORK = computePiFp(WORK_SCALE)
const PI_TRIG = computePiFp(TRIG_SCALE)
const SQRT_PI_WORK = sqrtFp(PI_WORK, WORK_SCALE)
const LN2_LOG = computeLn2Fp(LOG_SCALE)

/**
 * Iterative fixed-point natural logarithm for positive `x` scaled by `WORK_SCALE`.
 */
function lnWork(xWork) {
	if (xWork <= 0n) {
		throw new RangeError('Logarithm argument must be strictly positive')
	}
	const xLog = xWork * LOG_GUARD
	const bitDiff = xLog.toString(2).length - LOG_SCALE.toString(2).length
	let p = BigInt(bitDiff)

	const shiftToU = (exp) => {
		if (exp >= 0n) {
			return divRound(xLog, 1n << exp)
		}
		return xLog << -exp
	}

	const hi = (LOG_SCALE * 4n) / 3n
	const lo = (LOG_SCALE * 2n) / 3n
	let u = shiftToU(p)
	while (u > hi) {
		p += 1n
		u = shiftToU(p)
	}
	while (u < lo) {
		p -= 1n
		u = shiftToU(p)
	}

	const y = divRound((u - LOG_SCALE) * LOG_SCALE, u + LOG_SCALE)
	const y2 = divRound(y * y, LOG_SCALE)
	let term = y
	let sum = y
	for (let k = 1n; ; k += 1n) {
		term = divRound(term * y2, LOG_SCALE)
		const add = divRound(term, 2n * k + 1n)
		if (add === 0n) {
			break
		}
		sum += add
	}
	const lnU = 2n * sum
	return divRound(lnU + p * LN2_LOG, LOG_GUARD)
}

/**
 * Iterative fixed-point exponential for `x` scaled by `WORK_SCALE`.
 */
function expWork(xWork) {
	const xLog = xWork * LOG_GUARD
	const k = divRound(xLog, LN2_LOG)
	// Underflow guard: 2^(-200) < 10^(-60) << 10^(-38)
	if (k < -200n) {
		return 0n
	}
	const r = xLog - k * LN2_LOG

	let sum = LOG_SCALE
	let term = LOG_SCALE
	for (let n = 1n; ; n += 1n) {
		term = divRound(term * r, n * LOG_SCALE)
		if (term === 0n) {
			break
		}
		sum += term
	}

	if (k >= 0n) {
		return divRound(sum << k, LOG_GUARD)
	}
	return divRound(sum, LOG_GUARD << -k)
}

/**
 * Iterative sine for `theta` in [0, pi/2] scaled by `TRIG_SCALE`.
 */
function sinTrig(theta) {
	const theta2 = divRound(theta * theta, TRIG_SCALE)
	let term = theta
	let sum = theta
	for (let k = 1n; ; k += 1n) {
		term = -divRound(term * theta2, 2n * k * (2n * k + 1n) * TRIG_SCALE)
		if (term === 0n) {
			break
		}
		sum += term
	}
	return sum
}

const HALF_LN_2PI_WORK = divRound(lnWork(2n * PI_WORK), 2n)
const LN_PI_WORK = lnWork(PI_WORK)

/**
 * Iteratively computes exact rational Bernoulli numbers B_{2k} for k = 1..maxK.
 * Returns array of `{ num, den }` pairs where B_{2k} = num / den.
 */
function computeEvenBernoulli(maxK) {
	const maxM = 2 * maxK
	// Store B_0 .. B_maxM as exact reduced rationals { num, den }
	const B = [{ num: 1n, den: 1n }]
	for (let m = 1; m <= maxM; m += 1) {
		if (m > 1 && m % 2 === 1) {
			B.push({ num: 0n, den: 1n })
			continue
		}
		// sum_{j=0}^{m-1} C(m+1, j) * B_j
		let sumNum = 0n
		let sumDen = 1n
		let binom = 1n // C(m+1, 0)
		const mp1 = BigInt(m + 1)
		for (let j = 0; j < m; j += 1) {
			if (j > 0) {
				binom = (binom * (mp1 - BigInt(j - 1))) / BigInt(j)
			}
			const bj = B[j]
			if (bj.num !== 0n) {
				const termNum = binom * bj.num
				const termDen = bj.den
				const newNum = sumNum * termDen + termNum * sumDen
				const newDen = sumDen * termDen
				const g = gcdBigInt(newNum, newDen)
				sumNum = newNum / g
				sumDen = newDen / g
			}
		}
		const num = -sumNum
		const den = sumDen * mp1
		const g = gcdBigInt(num, den)
		B.push({ num: num / g, den: den / g })
	}

	const even = []
	for (let k = 1; k <= maxK; k += 1) {
		even.push(B[2 * k])
	}
	return even
}

const STIRLING_TERMS = computeEvenBernoulli(15).map((b, idx) => {
	const k = BigInt(idx + 1)
	const denomFactor = 2n * k * (2n * k - 1n)
	const num = b.num
	const den = b.den * denomFactor
	const g = gcdBigInt(num, den)
	return { num: num / g, den: den / g }
})

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

function assertArity(op, args, expected) {
	if (args.length !== expected) {
		throw new TypeError(`${op} expects ${expected} argument(s), received ${args.length}`)
	}
}

function assertBigInt(value, name) {
	if (typeof value !== 'bigint') {
		throw new TypeError(`${name} must be a BigInt, received ${typeof value}`)
	}
}

function assertNonNegativeInteger(value, name, max) {
	assertBigInt(value, name)
	if (value < 0n) {
		throw new RangeError(`${name} must be a non-negative BigInt`)
	}
	if (max !== undefined && value > max) {
		throw new RangeError(`${name} exceeds maximum supported value (${max})`)
	}
}

function isNonPositiveIntegerScaled(xScaled) {
	return xScaled <= 0n && xScaled % SCALE === 0n
}

// ---------------------------------------------------------------------------
// Special Function Implementations (Iterative)
// ---------------------------------------------------------------------------

function factorialExact(n) {
	let result = 1n
	for (let i = 2n; i <= n; i += 1n) {
		result *= i
	}
	return result
}

function risingFactorialExact(x, n) {
	let result = 1n
	for (let i = 0n; i < n; i += 1n) {
		result *= x + i
	}
	return result
}

function fallingFactorialExact(x, n) {
	let result = 1n
	for (let i = 0n; i < n; i += 1n) {
		result *= x - i
	}
	return result
}

function binomialExact(n, k) {
	if (k > n) {
		return 0n
	}
	const r = k < n - k ? k : n - k
	let result = 1n
	for (let i = 1n; i <= r; i += 1n) {
		result = (result * (n - r + i)) / i
	}
	return result
}

function harmonicFixed(n) {
	if (n === 0n) {
		return 0n
	}
	let sum = 0n
	for (let k = 1n; k <= n; k += 1n) {
		sum += divRound(WORK_SCALE, k)
	}
	return divRound(sum, EXTRA_SCALE)
}

/**
 * Computes ln(Gamma(x)) for strictly positive `xWork` scaled by `WORK_SCALE`,
 * using iterative upward shift to z >= 30 followed by Stirling's series.
 */
function lgammaPositiveWork(xWork) {
	const minZ = 30n * WORK_SCALE
	let z = xWork
	let shiftLog = 0n

	if (z < minZ) {
		// Multiply shifted factors in fixed-point chunks to keep lnWork calls minimal
		let prod = WORK_SCALE
		while (z < minZ) {
			prod = mulFp(prod, z, WORK_SCALE)
			z += WORK_SCALE
		}
		shiftLog = lnWork(prod)
	}

	const lnZ = lnWork(z)
	const half = WORK_SCALE / 2n
	let res = mulFp(z - half, lnZ, WORK_SCALE) - z + HALF_LN_2PI_WORK

	const invZ = divFp(WORK_SCALE, z, WORK_SCALE)
	const invZ2 = mulFp(invZ, invZ, WORK_SCALE)
	let invZPow = invZ // z^(-1), then z^(-3), z^(-5), ...

	for (let i = 0; i < STIRLING_TERMS.length; i += 1) {
		const { num, den } = STIRLING_TERMS[i]
		const term = divRound(num * invZPow, den)
		res += term
		if (absBigInt(term) === 0n) {
			break
		}
		invZPow = mulFp(invZPow, invZ2, WORK_SCALE)
	}

	return res - shiftLog
}

/**
 * Computes `{ value: ln|Gamma(x)| (at WORK_SCALE), sign: 1n | -1n }`
 * for any non-pole fixed-point `xScaled` (scaled by `SCALE`).
 */
function lgammaWithSignWork(xScaled) {
	if (isNonPositiveIntegerScaled(xScaled)) {
		throw new RangeError('Gamma function has a pole at non-positive integers')
	}
	if (xScaled > 0n) {
		return {
			value: lgammaPositiveWork(xScaled * EXTRA_SCALE),
			sign: 1n,
		}
	}

	// Euler's reflection formula for x < 0:
	// Gamma(x) * Gamma(1 - x) = pi / sin(pi * x)
	// Decompose x = floor(x) + frac with 0 < frac < SCALE (exact!)
	const rem = xScaled % SCALE // in (-SCALE, 0) since xScaled < 0 and not integer
	const frac = rem + SCALE // in (0, SCALE)
	const floorN = (xScaled - frac) / SCALE // exact integer floor(x)
	const sign = floorN % 2n === 0n ? 1n : -1n

	const u = frac <= SCALE - frac ? frac : SCALE - frac // in (0, SCALE/2]
	const theta = divRound(PI_TRIG * u, SCALE)
	const sinValTrig = sinTrig(theta) // strictly positive, scaled by TRIG_SCALE

	// Compute ln(sin(pi * u)) at WORK_SCALE without losing precision when u is tiny:
	// ln(sinValTrig / TRIG_SCALE) = ln(sinValTrig / WORK_SCALE) - ln(TRIG_EXTRA)
	// Scale sinValTrig to roughly WORK_SCALE by multiplying by 10^18 if needed, or
	// split as sinValTrig / 10^18 if large enough. Since u >= 1/10^18, sinValTrig >= ~3.14 * 10^38 > WORK_SCALE!
	const lnSin = lnWork(sinValTrig) - lnWork(TRIG_EXTRA * WORK_SCALE)
	const lgOneMinusX = lgammaPositiveWork((SCALE - xScaled) * EXTRA_SCALE)

	return {
		value: LN_PI_WORK - lnSin - lgOneMinusX,
		sign,
	}
}

function gammaFixed(xScaled) {
	if (isNonPositiveIntegerScaled(xScaled)) {
		throw new RangeError('gamma is undefined at non-positive integers')
	}
	if (absBigInt(xScaled) > MAX_GAMMA_ABS) {
		throw new RangeError(`gamma argument magnitude exceeds maximum (${MAX_GAMMA_ABS / SCALE})`)
	}
	// Exact shortcut for positive integers: Gamma(n) = (n - 1)!
	if (xScaled > 0n && xScaled % SCALE === 0n) {
		const n = xScaled / SCALE
		return factorialExact(n - 1n) * SCALE
	}
	const { value, sign } = lgammaWithSignWork(xScaled)
	const magWork = expWork(value)
	const magScaled = divRound(magWork, EXTRA_SCALE)
	return sign * magScaled
}

function lgammaFixed(xScaled) {
	if (isNonPositiveIntegerScaled(xScaled)) {
		throw new RangeError('lgamma is undefined at non-positive integers')
	}
	if (absBigInt(xScaled) > MAX_GAMMA_ABS) {
		throw new RangeError(`lgamma argument magnitude exceeds maximum (${MAX_GAMMA_ABS / SCALE})`)
	}
	if (xScaled === SCALE || xScaled === 2n * SCALE) {
		return 0n
	}
	const { value } = lgammaWithSignWork(xScaled)
	return divRound(value, EXTRA_SCALE)
}

function betaFixed(aScaled, bScaled) {
	if (isNonPositiveIntegerScaled(aScaled) || isNonPositiveIntegerScaled(bScaled)) {
		throw new RangeError('beta is undefined when a or b is a non-positive integer')
	}
	if (absBigInt(aScaled) > MAX_GAMMA_ABS || absBigInt(bScaled) > MAX_GAMMA_ABS) {
		throw new RangeError(`beta argument magnitude exceeds maximum (${MAX_GAMMA_ABS / SCALE})`)
	}
	const sumScaled = aScaled + bScaled
	if (isNonPositiveIntegerScaled(sumScaled)) {
		// 1 / Gamma(a + b) = 0 while Gamma(a) and Gamma(b) are finite
		return 0n
	}
	// Exact rational computation when both a and b are positive integers:
	// B(a, b) = (a-1)! (b-1)! / (a+b-1)! = 1 / ((a + b - 1) * C(a + b - 2, a - 1))
	if (aScaled > 0n && bScaled > 0n && aScaled % SCALE === 0n && bScaled % SCALE === 0n) {
		const a = aScaled / SCALE
		const b = bScaled / SCALE
		const denom = (a + b - 1n) * binomialExact(a + b - 2n, a - 1n)
		return divRound(SCALE, denom)
	}
	const lgA = lgammaWithSignWork(aScaled)
	const lgB = lgammaWithSignWork(bScaled)
	const lgAB = lgammaWithSignWork(sumScaled)
	const sign = lgA.sign * lgB.sign * lgAB.sign
	const magWork = expWork(lgA.value + lgB.value - lgAB.value)
	return sign * divRound(magWork, EXTRA_SCALE)
}

/**
 * Computes erf(|x|) via non-alternating series for |x| <= 4:
 * erf(x) = (2 / sqrt(pi)) * exp(-x^2) * sum_{n>=0} (2^n * x^(2n+1)) / (2n+1)!!
 */
function erfSeriesNonNegWork(absXScaled) {
	const xWork = absXScaled * EXTRA_SCALE
	const x2Work = mulFp(xWork, xWork, WORK_SCALE)
	const twoX2Work = 2n * x2Work

	let term = xWork
	let sum = xWork
	for (let n = 1n; ; n += 1n) {
		term = divRound(term * twoX2Work, (2n * n + 1n) * WORK_SCALE)
		if (term === 0n) {
			break
		}
		sum += term
	}
	const factor = divFp(2n * expWork(-x2Work), SQRT_PI_WORK, WORK_SCALE)
	return mulFp(factor, sum, WORK_SCALE)
}

/**
 * Computes erfc(x) for x > 4 via exact-rational iterative convergents of the
 * Laplace continued fraction:
 * erfc(x) = (exp(-x^2) / sqrt(pi)) * (2q / (p + 2q^2 / (p + 4q^2 / (p + ...))))
 * where 2x = p / q with p = 2 * absXScaled and q = SCALE.
 */
function erfcContinuedFractionWork(absXScaled) {
	const p = 2n * absXScaled
	const q = SCALE
	const q2 = q * q

	let aPrev2 = 1n
	let aPrev1 = 0n
	let bPrev2 = 0n
	let bPrev1 = 1n
	let prevRatio = -1n
	let ratioWork = 0n

	for (let n = 1n; n <= 400n; n += 1n) {
		const an = n === 1n ? 2n * q : 2n * (n - 1n) * q2
		const aCurr = p * aPrev1 + an * aPrev2
		const bCurr = p * bPrev1 + an * bPrev2

		ratioWork = divRound(aCurr * WORK_SCALE, bCurr)
		if (n > 2n && ratioWork === prevRatio) {
			break
		}
		prevRatio = ratioWork
		aPrev2 = aPrev1
		aPrev1 = aCurr
		bPrev2 = bPrev1
		bPrev1 = bCurr
	}

	const xWork = absXScaled * EXTRA_SCALE
	const x2Work = mulFp(xWork, xWork, WORK_SCALE)
	const pref = divFp(expWork(-x2Work), SQRT_PI_WORK, WORK_SCALE)
	return mulFp(pref, ratioWork, WORK_SCALE)
}

function erfFixed(xScaled) {
	if (xScaled === 0n) {
		return 0n
	}
	const neg = xScaled < 0n
	const absX = neg ? -xScaled : xScaled
	// For |x| >= 7, erfc(|x|) < 5e-23 << 0.5 * 10^-18
	if (absX >= 7n * SCALE) {
		return neg ? -SCALE : SCALE
	}
	let resWork
	if (absX <= 4n * SCALE) {
		resWork = erfSeriesNonNegWork(absX)
	} else {
		resWork = WORK_SCALE - erfcContinuedFractionWork(absX)
	}
	const resScaled = divRound(resWork, EXTRA_SCALE)
	return neg ? -resScaled : resScaled
}

function erfcFixed(xScaled) {
	if (xScaled === 0n) {
		return SCALE
	}
	if (xScaled >= 7n * SCALE) {
		return 0n
	}
	if (xScaled <= -7n * SCALE) {
		return 2n * SCALE
	}
	if (xScaled > 4n * SCALE) {
		return divRound(erfcContinuedFractionWork(xScaled), EXTRA_SCALE)
	}
	if (xScaled > 0n) {
		return divRound(WORK_SCALE - erfSeriesNonNegWork(xScaled), EXTRA_SCALE)
	}
	// x < 0: erfc(x) = 1 + erf(|x|)
	const absX = -xScaled
	let erfAbsWork
	if (absX <= 4n * SCALE) {
		erfAbsWork = erfSeriesNonNegWork(absX)
	} else {
		erfAbsWork = WORK_SCALE - erfcContinuedFractionWork(absX)
	}
	return divRound(WORK_SCALE + erfAbsWork, EXTRA_SCALE)
}

/**
 * Iterative Bessel function of the first kind J_n(x) for integer n and fixed-point x.
 * Uses dynamic guard precision to absorb alternating-series cancellation cleanly.
 */
function besselJnFixed(n, xScaled) {
	if (absBigInt(n) > MAX_BESSEL_N) {
		throw new RangeError(`besselJn order magnitude exceeds maximum (${MAX_BESSEL_N})`)
	}
	if (absBigInt(xScaled) > MAX_BESSEL_X) {
		throw new RangeError(`besselJn argument magnitude exceeds maximum (${MAX_BESSEL_X / SCALE})`)
	}

	// Symmetry: J_{-n}(x) = (-1)^n J_n(x)
	let sign = 1n
	let order = n
	if (order < 0n) {
		order = -order
		if (order % 2n === 1n) {
			sign = -sign
		}
	}

	if (xScaled === 0n) {
		return order === 0n ? SCALE : 0n
	}

	// Symmetry: J_order(-x) = (-1)^order J_order(x)
	let absX = xScaled
	if (absX < 0n) {
		absX = -absX
		if (order % 2n === 1n) {
			sign = -sign
		}
	}

	// Peak term in alternating series grows like ~exp(|x|); add enough guard digits
	// to retain full 18-digit accuracy after cancellation.
	const absXInt = absX / SCALE + 1n
	const extraDigits = 20n + (absXInt * 45n) / 100n + 6n
	const guard = 10n ** extraDigits
	const localScale = SCALE * guard

	const halfX = divRound(absX * guard, 2n)
	const halfX2 = divRound(halfX * halfX, localScale)

	// Initial term: (x/2)^order / order!
	let term = localScale
	for (let i = 1n; i <= order; i += 1n) {
		term = divRound(term * halfX, i * localScale)
	}

	let sum = term
	for (let k = 1n; ; k += 1n) {
		term = -divRound(term * halfX2, k * (order + k) * localScale)
		if (term === 0n) {
			break
		}
		sum += term
	}

	return sign * divRound(sum, guard)
}

// ---------------------------------------------------------------------------
// Public Entry Point
// ---------------------------------------------------------------------------

/**
 * Evaluates classic mathematical special functions over exact `BigInt` integers
 * and fixed-point `BigInt` values scaled by `10^18` (`SCALE`) using straightforward
 * iterative algorithms (zero dependencies).
 *
 * Supported operations:
 * - `'factorial'` (`n: bigint`): exact `n!` for `0n <= n <= 10000n`.
 * - `'risingFactorial'` (`x: bigint, n: bigint`): exact Pochhammer `(x)_n` for `0n <= n <= 10000n`.
 * - `'fallingFactorial'` (`x: bigint, n: bigint`): exact falling factorial `x(x-1)...(x-n+1)` for `0n <= n <= 10000n`.
 * - `'binomial'` (`n: bigint, k: bigint`): exact binomial coefficient `C(n, k)` for `0n <= n <= 100000n, k >= 0n`.
 * - `'harmonic'` (`n: bigint`): fixed-point `H_n = sum_{k=1}^n 1/k` scaled by `10^18` for `0n <= n <= 100000n`.
 * - `'gamma'` (`x: bigint`): fixed-point `Gamma(x)` (`x` and result scaled by `10^18`, `|x| <= 1000`, non-pole).
 * - `'lgamma'` (`x: bigint`): fixed-point `ln|Gamma(x)|` (`x` and result scaled by `10^18`, `|x| <= 1000`, non-pole).
 * - `'beta'` (`a: bigint, b: bigint`): fixed-point `B(a, b)` (`a`, `b`, result scaled by `10^18`, non-pole `a, b`).
 * - `'erf'` (`x: bigint`): fixed-point error function `erf(x)` (`x` and result scaled by `10^18`).
 * - `'erfc'` (`x: bigint`): fixed-point complementary error function `erfc(x)` (`x` and result scaled by `10^18`).
 * - `'besselJ0'` (`x: bigint`): fixed-point Bessel `J_0(x)` (`x` and result scaled by `10^18`, `|x| <= 200`).
 * - `'besselJ1'` (`x: bigint`): fixed-point Bessel `J_1(x)` (`x` and result scaled by `10^18`, `|x| <= 200`).
 * - `'besselJn'` (`n: bigint, x: bigint`): fixed-point Bessel `J_n(x)` (exact integer `|n| <= 200`, fixed-point `|x| <= 200`).
 *
 * @param {string} op - Name of the special function to compute.
 * @param {...bigint} args - Exact or `10^18`-scaled `BigInt` arguments for `op`.
 * @returns {bigint} Exact `BigInt` (combinatorial ops) or `10^18`-scaled fixed-point `BigInt`.
 * @throws {TypeError} If `op` is not a string, argument count is wrong, or any argument is not a `BigInt`.
 * @throws {RangeError} If `op` is unsupported or any argument lies outside the valid domain.
 */
export function specialFunctionsBigIntIterative(op, ...args) {
	if (typeof op !== 'string') {
		throw new TypeError(`op must be a string, received ${typeof op}`)
	}
	if (!SUPPORTED_OPS.has(op)) {
		throw new RangeError(`Unsupported special function operation: "${op}"`)
	}

	switch (op) {
		case 'factorial': {
			assertArity(op, args, 1)
			const [n] = args
			assertNonNegativeInteger(n, 'n', MAX_EXACT_N)
			return factorialExact(n)
		}
		case 'risingFactorial': {
			assertArity(op, args, 2)
			const [x, n] = args
			assertBigInt(x, 'x')
			assertNonNegativeInteger(n, 'n', MAX_EXACT_N)
			return risingFactorialExact(x, n)
		}
		case 'fallingFactorial': {
			assertArity(op, args, 2)
			const [x, n] = args
			assertBigInt(x, 'x')
			assertNonNegativeInteger(n, 'n', MAX_EXACT_N)
			return fallingFactorialExact(x, n)
		}
		case 'binomial': {
			assertArity(op, args, 2)
			const [n, k] = args
			assertNonNegativeInteger(n, 'n', MAX_BINOMIAL_N)
			assertNonNegativeInteger(k, 'k')
			return binomialExact(n, k)
		}
		case 'harmonic': {
			assertArity(op, args, 1)
			const [n] = args
			assertNonNegativeInteger(n, 'n', MAX_HARMONIC_N)
			return harmonicFixed(n)
		}
		case 'gamma': {
			assertArity(op, args, 1)
			const [x] = args
			assertBigInt(x, 'x')
			return gammaFixed(x)
		}
		case 'lgamma': {
			assertArity(op, args, 1)
			const [x] = args
			assertBigInt(x, 'x')
			return lgammaFixed(x)
		}
		case 'beta': {
			assertArity(op, args, 2)
			const [a, b] = args
			assertBigInt(a, 'a')
			assertBigInt(b, 'b')
			return betaFixed(a, b)
		}
		case 'erf': {
			assertArity(op, args, 1)
			const [x] = args
			assertBigInt(x, 'x')
			return erfFixed(x)
		}
		case 'erfc': {
			assertArity(op, args, 1)
			const [x] = args
			assertBigInt(x, 'x')
			return erfcFixed(x)
		}
		case 'besselJ0': {
			assertArity(op, args, 1)
			const [x] = args
			assertBigInt(x, 'x')
			return besselJnFixed(0n, x)
		}
		case 'besselJ1': {
			assertArity(op, args, 1)
			const [x] = args
			assertBigInt(x, 'x')
			return besselJnFixed(1n, x)
		}
		case 'besselJn': {
			assertArity(op, args, 2)
			const [n, x] = args
			assertBigInt(n, 'n')
			assertBigInt(x, 'x')
			return besselJnFixed(n, x)
		}
		default:
			throw new RangeError(`Unsupported special function operation: "${op}"`)
	}
}
