/**
 * Advanced special functions over IEEE-754 float64 Numbers using recursive
 * and divide-and-conquer algorithms (pairwise summation, binary-splitting
 * products, divide-and-conquer 2x2 transfer matrices, and recursive doubling).
 *
 * Supported functions via `specialFunctionsFloatRecursive(fnName, ...args)`:
 * - `'gamma'`      `(x)`    — Euler Gamma function Γ(x)
 * - `'lgamma'`     `(x)`    — Log-Gamma function ln|Γ(x)|
 * - `'beta'`       `(a, b)` — Euler Beta function B(a, b) = Γ(a)Γ(b)/Γ(a+b)
 * - `'erf'`        `(x)`    — Gauss error function erf(x)
 * - `'erfc'`       `(x)`    — Complementary error function erfc(x) = 1 - erf(x)
 * - `'besselJ'`    `(n, x)` — Bessel function of the first kind J_n(x), n ∈ ℤ
 * - `'legendreP'`  `(n, x)` — Legendre polynomial P_n(x), n ∈ ℤ_{\ge 0}
 * - `'chebyshevT'` `(n, x)` — Chebyshev polynomial of the first kind T_n(x), n ∈ ℤ_{\ge 0}
 * - `'harmonic'`   `(n)`    — Harmonic number H_n = Σ_{k=1}^n 1/k, n ∈ ℤ_{\ge 0}
 * - `'pochhammer'` `(x, n)` — Rising factorial (x)_n = Π_{k=0}^{n-1} (x + k), n ∈ ℤ_{\ge 0}
 *
 * @module ops/advanced/specialFunctionsFloatRecursive
 */

const SQRT_PI = Math.sqrt(Math.PI)
const SQRT_TWO_PI = Math.sqrt(2 * Math.PI)
const HALF_LN_TWO_PI = 0.5 * Math.log(2 * Math.PI)
const EULER_MASCHERONI = 0.5772156649015329

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

/**
 * Divide-and-conquer pairwise summation over inclusive index range [lo, hi].
 * Achieves O(log N) recursion depth and reduces floating-point accumulation error.
 *
 * @param {(index: number) => number} termFn
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function divideConquerSum(termFn, lo, hi) {
	if (lo > hi) return 0
	if (lo === hi) return termFn(lo)
	const mid = lo + Math.floor((hi - lo) / 2)
	return divideConquerSum(termFn, lo, mid) + divideConquerSum(termFn, mid + 1, hi)
}

/**
 * Divide-and-conquer binary-splitting product over inclusive index range [lo, hi].
 *
 * @param {(index: number) => number} termFn
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function divideConquerProduct(termFn, lo, hi) {
	if (lo > hi) return 1
	if (lo === hi) return termFn(lo)
	const mid = lo + Math.floor((hi - lo) / 2)
	return divideConquerProduct(termFn, lo, mid) * divideConquerProduct(termFn, mid + 1, hi)
}

/**
 * Multiply two 2x2 matrices represented as flat 4-tuples [m00, m01, m10, m11].
 *
 * @param {[number, number, number, number]} a
 * @param {[number, number, number, number]} b
 * @param {boolean} normalize
 * @returns {[number, number, number, number]}
 */
function mulMat2(a, b, normalize) {
	const c00 = a[0] * b[0] + a[1] * b[2]
	const c01 = a[0] * b[1] + a[1] * b[3]
	const c10 = a[2] * b[0] + a[3] * b[2]
	const c11 = a[2] * b[1] + a[3] * b[3]
	if (!normalize) {
		return [c00, c01, c10, c11]
	}
	const scale = Math.max(Math.abs(c00), Math.abs(c01), Math.abs(c10), Math.abs(c11))
	if (scale === 0 || !Number.isFinite(scale)) {
		return [c00, c01, c10, c11]
	}
	return [c00 / scale, c01 / scale, c10 / scale, c11 / scale]
}

