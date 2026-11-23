import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { notMultisetMemo } from './notMultisetMemo.js'

/**
 * Independent reference oracle using expanded bag arrays (no Map subtraction or tables).
 * Expands `universe` into repeated elements, removes one instance per element present in
 * `multiset`, and recounts the remaining elements into a `Map`.
 */
function naiveBagComplement(multiset, universe) {
	const bag = []
	for (const [k, count] of universe) {
		for (let i = 0; i < count; i += 1) {
			bag.push(k)
		}
	}
	for (const [k, count] of multiset) {
		for (let i = 0; i < count; i += 1) {
			const idx = bag.findIndex((item) => Object.is(item, k) || (item === 0 && k === 0))
			if (idx !== -1) {
				bag.splice(idx, 1)
			}
		}
	}
	const out = new Map()
	for (const item of bag) {
		out.set(item, (out.get(item) ?? 0) + 1)
	}
	return out
}

/** Independent multiset union (pointwise max) for De Morgan cross-checks. */
function multisetUnion(a, b) {
	const out = new Map()
	for (const [k, v] of a) {
		if (v > 0) out.set(k, v)
	}
	for (const [k, v] of b) {
		const prev = out.get(k) ?? 0
		const m = Math.max(prev, v)
		if (m > 0) out.set(k, m)
	}
	return out
}

/** Independent multiset intersection (pointwise min) for De Morgan cross-checks. */
function multisetIntersection(a, b) {
	const out = new Map()
	for (const [k, v] of a) {
		const bv = b.get(k) ?? 0
		const m = Math.min(v, bv)
		if (m > 0) out.set(k, m)
	}
	return out
}

/** Simple deterministic PRNG (LCG) for reproducible property tests. */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

beforeEach(() => {
	notMultisetMemo.clearCache()
})

test('normal cases: multiset complement over string and number keys', () => {
	const universe = new Map([
		['a', 5],
		['b', 3],
		['c', 2],
		['d', 1],
	])
	const input = new Map([
		['a', 2],
		['b', 3],
		['c', 0],
	])

	const result = notMultisetMemo(input, universe)
	assert.deepEqual(
		result,
		new Map([
			['a', 3],
			['c', 2],
			['d', 1],
		])
	)
})

test('normal cases: crisp sets (all counts 1) behave as exact set complement', () => {
	const universe = new Map([
		[1, 1],
		[2, 1],
		[3, 1],
		[4, 1],
	])
	const subset = new Map([
		[2, 1],
		[4, 1],
	])

	const result = notMultisetMemo(subset, universe)
	assert.deepEqual(
		result,
		new Map([
			[1, 1],
			[3, 1],
		])
	)
})

test('edge cases: empty multiset, empty universe, equal multisets, and zero entries', () => {
	const empty = new Map()
	const u = new Map([
		['x', 4],
		['zero', 0],
		['y', 2],
	])

	// NOT_U(empty) == normalized(U)
	assert.deepEqual(
		notMultisetMemo(empty, u),
		new Map([
			['x', 4],
			['y', 2],
		])
	)

	// NOT_U(U) == empty
	assert.deepEqual(notMultisetMemo(u, u), new Map())

	// NOT_empty(A) == empty
	assert.deepEqual(notMultisetMemo(u, empty), new Map())

	// NOT_empty(empty) == empty
	assert.deepEqual(notMultisetMemo(empty, empty), new Map())
})

test('edge cases: truncated subtraction (monus) when input count exceeds universe or key is absent from universe', () => {
	const universe = new Map([
		['a', 2],
		['b', 5],
	])
	const input = new Map([
		['a', 10],
		['b', 1],
		['extra', 7],
	])

	assert.deepEqual(notMultisetMemo(input, universe), new Map([['b', 4]]))
})

test('edge cases: diverse JS key types (primitives, -0/+0, NaN, bigint, symbols, objects, functions)', () => {
	const objA = { id: 1 }
	const objB = { id: 1 }
	const fn = () => {}
	const localSym = Symbol('local')
	const globalSym = Symbol.for('notMultisetMemo.test.sym')

	const universe = new Map([
		['1', 3],
		[1, 4],
		[1n, 5],
		[true, 2],
		[false, 2],
		[null, 3],
		[undefined, 3],
		[-0, 2],
		[NaN, 3],
		[objA, 4],
		[objB, 4],
		[fn, 2],
		[localSym, 3],
		[globalSym, 3],
		[Symbol.iterator, 2],
	])

	const input = new Map([
		['1', 1],
		[1, 2],
		[1n, 5],
		[true, 1],
		[null, 1],
		[+0, 1],
		[NaN, 2],
		[objA, 3],
		[fn, 2],
		[localSym, 1],
		[Symbol.for('notMultisetMemo.test.sym'), 2],
		[Symbol.iterator, 1],
	])

	const result = notMultisetMemo(input, universe)
	assert.equal(result.get('1'), 2)
	assert.equal(result.get(1), 2)
	assert.equal(result.has(1n), false)
	assert.equal(result.get(true), 1)
	assert.equal(result.get(false), 2)
	assert.equal(result.get(null), 2)
	assert.equal(result.get(undefined), 3)
	assert.equal(result.get(0), 1)
	assert.equal(result.get(NaN), 1)
	assert.equal(result.get(objA), 1)
	assert.equal(result.get(objB), 4)
	assert.equal(result.has(fn), false)
	assert.equal(result.get(localSym), 2)
	assert.equal(result.get(globalSym), 1)
	assert.equal(result.get(Symbol.iterator), 1)
})

