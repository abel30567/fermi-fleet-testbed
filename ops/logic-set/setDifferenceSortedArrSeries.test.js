import { test, describe } from 'node:test'
import assert from 'node:assert'
import { setDifferenceSortedArrSeries } from './setDifferenceSortedArrSeries.js'

/**
 * Independent reference implementation using JavaScript Set for cross-checking.
 *
 * @template T
 * @param {readonly T[]} a
 * @param {readonly T[]} b
 * @returns {T[]}
 */
function referenceSetDifference(a, b) {
	const setB = new Set(b)
	return a.filter((x) => !setB.has(x))
}

/**
 * Independent reference union for verifying set-algebra identities.
 *
 * @template T
 * @param {readonly T[]} a
 * @param {readonly T[]} b
 * @param {(x: T, y: T) => number} cmp
 * @returns {T[]}
 */
function referenceUnion(a, b, cmp) {
	return [...new Set([...a, ...b])].sort(cmp)
}

/**
 * Independent reference intersection for verifying set-algebra identities.
 *
 * @template T
 * @param {readonly T[]} a
 * @param {readonly T[]} b
 * @returns {T[]}
 */
function referenceIntersection(a, b) {
	const setB = new Set(b)
	return a.filter((x) => setB.has(x))
}

/**
 * Deterministic PRNG (mulberry32) for reproducible property cross-checks.
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

describe('setDifferenceSortedArrSeries', () => {
	test('computes normal numeric set difference with partial overlap', () => {
		assert.deepStrictEqual(
			setDifferenceSortedArrSeries([1, 2, 3, 4, 5], [2, 4, 6]),
			[1, 3, 5]
		)
		assert.deepStrictEqual(
			setDifferenceSortedArrSeries([-10, -3, 0, 4.5, 100], [-3, 0, 50]),
			[-10, 4.5, 100]
		)
	})

	test('handles empty arrays and returns fresh copies without mutating inputs', () => {
		assert.deepStrictEqual(setDifferenceSortedArrSeries([], []), [])
		assert.deepStrictEqual(setDifferenceSortedArrSeries([], [1, 2, 3]), [])

		const a = [1, 2, 3]
		const b = []
		const res = setDifferenceSortedArrSeries(a, b)
		assert.deepStrictEqual(res, [1, 2, 3])
		assert.notStrictEqual(res, a)

		const a2 = [1, 3, 5]
		const b2 = [3, 4]
		const a2Copy = [...a2]
		const b2Copy = [...b2]
		assert.deepStrictEqual(setDifferenceSortedArrSeries(a2, b2), [1, 5])
		assert.deepStrictEqual(a2, a2Copy)
		assert.deepStrictEqual(b2, b2Copy)
	})

	test('handles disjoint, equal, subset, and superset inputs', () => {
		// Disjoint (interleaved and separated)
		assert.deepStrictEqual(setDifferenceSortedArrSeries([1, 3, 5], [2, 4, 6]), [1, 3, 5])
		assert.deepStrictEqual(setDifferenceSortedArrSeries([1, 2], [10, 20]), [1, 2])
		assert.deepStrictEqual(setDifferenceSortedArrSeries([10, 20], [1, 2]), [10, 20])

		// Equal sets
		assert.deepStrictEqual(setDifferenceSortedArrSeries([1, 2, 3], [1, 2, 3]), [])

		// Subset (A ⊆ B -> ∅)
		assert.deepStrictEqual(setDifferenceSortedArrSeries([2, 4], [1, 2, 3, 4, 5]), [])

		// Superset (B ⊆ A)
		assert.deepStrictEqual(setDifferenceSortedArrSeries([1, 2, 3, 4, 5], [2, 4]), [1, 3, 5])

		// Single-element edge cases
		assert.deepStrictEqual(setDifferenceSortedArrSeries([7], [7]), [])
		assert.deepStrictEqual(setDifferenceSortedArrSeries([7], [8]), [7])
	})

	test('handles infinities, signed zero, strings, and bigints', () => {
		assert.deepStrictEqual(
			setDifferenceSortedArrSeries([-Infinity, -1, 0, Infinity], [-Infinity, Infinity]),
			[-1, 0]
		)
		assert.deepStrictEqual(setDifferenceSortedArrSeries([-0], [0]), [])

		const negZeroResult = setDifferenceSortedArrSeries([-0], [1])
		assert.strictEqual(negZeroResult.length, 1)
		assert.ok(Object.is(negZeroResult[0], -0))

		assert.deepStrictEqual(
			setDifferenceSortedArrSeries(['alpha', 'beta', 'delta', 'gamma'], ['beta', 'epsilon']),
			['alpha', 'delta', 'gamma']
		)

		assert.deepStrictEqual(
			setDifferenceSortedArrSeries([-100n, 0n, 1n, 9007199254740993n], [0n, 9007199254740993n]),
			[-100n, 1n]
		)
	})

	test('supports custom comparators (objects, reverse order, case-insensitive)', () => {
		const a1 = { id: 1, src: 'a' }
		const a2 = { id: 2, src: 'a' }
		const a3 = { id: 3, src: 'a' }
		const b2 = { id: 2, src: 'b' }
		const b4 = { id: 4, src: 'b' }
		const byId = (x, y) => x.id - y.id

		const objRes = setDifferenceSortedArrSeries([a1, a2, a3], [b2, b4], byId)
		assert.deepStrictEqual(objRes, [a1, a3])
		assert.strictEqual(objRes[0], a1)
		assert.strictEqual(objRes[1], a3)

		// Reverse-sorted numeric arrays
		const desc = (x, y) => y - x
		assert.deepStrictEqual(
			setDifferenceSortedArrSeries([10, 7, 4, 1], [7, 5, 1], desc),
			[10, 4]
		)

		// Case-insensitive strings
		const ci = (x, y) => x.toLowerCase().localeCompare(y.toLowerCase())
		assert.deepStrictEqual(
			setDifferenceSortedArrSeries(['Apple', 'Banana', 'Cherry'], ['banana', 'Date'], ci),
			['Apple', 'Cherry']
		)
	})

	test('rejects invalid input types and invalid comparators', () => {
		assert.throws(() => setDifferenceSortedArrSeries(null, []), TypeError)
		assert.throws(() => setDifferenceSortedArrSeries([], undefined), TypeError)
		assert.throws(() => setDifferenceSortedArrSeries(new Set([1, 2]), [1]), TypeError)
		assert.throws(() => setDifferenceSortedArrSeries('123', []), TypeError)
		assert.throws(() => setDifferenceSortedArrSeries([], { length: 0 }), TypeError)
		assert.throws(() => setDifferenceSortedArrSeries([1, 2], [2], 'asc'), TypeError)
		assert.throws(() => setDifferenceSortedArrSeries([1, 2], [2], null), TypeError)

		// Sparse arrays
		const sparse = [1, , 3] // eslint-disable-line no-sparse-arrays
		assert.throws(() => setDifferenceSortedArrSeries(sparse, [2]), TypeError)
		assert.throws(() => setDifferenceSortedArrSeries([2], sparse), TypeError)

		// Unsupported element types without custom comparator
		assert.throws(() => setDifferenceSortedArrSeries([null], []), TypeError)
		assert.throws(() => setDifferenceSortedArrSeries([{}], []), TypeError)
		assert.throws(() => setDifferenceSortedArrSeries([true], []), TypeError)

		// Mixed primitive types without custom comparator
		assert.throws(() => setDifferenceSortedArrSeries([1, '2'], []), TypeError)
		assert.throws(() => setDifferenceSortedArrSeries([1], ['1']), TypeError)
		assert.throws(() => setDifferenceSortedArrSeries([1], [1n]), TypeError)

		// Comparator returning non-number or NaN
		assert.throws(
			() => setDifferenceSortedArrSeries([1, 2], [2], () => NaN),
			TypeError
		)
		assert.throws(
			() => setDifferenceSortedArrSeries([1], [2], () => '0'),
			TypeError
		)
	})

	test('rejects NaN, unsorted arrays, and duplicate elements', () => {
		// NaN with default comparator (including single-element arrays)
		assert.throws(() => setDifferenceSortedArrSeries([NaN], []), RangeError)
		assert.throws(() => setDifferenceSortedArrSeries([], [NaN]), RangeError)
		assert.throws(() => setDifferenceSortedArrSeries([1, NaN, 3], [2]), RangeError)

		// Unsorted inputs
		assert.throws(() => setDifferenceSortedArrSeries([3, 1, 2], []), RangeError)
		assert.throws(() => setDifferenceSortedArrSeries([], [2, 1]), RangeError)
		assert.throws(() => setDifferenceSortedArrSeries([1, 2], [5, 4]), RangeError)
		assert.throws(
			() => setDifferenceSortedArrSeries([1, 2], [2], (x, y) => y - x),
			RangeError
		)

		// Duplicate elements
		assert.throws(() => setDifferenceSortedArrSeries([1, 2, 2, 3], []), RangeError)
		assert.throws(() => setDifferenceSortedArrSeries([], [1, 1]), RangeError)
		assert.throws(() => setDifferenceSortedArrSeries([-0, 0], []), RangeError)
		assert.throws(() => setDifferenceSortedArrSeries(['a', 'a'], ['b']), RangeError)
	})

	test('cross-checks against Set reference and Boolean-ring identities across randomized trials', () => {
		const rng = createRng(0x5eed1234)
		const numCmp = (x, y) => x - y

		for (let trial = 0; trial < 200; trial += 1) {
			const sizeA = Math.floor(rng() * 40)
			const sizeB = Math.floor(rng() * 40)
			const universe = 50

			const rawA = new Set()
			for (let i = 0; i < sizeA; i += 1) {
				rawA.add(Math.floor(rng() * universe) - 25)
			}
			const rawB = new Set()
			for (let i = 0; i < sizeB; i += 1) {
				rawB.add(Math.floor(rng() * universe) - 25)
			}

			const a = [...rawA].sort(numCmp)
			const b = [...rawB].sort(numCmp)

			const actual = setDifferenceSortedArrSeries(a, b)
			const expected = referenceSetDifference(a, b)
			assert.deepStrictEqual(actual, expected)

			// Verify strict ascending invariant on result
			for (let i = 1; i < actual.length; i += 1) {
				assert.ok(actual[i - 1] < actual[i])
			}

			// Verify set-algebra identities:
			// 1. |A \ B| = |A| - |A ∩ B| = |A ∪ B| - |B|
			const inter = referenceIntersection(a, b)
			const union = referenceUnion(a, b, numCmp)
			assert.strictEqual(actual.length, a.length - inter.length)
			assert.strictEqual(actual.length, union.length - b.length)

			// 2. (A \ B) ∩ B = ∅
			assert.deepStrictEqual(referenceIntersection(actual, b), [])

			// 3. (A \ B) ∪ (A ∩ B) = A
			assert.deepStrictEqual(referenceUnion(actual, inter, numCmp), a)

			// 4. A \ (A \ B) = A ∩ B
			assert.deepStrictEqual(setDifferenceSortedArrSeries(a, actual), inter)
		}
	})

	test('handles large sorted arrays in linear time', () => {
		const n = 50000
		const a = Array.from({ length: n }, (_, i) => i * 2) // even numbers 0..99998
		const b = Array.from({ length: n }, (_, i) => i * 4) // multiples of 4: 0..199996
		const res = setDifferenceSortedArrSeries(a, b)

		// Even numbers not divisible by 4: 2, 6, 10, ..., 99998 (exact count = n / 2)
		assert.strictEqual(res.length, n / 2)
		assert.strictEqual(res[0], 2)
		assert.strictEqual(res[res.length - 1], 99998)
		for (let i = 0; i < 100; i += 1) {
			assert.strictEqual(res[i], 4 * i + 2)
		}
	})
})
