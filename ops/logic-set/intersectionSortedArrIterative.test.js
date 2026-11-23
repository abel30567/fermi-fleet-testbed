import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { intersectionSortedArrIterative } from './intersectionSortedArrIterative.js'

/**
 * Deterministic PRNG (Mulberry32) for reproducible property-based tests.
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
function randomSortedUniqueInts(rng, maxLen, minVal, maxVal) {
	const count = Math.floor(rng() * (maxLen + 1))
	const set = new Set()
	const span = maxVal - minVal + 1
	for (let i = 0; i < count; i += 1) {
		set.add(minVal + Math.floor(rng() * span))
	}
	return [...set].sort((x, y) => x - y)
}

/**
 * Independent reference implementation using Set membership.
 * @template T
 * @param {readonly T[]} a
 * @param {readonly T[]} b
 * @returns {T[]}
 */
function setReferenceIntersection(a, b) {
	const inB = new Set(b)
	return a.filter((x) => inB.has(x))
}

describe('intersectionSortedArrIterative', () => {
	describe('normal cases', () => {
		it('computes intersection of overlapping sorted integer arrays', () => {
			assert.deepEqual(
				intersectionSortedArrIterative([1, 2, 4, 5, 8], [2, 3, 5, 7, 8, 9]),
				[2, 5, 8],
			)
		})

		it('handles negative numbers and floating-point values', () => {
			assert.deepEqual(
				intersectionSortedArrIterative([-10, -2.5, 0, 1.5, 4.25], [-2.5, 0, 3.14, 4.25, 99]),
				[-2.5, 0, 4.25],
			)
		})

		it('works with sorted string arrays', () => {
			assert.deepEqual(
				intersectionSortedArrIterative(
					['apple', 'banana', 'cherry', 'date'],
					['avocado', 'banana', 'date', 'fig'],
				),
				['banana', 'date'],
			)
		})

		it('works with sorted BigInt arrays', () => {
			assert.deepEqual(
				intersectionSortedArrIterative([-10n, 0n, 42n, 1000n], [-5n, 0n, 42n, 500n]),
				[0n, 42n],
			)
		})

		it('supports a custom comparator for objects', () => {
			const cmpById = (x, y) => x.id - y.id
			const a = [
				{ id: 1, label: 'a1' },
				{ id: 3, label: 'a3' },
				{ id: 5, label: 'a5' },
			]
			const b = [
				{ id: 2, label: 'b2' },
				{ id: 3, label: 'b3' },
				{ id: 5, label: 'b5' },
				{ id: 7, label: 'b7' },
			]
			assert.deepEqual(intersectionSortedArrIterative(a, b, cmpById), [
				{ id: 3, label: 'a3' },
				{ id: 5, label: 'a5' },
			])
		})

		it('supports a custom descending comparator', () => {
			const desc = (x, y) => y - x
			assert.deepEqual(
				intersectionSortedArrIterative([10, 7, 4, 1], [9, 7, 3, 1], desc),
				[7, 1],
			)
		})

		it('does not mutate input arrays and returns a new array', () => {
			const a = [1, 2, 3]
			const b = [1, 2, 3]
			const out = intersectionSortedArrIterative(a, b)
			assert.deepEqual(out, [1, 2, 3])
			assert.notEqual(out, a)
			assert.notEqual(out, b)
			assert.deepEqual(a, [1, 2, 3])
			assert.deepEqual(b, [1, 2, 3])
		})
	})

	describe('edge cases', () => {
		it('handles empty arrays', () => {
			assert.deepEqual(intersectionSortedArrIterative([], []), [])
			assert.deepEqual(intersectionSortedArrIterative([], [1, 2, 3]), [])
			assert.deepEqual(intersectionSortedArrIterative([1, 2, 3], []), [])
		})

		it('returns empty array for disjoint arrays', () => {
			assert.deepEqual(intersectionSortedArrIterative([1, 3, 5], [2, 4, 6]), [])
			assert.deepEqual(intersectionSortedArrIterative([1, 2, 3], [10, 20, 30]), [])
			assert.deepEqual(intersectionSortedArrIterative([10, 20, 30], [1, 2, 3]), [])
		})

		it('handles single-element arrays', () => {
			assert.deepEqual(intersectionSortedArrIterative([7], [7]), [7])
			assert.deepEqual(intersectionSortedArrIterative([7], [8]), [])
			assert.deepEqual(intersectionSortedArrIterative([8], [7]), [])
		})

		it('handles boundary-only and subset/superset overlaps', () => {
			assert.deepEqual(intersectionSortedArrIterative([1, 2, 3], [3, 4, 5]), [3])
			assert.deepEqual(intersectionSortedArrIterative([3, 4, 5], [1, 2, 3]), [3])
			assert.deepEqual(intersectionSortedArrIterative([2, 4], [1, 2, 3, 4, 5]), [2, 4])
			assert.deepEqual(intersectionSortedArrIterative([1, 2, 3, 4, 5], [2, 4]), [2, 4])
		})

		it('treats -0 and +0 as equal under default ordering', () => {
			const out = intersectionSortedArrIterative([-5, -0, 5], [0, 10])
			assert.equal(out.length, 1)
			assert.equal(out[0] === 0, true)
		})

		it('handles highly skewed array sizes', () => {
			const large = Array.from({ length: 10000 }, (_, i) => i * 2)
			assert.deepEqual(intersectionSortedArrIterative([9998], large), [9998])
			assert.deepEqual(intersectionSortedArrIterative(large, [9999]), [])
		})
	})

	describe('input validation', () => {
		it('throws TypeError when a or b is not an Array', () => {
			for (const bad of [null, undefined, 42, '123', {}, new Set([1, 2])]) {
				assert.throws(() => intersectionSortedArrIterative(bad, [1, 2]), TypeError)
				assert.throws(() => intersectionSortedArrIterative([1, 2], bad), TypeError)
			}
		})

		it('throws TypeError when compare is provided and not a function', () => {
			for (const badCmp of [null, 123, 'asc', {}]) {
				assert.throws(
					() => intersectionSortedArrIterative([1, 2], [2, 3], badCmp),
					TypeError,
				)
			}
		})

		it('throws RangeError when inputs are not sorted in ascending order', () => {
			assert.throws(() => intersectionSortedArrIterative([1, 3, 2], [1, 2]), RangeError)
			assert.throws(() => intersectionSortedArrIterative([1, 2], [3, 2, 1]), RangeError)
			// Still validates even when the other array is empty
			assert.throws(() => intersectionSortedArrIterative([], [2, 1]), RangeError)
			assert.throws(() => intersectionSortedArrIterative([2, 1], []), RangeError)
		})

		it('throws RangeError when inputs contain duplicates', () => {
			assert.throws(() => intersectionSortedArrIterative([1, 2, 2, 3], [2, 3]), RangeError)
			assert.throws(() => intersectionSortedArrIterative([1, 2], [2, 2]), RangeError)
			assert.throws(() => intersectionSortedArrIterative([], [5, 5]), RangeError)
		})

		it('throws RangeError when inputs contain NaN with default comparator', () => {
			assert.throws(() => intersectionSortedArrIterative([NaN], [1]), RangeError)
			assert.throws(() => intersectionSortedArrIterative([1, 2], [1, NaN]), RangeError)
		})

		it('throws TypeError for sparse arrays', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3]
			assert.throws(() => intersectionSortedArrIterative(sparse, [1, 3]), TypeError)
			assert.throws(() => intersectionSortedArrIterative([1, 3], sparse), TypeError)
		})

		it('throws RangeError when custom comparator returns NaN or non-number', () => {
			assert.throws(
				() => intersectionSortedArrIterative([1, 2], [1, 2], () => NaN),
				RangeError,
			)
			assert.throws(
				() => intersectionSortedArrIterative([1], [1], () => NaN),
				RangeError,
			)
			assert.throws(
				() => intersectionSortedArrIterative([1], [1], () => '0'),
				RangeError,
			)
		})
	})

	describe('independent cross-checks and algebraic properties', () => {
		it('matches independent Set-based reference across 250 randomized test cases', () => {
			const rng = createRng(0x5eed1234)
			for (let t = 0; t < 250; t += 1) {
				const a = randomSortedUniqueInts(rng, 40, -30, 30)
				const b = randomSortedUniqueInts(rng, 40, -30, 30)
				const actual = intersectionSortedArrIterative(a, b)
				const expected = setReferenceIntersection(a, b)
				assert.deepEqual(actual, expected)

				// Output invariants: strictly ascending, de-duplicated, bounded length
				assert.ok(actual.length <= Math.min(a.length, b.length))
				for (let i = 1; i < actual.length; i += 1) {
					assert.ok(actual[i - 1] < actual[i])
				}
			}
		})

		it('satisfies commutativity, idempotence, and associativity', () => {
			const rng = createRng(0xcafe42)
			for (let t = 0; t < 100; t += 1) {
				const a = randomSortedUniqueInts(rng, 25, -20, 20)
				const b = randomSortedUniqueInts(rng, 25, -20, 20)
				const c = randomSortedUniqueInts(rng, 25, -20, 20)

				// Commutativity: A ∩ B == B ∩ A
				assert.deepEqual(
					intersectionSortedArrIterative(a, b),
					intersectionSortedArrIterative(b, a),
				)

				// Idempotence: A ∩ A == A
				assert.deepEqual(intersectionSortedArrIterative(a, a), a)

				// Associativity: (A ∩ B) ∩ C == A ∩ (B ∩ C)
				const left = intersectionSortedArrIterative(
					intersectionSortedArrIterative(a, b),
					c,
				)
				const right = intersectionSortedArrIterative(
					a,
					intersectionSortedArrIterative(b, c),
				)
				assert.deepEqual(left, right)
			}
		})

		it('matches Set reference on large arrays (10,000 elements each)', () => {
			const a = Array.from({ length: 10000 }, (_, i) => i * 3)
			const b = Array.from({ length: 10000 }, (_, i) => i * 5)
			const actual = intersectionSortedArrIterative(a, b)
			const expected = setReferenceIntersection(a, b)
			assert.deepEqual(actual, expected)
			assert.equal(actual[0], 0)
			assert.equal(actual[actual.length - 1], 29985)
		})
	})
})
