/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * An exact rational number in lowest terms with `den > 0n` and `0n / 1n` for zero.
 */

/**
 * @typedef {{ re: Rational, im: Rational }} ComplexRational
 * An exact complex rational number with real and imaginary rational components.
 */

/**
 * @typedef {object} FourierTransformOptions
 * @property {boolean} [inverse=false] If true, computes the inverse DFT (with `1/N` scaling and positive exponent).
 * @property {number} [precision=64] Number of fractional binary bits (1..4096) used to approximate irrational twiddle factors.
 */

const ZERO = Object.freeze({ num: 0n, den: 1n })
const ONE = Object.freeze({ num: 1n, den: 1n })
const NEG_ONE = Object.freeze({ num: -1n, den: 1n })
const HALF = Object.freeze({ num: 1n, den: 2n })
const NEG_HALF = Object.freeze({ num: -1n, den: 2n })

const MAX_PRECISION = 4096
const DEFAULT_PRECISION = 64
const GUARD_BITS = 32

function absBigInt(value) {
	return value < 0n ? -value : value
}

function gcdBigInt(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		const remainder = x % y
		x = y
		y = remainder
	}
	return x
}

function makeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must be non-zero')
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

function negRational(r) {
	return r.num === 0n ? { num: 0n, den: 1n } : { num: -r.num, den: r.den }
}

function addRational(a, b) {
	if (a.num === 0n) return { num: b.num, den: b.den }
	if (b.num === 0n) return { num: a.num, den: a.den }
	const g = gcdBigInt(a.den, b.den)
	const aDenReduced = a.den / g
	const bDenReduced = b.den / g
	const num = a.num * bDenReduced + b.num * aDenReduced
	const den = aDenReduced * b.den
	return makeRational(num, den)
}

function subRational(a, b) {
	if (b.num === 0n) return { num: a.num, den: a.den }
	if (a.num === 0n) return negRational(b)
	const g = gcdBigInt(a.den, b.den)
	const aDenReduced = a.den / g
	const bDenReduced = b.den / g
	const num = a.num * bDenReduced - b.num * aDenReduced
	const den = aDenReduced * b.den
	return makeRational(num, den)
}

function mulRational(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcdBigInt(a.num, b.den)
	const g2 = gcdBigInt(b.num, a.den)
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	}
}

function divRationalByBigInt(r, divisor) {
	if (divisor === 0n) {
		throw new RangeError('Division by zero')
	}
	if (r.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g = gcdBigInt(r.num, divisor)
	return makeRational(r.num / g, r.den * (divisor / g))
}

function isPlainObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseRational(value, label) {
	if (!isPlainObject(value)) {
		throw new TypeError(`${label} must be an object with bigint num and den properties`)
	}
	if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
		throw new TypeError(`${label} must have bigint num and den properties`)
	}
	if (value.den === 0n) {
		throw new RangeError(`${label} denominator must be non-zero`)
	}
	return makeRational(value.num, value.den)
}

function parseInputElement(element, index) {
	if (!isPlainObject(element)) {
		throw new TypeError(`input[${index}] must be a rational {num, den} or complex rational {re, im}`)
	}
	const hasRationalFields = 'num' in element || 'den' in element
	const hasComplexFields = 're' in element || 'im' in element
	if (hasRationalFields && hasComplexFields) {
		throw new TypeError(`input[${index}] cannot mix {num, den} and {re, im} fields`)
	}
	if (hasRationalFields) {
		return {
			re: parseRational(element, `input[${index}]`),
			im: { num: 0n, den: 1n },
		}
	}
	if (hasComplexFields) {
		return {
			re: parseRational(element.re, `input[${index}].re`),
			im: parseRational(element.im, `input[${index}].im`),
		}
	}
	throw new TypeError(`input[${index}] must be a rational {num, den} or complex rational {re, im}`)
}

function parseOptions(options) {
	if (options === undefined) {
		return { inverse: false, precision: DEFAULT_PRECISION }
	}
	if (!isPlainObject(options)) {
		throw new TypeError('options must be a plain object')
	}
	const inverse = options.inverse ?? false
	if (typeof inverse !== 'boolean') {
		throw new TypeError('options.inverse must be a boolean')
	}
	const precision = options.precision ?? DEFAULT_PRECISION
	if (typeof precision !== 'number' || !Number.isInteger(precision)) {
		throw new TypeError('options.precision must be an integer')
	}
	if (precision < 1 || precision > MAX_PRECISION) {
		throw new RangeError(`options.precision must be between 1 and ${MAX_PRECISION}`)
	}
	return { inverse, precision }
}

