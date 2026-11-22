/**
 * Recursive (Cooley-Tukey radix-2 divide-and-conquer) Discrete Fourier Transform
 * over exact rational numbers `{ num: BigInt, den: BigInt }` in lowest terms.
 *
 * Mathematical definition (forward DFT):
 *   X[k] = sum_{n=0}^{N-1} x[n] * exp(-2 * pi * i * k * n / N),  k = 0..N-1
 *
 * Inverse DFT (`options.inverse = true`):
 *   x[n] = (1 / N) * sum_{k=0}^{N-1} X[k] * exp(+2 * pi * i * k * n / N),  n = 0..N-1
 *
 * Exactness & Twiddle Factors:
 * - Every input and output value is represented as a normalized complex rational
 *   `{ re: Rational, im: Rational }`, where each `Rational` is `{ num: BigInt, den: BigInt }`
 *   reduced to lowest terms with `den > 0n` (and `0n / 1n` for zero).
 * - Quadrantal twiddle factors (multiples of pi/2: `1, -1, i, -i`) are ALWAYS exact.
 *   Consequently, transforms of length N = 1, 2, and 4 are 100% algebraically exact
 *   with zero approximation error.
 * - For general non-quadrantal angles (occurring at N = 2^m >= 8), twiddle factors
 *   `cos(theta)` and `sin(theta)` are computed purely in exact BigInt arithmetic via
 *   octant reduction to `[0, pi/4]`, Machin's formula for `pi`, and Taylor series
 *   expansion, then rounded to a shared rational denominator `10^precision` (default
 *   `precision = 16`, giving accuracy better than 1e-15 while keeping denominators
 *   compact across recursion levels).
 */

const ZERO = Object.freeze({ num: 0n, den: 1n })
const ONE = Object.freeze({ num: 1n, den: 1n })
const NEG_ONE = Object.freeze({ num: -1n, den: 1n })

/**
 * Greatest common divisor of two BigInts (always non-negative).
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Normalize a rational (num / den) to lowest terms with den > 0n.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(num, den) {
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError('Rational num and den must be BigInt values')
	}
	if (den === 0n) {
		throw new RangeError('Rational denominator cannot be zero')
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Rational arithmetic helpers (all return lowest-terms rationals with den > 0n).
 */
function ratAdd(a, b) {
	return normalizeRational(a.num * b.den + b.num * a.den, a.den * b.den)
}

function ratSub(a, b) {
	return normalizeRational(a.num * b.den - b.num * a.den, a.den * b.den)
}

function ratMul(a, b) {
	return normalizeRational(a.num * b.num, a.den * b.den)
}

function ratNeg(a) {
	return a.num === 0n ? { num: 0n, den: 1n } : { num: -a.num, den: a.den }
}

function ratDivByBigInt(a, k) {
	return normalizeRational(a.num, a.den * k)
}

/**
 * Complex-rational arithmetic helpers.
 */
function complexAdd(a, b) {
	return { re: ratAdd(a.re, b.re), im: ratAdd(a.im, b.im) }
}

function complexSub(a, b) {
	return { re: ratSub(a.re, b.re), im: ratSub(a.im, b.im) }
}

function complexMul(a, b) {
	// (ar + i*ai)(br + i*bi) = (ar*br - ai*bi) + i*(ar*bi + ai*br)
	return {
		re: ratSub(ratMul(a.re, b.re), ratMul(a.im, b.im)),
		im: ratAdd(ratMul(a.re, b.im), ratMul(a.im, b.re)),
	}
}

/**
 * Validate and normalize a single input element (either Rational or ComplexRational).
 * @param {unknown} elem
 * @param {number} index
 * @returns {{ re: { num: bigint, den: bigint }, im: { num: bigint, den: bigint } }}
 */
