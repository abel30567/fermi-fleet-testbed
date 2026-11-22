/**
 * Compute the greatest common divisor of two non-negative BigInt values
 * using the iterative Euclidean algorithm.
 *
 * @param {bigint} a - Non-negative integer.
 * @param {bigint} b - Non-negative integer.
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
 * Validate and normalize an exact rational `{ num: bigint, den: bigint }`
 * into canonical lowest terms with `den > 0n`, `gcd(|num|, den) === 1n`,
 * and zero represented as `{ num: 0n, den: 1n }`.
 *
 * @param {{ num: bigint, den: bigint }} r - Exact rational input.
 * @returns {{ num: bigint, den: bigint }} Normalized rational in lowest terms.
 * @throws {TypeError} If `r` is not a plain-like object with BigInt `num` and `den`.
 * @throws {RangeError} If `r.den === 0n`.
 */
function normalizeRational(r) {
	if (r === null || typeof r !== 'object' || Array.isArray(r)) {
		throw new TypeError('Expected a rational object { num: BigInt, den: BigInt }')
	}
	if (typeof r.num !== 'bigint' || typeof r.den !== 'bigint') {
		throw new TypeError('Rational num and den must be BigInt values')
	}
	if (r.den === 0n) {
		throw new RangeError('Rational denominator must not be zero')
	}

	let num = r.num
	let den = r.den
	if (den < 0n) {
		num = -num
		den = -den
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Compute the exact integer product `lo * (lo + 1) * ... * hi` using
 * binary splitting (divide-and-conquer product tree) for balanced BigInt
 * multiplications.
 *
 * @param {bigint} lo - Lower inclusive bound.
 * @param {bigint} hi - Upper inclusive bound.
 * @returns {bigint} Product of all integers in `[lo, hi]`, or `1n` if `lo > hi`.
 */
function productRange(lo, hi) {
	if (lo > hi) return 1n
	if (lo === hi) return lo
	if (hi - lo === 1n) return lo * hi
	const mid = (lo + hi) >> 1n
	return productRange(lo, mid) * productRange(mid + 1n, hi)
}

/**
 * Compute the exact discrete factorial `n! = Γ(n + 1) = ∏_{k=1}^{n} k`
 * over exact rationals `{ num: BigInt, den: BigInt }` in lowest terms.
 *
 * Accepts any exact rational representing a non-negative integer (including
 * unreduced forms such as `{ num: 10n, den: 2n }` or `{ num: -6n, den: -2n }`).
 *
 * Algorithm:
 * 1. Validate and reduce the input rational to canonical lowest terms
 *    (`den > 0n`, `gcd(|num|, den) === 1n`, zero as `{ num: 0n, den: 1n }`).
 * 2. Verify that the reduced rational is a non-negative integer (`den === 1n`
 *    and `num >= 0n`).
 * 3. Evaluate `n! = ∏_{k=1}^{n} k` (with the empty product `0! = 1`) via
 *    binary splitting so intermediate BigInt operands remain balanced, and
 *    return the exact canonical rational `{ num: n!, den: 1n }`.
 *
 * @param {{ num: bigint, den: bigint }} n - Exact rational representing a non-negative integer.
 * @returns {{ num: bigint, den: bigint }} Exact rational `{ num: n!, den: 1n }` in lowest terms.
 * @throws {TypeError} If `n` is not an object with BigInt `num` and `den` properties.
 * @throws {RangeError} If `n.den === 0n`, if `n` does not reduce to an integer, or if `n < 0`.
 */
export function factorialRationalSeries(n) {
	const reduced = normalizeRational(n)

	if (reduced.den !== 1n) {
		throw new RangeError(
			`Factorial is only defined for non-negative integers; got non-integer rational ${reduced.num}/${reduced.den}`
		)
	}
	if (reduced.num < 0n) {
		throw new RangeError(
			`Factorial is not defined for negative integers; got ${reduced.num}`
		)
	}

	const value = productRange(1n, reduced.num)
	return { num: value, den: 1n }
}
