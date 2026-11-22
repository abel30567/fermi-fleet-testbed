import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { notSortedArrRecursive } from './notSortedArrRecursive.js'

/**
 * Independent iterative two-pointer merge reference implementation of `universe \ set`.
 */
function iterativeComplementRef(set, universe) {
	const result = []
	let i = 0
	let j = 0
	while (i < universe.length && j < set.length) {
		if (universe[i] < set[j]) {
			result.push(universe[i] === 0 ? 0 : universe[i])
			i++
		} else if (universe[i] === set[j]) {
			i++
			j++
		} else {
			j++
		}
	}
	while (i < universe.length) {
		result.push(universe[i] === 0 ? 0 : universe[i])
		i++
	}
	return result
}

/**
 * Independent Set-based union and intersection helpers for De Morgan / identity checks.
 */
function unionRef(a, b) {
	return [...new Set([...a, ...b])].sort((x, y) => x - y)
}

function intersectRef(a, b) {
	const bSet = new Set(b)
	return a.filter((x) => bSet.has(x))
}

/**
 * Deterministic LCG PRNG for reproducible cross-check tests.
 */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

describe('notSortedArrRecursive', () => {
	describe('normal cases', () => {
		test('computes complement of a subset relative to universe', () => {
			assert.deepStrictEqual(
				notSortedArrRecursive([2, 4, 6], [1, 2, 3, 4, 5, 6, 7]),
				[1, 3, 5, 7],
			)
		})

		test('ignores elements in set that are outside universe', () => {
			assert.deepStrictEqual(
				notSortedArrRecursive([-100, -1, 2, 4, 50, 999], [1, 2, 3, 4, 5]),
				[1, 3, 5],
			)
		})

		test('handles removing prefix, suffix, middle block, and endpoints', () => {
			const u = [10, 20, 30, 40, 50, 60]
			assert.deepStrictEqual(notSortedArrRecursive([10, 20], u), [30, 40, 50, 60])
			assert.deepStrictEqual(notSortedArrRecursive([50, 60], u), [10, 20, 30, 40])
			assert.deepStrictEqual(notSortedArrRecursive([30, 40], u), [10, 20, 50, 60])
			assert.deepStrictEqual(notSortedArrRecursive([10, 60], u), [20, 30, 40, 50])
			assert.deepStrictEqual(notSortedArrRecursive([10], u), [20, 30, 40, 50, 60])
			assert.deepStrictEqual(notSortedArrRecursive([60], u), [10, 20, 30, 40, 50])
		})

		test('handles negative numbers, floats, and extreme finite numbers', () => {
			const universe = [
				Number.MIN_SAFE_INTEGER,
				-100.5,
				-1,
				0,
				Number.MIN_VALUE,
				Number.EPSILON,
				3.14159,
				Number.MAX_SAFE_INTEGER,
			]
			const set = [-100.5, 0, Number.EPSILON, Number.MAX_SAFE_INTEGER]
			assert.deepStrictEqual(notSortedArrRecursive(set, universe), [
				Number.MIN_SAFE_INTEGER,
				-1,
				Number.MIN_VALUE,
				3.14159,
			])
		})
	})

	describe('edge cases', () => {
		test('handles empty arrays', () => {
			assert.deepStrictEqual(notSortedArrRecursive([], []), [])
			assert.deepStrictEqual(notSortedArrRecursive([1, 2, 3], []), [])

			const universe = [1, 2, 3]
			const result = notSortedArrRecursive([], universe)
			assert.deepStrictEqual(result, [1, 2, 3])
			assert.notStrictEqual(result, universe, 'must return a new array instance')
		})

		test('returns empty array when set equals universe or is a superset', () => {
			assert.deepStrictEqual(notSortedArrRecursive([1, 2, 3], [1, 2, 3]), [])
			assert.deepStrictEqual(notSortedArrRecursive([0, 1, 2, 3, 4], [1, 2, 3]), [])
		})

		test('returns copy of universe when set and universe are disjoint', () => {
			assert.deepStrictEqual(notSortedArrRecursive([-5, -2], [1, 2, 3]), [1, 2, 3])
			assert.deepStrictEqual(notSortedArrRecursive([10, 20], [1, 2, 3]), [1, 2, 3])
			assert.deepStrictEqual(notSortedArrRecursive([2, 4, 6], [1, 3, 5, 7]), [1, 3, 5, 7])
		})

		test('handles single-element arrays', () => {
			assert.deepStrictEqual(notSortedArrRecursive([5], [5]), [])
			assert.deepStrictEqual(notSortedArrRecursive([4], [5]), [5])
			assert.deepStrictEqual(notSortedArrRecursive([6], [5]), [5])
			assert.deepStrictEqual(notSortedArrRecursive([], [5]), [5])
			assert.deepStrictEqual(notSortedArrRecursive([5], []), [])
		})

		test('normalizes -0 to +0 and treats -0 equal to 0', () => {
			assert.deepStrictEqual(notSortedArrRecursive([0], [-0, 1]), [1])
			assert.deepStrictEqual(notSortedArrRecursive([-0], [0, 1]), [1])

			const res = notSortedArrRecursive([1], [-0, 1])
			assert.deepStrictEqual(res, [0])
			assert.ok(Object.is(res[0], 0), 'output must not contain -0')
		})

		test('does not mutate input arrays', () => {
			const set = Object.freeze([2, 4])
			const universe = Object.freeze([1, 2, 3, 4, 5])
			assert.deepStrictEqual(notSortedArrRecursive(set, universe), [1, 3, 5])
		})

		test('handles large sorted arrays without stack overflow (O(log n) recursion depth)', () => {
			const n = 25_000
			const universe = Array.from({ length: n }, (_, i) => i)
			const set = Array.from({ length: Math.floor(n / 2) }, (_, i) => i * 2)
			const actual = notSortedArrRecursive(set, universe)
			const expected = iterativeComplementRef(set, universe)
			assert.deepStrictEqual(actual, expected)
			assert.strictEqual(actual.length, n - set.length)
		})
	})

	describe('input validation', () => {
		test('throws TypeError when set or universe is not an array', () => {
			const invalidValues = [null, undefined, 42, '123', {}, new Set([1, 2]), new Int32Array([1])]
			for (const bad of invalidValues) {
				assert.throws(() => notSortedArrRecursive(bad, [1, 2]), TypeError)
				assert.throws(() => notSortedArrRecursive([1, 2], bad), TypeError)
			}
			assert.throws(() => notSortedArrRecursive(), TypeError)
			assert.throws(() => notSortedArrRecursive([1]), TypeError)
		})

		test('throws TypeError on sparse arrays or non-number elements', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3]
			assert.throws(() => notSortedArrRecursive(sparse, [1, 2, 3]), TypeError)
			assert.throws(() => notSortedArrRecursive([1], sparse), TypeError)

			const badArrays = [['1'], [null], [undefined], [true], [{}], [1n], [1, '2', 3]]
			for (const bad of badArrays) {
				assert.throws(() => notSortedArrRecursive(bad, [1, 2, 3]), TypeError)
				assert.throws(() => notSortedArrRecursive([1], bad), TypeError)
			}
		})

		test('throws RangeError on non-finite numeric elements', () => {
			const nonFiniteArrays = [[NaN], [Infinity], [-Infinity], [1, NaN], [-Infinity, 0, 1], [0, Infinity]]
			for (const bad of nonFiniteArrays) {
				assert.throws(() => notSortedArrRecursive(bad, [1, 2, 3]), RangeError)
				assert.throws(() => notSortedArrRecursive([1], bad), RangeError)
			}
		})

		test('throws RangeError on unsorted arrays', () => {
			const unsorted = [
				[2, 1],
				[1, 3, 2],
				[0, -1],
				[-5, -10, 0],
			]
			for (const bad of unsorted) {
				assert.throws(() => notSortedArrRecursive(bad, [1, 2, 3]), RangeError)
				assert.throws(() => notSortedArrRecursive([1], bad), RangeError)
			}
		})

		test('throws RangeError on duplicate elements', () => {
			const duplicates = [
				[1, 1],
				[1, 2, 2, 3],
				[-0, 0],
				[0, -0],
			]
			for (const bad of duplicates) {
				assert.throws(() => notSortedArrRecursive(bad, [1, 2, 3]), RangeError)
				assert.throws(() => notSortedArrRecursive([1], bad), RangeError)
			}
		})
	})

	describe('cross-checks against independent computations and set identities', () => {
		test('matches iterative two-pointer merge and Set filter across deterministic randomized cases', () => {
			const rng = makeRng(0x5eed14)

			for (let trial = 0; trial < 60; trial++) {
				const uSize = Math.floor(rng() * 120)
				const sSize = Math.floor(rng() * 120)

				const uSet = new Set()
				while (uSet.size < uSize) {
					uSet.add(Math.floor((rng() - 0.5) * 300))
				}
				const universe = [...uSet].sort((a, b) => a - b)

				const aSet = new Set()
				while (aSet.size < sSize) {
					aSet.add(Math.floor((rng() - 0.5) * 320))
				}
				const set = [...aSet].sort((a, b) => a - b)

				const actual = notSortedArrRecursive(set, universe)
				const expectedIter = iterativeComplementRef(set, universe)
				const expectedSet = universe.filter((x) => !aSet.has(x))

				assert.deepStrictEqual(actual, expectedIter)
				assert.deepStrictEqual(actual, expectedSet)

				// Verify output is strictly ascending
				for (let k = 1; k < actual.length; k++) {
					assert.ok(actual[k - 1] < actual[k], 'output must be strictly ascending')
				}
			}
		})

		test('satisfies involution, partition, and De Morgan laws', () => {
			const rng = makeRng(0xdec0de)

			for (let trial = 0; trial < 25; trial++) {
				const universe = Array.from({ length: 40 }, (_, i) => i * 2 - 40)
				const a = universe.filter(() => rng() < 0.45)
				const b = universe.filter(() => rng() < 0.45)

				const notA = notSortedArrRecursive(a, universe)
				const notB = notSortedArrRecursive(b, universe)

				// Involution: not(not(A, U), U) === A for A ⊆ U
				assert.deepStrictEqual(notSortedArrRecursive(notA, universe), a)

				// Partition: A ∩ not(A, U) = ∅ and A ∪ not(A, U) = U
				assert.deepStrictEqual(intersectRef(a, notA), [])
				assert.deepStrictEqual(unionRef(a, notA), universe)

				// De Morgan's Law 1: not(A ∪ B, U) === not(A, U) ∩ not(B, U)
				assert.deepStrictEqual(
					notSortedArrRecursive(unionRef(a, b), universe),
					intersectRef(notA, notB),
				)

				// De Morgan's Law 2: not(A ∩ B, U) === not(A, U) ∪ not(B, U)
				assert.deepStrictEqual(
					notSortedArrRecursive(intersectRef(a, b), universe),
					unionRef(notA, notB),
				)
			}

			// General double complement when A is not a subset of U: not(not(A, U), U) === A ∩ U
			const u = [1, 3, 5, 7, 9]
			const aWithExtras = [-2, 1, 2, 5, 8, 9, 12]
			assert.deepStrictEqual(
				notSortedArrRecursive(notSortedArrRecursive(aWithExtras, u), u),
				intersectRef(aWithExtras, u),
			)
		})
	})
})
