/**
 * Exact discrete modulo over rational numbers represented as `{ num: BigInt, den: BigInt }`.
 *
 * Computes the floored (Euclidean-aligned for positive divisor) rational modulo:
 *   `a mod b = a - b * floor(a / b)`
 *
 * Uses exact arbitrary-precision BigInt arithmetic with dual-GCD scaling
 * (`gcd(a.den, b.den)` for minimal common denominator and `gcd(|a.num|, |b.num|)`
 * to shrink intermediate division operands) and reduces the result to lowest terms
 * with a strictly positive denominator (`den > 0n`), avoiding any floating-point
 * conversion or rounding error even for arbitrarily large numerators/denominators.
 */

/**
 * Computes the non-negative greatest common divisor of two BigInts using the
 * iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const rem = x % y
		x = y
		y = rem
	}
	return x
}

/**
 * Validates and normalizes a rational input `{ num: bigint, den: bigint }` into
 * canonical lowest terms with `den > 0n`.
 *
 * @param {{ num: bigint, den: bigint }} value
 * @param {string} name
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object with BigInt { num, den } properties`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must both be BigInts`)
	}
	if (den === 0n) {
		throw new RangeError(`${name}.den must not be 0n`)
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}

	const signedNum = den < 0n ? -num : num
	const posDen = den < 0n ? -den : den
	const g = gcd(signedNum, posDen)
	return { num: signedNum / g, den: posDen / g }
}

/**
 * Computes the exact floored modulo `a mod b = a - b * floor(a / b)` of two
 * rational numbers, returning the result in lowest terms with `den > 0n`.
 *
 * Satisfies:
 * - `a - r = q * b` for an exact integer `q = floor(a / b)`
 * - `0 <= r < b` when `b > 0`, and `b < r <= 0` when `b < 0`
 * - `gcd(|r.num|, r.den) === 1n` and `r.den > 0n` (with zero as `{ num: 0n, den: 1n }`)
 *
 * @param {{ num: bigint, den: bigint }} a Dividend rational `{ num: BigInt, den: BigInt }`.
 * @param {{ num: bigint, den: bigint }} b Non-zero divisor (modulus) rational `{ num: BigInt, den: BigInt }`.
 * @returns {{ num: bigint, den: bigint }} Exact remainder in lowest terms with `den > 0n`.
 * @throws {TypeError} If `a` or `b` is not an object with BigInt `num` and `den`.
 * @throws {RangeError} If either denominator is `0n` or the divisor `b` equals zero.
 */
export function moduloRationalStable(a, b) {
	const na = normalizeRational(a, 'a')
	const nb = normalizeRational(b, 'b')

	if (nb.num === 0n) {
		throw new RangeError('Modulus b must not be zero')
	}
	if (na.num === 0n) {
		return { num: 0n, den: 1n }
	}

	// Scale denominators by their GCD so common denominator L = lcm(na.den, nb.den) is minimal.
	const denGcd = gcd(na.den, nb.den)
	const aDenReduced = na.den / denGcd
	const bDenReduced = nb.den / denGcd
	const commonDen = aDenReduced * nb.den

	// Factor out common numerator factor c = gcd(|na.num|, |nb.num|) to keep
	// the BigInt modulo operands minimal; note gcd(c, commonDen) === 1n because
	// na and nb are already reduced.
	const numGcd = gcd(na.num, nb.num)
	const scaledA = (na.num / numGcd) * bDenReduced
	const scaledB = (nb.num / numGcd) * aDenReduced

	// Exact floored integer remainder: r = scaledA - scaledB * floor(scaledA / scaledB).
	let rem = scaledA % scaledB
	if (rem !== 0n && (rem < 0n) !== (scaledB < 0n)) {
		rem += scaledB
	}

	if (rem === 0n) {
		return { num: 0n, den: 1n }
	}

	// Reduce rem / commonDen to lowest terms; numGcd is coprime to commonDen.
	const outGcd = gcd(rem, commonDen)
	return {
		num: (rem / outGcd) * numGcd,
		den: commonDen / outGcd,
	}
}
