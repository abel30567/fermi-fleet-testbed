import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { notMultisetIterative } from './notMultisetIterative.js'

/**
 * Independent reference implementation via explicit flat-list bag expansion
 * and element-by-element removal.
 *
 * @template T
 * @param {Map<T, number>} multiset
 * @param {Map<T, number>} universe
 * @returns {Map<T, number>}
 */
function referenceBagComplement(multiset, universe) {
	const bag = []
	for (const [key, count] of universe) {
		for (let i = 0; i < count; i++) {
			bag.push(key)
		}
	}

	for (const [key, count] of multiset) {
		for (let i = 0; i < count; i++) {
			const idx = bag.findIndex((item) => Object.is(item, key) || (item === 0 && key === 0))
			if (idx !== -1) {
				bag.splice(idx, 1)
			}
		}
	}

	const recount = new Map()
	for (const item of bag) {
		recount.set(item, (recount.get(item) ?? 0) + 1)
	}
	return recount
}

/**
 * Helper for multiset union (max multiplicity) to verify De Morgan's laws.
 */
function multisetUnion(a, b) {
	const out = new Map()
	for (const [k, v] of a) {
		if (v > 0) out.set(k, v)
	}
	for (const [k, v] of b) {
		const prev = out.get(k) ?? 0
		const next = Math.max(prev, v)
		if (next > 0) out.set(k, next)
	}
	return out
}

/**
 * Helper for multiset intersection (min multiplicity) to verify De Morgan's laws.
 */
function multisetIntersection(a, b) {
	const out = new Map()
	for (const [k, v] of a) {
		const bv = b.get(k) ?? 0
		const next = Math.min(v, bv)
		if (next > 0) out.set(k, next)
	}
	return out
}