function arctanReciprocalScaled(invX, scale) {
	const invX2 = invX * invX
	let term = scale / invX
	let sum = term
	let k = 1n
	let sign = -1n
	while (term !== 0n) {
		term = term / invX2
		if (term === 0n) break
		const contrib = term / (2n * k + 1n)
		if (contrib === 0n) break
		sum += sign * contrib
		sign = -sign
		k += 1n
	}
	return sum
}

function computePiScaled(workBits) {
	const extraBits = 32
	const scale = 1n << BigInt(workBits + extraBits)
	const piExtra =
		16n * arctanReciprocalScaled(5n, scale) -
		4n * arctanReciprocalScaled(239n, scale)
	return (piExtra + (1n << BigInt(extraBits - 1))) >> BigInt(extraBits)
}

function computeCosSinScaled(alphaScaled, workBits) {
	const shift = BigInt(workBits)
	const oneScaled = 1n << shift
	const alpha2 = (alphaScaled * alphaScaled) >> shift

	let cosSum = oneScaled
	let cosTerm = oneScaled
	let n = 0n
	let sign = -1n
	while (true) {
		cosTerm = (cosTerm * alpha2) / (oneScaled * (n + 1n) * (n + 2n))
		if (cosTerm === 0n) break
		cosSum += sign * cosTerm
		sign = -sign
		n += 2n
	}

	let sinSum = alphaScaled
	let sinTerm = alphaScaled
	n = 1n
	sign = -1n
	while (true) {
		sinTerm = (sinTerm * alpha2) / (oneScaled * (n + 1n) * (n + 2n))
		if (sinTerm === 0n) break
		sinSum += sign * sinTerm
		sign = -sign
		n += 2n
	}

	return { cosScaled: cosSum, sinScaled: sinSum }
}

function scaledToRational(valueScaled, sign, workBits, precision) {
	const shift = BigInt(workBits - precision)
	const rounded = (valueScaled + (1n << (shift - 1n))) >> shift
	const den = 1n << BigInt(precision)
	return makeRational(sign < 0 ? -rounded : rounded, den)
}

function getExactCos(m, n) {
	if (m === 0n) return ONE
	if (2n * m === n) return NEG_ONE
	if (4n * m === n || 4n * m === 3n * n) return ZERO
	if (6n * m === n || 6n * m === 5n * n) return HALF
	if (3n * m === n || 3n * m === 2n * n) return NEG_HALF
	return null
}

function getExactSin(m, n) {
	if (m === 0n || 2n * m === n) return ZERO
	if (4n * m === n) return ONE
	if (4n * m === 3n * n) return NEG_ONE
	if (12n * m === n || 12n * m === 5n * n) return HALF
	if (12n * m === 7n * n || 12n * m === 11n * n) return NEG_HALF
	return null
}

function buildTwiddleTable(length, precision) {
	const nBig = BigInt(length)
	const workBits = precision + GUARD_BITS
	const half = Math.floor(length / 2)
	const table = new Array(length)
	let piScaled = null

	const ensurePi = () => {
		if (piScaled === null) {
			piScaled = computePiScaled(workBits)
		}
		return piScaled
	}

	for (let m = 0; m <= half; m++) {
		const mBig = BigInt(m)
		const exactCos = getExactCos(mBig, nBig)
		const exactSin = getExactSin(mBig, nBig)

		if (exactCos !== null && exactSin !== null) {
			table[m] = {
				cos: { num: exactCos.num, den: exactCos.den },
				sin: { num: exactSin.num, den: exactSin.den },
			}
			continue
		}

		const pi = ensurePi()
		const octant = Number((8n * mBig) / nBig)
		let cosVal
		let sinVal

		if (8n * mBig === nBig) {
			const alphaScaled = (pi + 2n) / 4n
			const { cosScaled } = computeCosSinScaled(alphaScaled, workBits)
			const diag = scaledToRational(cosScaled, 1, workBits, precision)
			cosVal = diag
			sinVal = { num: diag.num, den: diag.den }
		} else if (8n * mBig === 3n * nBig) {
			const alphaScaled = (pi + 2n) / 4n
			const { cosScaled } = computeCosSinScaled(alphaScaled, workBits)
			const diag = scaledToRational(cosScaled, 1, workBits, precision)
			cosVal = negRational(diag)
			sinVal = diag
		} else if (octant === 0) {
			const alphaScaled = (2n * pi * mBig + nBig / 2n) / nBig
			const { cosScaled, sinScaled } = computeCosSinScaled(alphaScaled, workBits)
			cosVal = scaledToRational(cosScaled, 1, workBits, precision)
			sinVal = scaledToRational(sinScaled, 1, workBits, precision)
		} else if (octant === 1) {
			const p = nBig - 4n * mBig
			const d = 2n * nBig
			const alphaScaled = (pi * p + d / 2n) / d
			const { cosScaled, sinScaled } = computeCosSinScaled(alphaScaled, workBits)
			cosVal = scaledToRational(sinScaled, 1, workBits, precision)
			sinVal = scaledToRational(cosScaled, 1, workBits, precision)
		} else if (octant === 2) {
			const p = 4n * mBig - nBig
			const d = 2n * nBig
			const alphaScaled = (pi * p + d / 2n) / d
			const { cosScaled, sinScaled } = computeCosSinScaled(alphaScaled, workBits)
			cosVal = scaledToRational(sinScaled, -1, workBits, precision)
			sinVal = scaledToRational(cosScaled, 1, workBits, precision)
		} else {
			// octant === 3: 3N < 8m < 4N
			const p = nBig - 2n * mBig
			const alphaScaled = (pi * p + nBig / 2n) / nBig
			const { cosScaled, sinScaled } = computeCosSinScaled(alphaScaled, workBits)
			cosVal = scaledToRational(cosScaled, -1, workBits, precision)
			sinVal = scaledToRational(sinScaled, 1, workBits, precision)
		}

		table[m] = {
			cos: exactCos !== null ? { num: exactCos.num, den: exactCos.den } : cosVal,
			sin: exactSin !== null ? { num: exactSin.num, den: exactSin.den } : sinVal,
		}
	}

	for (let m = half + 1; m < length; m++) {
		const mirror = table[length - m]
		table[m] = {
			cos: { num: mirror.cos.num, den: mirror.cos.den },
			sin: negRational(mirror.sin),
		}
	}

	return table
}

