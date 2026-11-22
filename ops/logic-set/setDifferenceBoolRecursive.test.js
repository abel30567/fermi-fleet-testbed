import { describe, test } from 'node:test'
import assert from 'node:assert'
import { setDifferenceBoolRecursive } from './setDifferenceBoolRecursive.js'

/**
 * Independent iterative reference implementation for cross-checking.
 *
 * @template T
 * @param {Set<T>} setA
 * @param {...Set<T>} excluded
 * @returns {Set<T>}
 */
function iterativeSetDifference(setA, ...excluded) {
	const result = new Set()
	for (const item of setA) {
		let present = false
		for (const other of excluded) {
			if (other.has(item)) {
				present = true
				break
			}
		}
		if (!present) {
			result.add(item)
		}
	}
	return result
}

/**
 * Independent iterative set intersection for identity checks.
 *
 * @template T
 * @param {Set<T>} setA
 * @param {Set<T>} setB
 * @returns {Set<T>}
 */
function iterativeIntersection(setA, setB) {
	const result = new Set()
	for (const item of setA) {
		if (setB.has(item)) {
			result.add(item)
		}
	}
	return result
}

describe('setDifferenceBoolRecursive', () => {
	describe('normal cases', () => {
		test('overlapping sets of numbers', () => {
			const a = new Set([1, 2, 3, 4, 5])
			const b = new Set([3, 4, 6, 7])
			const diff = setDifferenceBoolRecursive(a, b)
			assert.deepStrictEqual(diff, new Set([1, 2, 5]))
		})

		test('plain boolean sets', () => {
			assert.deepStrictEqual(
				setDifferenceBoolRecursive(new Set([true, false]), new Set([true])),
				new Set([false])
			)
			assert.deepStrictEqual(
				setDifferenceBoolRecursive(new Set([true, false]), new Set([false])),
				new Set([true])
			)
			assert.deepStrictEqual(
				setDifferenceBoolRecursive(new Set([true]), new Set([false])),
				new Set([true])
			)
		})

		test('disjoint sets return all elements of A', () => {
			const a = new Set(['alpha', 'beta', 'gamma'])
			const b = new Set(['delta', 'epsilon'])
			const diff = setDifferenceBoolRecursive(a, b)
			assert.deepStrictEqual(diff, new Set(['alpha', 'beta', 'gamma']))
		})

		test('subset and superset relationships', () => {
			const small = new Set([2, 4])
			const large = new Set([1, 2, 3, 4, 5])
			assert.deepStrictEqual(setDifferenceBoolRecursive(small, large), new Set())
			assert.deepStrictEqual(setDifferenceBoolRecursive(large, small), new Set([1, 3, 5]))
		})

		test('asymmetry: A \\ B !== B \\ A for distinct sets', () => {
			const a = new Set([1, 2, 3])
			const b = new Set([3, 4, 5])
			const aMinusB = setDifferenceBoolRecursive(a, b)
			const bMinusA = setDifferenceBoolRecursive(b, a)
			assert.deepStrictEqual(aMinusB, new Set([1, 2]))
			assert.deepStrictEqual(bMinusA, new Set([4, 5]))
			assert.notDeepStrictEqual(aMinusB, bMinusA)
		})

		test('variadic difference A \\ B \\ C \\ D', () => {
			const a = new Set([1, 2, 3, 4, 5, 6, 7, 8])
			const b = new Set([2, 4])
			const c = new Set([5, 6])
			const d = new Set([1, 8, 99])
			assert.deepStrictEqual(setDifferenceBoolRecursive(a, b, c, d), new Set([3, 7]))
		})

		test('special JavaScript values (NaN, null, undefined, objects, symbols, -0/+0)', () => {
			const obj1 = { id: 1 }
			const obj2 = { id: 2 }
			const sym1 = Symbol('s1')
			const sym2 = Symbol('s2')
			const a = new Set([NaN, null, undefined, obj1, obj2, sym1, sym2, 0])
			const b = new Set([NaN, undefined, obj2, sym2, -0])
			const diff = setDifferenceBoolRecursive(a, b)
			assert.deepStrictEqual(diff, new Set([null, obj1, sym1]))
		})
	})

	describe('edge cases', () => {
		test('empty A yields empty Set', () => {
			const diff = setDifferenceBoolRecursive(new Set(), new Set([1, 2, 3]))
			assert.deepStrictEqual(diff, new Set())
			assert.strictEqual(diff.size, 0)
		})

		test('empty B yields a fresh copy of A', () => {
			const a = new Set([10, 20, 30])
			const diff = setDifferenceBoolRecursive(a, new Set())
			assert.deepStrictEqual(diff, new Set([10, 20, 30]))
			assert.notStrictEqual(diff, a)
		})

		test('both A and B empty yields empty Set', () => {
			const diff = setDifferenceBoolRecursive(new Set(), new Set())
			assert.deepStrictEqual(diff, new Set())
		})

		test('identical sets yield empty Set (distinct and same reference)', () => {
			const a = new Set(['x', 'y', 'z'])
			const aCopy = new Set(['x', 'y', 'z'])
			assert.deepStrictEqual(setDifferenceBoolRecursive(a, aCopy), new Set())
			assert.deepStrictEqual(setDifferenceBoolRecursive(a, a), new Set())
		})

		test('singleton sets', () => {
			assert.deepStrictEqual(setDifferenceBoolRecursive(new Set([42]), new Set([42])), new Set())
			assert.deepStrictEqual(setDifferenceBoolRecursive(new Set([42]), new Set([7])), new Set([42]))
		})

		test('does not mutate inputs and result is independent of inputs', () => {
			const a = new Set([1, 2, 3, 4])
			const b = new Set([2, 4])
			const c = new Set([3])

			const diff = setDifferenceBoolRecursive(a, b, c)
			assert.deepStrictEqual(diff, new Set([1]))

			// Inputs remain unchanged
			assert.deepStrictEqual(a, new Set([1, 2, 3, 4]))
			assert.deepStrictEqual(b, new Set([2, 4]))
			assert.deepStrictEqual(c, new Set([3]))

			// Mutating result does not affect inputs
			diff.add(999)
			diff.delete(1)
			assert.deepStrictEqual(a, new Set([1, 2, 3, 4]))
			assert.deepStrictEqual(b, new Set([2, 4]))
			assert.deepStrictEqual(c, new Set([3]))
		})

		test('invalid inputs throw TypeError', () => {
			const valid = new Set([1, 2])
			const invalidValues = [
				undefined,
				null,
				[1, 2],
				{ a: 1 },
				new Map([[1, true]]),
				true,
				false,
				42,
				'set',
			]

			// Missing arguments
			assert.throws(() => setDifferenceBoolRecursive(), TypeError)
			assert.throws(() => setDifferenceBoolRecursive(valid), TypeError)

			for (const bad of invalidValues) {
				assert.throws(() => setDifferenceBoolRecursive(bad, valid), TypeError)
				assert.throws(() => setDifferenceBoolRecursive(valid, bad), TypeError)
				assert.throws(() => setDifferenceBoolRecursive(valid, valid, bad), TypeError)
				// Strict validation even when setA is empty (no early return bypass)
				assert.throws(() => setDifferenceBoolRecursive(new Set(), valid, bad), TypeError)
			}
		})
	})

	describe('cross-checks and set-algebra identities', () => {
		test('matches independent iterative implementation and satisfies |A \\ B| + |A ∩ B| === |A|', () => {
			const pairs = [
				[new Set(), new Set()],
				[new Set([true, false]), new Set([false])],
				[new Set([1, 2, 3, 4, 5, 6, 7]), new Set([2, 4, 6, 8, 10])],
				[new Set(['a', 'b', 'c', 'd']), new Set(['e', 'f'])],
				[new Set([1, 2, 3]), new Set([1, 2, 3, 4, 5])],
				[
					new Set(Array.from({ length: 1000 }, (_, i) => i)),
					new Set(Array.from({ length: 1000 }, (_, i) => i * 2)),
				],
			]

			for (const [a, b] of pairs) {
				const actual = setDifferenceBoolRecursive(a, b)
				const expected = iterativeSetDifference(a, b)
				const intersection = iterativeIntersection(a, b)

				// Exact match with independent iterative computation
				assert.deepStrictEqual(actual, expected)

				// Cardinality identity: |A \ B| + |A ∩ B| === |A|
				assert.strictEqual(actual.size + intersection.size, a.size)

				// Disjointness: (A \ B) ∩ B === ∅
				assert.strictEqual(iterativeIntersection(actual, b).size, 0)

				// Reconstruction: (A \ B) ∪ (A ∩ B) === A
				const reconstructed = new Set([...actual, ...intersection])
				assert.deepStrictEqual(reconstructed, a)
			}
		})

		test('variadic cross-check against independent iterative implementation', () => {
			const a = new Set(Array.from({ length: 200 }, (_, i) => i))
			const b = new Set(Array.from({ length: 100 }, (_, i) => i * 2))
			const c = new Set(Array.from({ length: 70 }, (_, i) => i * 3))
			const d = new Set(Array.from({ length: 40 }, (_, i) => i * 5))

			const actual = setDifferenceBoolRecursive(a, b, c, d)
			const expected = iterativeSetDifference(a, b, c, d)
			assert.deepStrictEqual(actual, expected)

			// Cardinality check against union of excluded sets: |A \ (B ∪ C ∪ D)| + |A ∩ (B ∪ C ∪ D)| === |A|
			const excludedUnion = new Set([...b, ...c, ...d])
			const intersectionWithUnion = iterativeIntersection(a, excludedUnion)
			assert.strictEqual(actual.size + intersectionWithUnion.size, a.size)
		})
	})
})
