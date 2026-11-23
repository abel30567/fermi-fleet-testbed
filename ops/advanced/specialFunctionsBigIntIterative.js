/**
 * Fixed-point scale factor (10^18) used for special functions whose values
 * are non-integer.
 * @type {bigint}
 */
export const SCALE = 10n ** 18n

const EXTRA_SCALE = 10n ** 22n
const WORK_SCALE = SCALE * EXTRA_SCALE // 10^40

/**
 * Exact half-away-from-zero integer division for BigInt values.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {bigint}
 */
function roundDiv(num, den) {
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

/**
 * Iterative Newton-Raphson integer square root: floor(sqrt(n)) for n >= 0n.
 * @param {bigint} n
 * @returns {bigint}
 */
function isqrt(n) {
	if (n < 0n) {
		throw new RangeError('Square root of negative BigInt')
	}
	if (n < 2n) return n
	const bitLen = BigInt(n.toString(2).length)
	let x = 1n << ((bitLen + 1n) >> 1n)
	while (true) {
		const y = (x + n / x) >> 1n
		if (y >= x) return x
		x = y
	}
}

/**
 * Iterative series for arctan(1 / m) scaled by `scale`.
 * @param {bigint} m
 * @param {bigint} scale
 * @returns {bigint}
 */
function atanRecip(m, scale) {
	const m2 = m * m
	let power = scale / m
	let sum = power
	let k = 1n
	while (power !== 0n) {
		power /= m2
		if (power === 0n) break
		const term = power / (2n * k + 1n)
		if (term === 0n) break
		if ((k & 1n) === 1n) {
			sum -= term
		} else {
			sum += term
		}
		k += 1n
	}
	return sum
}

/**
 * Computes pi scaled by 10^digits iteratively via Machin's formula:
 * pi / 4 = 4 * atan(1/5) - atan(1/239).
 * @param {bigint} digits
 * @returns {bigint}
 */
function computePiScaled(digits) {
	const guard = 10n
	const extScale = 10n ** (digits + guard)
	const raw = 4n * (4n * atanRecip(5n, extScale) - atanRecip(239n, extScale))
	return roundDiv(raw, 10n ** guard)
}

/**
 * Computes sqrt(pi) scaled by 10^40 iteratively.
 * @returns {bigint}
 */
function computeSqrtPiWork() {
	const piHigh = computePiScaled(84n)
	const sqrtHigh = isqrt(piHigh) // scaled by 10^42
	return roundDiv(sqrtHigh, 100n) // scaled by 10^40
}

/**
 * Computes ln(2) scaled by `scale` iteratively via 2 * atanh(1/3).
 * @param {bigint} scale
 * @returns {bigint}
 */
function computeLn2Scaled(scale) {
	const guard = 10n ** 8n
	const extScale = scale * guard
	let power = extScale / 3n
	let sum = power
	let k = 1n
	while (power !== 0n) {
		power /= 9n
		if (power === 0n) break
		const term = power / (2n * k + 1n)
		if (term === 0n) break
		sum += term
		k += 1n
	}
	return roundDiv(2n * sum, guard)
}

/**
 * Computes ln(m) scaled by `scale` for any positive integer BigInt m >= 1n
 * using argument reduction m = 2^p * r (with r in [2/3, 4/3]) and the
 * iterative atanh series ln(r) = 2 * sum_{j>=0} u^(2j+1) / (2j+1),
 * where u = (r - 1) / (r + 1).
 * @param {bigint} m
 * @param {bigint} scale
 * @param {bigint} ln2Scale
 * @returns {bigint}
 */
function lnIntegerScaled(m, scale, ln2Scale) {
	if (m === 1n) return 0n
	const guard = 10n ** 8n
	const extScale = scale * guard
	const bitLen = BigInt(m.toString(2).length)
	let p = bitLen - 1n
	// Choose p so that m / 2^p is in [2/3, 4/3], keeping |u| <= 1/5
	if (3n * m > (1n << (p + 2n))) {
		p += 1n
	}
	const pow2 = 1n << p
	// u = (m - pow2) / (m + pow2)
	const num = m - pow2
	const den = m + pow2
	let sum = 0n
	if (num !== 0n) {
		const num2 = num * num
		const den2 = den * den
		// First term (j = 0): (num / den) * extScale
		let power = (num * extScale) / den
		sum = power
		let j = 1n
		while (power !== 0n) {
			power = (power * num2) / den2
			if (power === 0n) break
			const term = power / (2n * j + 1n)
			if (term === 0n) break
			sum += term
			j += 1n
		}
	}
	const lnRatio = roundDiv(2n * sum, guard)
	return p * ln2Scale + lnRatio
}

/**
 * Computes the Euler-Mascheroni constant gamma scaled by 10^40 iteratively
 * using the Brent-McMillan Bessel identity:
 *   gamma = S_0(n) / I_0(2n) - ln(n) + O(pi * e^(-4n))
 * With n = 26, pi * e^(-104) < 3e-45, providing > 44 digits of accuracy.
 * @param {bigint} ln2Work
 * @returns {bigint}
 */
function computeEulerMascheroniWork(ln2Work) {
	const n = 26n
	const n2 = n * n
	const prec = 10n ** 60n
	const hScale = 10n ** 60n

	let term = prec
	let i0 = prec
	let s0 = 0n
	let h = 0n
	let k = 1n

	while (term !== 0n) {
		term = (term * n2) / (k * k)
		if (term === 0n) break
		h += hScale / k
		i0 += term
		s0 += (term * h) / hScale
		k += 1n
	}

	const ratioWork = roundDiv(s0 * WORK_SCALE, i0)
	const lnNWork = lnIntegerScaled(n, WORK_SCALE, ln2Work)
	return ratioWork - lnNWork
}

// Lazily cached high-precision constants (40 decimal digits), computed iteratively
let cachedLn2Work = null
let cachedSqrtPiWork = null
let cachedGammaWork = null

function getLn2Work() {
	if (cachedLn2Work === null) {
		cachedLn2Work = computeLn2Scaled(WORK_SCALE)
	}
	return cachedLn2Work
}

function getSqrtPiWork() {
	if (cachedSqrtPiWork === null) {
		cachedSqrtPiWork = computeSqrtPiWork()
	}
	return cachedSqrtPiWork
}

function getGammaWork() {
	if (cachedGammaWork === null) {
		cachedGammaWork = computeEulerMascheroniWork(getLn2Work())
	}
	return cachedGammaWork
}

// --- Exact integer-valued special functions ---

function factorial(n) {
	let result = 1n
	for (let i = 2n; i <= n; i += 1n) {
		result *= i
	}
	return result
}

function doubleFactorial(n) {
	let result = 1n
	for (let i = n; i > 1n; i -= 2n) {
		result *= i
	}
	return result
}

function binomial(n, k) {
	if (k > n) return 0n
	const m = k < n - k ? k : n - k
	let result = 1n
	for (let i = 1n; i <= m; i += 1n) {
		result = (result * (n - m + i)) / i
	}
	return result
}

function risingFactorial(x, n) {
	let result = 1n
	for (let i = 0n; i < n; i += 1n) {
		result *= x + i
	}
	return result
}

function fallingFactorial(x, n) {
	let result = 1n
	for (let i = 0n; i < n; i += 1n) {
		result *= x - i
	}
	return result
}

function catalan(n) {
	return binomial(2n * n, n) / (n + 1n)
}

function chebyshevT(n, x) {
	if (n === 0n) return 1n
	if (n === 1n) return x
	let prev2 = 1n
	let prev1 = x
	for (let k = 2n; k <= n; k += 1n) {
		const curr = 2n * x * prev1 - prev2
		prev2 = prev1
		prev1 = curr
	}
	return prev1
}

function hermiteH(n, x) {
	if (n === 0n) return 1n
	if (n === 1n) return 2n * x
	let prev2 = 1n
	let prev1 = 2n * x
	for (let k = 1n; k < n; k += 1n) {
		const curr = 2n * x * prev1 - 2n * k * prev2
		prev2 = prev1
		prev1 = curr
	}
	return prev1
}

// --- Non-integer-valued special functions (fixed-point BigInt scaled by 10^18) ---

function beta(a, b) {
	// B(a, b) = (a-1)!(b-1)! / (a+b-1)! = 1 / (a * C(a+b-1, a))
	const small = a <= b ? a : b
	const denom = small * binomial(a + b - 1n, small)
	return roundDiv(SCALE, denom)
}

function harmonicWork(n) {
	let sum = 0n
	for (let k = 1n; k <= n; k += 1n) {
		sum += roundDiv(WORK_SCALE, k)
	}
	return sum
}

function harmonic(n) {
	if (n === 0n) return 0n
	return roundDiv(harmonicWork(n), EXTRA_SCALE)
}

function digamma(n) {
	const valueWork = -getGammaWork() + harmonicWork(n - 1n)
	return roundDiv(valueWork, EXTRA_SCALE)
}

function lnGamma(n) {
	if (n <= 2n) return 0n
	const fact = factorial(n - 1n)
	const valueWork = lnIntegerScaled(fact, WORK_SCALE, getLn2Work())
	return roundDiv(valueWork, EXTRA_SCALE)
}

function zeta(s) {
	// For s >= 61, 2^(-s) < 0.5 * 10^(-18), so zeta(s) rounds exactly to 1.0
	if (s >= 61n) return SCALE

	// Borwein's iterative convergence-acceleration algorithm for eta(s)
	const N = 45n
	const d = new Array(Number(N) + 1)
	let term = 1n
	let acc = 1n
	d[0] = acc
	for (let i = 1n; i <= N; i += 1n) {
		term = (term * 2n * (N + i - 1n) * (N - i + 1n)) / (i * (2n * i - 1n))
		acc += term
		d[Number(i)] = acc
	}
	const dN = d[Number(N)]

	let sum = 0n
	for (let k = 0n; k < N; k += 1n) {
		const denom = (k + 1n) ** s
		const coeff = dN - d[Number(k)]
		const contrib = (coeff * WORK_SCALE) / denom
		if ((k & 1n) === 0n) {
			sum += contrib
		} else {
			sum -= contrib
		}
	}

	const pow2 = 1n << (s - 1n)
	const zetaWork = roundDiv(sum * pow2, dN * (pow2 - 1n))
	return roundDiv(zetaWork, EXTRA_SCALE)
}

/**
 * Computes erf(x) scaled by WORK_SCALE (10^40) for positive integer 1 <= x <= 6
 * using the strictly-positive Kummer series:
 *   erf(x) = (2 / sqrt(pi)) * [sum_{k>=0} 2^k x^(2k+1) / (2k+1)!!] / [sum_{k>=0} x^(2k) / k!]
 * @param {bigint} x
 * @returns {bigint}
 */
function erfPositiveWork(x) {
	const x2 = x * x

	// Numerator series: sum_{k>=0} 2^k * x^(2k+1) / (2k+1)!!
	let numTerm = x * WORK_SCALE
	let numSum = numTerm
	let k = 1n
	while (numTerm !== 0n) {
		numTerm = (numTerm * 2n * x2) / (2n * k + 1n)
		if (numTerm === 0n) break
		numSum += numTerm
		k += 1n
	}

	// Denominator series: e^(x^2) = sum_{k>=0} x^(2k) / k!
	let denTerm = WORK_SCALE
	let denSum = denTerm
	k = 1n
	while (denTerm !== 0n) {
		denTerm = (denTerm * x2) / k
		if (denTerm === 0n) break
		denSum += denTerm
		k += 1n
	}

	const sqrtPiWork = getSqrtPiWork()
	return roundDiv(2n * numSum * WORK_SCALE * WORK_SCALE, sqrtPiWork * denSum)
}

function erf(x) {
	if (x === 0n) return 0n
	const neg = x < 0n
	const absX = neg ? -x : x
	let result
	if (absX >= 7n) {
		// erfc(7) ~ 4.18e-23 < 0.5e-18
		result = SCALE
	} else {
		result = roundDiv(erfPositiveWork(absX), EXTRA_SCALE)
	}
	return neg ? -result : result
}

function erfc(x) {
	if (x === 0n) return SCALE
	if (x >= 7n) return 0n
	if (x <= -7n) return 2n * SCALE
	if (x > 0n) {
		const erfW = erfPositiveWork(x)
		return roundDiv(WORK_SCALE - erfW, EXTRA_SCALE)
	}
	const erfW = erfPositiveWork(-x)
	return roundDiv(WORK_SCALE + erfW, EXTRA_SCALE)
}

function besselJ(n, x) {
	let negSign = false
	let absN = n
	let absX = x
	if (absN < 0n) {
		absN = -absN
		if ((absN & 1n) === 1n) negSign = !negSign
	}
	if (absX < 0n) {
		absX = -absX
		if ((absN & 1n) === 1n) negSign = !negSign
	}

	if (absX === 0n) {
		return absN === 0n ? SCALE : 0n
	}

	// Dynamic guard digits to absorb alternating-series cancellation (~e^|x|)
	const extraDigits = 24n + (absX + 1n) / 2n
	const guardScale = 10n ** extraDigits
	const localScale = SCALE * guardScale

	const x2 = absX * absX
	const denom0 = (1n << absN) * factorial(absN)
	let term = ((absX ** absN) * localScale) / denom0
	let sum = term
	let k = 1n

	while (term !== 0n) {
		term = (term * x2) / (4n * k * (absN + k))
		if (term === 0n) break
		if ((k & 1n) === 1n) {
			sum -= term
		} else {
			sum += term
		}
		k += 1n
	}

	const result = roundDiv(sum, guardScale)
	return negSign ? -result : result
}

function legendreP(n, x) {
	if (n === 0n) return SCALE
	if (n === 1n) return x * SCALE
	// Q_k = 2^k * P_k(x) is always an exact integer for integer x:
	//   Q_0 = 1, Q_1 = 2x, (k+1) * Q_{k+1} = 2*(2k+1)*x*Q_k - 4*k*Q_{k-1}
	let qPrev2 = 1n
	let qPrev1 = 2n * x
	for (let k = 1n; k < n; k += 1n) {
		const qCurr = (2n * (2n * k + 1n) * x * qPrev1 - 4n * k * qPrev2) / (k + 1n)
		qPrev2 = qPrev1
		qPrev1 = qCurr
	}
	return roundDiv(qPrev1 * SCALE, 1n << n)
}

// --- Input validation helpers ---

function assertBigInt(value, name) {
	if (typeof value !== 'bigint') {
		throw new TypeError(`Expected "${name}" to be a BigInt, got ${value === null ? 'null' : typeof value}`)
	}
}

function assertArity(args, expected, op) {
	if (args.length !== expected) {
		throw new RangeError(`Operation "${op}" expects ${expected} argument(s), got ${args.length}`)
	}
}

function assertNonNegative(value, name, op) {
	if (value < 0n) {
		throw new RangeError(`Operation "${op}" requires "${name}" >= 0n, got ${value}n`)
	}
}

function assertPositive(value, name, op) {
	if (value < 1n) {
		throw new RangeError(`Operation "${op}" requires "${name}" >= 1n, got ${value}n`)
	}
}

const SUPPORTED_OPS = [
	'factorial',
	'doubleFactorial',
	'gamma',
	'binomial',
	'risingFactorial',
	'fallingFactorial',
	'catalan',
	'chebyshevT',
	'hermiteH',
	'beta',
	'harmonic',
	'digamma',
	'lnGamma',
	'zeta',
	'erf',
	'erfc',
	'besselJ',
	'legendreP',
]

/**
 * Evaluates advanced mathematical special functions over exact BigInt integer inputs
 * using straightforward iterative BigInt algorithms.
 *
 * Integer-valued operations return an exact `BigInt`:
 * - `'factorial'` `(n)` — n! for n >= 0n
 * - `'doubleFactorial'` `(n)` — n!! for n >= 0n
 * - `'gamma'` `(n)` — Gamma(n) = (n - 1)! for n >= 1n
 * - `'binomial'` `(n, k)` — C(n, k) for n >= 0n, k >= 0n (returns 0n if k > n)
 * - `'risingFactorial'` `(x, n)` — Pochhammer symbol (x)_n for integer x, n >= 0n
 * - `'fallingFactorial'` `(x, n)` — falling factorial x^(n) for integer x, n >= 0n
 * - `'catalan'` `(n)` — n-th Catalan number C_n for n >= 0n
 * - `'chebyshevT'` `(n, x)` — Chebyshev polynomial of the first kind T_n(x) for n >= 0n
 * - `'hermiteH'` `(n, x)` — Physicist's Hermite polynomial H_n(x) for n >= 0n
 *
 * Non-integer-valued operations return a fixed-point `BigInt` scaled by `SCALE = 10n ** 18n`:
 * - `'beta'` `(a, b)` — Beta function B(a, b) for a >= 1n, b >= 1n
 * - `'harmonic'` `(n)` — Harmonic number H_n for n >= 0n
 * - `'digamma'` `(n)` — Digamma function psi(n) for n >= 1n
 * - `'lnGamma'` `(n)` — Natural logarithm of Gamma(n) = ln((n - 1)!) for n >= 1n
 * - `'zeta'` `(s)` — Riemann zeta function zeta(s) for integer s >= 2n
 * - `'erf'` `(x)` — Error function erf(x) for integer x
 * - `'erfc'` `(x)` — Complementary error function erfc(x) for integer x
 * - `'besselJ'` `(n, x)` — Bessel function of the first kind J_n(x) for integer n, x
 * - `'legendreP'` `(n, x)` — Legendre polynomial P_n(x) for n >= 0n, integer x
 *
 * @param {string} op - Name of the special function to evaluate.
 * @param {...bigint} args - Exact BigInt integer argument(s) for the selected operation.
 * @returns {bigint} Exact BigInt (for integer-valued functions) or fixed-point BigInt scaled by 10^18.
 * @throws {TypeError} If `op` is not a string or any argument is not a BigInt.
 * @throws {RangeError} If `op` is unsupported, argument count mismatches, or an input is outside the function domain.
 */
export function specialFunctionsBigIntIterative(op, ...args) {
	if (typeof op !== 'string') {
		throw new TypeError(`Expected operation name to be a string, got ${op === null ? 'null' : typeof op}`)
	}

	switch (op) {
		case 'factorial': {
			assertArity(args, 1, op)
			const [n] = args
			assertBigInt(n, 'n')
			assertNonNegative(n, 'n', op)
			return factorial(n)
		}
		case 'doubleFactorial': {
			assertArity(args, 1, op)
			const [n] = args
			assertBigInt(n, 'n')
			assertNonNegative(n, 'n', op)
			return doubleFactorial(n)
		}
		case 'gamma': {
			assertArity(args, 1, op)
			const [n] = args
			assertBigInt(n, 'n')
			assertPositive(n, 'n', op)
			return factorial(n - 1n)
		}
		case 'binomial': {
			assertArity(args, 2, op)
			const [n, k] = args
			assertBigInt(n, 'n')
			assertBigInt(k, 'k')
			assertNonNegative(n, 'n', op)
			assertNonNegative(k, 'k', op)
			return binomial(n, k)
		}
		case 'risingFactorial': {
			assertArity(args, 2, op)
			const [x, n] = args
			assertBigInt(x, 'x')
			assertBigInt(n, 'n')
			assertNonNegative(n, 'n', op)
			return risingFactorial(x, n)
		}
		case 'fallingFactorial': {
			assertArity(args, 2, op)
			const [x, n] = args
			assertBigInt(x, 'x')
			assertBigInt(n, 'n')
			assertNonNegative(n, 'n', op)
			return fallingFactorial(x, n)
		}
		case 'catalan': {
			assertArity(args, 1, op)
			const [n] = args
			assertBigInt(n, 'n')
			assertNonNegative(n, 'n', op)
			return catalan(n)
		}
		case 'chebyshevT': {
			assertArity(args, 2, op)
			const [n, x] = args
			assertBigInt(n, 'n')
			assertBigInt(x, 'x')
			assertNonNegative(n, 'n', op)
			return chebyshevT(n, x)
		}
		case 'hermiteH': {
			assertArity(args, 2, op)
			const [n, x] = args
			assertBigInt(n, 'n')
			assertBigInt(x, 'x')
			assertNonNegative(n, 'n', op)
			return hermiteH(n, x)
		}
		case 'beta': {
			assertArity(args, 2, op)
			const [a, b] = args
			assertBigInt(a, 'a')
			assertBigInt(b, 'b')
			assertPositive(a, 'a', op)
			assertPositive(b, 'b', op)
			return beta(a, b)
		}
		case 'harmonic': {
			assertArity(args, 1, op)
			const [n] = args
			assertBigInt(n, 'n')
			assertNonNegative(n, 'n', op)
			return harmonic(n)
		}
		case 'digamma': {
			assertArity(args, 1, op)
			const [n] = args
			assertBigInt(n, 'n')
			assertPositive(n, 'n', op)
			return digamma(n)
		}
		case 'lnGamma': {
			assertArity(args, 1, op)
			const [n] = args
			assertBigInt(n, 'n')
			assertPositive(n, 'n', op)
			return lnGamma(n)
		}
		case 'zeta': {
			assertArity(args, 1, op)
			const [s] = args
			assertBigInt(s, 's')
			if (s < 2n) {
				throw new RangeError(`Operation "zeta" requires "s" >= 2n, got ${s}n`)
			}
			return zeta(s)
		}
		case 'erf': {
			assertArity(args, 1, op)
			const [x] = args
			assertBigInt(x, 'x')
			return erf(x)
		}
		case 'erfc': {
			assertArity(args, 1, op)
			const [x] = args
			assertBigInt(x, 'x')
			return erfc(x)
		}
		case 'besselJ': {
			assertArity(args, 2, op)
			const [n, x] = args
			assertBigInt(n, 'n')
			assertBigInt(x, 'x')
			return besselJ(n, x)
		}
		case 'legendreP': {
			assertArity(args, 2, op)
			const [n, x] = args
			assertBigInt(n, 'n')
			assertBigInt(x, 'x')
			assertNonNegative(n, 'n', op)
			return legendreP(n, x)
		}
		default:
			throw new RangeError(`Unsupported special function "${op}". Supported: ${SUPPORTED_OPS.join(', ')}`)
	}
}