function parseElement(elem, index) {
	if (typeof elem !== 'object' || elem === null || Array.isArray(elem)) {
		throw new TypeError(
			`Input element at index ${index} must be a rational { num, den } or complex rational { re, im }`,
		)
	}

	const hasComplexKeys = 're' in elem || 'im' in elem
	const hasRationalKeys = 'num' in elem || 'den' in elem

	if (hasComplexKeys && hasRationalKeys) {
		throw new TypeError(
			`Input element at index ${index} cannot mix rational { num, den } and complex { re, im } properties`,
		)
	}

	if (hasComplexKeys) {
		const { re, im } = elem
		if (
			typeof re !== 'object' ||
			re === null ||
			Array.isArray(re) ||
			typeof im !== 'object' ||
			im === null ||
			Array.isArray(im)
		) {
			throw new TypeError(
				`Complex rational at index ${index} must have rational objects for both re and im`,
			)
		}
		return {
			re: normalizeRational(re.num, re.den),
			im: normalizeRational(im.num, im.den),
		}
	}

	if (hasRationalKeys) {
		return {
			re: normalizeRational(elem.num, elem.den),
			im: { num: 0n, den: 1n },
		}
	}

	throw new TypeError(
		`Input element at index ${index} must be a rational { num, den } or complex rational { re, im }`,
	)
}

/**
 * Fixed-point BigInt arctan(1 / m) scaled by `scale`.
 * Uses the alternating Taylor series: sum_{j>=0} (-1)^j / ((2j+1) * m^(2j+1)).
 * @param {bigint} m
 * @param {bigint} scale
 * @returns {bigint}
 */
function atanInvScaled(m, scale) {
	const m2 = m * m
	let power = scale / m
	let sum = power
	let sign = -1n
	for (let k = 3n; ; k += 2n) {
		power /= m2
		if (power === 0n) break
		const term = power / k
		if (term === 0n) break
		sum += sign * term
		sign = -sign
	}
	return sum
}

/**
 * Compute pi * scale via Machin's formula: pi = 16*atan(1/5) - 4*atan(1/239).
 * @param {bigint} scale
 * @returns {bigint}
 */
function piScaled(scale) {
	return 16n * atanInvScaled(5n, scale) - 4n * atanInvScaled(239n, scale)
}

/**
 * Compute cos(alpha) and sin(alpha) in fixed-point BigInt scaled by `scale`,
 * for alpha in [0, pi/4], using exact BigInt Taylor series.
 * @param {bigint} alphaScaled  alpha * scale
 * @param {bigint} scale
 * @returns {{ cosScaled: bigint, sinScaled: bigint }}
 */
function cosSinScaled(alphaScaled, scale) {
	const alpha2 = (alphaScaled * alphaScaled) / scale

	// cos(alpha) = 1 - alpha^2/2! + alpha^4/4! - ...
	let cosSum = scale
	let cosTerm = scale
	let sign = -1n
	for (let j = 1n; ; j += 1n) {
		cosTerm = (cosTerm * alpha2) / (scale * (2n * j - 1n) * (2n * j))
		if (cosTerm === 0n) break
		cosSum += sign * cosTerm
		sign = -sign
	}

	// sin(alpha) = alpha - alpha^3/3! + alpha^5/5! - ...
	let sinSum = alphaScaled
	let sinTerm = alphaScaled
	sign = -1n
	for (let j = 1n; ; j += 1n) {
		sinTerm = (sinTerm * alpha2) / (scale * (2n * j) * (2n * j + 1n))
		if (sinTerm === 0n) break
		sinSum += sign * sinTerm
		sign = -sign
	}

	return { cosScaled: cosSum, sinScaled: sinSum }
}

/**
 * Round a fixed-point BigInt value down by `guard` (nearest, half away from zero)
 * and convert to a normalized rational over `outScale`.
 * @param {bigint} val
 * @param {bigint} guard
 * @param {bigint} outScale
 * @returns {{ num: bigint, den: bigint }}
 */
function roundToRational(val, guard, outScale) {
	const half = guard / 2n
	const rounded = val >= 0n ? (val + half) / guard : (val - half) / guard
	return normalizeRational(rounded, outScale)
}

/**
 * Create a lazy twiddle-factor provider for a given precision and transform direction.
 * Quadrantal angles are always exact; non-quadrantal angles are computed in exact BigInt
 * arithmetic via octant reduction + Machin/Taylor series and cached by (N, k).
 */
