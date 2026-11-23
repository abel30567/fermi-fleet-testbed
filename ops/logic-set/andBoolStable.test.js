import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { andBoolStable } from './andBoolStable.js'

/**
 * Independent helper: deterministic PRNG (Mulberry32) for reproducible property tests.
 */
function mulberry32(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

describe('andBoolStable', () => {
	describe('boolean mode: normal cases', () => {
		test('binary truth table', () => {
			assert.equal(andBoolStable(true, true), true)
			assert.equal(andBoolStable(true, false), false)
			assert.equal(andBoolStable(false, true), false)
			assert.equal(andBoolStable(false, false), false)
		})

		test('n-ary boolean conjunction', () => {
			assert.equal(andBoolStable(true, true, true, true), true)
			assert.equal(andBoolStable(true, true, false, true), false)
			assert.equal(andBoolStable(false, true, true, true), false)
			assert.equal(andBoolStable(false, false, false), false)
		})
	})

	describe('set mode: normal cases', () => {
		test('binary intersection of overlapping sets', () => {
			const a = new Set([1, 2, 3, 4])
			const b = new Set([3, 4, 5, 6])
			const res = andBoolStable(a, b)
			assert.ok(res instanceof Set)
			assert.deepEqual(res, new Set([3, 4]))
		})

		test('binary intersection of disjoint sets', () => {
			const res = andBoolStable(new Set(['a', 'b']), new Set(['c', 'd']))
			assert.deepEqual(res, new Set())
		})

		test('n-ary intersection across multiple sets', () => {
			const s1 = new Set([1, 2, 3, 4, 5])
			const s2 = new Set([2, 3, 4, 6])
			const s3 = new Set([3, 4, 7, 8])
			const s4 = new Set([0, 3, 9])
			assert.deepEqual(andBoolStable(s1, s2, s3, s4), new Set([3]))
		})

		test('does not mutate input sets and always returns a fresh Set', () => {
			const a = new Set([1, 2, 3])
			const b = new Set([1, 2, 3])
			const res = andBoolStable(a, b)
			assert.notEqual(res, a)
			assert.notEqual(res, b)
			assert.deepEqual(a, new Set([1, 2, 3]))
			assert.deepEqual(b, new Set([1, 2, 3]))
			res.add(99)
			assert.equal(a.has(99), false)
			assert.equal(b.has(99), false)
		})
	})

	describe('edge cases', () => {
		test('empty sets in any position yield a fresh empty Set', () => {
			const empty = new Set()
			const nonEmpty = new Set([1, 2, 3])

			const r1 = andBoolStable(empty, nonEmpty)
			const r2 = andBoolStable(nonEmpty, empty)
			const r3 = andBoolStable(empty, empty)
			const r4 = andBoolStable(nonEmpty, new Set([2]), empty)

			for (const r of [r1, r2, r3, r4]) {
				assert.equal(r.size, 0)
				assert.notEqual(r, empty)
			}
		})

		test('aliased Set references return a defensive copy', () => {
			const s = new Set([10, 20, 30])
			const r = andBoolStable(s, s, s)
			assert.notEqual(r, s)
			assert.deepEqual(r, new Set([10, 20, 30]))
			r.delete(10)
			assert.equal(s.has(10), true)
		})

		test('SameValueZero semantics: NaN, +0/-0, Infinity, undefined, null, symbols, objects', () => {
			const objShared = { id: 1 }
			const objA = { id: 2 }
			const objB = { id: 2 }
			const symShared = Symbol('shared')
			const symOnlyA = Symbol('onlyA')

			const a = new Set([NaN, -0, Infinity, -Infinity, undefined, null, 42n, objShared, objA, symShared, symOnlyA])
			const b = new Set([NaN, +0, Infinity, undefined, null, 42n, objShared, objB, symShared])

			const res = andBoolStable(a, b)
			assert.equal(res.size, 8)
			assert.equal(res.has(NaN), true)
			assert.equal(res.has(0), true)
			assert.equal(res.has(Infinity), true)
			assert.equal(res.has(-Infinity), false)
			assert.equal(res.has(undefined), true)
			assert.equal(res.has(null), true)
			assert.equal(res.has(42n), true)
			assert.equal(res.has(objShared), true)
			assert.equal(res.has(objA), false)
			assert.equal(res.has(objB), false)
			assert.equal(res.has(symShared), true)
			assert.equal(res.has(symOnlyA), false)

			// Verify -0 is canonicalized to +0
			for (const v of res) {
				if (v === 0) {
					assert.equal(Object.is(v, +0), true)
				}
			}
		})

		test('cardinality pivoting handles highly asymmetric set sizes efficiently', () => {
			const huge = new Set()
			for (let i = 0; i < 50_000; i++) {
				huge.add(i)
			}
			const tiny = new Set([123, 49_999, -5])

			const r1 = andBoolStable(huge, tiny)
			const r2 = andBoolStable(tiny, huge)
			assert.deepEqual(r1, new Set([123, 49_999]))
			assert.deepEqual(r2, new Set([123, 49_999]))
		})
	})

	describe('input validation', () => {
		test('rejects fewer than two arguments', () => {
			assert.throws(() => andBoolStable(), TypeError)
			assert.throws(() => andBoolStable(true), TypeError)
			assert.throws(() => andBoolStable(false), TypeError)
			assert.throws(() => andBoolStable(new Set([1])), TypeError)
		})

		test('rejects non-boolean and non-Set operands including boxed booleans and collections', () => {
			const invalidValues = [
				null,
				undefined,
				0,
				1,
				NaN,
				'',
				'true',
				[],
				[true],
				{},
				new Map(),
				new WeakSet(),
				new Boolean(true),
				new Boolean(false),
				() => true,
				Symbol('x'),
				1n,
			]

			for (const bad of invalidValues) {
				assert.throws(() => andBoolStable(bad, true), TypeError)
				assert.throws(() => andBoolStable(true, bad), TypeError)
				assert.throws(() => andBoolStable(bad, new Set()), TypeError)
				assert.throws(() => andBoolStable(new Set([1]), bad), TypeError)
			}
		})

		test('validates trailing operands even when earlier operands would short-circuit', () => {
			assert.throws(() => andBoolStable(false, 'not-a-bool'), TypeError)
			assert.throws(() => andBoolStable(false, true, 0), TypeError)
			assert.throws(() => andBoolStable(new Set(), 'not-a-set'), TypeError)
			assert.throws(() => andBoolStable(new Set(), new Set([1]), null), TypeError)
		})

		test('rejects mixed boolean and Set operands', () => {
			assert.throws(() => andBoolStable(true, new Set([true])), TypeError)
			assert.throws(() => andBoolStable(new Set([true]), true), TypeError)
			assert.throws(() => andBoolStable(true, true, new Set()), TypeError)
			assert.throws(() => andBoolStable(new Set(), new Set(), false), TypeError)
		})
	})

	describe('independent cross-checks', () => {
		test('De Morgan law for booleans across all 2-ary and 3-ary inputs', () => {
			const bools = [false, true]
			for (const a of bools) {
				for (const b of bools) {
					// a AND b === NOT (NOT a OR NOT b)
					assert.equal(andBoolStable(a, b), !(!a || !b))
					// Commutativity
					assert.equal(andBoolStable(a, b), andBoolStable(b, a))
					for (const c of bools) {
						// Ternary De Morgan
						assert.equal(andBoolStable(a, b, c), !(!a || !b || !c))
						// Associativity
						assert.equal(
							andBoolStable(andBoolStable(a, b), c),
							andBoolStable(a, andBoolStable(b, c))
						)
						assert.equal(
							andBoolStable(a, b, c),
							andBoolStable(andBoolStable(a, b), c)
						)
					}
				}
			}
		})

		test('De Morgan law, Inclusion-Exclusion, and indicator-function equivalence for Sets', () => {
			const rand = mulberry32(20261123)
			const universe = Array.from({ length: 60 }, (_, i) => i)
			const complement = (s) => new Set(universe.filter((x) => !s.has(x)))
			const union = (...sets) => {
				const out = new Set()
				for (const s of sets) {
					for (const x of s) out.add(x)
				}
				return out
			}
			const randomSubset = (p) => new Set(universe.filter(() => rand() < p))

			for (let trial = 0; trial < 30; trial++) {
				const A = randomSubset(0.3 + rand() * 0.5)
				const B = randomSubset(0.3 + rand() * 0.5)
				const C = randomSubset(0.3 + rand() * 0.5)

				const AB = andBoolStable(A, B)
				const AC = andBoolStable(A, C)
				const BC = andBoolStable(B, C)
				const ABC = andBoolStable(A, B, C)

				// 1. Cardinality bounds
				assert.ok(AB.size >= 0 && AB.size <= Math.min(A.size, B.size))
				assert.ok(ABC.size >= 0 && ABC.size <= Math.min(A.size, B.size, C.size))

				// 2. De Morgan's law over finite universe: A ∩ B = U \ ((U \ A) ∪ (U \ B))
				const deMorganAB = complement(union(complement(A), complement(B)))
				assert.deepEqual(AB, deMorganAB)

				// 3. Inclusion-Exclusion principle (2-set and 3-set)
				assert.equal(union(A, B).size, A.size + B.size - AB.size)
				assert.equal(
					union(A, B, C).size,
					A.size + B.size + C.size - AB.size - AC.size - BC.size + ABC.size
				)

				// 4. Associativity & commutativity
				assert.deepEqual(AB, andBoolStable(B, A))
				assert.deepEqual(ABC, andBoolStable(AB, C))
				assert.deepEqual(ABC, andBoolStable(A, BC))

				// 5. Characteristic / indicator function cross-check unifying boolean and set modes
				for (const x of universe) {
					assert.equal(AB.has(x), andBoolStable(A.has(x), B.has(x)))
					assert.equal(ABC.has(x), andBoolStable(A.has(x), B.has(x), C.has(x)))
				}
			}
		})
	})
})
