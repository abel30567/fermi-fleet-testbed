import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { orSortedArrIterative } from './orSortedArrIterative.js'

/**
 * Independent Set-based reference implementation for cross-checking.
 *
 * @template T
 * @param {readonly T[]} a
 * @param {readonly T[]} b
 * @param {(x: T, y: T) => number} [cmp]
 * @returns {T[]}
 */
function referenceUnion(a, b, cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0)) {
	return [...new Set([...a, ...b])].sort(cmp)
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible fuzz/property tests.
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
 * Generates a sorted, de-duplicated array of integers using the provided RNG.
 *
 * @param {() => number} rng
 * @param {number} maxLen
 * @param {number} minVal
 * @param {number} maxVal
 * @returns {number[]}
 */
function randomSortedSet(rng, maxLen, minVal, maxVal) {
	const count = Math.floor(rng() * (maxLen + 1))
	const set = new Set()
	const span = maxVal - minVal + 1
	for (let i = 0; i < count; i += 1) {
		set.add(minVal + Math.floor(rng() * span))
	}
	return [...set].sort((x, y) => x - y)
}

describe('orSortedArrIterative', () => {
	describe('normal cases', () => {
		test('merges disjoint sorted numeric arrays', () => {
			assert.deepEqual(orSortedArrIterative([1, 3, 5], [2, 4, 6]), [1, 2, 3, 4, 5, 6])
			assert.deepEqual(orSortedArrIterative([1, 2, 3], [10, 20, 30]), [1, 2, 3, 10, 20, 30])
			assert.deepEqual(orSortedArrIterative([10, 20, 30], [1, 2, 3]), [1, 2, 3, 10, 20, 30])
		})

		test('merges overlapping sorted numeric arrays without duplicates', () => {
			assert.deepEqual(orSortedArrIterative([1, 2, 3, 5], [2, 3, 4, 6]), [1, 2, 3, 4, 5, 6])
			assert.deepEqual(orSortedArrIterative([1, 2, 3], [1, 2, 3]), [1, 2, 3])
		})

		test('handles negative numbers, floats, and infinities', () => {
			assert.deepEqual(
				orSortedArrIterative([-Infinity, -10.5, -1, 0, 2.5], [-20, -1, 0.5, 2.5, Infinity]),
				[-Infinity, -20, -10.5, -1, 0, 0.5, 2.5, Infinity],
			)
		})

		test('merges sorted string arrays lexicographically', () => {
			assert.deepEqual(
				orSortedArrIterative(['apple', 'cherry', 'fig'], ['banana', 'cherry', 'date']),
				['apple', 'banana', 'cherry', 'date', 'fig'],
			)
		})

		test('merges sorted bigint arrays', () => {
			assert.deepEqual(
				orSortedArrIterative([-5n, 0n, 10n], [-5n, 2n, 100n]),
				[-5n, 0n, 2n, 10n, 100n],
			)
		})

		test('supports custom comparator for objects and prefers element from first array on equality', () => {
			const a = [
				{ id: 1, src: 'a' },
				{ id: 3, src: 'a' },
			]
			const b = [
				{ id: 2, src: 'b' },
				{ id: 3, src: 'b' },
				{ id: 4, src: 'b' },
			]
			const result = orSortedArrIterative(a, b, (x, y) => x.id - y.id)
			assert.deepEqual(result, [
				{ id: 1, src: 'a' },
				{ id: 2, src: 'b' },
				{ id: 3, src: 'a' },
				{ id: 4, src: 'b' },
			])
		})

		test('supports custom descending comparator', () => {
			const desc = (x, y) => y - x
			assert.deepEqual(orSortedArrIterative([9, 5, 1], [8, 5, 2], desc), [9, 8, 5, 2, 1])
		})
	})

	describe('edge cases', () => {
		test('handles empty arrays and returns a fresh array copy', () => {
			assert.deepEqual(orSortedArrIterative([], []), [])

			const a = [1, 2, 3]
			const resLeft = orSortedArrIterative(a, [])
			assert.deepEqual(resLeft, [1, 2, 3])
			assert.notEqual(resLeft, a)

			const b = [4, 5, 6]
			const resRight = orSortedArrIterative([], b)
			assert.deepEqual(resRight, [4, 5, 6])
			assert.notEqual(resRight, b)
		})

		test('handles single-element arrays', () => {
			assert.deepEqual(orSortedArrIterative([1], [1]), [1])
			assert.deepEqual(orSortedArrIterative([1], [2]), [1, 2])
			assert.deepEqual(orSortedArrIterative([2], [1]), [1, 2])
		})

		test('handles highly unbalanced array lengths', () => {
			const big = Array.from({ length: 1000 }, (_, i) => i * 2)
			const small = [500, 501]
			const result = orSortedArrIterative(big, small)
			assert.equal(result.length, 1001)
			assert.equal(result[250], 500)
			assert.equal(result[251], 501)
		})

		test('does not mutate input arrays', () => {
			const a = [1, 3, 5]
			const b = [2, 3, 4]
			const aSnap = [...a]
			const bSnap = [...b]
			orSortedArrIterative(a, b)
			assert.deepEqual(a, aSnap)
			assert.deepEqual(b, bSnap)
		})
	})

	describe('input validation', () => {
		test('throws TypeError for non-array inputs', () => {
			assert.throws(() => orSortedArrIterative(null, []), TypeError)
			assert.throws(() => orSortedArrIterative([], undefined), TypeError)
			assert.throws(() => orSortedArrIterative('123', []), TypeError)
			assert.throws(() => orSortedArrIterative([], new Set([1, 2])), TypeError)
			assert.throws(() => orSortedArrIterative({}, []), TypeError)
			assert.throws(() => orSortedArrIterative(42, [1]), TypeError)
		})

		test('throws TypeError for invalid comparator argument', () => {
			assert.throws(() => orSortedArrIterative([1], [2], 'asc'), TypeError)
			assert.throws(() => orSortedArrIterative([1], [2], null), TypeError)
			assert.throws(() => orSortedArrIterative([1], [2], 123), TypeError)
		})

		test('throws RangeError for unsorted arrays', () => {
			assert.throws(() => orSortedArrIterative([2, 1], []), RangeError)
			assert.throws(() => orSortedArrIterative([], [1, 3, 2]), RangeError)
			assert.throws(() => orSortedArrIterative([1, 2, 0], [3, 4]), RangeError)
		})

		test('throws RangeError for arrays containing duplicates', () => {
			assert.throws(() => orSortedArrIterative([1, 1], []), RangeError)
			assert.throws(() => orSortedArrIterative([], [1, 2, 2, 3]), RangeError)
			assert.throws(() => orSortedArrIterative([0, -0], []), RangeError)
		})

		test('throws RangeError for NaN elements under default comparator', () => {
			assert.throws(() => orSortedArrIterative([NaN], []), RangeError)
			assert.throws(() => orSortedArrIterative([], [1, NaN]), RangeError)
		})

		test('throws TypeError for unsupported or mixed types under default comparator', () => {
			assert.throws(() => orSortedArrIterative([null], []), TypeError)
			assert.throws(() => orSortedArrIterative([undefined], []), TypeError)
			assert.throws(() => orSortedArrIterative([{}], []), TypeError)
			assert.throws(() => orSortedArrIterative([1, '2'], []), TypeError)
			assert.throws(() => orSortedArrIterative([1, 2], ['3', '4']), TypeError)
			assert.throws(() => orSortedArrIterative([1], [2n]), TypeError)
		})

		test('throws TypeError for sparse arrays', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3]
			assert.throws(() => orSortedArrIterative(sparse, []), TypeError)
			assert.throws(() => orSortedArrIterative([], new Array(2)), TypeError)
		})

		test('throws TypeError when custom comparator returns NaN or non-number', () => {
			assert.throws(() => orSortedArrIterative([1, 2], [3], () => NaN), TypeError)
			assert.throws(() => orSortedArrIterative([1], [2], () => '0'), TypeError)
		})
	})

	describe('independent cross-checks and algebraic properties', () => {
		test('matches Set-based reference union across 200 pseudo-random cases', () => {
			const rng = createRng(0x5eed1234)
			for (let trial = 0; trial < 200; trial += 1) {
				const a = randomSortedSet(rng, 40, -50, 50)
				const b = randomSortedSet(rng, 40, -50, 50)
				const actual = orSortedArrIterative(a, b)
				const expected = referenceUnion(a, b)
				assert.deepEqual(actual, expected)

				// Verify strict ascending invariant on result
				for (let k = 1; k < actual.length; k += 1) {
					assert.ok(actual[k - 1] < actual[k])
				}
			}
		})

		test('satisfies set-union algebraic laws (commutativity, associativity, idempotence, identity)', () => {
			const rng = createRng(0xabcddcba)
			for (let trial = 0; trial < 50; trial += 1) {
				const a = randomSortedSet(rng, 25, -30, 30)
				const b = randomSortedSet(rng, 25, -30, 30)
				const c = randomSortedSet(rng, 25, -30, 30)

				// Commutativity: A ∪ B = B ∪ A
				assert.deepEqual(orSortedArrIterative(a, b), orSortedArrIterative(b, a))

				// Associativity: (A ∪ B) ∪ C = A ∪ (B ∪ C)
				assert.deepEqual(
					orSortedArrIterative(orSortedArrIterative(a, b), c),
					orSortedArrIterative(a, orSortedArrIterative(b, c)),
				)

				// Idempotence: A ∪ A = A
				assert.deepEqual(orSortedArrIterative(a, a), a)

				// Identity: A ∪ ∅ = A
				assert.deepEqual(orSortedArrIterative(a, []), a)
				assert.deepEqual(orSortedArrIterative([], a), a)
			}
		})
	})
})
