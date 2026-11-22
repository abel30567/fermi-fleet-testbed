/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * An exact rational number `num / den` in lowest terms with `den > 0n`
 * (zero is represented as `{ num: 0n, den: 1n }`).
 */

/**
 * @typedef {{ re: Rational, im: Rational }} ComplexRational
 * A complex number whose real and imaginary parts are exact {@link Rational} values.
 */

/**
 * @typedef {Object} FourierTransformOptions
 * @property {boolean} [inverse=false] - If `true`, computes the inverse DFT scaled by `1 / N`.
 * @property {number} [terms=10] - Number of Taylor series terms (`>= 1`) used to evaluate
 *   rational trigonometric values for non-quadrant angles.
 */

/**
 * Computes the greatest common divisor of two BigInt values iteratively.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative GCD of `a` and `b`.
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Normalizes a rational number `num / den` to lowest terms with a strictly positive denominator.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must not be zero')
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
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Validates and normalizes a `{ num: bigint, den: bigint }` rational value.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function parseRational(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be a rational object { num: BigInt, den: BigInt }`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label}.num and ${label}.den must both be BigInt`)
	}
	if (den === 0n) {
		throw new RangeError(`${label}.den must not be zero`)
	}
	return normalizeRational(num, den)
}

/**
 * Validates and normalizes a signal sample (either a real Rational or a ComplexRational).
 *
 * @param {unknown} sample
 * @param {number} index
 * @returns {ComplexRational}
 */
function parseSample(sample, index) {
	if (sample === null || typeof sample !== 'object' || Array.isArray(sample)) {
		throw new TypeError(
			`signal[${index}] must be a Rational { num, den } or ComplexRational { re, im }`,
		)
	}
	const hasRationalKeys = 'num' in sample || 'den' in sample
	const hasComplexKeys = 're' in sample || 'im' in sample
	if (hasRationalKeys && hasComplexKeys) {
		throw new TypeError(
			`signal[${index}] is ambiguous: cannot specify both { num, den } and { re, im }`,
		)
	}
	if (hasComplexKeys) {
		return {
			re: parseRational(sample.re, `signal[${index}].re`),
			im: parseRational(sample.im, `signal[${index}].im`),
		}
	}
	if (hasRationalKeys) {
		return {
			re: parseRational(sample, `signal[${index}]`),
			im: { num: 0n, den: 1n },
		}
	}
	throw new TypeError(
		`signal[${index}] must be a Rational { num, den } or ComplexRational { re, im }`,
	)
}

function ratAdd(a, b) {
	if (a.num === 0n) return { num: b.num, den: b.den }
	if (b.num === 0n) return { num: a.num, den: a.den }
	if (a.den === b.den) {
		return normalizeRational(a.num + b.num, a.den)
	}
	const g = gcdBigInt(a.den, b.den)
	const aDenReduced = a.den / g
	const bDenReduced = b.den / g
	return normalizeRational(a.num * bDenReduced + b.num * aDenReduced, aDenReduced * b.den)
}

function ratSub(a, b) {
	if (b.num === 0n) return { num: a.num, den: a.den }
	if (a.num === 0n) return { num: -b.num, den: b.den }
	if (a.den === b.den) {
		return normalizeRational(a.num - b.num, a.den)
	}
	const g = gcdBigInt(a.den, b.den)
	const aDenReduced = a.den / g
	const bDenReduced = b.den / g
	return normalizeRational(a.num * bDenReduced - b.num * aDenReduced, aDenReduced * b.den)
}

function ratMul(a, b) {
	if (a.num === 0n || b.num === 0n) return { num: 0n, den: 1n }
	const g1 = gcdBigInt(a.num, b.den)
	const g2 = gcdBigInt(b.num, a.den)
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	}
}

function ratNeg(a) {
	if (a.num === 0n) return { num: 0n, den: 1n }
	return { num: -a.num, den: a.den }
}

function ratDivInt(a, divisor) {
	if (a.num === 0n) return { num: 0n, den: 1n }
	return normalizeRational(a.num, a.den * divisor)
}

/**
 * Determines the number of binary fractional bits of pi needed so that pi approximation
 * error is negligible relative to a Taylor polynomial of `terms` terms on `[0, pi/4]`.
 *
 * @param {number} terms
 * @returns {number}
 */
function requiredPiBits(terms) {
	let fact = 1n
	const limit = 2 * terms + 1
	for (let i = 2; i <= limit; i++) {
		fact *= BigInt(i)
	}
	const factBits = fact.toString(2).length
	const angleBits = Math.ceil(0.35 * limit)
	return factBits + angleBits + 24
}

/**
 * Computes a dyadic rational approximation of pi rounded to `bits` fractional bits
 * using Machin's formula `pi = 16 * atan(1/5) - 4 * atan(1/239)` iteratively.
 *
 * @param {number} bits
 * @returns {Rational}
 */
