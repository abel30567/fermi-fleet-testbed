/**
 * Computes the greatest common divisor of two BigInts using the Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative greatest common divisor.
 */
function gcd(a, b) {
	a = a < 0n ? -a : a
	b = b < 0n ? -b : b
	while (b !== 0n) {
		const t = a % b
		a = b
		b = t
	}
	return a
}

/**
 * Normalizes a rational number to lowest terms with strictly positive denominator.
 * Zero is represented canonically as { num: 0n, den: 1n }.
 *
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalize(num, den) {
	if (num === 0n) return { num: 0n, den: 1n }
	if (den < 0n) {
		num = -num
		den = -den
	}
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Adds two normalized rationals and returns the normalized sum.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function addRat(a, b) {
	const g = gcd(a.den, b.den)
	const aDenReduced = a.den / g
	const bDenReduced = b.den / g
	return normalize(a.num * bDenReduced + b.num * aDenReduced, aDenReduced * b.den)
}

/**
 * Subtracts rational b from rational a and returns the normalized difference.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function subRat(a, b) {
	return addRat(a, { num: -b.num, den: b.den })
}

/**
 * Multiplies two normalized rationals with cross-cancellation and returns the normalized product.
 *
 * @param {{ num: bigint, den: bigint }} a
 * @param {{ num: bigint, den: bigint }} b
 * @returns {{ num: bigint, den: bigint }}
 */
function mulRat(a, b) {
	if (a.num === 0n || b.num === 0n) return { num: 0n, den: 1n }
	const g1 = gcd(a.num, b.den)
	const g2 = gcd(b.num, a.den)
	return normalize((a.num / g1) * (b.num / g2), (a.den / g2) * (b.den / g1))
}

/**
 * Exact integer square root floor(sqrt(n)) for non-negative BigInt n using Newton's method.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function isqrt(n) {
	if (n < 2n) return n
	const bitLength = n.toString(2).length
	let x = 1n << BigInt((bitLength + 1) >> 1)
	while (true) {
		const next = (x + n / x) >> 1n
		if (next >= x) return x
		x = next
	}
}

/**
 * Computes a rational approximation to sqrt(r) for a positive rational r = { num, den },
 * accurate to within 2^-(precisionBits + 1), exact whenever r is a perfect rational square.
 *
 * @param {{ num: bigint, den: bigint }} r
 * @param {number} precisionBits
 * @returns {{ num: bigint, den: bigint }}
 */
function sqrtRat(r, precisionBits) {
	if (r.num === 0n) return { num: 0n, den: 1n }
	const shift = BigInt(precisionBits)
	const scaled = (r.num * r.den) << (2n * shift)
	const root = isqrt(scaled)
	// Round to nearest integer: sqrt(scaled) > root + 1/2 iff scaled - root^2 > root.
	const rounded = scaled - root * root > root ? root + 1n : root
	return normalize(rounded, r.den << shift)
}

/**
 * Evaluates the first `terms` terms of the Maclaurin series for arcsin(x)
 * using Horner's method:
 *   arcsin(x) = sum_{n=0}^{terms-1} ((2n)! / (4^n (n!)^2 (2n+1))) * x^(2n+1)
 *
 * @param {{ num: bigint, den: bigint }} x
 * @param {number} terms
 * @returns {{ num: bigint, den: bigint }}
 */
function arcsinMaclaurin(x, terms) {
	if (x.num === 0n) return { num: 0n, den: 1n }
	const x2 = mulRat(x, x)
	let acc = { num: 1n, den: 1n }
	for (let n = terms - 1; n >= 1; n--) {
		const nBig = BigInt(n)
		const twoNMinus1 = 2n * nBig - 1n
		const factor = {
			num: twoNMinus1 * twoNMinus1,
			den: 2n * nBig * (2n * nBig + 1n),
		}
		acc = addRat({ num: 1n, den: 1n }, mulRat(acc, mulRat(factor, x2)))
	}
	return mulRat(x, acc)
}

/**
 * Computes arctan(1 / d) via its alternating Maclaurin series with `terms` terms.
 *
 * @param {bigint} d
 * @param {number} terms
 * @returns {{ num: bigint, den: bigint }}
 */
function arctanReciprocal(d, terms) {
	const d2 = d * d
	let dPow = d
	let sum = { num: 0n, den: 1n }
	for (let k = 0; k < terms; k++) {
		const denom = BigInt(2 * k + 1) * dPow
		const term = { num: k % 2 === 0 ? 1n : -1n, den: denom }
		sum = addRat(sum, term)
		dPow *= d2
	}
	return sum
}

