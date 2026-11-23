/**
 * Memoized, table-driven intersection over sets of closed real intervals `[lo, hi]`.
 *
 * Each interval set is normalized (endpoints canonicalized, sorted, and overlapping
 * or adjacent intervals merged) and intersected using a precomputed two-pointer
 * transition table. Both normalization and pairwise intersection results are cached
 * in bounded LRU maps with commutative keys and defensive cloning on return.
 */

const MAX_CACHE_SIZE = 1024

/**
 * Precomputed two-pointer step transition table for sorted, disjoint interval sets.
 *
 * Indexed as `STEP_TABLE[overlapFlag][endCompareCode]`:
 * - `overlapFlag`: `0` when `lo > hi` (no overlap), `1` when `lo <= hi` (overlap)
 * - `endCompareCode`: `0` when `aHi < bHi`, `1` when `aHi === bHi`, `2` when `aHi > bHi`
 *
 * Each entry specifies whether to emit `[lo, hi]` and the pointer increments `(dI, dJ)`.
 */
const STEP_TABLE = Object.freeze([
	// overlapFlag = 0 (no overlap)
	Object.freeze([
		Object.freeze({ emit: false, dI: 1, dJ: 0 }),
		Object.freeze({ emit: false, dI: 1, dJ: 1 }),
		Object.freeze({ emit: false, dI: 0, dJ: 1 }),
	]),
	// overlapFlag = 1 (overlap)
	Object.freeze([
		Object.freeze({ emit: true, dI: 1, dJ: 0 }),
		Object.freeze({ emit: true, dI: 1, dJ: 1 }),
		Object.freeze({ emit: true, dI: 0, dJ: 1 }),
	]),
])

/** @type {Map<string, ReadonlyArray<readonly [number, number]>>} */
const normalizeCache = new Map()

/** @type {Map<string, ReadonlyArray<readonly [number, number]>>} */
const intersectionCache = new Map()

/**
 * Retrieves a value from a bounded LRU Map, refreshing its recency on hit.
 *
 * @template V
 * @param {Map<string, V>} cache
 * @param {string} key
 * @returns {V | undefined}
 */
function cacheGet(cache, key) {
	if (!cache.has(key)) return undefined
	const val = cache.get(key)
	cache.delete(key)
	cache.set(key, val)
	return val
}

/**
 * Stores a value in a bounded LRU Map, evicting the oldest entry when full.
 *
 * @template V
 * @param {Map<string, V>} cache
 * @param {string} key
 * @param {V} val
 */
function cacheSet(cache, key, val) {
	if (cache.has(key)) {
		cache.delete(key)
	} else if (cache.size >= MAX_CACHE_SIZE) {
		const oldestKey = cache.keys().next().value
		cache.delete(oldestKey)
	}
	cache.set(key, val)
}

/**
 * Canonicalizes `-0` to `0`.
 *
 * @param {number} n
 * @returns {number}
 */
function canonNum(n) {
	return n === 0 ? 0 : n
}

/**
 * Serializes an array of validated `[lo, hi]` intervals into a canonical cache key.
 *
 * @param {ReadonlyArray<readonly [number, number]>} intervals
 * @returns {string}
 */
function serializeIntervals(intervals) {
	if (intervals.length === 0) return ''
	const parts = new Array(intervals.length)
	for (let i = 0; i < intervals.length; i++) {
		parts[i] = `${intervals[i][0]},${intervals[i][1]}`
	}
	return parts.join(';')
}

/**
 * Validates an interval set and produces canonical `[lo, hi]` pairs without mutating input.
 *
 * @param {unknown} set
 * @param {number} argIndex
 * @returns {Array<[number, number]>}
 */
function validateIntervalSet(set, argIndex) {
	if (!Array.isArray(set)) {
		throw new TypeError(`Argument ${argIndex} must be an array of [lo, hi] intervals`)
	}
	const out = new Array(set.length)
	for (let i = 0; i < set.length; i++) {
		const iv = set[i]
		if (!Array.isArray(iv) || iv.length !== 2) {
			throw new TypeError(
				`Argument ${argIndex} element at index ${i} must be a [lo, hi] pair`,
			)
		}
		const rawLo = iv[0]
		const rawHi = iv[1]
		if (
			typeof rawLo !== 'number' ||
			typeof rawHi !== 'number' ||
			Number.isNaN(rawLo) ||
			Number.isNaN(rawHi)
		) {
			throw new TypeError(
				`Argument ${argIndex} interval at index ${i} endpoints must be non-NaN numbers`,
			)
		}
		if (rawLo > rawHi) {
			throw new RangeError(
				`Argument ${argIndex} interval at index ${i} has lo (${rawLo}) > hi (${rawHi})`,
			)
		}
		out[i] = [canonNum(rawLo), canonNum(rawHi)]
	}
	return out
}

/**
 * Normalizes and merges a validated interval list using memoization.
 *
 * @param {Array<[number, number]>} validated
 * @returns {{ intervals: ReadonlyArray<readonly [number, number]>, key: string }}
 */