/**
 * Divide-and-conquer product of 2x2 transfer matrices over inclusive range [lo, hi],
 * evaluated in left-to-right order M(lo) * M(lo+1) * ... * M(hi).
 *
 * @param {(index: number) => [number, number, number, number]} matFn
 * @param {number} lo
 * @param {number} hi
 * @param {boolean} normalize
 * @returns {[number, number, number, number]}
 */
function divideConquerMat2Product(matFn, lo, hi, normalize) {
	if (lo > hi) return [1, 0, 0, 1]
	if (lo === hi) return matFn(lo)
	const mid = lo + Math.floor((hi - lo) / 2)
	const left = divideConquerMat2Product(matFn, lo, mid, normalize)
	const right = divideConquerMat2Product(matFn, mid + 1, hi, normalize)
	return mulMat2(left, right, normalize)
}

/**
 * Compute sin(pi * x) accurately by reducing x modulo 2 before multiplying by pi.
 *
 * @param {number} x
 * @returns {number}
 */
function sinPi(x) {
	const r = x - 2 * Math.round(x / 2)
	if (r === 0 || r === 1 || r === -1) return 0
	if (r === 0.5) return 1
	if (r === -0.5) return -1
	return Math.sin(Math.PI * r)
}

/**
 * Lanczos series sum A_g(w) for z >= 0.5 (w = z - 1), via divide-and-conquer summation.
 *
 * @param {number} w
 * @returns {number}
 */
function lanczosSeries(w) {
	return LANCZOS_P[0] + divideConquerSum((k) => LANCZOS_P[k] / (w + k), 1, LANCZOS_P.length - 1)
}

/**
 * Core log-gamma ln|Γ(x)| using recursive reflection for x < 0.5 and Lanczos for x >= 0.5.
 *
 * @param {number} x
 * @returns {number}
 */
function lgammaCore(x) {
	if (x < 0.5) {
		const s = Math.abs(sinPi(x))
		return Math.log(Math.PI) - Math.log(s) - lgammaCore(1 - x)
	}
	const w = x - 1
	const a = lanczosSeries(w)
	const t = w + LANCZOS_G + 0.5
	return HALF_LN_TWO_PI + (w + 0.5) * Math.log(t) - t + Math.log(a)
}

/**
 * Core Gamma Γ(x) using:
 * - recursive Euler reflection for x < 0.5
 * - Lanczos with divide-and-conquer summation on [0.5, 1.5)
 * - divide-and-conquer rising factorial product for [1.5, 171.5]
 * - exp(lgamma) near the float64 overflow boundary
 *
 * @param {number} x
 * @returns {number}
 */
function gammaCore(x) {
	if (x < 0.5) {
		const s = sinPi(x)
		const denom = s * gammaCore(1 - x)
		return Math.PI / denom
	}
	if (x > 171.6243769563027) {
		return Infinity
	}
	if (x > 171.5) {
		return Math.exp(lgammaCore(x))
	}
	if (x >= 1.5) {
		const m = Math.floor(x - 0.5)
		const x0 = x - m
		const base = gammaBaseLanczos(x0)
		const rising = divideConquerProduct((k) => x0 + k, 0, m - 1)
		return base * rising
	}
	return gammaBaseLanczos(x)
}

/**
 * Lanczos Gamma evaluation on the base interval [0.5, 1.5).
 *
 * @param {number} x
 * @returns {number}
 */
function gammaBaseLanczos(x) {
	if (x === 1) return 1
	if (x === 0.5) return SQRT_PI
	const w = x - 1
	const a = lanczosSeries(w)
	const t = w + LANCZOS_G + 0.5
	return SQRT_TWO_PI * Math.pow(t, w + 0.5) * Math.exp(-t) * a
}

