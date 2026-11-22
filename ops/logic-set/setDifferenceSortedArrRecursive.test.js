import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { setDifferenceSortedArrRecursive } from './setDifferenceSortedArrRecursive.js'

/**
 * Independent iterative two-pointer merge reference for set difference `a \ b`.
 * @param {readonly number[]} a
 * @param {readonly number[]} b
 * @returns {number[]}
 */
function iterativeSetDifference(a, b) {
	const out = []
	let i = 0
	let j = 0
	while (i < a.length && j < b.length) {
		if (a[i] < b[j]) {
			out.push(a[i])
			i++
		} else if (a[i] > b[j]) {
			j++
		} else {
			i++
			j++
		}
	}
	while (i < a.length) {
		out.push(a[i])
		i++
	}
	return out
}

/**
 * Independent Set-based reference for set difference `a \ b`.
 * @param {readonly number[]} a
 * @param {readonly number[]} b
 * @returns {number[]}
 */
function setBasedDifference(a, b) {
	const bSet = new Set(b)
	return a.filter((x) => !bSet.has(x))
}

/**
 * Simple deterministic PRNG (Mulberry32) for reproducible property tests.
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * Generates a sorted, de-duplicated array of integers using the given RNG.
 * @param {() => number} rng
 * @param {number} maxLen
 * @param {number} minVal
 * @param {number} maxVal
 * @returns {number[]}
 */
function randomSortedUnique(rng, maxLen, minVal, maxVal) {
	const set = new Set()
	const targetLen = Math.floor(rng() * (maxLen + 1))
	const span = maxVal - minVal + 1
	for (let k = 0; k < targetLen; k++) {
		set.add(minVal + Math.floor(rng() * span))
	}
	return [...set].sort((x, y) => x - y)
}

