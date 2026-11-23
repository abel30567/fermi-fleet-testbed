import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { unionSortedArrIterative } from './unionSortedArrIterative.js'

/**
 * Independent reference implementation using Set + Array.prototype.sort.
 *
 * @template T
 * @param {readonly T[]} a
 * @param {readonly T[]} b
 * @param {(x: T, y: T) => number} [compare]
 * @returns {T[]}
 */
function referenceUnionNumbers(a, b) {
	return [...new Set([...a, ...b])].sort((x, y) => x - y)
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property-based cross-checks.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function mulberry32(seed) {
	let s = seed >>> 0
	return () => {
		s = (s + 0x6d2b79f5) >>> 0
		let t = Math.imul(s ^ (s >>> 15), 1 | s)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

describe('unionSortedArrIterative', () => {
	describe('normal cases', () => {
		it('merges overlapping sorted integer arrays without duplicates', () => {
			assert.deepEqual(
				unionSortedArrIterative([1, 3, 5, 7], [2, 3, 6, 7, 8]),
				[1, 2, 3, 5, 6, 7, 8]
			)
		})

		it('merges disjoint arrays in both orders', () => {
			assert.deepEqual(
				unionSortedArrIterative([1, 2, 3], [10, 20, 30]),
				[1, 2, 3, 10, 20, 30]
			)
			assert.deepEqual(
				unionSortedArrIterative([10, 20, 30], [1, 2, 3]),
				[1, 2, 3, 10, 20, 30]
			)
		})

		it('merges interleaved arrays', () => {
			assert.deepEqual(
				unionSortedArrIterative([0, 2, 4, 6, 8], [1, 3, 5, 7, 9]),
				[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
			)
		})

		it('handles negative numbers, floats, and infinities', () => {
			assert.deepEqual(
				unionSortedArrIterative(
					[-Infinity, -10.5, -1, 0, 2.5],
					[-10.5, -0.5, 2.5, 100, Infinity]
				),
				[-Infinity, -10.5, -1, -0.5, 0, 2.5, 100, Infinity]
			)
		})

		it('handles sorted string arrays', () => {
			assert.deepEqual(
				unionSortedArrIterative(['apple', 'cherry', 'fig'], ['banana', 'cherry', 'grape']),
				['apple', 'banana', 'cherry', 'fig', 'grape']
			)
		})

		it('handles sorted BigInt arrays', () => {
			assert.deepEqual(
				unionSortedArrIterative([-5n, 0n, 10n], [0n, 3n, 999999999999999999999n]),
				[-5n, 0n, 3n, 10n, 999999999999999999999n]
			)
		})

		it('supports custom comparators and keeps left element on tie', () => {
			const byId = (x, y) => x.id - y.id
			const left = [
				{ id: 1, src: 'a' },
				{ id: 3, src: 'a' },
			]
			const right = [
				{ id: 2, src: 'b' },
				{ id: 3, src: 'b' },
				{ id: 4, src: 'b' },
			]
			assert.deepEqual(unionSortedArrIterative(left, right, byId), [
				{ id: 1, src: 'a' },
				{ id: 2, src: 'b' },
				{ id: 3, src: 'a' },
				{ id: 4, src: 'b' },
			])
		})

		it('supports descending order with a custom comparator', () => {
			const desc = (x, y) => y - x
			assert.deepEqual(
				unionSortedArrIterative([9, 5, 1], [8, 5, 2], desc),
				[9, 8, 5, 2, 1]
			)
		})
	})

	describe('edge cases', () => {
		it('handles both arrays empty', () => {
			assert.deepEqual(unionSortedArrIterative([], []), [])
		})

		it('handles one empty array and returns a new array instance', () => {
			const arr = [1, 2, 3]
			const resLeft = unionSortedArrIterative([], arr)
			const resRight = unionSortedArrIterative(arr, [])

			assert.deepEqual(resLeft, [1, 2, 3])
			assert.notEqual(resLeft, arr)
			assert.deepEqual(resRight, [1, 2, 3])
			assert.notEqual(resRight, arr)
		})

		it('handles identical arrays', () => {
			assert.deepEqual(unionSortedArrIterative([1, 2, 3], [1, 2, 3]), [1, 2, 3])
		})

		it('handles single-element arrays', () => {
			assert.deepEqual(unionSortedArrIterative([5], [5]), [5])
			assert.deepEqual(unionSortedArrIterative([2], [5]), [2, 5])
			assert.deepEqual(unionSortedArrIterative([5], [2]), [2, 5])
		})

		it('handles subset relationships and unbalanced sizes', () => {
			const large = Array.from({ length: 1000 }, (_, i) => i * 2)
			assert.deepEqual(unionSortedArrIterative([500], large), large)
			assert.deepEqual(unionSortedArrIterative(large, [501]).length, 1001)
		})

		it('does not mutate frozen input arrays', () => {
			const a = Object.freeze([1, 4, 7])
			const b = Object.freeze([2, 4, 8])
			assert.deepEqual(unionSortedArrIterative(a, b), [1, 2, 4, 7, 8])
		})
	})

	describe('input validation', () => {
		it('throws TypeError when a or b is not an array', () => {
			for (const bad of [null, undefined, 42, '123', {}, new Set([1, 2])]) {
				assert.throws(() => unionSortedArrIterative(bad, [1, 2]), TypeError)
				assert.throws(() => unionSortedArrIterative([1, 2], bad), TypeError)
			}
		})

		it('throws TypeError when compare is provided and not a function', () => {
			for (const bad of [null, 123, 'asc', {}]) {
				assert.throws(() => unionSortedArrIterative([1], [2], bad), TypeError)
			}
		})

		it('throws TypeError on sparse arrays', () => {
			const sparse = [1, , 3] // eslint-disable-line no-sparse-arrays
			assert.throws(() => unionSortedArrIterative(sparse, [2]), TypeError)
			assert.throws(() => unionSortedArrIterative([2], sparse), TypeError)
		})

		it('throws RangeError when inputs are unsorted', () => {
			assert.throws(() => unionSortedArrIterative([3, 1, 2], [4]), RangeError)
			assert.throws(() => unionSortedArrIterative([1], [5, 4]), RangeError)
			// Unsorted in the trailing tail of the longer array
			assert.throws(() => unionSortedArrIterative([1], [2, 3, 5, 4]), RangeError)
		})

		it('throws RangeError when inputs contain duplicates', () => {
			assert.throws(() => unionSortedArrIterative([1, 2, 2, 3], [4]), RangeError)
			assert.throws(() => unionSortedArrIterative([1], [2, 3, 3]), RangeError)
		})

		it('throws RangeError on NaN elements with default comparator', () => {
			assert.throws(() => unionSortedArrIterative([NaN], [1]), RangeError)
			assert.throws(() => unionSortedArrIterative([1, NaN], [2]), RangeError)
			assert.throws(() => unionSortedArrIterative([1], [NaN]), RangeError)
		})

		it('throws TypeError on incomparable values or invalid comparator return', () => {
			assert.throws(() => unionSortedArrIterative([undefined], [1]), TypeError)
			assert.throws(() => unionSortedArrIterative([1], ['a']), TypeError)
			assert.throws(() => unionSortedArrIterative([1], [2], () => NaN), TypeError)
			assert.throws(() => unionSortedArrIterative([1], [2], () => '0'), TypeError)
		})
	})

	describe('independent cross-checks & algebraic properties', () => {
		it('matches Set+sort reference across 200 seeded random pairs', () => {
			const rand = mulberry32(0xc0ffee)

			const genSortedUnique = () => {
				const len = Math.floor(rand() * 40)
				const s = new Set()
				for (let k = 0; k < len; k++) {
					s.add(Math.floor(rand() * 80) - 40)
				}
				return [...s].sort((x, y) => x - y)
			}

			for (let trial = 0; trial < 200; trial++) {
				const a = genSortedUnique()
				const b = genSortedUnique()
				const actual = unionSortedArrIterative(a, b)
				const expected = referenceUnionNumbers(a, b)

				assert.deepEqual(actual, expected)

				// Strictly ascending invariant
				for (let k = 1; k < actual.length; k++) {
					assert.ok(actual[k - 1] < actual[k])
				}
			}
		})

		it('satisfies commutativity, idempotence, identity, and associativity', () => {
			const a = [-5, 0, 2, 4, 9]
			const b = [-3, 0, 3, 4, 12]
			const c = [-5, 1, 3, 7, 12]

			// Commutativity: A ∪ B = B ∪ A
			assert.deepEqual(
				unionSortedArrIterative(a, b),
				unionSortedArrIterative(b, a)
			)

			// Idempotence: A ∪ A = A
			assert.deepEqual(unionSortedArrIterative(a, a), a)

			// Identity: A ∪ ∅ = A
			assert.deepEqual(unionSortedArrIterative(a, []), a)
			assert.deepEqual(unionSortedArrIterative([], a), a)

			// Associativity: (A ∪ B) ∪ C = A ∪ (B ∪ C)
			assert.deepEqual(
				unionSortedArrIterative(unionSortedArrIterative(a, b), c),
				unionSortedArrIterative(a, unionSortedArrIterative(b, c))
			)
		})
	})
})
