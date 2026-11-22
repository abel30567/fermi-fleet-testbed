import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { notMultisetIterative } from './notMultisetIterative.js'

/**
 * Canonicalizes a multiset Map by removing entries with count 0.
 *
 * @template T
 * @param {Map<T, number>} m
 * @returns {Map<T, number>}
 */
function canonicalize(m) {
	const out = new Map()
	for (const [k, v] of m) {
		if (v > 0) {
			out.set(k, v)
		}
	}
	return out
}

/**
 * Expands a multiset Map into a sorted flat array (bag representation).
 *
 * @param {Map<string, number>} m
 * @returns {string[]}
 */
function expandBag(m) {
	const bag = []
	for (const [key, count] of m) {
		for (let i = 0; i < count; i++) {
			bag.push(key)
		}
	}
	bag.sort()
	return bag
}

/**
 * Independent reference implementation via bag-subtraction array expansion:
 * removes one matching element from `universeBag` for each element in `multisetBag`.
 *
 * @param {Map<string, number>} multiset
 * @param {Map<string, number>} universe
 * @returns {string[]}
 */
function bagSubtractReference(multiset, universe) {
	const remaining = expandBag(universe)
	for (const item of expandBag(multiset)) {
		const idx = remaining.indexOf(item)
		if (idx !== -1) {
			remaining.splice(idx, 1)
		}
	}
	remaining.sort()
	return remaining
}

