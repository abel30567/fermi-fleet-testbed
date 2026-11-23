import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { andFuzzyRecursive } from './andFuzzyRecursive.js'

/**
 * Independent iterative Zadeh AND reference for scalars.
 * @param {number[]} values
 * @returns {number}
 */
function referenceScalarAnd(values) {
	let acc = 1
	for (const v of values) {
		if (v < acc) acc = v
	}
	return acc
}

/**
 * Independent Zadeh De Morgan reference: min(a, b) = 1 - max(1 - a, 1 - b).
 * @param {number[]} values
 * @returns {number}
 */
function referenceDeMorganAnd(values) {
	let maxNeg = 0
	for (const v of values) {
		const neg = 1 - v
		if (neg > maxNeg) maxNeg = neg
	}
	return 1 - maxNeg
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible cross-check tests.
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

describe('andFuzzyRecursive — scalar fuzzy truth values', () => {
	test('computes Zadeh AND (min) for two and multiple values', () => {
		assert.equal(andFuzzyRecursive(0.8, 0.3), 0.3)
		assert.equal(andFuzzyRecursive(0.25, 0.75), 0.25)
		assert.equal(andFuzzyRecursive(0.9, 0.6, 0.4, 0.7, 0.5), 0.4)
		assert.equal(andFuzzyRecursive(0.42), 0.42)
	})

	test('reduces to classical Boolean AND on crisp {0, 1} boundary values', () => {
		assert.equal(andFuzzyRecursive(0, 0), 0)
		assert.equal(andFuzzyRecursive(0, 1), 0)
		assert.equal(andFuzzyRecursive(1, 0), 0)
		assert.equal(andFuzzyRecursive(1, 1), 1)
		assert.equal(andFuzzyRecursive(1, 1, 1, 1), 1)
		assert.equal(andFuzzyRecursive(1, 1, 0, 1), 0)
	})

	test('normalizes -0 to +0 and handles subnormal positive floats', () => {
		assert.ok(Object.is(andFuzzyRecursive(-0), 0))
		assert.ok(Object.is(andFuzzyRecursive(-0, 0.5), 0))
		assert.ok(Object.is(andFuzzyRecursive(0.5, -0), 0))
		assert.equal(andFuzzyRecursive(Number.MIN_VALUE, 1), Number.MIN_VALUE)
	})

	test('satisfies Zadeh t-norm algebraic laws (commutativity, associativity, idempotence, identity, annihilator, distributivity)', () => {
		const a = 0.73
		const b = 0.29
		const c = 0.61

		// Commutativity
		assert.equal(andFuzzyRecursive(a, b), andFuzzyRecursive(b, a))
		// Associativity
		assert.equal(
			andFuzzyRecursive(andFuzzyRecursive(a, b), c),
			andFuzzyRecursive(a, andFuzzyRecursive(b, c)),
		)
		assert.equal(andFuzzyRecursive(a, b, c), andFuzzyRecursive(andFuzzyRecursive(a, b), c))
		// Idempotence (characteristic of Zadeh/Gödel t-norm)
		assert.equal(andFuzzyRecursive(a, a), a)
		assert.equal(andFuzzyRecursive(b, b, b), b)
		// Identity element 1 & absorbing element 0
		assert.equal(andFuzzyRecursive(a, 1), a)
		assert.equal(andFuzzyRecursive(a, 0), 0)
		// Distributivity over Zadeh OR (max)
		assert.equal(
			andFuzzyRecursive(a, Math.max(b, c)),
			Math.max(andFuzzyRecursive(a, b), andFuzzyRecursive(a, c)),
		)
	})
})

describe('andFuzzyRecursive — array of truth values & membership vectors', () => {
	test('reduces a single array of fuzzy truth values via divide-and-conquer', () => {
		assert.equal(andFuzzyRecursive([0.9]), 0.9)
		assert.equal(andFuzzyRecursive([0.9, 0.4, 0.7, 0.2, 0.85]), 0.2)
		assert.equal(andFuzzyRecursive([1, 1, 1]), 1)
		assert.equal(andFuzzyRecursive([0.5, -0, 0.9]), 0)
		assert.ok(Object.is(andFuzzyRecursive([0.5, -0, 0.9]), 0))
	})

	test('handles large arrays without stack overflow (O(log n) divide-and-conquer depth)', () => {
		const n = 50_000
		const arr = new Array(n)
		for (let i = 0; i < n; i++) {
			arr[i] = (i % 1000) / 1000 + 0.0005
		}
		arr[37_123] = 0.0001
		assert.equal(andFuzzyRecursive(arr), 0.0001)
	})

	test('computes pointwise Zadeh intersection across multiple membership vectors without mutating inputs', () => {
		const v1 = [0.2, 0.8, 0.5, 1.0]
		const v2 = [0.6, 0.3, 0.5, 0.0]
		const v3 = [0.9, 0.7, 0.1, 0.4]

		const result = andFuzzyRecursive(v1, v2, v3)
		assert.deepEqual(result, [0.2, 0.3, 0.1, 0])
		assert.deepEqual(v1, [0.2, 0.8, 0.5, 1.0])
		assert.deepEqual(v2, [0.6, 0.3, 0.5, 0.0])
		assert.deepEqual(v3, [0.9, 0.7, 0.1, 0.4])
	})

	test('handles empty membership vectors when intersecting multiple vectors', () => {
		assert.deepEqual(andFuzzyRecursive([], []), [])
		assert.deepEqual(andFuzzyRecursive([], [], []), [])
	})
})

describe('andFuzzyRecursive — plain-object fuzzy sets', () => {
	test('computes Zadeh intersection for plain-object fuzzy sets with shared and disjoint keys', () => {
		const setA = { cold: 0.8, warm: 0.4, hot: 0.1 }
		const setB = { warm: 0.7, hot: 0.3, humid: 0.9 }

		const intersection = andFuzzyRecursive(setA, setB)
		assert.deepEqual(intersection, {
			cold: 0,
			warm: 0.4,
			hot: 0.1,
			humid: 0,
		})
		// Inputs are not mutated
		assert.deepEqual(setA, { cold: 0.8, warm: 0.4, hot: 0.1 })
		assert.deepEqual(setB, { warm: 0.7, hot: 0.3, humid: 0.9 })
	})

	test('handles single plain-object set, empty sets, multiple sets, and null-prototype objects', () => {
		const single = { a: 0.6, b: -0 }
		const singleCopy = andFuzzyRecursive(single)
		assert.deepEqual(singleCopy, { a: 0.6, b: 0 })
		assert.notEqual(singleCopy, single)
		assert.ok(Object.is(singleCopy.b, 0))

		assert.deepEqual(andFuzzyRecursive({}, {}), {})
		assert.deepEqual(
			andFuzzyRecursive({ x: 0.9, y: 0.5 }, { x: 0.7, y: 0.8 }, { x: 0.3, y: 0.6 }),
			{ x: 0.3, y: 0.5 },
		)

		const nullProtoA = Object.assign(Object.create(null), { a: 0.7, b: 0.2 })
		const nullProtoB = Object.assign(Object.create(null), { a: 0.4, b: 0.9 })
		assert.deepEqual(andFuzzyRecursive(nullProtoA, nullProtoB), { a: 0.4, b: 0.2 })
	})
})

describe('andFuzzyRecursive — Map fuzzy sets', () => {
	test('computes Zadeh intersection for Map fuzzy sets including non-string keys', () => {
		const keyObj = { id: 1 }
		const mapA = new Map([
			['a', 0.8],
			['b', 0.2],
			[keyObj, 0.9],
		])
		const mapB = new Map([
			['b', 0.6],
			['c', 0.5],
			[keyObj, 0.4],
		])

		const result = andFuzzyRecursive(mapA, mapB)
		assert.ok(result instanceof Map)
		assert.equal(result.size, 4)
		assert.equal(result.get('a'), 0)
		assert.equal(result.get('b'), 0.2)
		assert.equal(result.get('c'), 0)
		assert.equal(result.get(keyObj), 0.4)
		// Inputs untouched
		assert.equal(mapA.size, 3)
		assert.equal(mapB.size, 3)
	})

	test('handles single Map and empty Maps', () => {
		const empty = andFuzzyRecursive(new Map(), new Map())
		assert.ok(empty instanceof Map)
		assert.equal(empty.size, 0)

		const single = new Map([[1, 0.5], [2, -0]])
		const out = andFuzzyRecursive(single)
		assert.notEqual(out, single)
		assert.equal(out.get(1), 0.5)
		assert.ok(Object.is(out.get(2), 0))
	})
})

describe('andFuzzyRecursive — independent cross-checks', () => {
	test('cross-checks scalar & array results against iterative min and Zadeh De Morgan law', () => {
		const rng = makeRng(20261123)
		for (let trial = 0; trial < 50; trial++) {
			const len = 1 + Math.floor(rng() * 25)
			const values = Array.from({ length: len }, () => rng())

			const viaVariadic = andFuzzyRecursive(...values)
			const viaArray = andFuzzyRecursive(values)
			const refMin = referenceScalarAnd(values)
			const refDeMorgan = referenceDeMorganAnd(values)

			assert.equal(viaVariadic, refMin)
			assert.equal(viaArray, refMin)
			assert.ok(
				Math.abs(viaVariadic - refDeMorgan) <= 1e-12,
				`De Morgan mismatch: ${viaVariadic} vs ${refDeMorgan}`,
			)
		}
	})

	test('cross-checks fuzzy set intersection against De Morgan law over union universe', () => {
		const rng = makeRng(424242)
		const universe = ['u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7']

		for (let trial = 0; trial < 20; trial++) {
			const sets = Array.from({ length: 4 }, () => {
				const s = {}
				for (const key of universe) {
					if (rng() > 0.25) {
						s[key] = rng()
					}
				}
				return s
			})

			const actual = andFuzzyRecursive(...sets)
			const expectedKeys = new Set(sets.flatMap((s) => Object.keys(s)))
			assert.equal(Object.keys(actual).length, expectedKeys.size)

			for (const key of expectedKeys) {
				const memberships = sets.map((s) => (Object.hasOwn(s, key) ? s[key] : 0))
				const refMin = referenceScalarAnd(memberships)
				const refDeMorgan = referenceDeMorganAnd(memberships)
				assert.equal(actual[key], refMin)
				assert.ok(Math.abs(actual[key] - refDeMorgan) <= 1e-12)
			}
		}
	})
})

describe('andFuzzyRecursive — invalid inputs', () => {
	test('throws TypeError for zero arguments or unsupported types', () => {
		assert.throws(() => andFuzzyRecursive(), TypeError)
		assert.throws(() => andFuzzyRecursive(null), TypeError)
		assert.throws(() => andFuzzyRecursive(undefined), TypeError)
		assert.throws(() => andFuzzyRecursive('0.5'), TypeError)
		assert.throws(() => andFuzzyRecursive(true), TypeError)
		assert.throws(() => andFuzzyRecursive(new Set([0.5])), TypeError)
		assert.throws(() => andFuzzyRecursive(new Date()), TypeError)
	})

	test('throws RangeError for membership degrees outside [0, 1], NaN, or Infinity', () => {
		assert.throws(() => andFuzzyRecursive(-0.001, 0.5), RangeError)
		assert.throws(() => andFuzzyRecursive(0.5, 1.001), RangeError)
		assert.throws(() => andFuzzyRecursive(NaN, 0.5), RangeError)
		assert.throws(() => andFuzzyRecursive(0, NaN), RangeError)
		assert.throws(() => andFuzzyRecursive(0, Infinity), RangeError)
		assert.throws(() => andFuzzyRecursive(0, -Infinity), RangeError)
		assert.throws(() => andFuzzyRecursive([0, 1.5]), RangeError)
		assert.throws(() => andFuzzyRecursive({ a: 0, b: -0.1 }), RangeError)
		assert.throws(() => andFuzzyRecursive(new Map([['a', 0], ['b', 2]])), RangeError)
	})

	test('throws on mixed input forms, empty single array, sparse arrays, and mismatched vector lengths', () => {
		// Mixed types (even when first element is 0 — no short-circuit bypass)
		assert.throws(() => andFuzzyRecursive(0, '0.5'), TypeError)
		assert.throws(() => andFuzzyRecursive(0.5, [0.5]), TypeError)
		assert.throws(() => andFuzzyRecursive([0.5], { a: 0.5 }), TypeError)
		assert.throws(() => andFuzzyRecursive({ a: 0.5 }, new Map([['a', 0.5]])), TypeError)
		assert.throws(() => andFuzzyRecursive(new Map([['a', 0.5]]), { a: 0.5 }), TypeError)

		// Empty single array
		assert.throws(() => andFuzzyRecursive([]), RangeError)

		// Sparse arrays
		// eslint-disable-next-line no-sparse-arrays
		assert.throws(() => andFuzzyRecursive([0.5, , 0.2]), TypeError)
		// eslint-disable-next-line no-sparse-arrays
		assert.throws(() => andFuzzyRecursive([0.5, 0.2], [0.4, ,]), TypeError)

		// Mismatched vector lengths
		assert.throws(() => andFuzzyRecursive([0.2, 0.8], [0.5]), RangeError)

		// Non-numeric member inside collections
		assert.throws(() => andFuzzyRecursive([0, '0.2']), TypeError)
		assert.throws(() => andFuzzyRecursive({ a: 0, b: null }), TypeError)
		assert.throws(() => andFuzzyRecursive(new Map([['a', 0], ['b', undefined]])), TypeError)
	})
})