describe('setDifferenceSortedArrRecursive', () => {
	describe('normal cases', () => {
		test('computes difference of partially overlapping sorted arrays', () => {
			assert.deepStrictEqual(
				setDifferenceSortedArrRecursive([1, 2, 3, 4, 5], [2, 4, 6]),
				[1, 3, 5]
			)
			assert.deepStrictEqual(
				setDifferenceSortedArrRecursive([1, 2, 3, 4], [1, 2]),
				[3, 4]
			)
			assert.deepStrictEqual(
				setDifferenceSortedArrRecursive([1, 2, 3, 4], [3, 4]),
				[1, 2]
			)
		})

		test('handles disjoint arrays in both relative orders', () => {
			assert.deepStrictEqual(
				setDifferenceSortedArrRecursive([1, 2, 3], [4, 5, 6]),
				[1, 2, 3]
			)
			assert.deepStrictEqual(
				setDifferenceSortedArrRecursive([10, 20, 30], [1, 2, 3]),
				[10, 20, 30]
			)
			assert.deepStrictEqual(
				setDifferenceSortedArrRecursive([1, 3, 5, 7, 9], [2, 4, 6, 8]),
				[1, 3, 5, 7, 9]
			)
		})

		test('handles subsets, supersets, and identical sets', () => {
			assert.deepStrictEqual(
				setDifferenceSortedArrRecursive([2, 4], [1, 2, 3, 4, 5]),
				[]
			)
			assert.deepStrictEqual(
				setDifferenceSortedArrRecursive([1, 2, 3, 4, 5], [2, 4]),
				[1, 3, 5]
			)
			assert.deepStrictEqual(
				setDifferenceSortedArrRecursive([-5, 0, 5, 10], [-5, 0, 5, 10]),
				[]
			)
		})

		test('handles negative numbers and floating-point values', () => {
			assert.deepStrictEqual(
				setDifferenceSortedArrRecursive(
					[-10.5, -3.25, -1, 0, 0.5, 2.75, 100.1],
					[-10.5, -2, 0, 2.75, 50]
				),
				[-3.25, -1, 0.5, 100.1]
			)
		})

		test('does not mutate inputs and returns a fresh array instance', () => {
			const a = [1, 2, 3]
			const b = [4, 5, 6]
			const res = setDifferenceSortedArrRecursive(a, b)
			assert.deepStrictEqual(res, [1, 2, 3])
			assert.notStrictEqual(res, a)
			res.push(99)
			assert.deepStrictEqual(a, [1, 2, 3])
			assert.deepStrictEqual(b, [4, 5, 6])
		})
	})

	describe('edge cases', () => {
		test('handles empty arrays', () => {
			assert.deepStrictEqual(setDifferenceSortedArrRecursive([], []), [])
			assert.deepStrictEqual(setDifferenceSortedArrRecursive([], [1, 2, 3]), [])
			const a = [1, 2, 3]
			const res = setDifferenceSortedArrRecursive(a, [])
			assert.deepStrictEqual(res, [1, 2, 3])
			assert.notStrictEqual(res, a)
		})

		test('handles single-element arrays', () => {
			assert.deepStrictEqual(setDifferenceSortedArrRecursive([5], [5]), [])
			assert.deepStrictEqual(setDifferenceSortedArrRecursive([5], [3]), [5])
			assert.deepStrictEqual(setDifferenceSortedArrRecursive([5], [7]), [5])
			assert.deepStrictEqual(setDifferenceSortedArrRecursive([5], [1, 3, 5, 7]), [])
			assert.deepStrictEqual(setDifferenceSortedArrRecursive([5], [1, 3, 6, 7]), [5])
			assert.deepStrictEqual(setDifferenceSortedArrRecursive([1, 3, 5, 7], [5]), [1, 3, 7])
		})

		test('handles extreme finite IEEE-754 boundary numbers', () => {
			const a = [
				-Number.MAX_VALUE,
				Number.MIN_SAFE_INTEGER,
				-Number.MIN_VALUE,
				0,
				Number.MIN_VALUE,
				Number.MAX_SAFE_INTEGER,
				Number.MAX_VALUE
			]
			const b = [-Number.MAX_VALUE, 0, Number.MAX_VALUE]
			assert.deepStrictEqual(setDifferenceSortedArrRecursive(a, b), [
				Number.MIN_SAFE_INTEGER,
				-Number.MIN_VALUE,
				Number.MIN_VALUE,
				Number.MAX_SAFE_INTEGER
			])
		})

		test('treats -0 and 0 as equal values across sets', () => {
			assert.deepStrictEqual(setDifferenceSortedArrRecursive([-0], [0]), [])
			assert.deepStrictEqual(setDifferenceSortedArrRecursive([0], [-0]), [])
		})

		test('handles large arrays without exceeding call stack depth', () => {
			const n = 30000
			const a = Array.from({ length: n }, (_, i) => i * 2) // 0, 2, 4, ...
			const b = Array.from({ length: n }, (_, i) => i * 3) // 0, 3, 6, ...
			const actual = setDifferenceSortedArrRecursive(a, b)
			const expected = iterativeSetDifference(a, b)
			assert.deepStrictEqual(actual, expected)
			// Multiples of 2 up to 2*(n-1) that are not multiples of 6
			assert.equal(actual.length, n - Math.floor((n - 1) / 3) - 1)
		})

		test('handles highly asymmetric array lengths', () => {
			const large = Array.from({ length: 20000 }, (_, i) => i)
			const tiny = [0, 9999, 19999]
			assert.deepStrictEqual(
				setDifferenceSortedArrRecursive(tiny, large),
				[]
			)
			assert.deepStrictEqual(
				setDifferenceSortedArrRecursive([-5, 9999, 25000], large),
				[-5, 25000]
			)
			const largeMinusTiny = setDifferenceSortedArrRecursive(large, tiny)
			assert.equal(largeMinusTiny.length, 19997)
			assert.equal(largeMinusTiny[0], 1)
			assert.equal(largeMinusTiny[largeMinusTiny.length - 1], 19998)
		})
	})

	describe('input validation', () => {
		test('throws TypeError when arguments are not arrays', () => {
			for (const bad of [null, undefined, 42, '123', {}, new Set([1, 2])]) {
				assert.throws(
					() => setDifferenceSortedArrRecursive(bad, [1, 2]),
					TypeError
				)
				assert.throws(
					() => setDifferenceSortedArrRecursive([1, 2], bad),
					TypeError
				)
			}
		})

		test('throws TypeError when arrays contain non-number or sparse elements', () => {
			const sparse = [1, , 3] // eslint-disable-line no-sparse-arrays
			for (const badArr of [['1', '2'], [1, null], [1, undefined], [true], [1n], [{}], sparse]) {
				assert.throws(
					() => setDifferenceSortedArrRecursive(badArr, []),
					TypeError
				)
				assert.throws(
					() => setDifferenceSortedArrRecursive([], badArr),
					TypeError
				)
			}
		})

		test('throws RangeError when arrays contain non-finite numbers', () => {
			for (const badArr of [[NaN], [1, NaN], [Infinity], [-Infinity, 0], [0, Infinity]]) {
				assert.throws(
					() => setDifferenceSortedArrRecursive(badArr, []),
					RangeError
				)
				assert.throws(
					() => setDifferenceSortedArrRecursive([], badArr),
					RangeError
				)
			}
		})

		test('throws RangeError when arrays are not strictly ascending (unsorted or duplicated)', () => {
			for (const badArr of [
				[2, 1],
				[1, 3, 2],
				[1, 1],
				[1, 2, 2, 3],
				[-0, 0]
			]) {
				assert.throws(
					() => setDifferenceSortedArrRecursive(badArr, []),
					RangeError
				)
				assert.throws(
					() => setDifferenceSortedArrRecursive([], badArr),
					RangeError
				)
			}
		})
	})

	describe('independent cross-checks and set-theory identities', () => {
		test('matches iterative merge and Set-based references across 200 randomized cases', () => {
			const rng = createRng(0x5eed18)
			for (let trial = 0; trial < 200; trial++) {
				const maxLenA = trial % 4 === 0 ? 120 : 25
				const maxLenB = trial % 5 === 0 ? 120 : 25
				const a = randomSortedUnique(rng, maxLenA, -40, 40)
				const b = randomSortedUnique(rng, maxLenB, -40, 40)

				const actual = setDifferenceSortedArrRecursive(a, b)
				const expectedMerge = iterativeSetDifference(a, b)
				const expectedSet = setBasedDifference(a, b)

				assert.deepStrictEqual(actual, expectedMerge)
				assert.deepStrictEqual(actual, expectedSet)

				// Output invariant: strictly ascending
				for (let i = 1; i < actual.length; i++) {
					assert.ok(actual[i - 1] < actual[i])
				}
			}
		})

		test('satisfies fundamental set-difference algebraic identities', () => {
			const rng = createRng(0xabcdef18)
			for (let trial = 0; trial < 50; trial++) {
				const a = randomSortedUnique(rng, 30, -20, 20)
				const b = randomSortedUnique(rng, 30, -20, 20)
				const c = randomSortedUnique(rng, 30, -20, 20)

				// Identity 1: A \ A = ∅
				assert.deepStrictEqual(setDifferenceSortedArrRecursive(a, a), [])

				// Identity 2: A \ ∅ = A and ∅ \ B = ∅
				assert.deepStrictEqual(setDifferenceSortedArrRecursive(a, []), a)
				assert.deepStrictEqual(setDifferenceSortedArrRecursive([], b), [])

				// Identity 3: A \ (A \ B) = A ∩ B
				const aMinusB = setDifferenceSortedArrRecursive(a, b)
				const aIntersectB = setDifferenceSortedArrRecursive(a, aMinusB)
				const expectedIntersection = a.filter((x) => b.includes(x))
				assert.deepStrictEqual(aIntersectB, expectedIntersection)

				// Identity 4: |A \ B| + |A ∩ B| = |A|
				assert.equal(aMinusB.length + aIntersectB.length, a.length)

				// Identity 5: (A \ B) \ C = (A \ C) \ B
				const lhs = setDifferenceSortedArrRecursive(aMinusB, c)
				const rhs = setDifferenceSortedArrRecursive(
					setDifferenceSortedArrRecursive(a, c),
					b
				)
				assert.deepStrictEqual(lhs, rhs)
			}
		})
	})
})
