/**
 * Precomputed Levi-Civita / cyclic index table for 3D cross products.
 *
 * For each output component k in {0, 1, 2}, the 3D cross product is:
 *   c[k] = sum_{i,j} epsilon_{k,i,j} * a[i] * b[j]
 * where epsilon_{k,i,j} = 0.5 * (i - k) * (j - i) * (j - k).
 *
 * Each row stores [outIdx, aPosIdx, bPosIdx, aNegIdx, bNegIdx] derived from
 * the non-zero Levi-Civita tensor entries at module initialization.
 */
const CYCLIC_TABLE = (() => {
	const table = []
	for (let k = 0; k < 3; k++) {
		let aPos = 0
		let bPos = 0
		let aNeg = 0
		let bNeg = 0
		for (let i = 0; i < 3; i++) {
			for (let j = 0; j < 3; j++) {
				const eps = 0.5 * (i - k) * (j - i) * (j - k)
				if (eps === 1) {
					aPos = i
					bPos = j
				} else if (eps === -1) {
					aNeg = i
					bNeg = j
				}
			}
		}
		table.push(Object.freeze([k, aPos, bPos, aNeg, bNeg]))
	}
	return Object.freeze(table)
})()

const MAX_CACHE_SIZE = 1024

/** @type {Map<string, Float64Array>} */
const memoCache = new Map()
let cacheHits = 0
let cacheMisses = 0

/**
 * Normalize negative zero to positive zero for deterministic keys and outputs.
 *
 * @param {number} value
 * @returns {number}
 */
function normalizeZero(value) {
	return value === 0 ? 0 : value
}

/**
 * Validate a Float64Array vector input.
 *
 * @param {unknown} input
 * @param {string} name
 */
function validateVector(input, name) {
	if (!(input instanceof Float64Array)) {
		throw new TypeError(`Expected ${name} to be a Float64Array`)
	}
	if (input.length === 0 || input.length % 3 !== 0) {
		throw new RangeError(
			`Expected ${name}.length to be a positive multiple of 3, received ${input.length}`
		)
	}
	for (let i = 0; i < input.length; i++) {
		if (!Number.isFinite(input[i])) {
			throw new RangeError(
				`Expected ${name}[${i}] to be a finite number, received ${input[i]}`
			)
		}
	}
}

/**
 * Compute and memoize the 3D cross product of a single vector pair at a given
 * stride offset using the precomputed Levi-Civita cyclic index table.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @param {number} offset
 * @param {Float64Array} out
 */
function computeTripleMemo(a, b, offset, out) {
	const ax = normalizeZero(a[offset])
	const ay = normalizeZero(a[offset + 1])
	const az = normalizeZero(a[offset + 2])
	const bx = normalizeZero(b[offset])
	const by = normalizeZero(b[offset + 1])
	const bz = normalizeZero(b[offset + 2])

	const key = `${ax},${ay},${az}|${bx},${by},${bz}`
	const cached = memoCache.get(key)

	if (cached !== undefined) {
		cacheHits++
		// Refresh LRU recency
		memoCache.delete(key)
		memoCache.set(key, cached)
		out[offset] = cached[0]
		out[offset + 1] = cached[1]
		out[offset + 2] = cached[2]
		return
	}

	cacheMisses++
	const triple = new Float64Array(3)
	for (let row = 0; row < CYCLIC_TABLE.length; row++) {
		const [k, aPos, bPos, aNeg, bNeg] = CYCLIC_TABLE[row]
		const val =
			a[offset + aPos] * b[offset + bPos] -
			a[offset + aNeg] * b[offset + bNeg]
		triple[k] = normalizeZero(val)
	}

	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value
		memoCache.delete(oldestKey)
	}
	memoCache.set(key, triple)

	out[offset] = triple[0]
	out[offset + 1] = triple[1]
	out[offset + 2] = triple[2]
}

/**
 * Compute the 3D vector cross product (or element-wise packed batch of 3D
 * vector cross products) over `Float64Array` inputs using a precomputed
 * Levi-Civita cyclic index table with bounded LRU memoization.
 *
 * @param {Float64Array} a - First 3D vector (length 3) or packed batch of 3D vectors (positive multiple of 3).
 * @param {Float64Array} b - Second 3D vector or packed batch of 3D vectors matching `a.length`.
 * @returns {Float64Array} Newly allocated `Float64Array` containing `a × b` for each 3D vector triple.
 * @throws {TypeError} If either `a` or `b` is not a `Float64Array`.
 * @throws {RangeError} If lengths are mismatched, empty, not a multiple of 3, or contain non-finite numbers.
 */
export function crossProductTypedMemo(a, b) {
	validateVector(a, 'a')
	validateVector(b, 'b')
	if (a.length !== b.length) {
		throw new RangeError(
			`Expected a.length (${a.length}) to equal b.length (${b.length})`
		)
	}

	const result = new Float64Array(a.length)
	for (let offset = 0; offset < a.length; offset += 3) {
		computeTripleMemo(a, b, offset, result)
	}
	return result
}

/**
 * Clear the internal memoization cache and reset hit/miss counters.
 */
crossProductTypedMemo.clearCache = function clearCache() {
	memoCache.clear()
	cacheHits = 0
	cacheMisses = 0
}

/**
 * Return a snapshot of memoization cache statistics.
 *
 * @returns {{ size: number, maxSize: number, hits: number, misses: number }}
 */
crossProductTypedMemo.getCacheStats = function getCacheStats() {
	return {
		size: memoCache.size,
		maxSize: MAX_CACHE_SIZE,
		hits: cacheHits,
		misses: cacheMisses,
	}
}
