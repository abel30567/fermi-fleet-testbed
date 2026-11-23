/**
 * Exact subtraction over rational numbers represented as `{ num: BigInt, den: BigInt }`
 * in canonical lowest terms (`den > 0n`, `gcd(|num|, den) === 1n`, zero as `{ num: 0n, den: 1n }`).
 *
 * Uses Knuth's GCD/LCM closed-form rational subtraction identity (TAOCP Vol. 2, §4.5.1):
 * For reduced rationals p1/q1 and p2/q2 (q1, q2 > 0):
 *   g  = gcd(q1, q2)
 *   q1' = q1 / g,  q2' = q2 / g
 *   t  = p1 * q2' - p2 * q1'
 *   h  = gcd(|t|, g)
 *   p1/q1 - p2/q2 = (t / h) / (q1' * (q2 / h))
 *
 * Because gcd(p1, q1) = 1, gcd(p2, q2) = 1, and gcd(q1', q2') = 1, no prime dividing
 * q1' or q2' can divide t; therefore gcd(|t|, q1' * q2) = gcd(|t|, g) = h, yielding
 * a canonical lowest-terms result directly while keeping intermediate integers small.
 */

/**
 * Compute the non-negative greatest common divisor of two BigInts via the
 * iterative Euclidean algorithm.
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
 * Validate and normalize a rational operand `{ num: bigint, den: bigint }`
 * into canonical lowest terms with strictly positive denominator.
 *
 * @param {{ num: bigint, den: bigint }} value
 * @param {string} name
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object with { num: bigint, den: bigint }`)
	}
	if (!Object.hasOwn(value, 'num') || !Object.hasOwn(value, 'den')) {
		throw new TypeError(`${name} must have own properties "num" and "den"`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must both be BigInt values`)
	}
	if (den === 0n) {
		throw new RangeError(`${name}.den must not be 0n`)
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
 * Subtract two exact rational numbers `a` and `b`, returning `a - b` in canonical
 * lowest terms as `{ num: bigint, den: bigint }`.
 *
 * @param {{ num: bigint, den: bigint }} a - Minuend rational `{ num, den }` (`den !== 0n`).
 * @param {{ num: bigint, den: bigint }} b - Subtrahend rational `{ num, den }` (`den !== 0n`).
 * @returns {{ num: bigint, den: bigint }} Exact difference `a - b` in lowest terms with `den > 0n`.
 * @throws {TypeError} If `a` or `b` is not an object with BigInt `num` and `den` properties.
 * @throws {RangeError} If `a.den === 0n` or `b.den === 0n`.
 */
export function subtractRationalSeries(a, b) {
	const r1 = normalizeRational(a, 'a')
	const r2 = normalizeRational(b, 'b')

	if (r2.num === 0n) {
		return { num: r1.num, den: r1.den }
	}
	if (r1.num === 0n) {
		return { num: -r2.num, den: r2.den }
	}

	// Closed-form GCD/LCM subtraction identity:
	//   p1/q1 - p2/q2 = (p1*(q2/g) - p2*(q1/g)) / ((q1/g)*q2),  g = gcd(q1, q2)
	const g = gcdBigInt(r1.den, r2.den)
	const q1Reduced = r1.den / g
	const q2Reduced = r2.den / g

	const numerator = r1.num * q2Reduced - r2.num * q1Reduced
	if (numerator === 0n) {
		return { num: 0n, den: 1n }
	}

	// Since gcd(p1, q1) = gcd(p2, q2) = gcd(q1Reduced, q2Reduced) = 1,
	// gcd(|numerator|, q1Reduced * r2.den) === gcd(|numerator|, g).
	const h = gcdBigInt(numerator, g)
	return {
		num: numerator / h,
		den: q1Reduced * (r2.den / h),
	}
}