function createTwiddleContext(inverse, precision) {
	const GUARD_DIGITS = 8
	let initialized = false
	let workScale = 0n
	let guard = 0n
	let outScale = 0n
	let piVal = 0n
	const cache = new Map()

	function ensureInit() {
		if (!initialized) {
			guard = 10n ** BigInt(GUARD_DIGITS)
			outScale = 10n ** BigInt(precision)
			workScale = outScale * guard
			piVal = piScaled(workScale)
			initialized = true
		}
	}

	/**
	 * Compute twiddle factor W_n^k = exp(sign * 2*pi*i*k/n),
	 * where sign = +1 for inverse DFT and -1 for forward DFT.
	 * @param {number} k
	 * @param {number} n  power of 2
	 */
	function getTwiddle(k, n) {
		const kMod = ((k % n) + n) % n

		// Exact quadrantal cases (covers ALL twiddles for N = 1, 2, 4)
		if (kMod === 0) {
			return { re: { ...ONE }, im: { ...ZERO } }
		}
		if (4 * kMod === n) {
			return { re: { ...ZERO }, im: inverse ? { ...ONE } : { ...NEG_ONE } }
		}
		if (2 * kMod === n) {
			return { re: { ...NEG_ONE }, im: { ...ZERO } }
		}
		if (4 * kMod === 3 * n) {
			return { re: { ...ZERO }, im: inverse ? { ...NEG_ONE } : { ...ONE } }
		}

		// Reduce fraction kMod / n so shared angles across recursion depths hit the cache
		let rNum = kMod
		let rDen = n
		while ((rNum & 1) === 0 && (rDen & 1) === 0) {
			rNum >>= 1
			rDen >>= 1
		}
		const cacheKey = `${rNum}/${rDen}`
		const cached = cache.get(cacheKey)
		if (cached !== undefined) {
			return cached
		}

		ensureInit()

		// rDen is a power of 2 >= 8, so Q = rDen / 4 and E = rDen / 8 are exact integers
		const Q = rDen >> 2
		const E = rDen >> 3

		// Quadrant reduction of theta = 2*pi*rNum/rDen to phi in (0, pi/2)
		let k1
		let cosNeg = false
		let sinNeg = false
		if (rNum < Q) {
			k1 = rNum
		} else if (rNum < 2 * Q) {
			k1 = 2 * Q - rNum
			cosNeg = true
		} else if (rNum < 3 * Q) {
			k1 = rNum - 2 * Q
			cosNeg = true
			sinNeg = true
		} else {
			k1 = 4 * Q - rNum
			sinNeg = true
		}

		// Octant reduction of phi = 2*pi*k1/rDen to alpha in (0, pi/4]
		let cRat
		let sRat
		if (k1 === E) {
			// Exact diagonal symmetry: cos(pi/4) = sin(pi/4)
			const alphaScaled = piVal / 4n
			const { cosScaled } = cosSinScaled(alphaScaled, workScale)
			const diag = roundToRational(cosScaled, guard, outScale)
			cRat = diag
			sRat = diag
		} else if (k1 < E) {
			const alphaScaled = (2n * piVal * BigInt(k1)) / BigInt(rDen)
			const { cosScaled, sinScaled } = cosSinScaled(alphaScaled, workScale)
			cRat = roundToRational(cosScaled, guard, outScale)
			sRat = roundToRational(sinScaled, guard, outScale)
		} else {
			const k2 = Q - k1
			const alphaScaled = (2n * piVal * BigInt(k2)) / BigInt(rDen)
			const { cosScaled, sinScaled } = cosSinScaled(alphaScaled, workScale)
			cRat = roundToRational(sinScaled, guard, outScale)
			sRat = roundToRational(cosScaled, guard, outScale)
		}

		const re = cosNeg ? ratNeg(cRat) : cRat
		// Forward DFT uses exp(-i*theta) = cos(theta) - i*sin(theta)
		// Inverse DFT uses exp(+i*theta) = cos(theta) + i*sin(theta)
		const finalSinNeg = inverse ? sinNeg : !sinNeg
		const im = finalSinNeg ? ratNeg(sRat) : sRat

		const result = { re, im }
		cache.set(cacheKey, result)
		return result
	}

	return { getTwiddle }
}

