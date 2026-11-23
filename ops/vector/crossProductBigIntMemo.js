/**
 * Precomputed cyclic index table derived from the 3D Levi-Civita tensor:
 * component k of (a × b) equals a[i] * b[j] - a[j] * b[i] for [i, j] = CROSS_INDEX_TABLE[k].
 * @type {readonly (readonly [number, number])[]}
 */
const CROSS_INDEX_TABLE = Object.freeze([
	Object.freeze([1, 2]),
	Object.freeze([2, 0]),
	Object.freeze([0, 1]),
])

/**
 * Maximum number of memoized vector-pair results retained in the LRU cache.
 */
const MAX_CACHE_SIZE = 4096

/**
 * Bounded LRU memoization table mapping canonical vector-pair keys
 * (`ax,ay,az|bx,by,bz`) to frozen 3-tuples of exact BigInt results.
 * @type {Map<string, readonly [bigint, bigint, bigint]>}
 */
const memoCache = new Map()

/**
 * Validates that an input is a 3-element Array of exact BigInt values.
 *
 * @param {unknown} vec - Candidate vector to validate.
 * @param {string} name - Parameter name for diagnostic error messages.
 * @returns {readonly [bigint, bigint, bigint]}
 */
function validateVector3(vec, name) {
	if (!Array.isArray(vec)) {
		throw new TypeError(`${name} must be an Array of 3 BigInt elements`)
	}
	if (vec.length !== 3) {
		throw new RangeError(`${name} must have length 3, got ${vec.length}`)
	}
	for (let i = 0; i < 3; i++) {
		if (typeof vec[i] !== 'bigint') {
			throw new TypeError(`${name}[${i}] must be a BigInt, got ${typeof vec[i]}`)
		}
	}
	return /** @type {readonly [bigint, bigint, bigint]} */ (vec)
}

/**
 * Builds a collision-free canonical cache key for an ordered pair of 3D BigInt vectors.
 *
 * @param {readonly [bigint, bigint, bigint]} a
 * @param {readonly [bigint, bigint, bigint]} b
 * @returns {string}
 */
function makeKey(a, b) {
	return `${a[0]},${a[1]},${a[2]}|${b[0]},${b[1]},${b[2]}`
}

/**
 * Inserts a result into the bounded LRU cache, evicting the least-recently-used
 * entry when capacity is reached.
 *
 * @param {string} key
 * @param {readonly [bigint, bigint, bigint]} value
 */
function cacheSet(key, value) {
	if (memoCache.has(key)) {
		memoCache.delete(key)
	} else if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value
		if (oldestKey !== undefined) {
			memoCache.delete(oldestKey)
		}
	}
	memoCache.set(key, value)
}

/**
 * Computes the exact 3D vector cross product `a × b` over `BigInt` integers using
 * a table-driven Levi-Civita index table and a bounded LRU memoization cache
 * (including anti-symmetric reverse-pair lookup).
 *
 * Because all input coordinates are exact `BigInt` integers and the 3D cross
 * product uses only integer multiplication and subtraction, every output
 * coordinate is an exact `BigInt` integer with no rounding or precision loss.
 *
 * @param {readonly [bigint, bigint, bigint]} a - First 3D vector of exact BigInt values.
 * @param {readonly [bigint, bigint, bigint]} b - Second 3D vector of exact BigInt values.
 * @returns {[bigint, bigint, bigint]} Exact 3D cross product `[cx, cy, cz]` as a fresh array.
 * @throws {TypeError} If `a` or `b` is not an Array or contains non-BigInt elements.
 * @throws {RangeError} If `a` or `b` does not have length 3.
 */
export function crossProductBigIntMemo(a, b) {
	const va = validateVector3(a, 'a')
	const vb = validateVector3(b, 'b')

	const key = makeKey(va, vb)
	const cached = memoCache.get(key)
	if (cached !== undefined) {
		// Refresh LRU recency
		memoCache.delete(key)
		memoCache.set(key, cached)
		return [cached[0], cached[1], cached[2]]
	}

	// Exploit anti-symmetry: b × a = -(a × b)
	const reverseKey = makeKey(vb, va)
	const reverseCached = memoCache.get(reverseKey)
	if (reverseCached !== undefined) {
		memoCache.delete(reverseKey)
		memoCache.set(reverseKey, reverseCached)
		const negated = Object.freeze([
			-reverseCached[0],
			-reverseCached[1],
			-reverseCached[2],
		])
		cacheSet(key, negated)
		return [negated[0], negated[1], negated[2]]
	}

	/** @type {[bigint, bigint, bigint]} */
	const result = [0n, 0n, 0n]
	for (let k = 0; k < 3; k++) {
		const [i, j] = CROSS_INDEX_TABLE[k]
		result[k] = va[i] * vb[j] - va[j] * vb[i]
	}

	cacheSet(key, Object.freeze([result[0], result[1], result[2]]))
	return result
}
