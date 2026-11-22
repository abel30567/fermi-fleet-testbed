/**
 * @typedef {Object} Rational
 * @property {bigint} num - Numerator of the exact rational number.
 * @property {bigint} den - Denominator of the exact rational number (non-zero; strictly positive in outputs).
 */

/**
 * Computes the greatest common divisor of two BigInt values.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint} Non-negative GCD of `a` and `b`.
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
 * Validates and normalizes an exact rational `{ num: BigInt, den: BigInt }`
 * into lowest terms with `den > 0n` (and `0` as `{ num: 0n, den: 1n }`).
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {Rational}
 */
function normalizeRational(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be a rational object { num: BigInt, den: BigInt }`)
	}
	const { num, den } = /** @type {{ num?: unknown, den?: unknown }} */ (value)
	if (typeof num !== 'bigint' || typeof den !== 'bigint') {
		throw new TypeError(`${name}.num and ${name}.den must be BigInt values`)
	}
	if (den === 0n) {
		throw new RangeError(`${name}.den must not be 0n`)
	}
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	const sign = den < 0n ? -1n : 1n
	const signedNum = num * sign
	const positiveDen = den * sign
	const divisor = gcd(signedNum, positiveDen)
	return {
		num: signedNum / divisor,
		den: positiveDen / divisor,
	}
}

/**
 * Multiplies two already-reduced rationals (each in lowest terms with `den > 0n`)
 * using cross-cancellation so the returned product is guaranteed to be in lowest
 * terms with `den > 0n`.
 *
 * @param {Rational} left
 * @param {Rational} right
 * @returns {Rational}
 */
function multiplyReduced(left, right) {
	if (left.num === 0n || right.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const g1 = gcd(left.num, right.den)
	const g2 = gcd(right.num, left.den)
	return {
		num: (left.num / g1) * (right.num / g2),
		den: (left.den / g2) * (right.den / g1),
	}
}

/**
 * Recursive divide-and-conquer binary-splitting product tree evaluating:
 *   product_{i = lo}^{hi} ((p - i * q) / (q * (i + 1)))
 * where `n = p / q` is in lowest terms with `q > 0n` and `0n <= lo <= hi`.
 *
 * Each leaf is reduced to lowest terms, and each merge cross-cancels factors
 * before multiplying so every intermediate and final result remains in lowest
 * terms with `den > 0n`. Recursion depth is O(log(hi - lo + 1)).
 *
 * @param {bigint} p - Reduced numerator of `n`.
 * @param {bigint} q - Reduced positive denominator of `n`.
 * @param {bigint} lo - Inclusive lower index.
 * @param {bigint} hi - Inclusive upper index.
 * @returns {Rational}
 */
function productRange(p, q, lo, hi) {
	if (lo === hi) {
		const num = p - lo * q
		if (num === 0n) {
			return { num: 0n, den: 1n }
		}
		const den = q * (lo + 1n)
		const divisor = gcd(num, den)
		return {
			num: num / divisor,
			den: den / divisor,
		}
	}

	const mid = (lo + hi) >> 1n
	const left = productRange(p, q, lo, mid)
	if (left.num === 0n) {
		return { num: 0n, den: 1n }
	}
	const right = productRange(p, q, mid + 1n, hi)
	return multiplyReduced(left, right)
}

/**
 * Computes the generalized binomial coefficient / combinations `C(n, k)`:
 *   C(n, k) = (n * (n - 1) * ... * (n - k + 1)) / k!
 * over exact rationals `{ num: BigInt, den: BigInt }` in lowest terms (`den > 0n`),
 * using a recursive divide-and-conquer binary-splitting product tree.
 *
 * Supports arbitrary exact rational `n` (positive, zero, negative, or fractional)
 * and any non-negative integer exact rational `k`. For non-negative integer `n`,
 * this matches classical discrete combinations including `C(n, k) = 0/1` for `k > n`
 * and uses symmetry `C(n, k) = C(n, n - k)` when `k > n - k`.
 *
 * @param {Rational} n - Exact rational upper index `{ num: BigInt, den: BigInt }`.
 * @param {Rational} k - Exact non-negative integer rational lower index `{ num: BigInt, den: BigInt }`.
 * @returns {Rational} Exact rational result `{ num: BigInt, den: BigInt }` in lowest terms with `den > 0n`.
 * @throws {TypeError} If `n` or `k` is not an object with `BigInt` `num` and `den` properties.
 * @throws {RangeError} If either denominator is `0n`, or if `k` is negative or not an integer.
 */
export function combinationsRationalRecursive(n, k) {
	const normN = normalizeRational(n, 'n')
	const normK = normalizeRational(k, 'k')

	if (normK.den !== 1n) {
		throw new RangeError('k must be an integer rational')
	}
	if (normK.num < 0n) {
		throw new RangeError('k must be a non-negative integer rational')
	}

	let count = normK.num
	if (count === 0n) {
		return { num: 1n, den: 1n }
	}

	// Classical non-negative integer shortcuts: k > n => 0, and C(n, k) = C(n, n - k)
	if (normN.den === 1n && normN.num >= 0n) {
		if (count > normN.num) {
			return { num: 0n, den: 1n }
		}
		const complement = normN.num - count
		if (complement === 0n) {
			return { num: 1n, den: 1n }
		}
		if (complement < count) {
			count = complement
		}
	}

	return productRange(normN.num, normN.den, 0n, count - 1n)
}