/**
 * Euler Beta function B(a, b) for a > 0, b > 0.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function betaCore(a, b) {
	return Math.exp(lgammaCore(a) + lgammaCore(b) - lgammaCore(a + b))
}

/**
 * Build Kummer positive series terms for erf(x) = (2x/sqrt(pi)) * exp(-x^2) * sum_k (2x^2)^k / (2k+1)!!
 * and sum them with divide-and-conquer pairwise summation.
 *
 * @param {number} x Positive number (x <= 1.5)
 * @returns {number}
 */
function erfPositiveSeries(x) {
	const twoX2 = 2 * x * x
	const terms = [1]
	let term = 1
	for (let k = 1; k <= 100; k++) {
		term = (term * twoX2) / (2 * k + 1)
		terms.push(term)
		if (term < 1e-17) break
	}
	const sum = divideConquerSum((i) => terms[i], 0, terms.length - 1)
	return ((2 * x) / SQRT_PI) * Math.exp(-x * x) * sum
}

/**
 * Evaluate erfc(x) for x >= 1.0 using Laplace's continued fraction via
 * divide-and-conquer 2x2 Möbius matrix product (with scale normalization).
 *
 * erfc(x) = (exp(-x^2) / sqrt(pi)) * (1 / (x + (1/2) / (x + (2/2) / (x + ...))))
 *
 * @param {number} x
 * @returns {number}
 */
function erfcContinuedFraction(x) {
	if (x > 27.3) return 0
	// Depth scales down smoothly as x grows; x = 1.0 needs ~140 levels for full float64 precision.
	const depth = x < 1.5 ? 160 : x < 3.0 ? 96 : x < 6.0 ? 48 : 24
	const m = divideConquerMat2Product(
		(k) => (k === 0 ? [0, 1, 1, x] : [0, 0.5 * k, 1, x]),
		0,
		depth,
		true,
	)
	const cf = m[1] / m[3]
	return (Math.exp(-x * x) / SQRT_PI) * cf
}

/**
 * Gauss error function erf(x) via recursive odd symmetry, positive Kummer series,
 * and divide-and-conquer continued fraction.
 *
 * @param {number} x
 * @returns {number}
 */
function erfCore(x) {
	if (x === 0) return 0
	if (x < 0) return -erfCore(-x)
	if (x <= 1.5) return erfPositiveSeries(x)
	if (x > 6.5) return 1
	return 1 - erfcContinuedFraction(x)
}

/**
 * Complementary error function erfc(x) = 1 - erf(x).
 *
 * @param {number} x
 * @returns {number}
 */
function erfcCore(x) {
	if (x === 0) return 1
	if (x < 0) return 2 - erfcCore(-x)
	if (x < 1.0) return 1 - erfPositiveSeries(x)
	return erfcContinuedFraction(x)
}

/**
 * Recursive backward Miller recurrence for Bessel J_n(x) on moderate x > 0.
 * Fills unnormalized sequence y[0..M] recursively, rescaling whenever magnitude grows
 * to prevent float64 overflow, then normalizes with Neumann's identity via divideConquerSum.
 *
 * @param {number} n Non-negative integer order
 * @param {number} x Positive argument
 * @returns {number}
 */
function besselJMiller(n, x) {
	// Ensure M is even and sufficiently above max(n, x) for full float64 accuracy.
	const rawM = Math.max(n, Math.ceil(x)) + Math.ceil(20 + 1.5 * Math.sqrt(Math.max(n, x))) + 30
	const M = rawM % 2 === 0 ? rawM : rawM + 1
	const y = new Float64Array(M + 1)
	const RESCALE_LIMIT = 1e150
	const RESCALE_FACTOR = 1e-150

	/**
	 * Recursively fill y[k] down to y[0], tracking a global scale exponent if rescaled.
	 *
	 * @param {number} k
	 * @param {number} yNext y[k + 1]
	 * @param {number} yCurr y[k]
	 */
	function stepDown(k, yNext, yCurr) {
		y[k] = yCurr
		if (k === 0) return
		let yPrev = ((2 * k) / x) * yCurr - yNext
		if (Math.abs(yPrev) > RESCALE_LIMIT) {
			yPrev *= RESCALE_FACTOR
			yCurr *= RESCALE_FACTOR
			for (let j = k; j <= M; j++) {
				y[j] *= RESCALE_FACTOR
			}
		}
		stepDown(k - 1, yCurr, yPrev)
	}

	y[M] = 0
	stepDown(M - 1, 0, 1)

	const evenSum = divideConquerSum((m) => y[2 * m], 1, M / 2)
	const norm = y[0] + 2 * evenSum
	return y[n] / norm
}

