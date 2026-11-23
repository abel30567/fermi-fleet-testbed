import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { orBoolRecursive } from './orBoolRecursive.js'

describe('orBoolRecursive — plain booleans', () => {
	test('handles 2-operand truth table', () => {
		assert.equal(orBoolRecursive(false, false), false)
		assert.equal(orBoolRecursive(false, true), true)
		assert.equal(orBoolRecursive(true, false), true)
		assert.equal(orBoolRecursive(true, true), true)
	})

	test('handles single boolean operand', () => {
		assert.equal(orBoolRecursive(false), false)
		assert.equal(orBoolRecursive(true), true)
	})

	test('handles variadic boolean operands of odd and even lengths', () => {
		assert.equal(orBoolRecursive(false, false, false), false)
		assert.equal(orBoolRecursive(false, false, true), true)
		assert.equal(orBoolRecursive(true, false, false, false), true)
		assert.equal(orBoolRecursive(false, false, true, false, false), true)
		assert.equal(orBoolRecursive(false, false, false, false, false, false), false)
	})

	test('handles array of booleans including empty array identity', () => {
		assert.equal(orBoolRecursive([]), false)
		assert.equal(orBoolRecursive([false]), false)
		assert.equal(orBoolRecursive([true]), true)
		assert.equal(orBoolRecursive([false, false, false, true]), true)
		assert.equal(orBoolRecursive([false, false, false, false]), false)
	})

	test('handles large boolean arrays without stack overflow', () => {
		const size = 50_000
		const allFalse = new Array(size).fill(false)
		assert.equal(orBoolRecursive(allFalse), false)

		const lastTrue = allFalse.slice()
		lastTrue[size - 1] = true
		assert.equal(orBoolRecursive(lastTrue), true)

		const midTrue = allFalse.slice()
		midTrue[Math.floor(size / 2)] = true
		assert.equal(orBoolRecursive(midTrue), true)
	})
})

describe('orBoolRecursive — JS Set objects', () => {
	test('computes union of two disjoint, overlapping, and identical sets', () => {
		assert.deepEqual(
			orBoolRecursive(new Set([1, 2]), new Set([3, 4])),
			new Set([1, 2, 3, 4])
		)
		assert.deepEqual(
			orBoolRecursive(new Set([1, 2]), new Set([2, 3])),
			new Set([1, 2, 3])
		)
		assert.deepEqual(
			orBoolRecursive(new Set(['a', 'b']), new Set(['a', 'b'])),
			new Set(['a', 'b'])
		)
	})

	test('handles empty sets and single set without mutating inputs', () => {
		assert.deepEqual(orBoolRecursive(new Set(), new Set()), new Set())
		assert.deepEqual(orBoolRecursive(new Set(), new Set([42])), new Set([42]))
		assert.deepEqual(orBoolRecursive(new Set([42]), new Set()), new Set([42]))

		const original = new Set([1, 2, 3])
		const copy = orBoolRecursive(original)
		assert.deepEqual(copy, original)
		assert.notEqual(copy, original)
		copy.add(99)
		assert.equal(original.has(99), false)
	})

	test('computes union over variadic and array of many sets without mutating inputs', () => {
		const s1 = new Set([1, 2])
		const s2 = new Set([2, 3])
		const s3 = new Set([4])
		const s4 = new Set([1, 5])
		const s5 = new Set()

		const resultVariadic = orBoolRecursive(s1, s2, s3, s4, s5)
		const resultArray = orBoolRecursive([s1, s2, s3, s4, s5])

		assert.deepEqual(resultVariadic, new Set([1, 2, 3, 4, 5]))
		assert.deepEqual(resultArray, new Set([1, 2, 3, 4, 5]))
		assert.deepEqual([...resultVariadic], [1, 2, 3, 4, 5])
		assert.deepEqual(s1, new Set([1, 2]))
		assert.deepEqual(s2, new Set([2, 3]))
		assert.deepEqual(s3, new Set([4]))
		assert.deepEqual(s4, new Set([1, 5]))
		assert.deepEqual(s5, new Set())
	})

	test('handles special JS values inside sets (NaN, null, undefined, objects, symbols, booleans)', () => {
		const obj = { k: 1 }
		const sym = Symbol('s')
		const a = new Set([NaN, null, obj, false])
		const b = new Set([NaN, undefined, sym, true, -0])

		const union = orBoolRecursive(a, b)
		assert.equal(union.size, 8)
		assert.equal(union.has(NaN), true)
		assert.equal(union.has(null), true)
		assert.equal(union.has(undefined), true)
		assert.equal(union.has(obj), true)
		assert.equal(union.has(sym), true)
		assert.equal(union.has(false), true)
		assert.equal(union.has(true), true)
		assert.equal(union.has(0), true)
	})

	test('handles large collections of sets via divide-and-conquer', () => {
		const sets = Array.from({ length: 1_000 }, (_, i) => new Set([i, i + 1]))
		const union = orBoolRecursive(sets)
		assert.equal(union.size, 1_001)
		assert.equal(union.has(0), true)
		assert.equal(union.has(1_000), true)
	})
})

