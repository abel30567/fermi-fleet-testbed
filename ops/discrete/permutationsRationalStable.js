/**
 * Exact falling factorial / k-permutations over rationals.
 *
 * Computes P(n, k) = n * (n - 1) * ... * (n - k + 1) over exact rational
 * numbers represented as `{ num: BigInt, den: BigInt }` in lowest terms
 * with strictly positive denominator (`den > 0n`).
 *
 * Uses balanced binary-splitting with cross-GCD cancellation so intermediate
 * numerators and denominators remain balanced in bit-length and strictly
 * reduced at every combine step, avoiding intermediate blowup and rounding
 * error completely.
 *
 * @module ops/discrete/permutationsRationalStable
 */

/**
 * @typedef {{ num: bigint, den: bigint }} Rational
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
 * Computes the non-negative greatest common divisor of two BigInts using
 * the iterative Euclidean algorithm.
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
 * Validates and normalizes a rational number into lowest terms with `den > 0n`.
 * Zero is normalized uniquely to `{ num: 0n, den: 1n }`.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {Rational}
 */
function normalizeRational(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be a rational object { num: bigint, den: bigint }`)
	}
	const { num, den } = value
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must both be bigint`)
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
	return {
		num: signedNum / g,
		den: posDen / g,
	}
}

/**
 * Multiplies two reduced rationals (with `den > 0n`) using cross-GCD
 * cancellation before multiplication so the result is immediately in lowest
 * terms without forming unreduced intermediate products.
 *
 * @param {Rational} a
 * @param {Rational} b
 * @returns {Rational}
 */
function mulRationalCrossCancelled(a, b) {
	if (a.num === 0n || b.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = b.den === 1n ? 1n : gcdBigInt(a.num, b.den)
	const g2 = a.den === 1n ? 1n : gcdBigInt(b.num, a.den)
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	}
}

/**
 * Computes the product ∏_{i = lo}^{hi - 1} (p - i * q) / q using balanced
 * binary splitting with cross-GCD cancellation, where `gcd(|p|, q) === 1n`
 * and `q > 0n`.
 *
 * @param {bigint} p - Reduced numerator of n
 * @param {bigint} q - Reduced positive denominator of n
 * @param {bigint} lo - Inclusive start offset
 * @param {bigint} hi - Exclusive end offset (`lo < hi`)
 * @returns {Rational}
 */
function fallingProductRange(p, q, lo, hi) {
	const span = hi - lo
	if (span === 1n) {
		const num = p - lo * q
		if (num === 0n) {
			return { num: 0n, den: 1n }
		}
		// Since gcd(|p|, q) === 1n, gcd(|p - lo * q|, q) === 1n and q > 0n.
		return { num, den: q }
	}
	const mid = lo + (span >> 1n)
	const left = fallingProductRange(p, q, lo, mid)
	if (left.num === 0n) {
		return left
	}
	const right = fallingProductRange(p, q, mid, hi)
	return mulRationalCrossCancelled(left, right)
}

/**
 * Computes the falling factorial / k-permutations P(n, k) = ∏_{i=0}^{k-1} (n - i)
 * over exact rationals `{ num: BigInt, den: BigInt }` in lowest terms.
 *
 * - Supports arbitrary rational `n` and any non-negative integer rational `k`.
 * - For `k = 0`, returns `{ num: 1n, den: 1n }` (empty product).
 * - For non-negative integer `n` with `k > n`, returns `{ num: 0n, den: 1n }`.
 * - Uses balanced binary-splitting with cross-GCD cancellation for exact,
 *   numerically stable evaluation with balanced intermediate operand sizes.
 *
 * @param {Rational} n - Base rational `{ num: bigint, den: bigint }`
 * @param {Rational} k - Non-negative integer rational `{ num: bigint, den: bigint }`
 * @returns {Rational} Exact P(n, k) in lowest terms with `den > 0n`
 * @throws {TypeError} If `n` or `k` is not a valid `{ num: bigint, den: bigint }` object
 * @throws {RangeError} If either denominator is `0n`, or if `k` is negative or non-integer
 */
export function permutationsRationalStable(n, k) {
	const nNorm = normalizeRational(n, 'n')
	const kNorm = normalizeRational(k, 'k')

	if (kNorm.den !== 1n) {
		throw new RangeError('k must be an integer rational')
	}
	if (kNorm.num < 0n) {
		throw new RangeError('k must be a non-negative integer rational')
	}

	const kVal = kNorm.num
	if (kVal === 0n) {
		return { num: 1n, den: 1n }
	}

	// For non-negative integer n with k > n, the factor (n - n) = 0 occurs.
	if (nNorm.den === 1n && nNorm.num >= 0n && kVal > nNorm.num) {
		return { num: 0n, den: 1n }
	}

	return fallingProductRange(nNorm.num, nNorm.den, 0n, kVal)
}
