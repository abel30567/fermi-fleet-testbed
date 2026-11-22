import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { notBoolRecursive } from './notBoolRecursive.js'

/**
 * Independent reference implementation using direct negation and iterative complement.
 */
function referenceNot(input, secondArg) {
	if (typeof input === 'boolean') {
		const times = secondArg === undefined ? 1 : secondArg
		return times % 2 === 1 ? !input : input
	}
	if (Array.isArray(input)) {
		const times = secondArg === undefined ? 1 : secondArg
		const out = []
		for (let i = 0; i < input.length; i++) {
			out.push(times % 2 === 1 ? !input[i] : input[i])
		}
		return out
	}
	const out = new Set()
	for (const item of secondArg) {
		if (!input.has(item)) {
			out.add(item)
		}
	}
	return out
}

describe('notBoolRecursive - plain booleans', () => {
	test('negates true and false', () => {
		assert.equal(notBoolRecursive(true), false)
		assert.equal(notBoolRecursive(false), true)
	})

	test('satisfies involution: not(not(x)) === x', () => {
		for (const x of [true, false]) {
			assert.equal(notBoolRecursive(notBoolRecursive(x)), x)
			assert.equal(notBoolRecursive(x, 2), x)
			assert.equal(notBoolRecursive(x, 0), x)
		}
	})

	test('supports repeated recursive negation including large safe integers', () => {
		assert.equal(notBoolRecursive(true, 0), true)
		assert.equal(notBoolRecursive(true, 1), false)
		assert.equal(notBoolRecursive(true, 2), true)
		assert.equal(notBoolRecursive(true, 3), false)
		assert.equal(notBoolRecursive(false, 7), true)
		assert.equal(notBoolRecursive(false, 8), false)
		assert.equal(notBoolRecursive(true, 1_000_001), false)
		assert.equal(notBoolRecursive(true, 1_000_000), true)
		assert.equal(notBoolRecursive(true, Number.MAX_SAFE_INTEGER), false)
		assert.equal(notBoolRecursive(false, Number.MAX_SAFE_INTEGER - 1), false)
	})
})

describe('notBoolRecursive - arrays of booleans', () => {
	test('negates arrays of booleans without mutating input', () => {
		const input = [true, false, true, true, false]
		const snapshot = [...input]
		const result = notBoolRecursive(input)

		assert.deepEqual(result, [false, true, false, false, true])
		assert.deepEqual(input, snapshot)
		assert.notEqual(result, input)
	})

	test('handles empty array and single-element arrays', () => {
		assert.deepEqual(notBoolRecursive([]), [])
		assert.deepEqual(notBoolRecursive([true]), [false])
		assert.deepEqual(notBoolRecursive([false]), [true])
	})

	test('satisfies involution on arrays', () => {
		const input = [true, false, false, true, true, false, true]
		assert.deepEqual(notBoolRecursive(notBoolRecursive(input)), input)
		assert.deepEqual(notBoolRecursive(input, 2), input)
		assert.deepEqual(notBoolRecursive(input, 0), input)
		assert.deepEqual(notBoolRecursive(input, 3), notBoolRecursive(input))
	})
})

describe('notBoolRecursive - JS Set complement', () => {
	test('computes set complement against universe without mutating inputs', () => {
		const set = new Set([2, 4])
		const universe = new Set([1, 2, 3, 4, 5])
		const result = notBoolRecursive(set, universe)

		assert.deepEqual(result, new Set([1, 3, 5]))
		assert.deepEqual(set, new Set([2, 4]))
		assert.deepEqual(universe, new Set([1, 2, 3, 4, 5]))
		assert.notEqual(result, set)
		assert.notEqual(result, universe)
	})

	test('handles edge cases: empty set, full universe, empty universe, disjoint set', () => {
		const universe = new Set(['a', 'b', 'c'])

		// Empty set -> full universe
		assert.deepEqual(notBoolRecursive(new Set(), universe), new Set(['a', 'b', 'c']))
		// Full universe -> empty set
		assert.deepEqual(notBoolRecursive(universe, universe), new Set())
		// Empty universe -> empty set
		assert.deepEqual(notBoolRecursive(new Set(['a']), new Set()), new Set())
		assert.deepEqual(notBoolRecursive(new Set(), new Set()), new Set())
		// Disjoint set -> full universe
		assert.deepEqual(notBoolRecursive(new Set(['x', 'y']), universe), new Set(['a', 'b', 'c']))
		// Superset with extra elements -> elements of universe not in set
		assert.deepEqual(notBoolRecursive(new Set(['a', 'z']), universe), new Set(['b', 'c']))
	})

	test('satisfies involution for subsets of universe: not(not(A, U), U) === A', () => {
		const universe = new Set([1, 2, 3, 4, 5, 6])
		const subset = new Set([2, 5])
		const doubleComplement = notBoolRecursive(notBoolRecursive(subset, universe), universe)
		assert.deepEqual(doubleComplement, subset)
	})

	test('handles special JS Set values (NaN, booleans, null, undefined, objects)', () => {
		const objA = { id: 1 }
		const objB = { id: 2 }
		const universe = new Set([NaN, true, false, null, undefined, objA, objB])
		const subset = new Set([NaN, false, objA])
		const result = notBoolRecursive(subset, universe)
		assert.deepEqual(result, new Set([true, null, undefined, objB]))
	})
})