test('edge cases: counts at and beyond TABLE_LIMIT and MAX_SAFE_INTEGER', () => {
	const limit = notMultisetMemo.getStats().tableLimit
	const big = Number.MAX_SAFE_INTEGER
	const universe = new Map([
		['atLimit', limit],
		['aboveLimit', limit + 100],
		['huge', big],
		['hugeZero', big],
	])
	const input = new Map([
		['atLimit', 10],
		['aboveLimit', 25],
		['huge', 12345],
		['hugeZero', big],
	])

	const result = notMultisetMemo(input, universe)
	assert.deepEqual(
		result,
		new Map([
			['atLimit', limit - 10],
			['aboveLimit', limit + 75],
			['huge', big - 12345],
		])
	)

	const s = notMultisetMemo.getStats()
	assert.equal(s.tableHits, 1)
	assert.equal(s.tableFallbacks, 3)
})

test('memoization: structural hits, order independence, zero-entry equivalence, and mutation safety', () => {
	const u1 = new Map([
		['a', 5],
		['b', 3],
	])
	const a1 = new Map([
		['a', 2],
		['b', 1],
	])

	const r1 = notMultisetMemo(a1, u1)
	assert.equal(notMultisetMemo.getStats().misses, 1)
	assert.equal(notMultisetMemo.getStats().hits, 0)
	assert.equal(notMultisetMemo.getStats().size, 1)

	// Reordered insertion order + explicit zero entry should hit the cache
	const u2 = new Map([
		['b', 3],
		['z', 0],
		['a', 5],
	])
	const a2 = new Map([
		['b', 1],
		['a', 2],
		['unused', 0],
	])
	const r2 = notMultisetMemo(a2, u2)
	assert.deepEqual(r2, r1)
	assert.notEqual(r2, r1, 'must return a fresh Map clone on cache hit')
	assert.equal(notMultisetMemo.getStats().hits, 1)
	assert.equal(notMultisetMemo.getStats().misses, 1)

	// Mutating returned Map must not corrupt cached result
	r2.set('a', 999)
	r2.set('injected', 1)
	const r3 = notMultisetMemo(a1, u1)
	assert.deepEqual(
		r3,
		new Map([
			['a', 3],
			['b', 2],
		])
	)
	assert.equal(notMultisetMemo.getStats().hits, 2)

	// Mutating input Map after caching must produce a new cache miss, never stale data
	a1.set('a', 4)
	const r4 = notMultisetMemo(a1, u1)
	assert.deepEqual(
		r4,
		new Map([
			['a', 1],
			['b', 2],
		])
	)
	assert.equal(notMultisetMemo.getStats().misses, 2)
})

test('memoization: custom cache, maxCacheSize=0 bypass, and bounded LRU eviction', () => {
	const customCache = new Map()
	const u = new Map([['k', 10]])

	notMultisetMemo(new Map([['k', 1]]), u, { cache: customCache, maxCacheSize: 2 })
	notMultisetMemo(new Map([['k', 2]]), u, { cache: customCache, maxCacheSize: 2 })
	assert.equal(customCache.size, 2)
	// Default cache was untouched
	assert.equal(notMultisetMemo.getStats().size, 0)

	// Touch entry 1 so entry 2 becomes LRU
	notMultisetMemo(new Map([['k', 1]]), u, { cache: customCache, maxCacheSize: 2 })
	// Insert entry 3 -> evicts entry 2
	notMultisetMemo(new Map([['k', 3]]), u, { cache: customCache, maxCacheSize: 2 })
	assert.equal(customCache.size, 2)

	const keys = [...customCache.keys()]
	assert.equal(
		keys.some((k) => k.includes('=2\x01')),
		false,
		'least-recently-used entry should be evicted'
	)
	assert.equal(
		keys.some((k) => k.includes('=1\x01')),
		true,
		'recently-used entry should be retained'
	)

	// maxCacheSize: 0 disables storing into cache
	const noCache = new Map()
	const res = notMultisetMemo(new Map([['k', 4]]), u, { cache: noCache, maxCacheSize: 0 })
	assert.deepEqual(res, new Map([['k', 6]]))
	assert.equal(noCache.size, 0)
})

