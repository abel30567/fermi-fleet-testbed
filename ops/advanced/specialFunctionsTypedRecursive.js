const SQRT_PI = Math.sqrt(Math.PI)
const SQRT_2PI = Math.sqrt(2 * Math.PI)
const LOG_SQRT_2PI = 0.5 * Math.log(2 * Math.PI)
const LOG_PI = Math.log(Math.PI)
const TWO_OVER_SQRT_PI = 2 / SQRT_PI
const TWO_OVER_PI = 2 / Math.PI
const QUARTER_PI = Math.PI * 0.25

/**
 * Paul Godfrey's Lanczos coefficients (g = 7, n = 9) for double-precision
 * Gamma and log-Gamma evaluation.
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

/**
 * Precomputed sin((k + 0.5) * pi / 40) nodes for k = 0..19, giving the
 * 40-point midpoint rule over [0, pi] (by symmetry around pi/2) for the
 * Poisson integral representation of J_0(x) on |x| <= 30.
 */
const BESSEL_HALF_NODES = 20
const BESSEL_SIN_NODES = Float64Array.from({ length: BESSEL_HALF_NODES }, (_, k) =>
	Math.sin((Math.PI * (k + 0.5)) / (BESSEL_HALF_NODES * 2))
)

/**
 * Computes sin(pi * x) with range reduction around the nearest integer to avoid
 * cancellation errors for large |x|.
 *
 * @param {number} x
 * @returns {number}
 */
function sinPi(x) {
	const k = Math.round(x)
	const r = x - k
	const s = Math.sin(Math.PI * r)
	return (k & 1) !== 0 ? -s : s
}

/**
 * Lanczos approximation of ln(Gamma(x)) for x >= 0.5.
 *
 * @param {number} x
 * @returns {number}
 */
function lgammaPositive(x) {
	if (x === 1 || x === 2) {
		return 0
	}
	const z = x - 1
	let a = LANCZOS_P[0]
	for (let i = 1; i < LANCZOS_P.length; i++) {
		a += LANCZOS_P[i] / (z + i)
	}
	const t = z + LANCZOS_G + 0.5
	return LOG_SQRT_2PI + (z + 0.5) * Math.log(t) - t + Math.log(a)
}

/**
 * Evaluates the natural logarithm of |Gamma(x)|.
 *
 * @param {number} x
 * @returns {number}
 */
function lgammaScalar(x) {
	if (Number.isNaN(x)) {
		return NaN
	}
	if (!Number.isFinite(x)) {
		return Infinity
	}
	if (x <= 0 && Number.isInteger(x)) {
		return Infinity
	}
	if (x < 0.5) {
		return LOG_PI - Math.log(Math.abs(sinPi(x))) - lgammaPositive(1 - x)
	}
	return lgammaPositive(x)
}

/**
 * Evaluates the Gamma function Gamma(x).
 *
 * Follows C99/IEEE-754 tgamma conventions at poles:
 * - gamma(+0) = +Infinity, gamma(-0) = -Infinity
 * - gamma(-n) = NaN for positive integers n
 *
 * @param {number} x
 * @returns {number}
 */
function gammaScalar(x) {
	if (Number.isNaN(x) || x === -Infinity) {
		return NaN
	}
	if (x === Infinity) {
		return Infinity
	}
	if (x === 0) {
		return Object.is(x, -0) ? -Infinity : Infinity
	}
	if (x < 0 && Number.isInteger(x)) {
		return NaN
	}
	if (x < 0.5) {
		const s = sinPi(x)
		const g = gammaScalar(1 - x)
		if (!Number.isFinite(g)) {
			return 0
		}
		return Math.PI / (s * g)
	}
	if (x > 140) {
		return Math.exp(lgammaPositive(x))
	}
	const z = x - 1
	let a = LANCZOS_P[0]
	for (let i = 1; i < LANCZOS_P.length; i++) {
		a += LANCZOS_P[i] / (z + i)
	}
	const t = z + LANCZOS_G + 0.5
	return SQRT_2PI * Math.pow(t, z + 0.5) * Math.exp(-t) * a
}

/**
 * Evaluates erf(ax) for 0 <= ax < 1.5 using the strictly positive Kummer
 * confluent hypergeometric series:
 * erf(x) = (2 / sqrt(pi)) * x * exp(-x^2) * sum_{n=0}^inf (2x^2)^n / (2n+1)!!
 *
 * @param {number} ax
 * @returns {number}
 */
function erfSeriesPositive(ax) {
	const x2 = ax * ax
	const twoX2 = 2 * x2
	let term = 1
	let sum = 1
	for (let n = 1; n < 100; n++) {
		term *= twoX2 / (2 * n + 1)
		sum += term
		if (term <= sum * 1e-16) {
			break
		}
	}
	return TWO_OVER_SQRT_PI * ax * Math.exp(-x2) * sum
}

/**
 * Evaluates erfc(ax) for ax >= 1.5 using Laplace's continued fraction via
 * modified Lentz's algorithm.
 *
 * @param {number} ax
 * @returns {number}
 */
function erfcContinuedFraction(ax) {
	if (ax > 27.5) {
		return 0
	}
	let f = ax
	let c = f
	let d = 0
	for (let n = 1; n <= 200; n++) {
		const a = n * 0.5
		d = ax + a * d
		if (d === 0) {
			d = 1e-300
		}
		c = ax + a / c
		if (c === 0) {
			c = 1e-300
		}
		d = 1 / d
		const delta = c * d
		f *= delta
		if (Math.abs(delta - 1) < 1e-16) {
			break
		}
	}
	return Math.exp(-ax * ax) / (SQRT_PI * f)
}

/**
 * Evaluates the Gauss error function erf(x).
 *
 * @param {number} x
 * @returns {number}
 */
