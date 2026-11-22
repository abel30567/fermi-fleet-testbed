import { describe, test } from 'node:test'
import assert from 'node:assert'
import { orBoolStable } from './orBoolStable.js'

describe('orBoolStable', () => {
	describe('boolean truth table', () => {
		const cases = [
			[false, false, false],
			[false, true, true],
			[true, false, true],
			[true, true, true],
		]

		for (const [a, b, expected] of cases) {
			test(`orBoolStable(${a}, ${b}) === ${expected}`, () => {
				const result = orBoolStable(a, b)
				assert.strictEqual(typeof result, 'boolean')
				assert.strictEqual(result, expected)
			})
		}
	})

	describe('variadic boolean calls', () => {
		test('3-argument exhaustive truth table', () => {
			const bools = [false, true]
			for (const a of bools) {
				for (const b of bools) {
					for (const c of bools) {
						const expected = a || b || c
						assert.strictEqual(orBoolStable(a, b, c), expected)
					}
				}
			}
		})

		test('4+ arguments with true in various positions', () => {
			assert.strictEqual(orBoolStable(false, false, false, false), false)
			assert.strictEqual(orBoolStable(true, false, false, false), true)
			assert.strictEqual(orBoolStable(false, false, true, false), true)
			assert.strictEqual(orBoolStable(false, false, false, true), true)
			assert.strictEqual(orBoolStable(true, true, true, true, true), true)
		})

		test('large variadic boolean lists', () => {
			const manyFalse = Array(10_000).fill(false)
			assert.strictEqual(orBoolStable(...manyFalse), false)
			assert.strictEqual(orBoolStable(...manyFalse, true), true)
			assert.strictEqual(orBoolStable(true, ...manyFalse), true)
		})
	})

	describe('JS Set disjunction, immutability, and SameValueZero', () => {
		test('disjoint and overlapping sets preserve insertion order', () => {
			const a = new Set([1, 2])
			const b = new Set([3, 4])
			const disjoint = orBoolStable(a, b)
			assert.ok(disjoint instanceof Set)
			assert.deepStrictEqual([...disjoint], [1, 2, 3, 4])

			const c = new Set([2, 3])
			const overlapping = orBoolStable(a, c)
			assert.deepStrictEqual([...overlapping], [1, 2, 3])
		})

		test('empty sets and variadic sets', () => {
			const empty1 = new Set()
			const empty2 = new Set()
			const resEmpty = orBoolStable(empty1, empty2)
			assert.ok(resEmpty instanceof Set)
			assert.strictEqual(resEmpty.size, 0)
			assert.notStrictEqual(resEmpty, empty1)
			assert.notStrictEqual(resEmpty, empty2)

			const s1 = new Set(['a', 'b'])
			const s2 = new Set(['b', 'c'])
			const s3 = new Set(['d'])
			const s4 = new Set()
			const union = orBoolStable(s1, s2, s3, s4)
			assert.deepStrictEqual([...union], ['a', 'b', 'c', 'd'])
		})

		test('does not mutate inputs and returns a fresh Set instance', () => {
			const a = new Set([1, 2])
			const b = new Set([2, 3])
			const result = orBoolStable(a, b)

			assert.notStrictEqual(result, a)
			assert.notStrictEqual(result, b)
			assert.deepStrictEqual([...a], [1, 2])
			assert.deepStrictEqual([...b], [2, 3])

			result.add(99)
			assert.strictEqual(a.has(99), false)
			assert.strictEqual(b.has(99), false)

			const selfUnion = orBoolStable(a, a)
			assert.notStrictEqual(selfUnion, a)
			assert.deepStrictEqual([...selfUnion], [1, 2])
		})

		test('SameValueZero semantics for NaN, -0, +0, and references', () => {
			const sNaN1 = new Set([NaN, 'x'])
			const sNaN2 = new Set([NaN, 'y'])
			const resNaN = orBoolStable(sNaN1, sNaN2)
			assert.strictEqual(resNaN.size, 3)
			assert.strictEqual(resNaN.has(NaN), true)
			assert.strictEqual(resNaN.has('x'), true)
			assert.strictEqual(resNaN.has('y'), true)

			const sNegZero = new Set([-0])
			const sPosZero = new Set([+0])
			const resZero = orBoolStable(sNegZero, sPosZero)
			assert.strictEqual(resZero.size, 1)
			assert.strictEqual(resZero.has(0), true)
			assert.strictEqual(resZero.has(-0), true)
			assert.strictEqual(Object.is([...resZero][0], +0), true)

			const sharedObj = { id: 1 }
			const objA = { id: 2 }
			const objB = { id: 2 }
			const resObj = orBoolStable(
				new Set([sharedObj, objA, null, undefined]),
				new Set([sharedObj, objB, null])
			)
			assert.strictEqual(resObj.size, 5)
			assert.strictEqual(resObj.has(sharedObj), true)
			assert.strictEqual(resObj.has(objA), true)
			assert.strictEqual(resObj.has(objB), true)
			assert.strictEqual(resObj.has(null), true)
			assert.strictEqual(resObj.has(undefined), true)
		})
	})

	describe('strict input validation (no short-circuit masking)', () => {
		test('throws TypeError on fewer than 2 arguments', () => {
			assert.throws(() => orBoolStable(), TypeError)
			assert.throws(() => orBoolStable(true), TypeError)
			assert.throws(() => orBoolStable(false), TypeError)
			assert.throws(() => orBoolStable(new Set([1])), TypeError)
		})

		test('throws TypeError when invalid argument appears after true', () => {
			const invalidAfterTrue = [
				1,
				0,
				NaN,
				'true',
				'',
				null,
				undefined,
				{},
				[],
				new Boolean(false),
				new Boolean(true),
				new Set(),
				Symbol('x'),
				1n,
			]

			for (const bad of invalidAfterTrue) {
				assert.throws(
					() => orBoolStable(true, bad),
					TypeError,
					`expected TypeError for orBoolStable(true, ${String(bad)})`
				)
				assert.throws(
					() => orBoolStable(true, false, bad),
					TypeError,
					`expected TypeError for orBoolStable(true, false, ${String(bad)})`
				)
			}
		})

		test('throws TypeError on invalid first argument or non-Set collections', () => {
			assert.throws(() => orBoolStable(1, true), TypeError)
			assert.throws(() => orBoolStable(null, false), TypeError)
			assert.throws(() => orBoolStable(undefined, true), TypeError)
			assert.throws(() => orBoolStable(new Boolean(true), false), TypeError)
			assert.throws(() => orBoolStable([1], [2]), TypeError)
			assert.throws(() => orBoolStable(new Map(), new Map()), TypeError)
			assert.throws(() => orBoolStable(new WeakSet(), new WeakSet()), TypeError)
		})

		test('throws TypeError on mixed boolean and Set arguments without mutating Sets', () => {
			const s1 = new Set([1])
			const s2 = new Set([2])

			assert.throws(() => orBoolStable(true, s1), TypeError)
			assert.throws(() => orBoolStable(false, s1), TypeError)
			assert.throws(() => orBoolStable(s1, true), TypeError)
			assert.throws(() => orBoolStable(s1, false), TypeError)
			assert.throws(() => orBoolStable(s1, s2, true), TypeError)
			assert.throws(() => orBoolStable(true, false, s1), TypeError)
			assert.throws(() => orBoolStable(s1, [2]), TypeError)
			assert.throws(() => orBoolStable(s1, s2, null), TypeError)

			assert.deepStrictEqual([...s1], [1])
			assert.deepStrictEqual([...s2], [2])
		})
	})

	describe('independent cross-checks (De Morgan & algebraic laws)', () => {
		test('boolean De Morgan law: a OR b === !(!a && !b)', () => {
			const bools = [false, true]
			for (const a of bools) {
				for (const b of bools) {
					const deMorgan2 = !(!a && !b)
					assert.strictEqual(orBoolStable(a, b), deMorgan2)

					for (const c of bools) {
						const deMorgan3 = !(!a && !b && !c)
						assert.strictEqual(orBoolStable(a, b, c), deMorgan3)
					}
				}
			}
		})

		test('boolean algebraic laws (commutativity, associativity, idempotence, identity, domination)', () => {
			const bools = [false, true]
			for (const a of bools) {
				assert.strictEqual(orBoolStable(a, a), a)
				assert.strictEqual(orBoolStable(a, false), a)
				assert.strictEqual(orBoolStable(false, a), a)
				assert.strictEqual(orBoolStable(a, true), true)
				assert.strictEqual(orBoolStable(true, a), true)

				for (const b of bools) {
					assert.strictEqual(orBoolStable(a, b), orBoolStable(b, a))

					for (const c of bools) {
						assert.strictEqual(
							orBoolStable(orBoolStable(a, b), c),
							orBoolStable(a, orBoolStable(b, c))
						)
						assert.strictEqual(
							orBoolStable(orBoolStable(a, b), c),
							orBoolStable(a, b, c)
						)
					}
				}
			}
		})

		test('set De Morgan law, indicator equivalence, and inclusion-exclusion', () => {
			const universe = [0, 1, 2, 3, 4, 'alpha', NaN]
			const complement = (s) => new Set(universe.filter((x) => !s.has(x)))
			const intersect = (x, y) => new Set([...x].filter((v) => y.has(v)))
			const sameElements = (x, y) =>
				x.size === y.size && [...x].every((v) => y.has(v))

			const sets = [
				new Set(),
				new Set([0, 2, NaN]),
				new Set([1, 2, 'alpha']),
				new Set([3, 4, 'alpha', NaN]),
				new Set(universe),
			]

			for (const A of sets) {
				// Identity & idempotence
				assert.ok(sameElements(orBoolStable(A, new Set()), A))
				assert.ok(sameElements(orBoolStable(A, A), A))

				for (const B of sets) {
					const unionAB = orBoolStable(A, B)
					const unionBA = orBoolStable(B, A)

					// Commutativity
					assert.ok(sameElements(unionAB, unionBA))

					// De Morgan: A ∪ B = (Aᶜ ∩ Bᶜ)ᶜ
					const deMorganSet = complement(intersect(complement(A), complement(B)))
					assert.ok(sameElements(unionAB, deMorganSet))

					// Indicator function equivalence: x ∈ (A ∪ B) ⇔ (x ∈ A) ∨ (x ∈ B)
					for (const x of universe) {
						assert.strictEqual(
							unionAB.has(x),
							orBoolStable(A.has(x), B.has(x))
						)
					}

					// Inclusion-exclusion: |A ∪ B| = |A| + |B| - |A ∩ B|
					assert.strictEqual(
						unionAB.size,
						A.size + B.size - intersect(A, B).size
					)

					for (const C of sets) {
						// Associativity: (A ∪ B) ∪ C = A ∪ (B ∪ C) = A ∪ B ∪ C
						const left = orBoolStable(orBoolStable(A, B), C)
						const right = orBoolStable(A, orBoolStable(B, C))
						const variadic = orBoolStable(A, B, C)
						assert.ok(sameElements(left, right))
						assert.ok(sameElements(left, variadic))
					}
				}
			}
		})
	})
})
