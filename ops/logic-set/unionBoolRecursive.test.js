import { describe, test } from 'node:test'
import assert from 'node:assert'
import { unionBoolRecursive } from './unionBoolRecursive.js'

describe('unionBoolRecursive', () => {
	describe('normal cases', () => {
		test('union of two overlapping sets', () => {
			const a = new Set([1, 2, 3])
			const b = new Set([3, 4, 5])
			const result = unionBoolRecursive(a, b)

			assert.ok(result instanceof Set)
			assert.deepStrictEqual(result, new Set([1, 2, 3, 4, 5]))
		})

		test('union of two disjoint sets', () => {
			const a = new Set(['a', 'b'])
			const b = new Set(['c', 'd'])
			const result = unionBoolRecursive(a, b)

			assert.deepStrictEqual(result, new Set(['a', 'b', 'c', 'd']))
		})

		test('union of boolean sets', () => {
			const a = new Set([true])
			const b = new Set([false])
			const c = new Set([true, false])

			assert.deepStrictEqual(unionBoolRecursive(a, b), new Set([true, false]))
			assert.deepStrictEqual(unionBoolRecursive(a, b, c), new Set([true, false]))
		})

		test('union of many sets (odd and even counts)', () => {
			const sets5 = [
				new Set([1, 2]),
				new Set([2, 3]),
				new Set([4]),
				new Set([4, 5, 6]),
				new Set([1, 7])
			]
			assert.deepStrictEqual(
				unionBoolRecursive(...sets5),
				new Set([1, 2, 3, 4, 5, 6, 7])
			)

			const sets8 = Array.from({ length: 8 }, (_, i) => new Set([i, i + 1]))
			assert.deepStrictEqual(
				unionBoolRecursive(...sets8),
				new Set([0, 1, 2, 3, 4, 5, 6, 7, 8])
			)
		})

		test('union with mixed element types including NaN, -0/+0, null, undefined, symbols, and objects', () => {
			const obj1 = { id: 1 }
			const obj2 = { id: 1 }
			const sym = Symbol('k')
			const fn = () => {}

			const a = new Set([NaN, -0, null, true, obj1, sym])
			const b = new Set([NaN, +0, undefined, false, obj1, obj2, fn])
			const result = unionBoolRecursive(a, b)

			assert.strictEqual(result.size, 10)
			assert.ok(result.has(NaN))
			assert.ok(result.has(0))
			assert.ok(result.has(null))
			assert.ok(result.has(undefined))
			assert.ok(result.has(true))
			assert.ok(result.has(false))
			assert.ok(result.has(obj1))
			assert.ok(result.has(obj2))
			assert.ok(result.has(sym))
			assert.ok(result.has(fn))
		})
	})

	describe('edge cases', () => {
		test('zero arguments returns an empty Set', () => {
			const result = unionBoolRecursive()
			assert.ok(result instanceof Set)
			assert.strictEqual(result.size, 0)
		})

		test('single set returns a distinct shallow copy', () => {
			const a = new Set([10, 20, 30])
			const result = unionBoolRecursive(a)

			assert.notStrictEqual(result, a)
			assert.deepStrictEqual(result, a)
		})

		test('empty sets combined with empty and non-empty sets', () => {
			const empty1 = new Set()
			const empty2 = new Set()
			const nonEmpty = new Set(['x', 'y'])

			assert.deepStrictEqual(unionBoolRecursive(empty1), new Set())
			assert.deepStrictEqual(unionBoolRecursive(empty1, empty2), new Set())
			assert.deepStrictEqual(unionBoolRecursive(empty1, nonEmpty), new Set(['x', 'y']))
			assert.deepStrictEqual(unionBoolRecursive(nonEmpty, empty1), new Set(['x', 'y']))
			assert.deepStrictEqual(
				unionBoolRecursive(empty1, nonEmpty, empty2),
				new Set(['x', 'y'])
			)
		})

		test('identical sets and same Set reference passed multiple times', () => {
			const a = new Set([1, 2, 3])
			const b = new Set([1, 2, 3])

			assert.deepStrictEqual(unionBoolRecursive(a, b), new Set([1, 2, 3]))
			assert.deepStrictEqual(unionBoolRecursive(a, a, a), new Set([1, 2, 3]))
		})

		test('immutability of input sets and returned set', () => {
			const a = new Set([1, 2])
			const b = new Set([3, 4])
			const c = new Set([5])

			const result = unionBoolRecursive(a, b, c)
			assert.deepStrictEqual(a, new Set([1, 2]))
			assert.deepStrictEqual(b, new Set([3, 4]))
			assert.deepStrictEqual(c, new Set([5]))

			// Mutating the result must not affect inputs
			result.add(999)
			result.delete(1)
			assert.deepStrictEqual(a, new Set([1, 2]))
			assert.deepStrictEqual(b, new Set([3, 4]))
			assert.deepStrictEqual(c, new Set([5]))
		})

		test('invalid inputs throw TypeError', () => {
			const invalidInputs = [
				null,
				undefined,
				true,
				false,
				42,
				'abc',
				[1, 2],
				{ a: 1 },
				new Map([['a', 1]]),
				{ size: 1, has: () => true, [Symbol.iterator]: function* () { yield 1 } }
			]

			for (const bad of invalidInputs) {
				assert.throws(
					() => unionBoolRecursive(bad),
					{ name: 'TypeError' },
					`expected TypeError for single invalid input: ${String(bad)}`
				)
				assert.throws(
					() => unionBoolRecursive(new Set([1]), bad),
					{ name: 'TypeError' },
					`expected TypeError for second invalid input: ${String(bad)}`
				)
				assert.throws(
					() => unionBoolRecursive(new Set([1]), new Set([2]), bad, new Set([3])),
					{ name: 'TypeError' },
					`expected TypeError for middle invalid input: ${String(bad)}`
				)
			}
		})
	})

	describe('cross-check against independent iterative / spread union', () => {
		test('matches new Set([...a, ...b]) across diverse two-set inputs', () => {
			const sharedObj = { tag: 'shared' }
			const pairs = [
				[new Set(), new Set()],
				[new Set([1]), new Set()],
				[new Set(), new Set([2])],
				[new Set([true, false]), new Set([false])],
				[new Set([1, 2, 3, NaN]), new Set([3, 4, NaN, sharedObj])],
				[
					new Set(Array.from({ length: 200 }, (_, i) => i * 2)),
					new Set(Array.from({ length: 200 }, (_, i) => i * 3))
				]
			]

			for (const [a, b] of pairs) {
				const expected = new Set([...a, ...b])
				const actual = unionBoolRecursive(a, b)
				assert.deepStrictEqual(actual, expected)
				assert.deepStrictEqual([...actual], [...expected])
			}
		})

		test('matches independent iterative union across many pseudo-random sets', () => {
			// Deterministic LCG for reproducible test coverage
			let seed = 1337
			const nextInt = (max) => {
				seed = (seed * 1664525 + 1013904223) >>> 0
				return seed % max
			}

			const sets = Array.from({ length: 25 }, () => {
				const size = nextInt(40)
				const s = new Set()
				for (let i = 0; i < size; i++) {
					s.add(nextInt(60))
				}
				return s
			})

			const expected = new Set()
			for (const s of sets) {
				for (const item of s) {
					expected.add(item)
				}
			}

			const actual = unionBoolRecursive(...sets)
			assert.deepStrictEqual(actual, expected)
			assert.deepStrictEqual([...actual], [...expected])
		})
	})
})
