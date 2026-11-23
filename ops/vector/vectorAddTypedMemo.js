/**
 * Element-wise vector addition over `Float64Array` inputs using a precomputed
 * small-integer addition lookup table and bounded LRU memoization cache.
 *
 * All returned `Float64Array` instances are freshly allocated copies so that
 * callers can freely mutate results without corrupting cached entries.
 *
 * @module ops/vector/vectorAddTypedMemo
 */

const TABLE_MIN = -64
const TABLE_MAX = 64
const TABLE_SPAN = TABLE_MAX - TABLE_MIN + 1

/**
 * Precomputed lookup table for exact integer additions in [TABLE_MIN, TABLE_MAX].
 * @type {Float64Array}
 */
const SMALL_INT_ADD_TABLE = (() => {
	const table = new Float64Array(TABLE_SPAN * TABLE_SPAN)
	for (let x = TABLE_MIN; x <= TABLE_MAX; x++) {
		const rowOffset = (x - TABLE_MIN) * TABLE_SPAN
		for (let y = TABLE_MIN; y <= TABLE_MAX; y++) {
			table[rowOffset + (y - TABLE_MIN)] = x + y
		}
	}
	return table
})()

const MAX_CACHE_ENTRIES = 512
const MAX_CACHED_LENGTH = 4096

/**
 * Bounded LRU memoization cache mapping canonical bit-level vector pair keys
 * to internally owned `Float64Array` result buffers.
 * @type {Map<string, Float64Array>}
 */
const memoCache = new Map()

/**
 * Validates that a value is a live (non-detached) `Float64Array`.
 *
 * @param {unknown} value - Candidate operand.
 * @param {string} name - Parameter name for error messages.
 * @throws {TypeError} If `value` is not a `Float64Array` or its buffer is detached.
 */
function assertFloat64Array(value, name) {
	if (!(value instanceof Float64Array)) {
		throw new TypeError(`${name} must be a Float64Array`)
	}
	if (value.buffer.detached) {
		throw new TypeError(`${name} has a detached ArrayBuffer`)
	}
}

/**
 * Encodes a `Float64Array` into an exact bit-level string key that preserves
 * IEEE 754 semantics (including distinguishing `-0` from `+0`, subnormals,
 * infinities, and `NaN`).
 *
 * @param {Float64Array} vec - Vector to encode.
 * @returns {string} Exact bit-level key.
 */
function encodeVectorKey(vec) {
	const len = vec.length
	if (len === 0) {
		return ''
	}
	const bits = new BigUint64Array(vec.buffer, vec.byteOffset, len)
	let key = bits[0].toString(36)
	for (let i = 1; i < len; i++) {
		key += ',' + bits[i].toString(36)
	}
	return key
}

/**
 * Builds a canonical commutative cache key for an ordered pair of vectors.
 * Because IEEE 754 float64 addition is commutative (`a + b` and `b + a` yield
 * identical values including signed zeros, infinities, and NaN), sorting the
 * two vector encodings allows symmetric cache hits.
 *
 * @param {Float64Array} a - First input vector.
 * @param {Float64Array} b - Second input vector.
 * @returns {string} Canonical cache key.
 */
function buildCacheKey(a, b) {
	const keyA = encodeVectorKey(a)
	const keyB = encodeVectorKey(b)
	return keyA <= keyB ? `${a.length}:${keyA}|${keyB}` : `${a.length}:${keyB}|${keyA}`
}

/**
 * Checks whether a number is a positive-zero or non-zero integer within the
 * precomputed lookup table bounds `[TABLE_MIN, TABLE_MAX]`.
 * Excludes `-0` so that `(-0) + (-0)` preserves IEEE 754 `-0`.
 *
 * @param {number} n - Value to test.
 * @returns {boolean} True when eligible for table lookup.
 */
function isTableEligible(n) {
	return (
		(n | 0) === n &&
		n >= TABLE_MIN &&
		n <= TABLE_MAX &&
		(n !== 0 || 1 / n > 0)
	)
}

/**
 * Computes element-wise vector addition over two `Float64Array` inputs using
 * a precomputed small-integer table and a bounded LRU memoization cache.
 *
 * @param {Float64Array} a - First input vector.
 * @param {Float64Array} b - Second input vector (must have the same length as `a`).
 * @returns {Float64Array} A newly allocated `Float64Array` where `out[i] = a[i] + b[i]`.
 * @throws {TypeError} If `a` or `b` is not a live `Float64Array`.
 * @throws {RangeError} If `a.length !== b.length`.
 */
export function vectorAddTypedMemo(a, b) {
	assertFloat64Array(a, 'a')
	assertFloat64Array(b, 'b')

	const len = a.length
	if (len !== b.length) {
		throw new RangeError(
			`Vector length mismatch: a.length (${len}) !== b.length (${b.length})`,
		)
	}

	if (len === 0) {
		return new Float64Array(0)
	}

	const cacheable = len <= MAX_CACHED_LENGTH
	let cacheKey = ''

	if (cacheable) {
		cacheKey = buildCacheKey(a, b)
		const cached = memoCache.get(cacheKey)
		if (cached !== undefined) {
			// Refresh LRU recency
			memoCache.delete(cacheKey)
			memoCache.set(cacheKey, cached)
			return new Float64Array(cached)
		}
	}

	const result = new Float64Array(len)
	for (let i = 0; i < len; i++) {
		const x = a[i]
		const y = b[i]
		if (isTableEligible(x) && isTableEligible(y)) {
			result[i] = SMALL_INT_ADD_TABLE[(x - TABLE_MIN) * TABLE_SPAN + (y - TABLE_MIN)]
		} else {
			result[i] = x + y
		}
	}

	if (cacheable) {
		if (memoCache.size >= MAX_CACHE_ENTRIES) {
			const oldestKey = memoCache.keys().next().value
			memoCache.delete(oldestKey)
		}
		// Store private copy so caller can never mutate the cached buffer
		memoCache.set(cacheKey, new Float64Array(result))
	}

	return result
}
