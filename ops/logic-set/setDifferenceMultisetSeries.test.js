import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { setDifferenceMultisetSeries } from './setDifferenceMultisetSeries.js'

/**
 * Independent reference implementation that expands multisets into element
 * lists, removes one matching element at a time for each occurrence in B,
 * and tallies the remaining elements back into a canonical Map.
 *
 * @template T
 * @param {Map<T, number>} a
 * @param {Map<T, number>} b
 * @returns {Map<T, number>}
 */
function referenceMultisetDifferenceByExpansion(a, b) {
	const bag = []
	for (const [value, count] of a.entries()) {
		for (let i = 0; i < count; i++) {
			bag.push(value)
		}
	}
	for (const [value, count] of b.entries()) {
		for (let i = 0; i < count; i++) {
			const idx = bag.findIndex((item) => Object.is(item, value) || (item === 0 && value === 0))
			if (idx !== -1) {
				bag.splice(idx, 1)
			}
		}
	}
	const out = new Map()
	for (const item of bag) {
		out.set(item, (out.get(item) ?? 0) + 1)
	}
	return out
}

/**
 * Helper: multiset intersection (min multiplicity).
 */
function multisetIntersection(a, b) {
	const out = new Map()
	for (const [k, ca] of a.entries()) {
		const cb = b.get(k) ?? 0
		const m = Math.min(ca, cb)
		if (m > 0) out.set(k, m)
	}
	return out
}

/**
 * Helper: multiset union (max multiplicity).
 */
function multisetUnion(a, b) {
	const out = new Map()
	const keys = new Set([...a.keys(), ...b.keys()])
	for (const k of keys) {
		const m = Math.max(a.get(k) ?? 0, b.get(k) ?? 0)
		if (m > 0) out.set(k, m)
	}
	return out
}

/**
 * Helper: multiset sum (additive multiplicity).
 */
function multisetSum(a, b) {
	const out = new Map()
	const keys = new Set([...a.keys(), ...b.keys()])
	for (const k of keys) {
		const m = (a.get(k) ?? 0) + (b.get(k) ?? 0)
		if (m > 0) out.set(k, m)
	}
	return out
}

/**
 * Helper: total cardinality of a multiset.
 */
function multisetCardinality(m) {
	let total = 0
	for (const count of m.values()) {
		total += count
	}
	return total
}