/**
 * Deterministic LCG PRNG for reproducible property-style tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return state
	}
}

describe('notMultisetIterative', () => {
	describe('normal cases', () => {
		it('computes elementwise complement relative to universe and omits zero counts', () => {
			const multiset = new Map([
				['a', 1],
				['b', 2]
			])
			const universe = new Map([
				['a', 3],
				['b', 2],
				['c', 4]
			])

			const result = notMultisetIterative(multiset, universe)

			assert.deepEqual(
				result,
				new Map([
					['a', 2],
					['c', 4]
				])
			)
			assert.equal(result.has('b'), false)
		})

		it('returns a canonical copy of universe when multiset and universe are disjoint', () => {
			const multiset = new Map([
				['x', 2],
				['y', 1]
			])
			const universe = new Map([
				['a', 2],
				['b', 5]
			])

			const result = notMultisetIterative(multiset, universe)

			assert.deepEqual(result, universe)
			assert.notEqual(result, universe)
		})

		it('returns an empty Map when multiset equals universe', () => {
			const universe = new Map([
				['a', 3],
				['b', 1]
			])
			const multiset = new Map(universe)

			assert.deepEqual(notMultisetIterative(multiset, universe), new Map())
			// Same Map instance passed for both arguments
			assert.deepEqual(notMultisetIterative(universe, universe), new Map())
		})
	})

	describe('edge cases', () => {
		it('handles empty inputs', () => {
			const empty = new Map()
			const universe = new Map([
				['a', 2],
				['b', 0],
				['c', 1]
			])

			assert.deepEqual(notMultisetIterative(empty, empty), new Map())
			assert.deepEqual(
				notMultisetIterative(empty, universe),
				new Map([
					['a', 2],
					['c', 1]
				])
			)
			assert.deepEqual(notMultisetIterative(universe, empty), new Map())
		})

		it('omits zero and negative-zero counts from canonical output', () => {
			const multiset = new Map([
				['a', 0],
				['b', -0],
				['c', 2]
			])
			const universe = new Map([
				['a', 3],
				['b', 0],
				['c', 2],
				['d', -0]
			])

			const result = notMultisetIterative(multiset, universe)

			assert.deepEqual(result, new Map([['a', 3]]))
		})

		it('clamps excess counts to 0 and ignores keys outside universe', () => {
			const multiset = new Map([
				['a', 10],
				['b', 1],
				['outside', 7]
			])
			const universe = new Map([
				['a', 3],
				['b', 4]
			])

			const result = notMultisetIterative(multiset, universe)

			assert.deepEqual(result, new Map([['b', 3]]))
		})

		it('supports arbitrary Map key types with SameValueZero semantics', () => {
			const objKey = { id: 1 }
			const symKey = Symbol('k')
			const multiset = new Map([
				[NaN, 1],
				[-0, 2],
				[objKey, 3],
				[symKey, 1],
				[null, 1],
				[undefined, 2],
				[true, 0]
			])
			const universe = new Map([
				[NaN, 3],
				[0, 5],
				[objKey, 3],
				[symKey, 4],
				[null, 2],
				[undefined, 5],
				[true, 2]
			])

			const result = notMultisetIterative(multiset, universe)

			assert.deepEqual(
				result,
				new Map([
					[NaN, 2],
					[0, 3],
					[symKey, 3],
					[null, 1],
					[undefined, 3],
					[true, 2]
				])
			)
		})

		it('handles Number.MAX_SAFE_INTEGER counts exactly', () => {
			const max = Number.MAX_SAFE_INTEGER
			const multiset = new Map([
				['a', 1],
				['b', max],
				['c', max - 5]
			])
			const universe = new Map([
				['a', max],
				['b', max],
				['c', max]
			])

			const result = notMultisetIterative(multiset, universe)

			assert.deepEqual(
				result,
				new Map([
					['a', max - 1],
					['c', 5]
				])
			)
		})

		it('does not mutate either input Map', () => {
			const multiset = new Map([
				['a', 2],
				['b', 0],
				['extra', 5]
			])
			const universe = new Map([
				['a', 5],
				['b', 0],
				['c', 3]
			])
			const multisetBefore = [...multiset.entries()]
			const universeBefore = [...universe.entries()]

			const result = notMultisetIterative(multiset, universe)
			result.set('mutated', 99)

			assert.deepEqual([...multiset.entries()], multisetBefore)
			assert.deepEqual([...universe.entries()], universeBefore)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when multiset or universe is not a Map', () => {
			const valid = new Map([['a', 1]])
			const invalidMaps = [null, undefined, {}, [], new Set(['a']), 123, 'map', true]

			for (const bad of invalidMaps) {
				assert.throws(() => notMultisetIterative(bad, valid), TypeError)
				assert.throws(() => notMultisetIterative(valid, bad), TypeError)
			}
		})

		it('throws TypeError for non-number counts in either Map', () => {
			const valid = new Map([['a', 1]])
			const badCounts = ['1', 1n, null, undefined, true, {}, []]

			for (const bad of badCounts) {
				assert.throws(
					() => notMultisetIterative(new Map([['a', bad]]), valid),
					TypeError
				)
				assert.throws(
					() => notMultisetIterative(valid, new Map([['a', bad]])),
					TypeError
				)
			}
		})

		it('throws RangeError for non-finite, negative, non-integer, or unsafe integer counts', () => {
			const valid = new Map([['a', 1]])
			const badCounts = [
				NaN,
				Infinity,
				-Infinity,
				-1,
				-0.5,
				1.5,
				Number.MAX_SAFE_INTEGER + 1,
				1e20
			]

			for (const bad of badCounts) {
				assert.throws(
					() => notMultisetIterative(new Map([['a', bad]]), valid),
					RangeError
				)
				assert.throws(
					() => notMultisetIterative(valid, new Map([['a', bad]])),
					RangeError
				)
			}
		})

		it('still validates counts in multiset for keys absent from universe', () => {
			const emptyUniverse = new Map()
			assert.throws(
				() => notMultisetIterative(new Map([['outside', -2]]), emptyUniverse),
				RangeError
			)
			assert.throws(
				() => notMultisetIterative(new Map([['outside', '2']]), emptyUniverse),
				TypeError
			)
		})

		it('formats null-prototype object keys safely when throwing validation errors', () => {
			const nullProtoKey = Object.create(null)
			assert.throws(
				() => notMultisetIterative(new Map([[nullProtoKey, -1]]), new Map()),
				RangeError
			)
		})
	})

	describe('cross-checks', () => {
		it('satisfies involution not(not(A, U), U) == A whenever A <= U', () => {
			const rng = makeRng(0x5eed1234)
			const alphabet = ['a', 'b', 'c', 'd', 'e', 'f']

			for (let trial = 0; trial < 50; trial++) {
				const U = new Map()
				const A = new Map()

				for (const key of alphabet) {
					const uCount = rng() % 8
					if (uCount > 0 || rng() % 4 === 0) {
						U.set(key, uCount)
					}
					const aCount = uCount === 0 ? 0 : rng() % (uCount + 1)
					if (aCount > 0 || rng() % 5 === 0) {
						A.set(key, aCount)
					}
				}

				const comp = notMultisetIterative(A, U)
				const doubleComp = notMultisetIterative(comp, U)

				// Involution: not(not(A, U), U) equals canonical A
				assert.deepEqual(doubleComp, canonicalize(A))

				// Additive partition: A + not(A, U) equals canonical U
				const sum = new Map()
				for (const key of alphabet) {
					const total = (A.get(key) ?? 0) + (comp.get(key) ?? 0)
					if (total > 0) {
						sum.set(key, total)
					}
				}
				assert.deepEqual(sum, canonicalize(U))
			}
		})

		it('satisfies generalized double complement not(not(A, U), U) == A ∩ U when A is not bounded by U', () => {
			const A = new Map([
				['a', 7],
				['b', 2],
				['c', 0],
				['outside', 4]
			])
			const U = new Map([
				['a', 3],
				['b', 5],
				['d', 2]
			])

			const doubleComp = notMultisetIterative(notMultisetIterative(A, U), U)
			const expectedIntersection = new Map([
				['a', 3],
				['b', 2]
			])

			assert.deepEqual(doubleComp, expectedIntersection)
		})

		it('matches independent bag-subtraction array expansion across deterministic cases', () => {
			const fixedCases = [
				[
					new Map([
						['a', 1],
						['b', 3]
					]),
					new Map([
						['a', 4],
						['b', 3],
						['c', 2]
					])
				],
				[
					new Map([
						['a', 5],
						['z', 2]
					]),
					new Map([
						['a', 2],
						['b', 1]
					])
				],
				[new Map(), new Map([['x', 3]])],
				[new Map([['x', 3]]), new Map()]
			]

			for (const [A, U] of fixedCases) {
				const actual = notMultisetIterative(A, U)
				assert.deepEqual(expandBag(actual), bagSubtractReference(A, U))
			}

			const rng = makeRng(0xbadc0ffe)
			const alphabet = ['p', 'q', 'r', 's', 't', 'u']

			for (let trial = 0; trial < 50; trial++) {
				const A = new Map()
				const U = new Map()

				for (const key of alphabet) {
					const uCount = rng() % 6
					const aCount = rng() % 7 // intentionally allows aCount > uCount and outside keys
					if (uCount > 0 || rng() % 3 === 0) {
						U.set(key, uCount)
					}
					if (aCount > 0 || rng() % 3 === 0) {
						A.set(key, aCount)
					}
				}

				const actual = notMultisetIterative(A, U)
				assert.deepEqual(expandBag(actual), bagSubtractReference(A, U))
			}
		})
	})
})
