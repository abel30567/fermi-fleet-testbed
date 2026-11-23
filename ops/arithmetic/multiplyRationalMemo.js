/**
 * Exact rational multiplication over `{ num: BigInt, den: BigInt }` values
 * normalized to lowest terms, backed by a precomputed small-GCD lookup table
 * and a bounded LRU memoization cache.
 *
 * @module ops/arithmetic/multiplyRationalMemo
 */

/**
 * Maximum operand magnitude covered by the precomputed small GCD table.
 * Values in `[0, SMALL_GCD_LIMIT]` resolve in O(1) via flat typed-array lookup.
 */
const SMALL_GCD_LIMIT = 64
const SMALL_GCD_STRIDE = SMALL_GCD_LIMIT + 1
const SMALL_GCD_LIMIT_BIGINT = BigInt(SMALL_GCD_LIMIT)

/**
 * Precomputed GCD table for all pairs `(a, b)` with `0 <= a, b <= 64`.
 * @type {Uint8Array}
 */
const SMALL_GCD_TABLE = new Uint8Array(SMALL_GCD_STRIDE * SMALL_GCD_STRIDE)

for (let i = 0; i <= SMALL_GCD_LIMIT; i += 1) {
	SMALL_GCD_TABLE[i] = i
	SMALL_GCD_TABLE[i * SMALL_GCD_STRIDE] = i
}
for (let i = 1; i <= SMALL_GCD_LIMIT; i += 1) {
	for (let j = 1; j <= SMALL_GCD_LIMIT; j += 1) {
		const idx = i * SMALL_GCD_STRIDE + j
		if (i === j) {
			SMALL_GCD_TABLE[idx] = i
		} else if (i > j) {
			SMALL_GCD_TABLE[idx] = SMALL_GCD_TABLE[(i - j) * SMALL_GCD_STRIDE + j]
		} else {
			SMALL_GCD_TABLE[idx] = SMALL_GCD_TABLE[i * SMALL_GCD_STRIDE + (j - i)]
		}
	}
}

/**
 * Maximum number of canonical product entries retained in the LRU cache.
 */
const MAX_CACHE_SIZE = 4096

/**
 * Bounded LRU memoization table mapping canonical commutative pair keys
 * (`"n1/d1*n2/d2"` with `(n1, d1) <= (n2, d2)`) to reduced `{ num, den }`.
 * @type {Map<string, { num: bigint, den: bigint }>}
 */
const PRODUCT_CACHE = new Map()

/**
 * Compute the non-negative greatest common divisor of two BigInts using
 * the precomputed small-GCD table whenever both operands fit within bounds.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b

	while (y !== 0n) {
		if (x <= SMALL_GCD_LIMIT_BIGINT && y <= SMALL_GCD_LIMIT_BIGINT) {
			return BigInt(SMALL_GCD_TABLE[Number(x) * SMALL_GCD_STRIDE + Number(y)])
		}
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Validate a rational input object `{ num: BigInt, den: BigInt }` and return
 * its canonical lowest-terms representation with `den > 0n`.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {{ num: bigint, den: bigint }}
 */
function validateAndNormalize(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object with BigInt num and den properties`)
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
	if (g === 1n) {
		return { num: n, den: d }
	}
	return { num: n / g, den: d / g }
}

/**
 * Build a canonical commutative cache key for two normalized rationals.
 *
 * @param {{ num: bigint, den: bigint }} r1
 * @param {{ num: bigint, den: bigint }} r2
 * @returns {string}
 */
function makeCacheKey(r1, r2) {
	const firstLess =
		r1.num < r2.num || (r1.num === r2.num && r1.den <= r2.den)
	if (firstLess) {
		return `${r1.num}/${r1.den}*${r2.num}/${r2.den}`
	}
	return `${r2.num}/${r2.den}*${r1.num}/${r1.den}`
}

/**
 * Store a reduced rational product in the bounded LRU cache.
 *
 * @param {string} key
 * @param {{ num: bigint, den: bigint }} entry
 */
function cacheSet(key, entry) {
	if (PRODUCT_CACHE.size >= MAX_CACHE_SIZE) {
		const oldestKey = PRODUCT_CACHE.keys().next().value
		if (oldestKey !== undefined) {
			PRODUCT_CACHE.delete(oldestKey)
		}
	}
	PRODUCT_CACHE.set(key, entry)
}

/**
 * Prepopulate the memoization table with products of small unit and proper
 * fractions so common small rational multiplications hit immediately.
 */
;(function precomputeSmallProducts() {
	const smallRationals = []
	for (let d = 1n; d <= 6n; d += 1n) {
		for (let n = -6n; n <= 6n; n += 1n) {
			if (n !== 0n && gcdBigInt(n, d) === 1n) {
				smallRationals.push({ num: n, den: d })
			}
		}
	}

	for (let i = 0; i < smallRationals.length; i += 1) {
		const r1 = smallRationals[i]
		for (let j = i; j < smallRationals.length; j += 1) {
			const r2 = smallRationals[j]
			if (PRODUCT_CACHE.size >= MAX_CACHE_SIZE / 2) {
				return
			}
			const g1 = gcdBigInt(r1.num, r2.den)
			const g2 = gcdBigInt(r2.num, r1.den)
			const key = makeCacheKey(r1, r2)
			PRODUCT_CACHE.set(key, {
				num: (r1.num / g1) * (r2.num / g2),
				den: (r1.den / g2) * (r2.den / g1),
			})
		}
	}
})()

/**
 * Multiply two exact rationals `{ num: BigInt, den: BigInt }` and return the
 * exact product reduced to lowest terms with a positive denominator (`den > 0n`).
 *
 * Zero is always represented canonically as `{ num: 0n, den: 1n }`.
 * Uses a precomputed small-GCD lookup table, precomputed small-fraction product
 * entries, and a bounded LRU memoization cache keyed canonically (exploiting
 * commutativity). Returned objects are fresh copies so external mutations cannot
 * corrupt cached values.
 *
 * @param {{ num: bigint, den: bigint }} a - First rational operand.
 * @param {{ num: bigint, den: bigint }} b - Second rational operand.
 * @returns {{ num: bigint, den: bigint }} Exact product in lowest terms with `den > 0n`.
 * @throws {TypeError} If `a` or `b` is not an object with `BigInt` `num` and `den`.
 * @throws {RangeError} If `a.den === 0n` or `b.den === 0n`.
 */
export function multiplyRationalMemo(a, b) {
	const r1 = validateAndNormalize(a, 'a')
	const r2 = validateAndNormalize(b, 'b')

	if (r1.num === 0n || r2.num === 0n) {
		return { num: 0n, den: 1n }
	}

	const key = makeCacheKey(r1, r2)
	const cached = PRODUCT_CACHE.get(key)
	if (cached !== undefined) {
		// Refresh recency in LRU order
		PRODUCT_CACHE.delete(key)
		PRODUCT_CACHE.set(key, cached)
		return { num: cached.num, den: cached.den }
	}

	// Cross-cancel before multiplying to keep intermediate BigInts small
	const g1 = gcdBigInt(r1.num, r2.den)
	const g2 = gcdBigInt(r2.num, r1.den)

	const result = {
		num: (r1.num / g1) * (r2.num / g2),
		den: (r1.den / g2) * (r2.den / g1),
	}

	cacheSet(key, result)
	return { num: result.num, den: result.den }
}
