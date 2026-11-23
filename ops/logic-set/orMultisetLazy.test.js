import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { orMultisetLazy } from './orMultisetLazy.js'

/**
 * Independent naive reference implementation of multiset OR over plain arrays of Maps.
 * Computes max multiplicity per key and excludes zero counts.
 */
function naiveMultisetOr(maps) {
	const allKeys = new Set()
	for (const m of maps) {
		for (const k of m.keys()) {
			allKeys.add(k)
		}
	}
	const result = new Map()
	for (const k of allKeys) {
		let max = 0
		for (const m of maps) {
			const c = m.has(k) ? m.get(k) : 0
			if (c > max) max = c
		}
		if (max > 0) {
			result.set(k, max)
		}
	}
	return result
}

describe('orMultisetLazy', () => {
	describe('normal cases', () => {
		test('computes max count across two Maps with overlapping and disjoint keys', () => {
			const a = new Map([
				['x', 2],
				['y', 5],
				['z', 1],
			])
			const b = new Map([
				['y', 3],
				['z', 4],
				['w', 2],
			])

			const result = new Map(orMultisetLazy(a, b))
			assert.deepEqual(
				result,
				new Map([
					['x', 2],
					['y', 5],
					['z', 4],
					['w', 2],
				])
			)
		})

		test('computes OR across three or more Maps', () => {
			const a = new Map([['a', 1], ['b', 4]])
			const b = new Map([['b', 2], ['c', 3]])
			const c = new Map([['a', 5], ['c', 1], ['d', 2]])

			const result = new Map(orMultisetLazy(a, b, c))
			assert.deepEqual(
				result,
				new Map([
					['a', 5],
					['b', 4],
					['c', 3],
					['d', 2],
				])
			)
		})

		test('accepts a single Map and preserves positive counts without mutating input', () => {
			const a = new Map([
				['a', 3],
				['b', 0],
				['c', 1],
			])
			const result = new Map(orMultisetLazy(a))
			assert.deepEqual(
				result,
				new Map([
					['a', 3],
					['c', 1],
				])
			)
			assert.equal(a.get('b'), 0)
			assert.equal(a.size, 3)
		})

		test('accepts a unary iterable (array, Set, or generator) of Maps', () => {
			const m1 = new Map([['a', 2], ['b', 1]])
			const m2 = new Map([['b', 4], ['c', 3]])
			const m3 = new Map([['a', 1], ['d', 2]])

			function* genMaps() {
				yield m1
				yield m2
				yield m3
			}

			const expected = new Map([
				['a', 2],
				['b', 4],
				['c', 3],
				['d', 2],
			])

			assert.deepEqual(new Map(orMultisetLazy([m1, m2, m3])), expected)
			assert.deepEqual(new Map(orMultisetLazy(new Set([m1, m2, m3]))), expected)
			assert.deepEqual(new Map(orMultisetLazy(genMaps())), expected)
		})

		test('accepts entry iterables and mixed Map + entry-generator inputs', () => {
			function* entriesA() {
				yield ['k1', 2]
				yield ['k2', 1]
				yield ['k1', 5] // duplicate key in stream takes max
			}
			const mapB = new Map([
				['k2', 3],
				['k3', 4],
			])

			assert.deepEqual(
				new Map(orMultisetLazy(entriesA(), mapB)),
				new Map([
					['k1', 5],
					['k2', 3],
					['k3', 4],
				])
			)

			// Unary iterable of entries
			assert.deepEqual(
				new Map(orMultisetLazy(entriesA())),
				new Map([
					['k1', 5],
					['k2', 1],
				])
			)

			// Unary iterable of entry-arrays (sequence of multisets)
			assert.deepEqual(
				new Map(
					orMultisetLazy([
						[
							['a', 1],
							['b', 2],
						],
						[
							['b', 5],
							['c', 1],
						],
					])
				),
				new Map([
					['a', 1],
					['b', 5],
					['c', 1],
				])
			)
		})

		test('supports diverse Map key types (objects, symbols, NaN, -0/+0, null, undefined, arrays)', () => {
			const objKey = { id: 1 }
			const symKey = Symbol('s')
			const arrKey = [1, 2]

			const a = new Map([
				[objKey, 2],
				[symKey, 1],
				[NaN, 3],
				[-0, 4],
				[null, 1],
				[undefined, 2],
			])
			const b = new Map([
				[objKey, 5],
				[NaN, 1],
				[0, 6],
				[null, 3],
			])

			const res = new Map(orMultisetLazy(a, b))
			assert.equal(res.get(objKey), 5)
			assert.equal(res.get(symKey), 1)
			assert.equal(res.get(NaN), 3)
			assert.equal(res.get(0), 6)
			assert.equal(res.get(null), 3)
			assert.equal(res.get(undefined), 2)
			assert.equal(res.size, 6)

			// Entry iterable with an array key
			const arrRes = new Map(orMultisetLazy([[arrKey, 3]]))
			assert.equal(arrRes.get(arrKey), 3)
			assert.equal(arrRes.size, 1)
		})
	})

	describe('edge cases', () => {
		test('handles zero arguments and empty inputs', () => {
			assert.deepEqual([...orMultisetLazy()], [])
			assert.deepEqual([...orMultisetLazy(new Map())], [])
			assert.deepEqual([...orMultisetLazy(new Map(), new Map())], [])
			assert.deepEqual([...orMultisetLazy([])], [])
			assert.deepEqual([...orMultisetLazy([new Map(), new Map()])], [])
			assert.deepEqual([...orMultisetLazy([[], []])], [])
		})

		test('handles completely disjoint and completely overlapping multisets', () => {
			const a = new Map([['a', 1], ['b', 2]])
			const b = new Map([['c', 3], ['d', 4]])
			assert.deepEqual(
				new Map(orMultisetLazy(a, b)),
				new Map([
					['a', 1],
					['b', 2],
					['c', 3],
					['d', 4],
				])
			)

			const c = new Map([['a', 5], ['b', 1]])
			assert.deepEqual(
				new Map(orMultisetLazy(a, c)),
				new Map([
					['a', 5],
					['b', 2],
				])
			)
		})

		test('handles zero counts properly', () => {
			const a = new Map([
				['zeroBoth', 0],
				['zeroLeft', 0],
				['zeroRight', 3],
			])
			const b = new Map([
				['zeroBoth', 0],
				['zeroLeft', 4],
				['zeroRight', 0],
			])

			const res = new Map(orMultisetLazy(a, b))
			assert.deepEqual(
				res,
				new Map([
					['zeroLeft', 4],
					['zeroRight', 3],
				])
			)
			assert.equal(res.has('zeroBoth'), false)
		})

		test('supports Number.MAX_SAFE_INTEGER counts', () => {
			const a = new Map([['big', Number.MAX_SAFE_INTEGER]])
			const b = new Map([['big', 1]])
			assert.deepEqual(
				new Map(orMultisetLazy(a, b)),
				new Map([['big', Number.MAX_SAFE_INTEGER]])
			)
		})

		test('supports chaining lazy outputs as inputs', () => {
			const a = new Map([['a', 1], ['b', 3]])
			const b = new Map([['b', 2], ['c', 4]])
			const c = new Map([['a', 5], ['d', 1]])

			const chained = orMultisetLazy(orMultisetLazy(a, b), c)
			assert.deepEqual(
				new Map(chained),
				new Map([
					['a', 5],
					['b', 3],
					['c', 4],
					['d', 1],
				])
			)
		})
	})

	describe('lazy consumption', () => {
		test('does not consume input generators until iteration starts', () => {
			let outerPulled = 0
			let innerPulled = 0

			function* innerEntries() {
				innerPulled++
				yield ['a', 2]
				innerPulled++
				yield ['b', 3]
			}

			function* outerMultisets() {
				outerPulled++
				yield new Map([['a', 1]])
				outerPulled++
				yield innerEntries()
			}

			const gen = orMultisetLazy(outerMultisets())
			assert.equal(outerPulled, 0)
			assert.equal(innerPulled, 0)

			const first = gen.next()
			assert.equal(first.done, false)
			assert.deepEqual(first.value, ['a', 2])
			assert.equal(outerPulled, 2)
			assert.equal(innerPulled, 2)

			const second = gen.next()
			assert.deepEqual(second.value, ['b', 3])
			assert.equal(gen.next().done, true)
		})

		test('streams Map inputs lazily key-by-key without iterating untouched entries', () => {
			class SpyMap extends Map {
				constructor(entries) {
					super(entries)
					this.iteratedCount = 0
					this.iteratorClosed = false
				}
				*[Symbol.iterator]() {
					try {
						for (const entry of super[Symbol.iterator]()) {
							this.iteratedCount++
							yield entry
						}
					} finally {
						this.iteratorClosed = true
					}
				}
			}

			const spyA = new SpyMap([
				['k1', 2],
				['k2', 4],
				['k3', 6],
				['k4', 8],
			])
			const spyB = new SpyMap([
				['k1', 5],
				['k5', 1],
				['k6', 3],
			])

			const iter = orMultisetLazy(spyA, spyB)
			assert.equal(spyA.iteratedCount, 0)
			assert.equal(spyB.iteratedCount, 0)

			// Pulling just 1 item only iterates 1 entry of spyA and 0 entries of spyB
			const first = iter.next()
			assert.deepEqual(first, { value: ['k1', 5], done: false })
			assert.equal(spyA.iteratedCount, 1)
			assert.equal(spyB.iteratedCount, 0)

			// Pulling a 2nd item iterates 1 more entry of spyA and still 0 of spyB
			const second = iter.next()
			assert.deepEqual(second, { value: ['k2', 4], done: false })
			assert.equal(spyA.iteratedCount, 2)
			assert.equal(spyB.iteratedCount, 0)

			// Closing early cleans up spyA's iterator without consuming the rest
			iter.return()
			assert.equal(spyA.iteratedCount, 2)
			assert.equal(spyB.iteratedCount, 0)
			assert.equal(spyA.iteratorClosed, true)
		})

		test('for...of early break closes underlying Map iterator lazily', () => {
			let steps = 0
			class CountingMap extends Map {
				*[Symbol.iterator]() {
					for (const entry of super[Symbol.iterator]()) {
						steps++
						yield entry
					}
				}
			}

			const large = new CountingMap(
				Array.from({ length: 1000 }, (_, i) => [`k${i}`, i + 1])
			)
			const other = new CountingMap([['k0', 999]])

			const collected = []
			for (const entry of orMultisetLazy(large, other)) {
				collected.push(entry)
				if (collected.length === 3) break
			}

			assert.deepEqual(collected, [
				['k0', 999],
				['k1', 2],
				['k2', 3],
			])
			assert.equal(steps, 3)
		})
	})

	describe('invalid inputs', () => {
		test('rejects non-iterable and string arguments immediately on call', () => {
			const invalidArgs = [
				null,
				undefined,
				42,
				true,
				false,
				Symbol('x'),
				{},
				{ a: 1 },
				'abc',
				new String('abc'),
			]

			for (const bad of invalidArgs) {
				assert.throws(() => orMultisetLazy(bad), TypeError)
				assert.throws(() => orMultisetLazy(new Map(), bad), TypeError)
				assert.throws(() => orMultisetLazy(bad, new Map()), TypeError)
			}
		})

		test('rejects invalid count types with TypeError', () => {
			const badCounts = ['2', null, undefined, true, {}, 2n, []]
			for (const bad of badCounts) {
				assert.throws(() => [...orMultisetLazy(new Map([['a', bad]]))], TypeError)
				assert.throws(
					() => [...orMultisetLazy(new Map([['a', 1]]), new Map([['a', bad]]))],
					TypeError
				)
				assert.throws(
					() => [...orMultisetLazy([new Map([['a', bad]])])],
					TypeError
				)
			}
		})

		test('rejects negative, fractional, non-finite, NaN, and unsafe integer counts with RangeError', () => {
			const badCounts = [
				-1,
				-100,
				1.5,
				0.1,
				NaN,
				Infinity,
				-Infinity,
				Number.MAX_SAFE_INTEGER + 1,
			]
			for (const bad of badCounts) {
				assert.throws(() => [...orMultisetLazy(new Map([['a', bad]]))], RangeError)
				assert.throws(
					() => [...orMultisetLazy(new Map([['a', 1]]), new Map([['a', bad]]))],
					RangeError
				)
				assert.throws(() => [...orMultisetLazy([['a', bad]])], RangeError)
			}
		})

		test('rejects malformed entries and invalid elements inside sequences', () => {
			assert.throws(() => [...orMultisetLazy([123])], TypeError)
			assert.throws(() => [...orMultisetLazy([null])], TypeError)
			assert.throws(() => [...orMultisetLazy(['ab'])], TypeError)
			assert.throws(() => [...orMultisetLazy([['onlyKey']])], TypeError)
			assert.throws(() => [...orMultisetLazy([['a', 1, 'extra']])], TypeError)
			assert.throws(
				() => [...orMultisetLazy([new Map([['a', 1]]), null])],
				TypeError
			)
			assert.throws(
				() => [...orMultisetLazy([new Map([['a', 1]]), 'str'])],
				TypeError
			)
			assert.throws(
				() => [...orMultisetLazy([['a', 1], new Map([['b', 2]])])],
				TypeError
			)
			assert.throws(
				() => [...orMultisetLazy([new Map([['a', 1]]), ['b', 2]])],
				TypeError
			)
			assert.throws(
				() => [...orMultisetLazy(new Map([['a', 1]]), ['not-a-tuple'])],
				TypeError
			)
		})
	})

	describe('independent cross-checks and algebraic properties', () => {
		test('matches boolean OR on {0, 1} indicator multisets', () => {
			const universe = ['p', 'q', 'r', 's']
			const bitsA = [0, 0, 1, 1]
			const bitsB = [0, 1, 0, 1]

			const mA = new Map(universe.map((k, i) => [k, bitsA[i]]))
			const mB = new Map(universe.map((k, i) => [k, bitsB[i]]))
			const res = new Map(orMultisetLazy(mA, mB))

			for (let i = 0; i < universe.length; i++) {
				const k = universe[i]
				const expected = bitsA[i] || bitsB[i]
				assert.equal(res.get(k) ?? 0, expected)
				assert.equal(res.has(k), expected === 1)
			}
		})

		test('satisfies commutativity, associativity, idempotence, and identity laws', () => {
			const a = new Map([['a', 2], ['b', 0], ['c', 5]])
			const b = new Map([['b', 3], ['c', 1], ['d', 4]])
			const c = new Map([['a', 7], ['d', 2], ['e', 1]])
			const empty = new Map()

			// Commutativity: A ∨ B = B ∨ A
			assert.deepEqual(
				new Map(orMultisetLazy(a, b)),
				new Map(orMultisetLazy(b, a))
			)

			// Associativity: (A ∨ B) ∨ C = A ∨ (B ∨ C) = A ∨ B ∨ C
			const left = new Map(orMultisetLazy(new Map(orMultisetLazy(a, b)), c))
			const right = new Map(orMultisetLazy(a, new Map(orMultisetLazy(b, c))))
			const flat = new Map(orMultisetLazy(a, b, c))
			assert.deepEqual(left, right)
			assert.deepEqual(left, flat)

			// Idempotence: A ∨ A = A (positive counts)
			assert.deepEqual(
				new Map(orMultisetLazy(a, a)),
				new Map(orMultisetLazy(a))
			)

			// Identity: A ∨ ∅ = A
			assert.deepEqual(
				new Map(orMultisetLazy(a, empty)),
				new Map(orMultisetLazy(a))
			)
		})

		test('agrees with independent naive reference across 50 deterministic random trials', () => {
			// Deterministic LCG PRNG
			let seed = 0x12345678
			const nextInt = (max) => {
				seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
				return seed % max
			}

			const keyPool = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9']

			for (let trial = 0; trial < 50; trial++) {
				const numMaps = 1 + nextInt(5)
				const maps = []
				for (let m = 0; m < numMaps; m++) {
					const map = new Map()
					const entries = nextInt(8)
					for (let e = 0; e < entries; e++) {
						map.set(keyPool[nextInt(keyPool.length)], nextInt(10))
					}
					maps.push(map)
				}

				const expected = naiveMultisetOr(maps)

				// 1. Direct Map arguments (key-by-key streaming path)
				const fromMaps = new Map(orMultisetLazy(...maps))
				assert.deepEqual(fromMaps, expected)

				// 2. Unary generator of Maps (streaming sequence path)
				function* mapStream() {
					for (const m of maps) yield m
				}
				const fromStream = new Map(orMultisetLazy(mapStream()))
				assert.deepEqual(fromStream, expected)

				// 3. Entry-generator arguments (mixed/entry streaming path)
				const entryGens = maps.map(
					(m) =>
						(function* () {
							for (const pair of m) yield pair
						})()
				)
				const fromEntryGens = new Map(orMultisetLazy(...entryGens))
				assert.deepEqual(fromEntryGens, expected)
			}
		})
	})
})
