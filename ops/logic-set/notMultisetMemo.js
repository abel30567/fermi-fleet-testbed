/**
 * Table-driven and memoized counting-logic NOT (multiset complement).
 *
 * Given an input multiset `A` and a universe multiset `U` (both represented as
 * `Map<value, count>` with non-negative safe integer counts), computes:
 *
 *   NOT_U(A)(x) = max(0, U(x) - A(x))
 *
 * Entries whose resulting count is `0` are omitted from the returned `Map`.
 *
 * Performance strategy:
 * 1. A precomputed flat `Uint8Array` lookup table resolves all `(uCount, aCount)`
 *    pairs within `[0, TABLE_LIMIT]` in O(1) without branching.
 * 2. A bounded LRU memoization cache keyed by a collision-free canonical
 *    structural representation avoids recomputation across identical or
 *    structurally equivalent `(multiset, universe)` inputs while returning
 *    fresh `Map` clones so caller mutations never corrupt cached entries.
 */

const TABLE_LIMIT = 64
const TABLE_STRIDE = TABLE_LIMIT + 1
const DEFAULT_MAX_CACHE_SIZE = 1024

/** @type {Uint8Array} Precomputed lookup table for max(0, u - a) when 0 <= u, a <= TABLE_LIMIT. */
const NOT_COUNT_TABLE = new Uint8Array(TABLE_STRIDE * TABLE_STRIDE)

for (let u = 0; u <= TABLE_LIMIT; u += 1) {
	const rowOffset = u * TABLE_STRIDE
	for (let a = 0; a <= TABLE_LIMIT; a += 1) {
		NOT_COUNT_TABLE[rowOffset + a] = u > a ? u - a : 0
	}
}

/** @type {Map<string, Map<any, number>>} */
const defaultCache = new Map()

/** @type {WeakMap<object | symbol, number>} */
const refIds = new WeakMap()
let nextRefId = 1

const stats = {
	hits: 0,
	misses: 0,
	tableHits: 0,
	tableFallbacks: 0,
}

/**
 * Validates that an argument is a `Map` containing only non-negative safe integer counts.
 *
 * @param {unknown} input - Value to validate.
 * @param {string} name - Parameter name used in error messages.
 * @returns {Map<any, number>}
 */
function validateMultiset(input, name) {
	if (!(input instanceof Map)) {
		throw new TypeError(`${name} must be a Map`)
	}
	for (const [, count] of input) {
		if (typeof count !== 'number') {
			throw new TypeError(`${name} counts must be numbers, got ${typeof count}`)
		}
		if (!Number.isFinite(count) || !Number.isSafeInteger(count) || count < 0) {
			throw new RangeError(`${name} counts must be non-negative safe integers, got ${count}`)
		}
	}
	return input
}

/**
 * Validates optional configuration for `notMultisetMemo`.
 *
 * @param {unknown} options
 * @returns {{ cache: Map<string, Map<any, number>>, maxCacheSize: number, isDefaultCache: boolean }}
 */
function validateOptions(options) {
	if (options === undefined) {
		return {
			cache: defaultCache,
			maxCacheSize: DEFAULT_MAX_CACHE_SIZE,
			isDefaultCache: true,
		}
	}
	if (options === null || typeof options !== 'object' || Array.isArray(options)) {
		throw new TypeError('options must be a plain object')
	}

	const { cache = defaultCache, maxCacheSize = DEFAULT_MAX_CACHE_SIZE } = options

	if (!(cache instanceof Map)) {
		throw new TypeError('options.cache must be a Map')
	}
	if (typeof maxCacheSize !== 'number') {
		throw new TypeError(`options.maxCacheSize must be a number, got ${typeof maxCacheSize}`)
	}
	if (!Number.isFinite(maxCacheSize) || !Number.isSafeInteger(maxCacheSize) || maxCacheSize < 0) {
		throw new RangeError(
			`options.maxCacheSize must be a non-negative safe integer, got ${maxCacheSize}`
		)
	}

	return {
		cache,
		maxCacheSize,
		isDefaultCache: cache === defaultCache,
	}
}

/**
 * Assigns a stable, collision-free tag to any JavaScript `Map` key, respecting
 * SameValueZero equality (`-0` equals `+0`, `NaN` equals `NaN`).
 *
 * @param {any} key
 * @returns {string}
 */
function encodeKey(key) {
	if (key === null) return 'l'
	const type = typeof key
	switch (type) {
		case 'string':
			return `s:${JSON.stringify(key)}`
		case 'number':
			if (Number.isNaN(key)) return 'n:NaN'
			return key === 0 ? 'n:0' : `n:${String(key)}`
		case 'bigint':
			return `b:${key.toString()}`
		case 'boolean':
			return key ? 't' : 'f'
		case 'undefined':
			return 'u'
		case 'symbol': {
			const globalKey = Symbol.keyFor(key)
			if (globalKey !== undefined) {
				return `S:${JSON.stringify(globalKey)}`
			}
			let id = refIds.get(key)
			if (id === undefined) {
				id = nextRefId
				nextRefId += 1
				refIds.set(key, id)
			}
			return `y:${id}`
		}
		case 'object':
		case 'function': {
			let id = refIds.get(key)
			if (id === undefined) {
				id = nextRefId
				nextRefId += 1
				refIds.set(key, id)
			}
			return `o:${id}`
		}
		default:
			throw new TypeError(`Unsupported key type: ${type}`)
	}
}