/**
 * Hankel asymptotic expansion for Bessel J_n(x) when x is large relative to n.
 * Uses divide-and-conquer summation over the asymptotic series terms.
 *
 * @param {number} n Non-negative integer order
 * @param {number} x Large positive argument
 * @returns {number}
 */
function besselJHankel(n, x) {
	const mu = 4 * n * n
	const eightX = 8 * x
	const pTerms = [1]
	const qTerms = []

	let term = 1
	let prevAbs = Infinity
	for (let k = 1; k <= 30; k++) {
		const odd = 2 * k - 1
		const factor = (mu - odd * odd) / (k * eightX)
		term *= factor
		const absTerm = Math.abs(term)
		if (absTerm > prevAbs) break
		prevAbs = absTerm
		if (k % 2 === 1) {
			const sign = ((k - 1) / 2) % 2 === 0 ? 1 : -1
			qTerms.push(sign * term)
		} else {
			const sign = (k / 2) % 2 === 0 ? 1 : -1
			pTerms.push(sign * term)
		}
		if (absTerm < 1e-17) break
	}

	const p = divideConquerSum((i) => pTerms[i], 0, pTerms.length - 1)
	const q = divideConquerSum((i) => qTerms[i], 0, qTerms.length - 1)
	const chi = x - (0.5 * n + 0.25) * Math.PI
	return Math.sqrt(2 / (Math.PI * x)) * (p * Math.cos(chi) - q * Math.sin(chi))
}

/**
 * Bessel function of the first kind J_n(x) for integer n and finite float64 x.
 *
 * @param {number} n
 * @param {number} x
 * @returns {number}
 */
function besselJCore(n, x) {
	if (n < 0) {
		const val = besselJCore(-n, x)
		return (-n) % 2 === 0 ? val : -val
	}
	if (x < 0) {
		const val = besselJCore(n, -x)
		return n % 2 === 0 ? val : -val
	}
	if (x === 0) {
		return n === 0 ? 1 : 0
	}
	// Check guaranteed underflow for very large order n >> x using |J_n(x)| <= (x/2)^n / n!
	if (n > 20 && n > 2 * x) {
		const logUpper = n * Math.log(x / 2) - lgammaCore(n + 1)
		if (logUpper < -750) return 0
	}
	// Use Hankel asymptotic expansion for large x where it converges to float64 precision.
	if (x > 100 && x > n * n + 30) {
		return besselJHankel(n, x)
	}
	// For very large orders where recursion stack could grow large, use power series when x <= n / 2.
	if (n > 1500 && x <= n / 2) {
		const logLead = n * Math.log(x / 2) - lgammaCore(n + 1)
		if (logLead < -745) return 0
		const lead = Math.exp(logLead)
		const negHalfX2 = -0.25 * x * x
		const terms = [lead]
		let t = lead
		for (let k = 1; k <= 200; k++) {
			t = (t * negHalfX2) / (k * (n + k))
			terms.push(t)
			if (Math.abs(t) <= Math.abs(lead) * 1e-17) break
		}
		return divideConquerSum((i) => terms[i], 0, terms.length - 1)
	}
	return besselJMiller(n, x)
}

