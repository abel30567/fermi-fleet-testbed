import { describe, test } from 'node:test'
import assert from 'node:assert'
import { notBoolStable } from './notBoolStable.js'

describe('notBoolStable', () => {
	test('boolean negation for primitive booleans', () => {
		assert.strictEqual(notBoolStable(true), false)
		assert.strictEqual(notBoolStable(false), true)
	})

	test('boolean double negation involution', () => {
		for (const value of [true, false]) {
			assert.strictEqual(notBoolStable(notBoolStable(value)), value)
		}
	})

	test('set complement with universe', () => {
		const universe = new Set([1, 2, 3, 4, 5])
		const subset = new Set([2, 4])
		const result = notBoolStable(subset, universe)

		assert.ok(result instanceof Set)
		assert.deepStrictEqual([...result], [1, 3, 5])

		// Elements in set outside universe are ignored in U \ A
		const withExtras = new Set([2, 99, 'extra'])
		assert.deepStrictEqual([...notBoolStable(withExtras, universe)], [1, 3, 4, 5])
	})

	test('set complement edge cases: empty sets, NaN, and -0', () => {
		const universe = new Set([10, 20, 30])
		const empty = new Set()

		assert.deepStrictEqual([...notBoolStable(empty, universe)], [10, 20, 30])
		assert.deepStrictEqual([...notBoolStable(universe, universe)], [])
		assert.deepStrictEqual([...notBoolStable(empty, empty)], [])

		// NaN uses SameValueZero equality in Set
		const universeWithNaN = new Set([NaN, 1, 2])
		assert.deepStrictEqual([...notBoolStable(new Set([NaN]), universeWithNaN)], [1, 2])
		const keepNaN = notBoolStable(new Set([1]), universeWithNaN)
		assert.strictEqual(keepNaN.size, 2)
		assert.strictEqual(keepNaN.has(NaN), true)
		assert.strictEqual(keepNaN.has(2), true)

		// -0 and +0 are equivalent under SameValueZero
		const universeWithZero = new Set([-0, 1, 2])
		assert.deepStrictEqual([...notBoolStable(new Set([+0]), universeWithZero)], [1, 2])
		assert.deepStrictEqual([...notBoolStable(new Set([-0]), new Set([+0, 3]))], [3])
		const keptZero = notBoolStable(new Set([1]), universeWithZero)
		assert.strictEqual(keptZero.has(0), true)
		assert.strictEqual(keptZero.has(-0), true)
		assert.strictEqual(keptZero.size, 2)
	})

	test('set complement does not mutate inputs and returns a fresh Set', () => {
		const universe = new Set(['a', 'b', 'c'])
		const subset = new Set(['b'])
		const universeSnapshot = [...universe]
		const subsetSnapshot = [...subset]

		const result = notBoolStable(subset, universe)
		assert.notStrictEqual(result, universe)
		assert.notStrictEqual(result, subset)
		assert.deepStrictEqual([...universe], universeSnapshot)
		assert.deepStrictEqual([...subset], subsetSnapshot)

		// Mutating result does not affect inputs
		result.add('z')
		assert.strictEqual(universe.has('z'), false)
		assert.strictEqual(subset.has('z'), false)

		// Even when complement equals universe, a distinct Set instance is returned
		const fullCopy = notBoolStable(new Set(), universe)
		assert.notStrictEqual(fullCopy, universe)
		assert.deepStrictEqual([...fullCopy], universeSnapshot)
	})

	test('rejects invalid inputs with TypeError', () => {
		const invalidSingleArgs = [
			0,
			1,
			-1,
			NaN,
			'',
			'false',
			'true',
			null,
			undefined,
			{},
			[],
			new Boolean(true),
			new Boolean(false),
			new Set([1, 2]),
		]

		for (const input of invalidSingleArgs) {
			assert.throws(() => notBoolStable(input), TypeError)
		}

		// Set with non-Set universe
		for (const badUniverse of [undefined, null, [1, 2], {}, 'ab', true, 42]) {
			assert.throws(() => notBoolStable(new Set([1]), badUniverse), TypeError)
		}

		// Non-Set first arg with Set universe
		assert.throws(() => notBoolStable([1], new Set([1, 2])), TypeError)
		assert.throws(() => notBoolStable(true, new Set([true, false])), TypeError)
		assert.throws(() => notBoolStable(false, new Set([true, false])), TypeError)
	})

	test('cross-check: involution and complement partition (A ∪ A′ = U, A ∩ A′ = ∅)', () => {
		// Independent boolean cross-check via truth-table lookup
		const truthTable = new Map([
			[true, false],
			[false, true],
		])
		for (const [input, expected] of truthTable) {
			const negated = notBoolStable(input)
			assert.strictEqual(negated, expected)
			assert.strictEqual(notBoolStable(negated), input)
		}

		// Exhaustive bitmask cross-check over all 2^5 = 32 subsets of a 5-element universe
		const elements = ['u0', NaN, 0, Symbol('u3'), { id: 4 }]
		const universe = new Set(elements)
		const fullMask = (1 << elements.length) - 1

		for (let mask = 0; mask <= fullMask; mask++) {
			const subset = new Set()
			const expectedComplement = []
			for (let i = 0; i < elements.length; i++) {
				if ((mask & (1 << i)) !== 0) {
					subset.add(elements[i])
				} else {
					expectedComplement.push(elements[i])
				}
			}

			const complement = notBoolStable(subset, universe)

			// Cross-check against bitmask-derived reference
			assert.strictEqual(complement.size, expectedComplement.length)
			for (const item of expectedComplement) {
				assert.strictEqual(complement.has(item), true)
			}

			// Involution: not(not(A, U), U) === A
			const doubleComplement = notBoolStable(complement, universe)
			assert.strictEqual(doubleComplement.size, subset.size)
			for (const item of subset) {
				assert.strictEqual(doubleComplement.has(item), true)
			}

			// Partition: A ∪ A' = U and A ∩ A' = ∅
			const union = new Set([...subset, ...complement])
			assert.strictEqual(union.size, universe.size)
			for (const item of universe) {
				assert.strictEqual(union.has(item), true)
			}
			for (const item of subset) {
				assert.strictEqual(complement.has(item), false)
			}
			assert.strictEqual(subset.size + complement.size, universe.size)
		}
	})
})
