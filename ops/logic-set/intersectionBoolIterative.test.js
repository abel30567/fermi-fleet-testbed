import { describe, test } from 'node:test'
import assert from 'node:assert'
import { intersectionBoolIterative } from './intersectionBoolIterative.js'

describe('intersectionBoolIterative', () => {
	test('computes intersection of two overlapping sets', () => {
		const a = new Set([1, 2, 3, 4])
		const b = new Set([3, 4, 5, 6])
		const result = intersectionBoolIterative(a, b)

		assert.ok(result instanceof Set)
		assert.deepStrictEqual(result, new Set([3, 4]))
	})

	test('computes intersection over boolean sets', () => {
		assert.deepStrictEqual(
			intersectionBoolIterative(new Set([true, false]), new Set([true])),
			new Set([true])
		)
		assert.deepStrictEqual(
			intersectionBoolIterative(new Set([true]), new Set([false])),
			new Set()
		)
		assert.deepStrictEqual(
			intersectionBoolIterative(new Set([true, false]), new Set([false, true])),
			new Set([true, false])
		)
	})

	test('returns a shallow copy when given a single set', () => {
		const a = new Set([true, 'x', 42])
		const result = intersectionBoolIterative(a)

		assert.deepStrictEqual(result, a)
		assert.notStrictEqual(result, a)
	})

	test('handles empty sets', () => {
		const nonEmpty = new Set([1, 2, 3])
		const emptyA = new Set()
		const emptyB = new Set()

		assert.deepStrictEqual(intersectionBoolIterative(emptyA), new Set())
		assert.deepStrictEqual(intersectionBoolIterative(emptyA, emptyB), new Set())
		assert.deepStrictEqual(intersectionBoolIterative(emptyA, nonEmpty), new Set())
		assert.deepStrictEqual(intersectionBoolIterative(nonEmpty, emptyA), new Set())
		assert.deepStrictEqual(
			intersectionBoolIterative(nonEmpty, new Set([2, 3]), emptyA),
			new Set()
		)
	})

	test('handles disjoint sets', () => {
		const a = new Set(['a', 'b'])
		const b = new Set(['c', 'd'])
		const c = new Set(['e', 'f'])

		assert.deepStrictEqual(intersectionBoolIterative(a, b), new Set())
		assert.deepStrictEqual(intersectionBoolIterative(a, b, c), new Set())
	})

	test('handles identical sets and same reference repeated', () => {
		const a = new Set([10, 20, 30])
		const b = new Set([10, 20, 30])

		const resDifferentRefs = intersectionBoolIterative(a, b)
		assert.deepStrictEqual(resDifferentRefs, new Set([10, 20, 30]))
		assert.notStrictEqual(resDifferentRefs, a)
		assert.notStrictEqual(resDifferentRefs, b)

		const resSameRef = intersectionBoolIterative(a, a, a)
		assert.deepStrictEqual(resSameRef, new Set([10, 20, 30]))
		assert.notStrictEqual(resSameRef, a)
	})

	test('handles three or more sets including pairwise-overlapping with empty total intersection', () => {
		const a = new Set([1, 2, 3, 4, 5])
		const b = new Set([2, 3, 4, 6])
		const c = new Set([0, 3, 4, 7])
		const d = new Set([4, 8, 9])

		assert.deepStrictEqual(intersectionBoolIterative(a, b, c), new Set([3, 4]))
		assert.deepStrictEqual(intersectionBoolIterative(a, b, c, d), new Set([4]))

		// Pairwise overlaps exist, but no element is in all three
		const p1 = new Set([1, 2])
		const p2 = new Set([2, 3])
		const p3 = new Set([3, 1])
		assert.deepStrictEqual(intersectionBoolIterative(p1, p2, p3), new Set())
	})

	test('handles NaN, -0/+0, booleans, null, undefined, symbols, and object references', () => {
		const sharedObj = { id: 1 }
		const objA = { id: 2 }
		const objB = { id: 2 }
		const sharedSym = Symbol('shared')
		const uniqueSym = Symbol('unique')

		const a = new Set([NaN, -0, true, false, null, undefined, sharedObj, objA, sharedSym, uniqueSym])
		const b = new Set([NaN, +0, false, null, undefined, sharedObj, objB, sharedSym])

		const result = intersectionBoolIterative(a, b)

		assert.strictEqual(result.size, 7)
		assert.strictEqual(result.has(NaN), true)
		assert.strictEqual(result.has(0), true)
		assert.strictEqual(result.has(false), true)
		assert.strictEqual(result.has(true), false)
		assert.strictEqual(result.has(null), true)
		assert.strictEqual(result.has(undefined), true)
		assert.strictEqual(result.has(sharedObj), true)
		assert.strictEqual(result.has(objA), false)
		assert.strictEqual(result.has(objB), false)
		assert.strictEqual(result.has(sharedSym), true)
		assert.strictEqual(result.has(uniqueSym), false)
	})

	test('does not mutate input sets and returned set is decoupled', () => {
		const a = new Set([1, 2, 3])
		const b = new Set([2, 3, 4])
		const snapshotA = [...a]
		const snapshotB = [...b]

		const result = intersectionBoolIterative(a, b)
		result.add(999)
		result.delete(2)

		assert.deepStrictEqual([...a], snapshotA)
		assert.deepStrictEqual([...b], snapshotB)

		const singleCopy = intersectionBoolIterative(a)
		singleCopy.clear()
		assert.deepStrictEqual([...a], snapshotA)
	})

	test('throws TypeError on empty argument list or any non-Set argument', () => {
		assert.throws(() => intersectionBoolIterative(), TypeError)

		const invalidInputs = [
			null,
			undefined,
			true,
			false,
			0,
			42,
			'set',
			[1, 2, 3],
			{ a: 1 },
			new Map([[1, 2]]),
			new WeakSet()
		]

		for (const bad of invalidInputs) {
			assert.throws(() => intersectionBoolIterative(bad), TypeError)
			assert.throws(() => intersectionBoolIterative(new Set([1]), bad), TypeError)
			assert.throws(() => intersectionBoolIterative(bad, new Set([1])), TypeError)
			// Even if the first set is empty, validation must still reject invalid later arguments
			assert.throws(() => intersectionBoolIterative(new Set(), bad), TypeError)
		}
	})

	test('cross-checks against array filter reference implementation, inclusion-exclusion, commutativity, and associativity', () => {
		const sets = [
			new Set(),
			new Set([true]),
			new Set([false]),
			new Set([true, false]),
			new Set([1, 2, 3, 4, 5]),
			new Set([3, 4, 5, 6, 7]),
			new Set([1, 3, 5, 7, 9]),
			new Set([NaN, 0, 1, 'a', true])
		]

		const referenceIntersection = (a, b) => new Set([...a].filter((x) => b.has(x)))
		const unionSize = (...xs) => {
			const u = new Set()
			for (const s of xs) {
				for (const v of s) u.add(v)
			}
			return u.size
		}

		for (const a of sets) {
			// Idempotence: A ∩ A = A
			assert.deepStrictEqual(intersectionBoolIterative(a, a), a)

			for (const b of sets) {
				const ab = intersectionBoolIterative(a, b)
				const ba = intersectionBoolIterative(b, a)
				const ref = referenceIntersection(a, b)

				// Cross-check against independent filter computation
				assert.deepStrictEqual(ab, ref)

				// Commutativity: A ∩ B = B ∩ A
				assert.deepStrictEqual(ab, ba)

				// Inclusion-exclusion (2 sets): |A ∩ B| = |A| + |B| - |A ∪ B|
				assert.strictEqual(ab.size, a.size + b.size - unionSize(a, b))
			}
		}

		// Associativity and 3-set inclusion-exclusion
		const triples = [
			[sets[4], sets[5], sets[6]],
			[sets[1], sets[2], sets[3]],
			[sets[0], sets[4], sets[7]],
			[sets[4], sets[6], sets[7]]
		]

		for (const [a, b, c] of triples) {
			const left = intersectionBoolIterative(intersectionBoolIterative(a, b), c)
			const right = intersectionBoolIterative(a, intersectionBoolIterative(b, c))
			const allThree = intersectionBoolIterative(a, b, c)

			assert.deepStrictEqual(left, right)
			assert.deepStrictEqual(left, allThree)

			// 3-set inclusion-exclusion:
			// |A ∪ B ∪ C| = |A| + |B| + |C| - |A ∩ B| - |A ∩ C| - |B ∩ C| + |A ∩ B ∩ C|
			const ab = intersectionBoolIterative(a, b)
			const ac = intersectionBoolIterative(a, c)
			const bc = intersectionBoolIterative(b, c)
			const lhs = unionSize(a, b, c)
			const rhs = a.size + b.size + c.size - ab.size - ac.size - bc.size + allThree.size
			assert.strictEqual(lhs, rhs)
		}
	})
})
