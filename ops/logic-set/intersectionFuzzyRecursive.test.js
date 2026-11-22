import { describe, test } from 'node:test'
import assert from 'node:assert'
import { intersectionFuzzyRecursive } from './intersectionFuzzyRecursive.js'

/**
 * Independent iterative reference implementation of Zadeh fuzzy intersection.
 *
 * @param {...Record<string, number>} sets
 * @returns {Record<string, number>}
 */
function iterativeZadehIntersection(...sets) {
	const [first, ...rest] = sets
	const result = {}
	for (const key of Object.keys(first)) {
		let presentInAll = true
		let minVal = first[key]
		for (const set of rest) {
			if (!Object.hasOwn(set, key)) {
				presentInAll = false
				break
			}
			if (set[key] < minVal) {
				minVal = set[key]
			}
		}
		if (presentInAll) {
			result[key] = minVal === 0 ? 0 : minVal
		}
	}
	return result
}

/**
 * Independent De Morgan reference implementation of Zadeh fuzzy intersection:
 * μ_{⋂ Aᵢ}(x) = 1 - maxᵢ(1 - μ_{Aᵢ}(x)) over the union universe of keys.
 *
 * @param {...Record<string, number>} sets
 * @returns {Record<string, number>}
 */
function deMorganZadehIntersection(...sets) {
	const universe = new Set()
	for (const set of sets) {
		for (const key of Object.keys(set)) {
			universe.add(key)
		}
	}
	const result = {}
	for (const key of universe) {
		let maxComplement = 0
		for (const set of sets) {
			const degree = Object.hasOwn(set, key) ? set[key] : 0
			const complement = 1 - degree
			if (complement > maxComplement) {
				maxComplement = complement
			}
		}
		result[key] = 1 - maxComplement
	}
	return result
}

