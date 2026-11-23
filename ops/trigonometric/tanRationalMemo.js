/**
 * Exact rational tangent computed via a precomputed sin/cos series coefficient
 * table and a memoization cache.
 *
 * Rational numbers are represented as `{ num: BigInt, den: BigInt }` in lowest
 * terms with a strictly positive denominator (`den > 0n`), with zero uniquely
 * represented as `{ num: 0n, den: 1n }`.
 *
 * Because `tan(x)` is irrational for every nonzero rational `x`, this function
 * evaluates the exact rational ratio of truncated Taylor polynomials
 * `sin_N(x) / cos_N(x)` using purely integer BigInt arithmetic:
 *
 *   sin_N(p/q) * (2N-1)! * q^(2N-1) = p * sum_{k=0}^{N-1} sinCoeffs[k] * (p^2)^k * (q^2)^(N-1-k)
 *   cos_N(p/q) * (2N-1)! * q^(2N-1) = q * sum_{k=0}^{N-1} cosCoeffs[k] * (p^2)^k * (q^2)^(N-1-k)
 *
 * where `sinCoeffs[k] = (-1)^k * (2N-1)! / (2k+1)!` and
 * `cosCoeffs[k] = (-1)^k * (2N-1)! / (2k)!` are precomputed in a table indexed
 * by series order `N`. Results are memoized by canonical `|num|/den:N` key,
 * sharing cache entries across equivalent unreduced forms and symmetric pairs
 * `x` and `-x`.
 */

const DEFAULT_TERMS = 16
const MAX_TERMS = 200
const MAX_EFFECTIVE_TERMS = 2000
const MAX_CACHE_SIZE = 4096
const PRECOMPUTED_FACTORIAL_LIMIT = 40

/**
 * Precomputed table of exact factorials `FACTORIALS[k] = k!`, lazily extended
 * when larger orders are requested.
 * @type {bigint[]}
 */
const FACTORIALS = [1n]
for (let k = 1; k <= PRECOMPUTED_FACTORIAL_LIMIT; k += 1) {
	FACTORIALS.push(FACTORIALS[k - 1] * BigInt(k))
}

/**
 * Memoized table of exact integer series coefficients per order `N`.
 * @type {Map<number, { sinCoeffs: bigint[], cosCoeffs: bigint[] }>}
 */
const ORDER_COEFF_TABLE = new Map()

/**
 * Memoization cache mapping canonical positive rational keys (`${num}/${den}:${n}`)
 * to reduced `{ num, den }` rational results.
 * @type {Map<string, { num: bigint, den: bigint }>}
 */
const RESULT_CACHE = new Map()

/**
 * Computes the greatest common divisor of two non-negative BigInts.
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
 * Ensures `FACTORIALS` is populated through `n!`.
 * @param {number} n
 * @returns {bigint}
 */
function factorial(n) {
	for (let k = FACTORIALS.length; k <= n; k += 1) {
		FACTORIALS.push(FACTORIALS[k - 1] * BigInt(k))
	}
	return FACTORIALS[n]
}

/**
 * Returns (and caches) the precomputed sin/cos integer coefficient arrays for
 * series order `n`.
 * @param {number} n
 * @returns {{ sinCoeffs: bigint[], cosCoeffs: bigint[] }}
 */
function getOrderCoeffs(n) {
	const existing = ORDER_COEFF_TABLE.get(n)
	if (existing !== undefined) {
		return existing
	}

	const maxFact = factorial(2 * n - 1)
	const sinCoeffs = new Array(n)
	const cosCoeffs = new Array(n)

	for (let k = 0; k < n; k += 1) {
		const sign = k % 2 === 0 ? 1n : -1n
		sinCoeffs[k] = sign * (maxFact / FACTORIALS[2 * k + 1])
		cosCoeffs[k] = sign * (maxFact / FACTORIALS[2 * k])
	}

	const entry = { sinCoeffs, cosCoeffs }
	ORDER_COEFF_TABLE.set(n, entry)
	return entry
}

// Precompute the default order table eagerly at module load.
getOrderCoeffs(DEFAULT_TERMS)

/**
 * Normalizes a rational `{ num, den }` to lowest terms with `den > 0n` and
 * zero as `{ num: 0n, den: 1n }`.
 * @param {bigint} num
 * @param {bigint} den
 * @returns {{ num: bigint, den: bigint }}
 */