/**
 * Legendre polynomial P_n(x) via divide-and-conquer 2x2 transfer-matrix product
 * of Bonnet's three-term recurrence:
 *   (k+1) P_{k+1}(x) = (2k+1) x P_k(x) - k P_{k-1}(x).
 *
 * @param {number} n Non-negative integer degree
 * @param {number} x Finite float64
 * @returns {number}
 */
function legendrePCore(n, x) {
	if (n === 0) return 1
	if (n === 1) return x
	// Product order: M(n-1) * M(n-2) * ... * M(1) applied to [P_1(x), P_0(x)]^T.
	// Mapping index i in [0, n-2] to k = (n - 1) - i gives left-to-right M(n-1)...M(1).
	const mat = divideConquerMat2Product(
		(i) => {
			const k = n - 1 - i
			return [((2 * k + 1) * x) / (k + 1), -k / (k + 1), 1, 0]
		},
		0,
		n - 2,
		false,
	)
	return mat[0] * x + mat[1]
}

/**
 * Recursive doubling helper returning [T_n(x), T_{n+1}(x)] in O(log n) steps.
 *
 * @param {number} n Non-negative integer
 * @param {number} x
 * @returns {[number, number]}
 */
function chebyshevPair(n, x) {
	if (n === 0) return [1, x]
	const half = Math.floor(n / 2)
	const [a, b] = chebyshevPair(half, x)
	const t2m = 2 * a * a - 1
	const t2m1 = 2 * a * b - x
	if (n % 2 === 0) {
		return [t2m, t2m1]
	}
	const t2m2 = 2 * b * b - 1
	return [t2m1, t2m2]
}

/**
 * Chebyshev polynomial of the first kind T_n(x) via recursive doubling.
 *
 * @param {number} n Non-negative integer degree
 * @param {number} x Finite float64
 * @returns {number}
 */
function chebyshevTCore(n, x) {
	return chebyshevPair(n, x)[0]
}

/**
 * Harmonic number H_n = sum_{k=1}^n 1/k via divide-and-conquer pairwise summation,
 * switching to Euler-Maclaurin asymptotic expansion for very large n (> 1e6).
 *
 * @param {number} n Non-negative integer
 * @returns {number}
 */
function harmonicCore(n) {
	if (n === 0) return 0
	if (n <= 1_000_000) {
		return divideConquerSum((k) => 1 / k, 1, n)
	}
	const invN = 1 / n
	const invN2 = invN * invN
	// H_n = ln(n) + gamma + 1/(2n) - 1/(12n^2) + 1/(120n^4) - 1/(252n^6)
	const corr = [
		0.5 * invN,
		-invN2 / 12,
		(invN2 * invN2) / 120,
		-(invN2 * invN2 * invN2) / 252,
	]
	return Math.log(n) + EULER_MASCHERONI + divideConquerSum((i) => corr[i], 0, corr.length - 1)
}

/**
 * Pochhammer rising factorial (x)_n = prod_{k=0}^{n-1} (x + k) via divide-and-conquer product.
 *
 * @param {number} x Finite float64
 * @param {number} n Non-negative integer
 * @returns {number}
 */
function pochhammerCore(x, n) {
	if (n === 0) return 1
	return divideConquerProduct((k) => x + k, 0, n - 1)
}

/**
 * Validate that a value is a finite IEEE-754 float64 Number.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {number}
 */
function assertFiniteFloat(value, name) {
	if (typeof value !== 'number') {
		throw new TypeError(`${name} must be a number`)
	}
	if (!Number.isFinite(value)) {
		throw new RangeError(`${name} must be a finite float64 number`)
	}
	return value
}

/**
 * Validate that a value is a safe integer (optionally non-negative).
 *
 * @param {unknown} value
 * @param {string} name
 * @param {boolean} nonNegative
 * @returns {number}
 */
