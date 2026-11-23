/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * An exact rational number in lowest terms with `den > 0n` and `gcd(|num|, den) === 1n`.
 */

/**
 * Default number of Maclaurin series terms used by {@link cosRationalSeries}.
 * With 20 terms (up to x^38 / 38!), the truncation error is below 1e-16 across [-2π, 2π].
 */
const DEFAULT_TERMS = 20

/**
 * Computes the absolute value of a BigInt.
 *
 * @param {bigint} value
 * @returns {bigint}
 */
function absBigInt(value) {
	return value < 0n ? -value : value
}

/**
 * Computes the greatest common divisor of two BigInts using Euclid's algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative GCD of `a` and `b`.
 */
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

/**
 * Normalizes a rational pair `(num, den)` into lowest terms with `den > 0n`.
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
 * @param {Rational} value
 * @returns {Rational}
 */
function validateRational(value) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError('Input x must be an object with BigInt { num, den } properties')
	}
	if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
		throw new TypeError('Input x.num and x.den must both be BigInt values')
	}
	return normalizeRational(value.num, value.den)
}

/**
 * Validates the Maclaurin series term count.
 *
 * @param {number} terms
 * @returns {number}
 */
function validateTerms(terms) {
	if (typeof terms !== 'number' || Number.isNaN(terms)) {
		throw new TypeError('Input terms must be a positive safe integer')
	}
	if (!Number.isInteger(terms) || !Number.isSafeInteger(terms) || terms < 1) {
		throw new RangeError('Input terms must be a safe integer >= 1')
	}
	return terms
}

/**
 * Computes `cos(x)` over exact rationals using the truncated Maclaurin series:
 *
 *   cos(x) ≈ Σ_{k=0}^{terms-1} (-1)^k * x^(2k) / (2k)!
 *
 * Evaluated exactly via Horner's method over `x^2` and returned as a normalized
 * rational `{ num: BigInt, den: BigInt }` in lowest terms (`den > 0n`,
 * `gcd(|num|, den) === 1n`).
 *
 * @param {Rational} x Exact rational angle in radians (`{ num: bigint, den: bigint }`, `den !== 0n`).
 * @param {number} [terms=20] Number of Maclaurin series terms to sum (safe integer `>= 1`).
 * @returns {Rational} Exact rational value of the cosine Maclaurin partial sum in lowest terms.
 * @throws {TypeError} If `x` is not a `{ num: bigint, den: bigint }` object or `terms` is not a number.
 * @throws {RangeError} If `x.den === 0n` or `terms` is not a safe integer `>= 1`.
 */
export function cosRationalSeries(x, terms = DEFAULT_TERMS) {
	const normalizedX = validateRational(x)
	const n = validateTerms(terms)

	if (normalizedX.num === 0n || n === 1) {
		return { num: 1n, den: 1n }
	}

	const x2Num = normalizedX.num * normalizedX.num
	const x2Den = normalizedX.den * normalizedX.den

	// Horner's form: V_{n-1} = 1, V_{k-1} = 1 - (x^2 / ((2k-1) * 2k)) * V_k
	let num = 1n
	let den = 1n

	for (let k = n - 1; k >= 1; k--) {
		const twoK = BigInt(k) * 2n
		const factor = twoK * (twoK - 1n) * x2Den
		const nextDen = factor * den
		const nextNum = nextDen - x2Num * num
		num = nextNum
		den = nextDen

		if ((k & 15) === 0 && num !== 0n) {
			const g = gcdBigInt(num, den)
			if (g > 1n) {
				num /= g
				den /= g
			}
		}
	}

	return normalizeRational(num, den)
}
