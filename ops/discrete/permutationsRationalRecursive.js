/**
 * Compute the greatest common divisor of two BigInt values (non-negative result).
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
 * Validate and normalize an exact rational { num: BigInt, den: BigInt } into
 * lowest terms with den > 0n (and 0 represented as { num: 0n, den: 1n }).
 *
 * @param {{ num: bigint, den: bigint }} r
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(r) {
	if (r === null || typeof r !== 'object') {
		throw new TypeError('n must be an exact rational object { num: BigInt, den: BigInt }')
	}
	const { num, den } = r
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError('n.num and n.den must be BigInt values')
	}
	if (den === 0n) {
		throw new RangeError('n.den must not be 0n')
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const sign = den < 0n ? -1n : 1n
	const sNum = num * sign
	const sDen = den * sign
	const g = gcdBigInt(sNum, sDen)
	return { num: sNum / g, den: sDen / g }
}

/**
 * Validate and normalize the permutation length k to a non-negative BigInt.
 *
 * @param {number | bigint} k
 * @returns {bigint}
 */
function normalizeCount(k) {
	if (typeof k === 'bigint') {
		if (k < 0n) {
			throw new RangeError('k must be a non-negative integer')
		}
		return k
	}
	if (typeof k === 'number') {
		if (!Number.isFinite(k) || !Number.isInteger(k)) {
			throw new RangeError('k must be a finite integer')
		}
		if (!Number.isSafeInteger(k)) {
			throw new RangeError('k must be a safe integer (pass a BigInt for larger values)')
		}
		if (k < 0) {
			throw new RangeError('k must be a non-negative integer')
		}
		return BigInt(k)
	}
	throw new TypeError('k must be a non-negative integer (number or BigInt)')
}

/**
 * Multiply two already-normalized rationals while keeping the result in lowest terms
 * with den > 0n via cross-cancellation.
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
	return {
		num: (a.num / g1) * (b.num / g2),
		den: (a.den / g2) * (b.den / g1),
	}
}

/**
 * Compute n - offset for a normalized rational n and BigInt integer offset.
 * Because gcd(|n.num|, n.den) === 1n, gcd(|n.num - offset * n.den|, n.den) === 1n.
 *
 * @param {{ num: bigint, den: bigint }} n
 * @param {bigint} offset
 * @returns {{ num: bigint, den: bigint }}
 */
function subInt(n, offset) {
	const num = n.num - offset * n.den
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	return { num, den: n.den }
}

/**
 * Recursively compute the falling product ∏_{i=start}^{end-1} (n - i) using
 * binary splitting (divide-and-conquer).
 *
 * @param {{ num: bigint, den: bigint }} n Normalized rational.
 * @param {bigint} start Inclusive start offset.
 * @param {bigint} end Exclusive end offset.
 * @returns {{ num: bigint, den: bigint }}
 */
function rangeProduct(n, start, end) {
	const len = end - start
	if (len === 0n) {
		return { num: 1n, den: 1n }
	}
	if (len === 1n) {
		return subInt(n, start)
	}
	const mid = start + (len >> 1n)
	const left = rangeProduct(n, start, mid)
	if (left.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const right = rangeProduct(n, mid, end)
	if (right.num === 0n) {
		return { num: 0n, den: 1n }
	}
	return mulRational(left, right)
}

/**
 * Compute the discrete k-permutations (falling factorial) P(n, k) = ∏_{i=0}^{k-1} (n - i)
 * over exact rational numbers using a recursive divide-and-conquer (binary splitting)
 * algorithm.
 *
 * For non-negative integer rationals n = { num: m, den: 1n }:
 * - P(m, k) = m! / (m - k)! for 0 <= k <= m
 * - P(m, k) = 0 for k > m
 * For arbitrary rational n = p / q (including negative and fractional values),
 * computes the generalized falling factorial (n)_k in exact lowest-terms arithmetic.
 *
 * @param {{ num: bigint, den: bigint }} n Exact rational numerator/denominator pair with den !== 0n.
 * @param {number | bigint} k Non-negative integer count of factors.
 * @returns {{ num: bigint, den: bigint }} Exact rational in lowest terms with den > 0n.
 * @throws {TypeError} If n is not a { num: BigInt, den: BigInt } object or k is not a number/BigInt.
 * @throws {RangeError} If n.den === 0n or k is negative, non-integer, non-finite, or unsafe.
 */
export function permutationsRationalRecursive(n, k) {
	const rat = normalizeRational(n)
	const count = normalizeCount(k)

	if (count === 0n) {
		return { num: 1n, den: 1n }
	}

	// Fast zero detection when n is a non-negative integer and k > n (factor i = n.num is 0).
	if (rat.den === 1n && rat.num >= 0n && count > rat.num) {
		return { num: 0n, den: 1n }
	}

	return rangeProduct(rat, 0n, count)
}
