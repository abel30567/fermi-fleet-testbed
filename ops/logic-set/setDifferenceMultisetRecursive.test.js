import { describe, test } from 'node:test'
import assert from 'node:assert'
import { setDifferenceMultisetRecursive } from './setDifferenceMultisetRecursive.js'

/**
 * Independent iterative reference implementation for cross-checking.
 *
 * @template T
 * @param {Map<T, number>} a
 * @param {Map<T, number>} b
 * @returns {Map<T, number>}
 */
function iterativeMultisetDifference(a, b) {
	const result = new Map()
	for (const [key, countA] of a.entries()) {
		const countB = b.get(key) ?? 0
		const diff = countA - countB
		if (diff > 0) {
			result.set(key, diff)
		}
	}
	return result
}

describe('setDifferenceMultisetRecursive', () => {
	test('computes standard multiset difference with partial, exact, and excess subtractions', () => {
		const a = new Map([
			['apple', 5],
			['banana', 2],
			['cherry', 3],
			['date', 4],
		])
		const b = new Map([
			['apple', 2],
			['banana', 2],
			['cherry', 7],
			['elderberry', 3],
		])

		const result = setDifferenceMultisetRecursive(a, b)
		assert.deepStrictEqual(
			result,
			new Map([
				['apple', 3],
				['date', 4],
			])
		)
	})

	test('handles empty maps', () => {
		const empty = new Map()
		const nonEmpty = new Map([
			['x', 3],
			['y', 1],
		])

		assert.deepStrictEqual(setDifferenceMultisetRecursive(empty, empty), new Map())
		assert.deepStrictEqual(setDifferenceMultisetRecursive(empty, nonEmpty), new Map())
		assert.deepStrictEqual(setDifferenceMultisetRecursive(nonEmpty, empty), nonEmpty)
	})

	test('handles disjoint multisets', () => {
		const a = new Map([
			['a', 1],
			['b', 4],
		])
		const b = new Map([
			['c', 2],
			['d', 5],
		])

		const result = setDifferenceMultisetRecursive(a, b)
		assert.deepStrictEqual(result, new Map([['a', 1], ['b', 4]]))
		assert.notStrictEqual(result, a)
	})

	test('handles subset and superset relationships', () => {
		const sub = new Map([
			['k1', 2],
			['k2', 3],
		])
		const sup = new Map([
			['k1', 2],
			['k2', 5],
			['k3', 1],
		])

		assert.deepStrictEqual(setDifferenceMultisetRecursive(sub, sup), new Map())
		assert.deepStrictEqual(
			setDifferenceMultisetRecursive(sup, sub),
			new Map([
				['k2', 2],
				['k3', 1],
			])
		)
	})

	test('handles equal multisets and identical Map references', () => {
		const a = new Map([
			['p', 3],
			['q', 7],
			['r', 1],
		])
		const b = new Map([
			['p', 3],
			['q', 7],
			['r', 1],
		])

		assert.deepStrictEqual(setDifferenceMultisetRecursive(a, b), new Map())
		assert.deepStrictEqual(setDifferenceMultisetRecursive(a, a), new Map())
	})

	test('omits zero-count entries from inputs and subtraction results', () => {
		const a = new Map([
			['zeroInA', 0],
			['keep', 4],
			['cancelOut', 3],
		])
		const b = new Map([
			['keep', 0],
			['cancelOut', 3],
			['zeroInB', 0],
		])

		const result = setDifferenceMultisetRecursive(a, b)
		assert.deepStrictEqual(result, new Map([['keep', 4]]))
		assert.strictEqual(result.has('zeroInA'), false)
		assert.strictEqual(result.has('cancelOut'), false)
	})

	test('supports diverse Map key types and SameValueZero semantics', () => {
		const obj1 = { id: 1 }
		const obj2 = { id: 2 }
		const sym = Symbol('tag')

		const a = new Map([
			[obj1, 4],
			[obj2, 2],
			[sym, 5],
			[NaN, 3],
			[-0, 6],
			[null, 2],
			[undefined, 1],
		])
		const b = new Map([
			[obj1, 1],
			[obj2, 5],
			[sym, 2],
			[NaN, 1],
			[+0, 4],
			[null, 2],
		])

		const result = setDifferenceMultisetRecursive(a, b)
		assert.deepStrictEqual(
			result,
			new Map([
				[obj1, 3],
				[sym, 3],
				[NaN, 2],
				[0, 2],
				[undefined, 1],
			])
		)
	})

	test('does not mutate input maps and preserves key order of minuend', () => {
		const a = new Map([
			['z', 5],
			['a', 2],
			['m', 4],
			['b', 3],
		])
		const b = new Map([
			['a', 2],
			['m', 1],
		])
		const snapshotA = Array.from(a.entries())
		const snapshotB = Array.from(b.entries())

		const result = setDifferenceMultisetRecursive(a, b)
		assert.deepStrictEqual(Array.from(a.entries()), snapshotA)
		assert.deepStrictEqual(Array.from(b.entries()), snapshotB)
		assert.deepStrictEqual(Array.from(result.entries()), [
			['z', 5],
			['m', 3],
			['b', 3],
		])
	})

	test('handles large multisets cleanly via divide-and-conquer recursion', () => {
		const a = new Map()
		const b = new Map()
		for (let i = 0; i < 5000; i++) {
			a.set(i, (i % 10) + 1)
			if (i % 2 === 0) {
				b.set(i, (i % 7) + 1)
			}
		}

		const actual = setDifferenceMultisetRecursive(a, b)
		const expected = iterativeMultisetDifference(a, b)
		assert.deepStrictEqual(actual, expected)
	})

	test('cross-checks against an independent iterative implementation across randomized cases', () => {
		// Deterministic LCG PRNG for reproducible tests
		let seed = 0x5eed1234
		const nextInt = (max) => {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
			return seed % max
		}

		for (let trial = 0; trial < 50; trial++) {
			const universeSize = nextInt(40) + 1
			const a = new Map()
			const b = new Map()

			for (let k = 0; k < universeSize; k++) {
				if (nextInt(3) !== 0) {
					a.set(`k${k}`, nextInt(12))
				}
				if (nextInt(3) !== 0) {
					b.set(`k${k}`, nextInt(12))
				}
			}

			const actual = setDifferenceMultisetRecursive(a, b)
			const expected = iterativeMultisetDifference(a, b)
			assert.deepStrictEqual(actual, expected, `mismatch on trial ${trial}`)
		}
	})

	test('validates Map arguments and throws TypeError on non-Map inputs', () => {
		const valid = new Map([['a', 1]])
		const invalidMaps = [null, undefined, {}, [], new Set(['a']), 'map', 42]

		for (const bad of invalidMaps) {
			assert.throws(() => setDifferenceMultisetRecursive(bad, valid), TypeError)
			assert.throws(() => setDifferenceMultisetRecursive(valid, bad), TypeError)
		}
	})

	test('validates counts in both a and b and rejects invalid values', () => {
		const valid = new Map([['a', 2]])

		const nonNumberCounts = ['2', null, undefined, true, {}, 2n]
		for (const badCount of nonNumberCounts) {
			assert.throws(
				() => setDifferenceMultisetRecursive(new Map([['a', badCount]]), valid),
				TypeError
			)
			assert.throws(
				() => setDifferenceMultisetRecursive(valid, new Map([['unrelated', badCount]])),
				TypeError
			)
		}

		const outOfRangeCounts = [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]
		for (const badCount of outOfRangeCounts) {
			assert.throws(
				() => setDifferenceMultisetRecursive(new Map([['a', badCount]]), valid),
				RangeError
			)
			assert.throws(
				() => setDifferenceMultisetRecursive(valid, new Map([['unrelated', badCount]])),
				RangeError
			)
		}
	})
})
