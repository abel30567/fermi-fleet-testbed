/**
 * @fileoverview Interval arithmetic square root with true IEEE-754 outward
 * rounding guaranteeing mathematical enclosure, accelerated by a precomputed
 * integer lookup table and bounded LRU memoization caches.
 *
 * Zero dependencies. ESM (Node 20+).
 */

const _buf = new ArrayBuffer(8)
const _f64 = new Float64Array(_buf)
const _u64 = new BigUint64Array(_buf)

/**
 * Veltkamp splitting constant (2^27 + 1) for Dekker's exact binary64 squaring.
 * @type {number}
 */
const VELTKAMP_SPLIT = 134217729

/**
 * Exact power-of-2 scaling constants to keep Dekker's twoSqr strictly inside
 * the normal IEEE-754 binary64 range without overflow or underflow.
 */
const TINY_THRESHOLD = 2 ** -900
const HUGE_THRESHOLD = 2 ** 900
const SCALE_UP_X = 2 ** 600
const SCALE_UP_R_INV = 2 ** -300
const SCALE_DOWN_X = 2 ** -512
const SCALE_DOWN_R_INV = 2 ** 256

/**
 * Maximum integer precomputed in the static lookup tables (inclusive: 0..1024).
 * @type {number}
 */
const PRECOMPUTED_MAX_INT = 1024

/**
 * Maximum number of entries kept in the interval and endpoint LRU memo caches.
 * @type {number}
 */
const MAX_INTERVAL_CACHE_SIZE = 4096
const MAX_ENDPOINT_CACHE_SIZE = 4096

/**
 * Returns the raw 64-bit unsigned IEEE-754 bit pattern of a binary64 number.
 *
 * @param {number} x - Binary64 number.
 * @returns {bigint} 64-bit unsigned representation.
 */
function floatToBits(x) {
	_f64[0] = x
	return _u64[0]
}

/**
 * Returns the next representable IEEE-754 binary64 number strictly greater
 * than `x` (toward +Infinity).
 *
 * @param {number} x - Input binary64 number.
 * @returns {number} Smallest binary64 number > `x` (or `Infinity` / `NaN`).
 */
export function nextUp(x) {
	if (Number.isNaN(x) || x === Infinity) return x
	if (x === -Infinity) return -Number.MAX_VALUE
	if (x === 0) return Number.MIN_VALUE
	_f64[0] = x
	if (x > 0) {
		_u64[0] += 1n
	} else {
		_u64[0] -= 1n
	}
	const result = _f64[0]
	return result === 0 ? 0 : result
}

/**
 * Returns the next representable IEEE-754 binary64 number strictly less than
 * `x` (toward -Infinity).
 *
 * @param {number} x - Input binary64 number.
 * @returns {number} Largest binary64 number < `x` (or `-Infinity` / `NaN`).
 */
export function nextDown(x) {
	if (Number.isNaN(x) || x === -Infinity) return x
	if (x === Infinity) return Number.MAX_VALUE
	if (x === 0) return -Number.MIN_VALUE
	_f64[0] = x
	if (x > 0) {
		_u64[0] -= 1n
	} else {
		_u64[0] += 1n
	}
	const result = _f64[0]
	return result === 0 ? 0 : result
}

/**
 * Computes the exact error-free square of a normal binary64 value `a` using
 * Dekker's algorithm: `p + err === a * a` exactly in real arithmetic, provided
 * `a` is well away from overflow and underflow thresholds.
 *
 * @param {number} a - Scaled normal binary64 value.
 * @returns {[number, number]} Exact pair `[p, err]` with `p = fl(a * a)`.
 */
function twoSqr(a) {
	const p = a * a
	const c = VELTKAMP_SPLIT * a
	const aHi = c - (c - a)
	const aLo = a - aHi
	const err = (aHi * aHi - p + 2 * aHi * aLo) + aLo * aLo
	return [p, err]
}

/**
 * Computes the tightest IEEE-754 outward-rounded bounds `[lo, hi]` for
 * `sqrt(x)` where `x >= 0` is a finite binary64 number, guaranteeing
 * `lo <= exact_sqrt(x) <= hi` and `lo === hi` iff `exact_sqrt(x)` is
 * exactly representable in binary64.
 *
 * @param {number} x - Finite non-negative binary64 number.
 * @returns {[number, number]} Exact outward-rounded `[sqrtDown(x), sqrtUp(x)]`.
 */