/**
 * Recursive Cooley-Tukey radix-2 FFT over normalized complex-rational arrays.
 * @param {Array<{ re: { num: bigint, den: bigint }, im: { num: bigint, den: bigint } }>} signal
 * @param {{ getTwiddle: (k: number, n: number) => { re: { num: bigint, den: bigint }, im: { num: bigint, den: bigint } } }} ctx
 * @returns {Array<{ re: { num: bigint, den: bigint }, im: { num: bigint, den: bigint } }>}
 */
function fftRecursive(signal, ctx) {
	const n = signal.length
	if (n === 1) {
		return [
			{
				re: { num: signal[0].re.num, den: signal[0].re.den },
				im: { num: signal[0].im.num, den: signal[0].im.den },
			},
		]
	}

	const half = n >> 1
	const even = new Array(half)
	const odd = new Array(half)
	for (let i = 0; i < half; i++) {
		even[i] = signal[2 * i]
		odd[i] = signal[2 * i + 1]
	}

	const evenFFT = fftRecursive(even, ctx)
	const oddFFT = fftRecursive(odd, ctx)

	const output = new Array(n)
	for (let k = 0; k < half; k++) {
		const twiddle = ctx.getTwiddle(k, n)
		const oddTerm = complexMul(twiddle, oddFFT[k])
		output[k] = complexAdd(evenFFT[k], oddTerm)
		output[k + half] = complexSub(evenFFT[k], oddTerm)
	}

	return output
}

/**
 * Compute the Discrete Fourier Transform (or inverse DFT) of a power-of-two-length
 * array of exact rationals or complex rationals using a recursive Cooley-Tukey
 * divide-and-conquer algorithm.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 * @typedef {{ re: Rational, im: Rational }} ComplexRational
 *
 * @param {Array<Rational | ComplexRational>} input
 *   Power-of-two-length array (`N = 2^m >= 1`) of exact rationals `{ num: BigInt, den: BigInt }`
 *   (automatically promoted to `{ re, im: 0n/1n }`) or complex rationals `{ re, im }`.
 * @param {{ inverse?: boolean, precision?: number }} [options]
 *   Optional transform configuration:
 *   - `inverse` (default `false`): when `true`, computes the inverse DFT with `1/N` scaling.
 *   - `precision` (default `16`): positive integer number of decimal digits of precision for
 *     non-quadrantal rational twiddle factors (`N >= 8`). Ignored for `N = 1, 2, 4`, which
 *     are always algebraically exact.
 * @returns {Array<ComplexRational>}
 *   Array of length `N` of complex rationals with every `re` and `im` normalized to lowest
 *   terms (`den > 0n`, `0n/1n` for zero).
 */
export function fourierTransformRationalRecursive(input, options = {}) {
	if (!Array.isArray(input)) {
		throw new TypeError('Input must be an array of rationals or complex rationals')
	}

	const n = input.length
	if (n === 0 || (n & (n - 1)) !== 0) {
		throw new RangeError(
			`Input length must be a positive power of two (got ${n})`,
		)
	}

	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new TypeError('Options must be a plain object')
	}

	const { inverse = false, precision = 16 } = options

	if (typeof inverse !== 'boolean') {
		throw new TypeError('options.inverse must be a boolean')
	}

	if (typeof precision !== 'number') {
		throw new TypeError('options.precision must be a positive integer')
	}
	if (!Number.isInteger(precision) || precision < 1 || precision > 200) {
		throw new RangeError('options.precision must be an integer between 1 and 200')
	}

	const normalizedSignal = new Array(n)
	for (let i = 0; i < n; i++) {
		normalizedSignal[i] = parseElement(input[i], i)
	}

	const ctx = createTwiddleContext(inverse, precision)
	const transformed = fftRecursive(normalizedSignal, ctx)

	if (!inverse) {
		return transformed
	}

	const nBig = BigInt(n)
	return transformed.map(({ re, im }) => ({
		re: ratDivByBigInt(re, nBig),
		im: ratDivByBigInt(im, nBig),
	}))
}
