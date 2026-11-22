import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { unionFuzzyRecursive } from './unionFuzzyRecursive.js'

/**
 * Independent iterative Zadeh union for cross-checking.
 *
 * @param {...Record<string, number>} sets
 * @returns {Record<string, number>}
 */
function iterativeZadehUnion(...sets) {
	const result = {}
	for (const set of sets) {
		for (const [key, value] of Object.entries(set)) {
			const normalized = value === 0 ? 0 : value
			if (Object.hasOwn(result, key)) {
				if (normalized > result[key]) {
					result[key] = normalized
				}
			} else {
				result[key] = normalized
			}
		}
	}
	return result
}

/**
 * Independent De Morgan union over two fuzzy sets:
 *   A ∪ B = ¬(¬A ∩ ¬B)  =>  1 - min(1 - mu_A(x), 1 - mu_B(x))
 *
 * @param {Record<string, number>} a
 * @param {Record<string, number>} b
 * @returns {Record<string, number>}
 */
function deMorganUnion(a, b) {
	const keys = new Set([...Object.keys(a), ...Object.keys(b)])
	const result = {}
	for (const key of keys) {
		const compA = 1 - (Object.hasOwn(a, key) ? a[key] : 0)
		const compB = 1 - (Object.hasOwn(b, key) ? b[key] : 0)
		const intersectionOfComplements = Math.min(compA, compB)
		result[key] = 1 - intersectionOfComplements
	}
	return result
}