function normalizeMemo(validated) {
	const rawKey = serializeIntervals(validated)
	const cached = cacheGet(normalizeCache, rawKey)
	if (cached !== undefined) {
		return { intervals: cached, key: serializeIntervals(cached) }
	}

	if (validated.length === 0) {
		const empty = Object.freeze([])
		cacheSet(normalizeCache, rawKey, empty)
		return { intervals: empty, key: '' }
	}

	const sorted = validated.slice().sort((x, y) => {
		if (x[0] !== y[0]) return x[0] - y[0]
		return x[1] - y[1]
	})

	/** @type {Array<readonly [number, number]>} */
	const merged = []
	let curLo = sorted[0][0]
	let curHi = sorted[0][1]

	for (let i = 1; i < sorted.length; i++) {
		const nextLo = sorted[i][0]
		const nextHi = sorted[i][1]
		if (nextLo <= curHi) {
			if (nextHi > curHi) curHi = nextHi
		} else {
			merged.push(Object.freeze([curLo, curHi]))
			curLo = nextLo
			curHi = nextHi
		}
	}
	merged.push(Object.freeze([curLo, curHi]))

	const frozen = Object.freeze(merged)
	const normKey = serializeIntervals(frozen)
	cacheSet(normalizeCache, rawKey, frozen)
	if (normKey !== rawKey) {
		cacheSet(normalizeCache, normKey, frozen)
	}
	return { intervals: frozen, key: normKey }
}

/**
 * Intersects two already-normalized interval sets using the precomputed transition table
 * and a commutative memoization cache.
 *
 * @param {ReadonlyArray<readonly [number, number]>} normA
 * @param {string} keyA
 * @param {ReadonlyArray<readonly [number, number]>} normB
 * @param {string} keyB
 * @returns {{ intervals: ReadonlyArray<readonly [number, number]>, key: string }}
 */
function intersectNormalizedMemo(normA, keyA, normB, keyB) {
	if (normA.length === 0 || normB.length === 0) {
		return { intervals: Object.freeze([]), key: '' }
	}

	const pairKey = keyA <= keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`
	const cached = cacheGet(intersectionCache, pairKey)
	if (cached !== undefined) {
		return { intervals: cached, key: serializeIntervals(cached) }
	}

	/** @type {Array<readonly [number, number]>} */
	const result = []
	let i = 0
	let j = 0

	while (i < normA.length && j < normB.length) {
		const aLo = normA[i][0]
		const aHi = normA[i][1]
		const bLo = normB[j][0]
		const bHi = normB[j][1]

		const lo = aLo >= bLo ? aLo : bLo
		const hi = aHi <= bHi ? aHi : bHi

		const overlapFlag = lo <= hi ? 1 : 0
		const endCompareCode = aHi < bHi ? 0 : aHi > bHi ? 2 : 1
		const step = STEP_TABLE[overlapFlag][endCompareCode]

		if (step.emit) {
			result.push(Object.freeze([lo, hi]))
		}
		i += step.dI
		j += step.dJ
	}

	const frozen = Object.freeze(result)
	cacheSet(intersectionCache, pairKey, frozen)
	return { intervals: frozen, key: serializeIntervals(frozen) }
}

/**
 * Computes the normalized, merged intersection of two or more sets of closed real
 * intervals `[lo, hi]`, using a table-driven two-pointer sweep and bounded LRU
 * memoization for both interval-set normalization and pairwise intersections.
 *
 * Each input set may be unsorted and contain overlapping, adjacent, duplicate,
 * point (`[x, x]`), or unbounded (`-Infinity` / `Infinity`) intervals. The returned
 * array is always freshly allocated, sorted in ascending order, and maximally merged
 * (strictly disjoint intervals).
 *
 * @param {Array<[number, number]>} a - First set of closed real intervals `[lo, hi]`.
 * @param {Array<[number, number]>} b - Second set of closed real intervals `[lo, hi]`.
 * @param {...Array<[number, number]>} rest - Optional additional interval sets to intersect.
 * @returns {Array<[number, number]>} Normalized, merged intersection of all input interval sets.
 * @throws {TypeError} If fewer than two arguments are provided, any argument is not an array
 *   of 2-element arrays, or any endpoint is not a non-NaN number.
 * @throws {RangeError} If any interval has `lo > hi`.
 */
export function intersectionIntervalMemo(a, b, ...rest) {
	if (arguments.length < 2) {
		throw new TypeError('intersectionIntervalMemo requires at least two interval sets')
	}

	const allSets = [a, b, ...rest]
	const normalized = new Array(allSets.length)
	for (let k = 0; k < allSets.length; k++) {
		const validated = validateIntervalSet(allSets[k], k)
		normalized[k] = normalizeMemo(validated)
	}

	let acc = normalized[0]
	for (let k = 1; k < normalized.length; k++) {
		acc = intersectNormalizedMemo(acc.intervals, acc.key, normalized[k].intervals, normalized[k].key)
		if (acc.intervals.length === 0) break
	}

	return acc.intervals.map(([lo, hi]) => [lo, hi])
}
