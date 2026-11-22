import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { xorBoolRecursive } from './xorBoolRecursive.js'

/**
 * Independent reference oracle for boolean parity XOR:
 * returns true iff the count of `true` values is odd.
 *
 * @param {boolean[]} values
 * @returns {boolean}
 */
function referenceBoolParity(values) {
	let countTrue = 0
	for (const v of values) {
		if (v) countTrue += 1
	}
	return countTrue % 2 === 1
}

/**
 * Independent reference oracle for multi-set symmetric difference:
 * includes each element iff it appears in an odd number of sets.
 *
 * @param {Set<*>[]} sets
 * @returns {Set<*>}
 */
function referenceSetSymmetricDiff(sets) {
	const counts = new Map()
	for (const s of sets) {
		for (const item of s) {
			counts.set(item, (counts.get(item) ?? 0) + 1)
		}
	}
	const result = new Set()
	for (const [item, count] of counts.entries()) {
		if (count % 2 === 1) {
			result.add(item)
		}
	}
	return result
}

describe('xorBoolRecursive - booleans', () => {
	test('2-input truth table (variadic and array)', () => {
		const cases = [
			[[false, false], false],
			[[false, true], true],
			[[true, false], true],
			[[true, true], false]
		]
		for (const [inputs, expected] of cases) {
			assert.equal(xorBoolRecursive(...inputs), expected)
			assert.equal(xorBoolRecursive(inputs), expected)
		}
	})

	test('single boolean edge cases', () => {
		assert.equal(xorBoolRecursive(true), true)
		assert.equal(xorBoolRecursive(false), false)
		assert.equal(xorBoolRecursive([true]), true)
		assert.equal(xorBoolRecursive([false]), false)
	})

	test('all true (even and odd counts) and all false', () => {
		for (let n = 1; n <= 16; n += 1) {
			const allTrue = Array(n).fill(true)
			const allFalse = Array(n).fill(false)
			assert.equal(xorBoolRecursive(...allTrue), n % 2 === 1)
			assert.equal(xorBoolRecursive(allTrue), n % 2 === 1)
			assert.equal(xorBoolRecursive(...allFalse), false)
			assert.equal(xorBoolRecursive(allFalse), false)
		}
	})

	test('multi-argument parity with mixed values', () => {
		assert.equal(xorBoolRecursive(true, false, false), true)
		assert.equal(xorBoolRecursive(true, true, false), false)
		assert.equal(xorBoolRecursive(true, true, true), true)
		assert.equal(xorBoolRecursive(false, true, false, true, true), true)
		assert.equal(xorBoolRecursive([false, true, false, true, true, true]), false)
	})

	test('exhaustive truth table cross-check against countTrue % 2 === 1 (n = 1..8)', () => {
		for (let n = 1; n <= 8; n += 1) {
			const total = 1 << n
			for (let mask = 0; mask < total; mask += 1) {
				const bits = []
				for (let i = 0; i < n; i += 1) {
					bits.push(((mask >> i) & 1) === 1)
				}
				const expected = referenceBoolParity(bits)
				assert.equal(xorBoolRecursive(...bits), expected)
				assert.equal(xorBoolRecursive(bits), expected)
			}
		}
	})

	test('handles large boolean arrays without stack overflow via divide-and-conquer', () => {
		const size = 20000
		const evenTrues = Array.from({ length: size }, (_, i) => i % 2 === 0)
		const oddTrues = [...evenTrues, true]
		assert.equal(xorBoolRecursive(evenTrues), referenceBoolParity(evenTrues))
		assert.equal(xorBoolRecursive(oddTrues), referenceBoolParity(oddTrues))
	})
})

