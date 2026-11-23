import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { andSortedArrIterative } from './andSortedArrIterative.js'

/**
 * Deterministic PRNG (Mulberry32) for reproducible property and cross-check tests.
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
 * Generates a strictly sorted, de-duplicated array of integers.
 *
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
 * Independent reference implementation using `Set` membership lookup.
 *
 * @template T
 * @param {readonly T[]} a
 * @param {readonly T[]} b
 * @returns {T[]}
 */
function referenceSetIntersection(a, b) {
	const setB = new Set(b)
	return a.filter((x) => setB.has(x))
}

describe('andSortedArrIterative', () => {
	describe('normal cases', () => {
		test('intersects overlapping sorted numeric arrays', () => {
			assert.deepEqual(
				andSortedArrIterative([1, 2, 4, 6, 9], [2, 3, 4, 8, 9, 10]),
				[2, 4, 9]
			)
		})

		test('handles negative numbers, floats, and infinities', () => {
			assert.deepEqual(
				andSortedArrIterative(
					[-Infinity, -10.5, -3, 0, 2.5, Infinity],
					[-Infinity, -3, 0, 1.5, 2.5, 100, Infinity]
				),
				[-Infinity, -3, 0, 2.5, Infinity]
			)
		})

		test('handles subset and superset relationships', () => {
			assert.deepEqual(andSortedArrIterative([2, 5, 8], [1, 2, 3, 5, 7, 8, 9]), [2, 5, 8])
			assert.deepEqual(andSortedArrIterative([1, 2, 3, 5, 7, 8, 9], [2, 5, 8]), [2, 5, 8])
		})

		test('handles identical arrays and returns a new array instance', () => {
			const a = [1, 3, 5, 7]
			const b = [1, 3, 5, 7]
			const out = andSortedArrIterative(a, b)
			assert.deepEqual(out, [1, 3, 5, 7])
			assert.notEqual(out, a)
			assert.notEqual(out, b)
		})

		test('does not mutate input arrays', () => {
			const a = [1, 2, 3, 4]
			const b = [2, 4, 6]
			const aCopy = [...a]
			const bCopy = [...b]
			andSortedArrIterative(a, b)
			assert.deepEqual(a, aCopy)
			assert.deepEqual(b, bCopy)
		})

		test('works on sorted string arrays with default comparator', () => {
			assert.deepEqual(
				andSortedArrIterative(
					['apple', 'banana', 'cherry', 'date'],
					['apricot', 'banana', 'date', 'fig']
				),
				['banana', 'date']
			)
		})

		test('works on sorted bigint arrays with default comparator', () => {
			assert.deepEqual(
				andSortedArrIterative(
					[-100n, 0n, 10n, 9007199254740993n],
					[-50n, 0n, 9007199254740993n, 9007199254740995n]
				),
				[0n, 9007199254740993n]
			)
		})

		test('supports custom comparators for objects and descending order', () => {
			const byId = (x, y) => x.id - y.id
			const a = [
				{ id: 1, tag: 'a1' },
				{ id: 3, tag: 'a3' },
				{ id: 5, tag: 'a5' }
			]
			const b = [
				{ id: 2, tag: 'b2' },
				{ id: 3, tag: 'b3' },
				{ id: 5, tag: 'b5' }
			]
			assert.deepEqual(andSortedArrIterative(a, b, byId), [
				{ id: 3, tag: 'a3' },
				{ id: 5, tag: 'a5' }
			])

			const desc = (x, y) => y - x
			assert.deepEqual(andSortedArrIterative([9, 6, 3, 1], [10, 6, 4, 1], desc), [6, 1])
		})
	})

	describe('edge cases', () => {
		test('handles empty arrays', () => {
			assert.deepEqual(andSortedArrIterative([], []), [])
			assert.deepEqual(andSortedArrIterative([], [1, 2, 3]), [])
			assert.deepEqual(andSortedArrIterative([1, 2, 3], []), [])
		})

		test('handles single-element arrays', () => {
			assert.deepEqual(andSortedArrIterative([42], [42]), [42])
			assert.deepEqual(andSortedArrIterative([42], [43]), [])
			assert.deepEqual(andSortedArrIterative([43], [42]), [])
		})

		test('handles disjoint and boundary-touching arrays', () => {
			assert.deepEqual(andSortedArrIterative([1, 2, 3], [4, 5, 6]), [])
			assert.deepEqual(andSortedArrIterative([4, 5, 6], [1, 2, 3]), [])
			assert.deepEqual(andSortedArrIterative([1, 3, 5, 7], [2, 4, 6, 8]), [])
			assert.deepEqual(andSortedArrIterative([1, 2, 3], [3, 4, 5]), [3])
			assert.deepEqual(andSortedArrIterative([3, 4, 5], [1, 2, 3]), [3])
		})

		test('handles -0 and +0 equality cleanly', () => {
			const out = andSortedArrIterative([-0], [0])
			assert.equal(out.length, 1)
			assert.equal(out[0] === 0, true)
		})

		test('handles large arrays iteratively without stack overflow', () => {
			const n = 50000
			const a = Array.from({ length: n }, (_, i) => i * 2)
			const b = Array.from({ length: n }, (_, i) => i * 3)
			const out = andSortedArrIterative(a, b)
			const expectedLen = Math.floor(((n - 1) * 2) / 6) + 1
			assert.equal(out.length, expectedLen)
			assert.equal(out[0], 0)
			assert.equal(out[out.length - 1], (expectedLen - 1) * 6)
		})
	})

	describe('input validation', () => {
		test('rejects non-array arguments', () => {
			const invalid = [null, undefined, 123, '123', {}, new Set([1, 2]), true]
			for (const bad of invalid) {
				assert.throws(() => andSortedArrIterative(bad, [1, 2]), TypeError)
				assert.throws(() => andSortedArrIterative([1, 2], bad), TypeError)
			}
		})

		test('rejects invalid comparator argument', () => {
			for (const bad of [null, 42, 'asc', {}, []]) {
				assert.throws(() => andSortedArrIterative([1, 2], [2, 3], bad), TypeError)
			}
		})

		test('rejects sparse arrays', () => {
			const sparse = [1, , 3]
			assert.throws(() => andSortedArrIterative(sparse, [1, 3]), TypeError)
			assert.throws(() => andSortedArrIterative([1, 3], sparse), TypeError)
			assert.throws(() => andSortedArrIterative(new Array(2), []), TypeError)
		})

		test('rejects NaN, unsupported types, and mixed types with default comparator', () => {
			assert.throws(() => andSortedArrIterative([1, NaN], [1]), TypeError)
			assert.throws(() => andSortedArrIterative([1], [NaN]), TypeError)
			assert.throws(() => andSortedArrIterative([null], [null]), TypeError)
			assert.throws(() => andSortedArrIterative([undefined], [undefined]), TypeError)
			assert.throws(() => andSortedArrIterative([true], [true]), TypeError)
			assert.throws(() => andSortedArrIterative([{ a: 1 }], [{ a: 1 }]), TypeError)
			assert.throws(() => andSortedArrIterative([1, '2'], [1]), TypeError)
			assert.throws(() => andSortedArrIterative([1, 2], ['1', '2']), TypeError)
			assert.throws(() => andSortedArrIterative([1, 2], [1n, 2n]), TypeError)
		})

		test('rejects unsorted arrays (even when the other array is empty or ends early)', () => {
			assert.throws(() => andSortedArrIterative([3, 1, 2], [1, 2, 3]), RangeError)
			assert.throws(() => andSortedArrIterative([1, 2, 3], [1, 3, 2]), RangeError)
			assert.throws(() => andSortedArrIterative([], [2, 1]), RangeError)
			assert.throws(() => andSortedArrIterative([2, 1], []), RangeError)
			assert.throws(() => andSortedArrIterative([1], [1, 5, 4]), RangeError)
		})

		test('rejects arrays with duplicate elements', () => {
			assert.throws(() => andSortedArrIterative([1, 2, 2, 3], [1, 2, 3]), RangeError)
			assert.throws(() => andSortedArrIterative([1, 2, 3], [1, 1, 2]), RangeError)
			assert.throws(() => andSortedArrIterative([-0, 0], [0]), RangeError)
			assert.throws(() => andSortedArrIterative([], [5, 5]), RangeError)
		})

		test('rejects custom comparator returning NaN or non-number', () => {
			assert.throws(() => andSortedArrIterative([1, 2], [1, 2], () => NaN), TypeError)
			assert.throws(() => andSortedArrIterative([1, 2], [1, 2], () => '0'), TypeError)
			assert.throws(() => andSortedArrIterative([1], [1], () => undefined), TypeError)
		})
	})

	describe('independent cross-checks and algebraic properties', () => {
		test('matches Set-based reference intersection across 200 randomized trials', () => {
			const rng = createRng(0x5eed1234)
			for (let t = 0; t < 200; t += 1) {
				const a = randomSortedUniqueInts(rng, 40, -30, 30)
				const b = randomSortedUniqueInts(rng, 40, -30, 30)
				const actual = andSortedArrIterative(a, b)
				const expected = referenceSetIntersection(a, b)
				assert.deepEqual(actual, expected)

				// Verify output invariant: strictly sorted and de-duplicated
				for (let i = 1; i < actual.length; i += 1) {
					assert.ok(actual[i - 1] < actual[i])
				}
			}
		})

		test('satisfies commutativity, idempotence, and associativity across randomized trials', () => {
			const rng = createRng(0xabcdef01)
			for (let t = 0; t < 100; t += 1) {
				const a = randomSortedUniqueInts(rng, 25, -20, 20)
				const b = randomSortedUniqueInts(rng, 25, -20, 20)
				const c = randomSortedUniqueInts(rng, 25, -20, 20)

				// Commutativity: A ∩ B = B ∩ A
				assert.deepEqual(andSortedArrIterative(a, b), andSortedArrIterative(b, a))

				// Idempotence: A ∩ A = A
				assert.deepEqual(andSortedArrIterative(a, a), a)

				// Associativity: (A ∩ B) ∩ C = A ∩ (B ∩ C)
				assert.deepEqual(
					andSortedArrIterative(andSortedArrIterative(a, b), c),
					andSortedArrIterative(a, andSortedArrIterative(b, c))
				)
			}
		})
	})
})
