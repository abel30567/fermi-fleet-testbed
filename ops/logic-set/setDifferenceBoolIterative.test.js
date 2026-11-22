import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { setDifferenceBoolIterative } from './setDifferenceBoolIterative.js'

describe('setDifferenceBoolIterative', () => {
	test('computes relative complement A \\ B for overlapping sets', () => {
		const a = new Set([1, 2, 3, 4])
		const b = new Set([3, 4, 5, 6])
		const diff = setDifferenceBoolIterative(a, b)

		assert.ok(diff instanceof Set)
		assert.deepEqual(diff, new Set([1, 2]))
		assert.deepEqual([...diff], [1, 2])
	})

	test('handles boolean sets', () => {
		assert.deepEqual(
			setDifferenceBoolIterative(new Set([true, false]), new Set([false])),
			new Set([true]),
		)
		assert.deepEqual(
			setDifferenceBoolIterative(new Set([true, false]), new Set([true])),
			new Set([false]),
		)
		assert.deepEqual(
			setDifferenceBoolIterative(new Set([true]), new Set([false])),
			new Set([true]),
		)
		assert.deepEqual(
			setDifferenceBoolIterative(new Set([true, false]), new Set([true, false])),
			new Set(),
		)
	})

	test('supports variadic extra sets A \\ (B ∪ C ∪ ...)', () => {
		const a = new Set([1, 2, 3, 4, 5, 6])
		const b = new Set([2, 3])
		const c = new Set([5])
		const d = new Set([1, 99])

		const diff = setDifferenceBoolIterative(a, b, c, d)
		assert.deepEqual(diff, new Set([4, 6]))
	})

	test('edge cases: empty A, empty B, and both empty', () => {
		assert.deepEqual(setDifferenceBoolIterative(new Set(), new Set([1, 2])), new Set())
		assert.deepEqual(setDifferenceBoolIterative(new Set([1, 2]), new Set()), new Set([1, 2]))
		assert.deepEqual(setDifferenceBoolIterative(new Set(), new Set()), new Set())
	})

	test('edge cases: disjoint sets, subset, superset, and identical sets', () => {
		// Disjoint
		assert.deepEqual(
			setDifferenceBoolIterative(new Set([1, 2]), new Set([3, 4])),
			new Set([1, 2]),
		)

		// A is a proper subset of B -> empty
		assert.deepEqual(
			setDifferenceBoolIterative(new Set([2, 3]), new Set([1, 2, 3, 4])),
			new Set(),
		)

		// A is a proper superset of B
		assert.deepEqual(
			setDifferenceBoolIterative(new Set([1, 2, 3, 4]), new Set([2, 3])),
			new Set([1, 4]),
		)

		// Identical sets (different instances and same reference) -> empty
		const same = new Set(['a', 'b', 'c'])
		assert.deepEqual(setDifferenceBoolIterative(same, new Set(['a', 'b', 'c'])), new Set())
		assert.deepEqual(setDifferenceBoolIterative(same, same), new Set())
	})

	test('demonstrates non-commutativity (A \\ B !== B \\ A)', () => {
		const a = new Set([1, 2, 3])
		const b = new Set([2, 3, 4, 5])

		const aMinusB = setDifferenceBoolIterative(a, b)
		const bMinusA = setDifferenceBoolIterative(b, a)

		assert.deepEqual(aMinusB, new Set([1]))
		assert.deepEqual(bMinusA, new Set([4, 5]))
		assert.notDeepEqual(aMinusB, bMinusA)
	})

	test('handles NaN, object references, booleans, and mixed primitives', () => {
		const obj1 = { id: 1 }
		const obj2 = { id: 2 }
		const obj1Clone = { id: 1 }

		const a = new Set([NaN, obj1, obj2, true, false, null, undefined, 0, 'x'])
		const b = new Set([NaN, obj1, obj1Clone, false, -0, null])

		const diff = setDifferenceBoolIterative(a, b)

		// NaN matches NaN, obj1 matches obj1 by reference, -0 matches 0 via SameValueZero,
		// obj2 remains because only obj1 and obj1Clone are in b.
		assert.equal(diff.has(NaN), false)
		assert.equal(diff.has(obj1), false)
		assert.equal(diff.has(obj2), true)
		assert.equal(diff.has(true), true)
		assert.equal(diff.has(false), false)
		assert.equal(diff.has(null), false)
		assert.equal(diff.has(undefined), true)
		assert.equal(diff.has(0), false)
		assert.equal(diff.has('x'), true)
		assert.equal(diff.size, 4)
	})

	test('does not mutate input sets and always returns a fresh Set', () => {
		const a = new Set([1, 2, 3])
		const b = new Set([2])
		const c = new Set([4])

		const result = setDifferenceBoolIterative(a, b, c)
		result.add(999)

		assert.notEqual(result, a)
		assert.notEqual(result, b)
		assert.notEqual(result, c)
		assert.deepEqual(a, new Set([1, 2, 3]))
		assert.deepEqual(b, new Set([2]))
		assert.deepEqual(c, new Set([4]))

		// Even when B is empty, return value must not alias A
		const copy = setDifferenceBoolIterative(a, new Set())
		assert.notEqual(copy, a)
		assert.deepEqual(copy, a)
	})

	test('throws TypeError for invalid non-Set inputs', () => {
		const valid = new Set([1, 2])
		const invalidValues = [
			undefined,
			null,
			true,
			false,
			0,
			42,
			'set',
			[1, 2],
			{ a: 1 },
			new Map([[1, true]]),
			new WeakSet(),
		]

		for (const bad of invalidValues) {
			assert.throws(() => setDifferenceBoolIterative(bad, valid), TypeError)
			assert.throws(() => setDifferenceBoolIterative(valid, bad), TypeError)
			assert.throws(() => setDifferenceBoolIterative(valid, valid, bad), TypeError)
			assert.throws(() => setDifferenceBoolIterative(valid, valid, valid, bad), TypeError)
		}

		// Missing required arguments
		assert.throws(() => setDifferenceBoolIterative(), TypeError)
		assert.throws(() => setDifferenceBoolIterative(valid), TypeError)
	})

	test('cross-check: partition identity |(A \\ B)| + |(A ∩ B)| === |A| and (A \\ B) ∪ (A ∩ B) === A', () => {
		const universe = [0, 1, 2, 3, 4, true, false, 'a', 'b', NaN]
		const cases = [
			[new Set(universe), new Set([1, 3, true, NaN])],
			[new Set([true, false, 1, 2]), new Set([false, 2, 3])],
			[new Set(), new Set([1, 2, 3])],
			[new Set([1, 2, 3]), new Set()],
			[new Set([1, 2, 3]), new Set([4, 5, 6])],
			[new Set([1, 2, 3]), new Set([1, 2, 3])],
		]

		for (const [a, b] of cases) {
			const diff = setDifferenceBoolIterative(a, b)

			// Independent computation of intersection A ∩ B via Array filter
			const intersection = new Set([...a].filter((x) => b.has(x)))

			// Cardinality identity: |(A \ B)| + |(A ∩ B)| === |A|
			assert.equal(diff.size + intersection.size, a.size)

			// Disjointness: (A \ B) ∩ (A ∩ B) === ∅
			for (const item of diff) {
				assert.equal(intersection.has(item), false)
			}

			// Union reconstruction: (A \ B) ∪ (A ∩ B) === A
			const reconstructed = new Set([...diff, ...intersection])
			assert.equal(reconstructed.size, a.size)
			for (const item of a) {
				assert.equal(reconstructed.has(item), true)
			}

			// Cross-check against independent array-filter reference
			const referenceDiff = new Set([...a].filter((x) => !b.has(x)))
			assert.deepEqual(diff, referenceDiff)
		}
	})

	test('cross-check: multi-set identity A \\ (B ∪ C) === (A \\ B) \\ C', () => {
		const a = new Set([1, 2, 3, 4, 5, true, false, NaN])
		const b = new Set([2, 4, false])
		const c = new Set([4, 5, NaN, 'extra'])

		const variadic = setDifferenceBoolIterative(a, b, c)
		const sequential = setDifferenceBoolIterative(setDifferenceBoolIterative(a, b), c)
		const viaUnion = setDifferenceBoolIterative(a, new Set([...b, ...c]))

		assert.deepEqual(variadic, sequential)
		assert.deepEqual(variadic, viaUnion)
	})
})
