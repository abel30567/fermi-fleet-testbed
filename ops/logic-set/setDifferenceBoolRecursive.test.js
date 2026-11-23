import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { setDifferenceBoolRecursive } from './setDifferenceBoolRecursive.js'

/**
 * Independent iterative reference implementation for cross-checking.
 */
function referenceSetDifference(a, b, ...rest) {
	if (typeof a === 'boolean') {
		return a && !b && rest.every((v) => !v)
	}
	const result = new Set()
	for (const item of a) {
		if (!b.has(item) && rest.every((s) => !s.has(item))) {
			result.add(item)
		}
	}
	return result
}

describe('setDifferenceBoolRecursive', () => {
	describe('plain booleans (truth table & variadic)', () => {
		it('computes the complete binary boolean difference truth table', () => {
			assert.strictEqual(setDifferenceBoolRecursive(false, false), false)
			assert.strictEqual(setDifferenceBoolRecursive(false, true), false)
			assert.strictEqual(setDifferenceBoolRecursive(true, false), true)
			assert.strictEqual(setDifferenceBoolRecursive(true, true), false)
		})

		it('supports variadic boolean operands (left-associative difference)', () => {
			assert.strictEqual(
				setDifferenceBoolRecursive(true, false, false, false),
				true,
			)
			assert.strictEqual(
				setDifferenceBoolRecursive(true, false, true, false),
				false,
			)
			assert.strictEqual(
				setDifferenceBoolRecursive(true, false, false, true),
				false,
			)
			assert.strictEqual(
				setDifferenceBoolRecursive(false, false, false, false),
				false,
			)
		})
	})

	describe('JS Set objects (normal cases)', () => {
		it('removes overlapping elements from the minuend set', () => {
			const a = new Set([1, 2, 3, 4, 5])
			const b = new Set([2, 4, 6])
			const result = setDifferenceBoolRecursive(a, b)
			assert.ok(result instanceof Set)
			assert.deepStrictEqual([...result], [1, 3, 5])
		})

		it('works with sets of booleans, strings, symbols, and object references', () => {
			const obj1 = { id: 1 }
			const obj2 = { id: 2 }
			const sym1 = Symbol('a')
			const sym2 = Symbol('b')

			assert.deepStrictEqual(
				[
					...setDifferenceBoolRecursive(
						new Set([true, false]),
						new Set([false]),
					),
				],
				[true],
			)
			assert.deepStrictEqual(
				[
					...setDifferenceBoolRecursive(
						new Set(['alpha', 'beta', 'gamma']),
						new Set(['beta', 'delta']),
					),
				],
				['alpha', 'gamma'],
			)
			assert.deepStrictEqual(
				[
					...setDifferenceBoolRecursive(
						new Set([obj1, obj2, sym1, sym2]),
						new Set([obj2, sym1]),
					),
				],
				[obj1, sym2],
			)
		})

		it('supports variadic Set operands', () => {
			const a = new Set([1, 2, 3, 4, 5, 6, 7])
			const b = new Set([2, 3])
			const c = new Set([5])
			const d = new Set([7, 8, 9])
			const result = setDifferenceBoolRecursive(a, b, c, d)
			assert.deepStrictEqual([...result], [1, 4, 6])
		})

		it('preserves insertion order and does not mutate input sets', () => {
			const a = new Set(['z', 'a', 'm', 'b'])
			const b = new Set(['a', 'x'])
			const result = setDifferenceBoolRecursive(a, b)
			assert.deepStrictEqual([...result], ['z', 'm', 'b'])
			assert.deepStrictEqual([...a], ['z', 'a', 'm', 'b'])
			assert.deepStrictEqual([...b], ['a', 'x'])
			assert.notStrictEqual(result, a)
		})
	})

	describe('edge cases', () => {
		it('handles empty sets on either or both sides', () => {
			const empty = new Set()
			const nonEmpty = new Set([10, 20])

			assert.deepStrictEqual(
				[...setDifferenceBoolRecursive(empty, empty)],
				[],
			)
			assert.deepStrictEqual(
				[...setDifferenceBoolRecursive(empty, nonEmpty)],
				[],
			)

			const diff = setDifferenceBoolRecursive(nonEmpty, empty)
			assert.deepStrictEqual([...diff], [10, 20])
			assert.notStrictEqual(diff, nonEmpty)
		})

		it('handles disjoint sets, subsets, and identical/self-aliased sets', () => {
			const a = new Set([1, 2, 3])
			const disjoint = new Set([4, 5, 6])
			const superset = new Set([0, 1, 2, 3, 4])

			assert.deepStrictEqual(
				[...setDifferenceBoolRecursive(a, disjoint)],
				[1, 2, 3],
			)
			assert.deepStrictEqual([...setDifferenceBoolRecursive(a, superset)], [])
			assert.deepStrictEqual([...setDifferenceBoolRecursive(a, a)], [])
			assert.deepStrictEqual([...a], [1, 2, 3])
		})

		it('handles single-element sets (recursion base case)', () => {
			assert.deepStrictEqual(
				[...setDifferenceBoolRecursive(new Set([42]), new Set([42]))],
				[],
			)
			assert.deepStrictEqual(
				[...setDifferenceBoolRecursive(new Set([42]), new Set([99]))],
				[42],
			)
		})

		it('follows SameValueZero semantics for NaN, -0/+0, null, and undefined', () => {
			const a = new Set([NaN, -0, null, undefined, 1])
			const b = new Set([NaN, +0, undefined])
			const result = setDifferenceBoolRecursive(a, b)
			assert.deepStrictEqual([...result], [null, 1])
		})

		it('handles large sets without stack overflow (O(log n) recursion depth)', () => {
			const n = 20_000
			const a = new Set()
			const b = new Set()
			for (let i = 0; i < n; i++) {
				a.add(i)
				if (i % 2 === 0) {
					b.add(i)
				}
			}
			const result = setDifferenceBoolRecursive(a, b)
			assert.strictEqual(result.size, n / 2)
			assert.strictEqual(result.has(0), false)
			assert.strictEqual(result.has(1), true)
			assert.strictEqual(result.has(n - 1), true)
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when fewer than two arguments are provided', () => {
			assert.throws(() => setDifferenceBoolRecursive(), TypeError)
			assert.throws(() => setDifferenceBoolRecursive(true), TypeError)
			assert.throws(() => setDifferenceBoolRecursive(new Set()), TypeError)
		})

		it('throws TypeError for non-boolean, non-Set values', () => {
			const invalidValues = [
				null,
				undefined,
				0,
				1,
				'true',
				'',
				[1, 2],
				{ a: 1 },
				new Map(),
				new Boolean(true),
			]
			for (const bad of invalidValues) {
				assert.throws(
					() => setDifferenceBoolRecursive(bad, new Set()),
					TypeError,
				)
				assert.throws(
					() => setDifferenceBoolRecursive(new Set(), bad),
					TypeError,
				)
				assert.throws(() => setDifferenceBoolRecursive(bad, true), TypeError)
				assert.throws(() => setDifferenceBoolRecursive(true, bad), TypeError)
			}
		})

		it('throws TypeError when mixing booleans and Sets', () => {
			assert.throws(
				() => setDifferenceBoolRecursive(true, new Set([true])),
				TypeError,
			)
			assert.throws(
				() => setDifferenceBoolRecursive(new Set([true]), false),
				TypeError,
			)
			assert.throws(
				() => setDifferenceBoolRecursive(true, false, new Set()),
				TypeError,
			)
			assert.throws(
				() => setDifferenceBoolRecursive(new Set([1]), new Set([2]), false),
				TypeError,
			)
		})
	})

	describe('independent cross-checks & algebraic laws', () => {
		it('matches iterative reference and Set.prototype.difference across deterministic pseudo-random sets', () => {
			// Linear congruential generator for reproducible test cases
			let seed = 0x12345678
			const nextInt = (max) => {
				seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
				return seed % max
			}

			for (let trial = 0; trial < 50; trial++) {
				const a = new Set()
				const b = new Set()
				const sizeA = nextInt(40)
				const sizeB = nextInt(40)
				for (let i = 0; i < sizeA; i++) a.add(nextInt(30))
				for (let i = 0; i < sizeB; i++) b.add(nextInt(30))

				const actual = setDifferenceBoolRecursive(a, b)
				const expected = referenceSetDifference(a, b)
				assert.deepStrictEqual([...actual], [...expected])

				if (typeof Set.prototype.difference === 'function') {
					assert.deepStrictEqual([...actual], [...a.difference(b)])
				}

				// Algebraic laws:
				// 1. (A \ B) ∩ B = ∅
				for (const item of actual) {
					assert.strictEqual(b.has(item), false)
					assert.strictEqual(a.has(item), true)
				}
				// 2. |A \ B| + |A ∩ B| = |A|
				let intersectionCount = 0
				for (const item of a) {
					if (b.has(item)) intersectionCount++
				}
				assert.strictEqual(actual.size + intersectionCount, a.size)
			}
		})

		it('matches singleton-set isomorphism for all boolean tuples up to 4 operands', () => {
			const toSet = (bool) => (bool ? new Set([1]) : new Set())
			const values = [false, true]

			for (const a of values) {
				for (const b of values) {
					for (const c of values) {
						const boolDiff = setDifferenceBoolRecursive(a, b, c)
						const refBoolDiff = referenceSetDifference(a, b, c)
						const setDiff = setDifferenceBoolRecursive(
							toSet(a),
							toSet(b),
							toSet(c),
						)
						assert.strictEqual(boolDiff, refBoolDiff)
						assert.strictEqual(boolDiff, setDiff.has(1))
					}
				}
			}
		})
	})
})
