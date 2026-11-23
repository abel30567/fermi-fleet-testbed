/**
 * Exact discrete product over BigInt integers using precomputed lookup tables,
 * multiplicity folding, balanced divide-and-conquer multiplication, and bounded
 * LRU memoization.
 *
 * All operations are performed in exact arbitrary-precision BigInt arithmetic
 * (zero dependencies). Because the product of integers is always an exact
 * integer, results are returned directly as exact BigInt values.
 *
 * @module ops/discrete/productBigIntMemo
 */

const SMALL_MUL_MAX = 32
const SMALL_MUL_STRIDE = SMALL_MUL_MAX + 1
const SMALL_POW_BASE_MAX = 32
const SMALL_POW_EXP_MAX = 32
const MAX_CACHE_ENTRIES = 4096
const MAX_CACHE_KEY_LENGTH = 4096

/**
 * Precomputed multiplication table for small non-negative BigInt pairs
 * (0 <= a, b <= SMALL_MUL_MAX).
 *
 * @type {BigInt[]}
 */
const SMALL_MUL_TABLE = (() => {
	const table = new Array(SMALL_MUL_STRIDE * SMALL_MUL_STRIDE)
	for (let a = 0; a <= SMALL_MUL_MAX; a++) {
		const rowOffset = a * SMALL_MUL_STRIDE
		const bigA = BigInt(a)
		for (let b = 0; b <= SMALL_MUL_MAX; b++) {
			table[rowOffset + b] = bigA * BigInt(b)
		}
	}
	return table
})()

/**
 * Precomputed power table for small bases (2 <= base <= SMALL_POW_BASE_MAX)
 * and exponents (0 <= exp <= SMALL_POW_EXP_MAX).
 *
 * @type {BigInt[][]}
 */
const SMALL_POW_TABLE = (() => {
	const table = new Array(SMALL_POW_BASE_MAX + 1)
	for (let base = 2; base <= SMALL_POW_BASE_MAX; base++) {
		const row = new Array(SMALL_POW_EXP_MAX + 1)
		const bigBase = BigInt(base)
		row[0] = 1n
		for (let exp = 1; exp <= SMALL_POW_EXP_MAX; exp++) {
			row[exp] = row[exp - 1] * bigBase
		}
		table[base] = row
	}
	return table
})()

/** @type {Map<string, bigint>} */
const mulCache = new Map()

/** @type {Map<string, bigint>} */
const powCache = new Map()

/** @type {Map<string, bigint>} */
const productCache = new Map()

/**
 * Retrieve a value from a bounded LRU Map cache, refreshing recency on hit.
 *
 * @param {Map<string, bigint>} cache
 * @param {string} key
 * @returns {bigint | undefined}
 */
function lruGet(cache, key) {
	if (!cache.has(key)) return undefined
	const value = cache.get(key)
	cache.delete(key)
	cache.set(key, value)
	return value
}

/**
 * Store a value in a bounded LRU Map cache, evicting the oldest entry if full.
 *
 * @param {Map<string, bigint>} cache
 * @param {string} key
 * @param {bigint} value
 */
function lruSet(cache, key, value) {
	if (key.length > MAX_CACHE_KEY_LENGTH) return
	if (cache.has(key)) {
		cache.delete(key)
	} else if (cache.size >= MAX_CACHE_ENTRIES) {
		const oldestKey = cache.keys().next().value
		cache.delete(oldestKey)
	}
	cache.set(key, value)
}

/**
 * Multiply two non-negative BigInt integers using the precomputed small
 * multiplication table and bounded LRU memoization.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function memoMul(a, b) {
	if (a === 0n || b === 0n) return 0n
	if (a === 1n) return b
	if (b === 1n) return a

	const lo = a <= b ? a : b
	const hi = a <= b ? b : a

	if (hi <= BigInt(SMALL_MUL_MAX)) {
		return SMALL_MUL_TABLE[Number(lo) * SMALL_MUL_STRIDE + Number(hi)]
	}

	const key = `${lo}*${hi}`
	const cached = lruGet(mulCache, key)
	if (cached !== undefined) return cached

	const result = lo * hi
	lruSet(mulCache, key, result)
	return result
}

/**
 * Raise a positive BigInt base (>= 2n) to a positive integer exponent (>= 1)
 * using the precomputed power table and memoized binary exponentiation.
 *
 * @param {bigint} base
 * @param {number} exp
 * @returns {bigint}
 */
