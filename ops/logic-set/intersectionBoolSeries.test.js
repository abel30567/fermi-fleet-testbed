import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { intersectionBoolSeries } from './intersectionBoolSeries.js'

function setsEqual(a, b) {
	if (a.size !== b.size) return false
	for (const x of a) {
		if (!b.has(x)) return false
	}
	return true
}

function setUnion(a, b) {
	return new Set([...a, ...b])
}

function setDifference(a, b) {
	const out = new Set()
	for (const x of a) {
		if (!b.has(x)) out.add(x)
	}
	return out
}

describe('intersectionBoolSeries', () => {
	describe('plain booleans', () => {
		it('matches the full boolean conjunction truth table', () => {
			assert.strictEqual(intersectionBoolSeries(false, false), false)
			assert.strictEqual(intersectionBoolSeries(false, true), false)
			assert.strictEqual(intersectionBoolSeries(true, false), false)
			assert.strictEqual(intersectionBoolSeries(true, true), true)
		})

		it('satisfies algebraic laws (commutativity, associativity, idempotence, identity, annihilator)', () => {
			const bools = [false, true]
			for (const a of bools) {
				assert.strictEqual(intersectionBoolSeries(a, a), a)
				assert.strictEqual(intersectionBoolSeries(a, true), a)
				assert.strictEqual(intersectionBoolSeries(a, false), false)
				for (const b of bools) {
					assert.strictEqual(
						intersectionBoolSeries(a, b),
						intersectionBoolSeries(b, a)
					)
					for (const c of bools) {
						assert.strictEqual(
							intersectionBoolSeries(intersectionBoolSeries(a, b), c),
							intersectionBoolSeries(a, intersectionBoolSeries(b, c))
						)
					}
				}
			}
		})

		it('cross-checks against De Morgan, inclusion-exclusion, and polarization identities', () => {
			const bools = [false, true]
			for (const a of bools) {
				for (const b of bools) {
					const actual = intersectionBoolSeries(a, b)

					// Native conjunction
					assert.strictEqual(actual, a && b)

					// De Morgan's law: a ∧ b = ¬(¬a ∨ ¬b)
					assert.strictEqual(actual, !(!a || !b))

					// Inclusion-exclusion indicator identity: χ(a ∧ b) = χ(a) + χ(b) - χ(a ∨ b)
					const ieIndicator = Number(a) + Number(b) - Number(a || b)
					assert.strictEqual(actual, ieIndicator === 1)

					// Polarization identity: χ(a)·χ(b) = ((χ(a)+χ(b))² - χ(a)² - χ(b)²) / 2
					const xa = Number(a)
					const xb = Number(b)
					const polarized = ((xa + xb) ** 2 - xa ** 2 - xb ** 2) / 2
					assert.strictEqual(actual, polarized === 1)
				}
			}
		})
	})

	describe('JS Set objects', () => {
		it('computes intersection for normal overlapping sets', () => {
			const a = new Set([1, 2, 3, 4])
			const b = new Set([3, 4, 5, 6])
			const res = intersectionBoolSeries(a, b)

			assert.ok(res instanceof Set)
			assert.ok(setsEqual(res, new Set([3, 4])))
		})

		it('handles disjoint sets, subsets, supersets, and empty sets', () => {
			assert.ok(
				setsEqual(
					intersectionBoolSeries(new Set([1, 2]), new Set([3, 4])),
					new Set()
				)
			)
			assert.ok(
				setsEqual(
					intersectionBoolSeries(new Set([2, 3]), new Set([1, 2, 3, 4, 5])),
					new Set([2, 3])
				)
			)
			assert.ok(
				setsEqual(
					intersectionBoolSeries(new Set([1, 2, 3, 4, 5]), new Set([2, 3])),
					new Set([2, 3])
				)
			)
			assert.ok(setsEqual(intersectionBoolSeries(new Set(), new Set()), new Set()))
			assert.ok(
				setsEqual(intersectionBoolSeries(new Set(), new Set([1, 2])), new Set())
			)
			assert.ok(
				setsEqual(intersectionBoolSeries(new Set([1, 2]), new Set()), new Set())
			)
		})

		it('handles special JS values (NaN, -0/+0, null, undefined, symbols, bigints, objects)', () => {
			const sharedObj = { id: 1 }
			const objA = { id: 2 }
			const objB = { id: 2 }
			const symShared = Symbol('shared')
			const symOnlyA = Symbol('onlyA')

			const a = new Set([
				NaN,
				-0,
				null,
				undefined,
				false,
				'',
				42n,
				sharedObj,
				objA,
				symShared,
				symOnlyA,
			])
			const b = new Set([
				NaN,
				+0,
				null,
				undefined,
				false,
				'',
				42n,
				sharedObj,
				objB,
				symShared,
			])

			const res = intersectionBoolSeries(a, b)
			assert.strictEqual(res.size, 9)
			assert.strictEqual(res.has(NaN), true)
			assert.strictEqual(res.has(0), true)
			assert.strictEqual(res.has(null), true)
			assert.strictEqual(res.has(undefined), true)
			assert.strictEqual(res.has(false), true)
			assert.strictEqual(res.has(''), true)
			assert.strictEqual(res.has(42n), true)
			assert.strictEqual(res.has(sharedObj), true)
			assert.strictEqual(res.has(symShared), true)
			assert.strictEqual(res.has(objA), false)
			assert.strictEqual(res.has(objB), false)
			assert.strictEqual(res.has(symOnlyA), false)
		})

		it('does not mutate inputs and returns a fresh Set instance', () => {
			const a = new Set([1, 2, 3])
			const b = new Set([2, 3, 4])
			const res = intersectionBoolSeries(a, b)

			assert.notStrictEqual(res, a)
			assert.notStrictEqual(res, b)
			res.add(99)
			assert.strictEqual(a.has(99), false)
			assert.strictEqual(b.has(99), false)
			assert.ok(setsEqual(a, new Set([1, 2, 3])))
			assert.ok(setsEqual(b, new Set([2, 3, 4])))

			// Self-intersection also returns a distinct Set instance
			const selfRes = intersectionBoolSeries(a, a)
			assert.notStrictEqual(selfRes, a)
			assert.ok(setsEqual(selfRes, a))
		})

		it('handles asymmetric large/small sets accurately', () => {
			const large = new Set()
			for (let i = 0; i < 10_000; i++) large.add(i)
			const small = new Set([-5, 0, 500, 9999, 10_000, 20_000])

			const res1 = intersectionBoolSeries(large, small)
			const res2 = intersectionBoolSeries(small, large)
			const expected = new Set([0, 500, 9999])

			assert.ok(setsEqual(res1, expected))
			assert.ok(setsEqual(res2, expected))
		})

		it('cross-checks against De Morgan, inclusion-exclusion, symmetric difference, and distributivity', () => {
			const triples = [
				[new Set([1, 2, 3]), new Set([2, 3, 4]), new Set([3, 4, 5])],
				[new Set(['a', 'b']), new Set(['b', 'c', 'd']), new Set(['a', 'd'])],
				[new Set(), new Set([1, 2]), new Set([2, 3])],
				[new Set([1, 2, 3, 4, 5]), new Set([1, 3, 5]), new Set([2, 3, 4])],
			]

			for (const [A, B, C] of triples) {
				const interAB = intersectionBoolSeries(A, B)

				// Independent filter computation
				const filterExpected = new Set([...A].filter((x) => B.has(x)))
				assert.ok(setsEqual(interAB, filterExpected))

				// Inclusion-exclusion cardinality: |A ∩ B| = |A| + |B| - |A ∪ B|
				const unionAB = setUnion(A, B)
				assert.strictEqual(interAB.size, A.size + B.size - unionAB.size)

				// De Morgan over universe U = A ∪ B: A ∩ B = U \ ((U \ A) ∪ (U \ B))
				const compA = setDifference(unionAB, A)
				const compB = setDifference(unionAB, B)
				const deMorgan = setDifference(unionAB, setUnion(compA, compB))
				assert.ok(setsEqual(interAB, deMorgan))

				// Symmetric difference identity: A ∩ B = (A ∪ B) \ (A △ B)
				const symDiff = setUnion(setDifference(A, B), setDifference(B, A))
				const viaSymDiff = setDifference(unionAB, symDiff)
				assert.ok(setsEqual(interAB, viaSymDiff))

				// Commutativity: A ∩ B = B ∩ A
				assert.ok(setsEqual(interAB, intersectionBoolSeries(B, A)))

				// Associativity: (A ∩ B) ∩ C = A ∩ (B ∩ C)
				assert.ok(
					setsEqual(
						intersectionBoolSeries(interAB, C),
						intersectionBoolSeries(A, intersectionBoolSeries(B, C))
					)
				)

				// Distributivity over union: A ∩ (B ∪ C) = (A ∩ B) ∪ (A ∩ C)
				assert.ok(
					setsEqual(
						intersectionBoolSeries(A, setUnion(B, C)),
						setUnion(interAB, intersectionBoolSeries(A, C))
					)
				)
			}
		})
	})

	describe('input validation', () => {
		it('throws TypeError on mismatched valid types', () => {
			assert.throws(() => intersectionBoolSeries(true, new Set()), TypeError)
			assert.throws(() => intersectionBoolSeries(new Set(), false), TypeError)
			assert.throws(
				() => intersectionBoolSeries(false, new Set([false])),
				TypeError
			)
		})

		it('throws TypeError on non-boolean primitives and boxed Booleans', () => {
			const invalidPairs = [
				[1, 1],
				[0, 0],
				['true', 'true'],
				[null, null],
				[undefined, undefined],
				[NaN, NaN],
				[1n, 1n],
				[Symbol('a'), Symbol('b')],
				[new Boolean(true), new Boolean(true)],
				[true, new Boolean(true)],
				[new Boolean(false), false],
			]

			for (const [a, b] of invalidPairs) {
				assert.throws(() => intersectionBoolSeries(a, b), TypeError)
			}
		})

		it('throws TypeError on non-Set objects and missing arguments', () => {
			const invalidPairs = [
				[
					[1, 2],
					[2, 3],
				],
				[new Map([[1, true]]), new Map([[1, true]])],
				[new WeakSet(), new WeakSet()],
				[{ has: () => true, size: 1 }, { has: () => true, size: 1 }],
				[new Set([1]), [1]],
				[[1], new Set([1])],
			]

			for (const [a, b] of invalidPairs) {
				assert.throws(() => intersectionBoolSeries(a, b), TypeError)
			}

			assert.throws(() => intersectionBoolSeries(), TypeError)
			assert.throws(() => intersectionBoolSeries(true), TypeError)
			assert.throws(() => intersectionBoolSeries(new Set([1])), TypeError)
		})
	})
})
