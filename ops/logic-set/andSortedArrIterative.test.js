import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { andSortedArrIterative } from './andSortedArrIterative.js'

/**
 * Independent naive Set-based reference implementation for cross-checking.
 *
 * @template T
 * @param {readonly T[]} a
 * @param {readonly T[]} b
 * @returns {T[]}
 */
function naiveSetIntersection(a, b) {
	const setB = new Set(b)
	return a.filter((x) => setB.has(x))
}

/**
 * Deterministic linear congruential generator for reproducible tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

/**
 * Generates a sorted, de-duplicated array of integers in [min, max].
 *
 * @param {() => number} rand
 * @param {number} maxLen
 * @param {number} min
 * @param {number} max
 * @returns {number[]}
 */
function randomSortedUniqueInts(rand, maxLen, min, max) {
	const targetLen = Math.floor(rand() * (maxLen + 1))
	const set = new Set()
	const span = max - min + 1
	for (let i = 0; i < targetLen; i += 1) {
		set.add(min + Math.floor(rand() * span))
	}
	return [...set].sort((x, y) => x - y)
}

describe('andSortedArrIterative', () => {
	describe('normal cases', () => {
		it('computes intersection of overlapping sorted number arrays', () => {
			assert.deepStrictEqual(andSortedArrIterative([1, 2, 4, 6, 8], [2, 3, 4, 7, 8, 9]), [2, 4, 8])
			assert.deepStrictEqual(andSortedArrIterative([-10, -5, 0, 3.5, 7], [-5, -1, 3.5, 10]), [-5, 3.5])
		})

		it('returns empty array for disjoint sorted arrays', () => {
			assert.deepStrictEqual(andSortedArrIterative([1, 3, 5, 7], [2, 4, 6, 8]), [])
			assert.deepStrictEqual(andSortedArrIterative([-10, -5, -1], [0, 1, 5, 10]), [])
		})

		it('returns copy of array when both inputs are identical', () => {
			const input = [1, 2, 3, 5, 8]
			const result = andSortedArrIterative(input, [...input])
			assert.deepStrictEqual(result, input)
			assert.notStrictEqual(result, input)
		})

		it('handles strict subset / superset relationships', () => {
			assert.deepStrictEqual(andSortedArrIterative([2, 4, 6], [1, 2, 3, 4, 5, 6, 7]), [2, 4, 6])
			assert.deepStrictEqual(andSortedArrIterative([1, 2, 3, 4, 5, 6, 7], [2, 4, 6]), [2, 4, 6])
		})

		it('supports sorted strings and bigints with the default comparator', () => {
			assert.deepStrictEqual(
				andSortedArrIterative(['alpha', 'beta', 'delta', 'gamma'], ['beta', 'epsilon', 'gamma']),
				['beta', 'gamma'],
			)
			assert.deepStrictEqual(
				andSortedArrIterative(
					[-100000000000000000000n, 0n, 42n, 999999999999999999999n],
					[0n, 7n, 999999999999999999999n],
				),
				[0n, 999999999999999999999n],
			)
		})

		it('supports custom comparators (objects, descending order, case-insensitive strings)', () => {
			const byId = (x, y) => x.id - y.id
			const a = [
				{ id: 1, label: 'a1' },
				{ id: 3, label: 'a3' },
				{ id: 5, label: 'a5' },
			]
			const b = [
				{ id: 2, label: 'b2' },
				{ id: 3, label: 'b3' },
				{ id: 5, label: 'b5' },
			]
			assert.deepStrictEqual(andSortedArrIterative(a, b, byId), [
				{ id: 3, label: 'a3' },
				{ id: 5, label: 'a5' },
			])

			const desc = (x, y) => y - x
			assert.deepStrictEqual(andSortedArrIterative([10, 7, 4, 1], [9, 7, 3, 1], desc), [7, 1])

			const ci = (x, y) => x.toLowerCase().localeCompare(y.toLowerCase())
			assert.deepStrictEqual(
				andSortedArrIterative(['Apple', 'Banana', 'Cherry'], ['banana', 'date'], ci),
				['Banana'],
			)
		})
	})

	describe('edge cases', () => {
		it('handles empty arrays', () => {
			assert.deepStrictEqual(andSortedArrIterative([], []), [])
			assert.deepStrictEqual(andSortedArrIterative([], [1, 2, 3]), [])
			assert.deepStrictEqual(andSortedArrIterative([1, 2, 3], []), [])
			assert.deepStrictEqual(andSortedArrIterative([], ['a', 'b']), [])
		})

		it('handles single-element arrays', () => {
			assert.deepStrictEqual(andSortedArrIterative([42], [42]), [42])
			assert.deepStrictEqual(andSortedArrIterative([42], [43]), [])
			assert.deepStrictEqual(andSortedArrIterative([42], [1, 42, 100]), [42])
		})

		it('handles boundary-only matches', () => {
			assert.deepStrictEqual(andSortedArrIterative([1, 2, 3], [3, 4, 5]), [3])
			assert.deepStrictEqual(andSortedArrIterative([3, 4, 5], [1, 2, 3]), [3])
			assert.deepStrictEqual(andSortedArrIterative([1, 100], [1, 50, 100]), [1, 100])
		})

		it('handles extreme numeric values without subtraction overflow', () => {
			const a = [-Infinity, -Number.MAX_VALUE, -1, 0, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE, Infinity]
			const b = [-Infinity, 0, Number.MAX_VALUE, Infinity]
			assert.deepStrictEqual(andSortedArrIterative(a, b), [-Infinity, 0, Number.MAX_VALUE, Infinity])
		})

		it('does not mutate input arrays', () => {
			const a = [1, 3, 5, 7]
			const b = [2, 3, 6, 7]
			const aSnap = [...a]
			const bSnap = [...b]
			const res = andSortedArrIterative(a, b)
			res.push(999)
			assert.deepStrictEqual(a, aSnap)
			assert.deepStrictEqual(b, bSnap)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when a or b is not an array', () => {
			for (const invalid of [null, undefined, 123, 'abc', {}, new Set([1, 2])]) {
				assert.throws(() => andSortedArrIterative(invalid, [1, 2]), TypeError)
				assert.throws(() => andSortedArrIterative([1, 2], invalid), TypeError)
			}
		})

		it('throws TypeError for sparse arrays', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3]
			assert.throws(() => andSortedArrIterative(sparse, [1, 3]), TypeError)
			assert.throws(() => andSortedArrIterative([1, 3], sparse), TypeError)
		})

		it('throws TypeError when compare is provided and not a function', () => {
			for (const badCmp of [null, 42, 'asc', {}, []]) {
				assert.throws(() => andSortedArrIterative([1, 2], [2, 3], badCmp), TypeError)
			}
		})

		it('throws TypeError when custom comparator returns non-number or NaN', () => {
			assert.throws(() => andSortedArrIterative([1, 2], [2, 3], () => NaN), TypeError)
			assert.throws(() => andSortedArrIterative([1, 2], [2, 3], () => '0'), TypeError)
			assert.throws(() => andSortedArrIterative([1], [2], () => undefined), TypeError)
		})

		it('throws TypeError for unsupported or mixed element types with default comparator', () => {
			assert.throws(() => andSortedArrIterative([{}], [{}]), TypeError)
			assert.throws(() => andSortedArrIterative([false, true], [true]), TypeError)
			assert.throws(() => andSortedArrIterative([null], [null]), TypeError)
			assert.throws(() => andSortedArrIterative([1, '2'], [1]), TypeError)
			assert.throws(() => andSortedArrIterative([1, 2], ['1', '2']), TypeError)
			assert.throws(() => andSortedArrIterative([1, 2], [1n, 2n]), TypeError)
		})

		it('throws RangeError when inputs contain NaN with default comparator', () => {
			assert.throws(() => andSortedArrIterative([NaN], [1]), RangeError)
			assert.throws(() => andSortedArrIterative([1, 2], [1, NaN]), RangeError)
		})

		it('throws RangeError when inputs are not sorted in strictly ascending order', () => {
			assert.throws(() => andSortedArrIterative([3, 1, 2], [1, 2]), RangeError)
			assert.throws(() => andSortedArrIterative([1, 2], [5, 4]), RangeError)
			// Even if one array is empty or ends early, unsorted tail in the other is caught
			assert.throws(() => andSortedArrIterative([], [2, 1]), RangeError)
			assert.throws(() => andSortedArrIterative([1], [1, 5, 2]), RangeError)
		})

		it('throws RangeError when inputs contain duplicates', () => {
			assert.throws(() => andSortedArrIterative([1, 2, 2, 3], [2, 3]), RangeError)
			assert.throws(() => andSortedArrIterative([1, 2], [2, 2, 3]), RangeError)
			assert.throws(() => andSortedArrIterative([], [1, 1]), RangeError)
			// Also catches duplicates under custom comparator
			const byId = (x, y) => x.id - y.id
			assert.throws(
				() => andSortedArrIterative([{ id: 1 }, { id: 1 }], [{ id: 1 }], byId),
				RangeError,
			)
		})
	})

	describe('cross-checks and algebraic identities', () => {
		it('matches independent Set-based reference across 100 pseudo-random test cases', () => {
			const rand = createRng(0xdecafbad)
			for (let t = 0; t < 100; t += 1) {
				const a = randomSortedUniqueInts(rand, 40, -50, 50)
				const b = randomSortedUniqueInts(rand, 40, -50, 50)
				const actual = andSortedArrIterative(a, b)
				const expected = naiveSetIntersection(a, b)

				assert.deepStrictEqual(actual, expected)

				// Post-condition: output is strictly increasing
				for (let i = 1; i < actual.length; i += 1) {
					assert.ok(actual[i - 1] < actual[i], `output not strictly sorted at index ${i}`)
				}
			}
		})

		it('satisfies set algebra laws (commutativity, associativity, idempotence, inclusion-exclusion, De Morgan)', () => {
			const rand = createRng(0x12345678)
			const universe = Array.from({ length: 41 }, (_, i) => i - 20)
			const complement = (setArr) => {
				const s = new Set(setArr)
				return universe.filter((x) => !s.has(x))
			}
			const union = (x, y) => [...new Set([...x, ...y])].sort((p, q) => p - q)

			for (let t = 0; t < 30; t += 1) {
				const A = randomSortedUniqueInts(rand, 25, -20, 20)
				const B = randomSortedUniqueInts(rand, 25, -20, 20)
				const C = randomSortedUniqueInts(rand, 25, -20, 20)

				const ab = andSortedArrIterative(A, B)
				const ba = andSortedArrIterative(B, A)

				// Commutativity: A ∩ B = B ∩ A
				assert.deepStrictEqual(ab, ba)

				// Associativity: (A ∩ B) ∩ C = A ∩ (B ∩ C)
				assert.deepStrictEqual(
					andSortedArrIterative(ab, C),
					andSortedArrIterative(A, andSortedArrIterative(B, C)),
				)

				// Idempotence: A ∩ A = A
				assert.deepStrictEqual(andSortedArrIterative(A, A), A)

				// Annihilation: A ∩ ∅ = ∅
				assert.deepStrictEqual(andSortedArrIterative(A, []), [])

				// Inclusion-exclusion cardinality: |A ∩ B| = |A| + |B| - |A ∪ B|
				const unionSize = new Set([...A, ...B]).size
				assert.strictEqual(ab.length, A.length + B.length - unionSize)

				// De Morgan's law over finite universe U: A ∩ B = U \ ((U \ A) ∪ (U \ B))
				const deMorgan = complement(union(complement(A), complement(B)))
				assert.deepStrictEqual(ab, deMorgan)
			}
		})
	})
})
