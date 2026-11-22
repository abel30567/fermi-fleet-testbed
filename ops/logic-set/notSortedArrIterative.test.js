import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { notSortedArrIterative } from './notSortedArrIterative.js'

/**
 * Naive Set-based reference implementation for cross-checking.
 * @template T
 * @param {readonly T[]} universe
 * @param {readonly T[]} exclude
 * @returns {T[]}
 */
function naiveNot(universe, exclude) {
	const excluded = new Set(exclude)
	return universe.filter((x) => !excluded.has(x))
}

/**
 * Simple sorted union helper for Boolean algebra identity tests.
 * @param {readonly number[]} a
 * @param {readonly number[]} b
 * @returns {number[]}
 */
function naiveUnion(a, b) {
	return [...new Set([...a, ...b])].sort((x, y) => x - y)
}

/**
 * Simple sorted intersection helper for Boolean algebra identity tests.
 * @param {readonly number[]} a
 * @param {readonly number[]} b
 * @returns {number[]}
 */
function naiveIntersect(a, b) {
	const bSet = new Set(b)
	return a.filter((x) => bSet.has(x))
}

/**
 * Converts a bitmask over {0, ..., n-1} to a sorted array.
 * @param {number} mask
 * @param {number} n
 * @returns {number[]}
 */
function maskToSortedArray(mask, n) {
	const arr = []
	for (let bit = 0; bit < n; bit += 1) {
		if ((mask & (1 << bit)) !== 0) {
			arr.push(bit)
		}
	}
	return arr
}

/**
 * Deterministic LCG PRNG for reproducible randomized tests.
 * @param {number} seed
 */
function createRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

