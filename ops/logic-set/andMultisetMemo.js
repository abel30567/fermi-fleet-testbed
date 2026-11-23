/**
 * Precomputed counting-logic meet (min) lookup table upper bound.
 * Multiplicity pairs `(a, b)` with `0 <= a, b <= TABLE_MAX` are resolved in O(1)
 * via a flat precomputed `Uint8Array` table.
 */
const TABLE_MAX = 64
const TABLE_STRIDE = TABLE_MAX + 1

/** @type {Uint8Array} */
const MIN_TABLE = new Uint8Array(TABLE_STRIDE * TABLE_STRIDE)
for (let i = 0; i <= TABLE_MAX; i++) {
	const rowOffset = i * TABLE_STRIDE
	for (let j = 0; j <= TABLE_MAX; j++) {
		MIN_TABLE[rowOffset + j] = i < j ? i : j
	}
}

/** Maximum number of memoized multiset intersection entries retained (LRU). */
const MAX_CACHE_SIZE = 512

/** @type {Map<string, Map<any, number>>} */
const memoCache = new Map()

/** @type {WeakMap<object | symbol, number>} */
const refIds = new WeakMap()
let nextRefId = 1

let cacheHits = 0
let cacheMisses = 0

/**
 * Resolve `min(a, b)` using the precomputed table when both counts fit in
 * `[0, TABLE_MAX]`, falling back to direct comparison for larger safe integers.
 *
 * @param {number} a - Non-negative safe integer count.
 * @param {number} b - Non-negative safe integer count.
 * @returns {number} The minimum of `a` and `b`.
 */
function minCount(a, b) {
	if (a <= TABLE_MAX && b <= TABLE_MAX) {
		return MIN_TABLE[a * TABLE_STRIDE + b]
	}
	return a < b ? a : b
}

/**
 * Validate that an input is a `Map` whose values are non-negative safe integers.
 *
 * @param {unknown} input - Candidate multiset.
 * @param {string} paramName - Parameter name for error messages.
 * @throws {TypeError} If `input` is not a `Map` or any count is not a number.
 * @throws {RangeError} If any count is negative, non-integer, or not a safe integer.
 */
function validateMultiset(input, paramName) {
	if (!(input instanceof Map)) {
		throw new TypeError(`${paramName} must be a Map`)
	}
	for (const [, count] of input) {
		if (typeof count !== 'number') {
			throw new TypeError(`${paramName} counts must be numbers`)
		}
		if (!Number.isSafeInteger(count) || count < 0) {
			throw new RangeError(
				`${paramName} counts must be non-negative safe integers`,
			)
		}
	}
}

/**
 * Encode any JavaScript `Map` key into a collision-free canonical string token
 * matching `Map` SameValueZero key equality.
 *
 * @param {unknown} key - Key from a `Map`.
 * @returns {string} Canonical token representing `key`.
 */
function encodeKey(key) {
	if (key === null) return 'N'
	const type = typeof key
	switch (type) {
		case 'undefined':
			return 'u'
		case 'boolean':
			return key ? 'B:1' : 'B:0'
		case 'number':
			if (Number.isNaN(key)) return 'n:NaN'
			return key === 0 ? 'n:0' : `n:${key}`
		case 'bigint':
			return `I:${key}`
		case 'string':
			return `s:${JSON.stringify(key)}`
		case 'symbol': {
			const globalKey = Symbol.keyFor(key)
			if (globalKey !== undefined) {
				return `S:${JSON.stringify(globalKey)}`
			}
			let id = refIds.get(key)
			if (id === undefined) {
				id = nextRefId++
				refIds.set(key, id)
			}
			return `y:${id}`
		}
		case 'object':
		case 'function': {
			let id = refIds.get(key)
			if (id === undefined) {
				id = nextRefId++
				refIds.set(key, id)
			}
			return `o:${id}`
		}
		default:
			throw new TypeError(`Unsupported key type: ${type}`)
	}
}

/**
 * Produce an order-independent, collision-free canonical signature for a
 * validated multiset (ignoring zero-count entries).
 *
 * @param {Map<any, number>} multiset - Validated multiset.
 * @returns {string} Canonical signature string.
 */
function multisetSignature(multiset) {
	/** @type {Array<[string, number]>} */
	const entries = []
	for (const [key, count] of multiset) {
		if (count > 0) {
			entries.push([encodeKey(key), count])
		}
	}
	if (entries.length === 0) return ''
	entries.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))
	let sig = ''
	for (let i = 0; i < entries.length; i++) {
		const [ek, count] = entries[i]
		sig += `${ek.length}:${ek}=${count};`
	}
	return sig
}

/**
 * Compute the counting-logic AND (multiset intersection / meet) of two
 * multisets represented as `Map<value, count>`, using a precomputed lookup
 * table for small multiplicities (`0..64`) and a bounded commutative LRU
 * memoization cache.
 *
 * For each element `x`, its output multiplicity is `min(a(x), b(x))`, where
 * absent keys have implicit multiplicity `0`. Only elements with positive
 * resulting multiplicity (`> 0`) are included in the returned `Map`.
 *
 * Inputs are never mutated, and each call returns a fresh `Map` so caller
 * mutations cannot corrupt the internal memoization cache.
 *
 * @template T
 * @param {Map<T, number>} a - First multiset mapping values to non-negative safe integer counts.
 * @param {Map<T, number>} b - Second multiset mapping values to non-negative safe integer counts.
 * @returns {Map<T, number>} New multiset containing the intersection `a ∧ b` with positive counts.
 * @throws {TypeError} If `a` or `b` is not a `Map`, or if any count is not a number.
 * @throws {RangeError} If any count is negative, non-integer, `NaN`, infinite, or exceeds `Number.MAX_SAFE_INTEGER`.
 */
export function andMultisetMemo(a, b) {
	validateMultiset(a, 'a')
	validateMultiset(b, 'b')

	const sigA = multisetSignature(a)
	const sigB = multisetSignature(b)
	const first = sigA <= sigB ? sigA : sigB
	const second = sigA <= sigB ? sigB : sigA
	const memoKey = `${first.length}:${first}|${second}`

	if (memoCache.has(memoKey)) {
		cacheHits++
		const cached = memoCache.get(memoKey)
		memoCache.delete(memoKey)
		memoCache.set(memoKey, cached)
		return new Map(cached)
	}

	cacheMisses++
	const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a]
	const result = new Map()

	for (const [key, countA] of smaller) {
		if (countA === 0) continue
		const countB = larger.get(key)
		if (countB === undefined || countB === 0) continue
		const count = minCount(countA, countB)
		if (count > 0) {
			result.set(key, count)
		}
	}

	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value
		memoCache.delete(oldestKey)
	}
	memoCache.set(memoKey, result)

	return new Map(result)
}

/**
 * Clear the internal memoization cache and reset hit/miss counters.
 */
andMultisetMemo.clearCache = function clearCache() {
	memoCache.clear()
	cacheHits = 0
	cacheMisses = 0
}

/**
 * Return a snapshot of memoization cache and lookup-table statistics.
 *
 * @returns {{ size: number, maxSize: number, hits: number, misses: number, tableMax: number }}
 */
andMultisetMemo.getCacheStats = function getCacheStats() {
	return {
		size: memoCache.size,
		maxSize: MAX_CACHE_SIZE,
		hits: cacheHits,
		misses: cacheMisses,
		tableMax: TABLE_MAX,
	}
}
