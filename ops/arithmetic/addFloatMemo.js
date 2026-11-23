/**
 * Table-driven, precomputed, and memoized IEEE-754 float64 addition.
 *
 * Uses a three-tier strategy that preserves exact IEEE-754 binary64 semantics
 * (including signed zero, Infinity, NaN, subnormals, and round-to-nearest-even):
 *   1. A precomputed 5x5 special-value lookup table for NaN, ±Infinity, and ±0.
 *   2. A precomputed dense Float64Array lookup table for small integer pairs in [-64, 64].
 *   3. A bounded LRU memoization cache keyed by canonicalized IEEE-754 64-bit patterns.
 *
 * @module ops/arithmetic/addFloatMemo
 */

const SPECIAL_NAN = 0
const SPECIAL_POS_INF = 1
const SPECIAL_NEG_INF = 2
const SPECIAL_POS_ZERO = 3
const SPECIAL_NEG_ZERO = 4
const SPECIAL_COUNT = 5

/**
 * Precomputed 5x5 IEEE-754 addition table for special values:
 * [NaN, +Infinity, -Infinity, +0, -0] x [NaN, +Infinity, -Infinity, +0, -0].
 */
const SPECIAL_ADD_TABLE = new Float64Array([
	// NaN + {NaN, +Inf, -Inf, +0, -0}
	NaN, NaN, NaN, NaN, NaN,
	// +Inf + {NaN, +Inf, -Inf, +0, -0}
	NaN, Infinity, NaN, Infinity, Infinity,
	// -Inf + {NaN, +Inf, -Inf, +0, -0}
	NaN, NaN, -Infinity, -Infinity, -Infinity,
	// +0 + {NaN, +Inf, -Inf, +0, -0}
	NaN, Infinity, -Infinity, +0, +0,
	// -0 + {NaN, +Inf, -Inf, +0, -0}
	NaN, Infinity, -Infinity, +0, -0,
])

const INT_TABLE_MIN = -64
const INT_TABLE_MAX = 64
const INT_TABLE_SPAN = INT_TABLE_MAX - INT_TABLE_MIN + 1

/**
 * Precomputed dense addition table for integer float64 operands in [-64, 64].
 */
const INT_ADD_TABLE = (() => {
	const table = new Float64Array(INT_TABLE_SPAN * INT_TABLE_SPAN)
	for (let a = INT_TABLE_MIN; a <= INT_TABLE_MAX; a += 1) {
		const rowOffset = (a - INT_TABLE_MIN) * INT_TABLE_SPAN
		for (let b = INT_TABLE_MIN; b <= INT_TABLE_MAX; b += 1) {
			table[rowOffset + (b - INT_TABLE_MIN)] = a + b
		}
	}
	return table
})()

const DEFAULT_MAX_CACHE_SIZE = 4096

// Shared scratch buffer for exact IEEE-754 float64 bit-pattern extraction.
const scratchBuffer = new ArrayBuffer(16)
const scratchFloat64 = new Float64Array(scratchBuffer)
const scratchBigUint64 = new BigUint64Array(scratchBuffer)

/**
 * Classifies a float64 number into a special-value index, or -1 if finite non-zero.
 *
 * @param {number} x
 * @returns {number}
 */
function classifySpecial(x) {
	if (Number.isNaN(x)) return SPECIAL_NAN
	if (x === Infinity) return SPECIAL_POS_INF
	if (x === -Infinity) return SPECIAL_NEG_INF
	if (x === 0) return Object.is(x, -0) ? SPECIAL_NEG_ZERO : SPECIAL_POS_ZERO
	return -1
}

/**
 * Resolves addition when one operand is special (NaN, ±Inf, ±0) and the other is finite non-zero.
 *
 * @param {number} specialCode
 * @param {number} finiteNonZero
 * @returns {number}
 */
function resolveSpecialWithFinite(specialCode, finiteNonZero) {
	switch (specialCode) {
		case SPECIAL_NAN:
			return NaN
		case SPECIAL_POS_INF:
			return Infinity
		case SPECIAL_NEG_INF:
			return -Infinity
		case SPECIAL_POS_ZERO:
		case SPECIAL_NEG_ZERO:
			return finiteNonZero
		default:
			return NaN
	}
}

/**
 * Builds an exact, collision-free, commutativity-normalized cache key
 * from the IEEE-754 64-bit bit patterns of `a` and `b`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {bigint}
 */
function makeMemoKey(a, b) {
	scratchFloat64[0] = a
	scratchFloat64[1] = b
	const bitsA = scratchBigUint64[0]
	const bitsB = scratchBigUint64[1]
	return bitsA <= bitsB
		? (bitsA << 64n) | bitsB
		: (bitsB << 64n) | bitsA
}

