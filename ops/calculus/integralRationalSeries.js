/**
 * @typedef {{ num: bigint, den: bigint }} Rational
 * Exact rational number in canonical lowest terms (`den > 0n`,
 * `gcd(|num|, den) === 1n`, and zero represented as `{ num: 0n, den: 1n }`).
 */

/**
 * Computes the greatest common divisor of two BigInt values.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor of `a` and `b`.
 */
function gcd(a, b) {
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
 * Validates that a value is a rational object `{ num: bigint, den: bigint }`
 * with a nonzero denominator.
 *
 * @param {unknown} value - Candidate rational object.
 * @param {string} label - Parameter description for error messages.
 * @returns {Rational} The validated rational object.
 * @throws {TypeError} If `value` is not a non-null plain-like object with BigInt `num` and `den`.
 * @throws {RangeError} If `value.den === 0n`.
 */
function validateRational(value, label) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new TypeError(`${label} must be a rational object { num: bigint, den: bigint }`)
	}
	if (typeof value.num !== 'bigint' || typeof value.den !== 'bigint') {
		throw new TypeError(`${label} must have bigint num and den properties`)
	}
	if (value.den === 0n) {
		throw new RangeError(`${label} denominator must not be zero`)
	}
	return value
}

/**
 * Normalizes a rational pair `(num, den)` into canonical lowest terms with `den > 0n`.
 *
 * @param {bigint} num
 * @param {bigint} den - Must be nonzero.
 * @returns {Rational}
 */
function normalizeRational(num, den) {
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
 * Computes the exact formal antiderivative (indefinite integral) of a rational
 * power series or polynomial.
 *
 * Given coefficients `[c_0, c_1, ..., c_{n-1}]` representing
 * `p(x) = sum_{k=0}^{n-1} c_k * x^k` and an integration constant `C`,
 * returns the coefficient array of
 * `F(x) = C + sum_{k=0}^{n-1} (c_k / (k + 1)) * x^{k+1}`,
 * i.e. `[C, c_0 / 1, c_1 / 2, ..., c_{n-1} / n]`, with every rational reduced
 * to lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`, zero as `{ num: 0n, den: 1n }`).
 *
 * Algorithm:
 * 1. Validate `coeffs` is a dense array of valid rationals and `constant` is a valid rational.
 * 2. Normalize `constant` as the degree-0 coefficient `F_0`.
 * 3. For each term `i = 0 .. coeffs.length - 1`, normalize `c_i = n_i / d_i`,
 *    cancel `g = gcd(|n_i|, i + 1)` before multiplying into the denominator, and
 *    emit `F_{i+1} = { num: n_i / g, den: d_i * ((i + 1) / g) }` in lowest terms.
 *
 * @param {Rational[]} coeffs - Input series coefficients `[c_0, c_1, ...]` in ascending power order.
 * @param {Rational} [constant={ num: 0n, den: 1n }] - Integration constant `C` (defaults to `0`).
 * @returns {Rational[]} Integrated coefficient array `[C, c_0/1, c_1/2, ...]` of length `coeffs.length + 1`,
 *   with all entries in canonical lowest terms.
 * @throws {TypeError} If `coeffs` is not an array, contains holes or non-rational entries,
 *   or if `constant` is not a valid rational object with BigInt `num` and `den`.
 * @throws {RangeError} If any coefficient or `constant` has denominator `0n`.
 */
export function integralRationalSeries(coeffs, constant = { num: 0n, den: 1n }) {
	if (!Array.isArray(coeffs)) {
		throw new TypeError('coeffs must be an array of rational objects')
	}

	const validConst = validateRational(constant, 'constant')
	const result = new Array(coeffs.length + 1)
	result[0] = normalizeRational(validConst.num, validConst.den)

	for (let i = 0; i < coeffs.length; i++) {
		if (!(i in coeffs)) {
			throw new TypeError(`coeffs[${i}] must be a rational object { num: bigint, den: bigint }`)
		}
		const c = validateRational(coeffs[i], `coeffs[${i}]`)
		if (c.num === 0n) {
			result[i + 1] = { num: 0n, den: 1n }
			continue
		}
		const norm = normalizeRational(c.num, c.den)
		const k = BigInt(i + 1)
		const g = gcd(norm.num, k)
		result[i + 1] = {
			num: norm.num / g,
			den: norm.den * (k / g),
		}
	}

	return result
}