describe('setDifferenceMultisetSeries', () => {
	test('computes standard multiset difference with partial, exact, and excess removals', () => {
		const a = new Map([
			['apple', 5],
			['banana', 2],
			['cherry', 3],
			['date', 4]
		])
		const b = new Map([
			['apple', 2],
			['banana', 2],
			['cherry', 7],
			['elderberry', 3]
		])

		const result = setDifferenceMultisetSeries(a, b)
		assert.deepEqual(
			result,
			new Map([
				['apple', 3],
				['date', 4]
			])
		)
	})

	test('does not mutate either input map', () => {
		const a = new Map([
			['x', 4],
			['y', 1]
		])
		const b = new Map([
			['x', 1],
			['z', 2]
		])
		const aSnapshot = new Map(a)
		const bSnapshot = new Map(b)

		const result = setDifferenceMultisetSeries(a, b)
		assert.notEqual(result, a)
		assert.notEqual(result, b)
		assert.deepEqual(a, aSnapshot)
		assert.deepEqual(b, bSnapshot)
	})

	test('handles empty multisets and disjoint multisets', () => {
		const empty = new Map()
		const a = new Map([
			[1, 3],
			[2, 1]
		])
		const b = new Map([
			[3, 5],
			[4, 2]
		])

		assert.deepEqual(setDifferenceMultisetSeries(empty, empty), new Map())
		assert.deepEqual(setDifferenceMultisetSeries(empty, a), new Map())
		assert.deepEqual(setDifferenceMultisetSeries(a, empty), new Map([[1, 3], [2, 1]]))
		assert.deepEqual(setDifferenceMultisetSeries(a, b), new Map([[1, 3], [2, 1]]))
		assert.deepEqual(setDifferenceMultisetSeries(a, a), new Map())
	})

	test('normalizes zero-count entries in inputs and handles -0 counts', () => {
		const a = new Map([
			['a', 0],
			['b', 3],
			['c', -0]
		])
		const b = new Map([
			['a', 0],
			['b', 0],
			['d', 0]
		])

		const result = setDifferenceMultisetSeries(a, b)
		assert.deepEqual(result, new Map([['b', 3]]))
		assert.equal(result.has('a'), false)
		assert.equal(result.has('c'), false)
	})

	test('supports arbitrary Map key types including objects, symbols, NaN, null, undefined, and -0/+0', () => {
		const obj1 = { id: 1 }
		const obj2 = { id: 2 }
		const sym = Symbol('k')

		const a = new Map([
			[obj1, 4],
			[obj2, 2],
			[sym, 3],
			[NaN, 5],
			[null, 2],
			[undefined, 1],
			[-0, 3]
		])
		const b = new Map([
			[obj1, 1],
			[obj2, 5],
			[sym, 3],
			[NaN, 2],
			[null, 1],
			[+0, 1]
		])

		const result = setDifferenceMultisetSeries(a, b)
		assert.equal(result.get(obj1), 3)
		assert.equal(result.has(obj2), false)
		assert.equal(result.has(sym), false)
		assert.equal(result.get(NaN), 3)
		assert.equal(result.get(null), 1)
		assert.equal(result.get(undefined), 1)
		assert.equal(result.get(0), 2)
		assert.equal(result.size, 5)
	})

	test('preserves exact precision at Number.MAX_SAFE_INTEGER boundary without overflow', () => {
		const max = Number.MAX_SAFE_INTEGER
		const a = new Map([
			['max_minus_zero', max],
			['max_minus_one', max],
			['max_minus_max', max],
			['max_minus_half', max],
			['small_minus_max', 5]
		])
		const b = new Map([
			['max_minus_zero', 0],
			['max_minus_one', 1],
			['max_minus_max', max],
			['max_minus_half', Math.floor(max / 2)],
			['small_minus_max', max]
		])

		const result = setDifferenceMultisetSeries(a, b)
		assert.equal(result.get('max_minus_zero'), max)
		assert.equal(result.get('max_minus_one'), max - 1)
		assert.equal(result.has('max_minus_max'), false)
		assert.equal(result.get('max_minus_half'), max - Math.floor(max / 2))
		assert.equal(result.has('small_minus_max'), false)
	})

	test('validates input types and rejects non-Map arguments', () => {
		const valid = new Map([['a', 1]])
		const invalidMaps = [null, undefined, {}, [], new Set(['a']), 'map', 42, true]

		for (const bad of invalidMaps) {
			assert.throws(() => setDifferenceMultisetSeries(bad, valid), TypeError)
			assert.throws(() => setDifferenceMultisetSeries(valid, bad), TypeError)
		}
		assert.throws(() => setDifferenceMultisetSeries(), TypeError)
	})

	test('validates counts in both A and B (including keys of B absent from A)', () => {
		const valid = new Map([['a', 2]])

		// Non-number counts -> TypeError
		const nonNumbers = ['2', null, undefined, 2n, true, {}, []]
		for (const badCount of nonNumbers) {
			assert.throws(
				() => setDifferenceMultisetSeries(new Map([['a', badCount]]), valid),
				TypeError
			)
			assert.throws(
				() => setDifferenceMultisetSeries(valid, new Map([['only_in_b', badCount]])),
				TypeError
			)
		}

		// Invalid numeric counts -> RangeError
		const invalidNumbers = [
			-1,
			-100,
			1.5,
			0.1,
			NaN,
			Infinity,
			-Infinity,
			Number.MAX_SAFE_INTEGER + 1,
			Number.MIN_SAFE_INTEGER
		]
		for (const badCount of invalidNumbers) {
			assert.throws(
				() => setDifferenceMultisetSeries(new Map([['a', badCount]]), valid),
				RangeError
			)
			assert.throws(
				() => setDifferenceMultisetSeries(valid, new Map([['only_in_b', badCount]])),
				RangeError
			)
		}
	})

	test('independent cross-check: matches list-expansion multiset difference across deterministic fuzz cases', () => {
		// Deterministic LCG PRNG for reproducible tests
		let seed = 1337
		const nextInt = (maxExclusive) => {
			seed = (seed * 1664525 + 1013904223) >>> 0
			return seed % maxExclusive
		}

		const universe = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7']

		for (let trial = 0; trial < 100; trial++) {
			const a = new Map()
			const b = new Map()
			for (const key of universe) {
				if (nextInt(3) !== 0) a.set(key, nextInt(8))
				if (nextInt(3) !== 0) b.set(key, nextInt(8))
			}

			const actual = setDifferenceMultisetSeries(a, b)
			const expected = referenceMultisetDifferenceByExpansion(a, b)
			assert.deepEqual(actual, expected, `mismatch on trial ${trial}`)
		}
	})

	test('independent cross-check: satisfies counting-logic algebraic identities', () => {
		const a = new Map([
			['a', 6],
			['b', 2],
			['c', 4],
			['d', 0]
		])
		const b = new Map([
			['a', 2],
			['b', 5],
			['e', 3]
		])
		const c = new Map([
			['a', 3],
			['c', 1],
			['f', 2]
		])

		const aMinusB = setDifferenceMultisetSeries(a, b)
		const bMinusA = setDifferenceMultisetSeries(b, a)
		const aCapB = multisetIntersection(a, b)
		const aCupB = multisetUnion(a, b)

		// Identity 1: (A \ B) ⊎ (A ∩ B) = normalize(A)
		const normalizedA = setDifferenceMultisetSeries(a, new Map())
		assert.deepEqual(multisetSum(aMinusB, aCapB), normalizedA)

		// Identity 2: |A \ B| = |A| - |A ∩ B|
		assert.equal(
			multisetCardinality(aMinusB),
			multisetCardinality(a) - multisetCardinality(aCapB)
		)

		// Identity 3: Symmetric difference (A \ B) ⊎ (B \ A) = (A ∪ B) \ (A ∩ B)
		assert.deepEqual(
			multisetSum(aMinusB, bMinusA),
			setDifferenceMultisetSeries(aCupB, aCapB)
		)

		// Identity 4: Repeated subtraction (A \ B) \ C = A \ (B ⊎ C)
		assert.deepEqual(
			setDifferenceMultisetSeries(aMinusB, c),
			setDifferenceMultisetSeries(a, multisetSum(b, c))
		)
	})
})
