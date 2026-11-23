/**
 * @fileoverview Table-driven, precomputed, and memoized merge-style set intersection
 * over strictly sorted, de-duplicated arrays.
 *
 * Zero dependencies, ESM, Node 20+.
 */

/**
 * Maximum number of entries retained in each LRU memoization table.
 * @type {number}
 */
const MAX_CACHE_SIZE = 1024

/**
 * Precomputed state-transition table for the two-pointer merge algorithm.
 * Indexed by normalized comparison sign + 1:
 * - index 0 (cmp < 0): advance pointer i
 * - index 1 (cmp === 0): emit common element, advance both i and j
 * - index 2 (cmp > 0): advance pointer j
 *
 * @type {ReadonlyArray<Readonly<{di: number, dj: number, emit: boolean}>>}
 */
const MERGE_TRANSITION_TABLE = Object.freeze([
	Object.freeze({ di: 1, dj: 0, emit: false }),
	Object.freeze({ di: 1, dj: 1, emit: true }),
	Object.freeze({ di: 0, dj: 1, emit: false }),
])

/**
 * Precomputed lookup table mapping every 8-bit subset mask (0..255)
 * to its strictly sorted array of element values in {0, 1, ..., 7}.
 *
 * @type {ReadonlyArray<ReadonlyArray<number>>}
 */
const SMALL_INT_SET_TABLE = Object.freeze(
	Array.from({ length: 256 }, (_, mask) => {
		const elems = []
		for (let bit = 0; bit < 8; bit++) {
			if ((mask & (1 << bit)) !== 0) {
				elems.push(bit)
			}
		}
		return Object.freeze(elems)
	}),
)

/**
 * Default LRU memoization cache for the built-in comparator.
 * Maps canonical collision-free pair keys to frozen intersection arrays.
 * @type {Map<string, ReadonlyArray<number | string | bigint>>}
 */
const defaultMemoCache = new Map()

/**
 * Per-comparator LRU memoization caches for custom comparator functions
 * operating on primitive elements.
 * @type {WeakMap<Function, Map<string, ReadonlyArray<unknown>>>}
 */
const customMemoCaches = new WeakMap()

/**
 * Runtime memoization and precomputed-table statistics.
 */
const cacheStats = {
	hits: 0,
	misses: 0,
	tableHits: 0,
	evictions: 0,
}

/**
 * Default strict total-order comparator for homogeneous primitives
 * (non-NaN numbers, strings, or bigints).
 *
 * @template {number | string | bigint} T
 * @param {T} x
 * @param {T} y
 * @returns {number}
 */
function defaultCompare(x, y) {
	if (x < y) return -1
	if (x > y) return 1
	return 0
}

/**
 * Invokes a comparator and validates that it returns a non-NaN number.
 *
 * @template T
 * @param {(x: T, y: T) => number} compare
 * @param {T} x
 * @param {T} y
 * @returns {number}
 */
function safeCompare(compare, x, y) {
	const result = compare(x, y)
	if (typeof result !== 'number') {
		throw new TypeError('Comparator must return a number')
	}
	if (Number.isNaN(result)) {
		throw new RangeError('Comparator must not return NaN')
	}
	return result
}

/**
 * Checks whether a value is a supported default-comparable primitive.
 *
 * @param {unknown} value
 * @returns {'number' | 'string' | 'bigint'}
 */
function validatePrimitiveType(value) {
	const t = typeof value
	if (t === 'number') {
		if (Number.isNaN(value)) {
			throw new RangeError('Input arrays must not contain NaN')
		}
		return 'number'
	}
	if (t === 'string' || t === 'bigint') {
		return t
	}
	throw new TypeError(
		`Unsupported element type "${t}" for default comparison; expected number, string, or bigint`,
	)
}

/**
 * Validates that an array is dense, strictly sorted, and de-duplicated, while
 * simultaneously computing its canonical collision-free serialization key and
 * optional 8-bit small-integer mask (when all elements are integers in [0, 7]).
 *
 * @template T
 * @param {unknown} arr
 * @param {string} label
 * @param {((x: T, y: T) => number) | null} customCompare
 * @param {'number' | 'string' | 'bigint' | null} expectedType
 * @returns {{
 *   elementType: 'number' | 'string' | 'bigint' | null,
 *   key: string | null,
 *   smallMask: number
 * }}
 */
