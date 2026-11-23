/**
 * Fixed-point scaling factor (10^18) for vector magnitude results.
 */
const SCALE = 10n ** 18n
const SCALE_SQ = SCALE * SCALE
const TABLE_LIMIT = 1024
const TABLE_LIMIT_BIGINT = BigInt(TABLE_LIMIT)
const MAX_CACHE_SIZE = 4096

/**
 * Computes the exact integer square root floor(sqrt(n)) for a non-negative BigInt n
 * using Newton's method with a bit-length upper-bound initial guess.
 *
 * @param {bigint} n Non-negative BigInt radicand.
 * @returns {bigint} Exact floor(sqrt(n)).
 */
function isqrt(n) {
	if (n < 2n) return n
	const bitLength = BigInt(n.toString(2).length)
	let x0 = 1n << ((bitLength + 1n) >> 1n)
	let x1 = (x0 + n / x0) >> 1n
	while (x1 < x0) {
		x0 = x1
		x1 = (x0 + n / x0) >> 1n
	}
	return x0
}

/**
 * Precomputed lookup table of squares i^2 for 0 <= i <= TABLE_LIMIT.
 * @type {readonly bigint[]}
 */
const SQUARE_TABLE = Object.freeze(
	Array.from({ length: TABLE_LIMIT + 1 }, (_, i) => {
		const b = BigInt(i)
		return b * b
	})
)

/**
 * Precomputed lookup table of fixed-point scaled square roots floor(sqrt(k) * 10^18)
 * for 0 <= k <= TABLE_LIMIT.
 * @type {readonly bigint[]}
 */
const SCALED_SQRT_TABLE = Object.freeze(
	Array.from({ length: TABLE_LIMIT + 1 }, (_, k) => isqrt(BigInt(k) * SCALE_SQ))
)

/**
 * Bounded FIFO memoization cache mapping sum-of-squares (BigInt > TABLE_LIMIT)
 * to its exact fixed-point scaled square root floor(sqrt(sumSq) * 10^18).
 * @type {Map<bigint, bigint>}
 */
const scaledSqrtCache = new Map()

/**
 * Computes the Euclidean magnitude (L2 norm) of a vector of exact BigInt integers,
 * returned as a fixed-point BigInt scaled by 10^18:
 *   floor(sqrt(sum(v_i^2)) * 10^18)
 *
 * Uses precomputed lookup tables for small component squares (|v_i| <= 1024)
 * and small squared norms (sum(v_i^2) <= 1024), together with a bounded
 * memoization cache keyed by the exact sum of squares so repeated calls,
 * sign flips, component permutations, and zero-padded equivalents reuse results.
 *
 * @param {readonly bigint[]} vector Array of exact BigInt components.
 * @returns {bigint} Euclidean magnitude scaled by 10^18 (exact floor).
 * @throws {TypeError} If `vector` is not an Array or any element is not a BigInt.
 */
export function magnitudeBigIntMemo(vector) {
	if (!Array.isArray(vector)) {
		throw new TypeError(`Expected vector to be an Array, got ${typeof vector}`)
	}

	let sumSq = 0n
	for (let i = 0; i < vector.length; i++) {
		const value = vector[i]
		if (typeof value !== 'bigint') {
			throw new TypeError(`Expected BigInt at vector index ${i}, got ${typeof value}`)
		}
		const abs = value < 0n ? -value : value
		if (abs <= TABLE_LIMIT_BIGINT) {
			sumSq += SQUARE_TABLE[Number(abs)]
		} else {
			sumSq += abs * abs
		}
	}

	if (sumSq <= TABLE_LIMIT_BIGINT) {
		return SCALED_SQRT_TABLE[Number(sumSq)]
	}

	const cached = scaledSqrtCache.get(sumSq)
	if (cached !== undefined) {
		return cached
	}

	const result = isqrt(sumSq * SCALE_SQ)
	if (scaledSqrtCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = scaledSqrtCache.keys().next().value
		scaledSqrtCache.delete(oldestKey)
	}
	scaledSqrtCache.set(sumSq, result)
	return result
}