function normalizeRational(num, den) {
	if (num === 0n) {
		return { num: 0n, den: 1n }
	}
	let n = num
	let d = den
	if (d < 0n) {
		n = -n
		d = -d
	}
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

/**
 * Evaluates scaled exact integer `sin` and `cos` sums for `p / q` (`p > 0n`, `q > 0n`)
 * at series order `n` using the precomputed coefficient table.
 * @param {bigint} p
 * @param {bigint} q
 * @param {number} n
 * @returns {{ sinInt: bigint, cosInt: bigint }}
 */
function evaluateSinCosScaled(p, q, n) {
	const { sinCoeffs, cosCoeffs } = getOrderCoeffs(n)
	const p2 = p * p
	const q2 = q * q

	const q2Pows = new Array(n)
	q2Pows[0] = 1n
	for (let k = 1; k < n; k += 1) {
		q2Pows[k] = q2Pows[k - 1] * q2
	}

	let sinSum = 0n
	let cosSum = 0n
	let p2Pow = 1n

	for (let k = 0; k < n; k += 1) {
		const q2Pow = q2Pows[n - 1 - k]
		const monomial = p2Pow * q2Pow
		sinSum += sinCoeffs[k] * monomial
		cosSum += cosCoeffs[k] * monomial
		if (k + 1 < n) {
			p2Pow *= p2
		}
	}

	return {
		sinInt: p * sinSum,
		cosInt: q * cosSum,
	}
}

/**
 * Stores a computed result in the bounded memoization cache.
 * @param {string} key
 * @param {{ num: bigint, den: bigint }} value
 */
function cacheSet(key, value) {
	if (RESULT_CACHE.size >= MAX_CACHE_SIZE) {
		const oldestKey = RESULT_CACHE.keys().next().value
		RESULT_CACHE.delete(oldestKey)
	}
	RESULT_CACHE.set(key, value)
}

/**
 * Computes `tan(x)` for an exact rational `x = { num, den }` (in radians),
 * returning an exact rational `{ num: BigInt, den: BigInt }` in lowest terms
 * with a positive denominator.
 *
 * Uses a precomputed sin/cos Taylor coefficient table and memoization cache.
 * For arguments with `|x| > 1`, the effective series order is automatically
 * increased to guarantee convergence while remaining exact in BigInt arithmetic.
 *
 * @param {{ num: bigint, den: bigint }} x - Input angle in radians as an exact rational.
 * @param {number} [terms=16] - Base number of sin/cos series terms (integer in `[1, 200]`).
 * @returns {{ num: bigint, den: bigint }} Exact rational approximation of `tan(x)` in lowest terms.
 * @throws {TypeError} If `x` is not a rational object with BigInt `num`/`den`, or `terms` is not a number.
 * @throws {RangeError} If `x.den === 0n`, `terms` is out of range/non-integer, or `|x|` exceeds supported range.
 */
export function tanRationalMemo(x, terms = DEFAULT_TERMS) {
	if (x === null || typeof x !== 'object' || Array.isArray(x)) {
		throw new TypeError('x must be an object of shape { num: BigInt, den: BigInt }')
	}
	if (typeof x.num !== 'bigint' || typeof x.den !== 'bigint') {
		throw new TypeError('x.num and x.den must be BigInt values')
	}
	if (x.den === 0n) {
		throw new RangeError('x.den must not be 0n')
	}
	if (typeof terms !== 'number') {
		throw new TypeError('terms must be a number')
	}
	if (!Number.isInteger(terms) || terms < 1 || terms > MAX_TERMS) {
		throw new RangeError(`terms must be an integer between 1 and ${MAX_TERMS}`)
	}

	const norm = normalizeRational(x.num, x.den)
	if (norm.num === 0n) {
		return { num: 0n, den: 1n }
	}

	const isNegative = norm.num < 0n
	const absNum = isNegative ? -norm.num : norm.num
	const den = norm.den

	// For |x| > 1, add ceil(1.5 * ceil(|x|)) terms so the Taylor series for sin/cos
	// is well past the e*|x| peak and converges tightly across the full domain.
	const ceilAbsX = (absNum + den - 1n) / den
	let effectiveTerms = terms
	if (ceilAbsX > 1n) {
		if (ceilAbsX > BigInt(MAX_EFFECTIVE_TERMS)) {
			throw new RangeError('Input magnitude |x| exceeds supported rational series range')
		}
		effectiveTerms = terms + Math.ceil(1.5 * Number(ceilAbsX))
		if (effectiveTerms > MAX_EFFECTIVE_TERMS) {
			throw new RangeError('Input magnitude |x| exceeds supported rational series range')
		}
	}

	const cacheKey = `${absNum}/${den}:${effectiveTerms}`
	let result = RESULT_CACHE.get(cacheKey)

	if (result === undefined) {
		let order = effectiveTerms
		let sinInt = 0n
		let cosInt = 0n
		while (order <= MAX_EFFECTIVE_TERMS) {
			;({ sinInt, cosInt } = evaluateSinCosScaled(absNum, den, order))
			if (cosInt !== 0n) {
				break
			}
			order += 1
		}
		if (cosInt === 0n) {
			throw new RangeError('Cosine series vanished at the requested order')
		}
		result = normalizeRational(sinInt, cosInt)
		cacheSet(cacheKey, result)
	}

	return {
		num: isNegative ? -result.num : result.num,
		den: result.den,
	}
}
