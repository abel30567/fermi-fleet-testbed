/**
 * Computes the greatest common divisor of two non-negative BigInts
 * using the iterative Euclidean algorithm.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
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
 * Computes the product of all odd integers in the inclusive range [lo, hi]
 * using balanced binary splitting so intermediate BigInt operands stay
 * roughly equal in bit-length for asymptotically fast multiplication
 * and O(log n) recursion depth.
 *
 * Precondition: lo and hi are odd BigInts with lo <= hi.
 *
 * @param {bigint} lo
 * @param {bigint} hi
 * @returns {bigint}
 */
function oddRangeProduct(lo, hi) {
	if (lo > hi) return 1n
	if (lo === hi) return lo
	if (hi - lo === 2n) return lo * hi

	let mid = (lo + hi) >> 1n
	if ((mid & 1n) === 0n) {
		mid -= 1n
	}
	return oddRangeProduct(lo, mid) * oddRangeProduct(mid + 2n, hi)
}

/**
 * Computes n! for a non-negative BigInt n using binary-splitting odd-factorial
 * decomposition (Luschny's binary splitting algorithm):
 *   n! = (product of odd parts across halving levels) * 2^(n - popcount(n))
 *
 * Every odd factor in [3, n] is multiplied once inside a balanced product tree,
 * and all factors of 2 are applied via a single final left shift.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function factorialBigIntBinarySplit(n) {
	if (n <= 1n) return 1n

	// Collect descending halving thresholds: n, floor(n/2), floor(n/4), ... > 1
	const thresholds = []
	let cur = n
	let shift = 0n
	while (cur > 1n) {
		thresholds.push(cur)
		cur >>= 1n
		shift += cur
	}

	let prevMax = 1n
	let oddPrefix = 1n
	let oddTotal = 1n

	for (let i = thresholds.length - 1; i >= 0; i -= 1) {
		const curMax = thresholds[i]
		// Odd integers strictly greater than prevMax and at most curMax
		const lo = (prevMax + 1n) | 1n
		const hi = (curMax & 1n) === 1n ? curMax : curMax - 1n

		if (lo <= hi) {
			oddPrefix *= oddRangeProduct(lo, hi)
		}
		oddTotal *= oddPrefix
		prevMax = curMax
	}

	return oddTotal << shift
}

/**
 * Computes the exact factorial n! over exact rationals represented as
 * `{ num: bigint, den: bigint }` in lowest terms (`den > 0n`).
 *
 * The input rational is canonicalized to lowest terms with a positive
 * denominator and must represent a non-negative integer (i.e. `num >= 0n`
 * and `den === 1n` after reduction). Uses binary-splitting balanced product
 * trees with deferred powers of two for algorithmic stability, O(log n)
 * stack depth, and fast exact BigInt evaluation on large n.
 *
 * @param {{ num: bigint, den: bigint }} r - Exact rational representing a non-negative integer.
 * @returns {{ num: bigint, den: bigint }} Exact rational `n! / 1` in lowest terms (`den === 1n`).
 * @throws {TypeError} If `r` is not an object with `bigint` `num` and `den` properties.
 * @throws {RangeError} If `den === 0n`, or the reduced rational is negative or non-integer.
 */
export function factorialRationalStable(r) {
	if (r === null || typeof r !== 'object' || Array.isArray(r)) {
		throw new TypeError('Input must be a rational object { num: bigint, den: bigint }')
	}

	let { num, den } = r
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError('Rational num and den must both be BigInt values')
	}

	if (den === 0n) {
		throw new RangeError('Rational denominator cannot be zero')
	}

	if (den < 0n) {
		num = -num
		den = -den
	}

	if (num < 0n) {
		const g = gcd(-num, den)
		throw new RangeError(`Factorial is undefined for negative rational ${num / g}/${den / g}`)
	}

	if (num % den !== 0n) {
		const g = gcd(num, den)
		throw new RangeError(`Factorial requires an integer rational, received ${num / g}/${den / g}`)
	}

	const n = num / den
	return { num: factorialBigIntBinarySplit(n), den: 1n }
}