function assertSafeInteger(value, name, nonNegative) {
	if (typeof value !== 'number') {
		throw new TypeError(`${name} must be a number`)
	}
	if (!Number.isSafeInteger(value)) {
		throw new RangeError(`${name} must be a safe integer`)
	}
	if (nonNegative && value < 0) {
		throw new RangeError(`${name} must be a non-negative integer`)
	}
	return value
}

/**
 * Validate exact argument count for a dispatched special function.
 *
 * @param {string} fnName
 * @param {unknown[]} args
 * @param {number} expected
 */
function assertArity(fnName, args, expected) {
	if (args.length !== expected) {
		throw new TypeError(`${fnName} expects exactly ${expected} argument(s), got ${args.length}`)
	}
}

/**
 * Evaluate an advanced mathematical special function over IEEE-754 float64 Numbers
 * using recursive / divide-and-conquer algorithms.
 *
 * @param {'gamma'|'lgamma'|'beta'|'erf'|'erfc'|'besselJ'|'legendreP'|'chebyshevT'|'harmonic'|'pochhammer'} fnName
 *   Name of the special function to compute.
 * @param {...number} args Numeric arguments for the chosen special function.
 * @returns {number} IEEE-754 float64 result.
 * @throws {TypeError} If `fnName` is not a string, argument types are invalid, or arity mismatches.
 * @throws {RangeError} If `fnName` is unknown or arguments lie outside the valid domain.
 */
export function specialFunctionsFloatRecursive(fnName, ...args) {
	if (typeof fnName !== 'string') {
		throw new TypeError('fnName must be a string')
	}

	switch (fnName) {
		case 'gamma': {
			assertArity(fnName, args, 1)
			const x = assertFiniteFloat(args[0], 'x')
			if (x <= 0 && Number.isInteger(x)) {
				throw new RangeError('gamma has a pole at non-positive integers')
			}
			return gammaCore(x)
		}

		case 'lgamma': {
			assertArity(fnName, args, 1)
			const x = assertFiniteFloat(args[0], 'x')
			if (x <= 0 && Number.isInteger(x)) {
				throw new RangeError('lgamma has a pole at non-positive integers')
			}
			return lgammaCore(x)
		}

		case 'beta': {
			assertArity(fnName, args, 2)
			const a = assertFiniteFloat(args[0], 'a')
			const b = assertFiniteFloat(args[1], 'b')
			if (a <= 0 || b <= 0) {
				throw new RangeError('beta requires positive arguments a > 0 and b > 0')
			}
			return betaCore(a, b)
		}

		case 'erf': {
			assertArity(fnName, args, 1)
			const x = assertFiniteFloat(args[0], 'x')
			return erfCore(x)
		}

		case 'erfc': {
			assertArity(fnName, args, 1)
			const x = assertFiniteFloat(args[0], 'x')
			return erfcCore(x)
		}

		case 'besselJ': {
			assertArity(fnName, args, 2)
			const n = assertSafeInteger(args[0], 'n', false)
			const x = assertFiniteFloat(args[1], 'x')
			return besselJCore(n, x)
		}

		case 'legendreP': {
			assertArity(fnName, args, 2)
			const n = assertSafeInteger(args[0], 'n', true)
			const x = assertFiniteFloat(args[1], 'x')
			return legendrePCore(n, x)
		}

		case 'chebyshevT': {
			assertArity(fnName, args, 2)
			const n = assertSafeInteger(args[0], 'n', true)
			const x = assertFiniteFloat(args[1], 'x')
			return chebyshevTCore(n, x)
		}

		case 'harmonic': {
			assertArity(fnName, args, 1)
			const n = assertSafeInteger(args[0], 'n', true)
			return harmonicCore(n)
		}

		case 'pochhammer': {
			assertArity(fnName, args, 2)
			const x = assertFiniteFloat(args[0], 'x')
			const n = assertSafeInteger(args[1], 'n', true)
			return pochhammerCore(x, n)
		}

		default:
			throw new RangeError(`Unknown special function: ${fnName}`)
	}
}