/**
 * Creates an isolated memoized IEEE-754 float64 addition function with its own
 * bounded LRU cache and instrumentation helpers.
 *
 * @param {object} [options]
 * @param {number} [options.maxCacheSize=4096] Maximum number of memoized pairs (non-negative safe integer).
 * @returns {((a: number, b: number) => number) & {
 *   clearCache: () => void,
 *   getStats: () => {
 *     specialTableHits: number,
 *     intTableHits: number,
 *     cacheHits: number,
 *     cacheMisses: number,
 *     evictions: number,
 *     cacheSize: number,
 *     maxCacheSize: number,
 *   }
 * }}
 * @throws {TypeError} If `options` is not undefined/object or `maxCacheSize` is not a number.
 * @throws {RangeError} If `maxCacheSize` is not a non-negative safe integer.
 */
export function createAddFloatMemo(options = {}) {
	if (options === null || typeof options !== 'object') {
		throw new TypeError('options must be a non-null object')
	}

	const { maxCacheSize = DEFAULT_MAX_CACHE_SIZE } = options
	if (typeof maxCacheSize !== 'number') {
		throw new TypeError('options.maxCacheSize must be a number')
	}
	if (!Number.isSafeInteger(maxCacheSize) || maxCacheSize < 0) {
		throw new RangeError('options.maxCacheSize must be a non-negative safe integer')
	}

	/** @type {Map<bigint, number>} */
	const cache = new Map()
	const stats = {
		specialTableHits: 0,
		intTableHits: 0,
		cacheHits: 0,
		cacheMisses: 0,
		evictions: 0,
	}

	/**
	 * Adds two IEEE-754 float64 numbers using precomputed lookup tables and LRU memoization.
	 *
	 * @param {number} a First IEEE-754 float64 operand.
	 * @param {number} b Second IEEE-754 float64 operand.
	 * @returns {number} Exact IEEE-754 float64 sum of `a` and `b`.
	 * @throws {TypeError} If either `a` or `b` is not a primitive `number`.
	 */
	function addFloatMemo(a, b) {
		if (typeof a !== 'number') {
			throw new TypeError(`Expected first operand "a" to be a number, got ${a === null ? 'null' : typeof a}`)
		}
		if (typeof b !== 'number') {
			throw new TypeError(`Expected second operand "b" to be a number, got ${b === null ? 'null' : typeof b}`)
		}

		// Tier 1: Special-value table (NaN, +Infinity, -Infinity, +0, -0).
		const specialA = classifySpecial(a)
		const specialB = classifySpecial(b)
		if (specialA !== -1 || specialB !== -1) {
			stats.specialTableHits += 1
			if (specialA !== -1 && specialB !== -1) {
				return SPECIAL_ADD_TABLE[specialA * SPECIAL_COUNT + specialB]
			}
			return specialA !== -1
				? resolveSpecialWithFinite(specialA, b)
				: resolveSpecialWithFinite(specialB, a)
		}

		// Tier 2: Precomputed small integer table for [-64, 64] x [-64, 64].
		if (
			a >= INT_TABLE_MIN &&
			a <= INT_TABLE_MAX &&
			b >= INT_TABLE_MIN &&
			b <= INT_TABLE_MAX &&
			Number.isInteger(a) &&
			Number.isInteger(b)
		) {
			stats.intTableHits += 1
			return INT_ADD_TABLE[(a - INT_TABLE_MIN) * INT_TABLE_SPAN + (b - INT_TABLE_MIN)]
		}

		// Tier 3: Bounded LRU memoization cache for general finite non-zero float64 pairs.
		const key = makeMemoKey(a, b)
		if (cache.has(key)) {
			const cached = cache.get(key)
			cache.delete(key)
			cache.set(key, cached)
			stats.cacheHits += 1
			return cached
		}

		const result = a + b
		stats.cacheMisses += 1

		if (maxCacheSize > 0) {
			if (cache.size >= maxCacheSize) {
				const oldestKey = cache.keys().next().value
				cache.delete(oldestKey)
				stats.evictions += 1
			}
			cache.set(key, result)
		}

		return result
	}

	addFloatMemo.clearCache = () => {
		cache.clear()
		stats.specialTableHits = 0
		stats.intTableHits = 0
		stats.cacheHits = 0
		stats.cacheMisses = 0
		stats.evictions = 0
	}

	addFloatMemo.getStats = () => ({
		...stats,
		cacheSize: cache.size,
		maxCacheSize,
	})

	return addFloatMemo
}

/**
 * Adds two IEEE-754 float64 numbers using precomputed lookup tables and bounded LRU memoization.
 *
 * @param {number} a First IEEE-754 float64 operand.
 * @param {number} b Second IEEE-754 float64 operand.
 * @returns {number} Exact IEEE-754 float64 sum of `a` and `b`.
 * @throws {TypeError} If either `a` or `b` is not a primitive `number`.
 */
export const addFloatMemo = createAddFloatMemo()
