import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { intersectionBoolIterative } from './intersectionBoolIterative.js'

describe('intersectionBoolIterative', () => {
	test('computes intersection of overlapping numeric sets', () => {
		const a = new Set([1, 2, 3, 4])
		const b = new Set([3, 4, 5, 6])
		const result = intersectionBoolIterative(a, b)
		assert.deepStrictEqual(result, new Set([3, 4]))
	})

	test('computes intersection of boolean sets', () => {
		assert.deepStrictEqual(
			intersectionBoolIterative(new Set([true, false]), new Set([true])),
			new Set([true]),
		)
		assert.deepStrictEqual(
			intersectionBoolIterative(new Set([true]), new Set([false])),
			new Set(),
		)
		assert.deepStrictEqual(
			intersectionBoolIterative(new Set([false]), new Set([false])),
			new Set([false]),
		)
	})

	test('returns empty set for disjoint sets', () => {
		const a = new Set(['a', 'b', 'c'])
		const b = new Set(['d', 'e', 'f'])
		const result = intersectionBoolIterative(a, b)
		assert.deepStrictEqual(result, new Set())
		assert.equal(result.size, 0)
	})

	test('handles subset and superset regardless of argument sizes', () => {
		const small = new Set([2, 4])
		const large = new Set([1, 2, 3, 4, 5])
		assert.deepStrictEqual(intersectionBoolIterative(small, large), new Set([2, 4]))
		assert.deepStrictEqual(intersectionBoolIterative(large, small), new Set([2, 4]))
	})

	test('handles empty sets', () => {
		const nonEmpty = new Set([1, 2, 3])
		assert.deepStrictEqual(intersectionBoolIterative(new Set(), new Set()), new Set())
		assert.deepStrictEqual(intersectionBoolIterative(new Set(), nonEmpty), new Set())
		assert.deepStrictEqual(intersectionBoolIterative(nonEmpty, new Set()), new Set())
	})

	test('returns a new Set without mutating inputs (including self-intersection)', () => {
		const a = new Set([10, 20, 30])
		const b = new Set([20, 30, 40])
		const result = intersectionBoolIterative(a, b)

		assert.notEqual(result, a)
		assert.notEqual(result, b)
		assert.deepStrictEqual(a, new Set([10, 20, 30]))
		assert.deepStrictEqual(b, new Set([20, 30, 40]))

		const selfResult = intersectionBoolIterative(a, a)
		assert.notEqual(selfResult, a)
		assert.deepStrictEqual(selfResult, a)
	})

	test('preserves SameValueZero semantics (NaN, -0/+0, null, undefined, object references)', () => {
		const sharedObj = { id: 1 }
		const a = new Set([NaN, -0, null, undefined, sharedObj, { id: 2 }])
		const b = new Set([NaN, +0, null, undefined, sharedObj, { id: 2 }])
		const result = intersectionBoolIterative(a, b)

		assert.equal(result.size, 5)
		assert.ok(result.has(NaN))
		assert.ok(result.has(0))
		assert.ok(result.has(null))
		assert.ok(result.has(undefined))
		assert.ok(result.has(sharedObj))
	})

	test('throws TypeError on invalid inputs', () => {
		const valid = new Set([1, 2])
		const invalidValues = [
			null,
			undefined,
			true,
			false,
			42,
			'set',
			[1, 2],
			{ 1: true },
			new Map([[1, 1]]),
		]

		for (const bad of invalidValues) {
			assert.throws(() => intersectionBoolIterative(bad, valid), TypeError)
			assert.throws(() => intersectionBoolIterative(valid, bad), TypeError)
		}

		assert.throws(() => intersectionBoolIterative(), TypeError)
		assert.throws(() => intersectionBoolIterative(valid), TypeError)
	})

	test('cross-check: commutativity, associativity, and inclusion-exclusion', () => {
		const pairs = [
			[new Set([]), new Set([])],
			[new Set([1, 2, 3]), new Set([])],
			[new Set([1, 2, 3, 4, 5]), new Set([4, 5, 6, 7])],
			[new Set(['x', 'y']), new Set(['y', 'z', 'w', 'x'])],
			[new Set([true, false]), new Set([false])],
		]

		for (const [a, b] of pairs) {
			const ab = intersectionBoolIterative(a, b)
			const ba = intersectionBoolIterative(b, a)

			// Commutativity: A ∩ B = B ∩ A
			assert.deepStrictEqual(ab, ba)

			// Inclusion-exclusion: |A ∩ B| = |A| + |B| - |A ∪ B|
			const union = new Set([...a, ...b])
			assert.equal(ab.size, a.size + b.size - union.size)

			// Independent filter reference
			const ref = new Set([...a].filter((x) => b.has(x)))
			assert.deepStrictEqual(ab, ref)
		}

		// Associativity: (A ∩ B) ∩ C = A ∩ (B ∩ C)
		const a = new Set([1, 2, 3, 4, 5])
		const b = new Set([2, 3, 4, 6])
		const c = new Set([3, 4, 5, 6, 7])
		assert.deepStrictEqual(
			intersectionBoolIterative(intersectionBoolIterative(a, b), c),
			intersectionBoolIterative(a, intersectionBoolIterative(b, c)),
		)
	})

	test('cross-check: De Morgan law over a finite universe', () => {
		const universe = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
		const a = new Set([1, 2, 3, 4, 5])
		const b = new Set([3, 4, 5, 6, 7])

		const complement = (s) => new Set([...universe].filter((x) => !s.has(x)))
		const union = (x, y) => new Set([...x, ...y])

		// U \ (A ∩ B) === (U \ A) ∪ (U \ B)
		const lhs = complement(intersectionBoolIterative(a, b))
		const rhs = union(complement(a), complement(b))
		assert.deepStrictEqual(lhs, rhs)
	})
})