describe('orBoolRecursive — input validation', () => {
	test('throws TypeError when called with no arguments', () => {
		assert.throws(() => orBoolRecursive(), TypeError)
	})

	test('throws TypeError for non-boolean / non-Set primitives and objects', () => {
		const invalidValues = [
			0,
			1,
			'',
			'true',
			null,
			undefined,
			Symbol('x'),
			1n,
			{},
			new Map(),
			new Boolean(true),
			new Boolean(false)
		]
		for (const val of invalidValues) {
			assert.throws(() => orBoolRecursive(val), TypeError)
			assert.throws(() => orBoolRecursive([val]), TypeError)
		}
	})

	test('throws TypeError when mixing booleans and Sets', () => {
		assert.throws(() => orBoolRecursive(true, new Set([1])), TypeError)
		assert.throws(() => orBoolRecursive(new Set([1]), false), TypeError)
		assert.throws(() => orBoolRecursive([false, new Set()]), TypeError)
	})

	test('validates all operands eagerly even when an earlier boolean is true', () => {
		assert.throws(() => orBoolRecursive(true, 1), TypeError)
		assert.throws(() => orBoolRecursive(true, false, 'invalid'), TypeError)
		assert.throws(() => orBoolRecursive([true, false, null]), TypeError)
		assert.throws(() => orBoolRecursive(new Set([1]), [2]), TypeError)
	})

	test('rejects sparse arrays, nested arrays, and multiple array arguments', () => {
		const sparseLeading = []
		sparseLeading[1] = true
		assert.throws(() => orBoolRecursive(sparseLeading), TypeError)

		const sparseTrailing = [true]
		sparseTrailing.length = 2
		assert.throws(() => orBoolRecursive(sparseTrailing), TypeError)

		assert.throws(() => orBoolRecursive([[true]]), TypeError)
		assert.throws(() => orBoolRecursive([true], [false]), TypeError)
	})
})

describe('orBoolRecursive — independent cross-checks', () => {
	test('matches iterative reference across exhaustive boolean truth tables (n = 1..6)', () => {
		const refOrBool = (arr) => arr.some((x) => x === true)

		for (let n = 1; n <= 6; n++) {
			const total = 1 << n
			for (let mask = 0; mask < total; mask++) {
				const inputs = Array.from({ length: n }, (_, bit) => Boolean((mask >> bit) & 1))
				const expected = refOrBool(inputs)
				assert.equal(orBoolRecursive(inputs), expected)
				assert.equal(orBoolRecursive(...inputs), expected)
			}
		}
	})

	test('matches flatMap Set union reference and satisfies algebraic laws across deterministic trials', () => {
		// Deterministic LCG PRNG for reproducible testing
		let seed = 0x5eed1234
		const nextInt = (max) => {
			seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
			return seed % max
		}

		const refUnion = (sets) => new Set(sets.flatMap((s) => [...s]))

		for (let trial = 0; trial < 50; trial++) {
			const numSets = 1 + nextInt(12)
			const sets = Array.from({ length: numSets }, () => {
				const len = nextInt(10)
				const s = new Set()
				for (let j = 0; j < len; j++) {
					s.add(nextInt(20))
				}
				return s
			})

			const actual = orBoolRecursive(sets)
			const expected = refUnion(sets)
			assert.deepEqual(actual, expected)

			// Idempotence: U ∪ U = U
			assert.deepEqual(orBoolRecursive(actual, actual), actual)
			// Identity: U ∪ ∅ = U
			assert.deepEqual(orBoolRecursive(actual, new Set()), actual)
			// Commutativity on reversed order (same element membership)
			const reversed = orBoolRecursive([...sets].reverse())
			assert.equal(reversed.size, actual.size)
			for (const el of actual) {
				assert.equal(reversed.has(el), true)
			}
		}
	})
})
