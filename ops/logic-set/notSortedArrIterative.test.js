import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { notSortedArrIterative } from './notSortedArrIterative.js'

/**
 * Independent reference implementation of set complement using Set.
 *
 * @template T
 * @param {readonly T[]} universe
 * @param {readonly T[]} excluded
 * @returns {T[]}
 */
function referenceComplement(universe, excluded) {
	const excludedSet = new Set(excluded)
	return universe.filter((item) => !excludedSet.has(item))
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property-based cross-checks.
 *
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
 *
 * @param {() => number} rng
 * @param {number} maxLen
 * @param {number} minVal
 * @param {number} maxVal
 * @returns {number[]}
 */
function randomSortedUniqueInts(rng, maxLen, minVal, maxVal) {
	const targetLen = Math.floor(rng() * (maxLen + 1))
	const set = new Set()
	const span = maxVal - minVal + 1
	for (let k = 0; k < targetLen; k += 1) {
		set.add(minVal + Math.floor(rng() * span))
	}
	return Array.from(set).sort((a, b) => a - b)
}

describe('notSortedArrIterative', () => {
	describe('normal cases', () => {
		test('computes complement of a typical numeric subset', () => {
			assert.deepEqual(
				notSortedArrIterative([1, 2, 3, 4, 5], [2, 4]),
				[1, 3, 5],
			)
		})

		test('returns all universe elements when sets are disjoint', () => {
			assert.deepEqual(
				notSortedArrIterative([1, 3, 5], [2, 4, 6]),
				[1, 3, 5],
			)
			assert.deepEqual(
				notSortedArrIterative([1, 2, 3], [10, 20, 30]),
				[1, 2, 3],
			)
			assert.deepEqual(
				notSortedArrIterative([10, 20, 30], [1, 2, 3]),
				[10, 20, 30],
			)
		})

		test('returns empty array when excluded equals universe', () => {
			assert.deepEqual(
				notSortedArrIterative([1, 2, 3, 4], [1, 2, 3, 4]),
				[],
			)
		})

		test('ignores elements in excluded that are not in universe', () => {
			assert.deepEqual(
				notSortedArrIterative([2, 4, 6], [1, 2, 3, 4, 5, 7, 8]),
				[6],
			)
		})

		test('handles negative numbers, floats, and infinities', () => {
			assert.deepEqual(
				notSortedArrIterative(
					[-Infinity, -10.5, -1, 0, 1.5, 42, Infinity],
					[-Infinity, -1, 1.5, 99],
				),
				[-10.5, 0, 42, Infinity],
			)
		})

		test('handles strings, bigints, and booleans with default comparator', () => {
			assert.deepEqual(
				notSortedArrIterative(
					['apple', 'banana', 'cherry', 'date'],
					['banana', 'date', 'elderberry'],
				),
				['apple', 'cherry'],
			)

			assert.deepEqual(
				notSortedArrIterative([1n, 2n, 3n, 10n], [2n, 10n]),
				[1n, 3n],
			)

			assert.deepEqual(notSortedArrIterative([false, true], [false]), [true])
		})

		test('supports custom comparators for objects and custom sort orders', () => {
			const byId = (a, b) => a.id - b.id
			const universe = [
				{ id: 1, label: 'a' },
				{ id: 2, label: 'b' },
				{ id: 3, label: 'c' },
			]
			const excluded = [{ id: 2, label: 'ignored-label' }, { id: 4, label: 'd' }]
			assert.deepEqual(notSortedArrIterative(universe, excluded, byId), [
				{ id: 1, label: 'a' },
				{ id: 3, label: 'c' },
			])

			// Descending comparator
			const desc = (a, b) => b - a
			assert.deepEqual(
				notSortedArrIterative([9, 7, 5, 3, 1], [7, 3, 0], desc),
				[9, 5, 1],
			)

			// Case-insensitive string comparator
			const ci = (a, b) => a.toLowerCase().localeCompare(b.toLowerCase())
			assert.deepEqual(
				notSortedArrIterative(['Alpha', 'beta', 'Gamma'], ['BETA', 'delta'], ci),
				['Alpha', 'Gamma'],
			)
		})
	})

	describe('edge cases', () => {
		test('handles empty arrays', () => {
			assert.deepEqual(notSortedArrIterative([], []), [])
			assert.deepEqual(notSortedArrIterative([], [1, 2, 3]), [])
			assert.deepEqual(notSortedArrIterative([1, 2, 3], []), [1, 2, 3])
		})

		test('does not mutate inputs and returns a fresh array copy', () => {
			const universe = [1, 2, 3]
			const excluded = []
			const out = notSortedArrIterative(universe, excluded)

			assert.deepEqual(out, [1, 2, 3])
			assert.notEqual(out, universe)
			out.push(4)
			assert.deepEqual(universe, [1, 2, 3])
			assert.deepEqual(excluded, [])
		})

		test('handles single-element arrays', () => {
			assert.deepEqual(notSortedArrIterative([5], [5]), [])
			assert.deepEqual(notSortedArrIterative([5], [3]), [5])
			assert.deepEqual(notSortedArrIterative([5], [7]), [5])
		})

		test('handles prefix, suffix, and boundary exclusions', () => {
			assert.deepEqual(
				notSortedArrIterative([1, 2, 3, 4, 5], [1, 2]),
				[3, 4, 5],
			)
			assert.deepEqual(
				notSortedArrIterative([1, 2, 3, 4, 5], [4, 5]),
				[1, 2, 3],
			)
			assert.deepEqual(
				notSortedArrIterative([1, 2, 3, 4, 5], [1, 5]),
				[2, 3, 4],
			)
		})

		test('handles large arrays iteratively without stack issues', () => {
			const n = 20000
			const universe = Array.from({ length: n }, (_, idx) => idx)
			const excluded = Array.from({ length: n / 2 }, (_, idx) => idx * 2)
			const expected = Array.from({ length: n / 2 }, (_, idx) => idx * 2 + 1)

			assert.deepEqual(notSortedArrIterative(universe, excluded), expected)
		})
	})

	describe('input validation', () => {
		test('throws TypeError for non-array universe or excluded', () => {
			for (const bad of [null, undefined, 42, 'abc', {}, new Set([1])]) {
				assert.throws(() => notSortedArrIterative(bad, [1]), TypeError)
				assert.throws(() => notSortedArrIterative([1], bad), TypeError)
			}
		})

		test('throws TypeError for non-function compare', () => {
			for (const bad of [null, 123, 'asc', {}, []]) {
				assert.throws(() => notSortedArrIterative([1], [1], bad), TypeError)
			}
		})

		test('throws RangeError for unsorted arrays', () => {
			assert.throws(() => notSortedArrIterative([3, 1, 2], [1]), RangeError)
			assert.throws(() => notSortedArrIterative([1, 2, 3], [2, 1]), RangeError)
			// Must validate excluded even when universe is empty
			assert.throws(() => notSortedArrIterative([], [2, 1]), RangeError)
		})

		test('throws RangeError for duplicate elements', () => {
			assert.throws(() => notSortedArrIterative([1, 2, 2, 3], []), RangeError)
			assert.throws(() => notSortedArrIterative([1, 2, 3], [2, 2]), RangeError)
			assert.throws(() => notSortedArrIterative([-0, 0], []), RangeError)
		})

		test('throws TypeError for sparse arrays', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3]
			assert.throws(() => notSortedArrIterative(sparse, [1]), TypeError)
			assert.throws(() => notSortedArrIterative([1, 2, 3], sparse), TypeError)
			const leadingHole = new Array(2)
			leadingHole[1] = 1
			assert.throws(() => notSortedArrIterative(leadingHole, []), TypeError)
		})

		test('throws for NaN, unsupported types, or mixed types with default comparator', () => {
			assert.throws(() => notSortedArrIterative([NaN], []), RangeError)
			assert.throws(() => notSortedArrIterative([1, NaN], []), RangeError)
			assert.throws(() => notSortedArrIterative([1], [NaN]), RangeError)
			assert.throws(() => notSortedArrIterative([{}], []), TypeError)
			assert.throws(() => notSortedArrIterative([1, 2], ['a', 'b']), TypeError)
			assert.throws(() => notSortedArrIterative([1, '2'], []), TypeError)
		})

		test('throws for misbehaving custom comparators', () => {
			assert.throws(
				() => notSortedArrIterative([1, 2], [1], () => NaN),
				TypeError,
			)
			assert.throws(
				() => notSortedArrIterative([1, 2], [1], () => '0'),
				TypeError,
			)
			assert.throws(
				() => notSortedArrIterative([1], [], () => 1),
				RangeError,
			)
		})
	})

	describe('independent cross-checks', () => {
		test('matches Set-based reference implementation across 250 randomized cases', () => {
			const rng = createRng(20261123)

			for (let trial = 0; trial < 250; trial += 1) {
				const universe = randomSortedUniqueInts(rng, 40, -30, 30)
				const excluded = randomSortedUniqueInts(rng, 40, -35, 35)

				const actual = notSortedArrIterative(universe, excluded)
				const expected = referenceComplement(universe, excluded)

				assert.deepEqual(actual, expected)

				// Output invariant: strictly ascending and de-duplicated
				for (let i = 1; i < actual.length; i += 1) {
					assert.ok(actual[i - 1] < actual[i])
				}
			}
		})

		test('satisfies set-algebraic laws (double complement, partition, De Morgan)', () => {
			const rng = createRng(987654321)

			for (let trial = 0; trial < 50; trial += 1) {
				const u = randomSortedUniqueInts(rng, 30, -20, 20)
				const a = randomSortedUniqueInts(rng, 25, -25, 25)
				const b = randomSortedUniqueInts(rng, 25, -25, 25)

				const notA = notSortedArrIterative(u, a)
				const notNotA = notSortedArrIterative(u, notA)

				// Double complement: U \ (U \ A) === U ∩ A
				const aSet = new Set(a)
				const uIntersectA = u.filter((x) => aSet.has(x))
				assert.deepEqual(notNotA, uIntersectA)

				// Partition property: |U \ A| + |U ∩ A| === |U|
				assert.equal(notA.length + uIntersectA.length, u.length)

				// De Morgan's law: U \ (A ∪ B) === (U \ A) ∩ (U \ B)
				const aUnionB = Array.from(new Set([...a, ...b])).sort((x, y) => x - y)
				const notBSet = new Set(notSortedArrIterative(u, b))
				const notAIntersectNotB = notA.filter((x) => notBSet.has(x))
				assert.deepEqual(notSortedArrIterative(u, aUnionB), notAIntersectNotB)
			}
		})
	})
})