function erfScalar(x) {
	if (Number.isNaN(x)) {
		return NaN
	}
	if (x === 0) {
		return x
	}
	if (x === Infinity) {
		return 1
	}
	if (x === -Infinity) {
		return -1
	}
	const sign = x < 0 ? -1 : 1
	const ax = Math.abs(x)
	if (ax < 1.5) {
		return sign * erfSeriesPositive(ax)
	}
	return sign * (1 - erfcContinuedFraction(ax))
}

/**
 * Evaluates the complementary error function erfc(x) = 1 - erf(x).
 *
 * @param {number} x
 * @returns {number}
 */
function erfcScalar(x) {
	if (Number.isNaN(x)) {
		return NaN
	}
	if (x === 0) {
		return 1
	}
	if (x === Infinity) {
		return 0
	}
	if (x === -Infinity) {
		return 2
	}
	const ax = Math.abs(x)
	if (ax < 1.5) {
		const e = erfSeriesPositive(ax)
		return x < 0 ? 1 + e : 1 - e
	}
	const tail = erfcContinuedFraction(ax)
	return x < 0 ? 2 - tail : tail
}

/**
 * Evaluates the Bessel function of the first kind of order 0, J_0(x).
 *
 * Uses the exponentially convergent 40-point periodic midpoint rule on
 * Poisson's integral for |x| <= 30 and Hankel's asymptotic expansion for
 * |x| > 30.
 *
 * @param {number} x
 * @returns {number}
 */
function besselJ0Scalar(x) {
	if (Number.isNaN(x)) {
		return NaN
	}
	if (!Number.isFinite(x)) {
		return 0
	}
	const ax = Math.abs(x)
	if (ax === 0) {
		return 1
	}
	if (ax <= 30) {
		let sum = 0
		for (let k = 0; k < BESSEL_HALF_NODES; k++) {
			sum += Math.cos(ax * BESSEL_SIN_NODES[k])
		}
		return sum / BESSEL_HALF_NODES
	}
	const inv8x = 1 / (8 * ax)
	let p = 1
	let q = 0
	let term = 1
	for (let m = 1; m <= 40; m++) {
		const odd = 2 * m - 1
		const next = (term * odd * odd * inv8x) / m
		if (next > term) {
			break
		}
		term = next
		if ((m & 1) === 1) {
			const k = (m - 1) >>> 1
			q += (k & 1) === 0 ? -term : term
		} else {
			const k = m >>> 1
			p += (k & 1) === 0 ? term : -term
		}
		if (term < 1e-16) {
			break
		}
	}
	const phase = ax - QUARTER_PI
	return Math.sqrt(TWO_OVER_PI / ax) * (p * Math.cos(phase) - q * Math.sin(phase))
}

const SPECIAL_FUNCTIONS = Object.freeze({
	gamma: gammaScalar,
	lgamma: lgammaScalar,
	erf: erfScalar,
	erfc: erfcScalar,
	besselJ0: besselJ0Scalar,
})

const SUPPORTED_FN_NAMES = Object.keys(SPECIAL_FUNCTIONS)

/**
 * Recursively applies a scalar special function over input[start..end) into
 * output[start..end) using a divide-and-conquer split at the midpoint.
 *
 * Call depth is O(log n), avoiding stack overflow on large Float64Arrays.
 *
 * @param {Float64Array} input
 * @param {Float64Array} output
 * @param {number} start - Inclusive start index.
 * @param {number} end - Exclusive end index.
 * @param {(x: number) => number} scalarFn
 */
function applyDivideAndConquer(input, output, start, end, scalarFn) {
	const len = end - start
	if (len <= 0) {
		return
	}
	if (len === 1) {
		output[start] = scalarFn(input[start])
		return
	}
	const mid = start + (len >>> 1)
	applyDivideAndConquer(input, output, start, mid, scalarFn)
	applyDivideAndConquer(input, output, mid, end, scalarFn)
}

/**
 * Evaluates a standard special mathematical function element-wise over a
 * `Float64Array` using a recursive divide-and-conquer implementation.
 *
 * Supported functions:
 * - `'gamma'`    — Euler's Gamma function Γ(x)
 * - `'lgamma'`   — Natural logarithm of |Γ(x)|
 * - `'erf'`      — Gauss error function erf(x)
 * - `'erfc'`     — Complementary error function erfc(x) = 1 - erf(x)
 * - `'besselJ0'` — Bessel function of the first kind of order 0, J₀(x)
 *
 * @param {Float64Array} input - Input array of double-precision floats.
 * @param {'gamma' | 'lgamma' | 'erf' | 'erfc' | 'besselJ0'} [fnName='gamma'] - Name of the special function to evaluate.
 * @returns {Float64Array} A new `Float64Array` containing the element-wise results.
 * @throws {TypeError} If `input` is not a `Float64Array` or `fnName` is not a string.
 * @throws {RangeError} If `fnName` is not a supported special function name.
 */
export function specialFunctionsTypedRecursive(input, fnName = 'gamma') {
	if (!(input instanceof Float64Array)) {
		throw new TypeError('Expected input to be a Float64Array')
	}
	if (typeof fnName !== 'string') {
		throw new TypeError('Expected fnName to be a string')
	}
	if (!Object.prototype.hasOwnProperty.call(SPECIAL_FUNCTIONS, fnName)) {
		throw new RangeError(
			`Unsupported special function "${fnName}". Expected one of: ${SUPPORTED_FN_NAMES.join(', ')}`
		)
	}

	const output = new Float64Array(input.length)
	if (input.length === 0) {
		return output
	}

	applyDivideAndConquer(input, output, 0, input.length, SPECIAL_FUNCTIONS[fnName])
	return output
}