describe('xorBoolRecursive - Sets', () => {
	test('2-set symmetric difference (variadic and array)', () => {
		const a = new Set([1, 2, 3])
		const b = new Set([3, 4, 5])
		const expected = new Set([1, 2, 4, 5])

		assert.deepEqual(xorBoolRecursive(a, b), expected)
		assert.deepEqual(xorBoolRecursive([a, b]), expected)
		// Ensure input sets are not mutated
		assert.deepEqual(a, new Set([1, 2, 3]))
		assert.deepEqual(b, new Set([3, 4, 5]))
	})

	test('single set returns a fresh copy without aliasing', () => {
		const s = new Set(['a', 'b'])
		const outVariadic = xorBoolRecursive(s)
		const outArray = xorBoolRecursive([s])

		assert.deepEqual(outVariadic, new Set(['a', 'b']))
		assert.deepEqual(outArray, new Set(['a', 'b']))
		assert.notEqual(outVariadic, s)
		assert.notEqual(outArray, s)
	})

	test('empty sets and identical sets (even vs odd count)', () => {
		const empty = new Set()
		const s = new Set([10, 20])

		assert.deepEqual(xorBoolRecursive(empty), new Set())
		assert.deepEqual(xorBoolRecursive(empty, empty), new Set())
		assert.deepEqual(xorBoolRecursive(s, s), new Set())
		assert.deepEqual(xorBoolRecursive(s, s, s), new Set([10, 20]))
		assert.deepEqual(xorBoolRecursive(s, s, s, s), new Set())
	})

	test('multi-set parity symmetric difference cross-checked against element count parity', () => {
		const sets = [
			new Set([1, 2, 3, 4]),
			new Set([2, 3, 5]),
			new Set([3, 4, 5, 6]),
			new Set([1, 3, 7]),
			new Set([3, 6, 8])
		]
		const expected = referenceSetSymmetricDiff(sets)
		assert.deepEqual(xorBoolRecursive(...sets), expected)
		assert.deepEqual(xorBoolRecursive(sets), expected)
		// Element 3 appears in all 5 sets (odd) => included; 1,2,4,5,6 appear twice (even) => excluded
		assert.deepEqual(expected, new Set([3, 7, 8]))
	})

	test('preserves JS Set SameValueZero semantics (NaN, objects)', () => {
		const obj = { id: 1 }
		const a = new Set([NaN, obj, 'x'])
		const b = new Set([NaN, 'y'])
		const c = new Set([NaN, obj])

		assert.deepEqual(xorBoolRecursive(a, b), new Set([obj, 'x', 'y']))
		assert.deepEqual(xorBoolRecursive(a, b, c), new Set([NaN, 'x', 'y']))
	})
})

describe('xorBoolRecursive - invalid inputs throw TypeError', () => {
	test('rejects missing arguments and empty arrays', () => {
		assert.throws(() => xorBoolRecursive(), TypeError)
		assert.throws(() => xorBoolRecursive([]), TypeError)
	})

	test('rejects non-boolean, non-Set primitives and objects', () => {
		const invalidValues = [
			0,
			1,
			'true',
			'false',
			null,
			undefined,
			{},
			new Map(),
			new Boolean(true),
			Symbol('x'),
			() => true
		]
		for (const bad of invalidValues) {
			assert.throws(() => xorBoolRecursive(bad), TypeError)
			assert.throws(() => xorBoolRecursive([bad]), TypeError)
			assert.throws(() => xorBoolRecursive(true, bad), TypeError)
			assert.throws(() => xorBoolRecursive([true, bad]), TypeError)
			assert.throws(() => xorBoolRecursive(new Set([1]), bad), TypeError)
			assert.throws(() => xorBoolRecursive([new Set([1]), bad]), TypeError)
		}
	})

	test('rejects mixing booleans and Sets', () => {
		assert.throws(() => xorBoolRecursive(true, new Set([1])), TypeError)
		assert.throws(() => xorBoolRecursive(new Set([1]), false), TypeError)
		assert.throws(() => xorBoolRecursive([true, new Set([1])]), TypeError)
		assert.throws(() => xorBoolRecursive([new Set([1]), true]), TypeError)
	})

	test('rejects nested or multiple arrays and sparse arrays', () => {
		assert.throws(() => xorBoolRecursive([true], [false]), TypeError)
		assert.throws(() => xorBoolRecursive([[true]]), TypeError)
		// Sparse array containing a hole
		const sparse = [true, , false] // eslint-disable-line no-sparse-arrays
		assert.throws(() => xorBoolRecursive(sparse), TypeError)
		assert.throws(() => xorBoolRecursive(new Array(2)), TypeError)
	})
})