describe('unionFuzzyRecursive', () => {
	test('computes Zadeh union for overlapping keys', () => {
		const a = { x: 0.2, y: 0.8, z: 0.5 }
		const b = { x: 0.7, y: 0.3, z: 0.5 }
		assert.deepStrictEqual(unionFuzzyRecursive(a, b), {
			x: 0.7,
			y: 0.8,
			z: 0.5,
		})
	})

	test('computes Zadeh union for disjoint keys', () => {
		const a = { a: 0.25, b: 0.75 }
		const b = { c: 0.4, d: 0.9 }
		assert.deepStrictEqual(unionFuzzyRecursive(a, b), {
			a: 0.25,
			b: 0.75,
			c: 0.4,
			d: 0.9,
		})
	})

	test('computes Zadeh union for partially overlapping keys', () => {
		const a = { cold: 0.9, warm: 0.3 }
		const b = { warm: 0.7, hot: 0.85 }
		assert.deepStrictEqual(unionFuzzyRecursive(a, b), {
			cold: 0.9,
			warm: 0.7,
			hot: 0.85,
		})
	})

	test('handles empty sets and zero/single arguments', () => {
		assert.deepStrictEqual(unionFuzzyRecursive(), {})
		assert.deepStrictEqual(unionFuzzyRecursive({}), {})
		assert.deepStrictEqual(unionFuzzyRecursive({}, {}), {})

		const a = { x: 0.4, y: 0 }
		assert.deepStrictEqual(unionFuzzyRecursive(a), { x: 0.4, y: 0 })
		assert.deepStrictEqual(unionFuzzyRecursive(a, {}), { x: 0.4, y: 0 })
		assert.deepStrictEqual(unionFuzzyRecursive({}, a), { x: 0.4, y: 0 })
	})

	test('handles crisp sets (membership degrees in {0, 1})', () => {
		const crispA = { a: 1, b: 0, c: 1, d: 0 }
		const crispB = { a: 0, b: 1, c: 1, d: 0, e: 1 }
		assert.deepStrictEqual(unionFuzzyRecursive(crispA, crispB), {
			a: 1,
			b: 1,
			c: 1,
			d: 0,
			e: 1,
		})
	})

	test('handles boundary membership values 0, -0, and 1', () => {
		const a = { zero: -0, one: 1, mix: 0 }
		const b = { zero: -0, one: 0.5, mix: 1 }
		const result = unionFuzzyRecursive(a, b)
		assert.deepStrictEqual(result, { zero: 0, one: 1, mix: 1 })
		assert.equal(Object.is(result.zero, -0), false)
	})

	test('supports variadic union of three or more fuzzy sets', () => {
		const s1 = { a: 0.1, b: 0.6 }
		const s2 = { b: 0.4, c: 0.9 }
		const s3 = { a: 0.8, c: 0.2, d: 0.3 }
		const s4 = { d: 0.7, e: 1.0 }
		const s5 = { a: 0.5, e: 0.0 }

		assert.deepStrictEqual(unionFuzzyRecursive(s1, s2, s3, s4, s5), {
			a: 0.8,
			b: 0.6,
			c: 0.9,
			d: 0.7,
			e: 1.0,
		})
	})

	test('accepts null-prototype plain objects and does not mutate inputs', () => {
		const a = Object.create(null)
		a.x = 0.3
		a.y = 0.6
		const b = { y: 0.9, z: 0.2 }

		const result = unionFuzzyRecursive(a, b)
		assert.deepStrictEqual(result, { x: 0.3, y: 0.9, z: 0.2 })

		result.x = 1
		assert.equal(a.x, 0.3)
		assert.equal(b.y, 0.9)
	})

	test('satisfies algebraic laws: commutativity, associativity, idempotence, dominance', () => {
		const a = { x: 0.1, y: 0.7, z: 0.4 }
		const b = { x: 0.6, y: 0.2, w: 0.9 }
		const c = { y: 0.8, z: 0.5, u: 0.3 }

		// Commutativity
		assert.deepStrictEqual(
			unionFuzzyRecursive(a, b),
			unionFuzzyRecursive(b, a),
		)

		// Associativity
		assert.deepStrictEqual(
			unionFuzzyRecursive(unionFuzzyRecursive(a, b), c),
			unionFuzzyRecursive(a, unionFuzzyRecursive(b, c)),
		)
		assert.deepStrictEqual(
			unionFuzzyRecursive(unionFuzzyRecursive(a, b), c),
			unionFuzzyRecursive(a, b, c),
		)

		// Idempotence
		assert.deepStrictEqual(unionFuzzyRecursive(a, a), a)

		// Dominance with universal crisp set over the same support
		const universal = { x: 1, y: 1, z: 1 }
		assert.deepStrictEqual(unionFuzzyRecursive(a, universal), universal)
	})

	test('cross-checks against independent iterative Zadeh union and De Morgan law', () => {
		// Deterministic pseudo-random generator (LCG) for repeatable large-set testing
		let seed = 42
		const nextUnit = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0
			return seed / 0xffffffff
		}

		const setA = {}
		const setB = {}
		const setC = {}
		for (let i = 0; i < 150; i++) {
			const key = `k${i}`
			if (i % 3 !== 0) setA[key] = nextUnit()
			if (i % 4 !== 0) setB[key] = nextUnit()
			if (i % 5 !== 0) setC[key] = nextUnit()
		}

		// Exact cross-check against iterative Zadeh max for 2 and 3 sets
		const actualAB = unionFuzzyRecursive(setA, setB)
		const expectedAB = iterativeZadehUnion(setA, setB)
		assert.deepStrictEqual(actualAB, expectedAB)

		const actualABC = unionFuzzyRecursive(setA, setB, setC)
		const expectedABC = iterativeZadehUnion(setA, setB, setC)
		assert.deepStrictEqual(actualABC, expectedABC)

		// Cross-check against De Morgan's law: A ∪ B = ¬(¬A ∩ ¬B)
		const deMorganAB = deMorganUnion(setA, setB)
		assert.deepStrictEqual(
			Object.keys(actualAB).sort(),
			Object.keys(deMorganAB).sort(),
		)
		for (const key of Object.keys(actualAB)) {
			assert.ok(
				Math.abs(actualAB[key] - deMorganAB[key]) < 1e-12,
				`De Morgan mismatch for ${key}: ${actualAB[key]} vs ${deMorganAB[key]}`,
			)
		}
	})

	test('throws TypeError for non-plain-object fuzzy set inputs', () => {
		const invalidSets = [
			null,
			undefined,
			42,
			'fuzzy',
			true,
			[0.1, 0.5],
			new Map([['a', 0.5]]),
			new Set([0.5]),
			new Date(),
			/abc/,
			() => ({}),
		]

		for (const invalid of invalidSets) {
			assert.throws(() => unionFuzzyRecursive(invalid), TypeError)
			assert.throws(
				() => unionFuzzyRecursive({ a: 0.5 }, invalid),
				TypeError,
			)
		}
	})

	test('throws TypeError for non-number membership values', () => {
		const badValues = ['0.5', null, undefined, true, false, {}, [], Symbol('x')]

		for (const bad of badValues) {
			assert.throws(() => unionFuzzyRecursive({ a: bad }), TypeError)
			assert.throws(
				() => unionFuzzyRecursive({ x: 0.2 }, { y: bad }),
				TypeError,
			)
		}
	})

	test('throws RangeError for non-finite or out-of-range membership values', () => {
		const outOfRange = [
			NaN,
			Infinity,
			-Infinity,
			-0.0001,
			-1,
			1.0001,
			2,
			Number.MAX_VALUE,
		]

		for (const bad of outOfRange) {
			assert.throws(() => unionFuzzyRecursive({ a: bad }), RangeError)
			assert.throws(
				() => unionFuzzyRecursive({ x: 0.5 }, { y: bad }),
				RangeError,
			)
		}
	})
})