describe('notSortedArrIterative', () => {
	describe('normal cases', () => {
		test('computes complement with partial overlap', () => {
			assert.deepEqual(notSortedArrIterative([1, 2, 3, 4, 5], [2, 4]), [1, 3, 5])
			assert.deepEqual(notSortedArrIterative([10, 20, 30, 40], [10, 40]), [20, 30])
		})

		test('ignores exclude elements outside universe bounds and gaps', () => {
			assert.deepEqual(
				notSortedArrIterative([3, 5, 7, 9], [1, 2, 3, 4, 6, 9, 10, 11]),
				[5, 7],
			)
		})

		test('handles disjoint sets by returning all elements of universe', () => {
			assert.deepEqual(notSortedArrIterative([1, 3, 5], [2, 4, 6]), [1, 3, 5])
			assert.deepEqual(notSortedArrIterative([10, 20], [1, 2, 3]), [10, 20])
			assert.deepEqual(notSortedArrIterative([1, 2, 3], [10, 20]), [1, 2, 3])
		})

		test('handles identical sets by returning empty array', () => {
			assert.deepEqual(notSortedArrIterative([1, 2, 3], [1, 2, 3]), [])
		})

		test('supports negative numbers, floats, and infinities', () => {
			assert.deepEqual(
				notSortedArrIterative(
					[-Infinity, -10.5, -1, 0, 1.25, 100, Infinity],
					[-Infinity, -1, 1.25, Infinity],
				),
				[-10.5, 0, 100],
			)
		})

		test('supports sorted string arrays', () => {
			assert.deepEqual(
				notSortedArrIterative(['alpha', 'beta', 'delta', 'gamma'], ['beta', 'epsilon']),
				['alpha', 'delta', 'gamma'],
			)
		})

		test('supports sorted bigint arrays', () => {
			assert.deepEqual(
				notSortedArrIterative(
					[-10n, 0n, 1n, 9007199254740993n, 9007199254740995n],
					[0n, 9007199254740993n],
				),
				[-10n, 1n, 9007199254740995n],
			)
		})

		test('supports custom comparator for object arrays', () => {
			const cmpById = (a, b) => a.id - b.id
			const universe = [
				{ id: 1, name: 'a' },
				{ id: 2, name: 'b' },
				{ id: 3, name: 'c' },
				{ id: 4, name: 'd' },
			]
			const exclude = [
				{ id: 0, name: 'z' },
				{ id: 2, name: 'B' },
				{ id: 4, name: 'D' },
			]
			assert.deepEqual(notSortedArrIterative(universe, exclude, cmpById), [
				{ id: 1, name: 'a' },
				{ id: 3, name: 'c' },
			])
		})

		test('supports custom descending comparator', () => {
			const desc = (a, b) => b - a
			assert.deepEqual(notSortedArrIterative([9, 7, 5, 3, 1], [7, 4, 1], desc), [9, 5, 3])
		})
	})

	describe('edge cases', () => {
		test('handles empty arrays', () => {
			assert.deepEqual(notSortedArrIterative([], []), [])
			assert.deepEqual(notSortedArrIterative([], [1, 2, 3]), [])
			assert.deepEqual(notSortedArrIterative([1, 2, 3], []), [1, 2, 3])
		})

		test('handles single-element arrays', () => {
			assert.deepEqual(notSortedArrIterative([42], [42]), [])
			assert.deepEqual(notSortedArrIterative([42], [7]), [42])
			assert.deepEqual(notSortedArrIterative([42], [99]), [42])
			assert.deepEqual(notSortedArrIterative([42], []), [42])
			assert.deepEqual(notSortedArrIterative([], [42]), [])
		})

		test('treats -0 and +0 as equal', () => {
			assert.deepEqual(notSortedArrIterative([-1, 0, 1], [-0]), [-1, 1])
			assert.deepEqual(notSortedArrIterative([-1, -0, 1], [0]), [-1, 1])
		})

		test('returns a new array and does not mutate inputs', () => {
			const universe = [1, 2, 3]
			const exclude = []
			const out = notSortedArrIterative(universe, exclude)
			assert.deepEqual(out, [1, 2, 3])
			assert.notEqual(out, universe)
			out.push(99)
			assert.deepEqual(universe, [1, 2, 3])
			assert.deepEqual(exclude, [])
		})
	})

	describe('input validation', () => {
		test('throws TypeError for non-array universe or exclude', () => {
			for (const bad of [null, undefined, 123, 'abc', {}, new Set([1, 2])]) {
				assert.throws(() => notSortedArrIterative(bad, []), TypeError)
				assert.throws(() => notSortedArrIterative([], bad), TypeError)
			}
		})

		test('throws TypeError when compare is provided and not a function', () => {
			for (const badCompare of [null, 42, 'asc', {}, []]) {
				assert.throws(() => notSortedArrIterative([1, 2], [1], badCompare), TypeError)
			}
		})

		test('throws RangeError for unsorted universe or exclude', () => {
			assert.throws(() => notSortedArrIterative([3, 1, 2], []), RangeError)
			assert.throws(() => notSortedArrIterative([1, 2, 3], [5, 2]), RangeError)
			assert.throws(() => notSortedArrIterative([], [2, 1]), RangeError)
		})

		test('throws RangeError for duplicate elements in universe or exclude', () => {
			assert.throws(() => notSortedArrIterative([1, 2, 2, 3], []), RangeError)
			assert.throws(() => notSortedArrIterative([1, 2, 3], [2, 2]), RangeError)
			assert.throws(() => notSortedArrIterative([], [4, 4]), RangeError)
			assert.throws(() => notSortedArrIterative([-0, 0], []), RangeError)
		})

		test('throws RangeError for NaN elements under default comparator', () => {
			assert.throws(() => notSortedArrIterative([NaN], []), RangeError)
			assert.throws(() => notSortedArrIterative([], [NaN]), RangeError)
			assert.throws(() => notSortedArrIterative([1, NaN, 2], []), RangeError)
		})

		test('throws TypeError for unsupported or mixed types under default comparator', () => {
			assert.throws(() => notSortedArrIterative([{}], []), TypeError)
			assert.throws(() => notSortedArrIterative([true, false], []), TypeError)
			assert.throws(() => notSortedArrIterative([undefined], []), TypeError)
			assert.throws(() => notSortedArrIterative([1, '2'], []), TypeError)
			assert.throws(() => notSortedArrIterative([1, 2], ['1', '2']), TypeError)
			assert.throws(() => notSortedArrIterative([1, 2], [1n]), TypeError)
		})

		test('throws TypeError for sparse arrays', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3]
			assert.throws(() => notSortedArrIterative(sparse, []), TypeError)
			assert.throws(() => notSortedArrIterative([1, 2], sparse), TypeError)
		})

		test('throws when custom comparator returns non-number or NaN', () => {
			assert.throws(() => notSortedArrIterative([1, 2], [1], () => '0'), TypeError)
			assert.throws(() => notSortedArrIterative([1], [1], () => undefined), TypeError)
			assert.throws(() => notSortedArrIterative([1, 2], [1], () => NaN), RangeError)
			assert.throws(() => notSortedArrIterative([1], [1], () => NaN), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		test('exhaustive bitmask verification over all 1024 subset pairs of {0..4}', () => {
			const n = 5
			const limit = 1 << n
			for (let uMask = 0; uMask < limit; uMask += 1) {
				const uArr = maskToSortedArray(uMask, n)
				for (let aMask = 0; aMask < limit; aMask += 1) {
					const aArr = maskToSortedArray(aMask, n)
					const expected = maskToSortedArray(uMask & ~aMask, n)
					assert.deepEqual(notSortedArrIterative(uArr, aArr), expected)
				}
			}
		})

		test('matches naive Set-based reference across 200 deterministic random test cases', () => {
			const rng = createRng(0x5eed2026)
			for (let trial = 0; trial < 200; trial += 1) {
				const domainSize = 1 + Math.floor(rng() * 80)
				const uProb = rng()
				const aProb = rng()
				const universe = []
				const exclude = []

				for (let v = -20; v < -20 + domainSize; v += 1) {
					if (rng() < uProb) universe.push(v)
					if (rng() < aProb) exclude.push(v)
				}

				const actual = notSortedArrIterative(universe, exclude)
				const expected = naiveNot(universe, exclude)
				assert.deepEqual(actual, expected)
			}
		})

		test('satisfies Boolean algebra identities (involution, partition, De Morgan laws)', () => {
			const rng = createRng(0x12345678)
			const U = Array.from({ length: 40 }, (_, idx) => idx * 2 - 20)

			// Boundary identities: NOT(U, empty) = U and NOT(U, U) = empty
			assert.deepEqual(notSortedArrIterative(U, []), U)
			assert.deepEqual(notSortedArrIterative(U, U), [])

			for (let trial = 0; trial < 50; trial += 1) {
				const A = U.filter(() => rng() < 0.5)
				const B = U.filter(() => rng() < 0.5)

				const notA = notSortedArrIterative(U, A)
				const notB = notSortedArrIterative(U, B)

				// Double complement (involution): NOT(U, NOT(U, A)) === A
				assert.deepEqual(notSortedArrIterative(U, notA), A)

				// Law of non-contradiction and excluded middle: A ∩ ¬A = ∅, A ∪ ¬A = U
				assert.deepEqual(naiveIntersect(A, notA), [])
				assert.deepEqual(naiveUnion(A, notA), U)
				assert.equal(A.length + notA.length, U.length)

				// De Morgan's laws:
				// ¬(A ∪ B) === ¬A ∩ ¬B
				assert.deepEqual(
					notSortedArrIterative(U, naiveUnion(A, B)),
					naiveIntersect(notA, notB),
				)
				// ¬(A ∩ B) === ¬A ∪ ¬B
				assert.deepEqual(
					notSortedArrIterative(U, naiveIntersect(A, B)),
					naiveUnion(notA, notB),
				)
			}
		})
	})
})
