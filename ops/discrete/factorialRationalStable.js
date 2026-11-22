/**
 * Exact discrete factorial over rational numbers represented as
 * `{ num: BigInt, den: BigInt }` in lowest terms.
 *
 * Uses binary-splitting over odd factor intervals combined with Legendre's
 * 2-adic valuation shift so intermediate BigInt products remain balanced in
 * operand bit-length (avoiding quadratic unbalanced multiplication) while
 * preserving exact arithmetic with zero floating-point rounding error.
 */

/**
 * Computes the greatest common divisor of two non-negative BigInts.
 *
 * @param {bigint} a - Non-negative integer.
 * @param {bigint} b - Non-negative integer.
 * @returns {bigint} Non-negative greatest common divisor of `a` and `b`.
 */
function gcdBigInt(a, b) {
	let x = a
	let y = b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Validates and reduces a rational `{ num: bigint, den: bigint }` to canonical
 * lowest terms with a strictly positive denominator (`den > 0n`).
 *
 * @param {{ num: bigint, den: bigint }} q - Rational value to validate and reduce.
 * @returns {{ num: bigint, den: bigint }} Reduced canonical rational.
 * @throws {TypeError} If `q` is not an object with BigInt `num` and `den` fields.
 * @throws {RangeError} If `q.den === 0n`.
 */
function normalizeRational(q) {
	if (q === null || typeof q !== 'object' || Array.isArray(q)) {
		throw new TypeError('Expected rational object { num: BigInt, den: BigInt }')
	}
	if (typeof q.num !== 'bigint' || typeof q.den !== 'bigint') {
		throw new TypeError('Rational num and den must both be BigInt values')
	}
	if (q.den === 0n) {
		throw new RangeError('Rational denominator must be non-zero')
	}

	if (q.num === 0n) {
		return { num: 0n, den: 1n }
	}

	let num = q.num
	let den = q.den
	if (den < 0n) {
		num = -num
		den = -den
	}

	const absNum = num < 0n ? -num : num
	const g = gcdBigInt(absNum, den)
	return { num: num / g, den: den / g }
}

/**
 * Recursively computes the product of all odd integers in `[a, b]` using a
 * balanced binary-splitting product tree. Requires odd `a`, odd `b`, `a <= b`.
 *
 * @param {bigint} a - Lower odd bound (inclusive).
 * @param {bigint} b - Upper odd bound (inclusive).
 * @returns {bigint} Product of all odd integers from `a` to `b`.
 */
function oddProductTree(a, b) {
	if (a === b) {
		return a
	}
	if (b - a === 2n) {
		return a * b
	}
	const mid = a + (((b - a) >> 2n) << 1n)
	return oddProductTree(a, mid) * oddProductTree(mid + 2n, b)
}

/**
 * Computes the product of all odd integers `k` satisfying `lo <= k <= hi`.
 *
 * @param {bigint} lo - Lower integer bound (inclusive).
 * @param {bigint} hi - Upper integer bound (inclusive).
 * @returns {bigint} Product of odd integers in `[lo, hi]`, or `1n` if none.
 */
function oddRangeProduct(lo, hi) {
	const start = (lo & 1n) === 0n ? lo + 1n : lo
	const end = (hi & 1n) === 0n ? hi - 1n : hi
	if (start > end) {
		return 1n
	}
	return oddProductTree(start, end)
}

/**
 * Computes exact `n!` for a non-negative BigInt `n` using odd-interval binary
 * splitting and a single final bit-shift for all factors of 2.
 *
 * Based on the identity:
 * `n! = 2^(sum_{k>=1} floor(n / 2^k)) * prod_{i>=0} oddProduct(1, floor(n / 2^i))`
 *
 * @param {bigint} n - Non-negative integer.
 * @returns {bigint} Exact value of `n!`.
 */
function factorialBigIntStable(n) {
	if (n <= 1n) {
		return 1n
	}

	let bits = 0n
	for (let t = n; t > 0n; t >>= 1n) {
		bits += 1n
	}

	let oddPrefix = 1n
	let oddAcc = 1n
	let twoShift = 0n

	for (let i = bits - 1n; i >= 0n; i -= 1n) {
		const prev = n >> (i + 1n)
		const curr = n >> i
		twoShift += prev
		oddPrefix *= oddRangeProduct(prev + 1n, curr)
		oddAcc *= oddPrefix
	}

	return oddAcc << twoShift
}

/**
 * Computes the exact discrete factorial of a rational number `{ num: BigInt, den: BigInt }`
 * representing a non-negative integer, returning `{ num: BigInt, den: BigInt }` in lowest terms.
 *
 * Input rationals do not need to be pre-reduced and may have a negative denominator
 * (e.g. `{ num: 6n, den: 2n }` or `{ num: -6n, den: -2n }` both reduce to `3`, yielding
 * `{ num: 6n, den: 1n }`). Negative rationals, non-integer rationals, zero denominators,
 * and non-BigInt inputs are rejected with descriptive errors.
 *
 * @param {{ num: bigint, den: bigint }} q - Rational representing a non-negative integer.
 * @returns {{ num: bigint, den: bigint }} Exact factorial `q!` in lowest terms (`den === 1n`).
 * @throws {TypeError} If `q` is not a `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If `q.den === 0n`, `q` is not an integer, or `q < 0`.
 */
export function factorialRationalStable(q) {
	const { num, den } = normalizeRational(q)

	if (den !== 1n) {
		throw new RangeError(
			`factorialRationalStable requires an integer rational, got ${num}/${den}`
		)
	}
	if (num < 0n) {
		throw new RangeError(
			`factorialRationalStable requires a non-negative integer rational, got ${num}/${den}`
		)
	}

	return {
		num: factorialBigIntStable(num),
		den: 1n,
	}
}