function computeSqrtBounds(x) {
	if (x === 0) return [0, 0]

	let xs = x
	let unscale = 1
	if (x < TINY_THRESHOLD) {
		xs = x * SCALE_UP_X
		unscale = SCALE_UP_R_INV
	} else if (x > HUGE_THRESHOLD) {
		xs = x * SCALE_DOWN_X
		unscale = SCALE_DOWN_R_INV
	}

	const rs = Math.sqrt(xs)
	const [p, err] = twoSqr(rs)

	// Because p = fl(rs^2) is round-to-nearest and xs is a binary64 float:
	//   p > xs  =>  rs^2 > xs  (otherwise xs would be strictly closer to rs^2)
	//   p < xs  =>  rs^2 < xs
	//   p === xs => rs^2 - xs === err exactly
	let cmp = 0
	if (p !== xs) {
		cmp = p > xs ? 1 : -1
	} else if (err > 0) {
		cmp = 1
	} else if (err < 0) {
		cmp = -1
	}

	let loS = rs
	let hiS = rs
	if (cmp > 0) {
		loS = nextDown(rs)
	} else if (cmp < 0) {
		hiS = nextUp(rs)
	}

	return [loS * unscale, hiS * unscale]
}

/**
 * Precomputed exact outward-rounded square root lower/upper tables for every
 * integer `0 <= n <= PRECOMPUTED_MAX_INT`.
 */
const PRECOMPUTED_SQRT_LO = new Float64Array(PRECOMPUTED_MAX_INT + 1)
const PRECOMPUTED_SQRT_HI = new Float64Array(PRECOMPUTED_MAX_INT + 1)

for (let n = 0; n <= PRECOMPUTED_MAX_INT; n++) {
	const [lo, hi] = computeSqrtBounds(n)
	PRECOMPUTED_SQRT_LO[n] = lo
	PRECOMPUTED_SQRT_HI[n] = hi
}

/** @type {Map<bigint, readonly [number, number]>} */
const intervalCache = new Map()

/** @type {Map<bigint, readonly [number, number]>} */
const endpointCache = new Map()

const stats = {
	intervalCacheHits: 0,
	tableHits: 0,
	endpointCacheHits: 0,
	computations: 0,
}

/**
 * Inserts a key-value pair into a bounded LRU `Map`, evicting the least
 * recently used entry if capacity is reached.
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
 * Resolves the exact outward-rounded lower and upper bounds of `sqrt(x)` using
 * the precomputed integer table first, then the bounded endpoint LRU cache,
 * falling back to `computeSqrtBounds`.
 *
 * @param {number} x - Normalized (+0, finite, >= 0) binary64 number.
 * @param {bigint} bits - Pre-extracted 64-bit IEEE-754 representation of `x`.
 * @returns {readonly [number, number]} Outward-rounded `[sqrtDown(x), sqrtUp(x)]`.
 */
function resolveEndpointBounds(x, bits) {
	if (Number.isInteger(x) && x <= PRECOMPUTED_MAX_INT) {
		stats.tableHits += 1
		return [PRECOMPUTED_SQRT_LO[x], PRECOMPUTED_SQRT_HI[x]]
	}

	const cached = endpointCache.get(bits)
	if (cached !== undefined) {
		stats.endpointCacheHits += 1
		// Refresh LRU recency.
		endpointCache.delete(bits)
		endpointCache.set(bits, cached)
		return cached
	}

	stats.computations += 1
	const computed = Object.freeze(computeSqrtBounds(x))
	lruSet(endpointCache, bits, computed, MAX_ENDPOINT_CACHE_SIZE)
	return computed
}

