/**
 * Exact rational number represented in lowest terms with a positive denominator.
 *
 * @typedef {{ num: bigint, den: bigint }} Rational
 */

/**
 * Computes the greatest common divisor of two non-negative BigInts.
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
 * Normalizes a rational numerator/denominator pair to lowest terms with `den > 0n`.
 * Zero is canonicalized as `{ num: 0n, den: 1n }`.
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
 * Validates and normalizes an input rational object `{ num: bigint, den: bigint }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {Rational}
 */
function validateRational(value, label) {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError(`${label} must be a non-null rational object { num: bigint, den: bigint }`)
	}
	const { num, den } = /** @type {{ num?: unknown, den?: unknown }} */ (value)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label} must have BigInt num and den properties`)
	}
	if (den === 0n) {
		throw new RangeError(`${label} denominator must not be zero`)
	}
	return normalizeRational(num, den)
}

/**
 * Adds two normalized rationals and returns the normalized sum.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function addRational(a, b) {
	if (a.num === 0n) return b
	if (b.num === 0n) return a
	const g = gcdBigInt(a.den, b.den)
	const aScale = b.den / g
	const bScale = a.den / g
	return normalizeRational(a.num * aScale + b.num * bScale, bScale * b.den)
}

/**
 * Subtracts two normalized rationals (`a - b`) and returns the normalized difference.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function subRational(a, b) {
	if (b.num === 0n) return a
	return addRational(a, { num: -b.num, den: b.den })
}

/**
 * Multiplies two normalized rationals and returns the normalized product.
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
	return normalizeRational((a.num / g1) * (b.num / g2), (a.den / g2) * (b.den / g1))
}

/**
 * Computes `base ** exp` for a normalized rational and non-negative integer exponent
 * using recursive divide-and-conquer exponentiation by squaring.
 *
 * @param {Rational} base
 * @param {number} exp
 * @returns {Rational}
 */
function powRationalRecursive(base, exp) {
	if (exp === 0) {
		return { num: 1n, den: 1n }
	}
	if (exp === 1) {
		return base
	}
	if (base.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const half = powRationalRecursive(base, Math.floor(exp / 2))
	const squared = mulRational(half, half)
	return exp % 2 === 1 ? mulRational(squared, base) : squared
}

/**
 * Recursively computes the antiderivative coefficients for the polynomial slice
 * `[start, end)` via divide-and-conquer splitting.
 *
 * @param {Rational[]} coeffs
 * @param {number} start
 * @param {number} end
 * @returns {Rational[]}
 */
function antiderivativeRangeRecursive(coeffs, start, end) {
	if (start >= end) {
		return []
	}
	if (end - start === 1) {
		const c = coeffs[start]
		return [normalizeRational(c.num, c.den * BigInt(start + 1))]
	}
	const mid = Math.floor((start + end) / 2)
	const left = antiderivativeRangeRecursive(coeffs, start, mid)
	const right = antiderivativeRangeRecursive(coeffs, mid, end)
	return [...left, ...right]
}

/**
 * Recursively computes the definite integral of the polynomial slice `[start, end)`
 * over `[lower, upper]` using divide-and-conquer splitting and balanced rational reduction.
 *
 * @param {Rational[]} coeffs
 * @param {number} start
 * @param {number} end
 * @param {Rational} lower
 * @param {Rational} upper
 * @returns {Rational}
 */
function definiteIntegralRangeRecursive(coeffs, start, end, lower, upper) {
	if (start >= end) {
		return { num: 0n, den: 1n }
	}
	if (end - start === 1) {
		const c = coeffs[start]
		if (c.num === 0n) {
			return { num: 0n, den: 1n }
		}
		const degree = start + 1
		const upperPow = powRationalRecursive(upper, degree)
		const lowerPow = powRationalRecursive(lower, degree)
		const diff = subRational(upperPow, lowerPow)
		const scaledCoeff = normalizeRational(c.num, c.den * BigInt(degree))
		return mulRational(scaledCoeff, diff)
	}
	const mid = Math.floor((start + end) / 2)
	const leftIntegral = definiteIntegralRangeRecursive(coeffs, start, mid, lower, upper)
	const rightIntegral = definiteIntegralRangeRecursive(coeffs, mid, end, lower, upper)
	return addRational(leftIntegral, rightIntegral)
}

/**
 * Computes the exact indefinite or definite integral of a polynomial over exact
 * rational numbers `{ num: bigint, den: bigint }` using a recursive divide-and-conquer
 * algorithm.
 *
 * Polynomial coefficients are given in ascending degree order:
 *   `P(x) = c[0] + c[1]*x + c[2]*x^2 + ... + c[n-1]*x^(n-1)`.
 * An empty coefficient array `[]` represents the zero polynomial `P(x) = 0`.
 *
 * - **Indefinite integral** (when both `lower` and `upper` are omitted):
 *   Returns an array of normalized rational coefficients representing the
 *   antiderivative `F(x)` with constant of integration `F(0) = 0/1`.
 * - **Definite integral** (when both `lower` and `upper` are provided):
 *   Returns the exact normalized rational value of the integral of `P(x)` from
 *   `lower` to `upper`. Swapped bounds (`lower > upper`) negate the result.
 *
 * All returned rationals are normalized to lowest terms with `den > 0n`, and zero
 * is canonicalized as `{ num: 0n, den: 1n }`.
 *
 * @param {Rational[]} coefficients - Polynomial coefficients in ascending power order.
 * @param {Rational} [lower] - Optional lower bound of integration (requires `upper`).
 * @param {Rational} [upper] - Optional upper bound of integration (requires `lower`).
 * @returns {Rational | Rational[]} Exact definite integral rational, or antiderivative coefficient array.
 * @throws {TypeError} If inputs are not arrays/rational objects with BigInt fields, or if only one bound is supplied.
 * @throws {RangeError} If any rational input has a zero denominator.
 */
export function integralRationalRecursive(coefficients, lower, upper) {
	if (!Array.isArray(coefficients)) {
		throw new TypeError('coefficients must be an array of rational objects')
	}

	const hasLower = lower !== undefined
	const hasUpper = upper !== undefined
	if (hasLower !== hasUpper) {
		throw new TypeError('Both lower and upper bounds must be provided for definite integration, or both omitted for indefinite integration')
	}

	/** @type {Rational[]} */
	const normalizedCoeffs = new Array(coefficients.length)
	for (let i = 0; i < coefficients.length; i++) {
		if (!(i in coefficients)) {
			throw new TypeError(`coefficients[${i}] must be a non-null rational object { num: bigint, den: bigint }`)
		}
		normalizedCoeffs[i] = validateRational(coefficients[i], `coefficients[${i}]`)
	}

	if (!hasLower) {
		return [
			{ num: 0n, den: 1n },
			...antiderivativeRangeRecursive(normalizedCoeffs, 0, normalizedCoeffs.length),
		]
	}

	const normLower = validateRational(lower, 'lower')
	const normUpper = validateRational(upper, 'upper')

	if (normLower.num === normUpper.num && normLower.den === normUpper.den) {
		return { num: 0n, den: 1n }
	}

	return definiteIntegralRangeRecursive(
		normalizedCoeffs,
		0,
		normalizedCoeffs.length,
		normLower,
		normUpper,
	)
}
