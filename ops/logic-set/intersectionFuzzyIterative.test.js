import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { intersectionFuzzyIterative } from './intersectionFuzzyIterative.js'

describe('intersectionFuzzyIterative', () => {
	describe('normal cases', () => {
		it('computes Zadeh min intersection for two overlapping fuzzy sets', () => {
			const a = { x: 0.8, y: 0.3, z: 1.0 }
			const b = { x: 0.5, y: 0.7, w: 0.9 }
			assert.deepStrictEqual(intersectionFuzzyIterative(a, b), {
				x: 0.5,
				y: 0.3,
			})
		})

		it('computes Zadeh intersection across three or more fuzzy sets', () => {
			const a = { a: 0.9, b: 0.6, c: 0.4, d: 0.8 }
			const b = { a: 0.4, b: 0.8, c: 0.5 }
			const c = { a: 0.7, b: 0.2, c: 0.4 }
			assert.deepStrictEqual(intersectionFuzzyIterative(a, b, c), {
				a: 0.4,
				b: 0.2,
				c: 0.4,
			})
		})

		it('matches classical set intersection for crisp sets (memberships in {0, 1})', () => {
			const a = { red: 1, green: 1, blue: 0 }
			const b = { green: 1, blue: 1, yellow: 1 }
			assert.deepStrictEqual(intersectionFuzzyIterative(a, b), { green: 1 })
		})

		it('preserves equal membership values accurately', () => {
			const a = { k1: 0.25, k2: 0.75, k3: 1 }
			const b = { k1: 0.25, k2: 0.75, k3: 1 }
			assert.deepStrictEqual(intersectionFuzzyIterative(a, b), {
				k1: 0.25,
				k2: 0.75,
				k3: 1,
			})
		})
	})

	describe('edge cases', () => {
		it('returns empty object when either or both sets are empty', () => {
			assert.deepStrictEqual(intersectionFuzzyIterative({}, {}), {})
			assert.deepStrictEqual(intersectionFuzzyIterative({}, { a: 0.5 }), {})
			assert.deepStrictEqual(intersectionFuzzyIterative({ a: 0.5 }, {}), {})
		})

		it('returns empty object for completely disjoint fuzzy sets', () => {
			const a = { a: 0.5, b: 0.9 }
			const b = { c: 0.4, d: 1.0 }
			assert.deepStrictEqual(intersectionFuzzyIterative(a, b), {})
		})

		it('omits zero and negative-zero memberships from the support', () => {
			const a = { a: 0, b: -0, c: 0.6, d: 0.8 }
			const b = { a: 0.9, b: 0.5, c: 0, d: 0.4 }
			const result = intersectionFuzzyIterative(a, b)
			assert.deepStrictEqual(result, { d: 0.4 })
			assert.equal(Object.hasOwn(result, 'a'), false)
			assert.equal(Object.hasOwn(result, 'b'), false)
			assert.equal(Object.hasOwn(result, 'c'), false)
		})

		it('handles boundary floats near 0 and 1 without precision loss', () => {
			const a = { tiny: Number.MIN_VALUE, nearOne: 0.9999999999999999, exactOne: 1 }
			const b = { tiny: 1e-300, nearOne: 1, exactOne: 1 }
			assert.deepStrictEqual(intersectionFuzzyIterative(a, b), {
				tiny: Number.MIN_VALUE,
				nearOne: 0.9999999999999999,
				exactOne: 1,
			})
		})

		it('accepts null-prototype objects and safely handles Object.prototype key names', () => {
			const a = Object.create(null)
			a.toString = 0.6
			a.constructor = 0.9
			a.__proto__ = 0.7

			const b = Object.create(null)
			b.toString = 0.8
			b.constructor = 0.3
			b.__proto__ = 0.4

			const result = intersectionFuzzyIterative(a, b)
			assert.equal(Object.getPrototypeOf(result), Object.prototype)
			assert.equal(result.toString, 0.6)
			assert.equal(result.constructor, 0.3)
			assert.equal(Object.getOwnPropertyDescriptor(result, '__proto__')?.value, 0.4)
		})

		it('does not mutate input fuzzy sets', () => {
			const a = { x: 0.8, y: 0.2 }
			const b = { x: 0.3, z: 0.9 }
			const aSnap = { ...a }
			const bSnap = { ...b }
			const result = intersectionFuzzyIterative(a, b)
			result.x = 0.99
			assert.deepStrictEqual(a, aSnap)
			assert.deepStrictEqual(b, bSnap)
		})

		it('handles large fuzzy sets iteratively without stack issues', () => {
			const size = 10000
			const a = {}
			const b = {}
			for (let i = 0; i < size; i++) {
				a[`e${i}`] = (i % 100) / 100
				b[`e${i}`] = ((size - i) % 100) / 100
			}
			const result = intersectionFuzzyIterative(a, b)
			assert.equal(result.e1, 0.01)
			assert.equal(result.e50, 0.5)
			assert.equal(Object.hasOwn(result, 'e0'), false)
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when fewer than two sets are provided', () => {
			assert.throws(() => intersectionFuzzyIterative(), TypeError)
			assert.throws(() => intersectionFuzzyIterative({ a: 0.5 }), TypeError)
		})

		it('throws TypeError for non-plain-object arguments', () => {
			const invalidSets = [
				null,
				undefined,
				42,
				'abc',
				true,
				[0.5, 0.8],
				new Map([['a', 0.5]]),
				new Set(['a']),
				new Date(),
				/abc/,
			]
			for (const bad of invalidSets) {
				assert.throws(() => intersectionFuzzyIterative(bad, { a: 0.5 }), TypeError)
				assert.throws(() => intersectionFuzzyIterative({ a: 0.5 }, bad), TypeError)
			}
		})

		it('throws TypeError for non-number membership values', () => {
			const badValues = ['0.5', null, undefined, true, false, {}, [], Symbol('x')]
			for (const val of badValues) {
				assert.throws(
					() => intersectionFuzzyIterative({ a: val }, { a: 0.5 }),
					TypeError
				)
				assert.throws(
					() => intersectionFuzzyIterative({ a: 0.5 }, { a: val }),
					TypeError
				)
			}
		})

		it('throws RangeError for membership values outside [0, 1] or non-finite', () => {
			const outOfRange = [-0.0001, -1, 1.0001, 2, NaN, Infinity, -Infinity]
			for (const val of outOfRange) {
				assert.throws(
					() => intersectionFuzzyIterative({ a: val }, { a: 0.5 }),
					RangeError
				)
				assert.throws(
					() => intersectionFuzzyIterative({ a: 0.5 }, { a: val }),
					RangeError
				)
			}
		})

		it('validates all sets even when the first set is empty', () => {
			assert.throws(() => intersectionFuzzyIterative({}, { a: 1.5 }), RangeError)
			assert.throws(() => intersectionFuzzyIterative({}, { a: '0.5' }), TypeError)
			assert.throws(() => intersectionFuzzyIterative({}, null), TypeError)
		})
	})

	describe('independent cross-checks', () => {
		// Deterministic PRNG (Mulberry32) for reproducible property tests
		function mulberry32(seed) {
			let s = seed >>> 0
			return () => {
				s = (s + 0x6d2b79f5) >>> 0
				let t = Math.imul(s ^ (s >>> 15), 1 | s)
				t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
				return ((t ^ (t >>> 14)) >>> 0) / 4294967296
			}
		}

		function randomFuzzySet(rng, universe) {
			const set = {}
			for (const key of universe) {
				const roll = rng()
				if (roll < 0.25) continue // omitted key (implicit 0)
				if (roll < 0.35) {
					set[key] = 0
				} else if (roll < 0.45) {
					set[key] = 1
				} else {
					set[key] = Math.round(rng() * 1000) / 1000
				}
			}
			return set
		}

		it('matches an independent universe-scan Math.min oracle over 100 random trials', () => {
			const rng = mulberry32(20261123)
			const universe = Array.from({ length: 15 }, (_, i) => `u${i}`)

			for (let trial = 0; trial < 100; trial++) {
				const count = 2 + Math.floor(rng() * 4) // 2 to 5 sets
				const sets = Array.from({ length: count }, () =>
					randomFuzzySet(rng, universe)
				)

				// Independent oracle: scan entire universe via Math.min
				const expected = {}
				for (const key of universe) {
					const degree = Math.min(
						...sets.map((s) => (Object.hasOwn(s, key) ? s[key] : 0))
					)
					if (degree > 0) {
						expected[key] = degree
					}
				}

				const actual = intersectionFuzzyIterative(...sets)
				assert.deepStrictEqual(actual, expected)
			}
		})

		it('satisfies Zadeh De Morgan duality: A ∩ B = complement(complement(A) ∪ complement(B))', () => {
			const rng = mulberry32(987654321)
			const universe = ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8']

			const mu = (set, key) => (Object.hasOwn(set, key) ? set[key] : 0)

			for (let trial = 0; trial < 50; trial++) {
				const a = randomFuzzySet(rng, universe)
				const b = randomFuzzySet(rng, universe)
				const inter = intersectionFuzzyIterative(a, b)

				for (const key of universe) {
					const compA = 1 - mu(a, key)
					const compB = 1 - mu(b, key)
					const unionComp = Math.max(compA, compB)
					const deMorgan = 1 - unionComp
					const actual = mu(inter, key)
					assert.ok(
						Math.abs(actual - deMorgan) <= 1e-12,
						`De Morgan mismatch at ${key}: actual=${actual}, expected=${deMorgan}`
					)
				}
			}
		})

		it('satisfies commutativity, associativity, idempotence, and identity laws', () => {
			const rng = mulberry32(424242)
			const universe = ['p', 'q', 'r', 's', 't', 'u']
			const universalSet = Object.fromEntries(universe.map((k) => [k, 1]))

			for (let trial = 0; trial < 30; trial++) {
				const a = randomFuzzySet(rng, universe)
				const b = randomFuzzySet(rng, universe)
				const c = randomFuzzySet(rng, universe)

				// Commutativity: A ∩ B = B ∩ A
				assert.deepStrictEqual(
					intersectionFuzzyIterative(a, b),
					intersectionFuzzyIterative(b, a)
				)

				// Associativity: (A ∩ B) ∩ C = A ∩ (B ∩ C) = A ∩ B ∩ C
				const left = intersectionFuzzyIterative(
					intersectionFuzzyIterative(a, b),
					c
				)
				const right = intersectionFuzzyIterative(
					a,
					intersectionFuzzyIterative(b, c)
				)
				const nary = intersectionFuzzyIterative(a, b, c)
				assert.deepStrictEqual(left, right)
				assert.deepStrictEqual(left, nary)

				// Identity with universal set U (membership 1 everywhere) & Idempotence
				const normalizedA = intersectionFuzzyIterative(a, universalSet)
				assert.deepStrictEqual(intersectionFuzzyIterative(a, a), normalizedA)
			}
		})
	})
})
