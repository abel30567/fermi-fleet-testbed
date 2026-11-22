import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { notMultisetRecursive } from './notMultisetRecursive.js'

/**
 * Independent iterative reference implementation for cross-checking.
 */
function notMultisetIterativeRef(a, universe) {
	const out = new Map()
	for (const [key, countU] of universe) {
		const countA = a.get(key) ?? 0
		const remaining = Math.max(0, countU - countA)
		if (remaining > 0) {
			out.set(key, remaining)
		}
	}
	return out
}

function normalizeMultiset(m) {
	const out = new Map()
	for (const [key, count] of m) {
		if (count > 0) {
			out.set(key, count)
		}
	}
	return out
}

function multisetUnionMax(a, b) {
	const out = new Map()
	for (const [key, count] of a) {
		if (count > 0) out.set(key, count)
	}
	for (const [key, count] of b) {
		const next = Math.max(out.get(key) ?? 0, count)
		if (next > 0) out.set(key, next)
	}
	return out
}

function multisetIntersectMin(a, b) {
	const out = new Map()
	for (const [key, countA] of a) {
		const countB = b.get(key) ?? 0
		const next = Math.min(countA, countB)
		if (next > 0) out.set(key, next)
	}
	return out
}

describe('notMultisetRecursive', () => {
	it('computes normal multiset complement and omits zero-count entries', () => {
		const a = new Map([
			['apple', 2],
			['banana', 3],
			['cherry', 0],
		])
		const universe = new Map([
			['apple', 5],
			['banana', 3],
			['cherry', 2],
			['date', 4],
		])

		const result = notMultisetRecursive(a, universe)
		assert.deepEqual(
			result,
			new Map([
				['apple', 3],
				['cherry', 2],
				['date', 4],
			]),
		)
		assert.equal(result.has('banana'), false)
	})

	it('returns a copy of universe when a is empty (omitting zero counts in universe)', () => {
		const a = new Map()
		const universe = new Map([
			['x', 4],
			['y', 0],
			['z', 1],
		])

		const result = notMultisetRecursive(a, universe)
		assert.notEqual(result, universe)
		assert.deepEqual(
			result,
			new Map([
				['x', 4],
				['z', 1],
			]),
		)
	})

	it('returns an empty Map when a equals universe', () => {
		const universe = new Map([
			['a', 1],
			['b', 5],
			['c', 0],
		])
		const a = new Map(universe)

		const result = notMultisetRecursive(a, universe)
		assert.deepEqual(result, new Map())
		assert.equal(result.size, 0)
	})

	it('clamps counts exceeding universe to 0 and omits them', () => {
		const a = new Map([
			['p', 10],
			['q', 4],
			['r', 1],
		])
		const universe = new Map([
			['p', 3],
			['q', 4],
			['r', 5],
		])

		const result = notMultisetRecursive(a, universe)
		assert.deepEqual(result, new Map([['r', 4]]))
	})

	it('ignores keys in a that are outside universe', () => {
		const a = new Map([
			['inU', 1],
			['outside1', 99],
			['outside2', 0],
		])
		const universe = new Map([
			['inU', 3],
			['onlyU', 2],
		])

		const result = notMultisetRecursive(a, universe)
		assert.deepEqual(
			result,
			new Map([
				['inU', 2],
				['onlyU', 2],
			]),
		)
	})

	it('returns an empty Map when universe is empty', () => {
		const a = new Map([
			['a', 2],
			['b', 3],
		])
		const universe = new Map()

		assert.deepEqual(notMultisetRecursive(a, universe), new Map())
		assert.deepEqual(notMultisetRecursive(new Map(), universe), new Map())
	})

	it('handles single-element and diverse key types including objects, symbols, null, undefined, and NaN', () => {
		const objKey = { id: 1 }
		const symKey = Symbol('k')

		assert.deepEqual(
			notMultisetRecursive(new Map([[objKey, 1]]), new Map([[objKey, 4]])),
			new Map([[objKey, 3]]),
		)
		assert.deepEqual(
			notMultisetRecursive(new Map([[objKey, 4]]), new Map([[objKey, 4]])),
			new Map(),
		)

		const a = new Map([
			[objKey, 1],
			[symKey, 2],
			[null, 0],
			[undefined, 3],
			[Number.NaN, 1],
		])
		const universe = new Map([
			[objKey, 3],
			[symKey, 2],
			[null, 5],
			[undefined, 2],
			[Number.NaN, 4],
		])

		const result = notMultisetRecursive(a, universe)
		assert.deepEqual(
			result,
			new Map([
				[objKey, 2],
				[null, 5],
				[Number.NaN, 3],
			]),
		)
	})

	it('preserves key insertion order of universe across divide-and-conquer merges', () => {
		const keys = Array.from({ length: 17 }, (_, i) => `k${i}`)
		const universe = new Map(keys.map((k, i) => [k, i + 1]))
		const a = new Map(keys.map((k, i) => [k, i % 3 === 0 ? i + 1 : 1]))

		const result = notMultisetRecursive(a, universe)
		const expectedKeys = keys.filter((_, i) => i % 3 !== 0 && i + 1 - 1 > 0)
		assert.deepEqual(Array.from(result.keys()), expectedKeys)
	})

	it('does not mutate inputs and returns an independent Map', () => {
		const a = new Map([
			['a', 2],
			['b', 1],
		])
		const universe = new Map([
			['a', 5],
			['b', 3],
			['c', 4],
		])
		const aSnapshot = Array.from(a.entries())
		const uSnapshot = Array.from(universe.entries())

		const result = notMultisetRecursive(a, universe)
		result.set('a', 999)
		result.set('newKey', 42)

		assert.deepEqual(Array.from(a.entries()), aSnapshot)
		assert.deepEqual(Array.from(universe.entries()), uSnapshot)
	})

	it('validates inputs and rejects non-Maps and invalid counts', () => {
		const valid = new Map([['x', 1]])

		for (const badMap of [null, undefined, {}, [], new Set(['x']), 'map', 42]) {
			assert.throws(() => notMultisetRecursive(badMap, valid), TypeError)
			assert.throws(() => notMultisetRecursive(valid, badMap), TypeError)
		}

		for (const badType of ['1', null, undefined, true, 1n, {}, []]) {
			assert.throws(
				() => notMultisetRecursive(new Map([['x', badType]]), valid),
				TypeError,
			)
			assert.throws(
				() => notMultisetRecursive(valid, new Map([['x', badType]])),
				TypeError,
			)
		}

		for (const badRange of [
			-1,
			-100,
			0.5,
			1.25,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
			Number.MAX_SAFE_INTEGER + 1,
		]) {
			assert.throws(
				() => notMultisetRecursive(new Map([['x', badRange]]), valid),
				RangeError,
			)
			assert.throws(
				() => notMultisetRecursive(valid, new Map([['x', badRange]])),
				RangeError,
			)
		}

		// Invalid counts in `a` outside `universe` must still be rejected.
		assert.throws(
			() => notMultisetRecursive(new Map([['outside', -2]]), valid),
			RangeError,
		)
	})

	it('matches an independent iterative reference across varied sizes and distributions', () => {
		// Deterministic PRNG (Mulberry32) for reproducible fuzzing.
		let seed = 0x5f3759df
		const rand = () => {
			seed = (seed + 0x6d2b79f5) | 0
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296
		}
		const randInt = (max) => Math.floor(rand() * (max + 1))

		for (const universeSize of [0, 1, 2, 3, 4, 7, 16, 31, 64, 250]) {
			const universe = new Map()
			const a = new Map()

			for (let i = 0; i < universeSize; i++) {
				universe.set(`u${i}`, randInt(10))
				if (rand() < 0.75) {
					a.set(`u${i}`, randInt(12))
				}
			}
			// Extra keys in `a` outside `universe`.
			for (let j = 0; j < 5; j++) {
				a.set(`extra${j}`, randInt(8))
			}

			const actual = notMultisetRecursive(a, universe)
			const expected = notMultisetIterativeRef(a, universe)
			assert.deepEqual(actual, expected)
		}
	})

	it('satisfies double negation, additive complement, and De Morgan identities', () => {
		const universe = new Map([
			['a', 5],
			['b', 3],
			['c', 7],
			['d', 1],
			['e', 4],
			['f', 0],
		])
		const subA = new Map([
			['a', 2],
			['b', 3],
			['c', 0],
			['e', 1],
		])
		const subB = new Map([
			['a', 4],
			['b', 1],
			['c', 5],
			['d', 1],
		])

		// Double negation: not(not(a, U), U) === normalized(a) whenever a <= U.
		const notA = notMultisetRecursive(subA, universe)
		const notNotA = notMultisetRecursive(notA, universe)
		assert.deepEqual(notNotA, normalizeMultiset(subA))

		// Additive complement: count(a, x) + count(not(a, U), x) === count(U, x) when a <= U.
		let totalA = 0
		let totalNotA = 0
		let totalU = 0
		for (const [key, countU] of universe) {
			const cA = subA.get(key) ?? 0
			const cNotA = notA.get(key) ?? 0
			assert.equal(cA + cNotA, countU)
			totalA += cA
			totalNotA += cNotA
			totalU += countU
		}
		assert.equal(totalA + totalNotA, totalU)

		// Multiset De Morgan laws:
		// not(union(A, B), U) === intersect(not(A, U), not(B, U))
		// not(intersect(A, B), U) === union(not(A, U), not(B, U))
		const notB = notMultisetRecursive(subB, universe)
		assert.deepEqual(
			notMultisetRecursive(multisetUnionMax(subA, subB), universe),
			multisetIntersectMin(notA, notB),
		)
		assert.deepEqual(
			notMultisetRecursive(multisetIntersectMin(subA, subB), universe),
			multisetUnionMax(notA, notB),
		)
	})
})