function memoPow(base, exp) {
	if (exp === 1) return base
	if (base <= BigInt(SMALL_POW_BASE_MAX) && exp <= SMALL_POW_EXP_MAX) {
		return SMALL_POW_TABLE[Number(base)][exp]
	}

	const key = `${base}^${exp}`
	const cached = lruGet(powCache, key)
	if (cached !== undefined) return cached

	let result = 1n
	let factor = base
	let e = exp
	while (e > 0) {
		if ((e & 1) === 1) {
			result = memoMul(result, factor)
		}
		e >>>= 1
		if (e > 0) {
			factor = memoMul(factor, factor)
		}
	}

	lruSet(powCache, key, result)
	return result
}

/**
 * Multiply a non-empty slice `factors[lo..hi)` via a balanced binary product tree.
 *
 * @param {bigint[]} factors
 * @param {number} lo
 * @param {number} hi
 * @returns {bigint}
 */
function multiplyBalanced(factors, lo, hi) {
	const len = hi - lo
	if (len === 1) return factors[lo]
	if (len === 2) return memoMul(factors[lo], factors[lo + 1])

	const mid = lo + (len >>> 1)
	return memoMul(
		multiplyBalanced(factors, lo, mid),
		multiplyBalanced(factors, mid, hi)
	)
}

/**
 * Compute the exact discrete product of an iterable of BigInt integers.
 *
 * Features:
 * - Returns `1n` (the multiplicative identity) for an empty iterable.
 * - Validates every element is a `bigint` before returning (even if `0n` is seen).
 * - Folds duplicate factors via frequency counting + precomputed/memoized powers.
 * - Canonicalizes sorted factor multisets so permutations hit the LRU memo cache.
 * - Uses a precomputed small multiplication table and balanced product tree.
 *
 * @param {Iterable<bigint>} values - Iterable of exact BigInt integers.
 * @returns {bigint} The exact product of all elements in `values`.
 * @throws {TypeError} If `values` is not a non-string iterable or any element is not a `bigint`.
 */
export function productBigIntMemo(values) {
	if (
		values === null ||
		values === undefined ||
		typeof values === 'string' ||
		typeof values[Symbol.iterator] !== 'function'
	) {
		throw new TypeError('productBigIntMemo expects an iterable of BigInt values')
	}

	let negative = false
	let hasZero = false
	/** @type {Map<bigint, number>} */
	const counts = new Map()
	let index = 0

	for (const item of values) {
		if (typeof item !== 'bigint') {
			throw new TypeError(
				`Element at index ${index} must be a BigInt, received ${typeof item}`
			)
		}
		index++

		if (item === 0n) {
			hasZero = true
			continue
		}

		let mag = item
		if (mag < 0n) {
			negative = !negative
			mag = -mag
		}

		if (mag !== 1n) {
			counts.set(mag, (counts.get(mag) ?? 0) + 1)
		}
	}

	if (hasZero) return 0n
	if (counts.size === 0) return negative ? -1n : 1n

	const entries = Array.from(counts.entries())
	entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))

	const cacheKey = entries.map(([val, exp]) => (exp === 1 ? `${val}` : `${val}^${exp}`)).join('*')
	let magnitude = lruGet(productCache, cacheKey)

	if (magnitude === undefined) {
		const poweredFactors = entries.map(([val, exp]) => memoPow(val, exp))
		magnitude = multiplyBalanced(poweredFactors, 0, poweredFactors.length)
		lruSet(productCache, cacheKey, magnitude)
	}

	return negative ? -magnitude : magnitude
}
