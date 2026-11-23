/**
 * Precomputed product lookup table for small integers in [-32, 32].
 * Stored in a flat IEEE-754 Float64Array for O(1) cache-friendly access.
 */
const TABLE_MIN = -32
const TABLE_MAX = 32
const TABLE_SPAN = TABLE_MAX - TABLE_MIN + 1
const PRODUCT_TABLE = new Float64Array(TABLE_SPAN * TABLE_SPAN)

for (let i = TABLE_MIN; i <= TABLE_MAX; i++) {
	const rowOffset = (i - TABLE_MIN) * TABLE_SPAN
	for (let j = TABLE_MIN; j <= TABLE_MAX; j++) {
		PRODUCT_TABLE[rowOffset + (j - TABLE_MIN)] = i * j
	}
}

/**
 * Bounded LRU memoization cache for vector dot products.
 * Keys encode exact canonical IEEE-754 float64 bit patterns.
 */
const MAX_CACHE_SIZE = 1024
const MAX_MEMO_VECTOR_LENGTH = 1024
const memoCache = new Map()

const _f64Scratch = new Float64Array(1)
const _u64Scratch = new BigUint64Array(_f64Scratch.buffer)

/**
 * Checks whether a value is a supported numeric vector (Array or Float64Array).
 * @param {unknown} value
 * @returns {value is (number[] | Float64Array)}
 */
function isSupportedVector(value) {
	return Array.isArray(value) || value instanceof Float64Array
}

/**
 * Validates that a vector contains only finite IEEE-754 float64 numbers.
 * @param {number[] | Float64Array} vec
 * @param {string} name
 */
function validateElements(vec, name) {
	for (let i = 0; i < vec.length; i++) {
		const val = vec[i]
		if (typeof val !== 'number') {
			throw new TypeError(`${name}[${i}] must be a number`)
		}
		if (!Number.isFinite(val)) {
			throw new RangeError(`${name}[${i}] must be a finite IEEE-754 float64 number`)
		}
	}
}

/**
 * Encodes a vector into a collision-free canonical bit-pattern key.
 * Normalizes -0 to +0 since (-0) * x and (+0) * x contribute identically to sums.
 * @param {number[] | Float64Array} vec
 * @returns {string}
 */
function encodeVectorKey(vec) {
	const parts = new Array(vec.length)
	for (let i = 0; i < vec.length; i++) {
		const v = vec[i]
		_f64Scratch[0] = v === 0 ? 0 : v
		parts[i] = _u64Scratch[0].toString(36)
	}
	return parts.join(',')
}

/**
 * Builds a symmetric canonical cache key for a pair of vectors.
 * Because dot product is commutative (a · b === b · a), both argument orders share one entry.
 * @param {number[] | Float64Array} a
 * @param {number[] | Float64Array} b
 * @returns {string}
 */
function makeCacheKey(a, b) {
	const keyA = encodeVectorKey(a)
	const keyB = encodeVectorKey(b)
	return keyA <= keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`
}

/**
 * Multiplies two finite IEEE-754 float64 numbers, using the precomputed table
 * for integers in [TABLE_MIN, TABLE_MAX].
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function lookupProduct(x, y) {
	if (
		Number.isInteger(x) &&
		Number.isInteger(y) &&
		x >= TABLE_MIN &&
		x <= TABLE_MAX &&
		y >= TABLE_MIN &&
		y <= TABLE_MAX
	) {
		return PRODUCT_TABLE[(x - TABLE_MIN) * TABLE_SPAN + (y - TABLE_MIN)]
	}
	return x * y
}

/**
 * Computes the dot product of two vectors over IEEE-754 float64 numbers
 * using a precomputed small-integer product table, bounded LRU memoization
 * keyed by exact float64 bit patterns, and Neumaier compensated summation.
 *
 * @param {number[] | Float64Array} a - First input vector of finite float64 numbers.
 * @param {number[] | Float64Array} b - Second input vector of finite float64 numbers (same length as `a`).
 * @returns {number} The scalar dot product `sum(a[i] * b[i])` as an IEEE-754 float64 number (`0` for empty vectors).
 * @throws {TypeError} If either argument is not an Array or Float64Array, or contains a non-number element.
 * @throws {RangeError} If the vectors have different lengths, or contain NaN or ±Infinity.
 */
export function dotProductFloatMemo(a, b) {
	if (!isSupportedVector(a)) {
		throw new TypeError('First argument must be an Array or Float64Array')
	}
	if (!isSupportedVector(b)) {
		throw new TypeError('Second argument must be an Array or Float64Array')
	}
	const n = a.length
	if (n !== b.length) {
		throw new RangeError(`Vector length mismatch: expected ${n}, got ${b.length}`)
	}

	validateElements(a, 'a')
	validateElements(b, 'b')

	if (n === 0) {
		return 0
	}

	const canMemoize = n <= MAX_MEMO_VECTOR_LENGTH
	let cacheKey = ''
	if (canMemoize) {
		cacheKey = makeCacheKey(a, b)
		if (memoCache.has(cacheKey)) {
			const cached = memoCache.get(cacheKey)
			// Refresh recency for LRU eviction policy.
			memoCache.delete(cacheKey)
			memoCache.set(cacheKey, cached)
			return cached
		}
	}

	// Neumaier compensated summation using precomputed product lookups.
	let sum = 0
	let compensation = 0
	for (let i = 0; i < n; i++) {
		const prod = lookupProduct(a[i], b[i])
		const t = sum + prod
		if (Number.isFinite(t)) {
			if (Math.abs(sum) >= Math.abs(prod)) {
				compensation += (sum - t) + prod
			} else {
				compensation += (prod - t) + sum
			}
		} else {
			compensation = 0
		}
		sum = t
	}

	const rawResult = sum + compensation
	const result = rawResult === 0 ? 0 : rawResult

	if (canMemoize) {
		if (memoCache.size >= MAX_CACHE_SIZE) {
			const oldestKey = memoCache.keys().next().value
			memoCache.delete(oldestKey)
		}
		memoCache.set(cacheKey, result)
	}

	return result
}