test('memoization: string keys with null bytes and special characters do not collide', () => {
	const u = new Map([
		['a\x00b=1', 5],
		['a', 5],
		['b', 5],
	])
	const m1 = new Map([['a\x00b=1', 2]])
	const m2 = new Map([
		['a', 2],
		['b', 1],
	])

	const r1 = notMultisetMemo(m1, u)
	const r2 = notMultisetMemo(m2, u)
	assert.deepEqual(
		r1,
		new Map([
			['a\x00b=1', 3],
			['a', 5],
			['b', 5],
		])
	)
	assert.deepEqual(
		r2,
		new Map([
			['a\x00b=1', 5],
			['a', 3],
			['b', 4],
		])
	)
	assert.equal(notMultisetMemo.getStats().misses, 2)
})

test('error handling: invalid multiset, universe, counts, and options', () => {
	const valid = new Map([['a', 1]])

	// Non-Map inputs
	for (const bad of [null, undefined, {}, [], new Set(), 'abc', 42]) {
		assert.throws(() => notMultisetMemo(bad, valid), TypeError)
		assert.throws(() => notMultisetMemo(valid, bad), TypeError)
	}

	// Non-number counts
	for (const badCount of ['1', null, undefined, 1n, true, {}]) {
		assert.throws(() => notMultisetMemo(new Map([['a', badCount]]), valid), TypeError)
		assert.throws(() => notMultisetMemo(valid, new Map([['a', badCount]])), TypeError)
	}

	// Out-of-range / non-integer / non-finite / unsafe counts
	for (const badCount of [-1, -0.5, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
		assert.throws(() => notMultisetMemo(new Map([['a', badCount]]), valid), RangeError)
		assert.throws(() => notMultisetMemo(valid, new Map([['a', badCount]])), RangeError)
	}

	// Invalid count on a key not in universe must still be validated
	assert.throws(() => notMultisetMemo(new Map([['outside', -3]]), valid), RangeError)

	// Invalid options
	assert.throws(() => notMultisetMemo(valid, valid, null), TypeError)
	assert.throws(() => notMultisetMemo(valid, valid, []), TypeError)
	assert.throws(() => notMultisetMemo(valid, valid, 'bad'), TypeError)
	assert.throws(() => notMultisetMemo(valid, valid, { cache: {} }), TypeError)
	assert.throws(() => notMultisetMemo(valid, valid, { maxCacheSize: '10' }), TypeError)
	assert.throws(() => notMultisetMemo(valid, valid, { maxCacheSize: -1 }), RangeError)
	assert.throws(() => notMultisetMemo(valid, valid, { maxCacheSize: 1.5 }), RangeError)
	assert.throws(() => notMultisetMemo(valid, valid, { maxCacheSize: Infinity }), RangeError)
})

test('independent cross-check: matches array-bag oracle across 100 randomized cases', () => {
	const rng = makeRng(20261123)
	const domain = ['alpha', 'beta', 'gamma', 0, 1, 2, null, undefined]

	for (let trial = 0; trial < 100; trial += 1) {
		const universe = new Map()
		const input = new Map()
		for (const key of domain) {
			if (rng() < 0.75) {
				universe.set(key, Math.floor(rng() * 12))
			}
			if (rng() < 0.75) {
				input.set(key, Math.floor(rng() * 14))
			}
		}

		const actual = notMultisetMemo(input, universe)
		const expected = naiveBagComplement(input, universe)
		assert.deepEqual(actual, expected, `mismatch on randomized trial ${trial}`)
	}
})

test('independent cross-check: counting-logic involution, De Morgan laws, and cardinality conservation', () => {
	const rng = makeRng(987654321)
	const domain = ['x', 'y', 'z', 'w', 'v']

	for (let trial = 0; trial < 50; trial += 1) {
		const universe = new Map()
		const a = new Map()
		const b = new Map()

		for (const key of domain) {
			// Mix counts inside and outside TABLE_LIMIT
			const maxCount = trial % 5 === 0 ? 150 : 20
			const uVal = Math.floor(rng() * maxCount)
			universe.set(key, uVal)
			a.set(key, Math.floor(rng() * (uVal + 1)))
			b.set(key, Math.floor(rng() * (uVal + 1)))
		}

		const notA = notMultisetMemo(a, universe)
		const notB = notMultisetMemo(b, universe)

		// 1. Involution: NOT_U(NOT_U(A)) == normalized(A) for A <= U
		const normalizedA = new Map([...a].filter(([, c]) => c > 0))
		assert.deepEqual(notMultisetMemo(notA, universe), normalizedA)

		// 2. De Morgan 1: NOT_U(A union B) == NOT_U(A) intersect NOT_U(B)
		assert.deepEqual(
			notMultisetMemo(multisetUnion(a, b), universe),
			multisetIntersection(notA, notB)
		)

		// 3. De Morgan 2: NOT_U(A intersect B) == NOT_U(A) union NOT_U(B)
		assert.deepEqual(
			notMultisetMemo(multisetIntersection(a, b), universe),
			multisetUnion(notA, notB)
		)

		// 4. Cardinality conservation: |A| + |NOT_U(A)| == |U|
		const sum = (m) => [...m.values()].reduce((acc, v) => acc + v, 0)
		assert.equal(sum(a) + sum(notA), sum(universe))
	}
})