describe('notBoolRecursive - strict input validation', () => {
	test('throws TypeError for unsupported input types', () => {
		const invalidInputs = [
			undefined,
			null,
			0,
			1,
			NaN,
			'',
			'true',
			{},
			new Map(),
			Symbol('x'),
			() => true,
			new Boolean(true)
		]
		for (const bad of invalidInputs) {
			assert.throws(() => notBoolRecursive(bad), TypeError)
		}
	})

	test('throws TypeError for arrays with non-boolean elements or sparse holes', () => {
		assert.throws(() => notBoolRecursive([true, 1]), TypeError)
		assert.throws(() => notBoolRecursive([false, 'false']), TypeError)
		assert.throws(() => notBoolRecursive([null]), TypeError)
		assert.throws(() => notBoolRecursive([undefined]), TypeError)
		assert.throws(() => notBoolRecursive([new Boolean(false)]), TypeError)

		const sparse = new Array(3)
		sparse[0] = true
		sparse[2] = false
		assert.throws(() => notBoolRecursive(sparse), TypeError)
	})

	test('throws TypeError when Set universe is missing or not a Set', () => {
		assert.throws(() => notBoolRecursive(new Set([1])), TypeError)
		assert.throws(() => notBoolRecursive(new Set([1]), [1, 2]), TypeError)
		assert.throws(() => notBoolRecursive(new Set([1]), null), TypeError)
		assert.throws(() => notBoolRecursive(new Set([1]), {}), TypeError)
		assert.throws(() => notBoolRecursive(new Set([1]), 1), TypeError)
	})

	test('throws TypeError / RangeError for invalid repetition counts', () => {
		assert.throws(() => notBoolRecursive(true, '1'), TypeError)
		assert.throws(() => notBoolRecursive(true, null), TypeError)
		assert.throws(() => notBoolRecursive(true, 1.5), TypeError)
		assert.throws(() => notBoolRecursive(true, NaN), TypeError)
		assert.throws(() => notBoolRecursive(true, Infinity), TypeError)
		assert.throws(() => notBoolRecursive([true], '2'), TypeError)

		assert.throws(() => notBoolRecursive(true, -1), RangeError)
		assert.throws(() => notBoolRecursive([true], -3), RangeError)
		assert.throws(() => notBoolRecursive(true, Number.MAX_SAFE_INTEGER + 1), RangeError)
	})
})

describe('notBoolRecursive - cross-checks against independent reference implementation', () => {
	test('matches direct negation across booleans and repetition counts', () => {
		for (const value of [true, false]) {
			for (const times of [0, 1, 2, 3, 4, 5, 16, 17, 100, 101, 9999]) {
				assert.equal(notBoolRecursive(value, times), referenceNot(value, times))
			}
		}
	})

	test('matches direct negation on pseudo-random boolean arrays up to 10,000 elements', () => {
		let seed = 42
		const nextBool = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0
			return (seed & 1) === 1
		}

		for (const length of [0, 1, 2, 3, 15, 64, 1001, 10_000]) {
			const arr = Array.from({ length }, nextBool)
			assert.deepEqual(notBoolRecursive(arr), referenceNot(arr))
			assert.deepEqual(notBoolRecursive(arr, 4), referenceNot(arr, 4))
			assert.deepEqual(notBoolRecursive(arr, 5), referenceNot(arr, 5))
		}
	})

	test('matches iterative set complement across varied set sizes and distributions', () => {
		const universe = new Set(Array.from({ length: 2049 }, (_, i) => i))
		const evens = new Set(Array.from({ length: 1025 }, (_, i) => i * 2))
		const primesLike = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 9999])

		assert.deepEqual(notBoolRecursive(evens, universe), referenceNot(evens, universe))
		assert.deepEqual(notBoolRecursive(primesLike, universe), referenceNot(primesLike, universe))
		assert.deepEqual(notBoolRecursive(new Set(), universe), referenceNot(new Set(), universe))
		assert.deepEqual(notBoolRecursive(universe, universe), referenceNot(universe, universe))
	})
})
