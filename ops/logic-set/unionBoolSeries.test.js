import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { unionBoolSeries } from './unionBoolSeries.js'

describe('unionBoolSeries - plain booleans', () => {
	test('computes the complete binary OR truth table', () => {
		assert.strictEqual(unionBoolSeries(false, false), false)
		assert.strictEqual(unionBoolSeries(false, true), true)
		assert.strictEqual(unionBoolSeries(true, false), true)
		assert.strictEqual(unionBoolSeries(true, true), true)
	})

	test('satisfies boolean algebra laws (commutativity, associativity, idempotence, identity, annihilation)', () => {
		const vals = [false, true]
		for (const a of vals) {
			// Idempotence, identity, annihilation
			assert.strictEqual(unionBoolSeries(a, a), a)
			assert.strictEqual(unionBoolSeries(a, false), a)
			assert.strictEqual(unionBoolSeries(false, a), a)
			assert.strictEqual(unionBoolSeries(a, true), true)
			assert.strictEqual(unionBoolSeries(true, a), true)

			for (const b of vals) {
				// Commutativity
				assert.strictEqual(unionBoolSeries(a, b), unionBoolSeries(b, a))

				for (const c of vals) {
					// Associativity
					assert.strictEqual(
						unionBoolSeries(unionBoolSeries(a, b), c),
						unionBoolSeries(a, unionBoolSeries(b, c))
					)
				}
			}
		}
	})

	test('cross-checks against De Morgan law and product complement identity 1 - (1 - χ(a))(1 - χ(b))', () => {
		const vals = [false, true]
		for (const a of vals) {
			for (const b of vals) {
				const result = unionBoolSeries(a, b)
				// Native disjunction
				assert.strictEqual(result, a || b)
				// De Morgan: a ∨ b ≡ ¬(¬a ∧ ¬b)
				assert.strictEqual(result, !(!a && !b))
				// Factored product form: 1 - (1 - u)(1 - v)
				const u = Number(a)
				const v = Number(b)
				assert.strictEqual(result, 1 - (1 - u) * (1 - v) === 1)
			}
		}
	})
})

describe('unionBoolSeries - JS Set objects', () => {
	test('computes union for disjoint and overlapping sets', () => {
		const disjoint = unionBoolSeries(new Set([1, 2]), new Set([3, 4]))
		assert.ok(disjoint instanceof Set)
		assert.deepStrictEqual([...disjoint], [1, 2, 3, 4])

		const overlapping = unionBoolSeries(new Set([1, 2, 3]), new Set([2, 3, 4]))
		assert.deepStrictEqual([...overlapping], [1, 2, 3, 4])
	})

	test('handles empty sets, subsets, supersets, and identical references', () => {
		assert.deepStrictEqual([...unionBoolSeries(new Set(), new Set())], [])
		assert.deepStrictEqual([...unionBoolSeries(new Set(['a', 'b']), new Set())], ['a', 'b'])
		assert.deepStrictEqual([...unionBoolSeries(new Set(), new Set(['c']))], ['c'])

		const sub = new Set([2, 4])
		const sup = new Set([1, 2, 3, 4, 5])
		assert.deepStrictEqual([...unionBoolSeries(sub, sup)], [2, 4, 1, 3, 5])
		assert.strictEqual(unionBoolSeries(sub, sup).size, 5)

		const same = new Set([10, 20])
		const selfUnion = unionBoolSeries(same, same)
		assert.notStrictEqual(selfUnion, same)
		assert.deepStrictEqual([...selfUnion], [10, 20])
	})

	test('does not mutate inputs and returns a fresh Set instance', () => {
		const a = new Set([1, 2])
		const b = new Set([2, 3])
		const u = unionBoolSeries(a, b)

		assert.notStrictEqual(u, a)
		assert.notStrictEqual(u, b)
		u.add(99)
		assert.deepStrictEqual([...a], [1, 2])
		assert.deepStrictEqual([...b], [2, 3])
	})

	test('handles SameValueZero edge cases (NaN, -0/+0, undefined, null, objects, symbols)', () => {
		const obj1 = { id: 1 }
		const obj2 = { id: 1 }
		const sym = Symbol('k')

		const a = new Set([NaN, -0, undefined, obj1, sym])
		const b = new Set([NaN, +0, null, obj1, obj2, sym])
		const u = unionBoolSeries(a, b)

		assert.strictEqual(u.size, 7)
		assert.strictEqual(u.has(NaN), true)
		assert.strictEqual(u.has(0), true)
		assert.strictEqual(u.has(undefined), true)
		assert.strictEqual(u.has(null), true)
		assert.strictEqual(u.has(obj1), true)
		assert.strictEqual(u.has(obj2), true)
		assert.strictEqual(u.has(sym), true)
	})

	test('cross-checks against cardinality inclusion-exclusion and De Morgan complement over a finite universe', () => {
		const universe = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
		const pairs = [
			[new Set(), new Set()],
			[new Set([0, 2, 4, 6, 8]), new Set([1, 3, 5, 7, 9])],
			[new Set([1, 2, 3, 4]), new Set([3, 4, 5, 6])],
			[new Set([0, 5, 9]), new Set([5])]
		]

		for (const [a, b] of pairs) {
			const u = unionBoolSeries(a, b)

			// Independent intersection for inclusion-exclusion cardinality check:
			// |A ∪ B| = |A| + |B| - |A ∩ B|
			let intersectionSize = 0
			for (const x of universe) {
				if (a.has(x) && b.has(x)) {
					intersectionSize += 1
				}
			}
			assert.strictEqual(u.size, a.size + b.size - intersectionSize)

			// Independent De Morgan check over universe U:
			// x ∈ (A ∪ B) ⇔ x ∉ ((U \ A) ∩ (U \ B))
			const compA = new Set(universe.filter((x) => !a.has(x)))
			const compB = new Set(universe.filter((x) => !b.has(x)))
			for (const x of universe) {
				const inDeMorganUnion = !(compA.has(x) && compB.has(x))
				assert.strictEqual(u.has(x), inDeMorganUnion)
			}

			// Commutativity on membership
			const rev = unionBoolSeries(b, a)
			assert.strictEqual(u.size, rev.size)
			for (const x of u) {
				assert.strictEqual(rev.has(x), true)
			}
		}
	})
})

describe('unionBoolSeries - strict input validation', () => {
	test('throws TypeError for mixed boolean and Set operands', () => {
		assert.throws(() => unionBoolSeries(true, new Set()), TypeError)
		assert.throws(() => unionBoolSeries(new Set(), false), TypeError)
		assert.throws(() => unionBoolSeries(false, new Set([false])), TypeError)
	})

	test('throws TypeError for non-boolean, non-Set values and missing arguments', () => {
		const invalidCases = [
			[],
			[true],
			[new Set()],
			[0, 1],
			[1, true],
			['true', 'false'],
			[null, null],
			[undefined, undefined],
			[new Boolean(true), new Boolean(false)],
			[new Boolean(true), false],
			[[1, 2], [3, 4]],
			[{}, {}],
			[new Map(), new Map()],
			[new WeakSet(), new WeakSet()],
			[1n, 0n],
			[Symbol('a'), Symbol('b')]
		]

		for (const args of invalidCases) {
			const label = args.map((v) => String(v)).join(', ')
			assert.throws(
				() => unionBoolSeries(...args),
				TypeError,
				`Expected TypeError for args: [${label}]`
			)
		}
	})
})
