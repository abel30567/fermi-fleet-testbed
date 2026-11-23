/**
 * @fileoverview Table-driven, memoized, and precomputed logical NOT (complement)
 * over sets of real intervals [lo, hi], normalized and merged.
 */

/**
 * State-mask bits for the sweep-line complement table:
 *   bit 0 (1): currently inside the input interval set A
 *   bit 1 (2): currently inside the universe interval U
 *
 * Output is emitted when inside U and outside A (state === 2).
 */
const EMIT_TABLE = Object.freeze([
	0, // 0b00: outside U, outside A -> do not emit
	0, // 0b01: outside U, inside  A -> do not emit
	1, // 0b10: inside  U, outside A -> emit (U \ A)
	0, // 0b11: inside  U, inside  A -> do not emit
])

/**
 * Action codes indexed by TRANSITION_TABLE[prevEmit][nextEmit].
 */
const ACTION_NOOP = 0
const ACTION_START = 1
const ACTION_END = 2

const TRANSITION_TABLE = Object.freeze([
	Object.freeze([ACTION_NOOP, ACTION_START]), // prevEmit === 0
	Object.freeze([ACTION_END, ACTION_NOOP]), // prevEmit === 1
])

const DEFAULT_UNIVERSE = Object.freeze([-Infinity, Infinity])
const MAX_CACHE_SIZE = 1024

/**
 * Normalizes -0 to +0 while leaving all other numbers untouched.
 * @param {number} n
 * @returns {number}
 */
function canonicalNumber(n) {
	return n === 0 ? 0 : n
}

/**
 * Validates a single [lo, hi] real interval tuple.
 * @param {unknown} interval
 * @param {string} label
 * @returns {[number, number]}
 */
function validateInterval(interval, label) {
	if (!Array.isArray(interval) || interval.length !== 2) {
		throw new TypeError(`${label} must be a 2-element array [lo, hi]`)
	}
	const [rawLo, rawHi] = interval
	if (
		typeof rawLo !== 'number' ||
		typeof rawHi !== 'number' ||
		Number.isNaN(rawLo) ||
		Number.isNaN(rawHi)
	) {
		throw new TypeError(`${label} endpoints must be non-NaN numbers`)
	}
	if (rawLo > rawHi) {
		throw new RangeError(`${label} requires lo <= hi, got [${rawLo}, ${rawHi}]`)
	}
	return [canonicalNumber(rawLo), canonicalNumber(rawHi)]
}

/**
 * Compares two numbers safely even when both are +Infinity or -Infinity.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function compareNumbers(a, b) {
	return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Normalizes, clips to [uLo, uHi], sorts, and merges overlapping/touching intervals.
 * For non-degenerate universes (uLo < uHi), measure-zero intervals [x, x] are dropped
 * because closed real-interval complements merge at shared endpoints.
 * @param {Array<[number, number]>} validated
 * @param {number} uLo
 * @param {number} uHi
 * @returns {Array<[number, number]>}
 */
function normalizeAndClip(validated, uLo, uHi) {
	const clipped = []
	for (let i = 0; i < validated.length; i++) {
		const [lo, hi] = validated[i]
		const cLo = lo < uLo ? uLo : lo
		const cHi = hi > uHi ? uHi : hi
		if (cLo < cHi) {
			clipped.push([cLo, cHi])
		}
	}
	if (clipped.length <= 1) {
		return clipped
	}
	clipped.sort((a, b) => compareNumbers(a[0], b[0]) || compareNumbers(a[1], b[1]))
	const merged = [clipped[0]]
	for (let i = 1; i < clipped.length; i++) {
		const prev = merged[merged.length - 1]
		const cur = clipped[i]
		if (cur[0] <= prev[1]) {
			if (cur[1] > prev[1]) {
				prev[1] = cur[1]
			}
		} else {
			merged.push(cur)
		}
	}
	return merged
}

/**
 * Builds a canonical cache key for a normalized interval list and universe.
 * @param {Array<[number, number]>} normalized
 * @param {number} uLo
 * @param {number} uHi
 * @returns {string}
 */
function makeCacheKey(normalized, uLo, uHi) {
	let key = `${uLo},${uHi}|`
	for (let i = 0; i < normalized.length; i++) {
		if (i > 0) key += ';'
		key += `${normalized[i][0]},${normalized[i][1]}`
	}
	return key
}

/**
 * Clones an array of interval tuples so cached entries cannot be mutated by callers.
 * @param {ReadonlyArray<readonly [number, number]>} intervals
 * @returns {Array<[number, number]>}
 */
function cloneIntervals(intervals) {
	const out = new Array(intervals.length)
	for (let i = 0; i < intervals.length; i++) {
		out[i] = [intervals[i][0], intervals[i][1]]
	}
	return out
}

/**
 * Computes the normalized, merged complement U \ A via a table-driven event sweep.
 * Assumes `normalized` is sorted, disjoint, non-touching, and clipped to [uLo, uHi]
 * with uLo < uHi.
 * @param {Array<[number, number]>} normalized
 * @param {number} uLo
 * @param {number} uHi
 * @returns {Array<[number, number]>}
 */
