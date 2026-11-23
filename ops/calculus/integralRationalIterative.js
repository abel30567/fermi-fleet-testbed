/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * An exact rational number in lowest terms with `den > 0n`, `gcd(|num|, den) === 1n`,
 * and zero canonically represented as `{ num: 0n, den: 1n }`.
 */

/**
 * Compute the greatest common divisor of two BigInts using the iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
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
 * Construct a normalized Rational in lowest terms from numerator and denominator BigInts.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function makeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator cannot be 0n')
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
 * Validate and normalize an input rational `{ num: BigInt, den: BigInt }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function validateRational(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be an object of shape { num: BigInt, den: BigInt }`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have bigint properties num and den`)
	}
	if (den === 0n) {
		throw new RangeError(`${label}.den cannot be 0n`)
	}
	return makeRational(num, den)
}

/**
 * Add two normalized rationals.
 *
 * @param {Rational} x
 * @param {Rational} y
 * @returns {Rational}
 */
function addRational(x, y) {
	return makeRational(x.num * y.den + y.num * x.den, x.den * y.den)
}

/**
 * Subtract two normalized rationals (`x - y`).
 *
 * @param {Rational} x
 * @param {Rational} y
 * @returns {Rational}
 */
function subRational(x, y) {
	return makeRational(x.num * y.den - y.num * x.den, x.den * y.den)
}

/**
 * Multiply two normalized rationals.
 *
 * @param {Rational} x
 * @param {Rational} y
 * @returns {Rational}
 */
function mulRational(x, y) {
	return makeRational(x.num * y.num, x.den * y.den)
}

/**
 * Evaluate a polynomial `P(x) = sum_{i=0}^{n-1} coeffs[i] * x^i` iteratively using Horner's method.
 *
 * @param {Rational[]} coeffs
 * @param {Rational} x
 * @returns {Rational}
 */
function evaluatePolynomialIterative(coeffs, x) {
	let acc = { num: 0n, den: 1n }
	for (let i = coeffs.length - 1; i >= 0; i -= 1) {
		acc = addRational(mulRational(acc, x), coeffs[i])
	}
	return acc
}

/**
 * Compute the exact polynomial integral over rationals `{ num: BigInt, den: BigInt }`
 * in lowest terms using a straightforward iterative implementation.
 *
 * Polynomials are represented as coefficient arrays in ascending powers of `x`:
 * `coeffs = [c0, c1, ..., c_{n-1}]` represents `P(x) = c0 + c1*x + ... + c_{n-1}*x^{n-1}`.
 *
 * Calling modes:
 * - Indefinite integral (antiderivative):
 *   - `integralRationalIterative(coeffs)` returns `[0/1, c0/1, c1/2, ..., c_{n-1}/n]`.
 *   - `integralRationalIterative(coeffs, constant)` returns `[C, c0/1, c1/2, ..., c_{n-1}/n]`.
 * - Definite integral:
 *   - `integralRationalIterative(coeffs, a, b)` computes `∫_a^b P(x) dx = F(b) - F(a)`
 *     and returns a single normalized `Rational`.
 *
 * @param {Rational[]} coeffs - Polynomial coefficients in ascending degree order.
 * @param {Rational} [aOrConstant] - Lower bound `a` (when `b` is provided) or integration constant `C` (when `b` is omitted).
 * @param {Rational} [b] - Upper bound `b` for a definite integral.
 * @returns {Rational[] | Rational} Normalized antiderivative coefficients (indefinite) or exact definite integral value.
 * @throws {TypeError} If `coeffs` is not an array, any rational lacks BigInt `num`/`den`, or `b` is provided without `a`.
 * @throws {RangeError} If any rational has a zero denominator (`den === 0n`).
 */
export function integralRationalIterative(coeffs, aOrConstant, b) {
	if (!Array.isArray(coeffs)) {
		throw new TypeError('coeffs must be an array of rationals { num: BigInt, den: BigInt }')
	}

	const normalizedCoeffs = new Array(coeffs.length)
	for (let i = 0; i < coeffs.length; i += 1) {
		if (!(i in coeffs)) {
			throw new TypeError(`coeffs[${i}] must be an object of shape { num: BigInt, den: BigInt }`)
		}
		normalizedCoeffs[i] = validateRational(coeffs[i], `coeffs[${i}]`)
	}

	const hasFirst = aOrConstant !== undefined
	const hasSecond = b !== undefined

	if (!hasFirst && hasSecond) {
		throw new TypeError('lower bound a must be provided when upper bound b is specified')
	}

	const constant = hasFirst && !hasSecond
		? validateRational(aOrConstant, 'constant')
		: { num: 0n, den: 1n }

	const antiderivative = new Array(normalizedCoeffs.length + 1)
	antiderivative[0] = constant
	for (let i = 0; i < normalizedCoeffs.length; i += 1) {
		const coeff = normalizedCoeffs[i]
		const degree = BigInt(i + 1)
		antiderivative[i + 1] = makeRational(coeff.num, coeff.den * degree)
	}

	if (hasSecond) {
		const lower = validateRational(aOrConstant, 'a')
		const upper = validateRational(b, 'b')
		const upperVal = evaluatePolynomialIterative(antiderivative, upper)
		const lowerVal = evaluatePolynomialIterative(antiderivative, lower)
		return subRational(upperVal, lowerVal)
	}

	return antiderivative
}
