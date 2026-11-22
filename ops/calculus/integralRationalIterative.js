/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * Exact rational number in lowest terms with `den > 0n` (and `{ num: 0n, den: 1n }` for zero).
 */

/**
 * Computes the greatest common divisor of two BigInts iteratively using the Euclidean algorithm.
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
 * Normalizes a numerator and non-zero denominator into a canonical lowest-terms Rational.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {Rational}
 */
function normalizeRational(num, den) {
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

/**
 * Validates that a value is an exact rational `{ num: bigint, den: bigint }` with `den !== 0n`
 * and returns its canonical normalized form.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {Rational}
 */
function validateRational(value, name) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${name} must be a rational object { num: BigInt, den: BigInt }`)
	}
	if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must both be BigInt`)
	}
	if (value.den === 0n) {
		throw new RangeError(`${name}.den must be non-zero`)
	}
	return normalizeRational(value.num, value.den)
}

/**
 * Adds two normalized rationals.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addRational(a, b) {
	return normalizeRational(a.num * b.den + b.num * a.den, a.den * b.den)
}

/**
 * Subtracts two normalized rationals (`a - b`).
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function subRational(a, b) {
	return normalizeRational(a.num * b.den - b.num * a.den, a.den * b.den)
}

/**
 * Multiplies two normalized rationals.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function mulRational(a, b) {
	return normalizeRational(a.num * b.num, a.den * b.den)
}

/**
 * Evaluates a polynomial `poly[0] + poly[1]*x + ... + poly[m]*x^m` at `x`
 * iteratively using Horner's method.
 *
 * @param {Rational[]} poly
 * @param {Rational} x
 * @returns {Rational}
 */
function evaluateHorner(poly, x) {
	let acc = poly[poly.length - 1]
	for (let i = poly.length - 2; i >= 0; i--) {
		acc = addRational(mulRational(acc, x), poly[i])
	}
	return acc
}

/**
 * Computes the exact indefinite or definite integral of a univariate polynomial
 * `p(x) = sum_{i=0}^{n-1} coeffs[i] * x^i` over exact rationals iteratively.
 *
 * - When `lower` and `upper` are both omitted (`undefined`), returns the indefinite
 *   antiderivative polynomial `[0/1, c0/1, c1/2, c2/3, ...]` with constant of integration `0/1`.
 * - When both `lower` and `upper` are provided, evaluates `F(upper) - F(lower)` iteratively
 *   using Horner's method and returns the exact definite integral `{ num: BigInt, den: BigInt }`.
 * - All returned rationals are normalized to lowest terms with `den > 0n` (and `0n / 1n` for zero).
 *
 * @param {Rational[]} coeffs - Non-empty array of polynomial coefficients `[c0, c1, c2, ...]`.
 * @param {Rational} [lower] - Optional lower integration bound.
 * @param {Rational} [upper] - Optional upper integration bound.
 * @returns {Rational[] | Rational} Antiderivative coefficients array or exact definite integral.
 * @throws {TypeError} If `coeffs` is not an array, only one bound is supplied, or any rational has invalid shape/types.
 * @throws {RangeError} If `coeffs` is empty or any rational has a zero denominator.
 */
export function integralRationalIterative(coeffs, lower, upper) {
	if (!Array.isArray(coeffs)) {
		throw new TypeError('coeffs must be an array of rationals')
	}
	if (coeffs.length === 0) {
		throw new RangeError('coeffs must be a non-empty array')
	}

	const hasLower = lower !== undefined
	const hasUpper = upper !== undefined
	if (hasLower !== hasUpper) {
		throw new TypeError('Both lower and upper bounds must be provided together, or both omitted')
	}

	const antiderivative = new Array(coeffs.length + 1)
	antiderivative[0] = { num: 0n, den: 1n }
	for (let i = 0; i < coeffs.length; i++) {
		const c = validateRational(coeffs[i], `coeffs[${i}]`)
		antiderivative[i + 1] = normalizeRational(c.num, c.den * BigInt(i + 1))
	}

	if (!hasLower) {
		return antiderivative
	}

	const a = validateRational(lower, 'lower')
	const b = validateRational(upper, 'upper')
	const fUpper = evaluateHorner(antiderivative, b)
	const fLower = evaluateHorner(antiderivative, a)
	return subRational(fUpper, fLower)
}