/**
 * Computes a rational approximation to pi / 2 using Machin's formula:
 *   pi / 2 = 8 * arctan(1/5) - 2 * arctan(1/239)
 *
 * @param {number} terms
 * @returns {{ num: bigint, den: bigint }}
 */
function piOver2(terms) {
	const a = mulRat({ num: 8n, den: 1n }, arctanReciprocal(5n, terms))
	const b = mulRat({ num: 2n, den: 1n }, arctanReciprocal(239n, terms))
	return subRat(a, b)
}

/**
 * Computes arcsin(x) over exact rationals `{ num: bigint, den: bigint }`, returning
 * a rational approximation in lowest terms with `den > 0n` (zero as `{ num: 0n, den: 1n }`).
 *
 * Algorithm:
 * - Uses odd symmetry `arcsin(-x) = -arcsin(x)` so the core evaluation operates on `x >= 0`.
 * - For `0 <= |x| <= 1/2`, evaluates the `terms`-term Maclaurin series directly via Horner's
 *   method:
 *     `arcsin(x) = sum_{n=0}^{terms-1} ((2n)! / (4^n (n!)^2 (2n+1))) * x^(2n+1)`
 * - For `1/2 < |x| <= 1`, applies the complementary half-angle identity to accelerate
 *   convergence near the branch point `|x| = 1`:
 *     `arcsin(x) = pi/2 - 2 * arcsin(sqrt((1 - x) / 2))`
 *   where `0 <= sqrt((1 - x) / 2) < 1/2`. Here `pi/2` is computed via Machin's formula
 *   `8 * arctan(1/5) - 2 * arctan(1/239)` with `terms` terms, and `sqrt((1 - x) / 2)` is
 *   computed to `5 * terms + 8` binary bits of precision via exact BigInt integer square root
 *   (and is exact whenever `(1 - x) / 2` is a rational square).
 *
 * @param {{ num: bigint, den: bigint }} x - Input rational satisfying `|x| <= 1`.
 * @param {number} [terms=12] - Number of series terms (positive integer).
 * @returns {{ num: bigint, den: bigint }} Rational approximation of `arcsin(x)` in lowest terms.
 * @throws {TypeError} If `x` is not an object with `bigint` `num` and `den`, or if `terms` is not a number.
 * @throws {RangeError} If `x.den === 0n`, if `|x| > 1`, or if `terms` is not a positive integer (`>= 1`).
 */
export function arcsinRationalSeries(x, terms = 12) {
	if (x === null || typeof x !== 'object') {
		throw new TypeError('x must be a rational object { num: bigint, den: bigint }')
	}
	if (typeof x.num !== 'bigint' || typeof x.den !== 'bigint') {
		throw new TypeError('x.num and x.den must be BigInts')
	}
	if (x.den === 0n) {
		throw new RangeError('x.den must not be 0n')
	}
	if (typeof terms !== 'number') {
		throw new TypeError('terms must be a number')
	}
	if (!Number.isInteger(terms) || terms < 1) {
		throw new RangeError('terms must be a positive integer (>= 1)')
	}

	const normX = normalize(x.num, x.den)
	const negative = normX.num < 0n
	const absNum = negative ? -normX.num : normX.num

	if (absNum > normX.den) {
		throw new RangeError('x must satisfy |x| <= 1')
	}

	if (absNum === 0n) {
		return { num: 0n, den: 1n }
	}

	const absX = { num: absNum, den: normX.den }
	let result

	if (2n * absNum <= normX.den) {
		// |x| <= 1/2: direct Maclaurin series converges rapidly.
		result = arcsinMaclaurin(absX, terms)
	} else if (absNum === normX.den) {
		// |x| === 1: arcsin(1) = pi / 2.
		result = piOver2(terms)
	} else {
		// 1/2 < |x| < 1: arcsin(|x|) = pi/2 - 2 * arcsin(sqrt((1 - |x|) / 2)).
		const halfOneMinusX = normalize(normX.den - absNum, 2n * normX.den)
		const y = sqrtRat(halfOneMinusX, 5 * terms + 8)
		const reduced = arcsinMaclaurin(y, terms)
		const twoReduced = mulRat({ num: 2n, den: 1n }, reduced)
		result = subRat(piOver2(terms), twoReduced)
	}

	return negative ? { num: -result.num, den: result.den } : result
}
