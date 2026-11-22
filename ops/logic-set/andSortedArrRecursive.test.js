import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { andSortedArrRecursive } from './andSortedArrRecursive.js'

/**
 * Independent iterative two-pointer merge reference implementation for cross-checking.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function iterativeTwoPointerAnd(a, b) {
	const result = []
	let i = 0
	let j = 0
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			result.push(a[i] === 0 ? 0 : a[i])
			i++
			j++
		} else if (a[i] < b[j]) {
			i++
		} else {
			j++
		}
	}
	return result
}

/**
 * Deterministic LCG PRNG for reproducible property/cross-check tests.
 */
function createRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

/**
 * Generates a sorted, de-duplicated array of integers using a deterministic RNG.
 */
function randomSortedUniqueArray(rng, maxLen, minVal, maxVal) {
	const len = Math.floor(rng() * (maxLen + 1))
	const set = new Set()
	const span = maxVal - minVal + 1
	for (let i = 0; i < len; i++) {
		set.add(minVal + Math.floor(rng() * span))
	}
	return Array.from(set).sort((x, y) => x - y)
}

describe('andSortedArrRecursive', () => {
	describe('normal cases', () => {
		test('intersects overlapping sorted integer arrays', () => {
			assert.deepEqual(
				andSortedArrRecursive([1, 2, 4, 6, 8], [2, 3, 4, 7, 8, 9]),
				[2, 4, 8]
			)
		})

		test('handles negative, zero, and floating-point numbers', () => {
			assert.deepEqual(
				andSortedArrRecursive(
					[-100.5, -10, -0.25, 0, 1.5, 3.14159, 42],
					[-50, -10, -0.25, 0.25, 1.5, 42, 99.9]
				),
				[-10, -0.25, 1.5, 42]
			)
		})

		test('handles extreme finite numbers', () => {
			const a = [
				-Number.MAX_VALUE,
				Number.MIN_SAFE_INTEGER,
				-Number.MIN_VALUE,
				0,
				Number.MIN_VALUE,
				Number.MAX_SAFE_INTEGER,
				Number.MAX_VALUE
			]
			const b = [
				-Number.MAX_VALUE,
				-1,
				0,
				Number.MIN_VALUE,
				Number.MAX_VALUE
			]
			assert.deepEqual(andSortedArrRecursive(a, b), [
				-Number.MAX_VALUE,
				0,
				Number.MIN_VALUE,
				Number.MAX_VALUE
			])
		})

		test('handles asymmetric array sizes in both argument orders', () => {
			const small = [5, 50, 500]
			const large = Array.from({ length: 1000 }, (_, i) => i)
			assert.deepEqual(andSortedArrRecursive(small, large), [5, 50, 500])
			assert.deepEqual(andSortedArrRecursive(large, small), [5, 50, 500])
		})

		test('handles subset, superset, and identical arrays', () => {
			const a = [1, 2, 3, 4, 5]
			const sub = [2, 4]
			assert.deepEqual(andSortedArrRecursive(a, sub), [2, 4])
			assert.deepEqual(andSortedArrRecursive(sub, a), [2, 4])
			assert.deepEqual(andSortedArrRecursive(a, a), [1, 2, 3, 4, 5])
		})

		test('returns empty array for range-disjoint and interleaved-disjoint inputs', () => {
			// Range-disjoint
			assert.deepEqual(andSortedArrRecursive([1, 2, 3], [10, 20, 30]), [])
			assert.deepEqual(andSortedArrRecursive([10, 20, 30], [1, 2, 3]), [])
			// Interleaved-disjoint (evens vs odds)
			assert.deepEqual(
				andSortedArrRecursive([0, 2, 4, 6, 8], [1, 3, 5, 7, 9]),
				[]
			)
		})
	})

	describe('edge cases', () => {
		test('handles empty arrays', () => {
			assert.deepEqual(andSortedArrRecursive([], []), [])
			assert.deepEqual(andSortedArrRecursive([], [1, 2, 3]), [])
			assert.deepEqual(andSortedArrRecursive([1, 2, 3], []), [])
		})

		test('handles single-element arrays', () => {
			assert.deepEqual(andSortedArrRecursive([7], [7]), [7])
			assert.deepEqual(andSortedArrRecursive([7], [8]), [])
			assert.deepEqual(andSortedArrRecursive([7], [1, 7, 9]), [7])
			assert.deepEqual(andSortedArrRecursive([1, 7, 9], [7]), [7])
			assert.deepEqual(andSortedArrRecursive([7], [1, 6, 9]), [])
		})

		test('normalizes -0 to +0 in the result', () => {
			const res1 = andSortedArrRecursive([-1, -0, 1], [0, 2])
			assert.deepEqual(res1, [0])
			assert.equal(Object.is(res1[0], 0), true)

			const res2 = andSortedArrRecursive([0], [-0])
			assert.deepEqual(res2, [0])
			assert.equal(Object.is(res2[0], 0), true)
		})

		test('does not mutate inputs and returns a new array instance', () => {
			const a = [1, 2, 3]
			const b = [1, 2, 3]
			const res = andSortedArrRecursive(a, b)
			assert.deepEqual(res, [1, 2, 3])
			assert.notEqual(res, a)
			assert.notEqual(res, b)
			assert.deepEqual(a, [1, 2, 3])
			assert.deepEqual(b, [1, 2, 3])
		})

		test('handles large arrays without stack overflow (O(log n) recursion depth)', () => {
			const n = 50_000
			const a = Array.from({ length: n }, (_, i) => i * 2) // multiples of 2
			const b = Array.from({ length: n }, (_, i) => i * 3) // multiples of 3
			const result = andSortedArrRecursive(a, b)
			const expected = iterativeTwoPointerAnd(a, b)
			assert.deepEqual(result, expected)
			// Multiples of 6 up to min(2*(n-1), 3*(n-1)) = 99998 => 0, 6, 12, ..., 99996
			assert.equal(result.length, Math.floor((2 * (n - 1)) / 6) + 1)
			assert.equal(result[0], 0)
			assert.equal(result[result.length - 1], 99996)
		})
	})

	describe('input validation', () => {
		test('throws TypeError when a or b is not an Array', () => {
			const nonArrays = [
				null,
				undefined,
				42,
				'123',
				{},
				new Set([1, 2]),
				new Int32Array([1, 2])
			]
			for (const bad of nonArrays) {
				assert.throws(() => andSortedArrRecursive(bad, [1, 2]), TypeError)
				assert.throws(() => andSortedArrRecursive([1, 2], bad), TypeError)
			}
		})

		test('throws TypeError for non-number elements or sparse array holes', () => {
			const sparse = [1, , 3] // eslint-disable-line no-sparse-arrays
			const invalidElementArrays = [
				['1', '2'],
				[1, null, 3],
				[1, undefined, 3],
				[1, true, 3],
				[1, {}, 3],
				[1, 2n, 3],
				sparse
			]
			for (const bad of invalidElementArrays) {
				assert.throws(() => andSortedArrRecursive(bad, [1, 3]), TypeError)
				assert.throws(() => andSortedArrRecursive([1, 3], bad), TypeError)
			}
		})

		test('throws RangeError for non-finite numbers (NaN, Infinity, -Infinity)', () => {
			for (const bad of [[NaN], [1, NaN], [Infinity], [-Infinity, 0], [0, Infinity]]) {
				assert.throws(() => andSortedArrRecursive(bad, [0, 1]), RangeError)
				assert.throws(() => andSortedArrRecursive([0, 1], bad), RangeError)
			}
		})

		test('throws RangeError for unsorted arrays', () => {
			for (const bad of [
				[2, 1],
				[1, 3, 2],
				[1, 2, 5, 4, 6],
				[10, 5, 0, -5]
			]) {
				assert.throws(() => andSortedArrRecursive(bad, [1, 2]), RangeError)
				assert.throws(() => andSortedArrRecursive([1, 2], bad), RangeError)
			}
		})

		test('throws RangeError for arrays with duplicate elements', () => {
			for (const bad of [
				[1, 1],
				[1, 2, 2, 3],
				[-0, 0],
				[0, 1, 2, 3, 3]
			]) {
				assert.throws(() => andSortedArrRecursive(bad, [1, 2]), RangeError)
				assert.throws(() => andSortedArrRecursive([1, 2], bad), RangeError)
			}
		})

		test('still validates second array even when first array is empty (and vice versa)', () => {
			assert.throws(() => andSortedArrRecursive([], [2, 1]), RangeError)
			assert.throws(() => andSortedArrRecursive([2, 1], []), RangeError)
			assert.throws(() => andSortedArrRecursive([], ['bad']), TypeError)
			assert.throws(() => andSortedArrRecursive(['bad'], []), TypeError)
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		test('matches iterative two-pointer merge and Set intersection over 200 random pairs', () => {
			const rng = createRng(0x5eed1234)
			for (let trial = 0; trial < 200; trial++) {
				const a = randomSortedUniqueArray(rng, 120, -80, 80)
				const b = randomSortedUniqueArray(rng, 120, -80, 80)

				const actual = andSortedArrRecursive(a, b)
				const expectedIterative = iterativeTwoPointerAnd(a, b)
				const bSet = new Set(b)
				const expectedSet = a.filter((x) => bSet.has(x))

				assert.deepEqual(actual, expectedIterative)
				assert.deepEqual(actual, expectedSet)

				// Output must itself be strictly ascending
				for (let i = 1; i < actual.length; i++) {
					assert.ok(actual[i - 1] < actual[i])
				}
			}
		})

		test('satisfies set-algebraic laws: commutativity, associativity, idempotence, and annihilation', () => {
			const rng = createRng(0xdeadbeef)
			for (let trial = 0; trial < 50; trial++) {
				const a = randomSortedUniqueArray(rng, 60, -40, 40)
				const b = randomSortedUniqueArray(rng, 60, -40, 40)
				const c = randomSortedUniqueArray(rng, 60, -40, 40)

				// Commutativity: A ∩ B = B ∩ A
				assert.deepEqual(
					andSortedArrRecursive(a, b),
					andSortedArrRecursive(b, a)
				)

				// Associativity: (A ∩ B) ∩ C = A ∩ (B ∩ C)
				assert.deepEqual(
					andSortedArrRecursive(andSortedArrRecursive(a, b), c),
					andSortedArrRecursive(a, andSortedArrRecursive(b, c))
				)

				// Idempotence: A ∩ A = A
				assert.deepEqual(andSortedArrRecursive(a, a), a)

				// Annihilation with empty set: A ∩ ∅ = ∅
				assert.deepEqual(andSortedArrRecursive(a, []), [])
			}
		})
	})
})
