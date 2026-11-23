/**
 * Exact term-by-term integration of a rational polynomial or formal power series.
 *
 * Represents exact rationals as normalized `{ num: BigInt, den: BigInt }` objects
 * in lowest terms with `den > 0n` and `gcd(|num|, den) === 1n` (zero is `{ num: 0n, den: 1n }`).
 *
 * Given a series P(x) = sum_{k=0}^{n-1} a_k x^k represented as `[a_0, a_1, ..., a_{n-1}]`:
 * - Indefinite integral (default): returns `[c, a_0/1, a_1/2, ..., a_{n-1}/n]`.
 * - Definite integral over `[a, b]`: returns exact F(b) - F(a) via Horner evaluation of
 *   the antiderivative F(x) = sum_{k=0}^{n-1} (a_k / (k + 1)) x^{k+1}.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 * @typedef {{ constant?: Rational, c?: Rational, bounds?: [Rational, Rational] }} IntegralOptions
 */

const ZERO = Object.freeze({ num: 0n, den: 1n })

/**
 * Computes the greatest common divisor of two BigInts (always non-negative).
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
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
 * Validates and normalizes a rational value into `{ num: bigint, den: bigint }`
 * with `den > 0n` and `gcd(|num|, den) === 1n`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function normalizeRational(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a rational object { num: BigInt, den: BigInt }`)
	}
	const { num, den } = /** @type {Record<string, unknown>} */ (value)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have BigInt num and den properties`)
	}
	if (den === 0n) {
		throw new RangeError(`${label} denominator must not be zero`)
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const sign = den < 0n ? -1n : 1n
	const n = num * sign
	const d = den * sign
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Adds two normalized rationals and returns a normalized rational.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addRational(a, b) {
	if (a.num === 0n) return { num: b.num, den: b.den }
	if (b.num === 0n) return { num: a.num, den: a.den }
	const g = gcdBigInt(a.den, b.den)
	const num = a.num * (b.den / g) + b.num * (a.den / g)
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const den = (a.den / g) * b.den
	const g2 = gcdBigInt(num, den)
	return { num: num / g2, den: den / g2 }
}

/**
 * Subtracts two normalized rationals (`a - b`) and returns a normalized rational.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function subRational(a, b) {
	return addRational(a, { num: -b.num, den: b.den })
}

/**
 * Multiplies two normalized rationals and returns a normalized rational.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
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

/**
 * Divides a normalized rational by a positive BigInt `k` and returns a normalized rational.
 *
 * @param {Rational} r
 * @param {bigint} k
 * @returns {Rational}
 */
function divRationalByPositiveBigInt(r, k) {
	if (r.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g = gcdBigInt(r.num, k)
	return {
		num: r.num / g,
		den: r.den * (k / g),
	}
}

/**
 * Evaluates a rational polynomial at `x` using Horner's method.
 *
 * @param {Rational[]} coeffs
 * @param {Rational} x
 * @returns {Rational}
 */
function evalHorner(coeffs, x) {
	let acc = { num: ZERO.num, den: ZERO.den }
	for (let i = coeffs.length - 1; i >= 0; i--) {
		acc = addRational(mulRational(acc, x), coeffs[i])
	}
	return acc
}

/**
 * Parses and validates the optional second argument to `integralRationalSeries`.
 *
 * @param {unknown} options
 * @returns {{ mode: 'indefinite', constant: Rational } | { mode: 'definite', bounds: [Rational, Rational] }}
 */
function parseOptions(options) {
	if (options === undefined) {
		return { mode: 'indefinite', constant: { num: 0n, den: 1n } }
	}
	if (typeof options !== 'object' || options === null) {
		throw new TypeError('options must be an options object, a constant rational, or a [a, b] bounds pair')
	}

	if (Array.isArray(options)) {
		if (options.length !== 2) {
			throw new RangeError('bounds must be a 2-element array [a, b]')
		}
		return {
			mode: 'definite',
			bounds: [
				normalizeRational(options[0], 'bounds[0]'),
				normalizeRational(options[1], 'bounds[1]'),
			],
		}
	}

	const obj = /** @type {Record<string, unknown>} */ (options)
	const keys = Object.keys(obj)

	if ('num' in obj || 'den' in obj) {
		if ('bounds' in obj || 'constant' in obj || 'c' in obj) {
			throw new TypeError('options cannot mix a rational constant directly with option keys')
		}
		return {
			mode: 'indefinite',
			constant: normalizeRational(obj, 'constant'),
		}
	}

	const allowed = new Set(['bounds', 'constant', 'c'])
	for (const key of keys) {
		if (!allowed.has(key)) {
			throw new TypeError(`Unknown option "${key}"`)
		}
	}

	const hasBounds = obj.bounds !== undefined
	const hasConstant = obj.constant !== undefined
	const hasC = obj.c !== undefined

	if (hasConstant && hasC) {
		throw new TypeError('options cannot specify both "constant" and "c"')
	}
	if (hasBounds && (hasConstant || hasC)) {
		throw new TypeError('options cannot specify both "bounds" and a constant of integration')
	}

	if (hasBounds) {
		if (!Array.isArray(obj.bounds)) {
			throw new TypeError('options.bounds must be a 2-element array [a, b]')
		}
		if (obj.bounds.length !== 2) {
			throw new RangeError('options.bounds must be a 2-element array [a, b]')
		}
		return {
			mode: 'definite',
			bounds: [
				normalizeRational(obj.bounds[0], 'bounds[0]'),
				normalizeRational(obj.bounds[1], 'bounds[1]'),
			],
		}
	}

	if (hasConstant) {
		return {
			mode: 'indefinite',
			constant: normalizeRational(obj.constant, 'options.constant'),
		}
	}
	if (hasC) {
		return {
			mode: 'indefinite',
			constant: normalizeRational(obj.c, 'options.c'),
		}
	}

	return { mode: 'indefinite', constant: { num: 0n, den: 1n } }
}

/**
 * Computes the exact indefinite or definite integral of a rational polynomial / formal power series.
 *
 * The input series `coeffs = [a_0, a_1, ..., a_{n-1}]` represents:
 *   P(x) = a_0 + a_1 * x + a_2 * x^2 + ... + a_{n-1} * x^{n-1}
 *
 * Supported call forms:
 * - `integralRationalSeries(coeffs)` -> indefinite integral with constant `0/1` (`Rational[]`)
 * - `integralRationalSeries(coeffs, { constant })` or `{ c }` or `constantRational`
 *     -> indefinite integral `[c, a_0/1, a_1/2, ..., a_{n-1}/n]` (`Rational[]`)
 * - `integralRationalSeries(coeffs, { bounds: [a, b] })` or `[a, b]`
 *     -> definite integral `∫_a^b P(x) dx = F(b) - F(a)` (`Rational`)
 *
 * All returned rationals are normalized `{ num: BigInt, den: BigInt }` with `den > 0n`
 * and `gcd(|num|, den) === 1n`.
 *
 * @param {Rational[]} coeffs - Series coefficients `[a_0, a_1, ..., a_{n-1}]`.
 * @param {IntegralOptions | Rational | [Rational, Rational]} [options] - Optional constant of integration or definite integral bounds.
 * @returns {Rational[] | Rational} Antiderivative coefficient array (indefinite) or exact rational value (definite).
 */
export function integralRationalSeries(coeffs, options) {
	if (!Array.isArray(coeffs)) {
		throw new TypeError('coeffs must be an array of rational objects')
	}

	const parsed = parseOptions(options)

	const antiderivative = new Array(coeffs.length + 1)
	antiderivative[0] = parsed.mode === 'indefinite'
		? parsed.constant
		: { num: 0n, den: 1n }

	for (let k = 0; k < coeffs.length; k++) {
		const coeff = normalizeRational(coeffs[k], `coeffs[${k}]`)
		antiderivative[k + 1] = divRationalByPositiveBigInt(coeff, BigInt(k + 1))
	}

	if (parsed.mode === 'indefinite') {
		return antiderivative
	}

	const [a, b] = parsed.bounds
	if (a.num === b.num && a.den === b.den) {
		return { num: 0n, den: 1n }
	}

	const fb = evalHorner(antiderivative, b)
	const fa = evalHorner(antiderivative, a)
	return subRational(fb, fa)
}