describe('notMultisetIterative', () => {
	test('computes relative complement for standard multisets', () => {
		const universe = new Map([
			['a', 5],
			['b', 3],
			['c', 2],
		])
		const multiset = new Map([
			['a', 2],
			['b', 3],
		])

		const actual = notMultisetIterative(multiset, universe)
		assert.deepStrictEqual(
			actual,
			new Map([
				['a', 3],
				['c', 2],
			])
		)
	})

	test('returns canonical universe when multiset is empty', () => {
		const universe = new Map([
			['x', 4],
			['y', 0],
			['z', 1],
		])
		const actual = notMultisetIterative(new Map(), universe)
		assert.deepStrictEqual(
			actual,
			new Map([
				['x', 4],
				['z', 1],
			])
		)
	})

	test('returns empty Map when multiset equals or exceeds universe', () => {
		const universe = new Map([
			['a', 2],
			['b', 1],
		])
		const equal = new Map([
			['a', 2],
			['b', 1],
		])
		const exceeding = new Map([
			['a', 10],
			['b', 5],
			['extra', 7],
		])

		assert.deepStrictEqual(notMultisetIterative(equal, universe), new Map())
		assert.deepStrictEqual(notMultisetIterative(exceeding, universe), new Map())
	})

	test('handles both empty Maps and empty universe', () => {
		assert.deepStrictEqual(notMultisetIterative(new Map(), new Map()), new Map())
		assert.deepStrictEqual(
			notMultisetIterative(new Map([['a', 3]]), new Map()),
			new Map()
		)
	})

	test('clamps counts at zero and ignores keys absent from universe', () => {
		const universe = new Map([
			['a', 2],
			['b', 4],
		])
		const multiset = new Map([
			['a', 5],
			['b', 1],
			['ghost', 9],
		])

		assert.deepStrictEqual(
			notMultisetIterative(multiset, universe),
			new Map([['b', 3]])
		)
	})

	test('does not mutate input Maps and always returns a fresh Map', () => {
		const universe = new Map([
			['a', 3],
			['b', 2],
		])
		const multiset = new Map([['a', 1]])

		const result = notMultisetIterative(multiset, universe)
		assert.notStrictEqual(result, universe)
		assert.notStrictEqual(result, multiset)
		assert.deepStrictEqual(
			universe,
			new Map([
				['a', 3],
				['b', 2],
			])
		)
		assert.deepStrictEqual(multiset, new Map([['a', 1]]))
	})

	test('handles diverse JS Map key types including NaN, -0, null, undefined, Symbol, and objects', () => {
		const sym = Symbol('item')
		const objA = { id: 1 }
		const objB = { id: 1 } // distinct reference
		const nullProto = Object.create(null)

		const universe = new Map([
			[NaN, 3],
			[0, 4],
			[null, 2],
			[undefined, 5],
			[sym, 2],
			[objA, 3],
			[objB, 1],
			[nullProto, 2],
		])
		const multiset = new Map([
			[NaN, 1],
			[-0, 2],
			[null, 2],
			[undefined, 0],
			[sym, 1],
			[objA, 2],
			[nullProto, 1],
		])

		const actual = notMultisetIterative(multiset, universe)
		assert.deepStrictEqual(
			actual,
			new Map([
				[NaN, 2],
				[0, 2],
				[undefined, 5],
				[sym, 1],
				[objA, 1],
				[objB, 1],
				[nullProto, 1],
			])
		)
	})

	test('supports boundary safe integer counts', () => {
		const universe = new Map([
			['max', Number.MAX_SAFE_INTEGER],
			['zero', 0],
		])
		const multiset = new Map([
			['max', 1],
			['zero', -0],
		])

		assert.deepStrictEqual(
			notMultisetIterative(multiset, universe),
			new Map([['max', Number.MAX_SAFE_INTEGER - 1]])
		)
	})

	test('satisfies involution and De Morgan laws for sub-multisets of universe', () => {
		const universe = new Map([
			['a', 6],
			['b', 4],
			['c', 5],
			['d', 2],
		])
		const a = new Map([
			['a', 2],
			['b', 4],
			['c', 1],
		])
		const b = new Map([
			['a', 5],
			['c', 3],
			['d', 2],
		])

		// Involution: NOT(NOT(A)) === A
		assert.deepStrictEqual(
			notMultisetIterative(notMultisetIterative(a, universe), universe),
			a
		)

		// Partition: |A| + |NOT(A)| === |U|
		const notA = notMultisetIterative(a, universe)
		for (const [k, uCount] of universe) {
			assert.strictEqual((a.get(k) ?? 0) + (notA.get(k) ?? 0), uCount)
		}

		// De Morgan 1: NOT(A U B) === NOT(A) ∩ NOT(B)
		const notB = notMultisetIterative(b, universe)
		assert.deepStrictEqual(
			notMultisetIterative(multisetUnion(a, b), universe),
			multisetIntersection(notA, notB)
		)

		// De Morgan 2: NOT(A ∩ B) === NOT(A) U NOT(B)
		assert.deepStrictEqual(
			notMultisetIterative(multisetIntersection(a, b), universe),
			multisetUnion(notA, notB)
		)
	})

	test('cross-checks against independent flat-bag expansion implementation across deterministic cases', () => {
		// Deterministic linear congruential generator for reproducible fuzzing
		let seed = 0x5eed1234
		const nextInt = (max) => {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
			return seed % (max + 1)
		}

		const domain = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 42, NaN, null]

		for (let trial = 0; trial < 50; trial++) {
			const universe = new Map()
			const multiset = new Map()
			for (const key of domain) {
				if (nextInt(3) > 0) {
					universe.set(key, nextInt(6))
				}
				if (nextInt(3) > 0) {
					multiset.set(key, nextInt(7))
				}
			}

			const actual = notMultisetIterative(multiset, universe)
			const expected = referenceBagComplement(multiset, universe)
			assert.deepStrictEqual(actual, expected)
		}
	})

	test('validates that both arguments are Maps', () => {
		const valid = new Map([['a', 1]])
		const invalidContainers = [null, undefined, {}, [], new Set(['a']), 'map', 42]

		for (const bad of invalidContainers) {
			assert.throws(
				() => notMultisetIterative(bad, valid),
				{ name: 'TypeError', message: /multiset must be a Map/ }
			)
			assert.throws(
				() => notMultisetIterative(valid, bad),
				{ name: 'TypeError', message: /universe must be a Map/ }
			)
		}
	})

	test('validates count types and numeric ranges in both Maps', () => {
		const valid = new Map([['a', 1]])
		const nonNumbers = ['1', null, undefined, true, 1n, {}, []]
		const outOfRange = [-1, -100, 1.5, 0.1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]

		for (const bad of nonNumbers) {
			assert.throws(
				() => notMultisetIterative(new Map([['a', bad]]), valid),
				{ name: 'TypeError', message: /multiset count/ }
			)
			assert.throws(
				() => notMultisetIterative(valid, new Map([['a', bad]])),
				{ name: 'TypeError', message: /universe count/ }
			)
		}

		for (const bad of outOfRange) {
			assert.throws(
				() => notMultisetIterative(new Map([['a', bad]]), valid),
				{ name: 'RangeError', message: /multiset count/ }
			)
			assert.throws(
				() => notMultisetIterative(valid, new Map([['a', bad]])),
				{ name: 'RangeError', message: /universe count/ }
			)
		}

		// Validates keys in multiset even when absent from universe, including null-prototype keys
		const nullProto = Object.create(null)
		assert.throws(
			() => notMultisetIterative(new Map([[nullProto, -3]]), new Map()),
			{ name: 'RangeError', message: /\[unprintable key\]/ }
		)
	})
})
