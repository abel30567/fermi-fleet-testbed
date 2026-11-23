/**
 * Element-wise division over `Float64Array` inputs using a precomputed
 * small-integer quotient lookup table combined with bounded LRU memoization
 * at both the scalar-pair and whole-array levels.
 *
 * @module ops/arithmetic/divideTypedMemo
 */

const TABLE_MIN = -64
const TABLE_MAX = 64
const TABLE_SPAN = TABLE_MAX - TABLE_MIN + 1 // 129
const MAX_PAIR_CACHE_SIZE = 4096
const MAX_ARRAY_CACHE_SIZE = 256
const MAX_ARRAY_CACHE_LENGTH = 1024

/**
 * Precomputed bit-exact quotient table for integer pairs (a, b) with
 * a, b in [-64, 64] and b !== 0.
 * Indexed by `(a - TABLE_MIN) * TABLE_SPAN + (b - TABLE_MIN)`.
 */
const SMALL_QUOTIENT_TABLE = new Float64Array(TABLE_SPAN * TABLE_SPAN)
for (let a = TABLE_MIN; a <= TABLE_MAX; a++) {
	const rowOffset = (a - TABLE_MIN) * TABLE_SPAN
	for (let b = TABLE_MIN; b <= TABLE_MAX; b++) {
		if (b !== 0) {
			SMALL_QUOTIENT_TABLE[rowOffset + (b - TABLE_MIN)] = a / b
		}
	}
}

// Reusable scratch buffer for zero-allocation IEEE-754 bit extraction.
const scratchBuffer = new ArrayBuffer(16)
const scratchFloat64 = new Float64Array(scratchBuffer)
const scratchUint64 = new BigUint64Array(scratchBuffer)

/** @type {Map<bigint, number>} */
const pairCache = new Map()

/** @type {Map<string, Float64Array>} */
const arrayCache = new Map()

const stats = {
	tableHits: 0,
	pairCacheHits: 0,
	arrayCacheHits: 0,
	misses: 0,
}

/**
 * Builds a collision-free 128-bit BigInt key from the exact IEEE-754 bit
 * patterns of two finite numbers (preserving +0 vs -0).
 *
 * @param {number} x
 * @param {number} y
 * @returns {bigint}
 */
function makePairKey(x, y) {
	scratchFloat64[0] = x
	scratchFloat64[1] = y
	return (scratchUint64[0] << 64n) | scratchUint64[1]
}

/**
 * Builds an injective string key from the exact IEEE-754 bit patterns of two
 * equal-length Float64Arrays (supporting non-zero byteOffset views and
 * distinguishing +0 from -0).
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {string}
 */
function makeArrayKey(a, b) {
	const len = a.length
	const aBits = new BigUint64Array(a.buffer, a.byteOffset, len)
	const bBits = new BigUint64Array(b.buffer, b.byteOffset, len)
	const parts = new Array(len * 2)
	for (let i = 0; i < len; i++) {
		parts[i] = aBits[i].toString(36)
		parts[len + i] = bBits[i].toString(36)
	}
	return `${len}|${parts.join(',')}`
}

/**
 * Stores a key-value entry in a bounded LRU Map.
 *
 * @template K, V
 * @param {Map<K, V>} cache
 * @param {K} key
 * @param {V} value
 * @param {number} maxSize
 */
function lruSet(cache, key, value, maxSize) {
	if (cache.has(key)) {
		cache.delete(key)
	} else if (cache.size >= maxSize) {
		const oldestKey = cache.keys().next().value
		cache.delete(oldestKey)
	}
	cache.set(key, value)
}

/**
 * Checks whether a value is an integer within the precomputed table bounds,
 * excluding negative zero so `-0 / b` preserves its IEEE-754 sign via the
 * bit-exact pair cache.
 *
 * @param {number} v
 * @returns {boolean}
 */
function isTableInt(v) {
	return (
		Number.isInteger(v) &&
		v >= TABLE_MIN &&
		v <= TABLE_MAX &&
		!Object.is(v, -0)
	)
}

/**
 * Performs element-wise arithmetic division (`a[i] / b[i]`) over two
 * equal-length `Float64Array` inputs, accelerating repeated and small-integer
 * divisions via a precomputed quotient table and bounded LRU memoization.
 *
 * Both input arrays are validated to be `Float64Array` instances of equal
 * length containing only finite values, with no zero divisors (`+0` or `-0`).
 * Neither input is mutated, and the returned `Float64Array` is always a fresh
 * allocation so caller mutations cannot corrupt internal caches.
 *
 * @param {Float64Array} a - Dividend array (finite Float64 values).
 * @param {Float64Array} b - Divisor array (finite, non-zero Float64 values).
 * @returns {Float64Array} A new `Float64Array` containing element-wise quotients `a[i] / b[i]`.
 * @throws {TypeError} If `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If `a` and `b` differ in length, contain non-finite values, or `b` contains `0` / `-0`.
 */
