/**
 * @fileoverview Table-driven and memoized logical XOR (symmetric difference)
 * over sorted, de-duplicated numeric arrays using a merge-style algorithm.
 */

/**
 * Maximum number of entries retained in the bounded LRU memoization cache.
 * @type {number}
 */
const MAX_CACHE_SIZE = 512

/**
 * Upper bound (inclusive) of the dense small-integer domain `{0..7}` backed by
 * a precomputed 256-entry lookup table.
 * @type {number}
 */
const BITSET_DOMAIN_MAX = 7

/**
 * Precomputed 256-entry lookup table mapping every 8-bit mask (`0..255`) to its
 * corresponding frozen, sorted, de-duplicated array of integers in `0..7`.
 * @type {ReadonlyArray<ReadonlyArray<number>>}
 */
const BYTE_SET_TABLE = Object.freeze(
	Array.from({ length: 256 }, (_, mask) => {
		const elements = []
		for (let bit = 0; bit <= BITSET_DOMAIN_MAX; bit++) {
			if ((mask & (1 << bit)) !== 0) {
				elements.push(bit)
			}
		}
		return Object.freeze(elements)
	}),
)

/**
 * Comparison-state transition table for the merge-style XOR scan.
 *
 * State index encoding:
 * - `0`: `a[i] < b[j]`  -> emit `a[i]`, advance `i`
 * - `1`: `a[i] === b[j]` -> emit nothing, advance both `i` and `j`
 * - `2`: `a[i] > b[j]`  -> emit `b[j]`, advance `j`
 *
 * @type {ReadonlyArray<Readonly<{ emit: 'a' | 'b' | 'none', stepA: number, stepB: number }>>}
 */
const MERGE_TRANSITION_TABLE = Object.freeze([
	Object.freeze({ emit: 'a', stepA: 1, stepB: 0 }),
	Object.freeze({ emit: 'none', stepA: 1, stepB: 1 }),
	Object.freeze({ emit: 'b', stepA: 0, stepB: 1 }),
])

/**
 * Bounded LRU memoization cache keyed by canonicalized `(a, b)` value keys.
 * Values are frozen result arrays so cached data is immutable.
 * @type {Map<string, ReadonlyArray<number>>}
 */
const memoCache = new Map()

/**
 * Internal counters for observing memoization and table fast-path behavior.
 */
const stats = {
	hits: 0,
	misses: 0,
	tableHits: 0,
}

/**
 * Validates that `input` is a strictly increasing, de-duplicated array of
 * finite numbers, while also checking whether it fits in the precomputed
 * 8-bit integer table domain `{0..7}`.
 *
 * @param {unknown} input - Value to validate.
 * @param {string} name - Parameter name for error diagnostics.
 * @returns {{ isByteDomain: boolean, mask: number, key: string }}
 * @throws {TypeError} If `input` is not an Array or contains a non-number.
 * @throws {RangeError} If `input` contains a non-finite number or is not
 *   strictly increasing (unsorted or contains duplicates).
 */
function validateAndInspect(input, name) {
	if (!Array.isArray(input)) {
		throw new TypeError(`${name} must be an Array`)
	}

	const len = input.length
	let isByteDomain = true
	let mask = 0
	const parts = new Array(len)
	let prev = -Infinity

	for (let i = 0; i < len; i++) {
		if (!(i in input)) {
			throw new TypeError(`${name}[${i}] must be a number (sparse arrays are not allowed)`)
		}
		const raw = input[i]
		if (typeof raw !== 'number') {
			throw new TypeError(`${name}[${i}] must be a number, received ${typeof raw}`)
		}
		if (!Number.isFinite(raw)) {
			throw new RangeError(`${name}[${i}] must be a finite number, received ${raw}`)
		}

		// Normalize -0 to +0 for consistent keys and output values.
		const val = raw === 0 ? 0 : raw

		if (i > 0) {
			if (val < prev) {
				throw new RangeError(
					`${name} must be sorted in strictly ascending order (index ${i}: ${val} < ${prev})`,
				)
			}
			if (val === prev) {
				throw new RangeError(
					`${name} must be de-duplicated (duplicate value ${val} at index ${i})`,
				)
			}
		}

		prev = val
		parts[i] = String(val)

		if (isByteDomain) {
			if (Number.isInteger(val) && val >= 0 && val <= BITSET_DOMAIN_MAX) {
				mask |= 1 << val
			} else {
				isByteDomain = false
			}
		}
	}

	return {
		isByteDomain,
		mask,
		key: parts.join(','),
	}
}