function computeComplementTableDriven(normalized, uLo, uHi) {
	// Collect sweep events: { x, dSet, dUniv }
	const events = [
		{ x: uLo, dSet: 0, dUniv: 1 },
		{ x: uHi, dSet: 0, dUniv: -1 },
	]
	for (let i = 0; i < normalized.length; i++) {
		const [lo, hi] = normalized[i]
		events.push({ x: lo, dSet: 1, dUniv: 0 })
		events.push({ x: hi, dSet: -1, dUniv: 0 })
	}
	events.sort((a, b) => compareNumbers(a.x, b.x))

	const result = []
	let setDepth = 0
	let univDepth = 0
	let prevEmit = 0
	let segStart = 0

	let i = 0
	while (i < events.length) {
		const x = events[i].x
		while (i < events.length && events[i].x === x) {
			setDepth += events[i].dSet
			univDepth += events[i].dUniv
			i++
		}
		const state = (univDepth > 0 ? 2 : 0) | (setDepth > 0 ? 1 : 0)
		const nextEmit = EMIT_TABLE[state]
		const action = TRANSITION_TABLE[prevEmit][nextEmit]
		if (action === ACTION_START) {
			segStart = x
		} else if (action === ACTION_END && segStart < x) {
			result.push([segStart, x])
		}
		prevEmit = nextEmit
	}

	return result
}

/**
 * Precomputed lookup table for common canonical interval-set complements.
 * @type {Map<string, ReadonlyArray<readonly [number, number]>>}
 */
const PRECOMPUTED = new Map()

/**
 * Seeds the precomputed table with standard boundary, half-line, and unit cases.
 */
function seedPrecomputed() {
	const seeds = [
		{ intervals: [], universe: [-Infinity, Infinity] },
		{ intervals: [[-Infinity, Infinity]], universe: [-Infinity, Infinity] },
		{ intervals: [[-Infinity, 0]], universe: [-Infinity, Infinity] },
		{ intervals: [[0, Infinity]], universe: [-Infinity, Infinity] },
		{ intervals: [[0, 1]], universe: [-Infinity, Infinity] },
		{ intervals: [[-1, 1]], universe: [-Infinity, Infinity] },
		{ intervals: [], universe: [0, 1] },
		{ intervals: [[0, 1]], universe: [0, 1] },
		{ intervals: [[0, 0.5]], universe: [0, 1] },
		{ intervals: [[0.5, 1]], universe: [0, 1] },
	]
	for (const { intervals, universe } of seeds) {
		const [uLo, uHi] = universe
		const norm = normalizeAndClip(intervals, uLo, uHi)
		const key = makeCacheKey(norm, uLo, uHi)
		const value = computeComplementTableDriven(norm, uLo, uHi).map((iv) =>
			Object.freeze(iv),
		)
		PRECOMPUTED.set(key, Object.freeze(value))
	}
}
seedPrecomputed()

/**
 * Bounded LRU memoization cache for dynamically computed complements.
 * @type {Map<string, ReadonlyArray<readonly [number, number]>>}
 */
const memoCache = new Map()

/**
 * Computes the logical NOT (set complement) of a set of real intervals `[lo, hi]`,
 * returning a normalized, sorted, merged array of disjoint intervals.
 *
 * Uses a precomputed table for common canonical inputs, a bounded LRU memoization
 * cache keyed on canonicalized inputs, and a table-driven sweep-line state machine
 * on cache misses.
 *
 * Input intervals may be unsorted, overlapping, touching, or extend outside the
 * universe. Touching intervals `[a, b]` and `[b, c]` are treated as merged `[a, c]`.
 *
 * @param {Array<[number, number]>} intervals - Array of `[lo, hi]` real intervals (`lo <= hi`, non-NaN).
 * @param {[number, number]} [universe=[-Infinity, Infinity]] - Optional bounding universe `[uLo, uHi]`.
 * @returns {Array<[number, number]>} Normalized and merged complement intervals within `universe`.
 * @throws {TypeError} If `intervals` is not an array, any interval/universe is not a 2-number tuple, or contains `NaN`.
 * @throws {RangeError} If any interval or universe has `lo > hi`.
 */
export function notIntervalMemo(intervals, universe = DEFAULT_UNIVERSE) {
	if (!Array.isArray(intervals)) {
		throw new TypeError('intervals must be an array of [lo, hi] pairs')
	}

	const [uLo, uHi] = validateInterval(universe, 'universe')

	const validated = new Array(intervals.length)
	for (let i = 0; i < intervals.length; i++) {
		validated[i] = validateInterval(intervals[i], `intervals[${i}]`)
	}

	// Degenerate point universe [p, p]: complement is [] if p is covered, else [[p, p]].
	if (uLo === uHi) {
		for (let i = 0; i < validated.length; i++) {
			if (validated[i][0] <= uLo && uLo <= validated[i][1]) {
				return []
			}
		}
		return [[uLo, uHi]]
	}

	const normalized = normalizeAndClip(validated, uLo, uHi)
	const key = makeCacheKey(normalized, uLo, uHi)

	const precomputed = PRECOMPUTED.get(key)
	if (precomputed !== undefined) {
		return cloneIntervals(precomputed)
	}

	const cached = memoCache.get(key)
	if (cached !== undefined) {
		// Refresh LRU position
		memoCache.delete(key)
		memoCache.set(key, cached)
		return cloneIntervals(cached)
	}

	const computed = computeComplementTableDriven(normalized, uLo, uHi)
	const frozen = Object.freeze(computed.map((iv) => Object.freeze([iv[0], iv[1]])))

	if (memoCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = memoCache.keys().next().value
		memoCache.delete(oldestKey)
	}
	memoCache.set(key, frozen)

	return computed
}