export function divideTypedMemo(a, b) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('Expected first argument "a" to be a Float64Array')
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Expected second argument "b" to be a Float64Array')
	}
	const len = a.length
	if (len !== b.length) {
		throw new RangeError(
			`Float64Array length mismatch: a.length (${len}) !== b.length (${b.length})`,
		)
	}

	// Validate all elements up front before touching any cache.
	for (let i = 0; i < len; i++) {
		const num = a[i]
		const den = b[i]
		if (!Number.isFinite(num)) {
			throw new RangeError(
				`Non-finite dividend at index ${i}: ${String(num)}`,
			)
		}
		if (!Number.isFinite(den)) {
			throw new RangeError(
				`Non-finite divisor at index ${i}: ${String(den)}`,
			)
		}
		if (den === 0) {
			throw new RangeError(`Division by zero at index ${i}`)
		}
	}

	if (len === 0) {
		return new Float64Array(0)
	}

	const canCacheArray = len <= MAX_ARRAY_CACHE_LENGTH
	let arrayKey = ''
	if (canCacheArray) {
		arrayKey = makeArrayKey(a, b)
		const cachedArray = arrayCache.get(arrayKey)
		if (cachedArray !== undefined) {
			// Refresh LRU position and return a defensive copy.
			arrayCache.delete(arrayKey)
			arrayCache.set(arrayKey, cachedArray)
			stats.arrayCacheHits++
			return new Float64Array(cachedArray)
		}
	}

	const result = new Float64Array(len)
	for (let i = 0; i < len; i++) {
		const num = a[i]
		const den = b[i]

		if (isTableInt(num) && isTableInt(den)) {
			result[i] =
				SMALL_QUOTIENT_TABLE[(num - TABLE_MIN) * TABLE_SPAN + (den - TABLE_MIN)]
			stats.tableHits++
			continue
		}

		const pairKey = makePairKey(num, den)
		const cachedQuotient = pairCache.get(pairKey)
		if (cachedQuotient !== undefined) {
			pairCache.delete(pairKey)
			pairCache.set(pairKey, cachedQuotient)
			result[i] = cachedQuotient
			stats.pairCacheHits++
		} else {
			const quotient = num / den
			lruSet(pairCache, pairKey, quotient, MAX_PAIR_CACHE_SIZE)
			result[i] = quotient
			stats.misses++
		}
	}

	if (canCacheArray) {
		// Store an internal copy so mutations to the returned array cannot poison the cache.
		lruSet(arrayCache, arrayKey, new Float64Array(result), MAX_ARRAY_CACHE_SIZE)
	}

	return result
}

/**
 * Returns a snapshot of internal lookup table and memoization statistics.
 *
 * @returns {{
 *   tableHits: number,
 *   pairCacheHits: number,
 *   arrayCacheHits: number,
 *   misses: number,
 *   pairCacheSize: number,
 *   arrayCacheSize: number,
 *   tableRange: [number, number],
 *   maxPairCacheSize: number,
 *   maxArrayCacheSize: number,
 *   maxArrayCacheLength: number
 * }}
 */
divideTypedMemo.getStats = function getStats() {
	return {
		tableHits: stats.tableHits,
		pairCacheHits: stats.pairCacheHits,
		arrayCacheHits: stats.arrayCacheHits,
		misses: stats.misses,
		pairCacheSize: pairCache.size,
		arrayCacheSize: arrayCache.size,
		tableRange: [TABLE_MIN, TABLE_MAX],
		maxPairCacheSize: MAX_PAIR_CACHE_SIZE,
		maxArrayCacheSize: MAX_ARRAY_CACHE_SIZE,
		maxArrayCacheLength: MAX_ARRAY_CACHE_LENGTH,
	}
}

/**
 * Clears the dynamic pair and array memoization caches and resets hit/miss
 * counters. The precomputed small-integer quotient table remains intact.
 */
divideTypedMemo.clearCache = function clearCache() {
	pairCache.clear()
	arrayCache.clear()
	stats.tableHits = 0
	stats.pairCacheHits = 0
	stats.arrayCacheHits = 0
	stats.misses = 0
}