/**
 * Performs a table-driven two-pointer merge XOR over two validated, strictly
 * ascending arrays of finite numbers.
 *
 * @param {readonly number[]} a - First sorted, de-duplicated array.
 * @param {readonly number[]} b - Second sorted, de-duplicated array.
 * @returns {number[]} Strictly ascending array of elements in `a` or `b` but not both.
 */
function mergeXorTableDriven(a, b) {
	const result = []
	const lenA = a.length
	const lenB = b.length
	let i = 0
	let j = 0

	while (i < lenA && j < lenB) {
		const va = a[i] === 0 ? 0 : a[i]
		const vb = b[j] === 0 ? 0 : b[j]
		const state = va < vb ? 0 : va > vb ? 2 : 1
		const action = MERGE_TRANSITION_TABLE[state]

		if (action.emit === 'a') {
			result.push(va)
		} else if (action.emit === 'b') {
			result.push(vb)
		}

		i += action.stepA
		j += action.stepB
	}

	while (i < lenA) {
		const va = a[i++]
		result.push(va === 0 ? 0 : va)
	}

	while (j < lenB) {
		const vb = b[j++]
		result.push(vb === 0 ? 0 : vb)
	}

	return result
}

/**
 * Stores a frozen result array in the bounded LRU cache.
 *
 * @param {string} key - Canonical cache key.
 * @param {ReadonlyArray<number>} frozenValue - Immutable result array.
 */
function memoSet(key, frozenValue) {
	if (memoCache.has(key)) {
		memoCache.delete(key)
	} else if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value
		memoCache.delete(oldestKey)
	}
	memoCache.set(key, frozenValue)
}

/**
 * Computes the logical XOR (symmetric difference) of two sorted, de-duplicated
 * arrays of finite numbers using a table-driven merge algorithm with
 * precomputed small-domain lookup and bounded LRU memoization.
 *
 * Returns a new strictly ascending array containing every number that appears
 * in either `a` or `b`, but not in both. Because XOR is commutative,
 * `xorSortedArrMemo(a, b)` and `xorSortedArrMemo(b, a)` share the same
 * canonical memoization entry. Returned arrays are always fresh copies so
 * caller mutations cannot corrupt cached or precomputed state.
 *
 * @param {readonly number[]} a - First strictly ascending, de-duplicated array of finite numbers.
 * @param {readonly number[]} b - Second strictly ascending, de-duplicated array of finite numbers.
 * @returns {number[]} New strictly ascending, de-duplicated array representing `a XOR b`.
 * @throws {TypeError} If `a` or `b` is not an array, is sparse, or contains non-number values.
 * @throws {RangeError} If `a` or `b` contains non-finite numbers, is unsorted, or has duplicates.
 *
 * @example
 * xorSortedArrMemo([1, 2, 4, 7], [2, 3, 7, 9])
 * // => [1, 3, 4, 9]
 */
export function xorSortedArrMemo(a, b) {
	const infoA = validateAndInspect(a, 'a')
	const infoB = validateAndInspect(b, 'b')

	// Canonical commutative cache key: xor(a, b) === xor(b, a).
	const cacheKey = infoA.key <= infoB.key
		? `${infoA.key}|${infoB.key}`
		: `${infoB.key}|${infoA.key}`

	const cached = memoCache.get(cacheKey)
	if (cached !== undefined) {
		// Refresh LRU recency.
		memoCache.delete(cacheKey)
		memoCache.set(cacheKey, cached)
		stats.hits++
		return cached.slice()
	}

	stats.misses++

	let frozenResult
	if (infoA.isByteDomain && infoB.isByteDomain) {
		stats.tableHits++
		frozenResult = BYTE_SET_TABLE[infoA.mask ^ infoB.mask]
	} else {
		frozenResult = Object.freeze(mergeXorTableDriven(a, b))
	}

	memoSet(cacheKey, frozenResult)
	return frozenResult.slice()
}

/**
 * Clears the internal memoization cache and resets cache statistics.
 *
 * @returns {void}
 */
xorSortedArrMemo.clearCache = function clearCache() {
	memoCache.clear()
	stats.hits = 0
	stats.misses = 0
	stats.tableHits = 0
}

/**
 * Returns a snapshot of the memoization cache and precomputed-table statistics.
 *
 * @returns {{ size: number, maxSize: number, hits: number, misses: number, tableHits: number }}
 */
xorSortedArrMemo.getCacheStats = function getCacheStats() {
	return {
		size: memoCache.size,
		maxSize: MAX_CACHE_SIZE,
		hits: stats.hits,
		misses: stats.misses,
		tableHits: stats.tableHits,
	}
}