function validateAndInspectArray(arr, label, customCompare, expectedType) {
	if (!Array.isArray(arr)) {
		throw new TypeError(`${label} must be an array`)
	}

	const len = arr.length
	if (len === 0) {
		return {
			elementType: expectedType,
			key: 'e:',
			smallMask: 0,
		}
	}

	let elementType = expectedType
	let allSmallInts = customCompare === null
	let smallMask = 0
	let canSerialize = true
	/** @type {string[]} */
	const keyParts = []

	for (let i = 0; i < len; i++) {
		if (!(i in arr)) {
			throw new TypeError(`${label} must not be a sparse array (hole at index ${i})`)
		}
		const val = arr[i]

		if (customCompare === null) {
			const valType = validatePrimitiveType(val)
			if (elementType === null) {
				elementType = valType
			} else if (valType !== elementType) {
				throw new TypeError(
					`All elements across both arrays must have the same type (expected "${elementType}", got "${valType}" in ${label} at index ${i})`,
				)
			}

			if (valType === 'number') {
				const normalized = val === 0 ? 0 : val
				keyParts.push(String(normalized))
				if (allSmallInts) {
					if (Number.isInteger(normalized) && normalized >= 0 && normalized <= 7) {
						smallMask |= 1 << normalized
					} else {
						allSmallInts = false
					}
				}
			} else if (valType === 'bigint') {
				allSmallInts = false
				keyParts.push(String(val))
			} else {
				allSmallInts = false
				keyParts.push(`${val.length}:${val}`)
			}

			if (i > 0) {
				const prev = arr[i - 1]
				if (prev === val) {
					throw new RangeError(
						`${label} must be de-duplicated (duplicate element at index ${i})`,
					)
				}
				if (prev > val) {
					throw new RangeError(
						`${label} must be strictly sorted in ascending order (out-of-order element at index ${i})`,
					)
				}
			}
		} else {
			if (canSerialize) {
				const t = typeof val
				if (t === 'number' && !Number.isNaN(val)) {
					keyParts.push(`n:${val === 0 ? 0 : val}`)
				} else if (t === 'bigint') {
					keyParts.push(`b:${val}`)
				} else if (t === 'string') {
					keyParts.push(`s:${val.length}:${val}`)
				} else {
					canSerialize = false
				}
			}

			if (i > 0) {
				const cmp = safeCompare(customCompare, arr[i - 1], val)
				if (cmp === 0) {
					throw new RangeError(
						`${label} must be de-duplicated (duplicate element at index ${i})`,
					)
				}
				if (cmp > 0) {
					throw new RangeError(
						`${label} must be strictly sorted according to comparator (out-of-order element at index ${i})`,
					)
				}
			}
		}
	}

	let key = null
	if (customCompare === null) {
		const prefix = elementType === 'number' ? 'n:' : elementType === 'bigint' ? 'b:' : 's:'
		key = prefix + (elementType === 'string' ? keyParts.join('') : keyParts.join(','))
	} else if (canSerialize) {
		key = 'c:' + keyParts.map((p) => `${p.length}:${p}`).join('')
	}

	return {
		elementType,
		key,
		smallMask: allSmallInts ? smallMask : -1,
	}
}

/**
 * Builds a collision-free composite cache key from two serialized array keys.
 * For commutative operations (default comparator), orders the keys lexicographically
 * so (a, b) and (b, a) share the same memoization slot.
 *
 * @param {string} keyA
 * @param {string} keyB
 * @param {boolean} commutative
 * @returns {string}
 */
function makePairKey(keyA, keyB, commutative) {
	if (commutative && keyA > keyB) {
		return `${keyB.length}:${keyB}|${keyA}`
	}
	return `${keyA.length}:${keyA}|${keyB}`
}

/**
 * Reads an entry from an LRU Map, refreshing its recency on hit.
 *
 * @template V
 * @param {Map<string, V>} cache
 * @param {string} key
 * @returns {V | undefined}
 */
function lruGet(cache, key) {
	if (!cache.has(key)) {
		return undefined
	}
	const value = cache.get(key)
	cache.delete(key)
	cache.set(key, value)
	return value
}

/**
 * Inserts an entry into a bounded LRU Map, evicting the least-recently-used
 * entry when capacity is reached.
 *
 * @template V
 * @param {Map<string, V>} cache
 * @param {string} key
 * @param {V} value
 */
function lruSet(cache, key, value) {
	if (cache.has(key)) {
		cache.delete(key)
	} else if (cache.size >= MAX_CACHE_SIZE) {
		const oldestKey = cache.keys().next().value
		cache.delete(oldestKey)
		cacheStats.evictions++
	}
	cache.set(key, value)
}

/**
 * Performs a table-driven two-pointer merge intersection over two validated,
 * strictly sorted, de-duplicated arrays.
 *
 * @template T
 * @param {ReadonlyArray<T>} a
 * @param {ReadonlyArray<T>} b
 * @param {(x: T, y: T) => number} compare
 * @param {boolean} normalizeNegZero
 * @returns {T[]}
 */