/**
 * Produces an order-independent canonical string key for a validated multiset.
 * Entries with count `0` are omitted because count `0` represents absence.
 *
 * @param {Map<any, number>} map
 * @returns {string}
 */
function canonicalizeMultiset(map) {
	if (map.size === 0) return ''
	/** @type {string[]} */
	const parts = []
	for (const [key, count] of map) {
		if (count > 0) {
			parts.push(`${encodeKey(key)}=${count}`)
		}
	}
	if (parts.length === 0) return ''
	parts.sort()
	return parts.join('\x00')
}

/**
 * Computes counting-logic negation for a single `(uCount, aCount)` pair using
 * the precomputed lookup table for counts within `[0, TABLE_LIMIT]` and exact
 * safe-integer subtraction beyond the table boundary.
 *
 * @param {number} uCount
 * @param {number} aCount
 * @returns {number}
 */
function negateCount(uCount, aCount) {
	if (uCount <= TABLE_LIMIT && aCount <= TABLE_LIMIT) {
		stats.tableHits += 1
		return NOT_COUNT_TABLE[uCount * TABLE_STRIDE + aCount]
	}
	stats.tableFallbacks += 1
	return uCount > aCount ? uCount - aCount : 0
}

/**
 * Computes the counting-logic NOT (complement) of `multiset` with respect to `universe`.
 *
 * For every element `x` in `universe`, the output multiplicity is
 * `max(0, universe.get(x) - (multiset.get(x) ?? 0))`. Elements with resulting
 * multiplicity `0` are omitted from the returned `Map`.
 *
 * Results are memoized structurally in a bounded LRU cache and small count
 * differences are resolved via a precomputed lookup table. Always returns a
 * fresh `Map` instance so caller mutations cannot affect the memoization cache.
 *
 * @template K
 * @param {Map<K, number>} multiset - Input multiset as `Map<value, count>`.
 * @param {Map<K, number>} universe - Universe multiset as `Map<value, count>`.
 * @param {{ cache?: Map<string, Map<K, number>>, maxCacheSize?: number }} [options] - Optional memoization controls.
 * @returns {Map<K, number>} Complement multiset with positive counts only.
 * @throws {TypeError} If `multiset`, `universe`, `options`, or any count has an invalid type.
 * @throws {RangeError} If any count or `maxCacheSize` is negative, non-integer, non-finite, or unsafe.
 */
export function notMultisetMemo(multiset, universe, options) {
	validateMultiset(multiset, 'multiset')
	validateMultiset(universe, 'universe')
	const { cache, maxCacheSize, isDefaultCache } = validateOptions(options)

	const cacheKey = `${canonicalizeMultiset(multiset)}\x01${canonicalizeMultiset(universe)}`

	if (maxCacheSize > 0) {
		const cached = cache.get(cacheKey)
		if (cached !== undefined) {
			cache.delete(cacheKey)
			cache.set(cacheKey, cached)
			if (isDefaultCache) stats.hits += 1
			return new Map(cached)
		}
	}

	if (isDefaultCache) stats.misses += 1

	/** @type {Map<any, number>} */
	const result = new Map()
	for (const [key, uCount] of universe) {
		if (uCount === 0) continue
		const aCount = multiset.get(key) ?? 0
		const diff = negateCount(uCount, aCount)
		if (diff > 0) {
			result.set(key, diff)
		}
	}

	if (maxCacheSize > 0) {
		while (cache.size >= maxCacheSize) {
			const oldestKey = cache.keys().next().value
			cache.delete(oldestKey)
		}
		cache.set(cacheKey, result)
	}

	return new Map(result)
}

/**
 * Clears the internal default memoization cache and resets telemetry counters.
 */
notMultisetMemo.clearCache = function clearCache() {
	defaultCache.clear()
	stats.hits = 0
	stats.misses = 0
	stats.tableHits = 0
	stats.tableFallbacks = 0
}

/**
 * Returns a snapshot of internal memoization and lookup-table statistics.
 *
 * @returns {{ hits: number, misses: number, size: number, tableHits: number, tableFallbacks: number, tableLimit: number }}
 */
notMultisetMemo.getStats = function getStats() {
	return {
		hits: stats.hits,
		misses: stats.misses,
		size: defaultCache.size,
		tableHits: stats.tableHits,
		tableFallbacks: stats.tableFallbacks,
		tableLimit: TABLE_LIMIT,
	}
}
