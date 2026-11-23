import { describe, test } from 'node:test'
import assert from 'node:assert'
import { setDifferenceSortedArrIterative } from './setDifferenceSortedArrIterative.js'

/**
 * Deterministic PRNG (Mulberry32) for reproducible property-based cross-checks.
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
 * Independent reference implementation of set difference using ES Set.
 * @template T
 * @param {readonly T[]} a
 * @param {readonly T[]} b
 * @returns {T[]}
 */
function referenceSetDifference(a, b) {
	const bSet = new Set(b)
	return a.filter((x) => !bSet.has(x))
}

describe('setDifferenceSortedArrIterative', () => {
	describe('normal cases', () => {
		test('computes difference for partially overlapping numeric arrays', () => {
			assert.deepStrictEqual(
				setDifferenceSortedArrIterative([1, 2, 3, 4, 5], [2, 4, 6]),
				[1, 3, 5]
			)
		})

		test('computes difference for interleaved disjoint arrays', () => {
			assert.deepStrictEqual(
				setDifferenceSortedArrIterative([1, 3, 5, 7], [2, 4, 6, 8]),
				[1, 3, 5, 7]
			)
		})

		test('computes difference when all of a is smaller or larger than b', () => {
			assert.deepStrictEqual(
				setDifferenceSortedArrIterative([1, 2, 3], [10, 20, 30]),
				[1, 2, 3]
			)
			assert.deepStrictEqual(
				setDifferenceSortedArrIterative([10, 20, 30], [1, 2, 3]),
				[10, 20, 30]
			)
		})

		test('returns empty array when both arrays are identical', () => {
			assert.deepStrictEqual(
				setDifferenceSortedArrIterative([1, 2, 3, 4], [1, 2, 3, 4]),
				[]
			)
		})

		test('returns empty array when a is a proper subset of b', () => {
			assert.deepStrictEqual(
				setDifferenceSortedArrIterative([2, 4], [1, 2, 3, 4, 5]),
				[]
			)
		})

		test('removes proper subset b from a', () => {
			assert.deepStrictEqual(
				setDifferenceSortedArrIterative([1, 2, 3, 4, 5], [2, 4]),
				[1, 3, 5]
			)
		})

		test('is asymmetric (a \\ b !== b \\ a)', () => {
			const a = [1, 2, 3]
			const b = [2, 3, 4, 5]
			assert.deepStrictEqual(setDifferenceSortedArrIterative(a, b), [1])
			assert.deepStrictEqual(setDifferenceSortedArrIterative(b, a), [4, 5])
		})

		test('handles negative numbers, floats, and infinities', () => {
			assert.deepStrictEqual(
				setDifferenceSortedArrIterative(
					[-Infinity, -10.5, -1, 0, 2.5, Infinity],
					[-10.5, 0, 3.14, Infinity]
				),
				[-Infinity, -1, 2.5]
			)
		})

		test('handles sorted string arrays with default comparator', () => {
			assert.deepStrictEqual(
				setDifferenceSortedArrIterative(
					['alpha', 'beta', 'delta', 'gamma'],
					['beta', 'epsilon', 'gamma']
				),
				['alpha', 'delta']
			)
		})

		test('handles bigint arrays with default comparator', () => {
			assert.deepStrictEqual(
				setDifferenceSortedArrIterative([1n, 2n, 5n, 10n], [2n, 10n, 20n]),
				[1n, 5n]
			)
		})

		test('supports custom comparator for descending order', () => {
			const desc = (x, y) => y - x
			assert.deepStrictEqual(
				setDifferenceSortedArrIterative([9, 7, 5, 3, 1], [8, 7, 4, 1], desc),
				[9, 5, 3]
			)
		})

		test('supports custom comparator for objects by key', () => {
			const byId = (x, y) => x.id - y.id
			const a = [
				{ id: 1, name: 'a' },
				{ id: 2, name: 'b' },
				{ id: 3, name: 'c' }
			]
			const b = [
				{ id: 2, name: 'other-b' },
				{ id: 4, name: 'd' }
			]
			assert.deepStrictEqual(setDifferenceSortedArrIterative(a, b, byId), [
				{ id: 1, name: 'a' },
				{ id: 3, name: 'c' }
			])
		})
	})

	describe('edge cases', () => {
		test('handles empty arrays', () => {
			assert.deepStrictEqual(setDifferenceSortedArrIterative([], []), [])
			assert.deepStrictEqual(setDifferenceSortedArrIterative([], [1, 2, 3]), [])
			const a = [1, 2, 3]
			const diff = setDifferenceSortedArrIterative(a, [])
			assert.deepStrictEqual(diff, [1, 2, 3])
			assert.notStrictEqual(diff, a)
		})

		test('handles single-element arrays', () => {
			assert.deepStrictEqual(setDifferenceSortedArrIterative([5], [5]), [])
			assert.deepStrictEqual(setDifferenceSortedArrIterative([5], [3]), [5])
			assert.deepStrictEqual(setDifferenceSortedArrIterative([5], [8]), [5])
		})

		test('handles boundary matches (first only, last only, all except endpoints)', () => {
			assert.deepStrictEqual(
				setDifferenceSortedArrIterative([1, 2, 3, 4], [1]),
				[2, 3, 4]
			)
			assert.deepStrictEqual(
				setDifferenceSortedArrIterative([1, 2, 3, 4], [4]),
				[1, 2, 3]
			)
			assert.deepStrictEqual(
				setDifferenceSortedArrIterative([1, 2, 3, 4], [2, 3]),
				[1, 4]
			)
		})

		test('treats -0 and +0 as equal', () => {
			assert.deepStrictEqual(
				setDifferenceSortedArrIterative([-0, 1], [0]),
				[1]
			)
		})

		test('does not mutate input arrays and works with frozen arrays', () => {
			const a = Object.freeze([1, 2, 3, 4])
			const b = Object.freeze([2, 4, 6])
			const result = setDifferenceSortedArrIterative(a, b)
			assert.deepStrictEqual(result, [1, 3])
			assert.deepStrictEqual(a, [1, 2, 3, 4])
			assert.deepStrictEqual(b, [2, 4, 6])
		})
	})

	describe('input validation', () => {
		test('throws TypeError for non-array arguments', () => {
			for (const bad of [null, undefined, 42, 'abc', {}, new Set([1, 2])]) {
				assert.throws(
					() => setDifferenceSortedArrIterative(bad, [1, 2]),
					TypeError
				)
				assert.throws(
					() => setDifferenceSortedArrIterative([1, 2], bad),
					TypeError
				)
			}
		})

		test('throws TypeError for non-function comparator', () => {
			for (const badCmp of [null, 123, 'asc', {}, []]) {
				assert.throws(
					() => setDifferenceSortedArrIterative([1, 2], [2, 3], badCmp),
					TypeError
				)
			}
		})

		test('throws RangeError for unsorted arrays even when the other array is empty', () => {
			assert.throws(
				() => setDifferenceSortedArrIterative([3, 1, 2], []),
				RangeError
			)
			assert.throws(
				() => setDifferenceSortedArrIterative([], [2, 1]),
				RangeError
			)
			assert.throws(
				() => setDifferenceSortedArrIterative([1, 3, 2], [1, 2]),
				RangeError
			)
		})

		test('throws RangeError for arrays containing duplicates', () => {
			assert.throws(
				() => setDifferenceSortedArrIterative([1, 2, 2, 3], []),
				RangeError
			)
			assert.throws(
				() => setDifferenceSortedArrIterative([], [5, 5]),
				RangeError
			)
			assert.throws(
				() => setDifferenceSortedArrIterative([1, 2], [2, 2, 3]),
				RangeError
			)
		})

		test('throws TypeError for NaN elements under default comparator', () => {
			assert.throws(
				() => setDifferenceSortedArrIterative([NaN], []),
				TypeError
			)
			assert.throws(
				() => setDifferenceSortedArrIterative([], [NaN]),
				TypeError
			)
			assert.throws(
				() => setDifferenceSortedArrIterative([1, NaN], [1]),
				TypeError
			)
		})

		test('throws TypeError for sparse arrays', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3]
			assert.throws(
				() => setDifferenceSortedArrIterative(sparse, [1]),
				TypeError
			)
			assert.throws(
				() => setDifferenceSortedArrIterative([1], sparse),
				TypeError
			)
		})

		test('throws TypeError for mixed incomparable types under default comparator', () => {
			assert.throws(
				() => setDifferenceSortedArrIterative([1, 2], ['1', '2']),
				TypeError
			)
			assert.throws(
				() => setDifferenceSortedArrIterative([1, '2'], [1]),
				TypeError
			)
		})

		test('throws TypeError if custom comparator returns NaN or non-number', () => {
			assert.throws(
				() => setDifferenceSortedArrIterative([1, 2], [2, 3], () => NaN),
				TypeError
			)
			assert.throws(
				() => setDifferenceSortedArrIterative([1, 2], [2, 3], () => '0'),
				TypeError
			)
		})

		test('throws RangeError if custom comparator violates reflexivity', () => {
			assert.throws(
				() => setDifferenceSortedArrIterative([1], [2], () => -1),
				RangeError
			)
		})
	})

	describe('independent cross-checks', () => {
		test('matches ES Set reference across 200 randomized sorted de-duplicated inputs and satisfies set identities', () => {
			const rand = createRng(0x5eed1234)

			for (let trial = 0; trial < 200; trial += 1) {
				const universeSize = 1 + Math.floor(rand() * 40)
				const a = []
				const b = []
				const pA = rand()
				const pB = rand()

				for (let v = -20; v < -20 + universeSize; v += 1) {
					if (rand() < pA) a.push(v)
					if (rand() < pB) b.push(v)
				}

				const actual = setDifferenceSortedArrIterative(a, b)
				const expected = referenceSetDifference(a, b)

				assert.deepStrictEqual(actual, expected)

				// Strictly increasing output invariant
				for (let k = 1; k < actual.length; k += 1) {
					assert.ok(actual[k - 1] < actual[k])
				}

				// Set algebra identities: (A \ B) is disjoint from B and |A \ B| + |A ∩ B| === |A|
				const bSet = new Set(b)
				for (const item of actual) {
					assert.strictEqual(bSet.has(item), false)
				}
				const intersectionSize = a.filter((x) => bSet.has(x)).length
				assert.strictEqual(actual.length + intersectionSize, a.length)
			}
		})

		test('matches ES Set reference on large arrays (10,000 elements)', () => {
			const a = []
			const b = []
			for (let i = 0; i < 10000; i += 1) {
				a.push(i * 2) // even numbers 0..19998
				b.push(i * 3) // multiples of 3: 0..29997
			}
			const actual = setDifferenceSortedArrIterative(a, b)
			const expected = referenceSetDifference(a, b)
			assert.deepStrictEqual(actual, expected)
			// Every element of a divisible by 6 is removed; 10000 - ceil(10000/3) = 6666
			assert.strictEqual(actual.length, 6666)
		})
	})
})