function mergeIntersectTableDriven(a, b, compare, normalizeNegZero) {
	const lenA = a.length
	const lenB = b.length
	const result = []
	let i = 0
	let j = 0

	while (i < lenA && j < lenB) {
		const cmp = compare(a[i], b[j])
		const stateIndex = cmp < 0 ? 0 : cmp > 0 ? 2 : 1
		const step = MERGE_TRANSITION_TABLE[stateIndex]
		if (step.emit) {
			const val = a[i]
			result.push(
				normalizeNegZero && typeof val === 'number' && val === 0 ? /** @type {T} */ (0) : val,
			)
		}
		i += step.di
		j += step.dj
	}

	return result
}

/**
 * Computes the set intersection of two strictly sorted, de-duplicated arrays
 * using a table-driven two-pointer merge algorithm with a precomputed small-domain
 * lookup table and bounded LRU memoization.
 *
 * @template T
 * @param {ReadonlyArray<T>} a - First strictly sorted, de-duplicated array.
 * @param {ReadonlyArray<T>} b - Second strictly sorted, de-duplicated array.
 * @param {object} [options] - Optional configuration.
 * @param {(x: T, y: T) => number} [options.compare] - Optional strict total-order comparator.
 *   When omitted, homogeneous arrays of finite/infinite numbers (excluding NaN), strings, or bigints are compared naturally.
 * @param {boolean} [options.memoize=true] - Whether to use the LRU memoization cache.
 * @returns {T[]} A new strictly sorted, de-duplicated array containing elements present in both `a` and `b`.
 * @throws {TypeError} If inputs are not dense arrays, options are invalid, or element types are unsupported/mismatched.
 * @throws {RangeError} If either array contains NaN, duplicate elements, or elements not in strictly sorted order.
 */
export function intersectionSortedArrMemo(a, b, options = undefined) {
	let customCompare = null
	let memoize = true

	if (options !== undefined) {
		if (options === null || typeof options !== 'object' || Array.isArray(options)) {
			throw new TypeError('options must be a plain object when provided')
		}
		if (options.compare !== undefined) {
			if (typeof options.compare !== 'function') {
				throw new TypeError('options.compare must be a function')
			}
			customCompare = options.compare
		}
		if (options.memoize !== undefined) {
			if (typeof options.memoize !== 'boolean') {
				throw new TypeError('options.memoize must be a boolean')
			}
			memoize = options.memoize
		}
	}

	const infoA = validateAndInspectArray(a, 'First argument', customCompare, null)
	const infoB = validateAndInspectArray(b, 'Second argument', customCompare, infoA.elementType)

	const isDefault = customCompare === null
	let cache = null
	let pairKey = null

	if (memoize && infoA.key !== null && infoB.key !== null) {
		if (isDefault) {
			cache = defaultMemoCache
		} else {
			cache = customMemoCaches.get(customCompare)
			if (!cache) {
				cache = new Map()
				customMemoCaches.set(customCompare, cache)
			}
		}
		pairKey = makePairKey(infoA.key, infoB.key, isDefault)
		const cached = lruGet(cache, pairKey)
		if (cached !== undefined) {
			cacheStats.hits++
			return cached.slice()
		}
		cacheStats.misses++
	}

	/** @type {ReadonlyArray<T>} */
	let computed
	if (a.length === 0 || b.length === 0) {
		computed = SMALL_INT_SET_TABLE[0]
	} else if (isDefault && infoA.smallMask >= 0 && infoB.smallMask >= 0) {
		cacheStats.tableHits++
		computed = /** @type {ReadonlyArray<T>} */ (
			SMALL_INT_SET_TABLE[infoA.smallMask & infoB.smallMask]
		)
	} else {
		const cmpFn = isDefault
			? defaultCompare
			: (x, y) => safeCompare(customCompare, x, y)
		computed = Object.freeze(mergeIntersectTableDriven(a, b, cmpFn, isDefault))
	}

	if (cache !== null && pairKey !== null) {
		lruSet(cache, pairKey, computed)
	}

	return computed.slice()
}

/**
 * Clears the default memoization cache and resets runtime statistics.
 */
intersectionSortedArrMemo.clearCache = function clearCache() {
	defaultMemoCache.clear()
	cacheStats.hits = 0
	cacheStats.misses = 0
	cacheStats.tableHits = 0
	cacheStats.evictions = 0
}

/**
 * Returns a snapshot of memoization and precomputed-table statistics.
 *
 * @returns {{hits: number, misses: number, tableHits: number, evictions: number, size: number, maxSize: number}}
 */
intersectionSortedArrMemo.getCacheStats = function getCacheStats() {
	return {
		hits: cacheStats.hits,
		misses: cacheStats.misses,
		tableHits: cacheStats.tableHits,
		evictions: cacheStats.evictions,
		size: defaultMemoCache.size,
		maxSize: MAX_CACHE_SIZE,
	}
}

/**
 * Read-only reference to the merge state-transition table.
 */
intersectionSortedArrMemo.transitionTable = MERGE_TRANSITION_TABLE