function computePiRational(bits) {
	const guard = 32n
	const shift = BigInt(bits) + guard
	const scale = 1n << shift

	function arctanReciprocal(invX) {
		const x2 = invX * invX
		let term = scale / invX
		let sum = term
		let k = 1n
		let sign = -1n
		while (term !== 0n) {
			term = term / x2
			const contrib = term / (2n * k + 1n)
			if (contrib === 0n) break
			sum += sign * contrib
			sign = -sign
			k += 1n
		}
		return sum
	}

	const piScaled = 16n * arctanReciprocal(5n) - 4n * arctanReciprocal(239n)
	const half = 1n << (guard - 1n)
	const rounded = (piScaled + half) >> guard
	return normalizeRational(rounded, 1n << BigInt(bits))
}

/**
 * Evaluates the `terms`-term Taylor polynomial for `cos(phi)` iteratively via Horner's method.
 *
 * @param {Rational} phi
 * @param {number} terms
 * @returns {Rational}
 */
function cosTaylor(phi, terms) {
	if (phi.num === 0n) return { num: 1n, den: 1n }
	const a = phi.num * phi.num
	const b = phi.den * phi.den
	let num = 1n
	let den = 1n
	for (let j = terms - 1; j >= 1; j--) {
		const factor = b * BigInt((2 * j - 1) * (2 * j))
		num = factor * den - a * num
		den = factor * den
	}
	return normalizeRational(num, den)
}

/**
 * Evaluates the `terms`-term Taylor polynomial for `sin(phi)` iteratively via Horner's method.
 *
 * @param {Rational} phi
 * @param {number} terms
 * @returns {Rational}
 */
function sinTaylor(phi, terms) {
	if (phi.num === 0n) return { num: 0n, den: 1n }
	const a = phi.num * phi.num
	const b = phi.den * phi.den
	let num = 1n
	let den = 1n
	for (let j = terms - 1; j >= 1; j--) {
		const factor = b * BigInt(2 * j * (2 * j + 1))
		num = factor * den - a * num
		den = factor * den
	}
	return normalizeRational(num * phi.num, den * phi.den)
}

/**
 * Computes `(cos(2*pi*m/N), sin(2*pi*m/N))` over exact rationals using exact octant
 * reduction to `[0, pi/4]`, exact special angles (`0`, `pi/6`, `pi/4` symmetry), and
 * Horner-evaluated Taylor polynomials.
 *
 * @param {number} m - Non-negative integer in `[0, N - 1]`.
 * @param {number} N - Transform length (`>= 1`).
 * @param {number} terms - Taylor series term count (`>= 1`).
 * @param {() => Rational} getPi - Lazy provider for rational pi approximation.
 * @returns {{ c: Rational, s: Rational }}
 */
function cosSinFractionOfTurn(m, N, terms, getPi) {
	const g = gcdBigInt(BigInt(m), BigInt(N))
	const p = BigInt(m) / g
	const q = BigInt(N) / g

	// Angle theta = (2 * p / q) * pi = t * pi, where t = 2p / q in [0, 2).
	// Octant = floor(4 * t) = floor(8 * p / q) in {0, 1, ..., 7}.
	const octant = Number((8n * p) / q)

	// Express reduced angle phi = r * pi with r in [0, 1/4].
	let r
	switch (octant) {
		case 0:
			r = normalizeRational(2n * p, q)
			break
		case 1:
			r = normalizeRational(q - 4n * p, 2n * q)
			break
		case 2:
			r = normalizeRational(4n * p - q, 2n * q)
			break
		case 3:
			r = normalizeRational(q - 2n * p, q)
			break
		case 4:
			r = normalizeRational(2n * p - q, q)
			break
		case 5:
			r = normalizeRational(3n * q - 4n * p, 2n * q)
			break
		case 6:
			r = normalizeRational(4n * p - 3n * q, 2n * q)
			break
		case 7:
		default:
			r = normalizeRational(2n * q - 2n * p, q)
			break
	}

	let cosPhi
	let sinPhi

	if (r.num === 0n) {
		// Exact quadrant boundary: cos(0) = 1, sin(0) = 0.
		cosPhi = { num: 1n, den: 1n }
		sinPhi = { num: 0n, den: 1n }
	} else if (r.num === 1n && r.den === 6n) {
		// Exact sin(pi/6) = 1/2; cos(pi/6) = sqrt(3)/2 via Taylor series.
		const phi = ratMul(r, getPi())
		cosPhi = cosTaylor(phi, terms)
		sinPhi = { num: 1n, den: 2n }
	} else if (r.num === 1n && r.den === 4n) {
		// Preserve exact cos(pi/4) === sin(pi/4) symmetry across all octants.
		const phi = ratMul(r, getPi())
		cosPhi = cosTaylor(phi, terms)
		sinPhi = { num: cosPhi.num, den: cosPhi.den }
	} else {
		const phi = ratMul(r, getPi())
		cosPhi = cosTaylor(phi, terms)
		sinPhi = sinTaylor(phi, terms)
	}

	switch (octant) {
		case 0:
			return { c: cosPhi, s: sinPhi }
		case 1:
			return { c: sinPhi, s: cosPhi }
		case 2:
			return { c: ratNeg(sinPhi), s: cosPhi }
		case 3:
			return { c: ratNeg(cosPhi), s: sinPhi }
		case 4:
			return { c: ratNeg(cosPhi), s: ratNeg(sinPhi) }
		case 5:
			return { c: ratNeg(sinPhi), s: ratNeg(cosPhi) }
		case 6:
			return { c: sinPhi, s: ratNeg(cosPhi) }
		case 7:
		default:
			return { c: cosPhi, s: ratNeg(sinPhi) }
	}
}

