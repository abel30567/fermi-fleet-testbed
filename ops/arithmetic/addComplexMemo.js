/**
 * @typedef {Object} Complex
 * @property {number} re - Real part (finite number).
 * @property {number} im - Imaginary part (finite number).
 */

/**
 * Half-width of the precomputed integer addition table: covers integers in [-16, 16].
 */
const TABLE_BOUND = 16
const TABLE_SPAN = TABLE_BOUND * 2 + 1 // 33

/**
 * Precomputed 2D lookup table (flattened) for adding two integers in [-TABLE_BOUND, TABLE_BOUND].
 * Entry at `(x + TABLE_BOUND) * TABLE_SPAN + (y + TABLE_BOUND)` stores `x + y`.
 */
const INT_ADD_TABLE = (() => {
	const table = new Int8Array(TABLE_SPAN * TABLE_SPAN)
	for (let x = -TABLE_BOUND; x <= TABLE_BOUND; x++) {
		const rowOffset = (x + TABLE_BOUND) * TABLE_SPAN
		for (let y = -TABLE_BOUND; y <= TABLE_BOUND; y++) {
			table[rowOffset + (y + TABLE_BOUND)] = x + y
		}
	}
	return table
})()

/**
 * Maximum number of entries retained in the memoization cache before LRU eviction.
 */
const MAX_CACHE_SIZE = 4096

/** @type {Map<string, Readonly<Complex>>} */
const memoCache = new Map()

let cacheHits = 0
let cacheMisses = 0
let tableLookups = 0

/**
 * Normalize `-0` to `+0`.
 *
 * @param {number} n
 * @returns {number}
 */
function normalizeZero(n) {
	return n === 0 ? 0 : n
}

/**
 * Validate a complex number input `{ re, im }`.
 *
 * @param {unknown} value
 * @param {string} name
 * @returns {Complex}
 */
function validateComplex(value, name) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw new TypeError(`${name} must be an object with finite numeric { re, im } properties`)
	}
	const { re, im } = /** @type {Record<string, unknown>} */ (value)
	if (typeof re !== 'number') {
		throw new TypeError(`${name}.re must be a number`)
	}
	if (typeof im !== 'number') {
		throw new TypeError(`${name}.im must be a number`)
	}
	if (!Number.isFinite(re)) {
		throw new RangeError(`${name}.re must be a finite number`)
	}
	if (!Number.isFinite(im)) {
		throw new RangeError(`${name}.im must be a finite number`)
	}
	return { re: normalizeZero(re), im: normalizeZero(im) }
}

/**
 * Add two finite real components using the precomputed table when both are small integers.
 *
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function addComponent(x, y) {
	if (
		Number.isInteger(x) &&
		Number.isInteger(y) &&
		x >= -TABLE_BOUND &&
		x <= TABLE_BOUND &&
		y >= -TABLE_BOUND &&
		y <= TABLE_BOUND
	) {
		tableLookups++
		return INT_ADD_TABLE[(x + TABLE_BOUND) * TABLE_SPAN + (y + TABLE_BOUND)]
	}
	return normalizeZero(x + y)
}

/**
 * Build a canonical commutative cache key for a pair of normalized complex numbers.
 * Because finite floating-point addition is commutative, `(a, b)` and `(b, a)` share one entry.
 *
 * @param {Complex} a
 * @param {Complex} b
 * @returns {string}
 */
function makeCacheKey(a, b) {
	const aFirst = a.re < b.re || (a.re === b.re && a.im <= b.im)
	const first = aFirst ? a : b
	const second = aFirst ? b : a
	return `${first.re},${first.im}|${second.re},${second.im}`
}

/**
 * Add two complex numbers represented as `{ re, im }` using a hybrid precomputed
 * lookup table (for small integer components in `[-16, 16]`) and a bounded LRU
 * memoization cache (with canonical commutative keys).
 *
 * Returns a fresh `{ re, im }` object on every call so caller mutations cannot
 * corrupt the internal cache.
 *
 * @param {Complex} a - First complex addend `{ re, im }`.
 * @param {Complex} b - Second complex addend `{ re, im }`.
 * @returns {Complex} The complex sum `{ re: a.re + b.re, im: a.im + b.im }`.
 * @throws {TypeError} If either argument is not an object with numeric `re` and `im` properties.
 * @throws {RangeError} If any component is non-finite (`NaN`, `±Infinity`) or if the sum overflows.
 */
export function addComplexMemo(a, b) {
	const ca = validateComplex(a, 'a')
	const cb = validateComplex(b, 'b')

	const key = makeCacheKey(ca, cb)
	const cached = memoCache.get(key)
	if (cached !== undefined) {
		// Refresh LRU position
		memoCache.delete(key)
		memoCache.set(key, cached)
		cacheHits++
		return { re: cached.re, im: cached.im }
	}

	cacheMisses++
	const re = addComponent(ca.re, cb.re)
	const im = addComponent(ca.im, cb.im)

	if (!Number.isFinite(re) || !Number.isFinite(im)) {
		throw new RangeError('Complex sum overflowed finite floating-point range')
	}

	const result = Object.freeze({ re, im })
	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value
		if (oldestKey !== undefined) {
			memoCache.delete(oldestKey)
		}
	}
	memoCache.set(key, result)

	return { re: result.re, im: result.im }
}

/**
 * Clear the internal memoization cache and reset statistics counters.
 */
addComplexMemo.clearCache = function clearCache() {
	memoCache.clear()
	cacheHits = 0
	cacheMisses = 0
	tableLookups = 0
}

/**
 * Return a snapshot of memoization and precomputed-table usage statistics.
 *
 * @returns {{ size: number, maxSize: number, hits: number, misses: number, tableLookups: number, tableBound: number }}
 */
addComplexMemo.getStats = function getStats() {
	return {
		size: memoCache.size,
		maxSize: MAX_CACHE_SIZE,
		hits: cacheHits,
		misses: cacheMisses,
		tableLookups,
		tableBound: TABLE_BOUND,
	}
}
