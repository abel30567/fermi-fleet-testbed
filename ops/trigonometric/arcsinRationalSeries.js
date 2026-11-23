/**
 * Computes the absolute value of a BigInt.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function absBigInt(n) {
	return n < 0n ? -n : n
}

/**
 * Computes the greatest common divisor of two BigInts (always non-negative).
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/**
 * Normalizes a rational number to lowest terms with a positive denominator.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(num, den) {
	if (den === 0n) {
		throw new RangeError('Rational denominator must not be zero')
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = gcdBigInt(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Returns the exact integer square root of a non-negative BigInt if it is a
 * perfect square, or null otherwise.
 *
 * @param {bigint} n
 * @returns {bigint | null}
 */
function exactSqrt(n) {
	if (n < 0n) return null
	if (n < 2n) return n
	const bitLen = n.toString(2).length
	let x0 = 1n << BigInt((bitLen + 1) >> 1)
	while (true) {
		const x1 = (x0 + n / x0) >> 1n
		if (x1 >= x0) break
		x0 = x1
	}
	return x0 * x0 === n ? x0 : null
}

/**
 * Evaluates the N-term Maclaurin series for arcsin(p / q) using Horner's form:
 *   arcsin(x) = sum_{n=0}^{terms-1} ((2n)! / (4^n (n!)^2 (2n+1))) * x^(2n+1)
 *
 * Expects p and q to be coprime with q > 0n and |p| <= q.
 *
 * @param {bigint} p
 * @param {bigint} q
 * @param {number} terms
 * @returns {{ num: bigint, den: bigint }}
 */
function evalMaclaurin(p, q, terms) {
	if (p === 0n) {
		return { num: 0n, den: 1n }
	}
	const p2 = p * p
	const q2 = q * q

	let num = 1n
	let den = BigInt(2 * terms - 1)

	for (let k = terms - 2; k >= 0; k--) {
		const m = BigInt(2 * k + 1)
		const d = BigInt(2 * k + 2)
		const dq2Q = d * q2 * den
		const nextNum = dq2Q + m * m * p2 * num
		const nextDen = m * dq2Q
		const g = gcdBigInt(nextNum, nextDen)
		num = nextNum / g
		den = nextDen / g
	}

	return normalizeRational(p * num, q * den)
}

/**
 * Computes arcsin(x) over exact rationals `{ num: BigInt, den: BigInt }` in
 * lowest terms using the Maclaurin series and exact complementary/endpoint
 * trigonometric identities.
 *
 * For `|x| > 1 / sqrt(2)` when `1 - x^2` is a rational square `r^2` (including
 * the endpoints `x = ±1` where `r = 0`), applies the exact identity:
 *   `arcsin(x) = sign(x) * (3 * arcsin(1/2) - arcsin(r))`
 * so endpoints and Pythagorean-triple rationals converge geometrically.
 *
 * @param {{ num: bigint, den: bigint }} x - Exact rational with `|x| <= 1`.
 * @param {number} [terms=25] - Positive integer number of series terms.
 * @returns {{ num: bigint, den: bigint }} Exact rational approximation in
 *   lowest terms with `den > 0n` and `gcd(|num|, den) === 1n`.
 * @throws {TypeError} If `x` is not a `{ num: bigint, den: bigint }` object or
 *   `terms` is not a number.
 * @throws {RangeError} If `x.den === 0n`, `|x| > 1`, or `terms` is not a
 *   positive safe integer.
 */
export function arcsinRationalSeries(x, terms = 25) {
	if (x === null || typeof x !== 'object') {
		throw new TypeError('x must be an object with BigInt num and den properties')
	}
	if (typeof x.num !== 'bigint' || typeof x.den !== 'bigint') {
		throw new TypeError('x.num and x.den must be BigInts')
	}
	if (typeof terms !== 'number') {
		throw new TypeError('terms must be a number')
	}
	if (!Number.isSafeInteger(terms) || terms < 1) {
		throw new RangeError('terms must be a positive safe integer')
	}

	const { num: p, den: q } = normalizeRational(x.num, x.den)
	const absP = absBigInt(p)

	if (absP > q) {
		throw new RangeError('Domain error: arcsin requires |x| <= 1')
	}
	if (p === 0n) {
		return { num: 0n, den: 1n }
	}

	// For |x| > 1/sqrt(2), if 1 - x^2 = (r/q)^2 is a rational square (including
	// endpoints |x| = 1 where r = 0), use arcsin(x) = sgn(x) * (3*arcsin(1/2) - arcsin(r/q)).
	const p2 = absP * absP
	const q2 = q * q
	if (2n * p2 > q2) {
		const r = exactSqrt(q2 - p2)
		if (r !== null) {
			const halfArc = evalMaclaurin(1n, 2n, terms)
			const halfPiNum = 3n * halfArc.num
			const halfPiDen = halfArc.den
			const comp = evalMaclaurin(r, q, terms)
			const diffNum = halfPiNum * comp.den - comp.num * halfPiDen
			const diffDen = halfPiDen * comp.den
			return normalizeRational(p < 0n ? -diffNum : diffNum, diffDen)
		}
	}

	return evalMaclaurin(p, q, terms)
}
