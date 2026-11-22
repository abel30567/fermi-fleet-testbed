/**
 * Computes the greatest common divisor of two BigInts using the iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor of `a` and `b`.
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const remainder = x % y
		x = y
		y = remainder
	}
	return x
}

/**
 * Normalizes a rational number `num / den` into lowest terms with a positive denominator.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
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
	const g = gcdBigInt(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Validates and normalizes an input rational object `{ num: bigint, den: bigint }`.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {{ num: bigint, den: bigint }}
 * @throws {TypeError} If `value` is not an object with BigInt `num` and `den` properties.
 * @throws {RangeError} If `value.den` is zero.
 */
function parseRational(value, label) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${label} must be a rational object { num: BigInt, den: BigInt }`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${label}.num and ${label}.den must be BigInts`)
	}
	if (den === 0n) {
		throw new RangeError(`${label}.den must be non-zero`)
	}
	return normalizeRational(num, den)
}

/**
 * Adds two normalized exact rational numbers and returns the result in lowest terms.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function addRational(a, b) {
	if (a.num === 0n) return b
	if (b.num === 0n) return a
	const g = gcdBigInt(a.den, b.den)
	const aDenReduced = a.den / g
	const bDenReduced = b.den / g
	const num = a.num * bDenReduced + b.num * aDenReduced
	const den = aDenReduced * b.den
	return normalizeRational(num, den)
}

/**
 * Multiplies two normalized exact rational numbers and returns the result in lowest terms.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function mulRational(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcdBigInt(a.num, b.den)
	const g2 = gcdBigInt(b.num, a.den)
	const num = (a.num / g1) * (b.num / g2)
	const den = (a.den / g2) * (b.den / g1)
	return normalizeRational(num, den)
}

/**
 * Computes the exact Laplace transform of a polynomial with rational coefficients,
 * evaluated at a strictly positive rational point `s > 0`, using a straightforward
 * iterative algorithm in exact BigInt rational arithmetic.
 *
 * For a polynomial `p(t) = sum_{k=0}^{n} c_k * t^k`, the Laplace transform is:
 * `L{p}(s) = integral_0^inf p(t) * exp(-s * t) dt = sum_{k=0}^{n} c_k * k! / s^{k+1}`.
 *
 * The basis term `B_k = k! / s^{k+1}` is updated iteratively via `B_0 = 1 / s` and
 * `B_k = B_{k-1} * (k / s)`, and accumulated into an exact reduced rational sum.
 *
 * @param {Array<{ num: bigint, den: bigint }>} coefficients
 *   Polynomial coefficients `[c_0, c_1, ..., c_n]` in ascending degree order, where
 *   each `c_k` is an exact rational `{ num: BigInt, den: BigInt }` with `den !== 0n`.
 *   An empty array represents the zero polynomial.
 * @param {{ num: bigint, den: bigint }} s
 *   Strictly positive rational evaluation point `{ num: BigInt, den: BigInt }` (`s > 0`).
 * @returns {{ num: bigint, den: bigint }}
 *   Exact value of `L{p}(s)` reduced to lowest terms with a strictly positive denominator
 *   (`den > 0n`, `gcd(|num|, den) === 1n`, and zero represented as `{ num: 0n, den: 1n }`).
 * @throws {TypeError}
 *   If `coefficients` is not an array, contains missing/non-rational elements, or if `s`
 *   is not a valid rational object with BigInt `num` and `den`.
 * @throws {RangeError}
 *   If any rational has a zero denominator (`den === 0n`), or if `s <= 0`.
 */
export function laplaceTransformRationalIterative(coefficients, s) {
	if (!Array.isArray(coefficients)) {
		throw new TypeError('coefficients must be an array of rational objects')
	}

	const sNorm = parseRational(s, 's')
	if (sNorm.num <= 0n) {
		throw new RangeError('s must be strictly positive (s > 0)')
	}

	const normalizedCoeffs = new Array(coefficients.length)
	for (let k = 0; k < coefficients.length; k++) {
		if (!(k in coefficients)) {
			throw new TypeError(`coefficients[${k}] must be a rational object { num: BigInt, den: BigInt }`)
		}
		normalizedCoeffs[k] = parseRational(coefficients[k], `coefficients[${k}]`)
	}

	if (normalizedCoeffs.length === 0) {
		return { num: 0n, den: 1n }
	}

	// invS = 1 / s in lowest terms (sNorm.num > 0n and gcd(sNorm.num, sNorm.den) === 1n)
	const invS = { num: sNorm.den, den: sNorm.num }

	// Basis term B_k = k! / s^{k+1}, initialized to B_0 = 0! / s^1 = 1 / s
	let basis = invS
	let acc = { num: 0n, den: 1n }

	for (let k = 0; k < normalizedCoeffs.length; k++) {
		if (k > 0) {
			const factor = mulRational({ num: BigInt(k), den: 1n }, invS)
			basis = mulRational(basis, factor)
		}
		const coeff = normalizedCoeffs[k]
		if (coeff.num !== 0n) {
			const term = mulRational(coeff, basis)
			acc = addRational(acc, term)
		}
	}

	return acc
}