describe('intersectionFuzzyRecursive', () => {
	describe('normal cases', () => {
		test('computes Zadeh min intersection for two overlapping fuzzy sets', () => {
			const a = { x: 0.8, y: 0.2, z: 0.5 }
			const b = { x: 0.4, y: 0.9, z: 0.5 }
			assert.deepStrictEqual(intersectionFuzzyRecursive(a, b), {
				x: 0.4,
				y: 0.2,
				z: 0.5,
			})
		})

		test('computes intersection across three or more fuzzy sets via divide-and-conquer', () => {
			const a = { a: 0.9, b: 0.6, c: 0.4, d: 0.7 }
			const b = { a: 0.5, b: 0.8, c: 0.2 }
			const c = { a: 0.7, b: 0.3, c: 0.9, e: 1 }
			const d = { a: 0.6, b: 0.5, c: 0.1 }
			assert.deepStrictEqual(intersectionFuzzyRecursive(a, b, c, d), {
				a: 0.5,
				b: 0.3,
				c: 0.1,
			})
		})

		test('returns a validated shallow copy for a single fuzzy set', () => {
			const original = { a: 0.25, b: 0.75, c: -0 }
			const result = intersectionFuzzyRecursive(original)
			assert.notStrictEqual(result, original)
			assert.deepStrictEqual(result, { a: 0.25, b: 0.75, c: 0 })
			assert.strictEqual(Object.is(result.c, 0), true)
		})

		test('does not mutate input objects', () => {
			const a = { a: 0.8, b: 0.3 }
			const b = { a: 0.4, b: 0.9, c: 0.6 }
			const snapA = { ...a }
			const snapB = { ...b }
			intersectionFuzzyRecursive(a, b)
			assert.deepStrictEqual(a, snapA)
			assert.deepStrictEqual(b, snapB)
		})

		test('handles null-prototype objects and keys matching Object.prototype names', () => {
			const a = Object.create(null)
			a.toString = 0.7
			a.constructor = 0.4
			a.valueOf = 0.9

			const b = { toString: 0.3, constructor: 0.8 }
			assert.deepStrictEqual(intersectionFuzzyRecursive(a, b), {
				toString: 0.3,
				constructor: 0.4,
			})
		})

		test('handles large fuzzy sets without stack overflow', () => {
			const a = {}
			const b = {}
			const expected = {}
			for (let i = 0; i < 4000; i++) {
				const key = `k${i}`
				const va = (i % 101) / 100
				const vb = ((i * 7) % 101) / 100
				a[key] = va
				if (i % 2 === 0) {
					b[key] = vb
					expected[key] = Math.min(va, vb)
				}
			}
			assert.deepStrictEqual(intersectionFuzzyRecursive(a, b), expected)
		})
	})

	describe('edge cases', () => {
		test('empty sets', () => {
			assert.deepStrictEqual(intersectionFuzzyRecursive({}, {}), {})
			assert.deepStrictEqual(intersectionFuzzyRecursive({}, { a: 0.5, b: 1 }), {})
			assert.deepStrictEqual(intersectionFuzzyRecursive({ a: 0.5, b: 1 }, {}), {})
			assert.deepStrictEqual(
				intersectionFuzzyRecursive({ a: 0.5 }, {}, { a: 0.8 }),
				{},
			)
		})

		test('disjoint keys produce an empty set', () => {
			const a = { a: 0.9, b: 0.5 }
			const b = { c: 0.8, d: 0.2 }
			assert.deepStrictEqual(intersectionFuzzyRecursive(a, b), {})
		})

		test('partial key overlap drops non-shared keys', () => {
			const a = { onlyA: 1, shared: 0.6 }
			const b = { shared: 0.35, onlyB: 0.9 }
			assert.deepStrictEqual(intersectionFuzzyRecursive(a, b), { shared: 0.35 })
		})

		test('crisp sets (memberships strictly 0 or 1)', () => {
			// Sparse crisp representation
			assert.deepStrictEqual(
				intersectionFuzzyRecursive({ a: 1, b: 1 }, { b: 1, c: 1 }),
				{ b: 1 },
			)
			// Shared-universe crisp representation (matches boolean AND)
			const u1 = { a: 1, b: 1, c: 0, d: 0 }
			const u2 = { a: 0, b: 1, c: 1, d: 0 }
			assert.deepStrictEqual(intersectionFuzzyRecursive(u1, u2), {
				a: 0,
				b: 1,
				c: 0,
				d: 0,
			})
		})

		test('boundary values 0, -0, 1, and extreme subnormals', () => {
			const a = { z: -0, one: 1, tiny: Number.MIN_VALUE, nearOne: 1 - Number.EPSILON }
			const b = { z: 0.5, one: 1, tiny: 1, nearOne: 1 }
			const res = intersectionFuzzyRecursive(a, b)
			assert.deepStrictEqual(res, {
				z: 0,
				one: 1,
				tiny: Number.MIN_VALUE,
				nearOne: 1 - Number.EPSILON,
			})
			assert.strictEqual(Object.is(res.z, 0), true)
		})

		test('satisfies Zadeh algebraic properties (commutativity, associativity, idempotence)', () => {
			const a = { p: 0.2, q: 0.8, r: 0.5, s: 0 }
			const b = { p: 0.7, q: 0.3, r: 0.9, s: 0.4 }
			const c = { p: 0.6, q: 0.6, r: 0.1, s: 1 }

			// Commutativity
			assert.deepStrictEqual(
				intersectionFuzzyRecursive(a, b),
				intersectionFuzzyRecursive(b, a),
			)
			// Associativity
			const leftAssoc = intersectionFuzzyRecursive(
				intersectionFuzzyRecursive(a, b),
				c,
			)
			const rightAssoc = intersectionFuzzyRecursive(
				a,
				intersectionFuzzyRecursive(b, c),
			)
			const direct = intersectionFuzzyRecursive(a, b, c)
			assert.deepStrictEqual(leftAssoc, rightAssoc)
			assert.deepStrictEqual(leftAssoc, direct)
			// Idempotence
			assert.deepStrictEqual(intersectionFuzzyRecursive(a, a), a)
		})
	})

	describe('input validation', () => {
		test('throws RangeError when called with no arguments', () => {
			assert.throws(() => intersectionFuzzyRecursive(), RangeError)
		})

		test('throws TypeError for non-plain-object arguments', () => {
			const invalidInputs = [
				null,
				undefined,
				42,
				'fuzzy',
				true,
				[0.5],
				new Map([['a', 0.5]]),
				new Set(['a']),
				new Date(),
				() => ({}),
			]
			for (const bad of invalidInputs) {
				assert.throws(() => intersectionFuzzyRecursive(bad, { a: 0.5 }), TypeError)
				assert.throws(() => intersectionFuzzyRecursive({ a: 0.5 }, bad), TypeError)
			}
		})

		test('throws TypeError for non-number or non-finite membership values', () => {
			const badDegrees = [NaN, Infinity, -Infinity, '0.5', null, undefined, true, {}, []]
			for (const degree of badDegrees) {
				assert.throws(
					() => intersectionFuzzyRecursive({ a: degree }, { a: 0.5 }),
					TypeError,
				)
				assert.throws(
					() => intersectionFuzzyRecursive({ a: 0.5 }, { a: degree }),
					TypeError,
				)
			}
		})

		test('throws RangeError for membership values outside [0, 1]', () => {
			const outOfRange = [-1, -0.0001, -Number.MIN_VALUE, 1.0001, 2, 100]
			for (const degree of outOfRange) {
				assert.throws(
					() => intersectionFuzzyRecursive({ a: degree }, { a: 0.5 }),
					RangeError,
				)
				assert.throws(
					() => intersectionFuzzyRecursive({ a: 0.5 }, { a: degree }),
					RangeError,
				)
			}
		})

		test('validates all keys even when sets are disjoint or another set is empty', () => {
			assert.throws(
				() => intersectionFuzzyRecursive({}, { bad: 1.2 }),
				RangeError,
			)
			assert.throws(
				() => intersectionFuzzyRecursive({ a: 0.5 }, { disjoint: -0.1 }),
				RangeError,
			)
			assert.throws(
				() => intersectionFuzzyRecursive({ a: 0.5 }, { disjoint: NaN }),
				TypeError,
			)
		})
	})

	describe('independent cross-checks', () => {
		test('matches independent iterative Zadeh intersection on deterministic pseudo-random sets', () => {
			// Deterministic LCG PRNG
			let seed = 1337
			const nextRand = () => {
				seed = (seed * 1664525 + 1013904223) >>> 0
				return seed / 0x100000000
			}

			const keys = Array.from({ length: 30 }, (_, i) => `elem_${i}`)
			for (let trial = 0; trial < 20; trial++) {
				const numSets = 2 + (trial % 5)
				const sets = Array.from({ length: numSets }, () => {
					const obj = {}
					for (const k of keys) {
						if (nextRand() > 0.25) {
							obj[k] = Math.round(nextRand() * 1000) / 1000
						}
					}
					return obj
				})
				const actual = intersectionFuzzyRecursive(...sets)
				const expected = iterativeZadehIntersection(...sets)
				assert.deepStrictEqual(actual, expected)
			}
		})

		test('matches independent De Morgan dual: 1 - max(1 - μ_A, 1 - μ_B, ...)', () => {
			const a = { u1: 0.15, u2: 0.85, u3: 0, u4: 1, u5: 0.42 }
			const b = { u1: 0.75, u2: 0.35, u3: 0.6, u4: 1, u6: 0.9 }
			const c = { u1: 0.5, u2: 0.9, u3: 0.2, u4: 0.8, u5: 0.7 }

			const actual = intersectionFuzzyRecursive(a, b, c)
			const deMorgan = deMorganZadehIntersection(a, b, c)

			// Verify every element in the combined universe agrees with De Morgan's law
			for (const [key, expectedVal] of Object.entries(deMorgan)) {
				const actualVal = Object.hasOwn(actual, key) ? actual[key] : 0
				assert.ok(
					Math.abs(actualVal - expectedVal) <= 1e-12,
					`De Morgan mismatch for "${key}": got ${actualVal}, expected ${expectedVal}`,
				)
			}

			// Verify exact key-for-key agreement when all sets share the same universe
			const s1 = { x: 0.1, y: 0.9, z: 0.5, w: 0 }
			const s2 = { x: 0.8, y: 0.4, z: 0.5, w: 1 }
			const actualShared = intersectionFuzzyRecursive(s1, s2)
			const deMorganShared = deMorganZadehIntersection(s1, s2)
			assert.deepStrictEqual(Object.keys(actualShared).sort(), Object.keys(deMorganShared).sort())
			for (const key of Object.keys(deMorganShared)) {
				assert.ok(
					Math.abs(actualShared[key] - deMorganShared[key]) <= 1e-12,
					`Shared-universe De Morgan mismatch for "${key}"`,
				)
			}
		})
	})
})