/**
 * Computes the square root over an interval `[lo, hi]` with true IEEE-754
 * outward rounding guaranteeing enclosure: for every real `x` in `[lo, hi]`,
 * the returned `[rLo, rHi]` satisfies `rLo <= sqrt(x) <= rHi`.
 *
 * Uses a 3-tier table-driven and memoized lookup:
 * 1. Exact bit-keyed bounded LRU interval cache (`[lo, hi]` -> `[rLo, rHi]`).
 * 2. Precomputed `Float64Array` tables for integer endpoints in `[0, 1024]`.
 * 3. Exact bit-keyed bounded LRU endpoint cache backed by Dekker-verified
 *    outward rounding (`nextDown` / `nextUp`).
 *
 * @param {readonly [number, number]} interval - Closed interval `[lo, hi]` with
 *   finite numbers satisfying `0 <= lo <= hi`.
 * @returns {[number, number]} Fresh `[rLo, rHi]` array enclosing `{ sqrt(x) : x in [lo, hi] }`.
 * @throws {TypeError} If `interval` is not a 2-element Array of numbers.
 * @throws {RangeError} If either bound is non-finite (`NaN`/`±Infinity`),
 *   if `lo > hi`, or if `lo < 0` (negative domain error).
 */
export function sqrtIntervalMemo(interval) {
	if (!Array.isArray(interval) || interval.length !== 2) {
		throw new TypeError('Expected interval to be a 2-element array [lo, hi]')
	}

	const rawLo = interval[0]
	const rawHi = interval[1]

	if (typeof rawLo !== 'number' || typeof rawHi !== 'number') {
		throw new TypeError('Interval bounds must be numbers')
	}

	if (!Number.isFinite(rawLo) || !Number.isFinite(rawHi)) {
		throw new RangeError('Interval bounds must be finite numbers')
	}

	if (rawLo > rawHi) {
		throw new RangeError(`Invalid interval: lower bound (${rawLo}) exceeds upper bound (${rawHi})`)
	}

	if (rawLo < 0) {
		throw new RangeError(`sqrt domain error: interval lower bound (${rawLo}) is negative`)
	}

	// Normalize -0 to +0 so canonical keys and outputs never expose -0.
	const lo = rawLo === 0 ? 0 : rawLo
	const hi = rawHi === 0 ? 0 : rawHi

	const loBits = floatToBits(lo)
	const hiBits = floatToBits(hi)
	const intervalKey = (loBits << 64n) | hiBits

	const cached = intervalCache.get(intervalKey)
	if (cached !== undefined) {
		stats.intervalCacheHits += 1
		// Refresh LRU recency.
		intervalCache.delete(intervalKey)
		intervalCache.set(intervalKey, cached)
		return [cached[0], cached[1]]
	}

	const loBounds = resolveEndpointBounds(lo, loBits)
	const hiBounds = loBits === hiBits ? loBounds : resolveEndpointBounds(hi, hiBits)

	const rLo = loBounds[0]
	const rHi = hiBounds[1]
	const entry = Object.freeze([rLo, rHi])

	lruSet(intervalCache, intervalKey, entry, MAX_INTERVAL_CACHE_SIZE)
	return [rLo, rHi]
}

/**
 * Returns a snapshot of internal table and memoization cache statistics.
 *
 * @returns {{
 *   intervalCacheHits: number,
 *   tableHits: number,
 *   endpointCacheHits: number,
 *   computations: number,
 *   intervalCacheSize: number,
 *   endpointCacheSize: number,
 *   precomputedMaxInt: number,
 *   maxIntervalCacheSize: number,
 *   maxEndpointCacheSize: number
 * }}
 */
export function getSqrtIntervalMemoStats() {
	return {
		...stats,
		intervalCacheSize: intervalCache.size,
		endpointCacheSize: endpointCache.size,
		precomputedMaxInt: PRECOMPUTED_MAX_INT,
		maxIntervalCacheSize: MAX_INTERVAL_CACHE_SIZE,
		maxEndpointCacheSize: MAX_ENDPOINT_CACHE_SIZE,
	}
}

/**
 * Clears the dynamic interval and endpoint memoization caches and resets hit
 * counters. The static precomputed integer table remains intact.
 */
export function clearSqrtIntervalMemoCache() {
	intervalCache.clear()
	endpointCache.clear()
	stats.intervalCacheHits = 0
	stats.tableHits = 0
	stats.endpointCacheHits = 0
	stats.computations = 0
}