/**
 * Computes the Discrete Fourier Transform (or inverse DFT) over exact BigInt rationals
 * represented as `{ num: BigInt, den: BigInt }` in lowest terms with positive denominator,
 * using a straightforward iterative O(N^2) algorithm.
 *
 * Forward transform (`options.inverse = false`, default):
 *   `X[k] = sum_{n=0}^{N-1} x[n] * (cos(2*pi*k*n/N) - i * sin(2*pi*k*n/N))`
 *
 * Inverse transform (`options.inverse = true`):
 *   `x[n] = (1/N) * sum_{k=0}^{N-1} X[k] * (cos(2*pi*k*n/N) + i * sin(2*pi*k*n/N))`
 *
 * Quadrant angles (`0`, `pi/2`, `pi`, `3*pi/2`, covering all `N = 1, 2, 4` transforms)
 * and exact Niven rational values (`sin(pi/6) = 1/2`, `cos(pi/3) = 1/2`, etc.) are
 * evaluated algebraically without approximation. All other angles are reduced by exact
 * octant symmetry to `[0, pi/4]` (preserving exact conjugate symmetry `W[N-m] = conj(W[m])`)
 * and evaluated via iterative Horner-form rational Taylor polynomials using a Machin-formula
 * rational approximation of `pi`.
 *
 * @param {Array<Rational | ComplexRational>} signal - Non-empty array of rational or complex-rational samples.
 * @param {FourierTransformOptions} [options={}] - Optional configuration.
 * @returns {Array<ComplexRational>} Array of length `signal.length` containing exact lowest-terms complex rationals.
 * @throws {TypeError} If `signal` is not an array, contains invalid/sparse samples, or `options` has invalid types.
 * @throws {RangeError} If `signal` is empty, any rational has denominator `0n`, or `options.terms` is not a positive safe integer.
 */
export function fourierTransformRationalIterative(signal, options = {}) {
	if (!Array.isArray(signal)) {
		throw new TypeError('signal must be an Array')
	}
	if (signal.length === 0) {
		throw new RangeError('signal must not be empty')
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}

	const inverse = options.inverse === undefined ? false : options.inverse
	if (typeof inverse !== 'boolean') {
		throw new TypeError('options.inverse must be a boolean')
	}

	const terms = options.terms === undefined ? 10 : options.terms
	if (typeof terms !== 'number') {
		throw new TypeError('options.terms must be a positive integer')
	}
	if (!Number.isSafeInteger(terms) || terms < 1) {
		throw new RangeError('options.terms must be a positive safe integer')
	}

	const N = signal.length
	const samples = new Array(N)
	for (let i = 0; i < N; i++) {
		if (!(i in signal)) {
			throw new TypeError(`signal[${i}] must not be a sparse hole`)
		}
		samples[i] = parseSample(signal[i], i)
	}

	// Lazily compute rational pi only if non-quadrant angles are encountered.
	let cachedPi = null
	function getPi() {
		if (cachedPi === null) {
			cachedPi = computePiRational(requiredPiBits(terms))
		}
		return cachedPi
	}

	// Precompute twiddle factors W[m] = cos(2*pi*m/N) +/- i*sin(2*pi*m/N).
	const twiddles = new Array(N)
	for (let m = 0; m < N; m++) {
		const { c, s } = cosSinFractionOfTurn(m, N, terms, getPi)
		twiddles[m] = {
			re: c,
			im: inverse ? s : ratNeg(s),
		}
	}

	const nBig = BigInt(N)
	const output = new Array(N)

	for (let k = 0; k < N; k++) {
		let sumRe = { num: 0n, den: 1n }
		let sumIm = { num: 0n, den: 1n }

		for (let n = 0; n < N; n++) {
			const sample = samples[n]
			if (sample.re.num === 0n && sample.im.num === 0n) {
				continue
			}
			const w = twiddles[(k * n) % N]
			const prodRe = ratSub(ratMul(sample.re, w.re), ratMul(sample.im, w.im))
			const prodIm = ratAdd(ratMul(sample.re, w.im), ratMul(sample.im, w.re))
			sumRe = ratAdd(sumRe, prodRe)
			sumIm = ratAdd(sumIm, prodIm)
		}

		if (inverse) {
			sumRe = ratDivInt(sumRe, nBig)
			sumIm = ratDivInt(sumIm, nBig)
		}

		output[k] = { re: sumRe, im: sumIm }
	}

	return output
}
