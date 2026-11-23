/**
 * Element-wise multiplication over `Float64Array` inputs using a precomputed
 * small-integer multiplication table combined with bit-exact LRU memoization.
 *
 * @module ops/arithmetic/multiplyTypedMemo
 */

const TABLE_MIN = -64;
const TABLE_MAX = 64;
const TABLE_SPAN = TABLE_MAX - TABLE_MIN + 1; // 129
const TABLE_OFFSET = -TABLE_MIN; // 64

const DEFAULT_MAX_CACHE_SIZE = 256;
const DEFAULT_MAX_CACHEABLE_LENGTH = 4096;
const CANONICAL_NAN_BITS = 0x7ff8000000000000n;

/**
 * Precomputed multiplication table for integer pairs in [TABLE_MIN, TABLE_MAX].
 * Indexed as `(x + TABLE_OFFSET) * TABLE_SPAN + (y + TABLE_OFFSET)`.
 * @type {Float64Array}
 */
const SMALL_INT_TABLE = (() => {
	const table = new Float64Array(TABLE_SPAN * TABLE_SPAN);
	for (let x = TABLE_MIN; x <= TABLE_MAX; x++) {
		const rowOffset = (x + TABLE_OFFSET) * TABLE_SPAN;
		for (let y = TABLE_MIN; y <= TABLE_MAX; y++) {
			table[rowOffset + (y + TABLE_OFFSET)] = x * y;
		}
	}
	return table;
})();

/** @type {Map<string, Float64Array>} */
const defaultCache = new Map();

const stats = {
	hits: 0,
	misses: 0,
	tableHits: 0,
	computed: 0,
};

/**
 * Builds a bit-exact cache key for a pair of equal-length Float64Arrays.
 * Distinguishes +0 from -0 and canonicalizes NaN payloads.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {string}
 */
function buildCacheKey(a, b) {
	const len = a.length;
	if (len === 0) {
		return '0:';
	}
	const aBits = new BigUint64Array(a.buffer, a.byteOffset, len);
	const bBits = new BigUint64Array(b.buffer, b.byteOffset, len);
	const parts = new Array(len * 2 + 1);
	parts[0] = String(len);
	for (let i = 0; i < len; i++) {
		const aNorm = Number.isNaN(a[i]) ? CANONICAL_NAN_BITS : aBits[i];
		const bNorm = Number.isNaN(b[i]) ? CANONICAL_NAN_BITS : bBits[i];
		parts[i + 1] = aNorm.toString(36);
		parts[len + i + 1] = bNorm.toString(36);
	}
	return parts.join(',');
}

/**
 * Validates and normalizes the optional configuration object.
 *
 * @param {object | undefined} options
 * @returns {{ cache: Map<string, Float64Array>, maxCacheSize: number, maxCacheableLength: number, useCache: boolean }}
 */
function parseOptions(options) {
	if (options === undefined) {
		return {
			cache: defaultCache,
			maxCacheSize: DEFAULT_MAX_CACHE_SIZE,
			maxCacheableLength: DEFAULT_MAX_CACHEABLE_LENGTH,
			useCache: true,
		};
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object when provided');
	}

	const {
		cache = defaultCache,
		maxCacheSize = DEFAULT_MAX_CACHE_SIZE,
		maxCacheableLength = DEFAULT_MAX_CACHEABLE_LENGTH,
		useCache = true,
	} = options;

	if (!(cache instanceof Map)) {
		throw new TypeError('options.cache must be a Map instance');
	}
	if (typeof maxCacheSize !== 'number') {
		throw new TypeError('options.maxCacheSize must be a number');
	}
	if (!Number.isSafeInteger(maxCacheSize) || maxCacheSize < 1) {
		throw new RangeError('options.maxCacheSize must be a positive safe integer');
	}
	if (typeof maxCacheableLength !== 'number') {
		throw new TypeError('options.maxCacheableLength must be a number');
	}
	if (!Number.isSafeInteger(maxCacheableLength) || maxCacheableLength < 0) {
		throw new RangeError('options.maxCacheableLength must be a non-negative safe integer');
	}
	if (typeof useCache !== 'boolean') {
		throw new TypeError('options.useCache must be a boolean');
	}

	return { cache, maxCacheSize, maxCacheableLength, useCache };
}

/**
 * Stores a value in a bounded LRU Map cache.
 *
 * @param {Map<string, Float64Array>} cache
 * @param {string} key
 * @param {Float64Array} value
 * @param {number} maxCacheSize
 */
