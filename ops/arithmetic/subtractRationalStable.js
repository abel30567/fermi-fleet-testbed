/**
 * Exact rational subtraction using Knuth's GCD-scaled algorithm.
 *
 * Represents rationals as `{ num: BigInt, den: BigInt }` in canonical lowest
 * terms (`den > 0n`, `gcd(|num|, den) === 1n`, zero as `{ num: 0n, den: 1n }`).
 *
 * Pre-reduces inputs and scales by `g = gcd(a.den, b.den)` before cross-multiplying,
 * avoiding floating-point catastrophic cancellation and minimizing intermediate
 * BigInt growth. By number-theoretic properties of reduced fractions, the final
 * reduction only requires `gcd(|t|, g)` rather than `gcd(|t|, lcm(a.den, b.den))`.
 *
 * @module ops/arithmetic/subtractRationalStable
 */

/**
 * Computes the absolute value of a BigInt.
 *
 * @param {bigint} x
 * @returns {bigint}
 */
function absBigInt(x) {
	return x < 0n ? -x : x
}

/**
 * Iterative Euclidean greatest common divisor for non-negative BigInts.
 * Iterative form avoids recursion limits on worst-case (e.g. Fibonacci) inputs.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Validates and normalizes a rational input `{ num: bigint, den: bigint }`
 * into canonical lowest terms with strictly positive denominator.
 *
 * @param {{ num: bigint, den: bigint }} r
 * @param {string} name
 * @returns {{ num: bigint, den: bigint }}
 * @throws {TypeError} If `r` is not an object with `bigint` `num` and `den`.
 * @throws {RangeError} If `r.den === 0n`.
 */
function normalizeRational(r, name) {
	if (r === null || typeof r !== 'object' || Array.isArray(r)) {
		throw new TypeError(`${name} must be an object of the form { num: bigint, den: bigint }`)
	}
	const { num, den } = r
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must both be BigInt values`)
	}
	if (den === 0n) {
		throw new RangeError(`${name}.den must not be 0n`)
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const signedNum = den < 0n ? -num : num
	const posDen = den < 0n ? -den : den
	const g = gcdBigInt(signedNum, posDen)
	return { num: signedNum / g, den: posDen / g }
}

/**
 * Subtracts two exact rational numbers (`a - b`) and returns the result in
 * canonical lowest terms `{ num: bigint, den: bigint }`.
 *
 * Uses pre-reduction and GCD denominator scaling (Knuth TAOCP Vol. 2, §4.5.1)
 * to avoid catastrophic cancellation and keep intermediate BigInt magnitudes
 * minimal.
 *
 * @param {{ num: bigint, den: bigint }} a - Minuend rational.
 * @param {{ num: bigint, den: bigint }} b - Subtrahend rational.
 * @returns {{ num: bigint, den: bigint }} Exact difference `a - b` in lowest terms with `den > 0n`.
 * @throws {TypeError} If `a` or `b` is not a valid `{ num: bigint, den: bigint }` object.
 * @throws {RangeError} If `a.den === 0n` or `b.den === 0n`.
 */
export function subtractRationalStable(a, b) {
	const { num: p, den: q } = normalizeRational(a, 'a')
	const { num: r, den: s } = normalizeRational(b, 'b')

	if (r === 0n) {
		return { num: p, den: q }
	}
	if (p === 0n) {
		return { num: -r, den: s }
	}

	if (q === s) {
		const t = p - r
		if (t === 0n) {
			return { num: 0n, den: 1n }
		}
		const d = gcdBigInt(t, q)
		return { num: t / d, den: q / d }
	}

	// Scale denominators by g = gcd(q, s) to avoid unnecessary BigInt blowup.
	// With p/q and r/s already in lowest terms and gcd(q1, s1) = 1:
	//   p/q - r/s = (p*s1 - r*q1) / (q1 * s)
	// and gcd(p*s1 - r*q1, q1 * s) === gcd(p*s1 - r*q1, g).
	const g = gcdBigInt(q, s)
	const q1 = q / g
	const s1 = s / g
	const t = p * s1 - r * q1

	if (t === 0n) {
		return { num: 0n, den: 1n }
	}

	const d = gcdBigInt(t, g)
	return {
		num: t / d,
		den: q1 * (s / d),
	}
}