/**
 * Computes the Discrete Fourier Transform (or its inverse) of a sequence over exact
 * rationals `{ num: bigint, den: bigint }` in lowest terms using a straightforward
 * iterative algorithm.
 *
 * Accepts either real rationals `{ num, den }` or complex rationals `{ re, im }` as
 * elements of `input`. Every rational in the returned array is canonicalized to lowest
 * terms (`den > 0n`, `gcd(|num|, den) === 1n`, and `{ num: 0n, den: 1n }` for zero).
 *
 * Trigonometric twiddle factors with rational values (e.g. multiples of `pi/2`, and
 * rational `±1/2` cosines/sines) are represented exactly; irrational twiddle factors are
 * computed iteratively in pure BigInt arithmetic to `options.precision` fractional bits.
 * Consequently, transforms of length 1, 2, and 4—as well as DC, Nyquist, and quarter-rate
 * bins of arbitrary length—are mathematically exact.
 *
 * @param {Array<Rational | ComplexRational>} input Input signal sequence.
 * @param {FourierTransformOptions} [options] Optional configuration.
 * @returns {Array<ComplexRational>} Transformed complex rational sequence in lowest terms.
 * @throws {TypeError} If `input`, any element, or `options` has an invalid type.
 * @throws {RangeError} If any rational has denominator `0n` or `options.precision` is out of range.
 */
export function fourierTransformRationalIterative(input, options) {
	if (!Array.isArray(input)) {
		throw new TypeError('input must be an array')
	}
	const { inverse, precision } = parseOptions(options)

	const n = input.length
	const signal = new Array(n)
	for (let i = 0; i < n; i++) {
		signal[i] = parseInputElement(input[i], i)
	}

	if (n === 0) {
		return []
	}

	const twiddles = buildTwiddleTable(n, precision)
	const nBig = BigInt(n)
	const output = new Array(n)

	for (let k = 0; k < n; k++) {
		let sumRe = { num: 0n, den: 1n }
		let sumIm = { num: 0n, den: 1n }

		for (let idx = 0; idx < n; idx++) {
			const twiddleIndex = (k * idx) % n
			const twiddle = twiddles[twiddleIndex]
			const wRe = twiddle.cos
			const wIm = inverse ? twiddle.sin : negRational(twiddle.sin)

			const sample = signal[idx]
			const termRe = subRational(mulRational(sample.re, wRe), mulRational(sample.im, wIm))
			const termIm = addRational(mulRational(sample.re, wIm), mulRational(sample.im, wRe))

			sumRe = addRational(sumRe, termRe)
			sumIm = addRational(sumIm, termIm)
		}

		if (inverse) {
			sumRe = divRationalByBigInt(sumRe, nBig)
			sumIm = divRationalByBigInt(sumIm, nBig)
		}

		output[k] = { re: sumRe, im: sumIm }
	}

	return output
}