function lruSet(cache, key, value, maxCacheSize) {
	if (cache.has(key)) {
		cache.delete(key);
	} else {
		while (cache.size >= maxCacheSize) {
			const oldestKey = cache.keys().next().value;
			cache.delete(oldestKey);
		}
	}
	cache.set(key, value);
}

/**
 * Multiplies two equal-length `Float64Array` instances element-wise using a
 * precomputed small-integer multiplication table ([-64, 64] excluding ±0)
 * and a bit-exact bounded LRU memoization cache.
 *
 * Preserves full IEEE 754 floating-point semantics including signed zero (-0),
 * NaN, ±Infinity, overflow, and subnormal values. Always returns a fresh
 * `Float64Array` copy so caller mutations cannot corrupt cached results.
 *
 * @param {Float64Array} a - First input Float64Array.
 * @param {Float64Array} b - Second input Float64Array (must match `a.length`).
 * @param {object} [options] - Optional memoization configuration.
 * @param {Map<string, Float64Array>} [options.cache] - Custom Map to store memoized results.
 * @param {number} [options.maxCacheSize=256] - Maximum number of entries in the LRU cache.
 * @param {number} [options.maxCacheableLength=4096] - Maximum array length eligible for caching.
 * @param {boolean} [options.useCache=true] - Whether to read from and write to the memoization cache.
 * @returns {Float64Array} A new Float64Array containing element-wise products `a[i] * b[i]`.
 * @throws {TypeError} If `a` or `b` is not a `Float64Array`, or if an option has an invalid type.
 * @throws {RangeError} If `a` and `b` have different lengths, or if numeric options are out of range.
 */
export function multiplyTypedMemo(a, b, options) {
	if (!(a instanceof Float64Array)) {
		throw new TypeError('First argument must be a Float64Array');
	}
	if (!(b instanceof Float64Array)) {
		throw new TypeError('Second argument must be a Float64Array');
	}
	if (a.length !== b.length) {
		throw new RangeError(
			`Input Float64Arrays must have equal length (received ${a.length} and ${b.length})`,
		);
	}

	const { cache, maxCacheSize, maxCacheableLength, useCache } = parseOptions(options);
	const len = a.length;
	const cacheable = useCache && len <= maxCacheableLength;

	let cacheKey = null;
	if (cacheable) {
		cacheKey = buildCacheKey(a, b);
		const cached = cache.get(cacheKey);
		if (cached !== undefined) {
			// Refresh LRU position
			cache.delete(cacheKey);
			cache.set(cacheKey, cached);
			stats.hits++;
			return new Float64Array(cached);
		}
		stats.misses++;
	}

	const result = new Float64Array(len);
	for (let i = 0; i < len; i++) {
		const x = a[i];
		const y = b[i];
		// Non-zero integers in [TABLE_MIN, TABLE_MAX] avoid ±0 sign subtleties
		// and map directly to the precomputed multiplication table.
		if (
			x !== 0 &&
			y !== 0 &&
			(x | 0) === x &&
			(y | 0) === y &&
			x >= TABLE_MIN &&
			x <= TABLE_MAX &&
			y >= TABLE_MIN &&
			y <= TABLE_MAX
		) {
			result[i] = SMALL_INT_TABLE[(x + TABLE_OFFSET) * TABLE_SPAN + (y + TABLE_OFFSET)];
			stats.tableHits++;
		} else {
			result[i] = x * y;
			stats.computed++;
		}
	}

	if (cacheable) {
		lruSet(cache, cacheKey, new Float64Array(result), maxCacheSize);
	}

	return result;
}

/**
 * Clears the internal memoization cache and resets instrumentation counters.
 */
multiplyTypedMemo.clearCache = function clearCache() {
	defaultCache.clear();
	stats.hits = 0;
	stats.misses = 0;
	stats.tableHits = 0;
	stats.computed = 0;
};

/**
 * Returns a snapshot of memoization and table lookup statistics.
 *
 * @returns {{ hits: number, misses: number, tableHits: number, computed: number, cacheSize: number }}
 */
multiplyTypedMemo.getStats = function getStats() {
	return {
		hits: stats.hits,
		misses: stats.misses,
		tableHits: stats.tableHits,
		computed: stats.computed,
		cacheSize: defaultCache.size,
	};
};

multiplyTypedMemo.TABLE_MIN = TABLE_MIN;
multiplyTypedMemo.TABLE_MAX = TABLE_MAX;
