import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { notBoolIterative } from './notBoolIterative.js'

describe('notBoolIterative', () => {
	describe('plain booleans', () => {
		it('negates true to false and false to true', () => {
			assert.strictEqual(notBoolIterative(true), false)
			assert.strictEqual(notBoolIterative(false), true)
		})

		it('satisfies double negation involution for all booleans', () => {
			for (const b of [true, false]) {
				assert.strictEqual(notBoolIterative(notBoolIterative(b)), b)
			}
		})
	})

	describe('JS Set complement', () => {
		it('computes the complement of a subset within a universe', () => {
			const universe = new Set([1, 2, 3, 4, 5])
			const subset = new Set([2, 4])
			const result = notBoolIterative(subset, universe)

			assert.ok(result instanceof Set)
			assert.deepStrictEqual(result, new Set([1, 3, 5]))
		})

		it('returns a copy of the universe when input set is empty', () => {
			const universe = new Set(['a', 'b', 'c'])
			const result = notBoolIterative(new Set(), universe)

			assert.deepStrictEqual(result, universe)
			assert.notStrictEqual(result, universe)
		})

		it('returns an empty set when input set equals universe', () => {
			const universe = new Set([10, 20, 30])
			const subset = new Set([10, 20, 30])

			assert.deepStrictEqual(notBoolIterative(subset, universe), new Set())
			assert.deepStrictEqual(notBoolIterative(universe, universe), new Set())
		})

		it('returns an empty set when both input set and universe are empty', () => {
			assert.deepStrictEqual(notBoolIterative(new Set(), new Set()), new Set())
		})

		it('ignores elements in value that are not present in universe', () => {
			const universe = new Set([1, 2, 3])
			const value = new Set([2, 99, 100])

			assert.deepStrictEqual(notBoolIterative(value, universe), new Set([1, 3]))
		})

		it('preserves SameValueZero semantics for NaN, -0/+0, null, undefined, and object refs', () => {
			const objA = { id: 'a' }
			const objB = { id: 'b' }
			const universe = new Set([NaN, 0, null, undefined, objA, objB, true, false])
			const value = new Set([NaN, -0, null, objA, true])

			const result = notBoolIterative(value, universe)
			assert.deepStrictEqual(result, new Set([undefined, objB, false]))
		})

		it('does not mutate either the input set or the universe set', () => {
			const universe = new Set([1, 2, 3])
			const value = new Set([2])
			const result = notBoolIterative(value, universe)
			result.add(42)

			assert.deepStrictEqual(universe, new Set([1, 2, 3]))
			assert.deepStrictEqual(value, new Set([2]))
		})

		it('handles large sets iteratively without stack overflow', () => {
			const size = 10_000
			const universe = new Set()
			const evens = new Set()
			for (let i = 0; i < size; i++) {
				universe.add(i)
				if (i % 2 === 0) evens.add(i)
			}

			const odds = notBoolIterative(evens, universe)
			assert.strictEqual(odds.size, size / 2)
			assert.strictEqual(odds.has(0), false)
			assert.strictEqual(odds.has(1), true)
			assert.strictEqual(odds.has(size - 1), true)
		})
	})

	describe('independent mathematical cross-checks', () => {
		it('satisfies double complement involution for subsets of universe', () => {
			const universe = new Set(['w', 'x', 'y', 'z'])
			const cases = [
				new Set(),
				new Set(['w']),
				new Set(['x', 'z']),
				new Set(['w', 'x', 'y', 'z']),
			]

			for (const subset of cases) {
				const comp = notBoolIterative(subset, universe)
				const doubleComp = notBoolIterative(comp, universe)
				assert.deepStrictEqual(doubleComp, subset)
			}
		})

		it('satisfies partition laws: A ∩ A^c = ∅ and A ∪ A^c = U for A ⊆ U', () => {
			const universe = new Set([1, 2, 3, 4, 5, 6, 7, 8])
			const subset = new Set([1, 3, 6, 8])
			const comp = notBoolIterative(subset, universe)

			for (const item of subset) {
				assert.strictEqual(comp.has(item), false)
			}

			const union = new Set([...subset, ...comp])
			assert.deepStrictEqual(union, universe)
			assert.strictEqual(subset.size + comp.size, universe.size)
		})

		it('double complement equals A ∩ U when A contains elements outside U', () => {
			const universe = new Set([1, 2, 3, 4])
			const value = new Set([2, 4, 6, 8])

			const doubleComp = notBoolIterative(
				notBoolIterative(value, universe),
				universe,
			)
			const expectedIntersection = new Set(
				[...value].filter((x) => universe.has(x)),
			)
			assert.deepStrictEqual(doubleComp, expectedIntersection)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-boolean, non-Set values', () => {
			const invalidValues = [
				null,
				undefined,
				0,
				1,
				'',
				'true',
				{},
				[true],
				new Boolean(true),
				new Map(),
			]

			for (const invalid of invalidValues) {
				assert.throws(() => notBoolIterative(invalid), TypeError)
			}
		})

		it('throws TypeError when universe is supplied with a plain boolean', () => {
			assert.throws(() => notBoolIterative(true, new Set([true, false])), TypeError)
			assert.throws(() => notBoolIterative(false, null), TypeError)
		})

		it('throws TypeError when value is a Set and universe is missing or not a Set', () => {
			const s = new Set([1])
			assert.throws(() => notBoolIterative(s), TypeError)
			assert.throws(() => notBoolIterative(s, null), TypeError)
			assert.throws(() => notBoolIterative(s, [1, 2]), TypeError)
			assert.throws(() => notBoolIterative(s, {}), TypeError)
			assert.throws(() => notBoolIterative(s, true), TypeError)
		})
	})
})
