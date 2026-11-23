import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { xorSortedArrIterative } from './xorSortedArrIterative.js'

/**
 * Independent Set-based reference oracle for symmetric difference.
 *
 * @template T
 * @param {readonly T[]} a
 * @param {readonly T[]} b
 * @param {(x: T, y: T) => number} [cmp]
 * @returns {T[]}
 */
function referenceXorSet(a, b, cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0)) {
	const setA = new Set(a)
	const setB = new Set(b)
	const out = []
	for (const x of setA) {
		if (!setB.has(x)) out.push(x)
	}
	for (const y of setB) {
		if (!setA.has(y)) out.push(y)
	}
	return out.sort(cmp)
}

/**
 * Deterministic LCG PRNG for reproducible fuzz cross-checks.
 *
 * @param {number} seed
 */
function createRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

describe('xorSortedArrIterative', () => {
	test('computes symmetric difference for overlapping sorted number arrays', () => {
		assert.deepStrictEqual(xorSortedArrIterative([1, 2, 3, 5], [2, 3, 4, 6]), [1, 4, 5, 6])
		assert.deepStrictEqual(xorSortedArrIterative([-10, -3, 0, 4], [-3, 0, 2, 4, 9]), [-10, 2, 9])
	})

	test('handles disjoint arrays', () => {
		assert.deepStrictEqual(xorSortedArrIterative([1, 3, 5], [2, 4, 6]), [1, 2, 3, 4, 5, 6])
		assert.deepStrictEqual(xorSortedArrIterative([1, 2, 3], [10, 20, 30]), [1, 2, 3, 10, 20, 30])
		assert.deepStrictEqual(xorSortedArrIterative([10, 20], [1, 2]), [1, 2, 10, 20])
	})

	test('handles identical arrays and subsets', () => {
		assert.deepStrictEqual(xorSortedArrIterative([1, 2, 3], [1, 2, 3]), [])
		assert.deepStrictEqual(xorSortedArrIterative([1, 2, 3, 4, 5], [2, 4]), [1, 3, 5])
		assert.deepStrictEqual(xorSortedArrIterative([2, 4], [1, 2, 3, 4, 5]), [1, 3, 5])
	})

	test('handles empty arrays and single-element arrays', () => {
		assert.deepStrictEqual(xorSortedArrIterative([], []), [])
		assert.deepStrictEqual(xorSortedArrIterative([1, 2, 3], []), [1, 2, 3])
		assert.deepStrictEqual(xorSortedArrIterative([], [1, 2, 3]), [1, 2, 3])
		assert.deepStrictEqual(xorSortedArrIterative([42], [42]), [])
		assert.deepStrictEqual(xorSortedArrIterative([42], [99]), [42, 99])
		assert.deepStrictEqual(xorSortedArrIterative([99], [42]), [42, 99])
	})

	test('handles special finite/infinite numeric values and -0/+0 equivalence', () => {
		assert.deepStrictEqual(
			xorSortedArrIterative([-Infinity, -0.5, 0, Infinity], [-Infinity, 0.5, Infinity]),
			[-0.5, 0, 0.5],
		)
		assert.deepStrictEqual(xorSortedArrIterative([-0], [0]), [])
	})

	test('supports strings and bigints with default comparator', () => {
		assert.deepStrictEqual(
			xorSortedArrIterative(['apple', 'banana', 'date'], ['banana', 'cherry', 'date', 'fig']),
			['apple', 'cherry', 'fig'],
		)
		assert.deepStrictEqual(
			xorSortedArrIterative([-5n, 0n, 10n, 9007199254740993n], [0n, 10n, 9007199254740995n]),
			[-5n, 9007199254740993n, 9007199254740995n],
		)
	})

	test('supports custom comparator for objects and descending order', () => {
		const byId = (x, y) => x.id - y.id
		const a = [{ id: 1, v: 'a' }, { id: 3, v: 'c' }, { id: 5, v: 'e' }]
		const b = [{ id: 2, v: 'b' }, { id: 3, v: 'c2' }, { id: 6, v: 'f' }]
		assert.deepStrictEqual(xorSortedArrIterative(a, b, byId), [
			{ id: 1, v: 'a' },
			{ id: 2, v: 'b' },
			{ id: 5, v: 'e' },
			{ id: 6, v: 'f' },
		])

		const desc = (x, y) => y - x
		assert.deepStrictEqual(xorSortedArrIterative([9, 5, 2], [8, 5, 1], desc), [9, 8, 2, 1])
	})

	test('does not mutate inputs and returns a fresh array', () => {
		const a = [1, 2, 3]
		const b = []
		const res = xorSortedArrIterative(a, b)
		assert.deepStrictEqual(res, [1, 2, 3])
		assert.notEqual(res, a)
		res.push(99)
		assert.deepStrictEqual(a, [1, 2, 3])
		assert.deepStrictEqual(b, [])

		const shared = [1, 2, 3]
		assert.deepStrictEqual(xorSortedArrIterative(shared, shared), [])
		assert.deepStrictEqual(shared, [1, 2, 3])
	})

	test('rejects invalid input types and sparse arrays', () => {
		assert.throws(() => xorSortedArrIterative(null, []), TypeError)
		assert.throws(() => xorSortedArrIterative([], undefined), TypeError)
		assert.throws(() => xorSortedArrIterative('123', [1]), TypeError)
		assert.throws(() => xorSortedArrIterative([1], new Set([1])), TypeError)
		assert.throws(() => xorSortedArrIterative([1], [2], 'not-a-fn'), TypeError)

		// Sparse arrays
		const sparseA = [1, , 3] // eslint-disable-line no-sparse-arrays
		assert.throws(() => xorSortedArrIterative(sparseA, [2]), TypeError)
		assert.throws(() => xorSortedArrIterative([1], new Array(2)), TypeError)

		// Unsupported / mixed element types under default comparator
		assert.throws(() => xorSortedArrIterative([{}], []), TypeError)
		assert.throws(() => xorSortedArrIterative([true], [false]), TypeError)
		assert.throws(() => xorSortedArrIterative([1, 2], ['1', '2']), TypeError)
		assert.throws(() => xorSortedArrIterative([1, '2'], [3]), TypeError)
		assert.throws(() => xorSortedArrIterative([1n], [1]), TypeError)

		// Invalid comparator return values
		assert.throws(() => xorSortedArrIterative([1, 2], [3], () => NaN), TypeError)
		assert.throws(() => xorSortedArrIterative([1], [2], () => '0'), TypeError)
	})

	test('rejects NaN, unsorted arrays, and arrays with duplicates', () => {
		assert.throws(() => xorSortedArrIterative([NaN], []), RangeError)
		assert.throws(() => xorSortedArrIterative([1, 2], [0, NaN]), RangeError)

		// Unsorted
		assert.throws(() => xorSortedArrIterative([3, 1, 2], [4]), RangeError)
		assert.throws(() => xorSortedArrIterative([1, 2], [5, 4]), RangeError)
		assert.throws(() => xorSortedArrIterative(['b', 'a'], ['c']), RangeError)

		// Duplicates
		assert.throws(() => xorSortedArrIterative([1, 2, 2, 3], [4]), RangeError)
		assert.throws(() => xorSortedArrIterative([1], [5, 5]), RangeError)
		assert.throws(() => xorSortedArrIterative([-0, 0], []), RangeError)
		assert.throws(
			() => xorSortedArrIterative([{ id: 1 }, { id: 1 }], [], (x, y) => x.id - y.id),
			RangeError,
		)
	})

	test('cross-check against Set-based oracle and algebraic XOR identities across randomized cases', () => {
		const rng = createRng(0x5eed1234)
		const makeSortedUnique = (maxLen, domain) => {
			const len = Math.floor(rng() * maxLen)
			const set = new Set()
			for (let i = 0; i < len; i += 1) {
				set.add(Math.floor(rng() * domain) - Math.floor(domain / 2))
			}
			return [...set].sort((x, y) => x - y)
		}

		for (let trial = 0; trial < 200; trial += 1) {
			const a = makeSortedUnique(30, 40)
			const b = makeSortedUnique(30, 40)
			const c = makeSortedUnique(30, 40)

			const ab = xorSortedArrIterative(a, b)
			const expectedAb = referenceXorSet(a, b)
			assert.deepStrictEqual(ab, expectedAb)

			// Commutativity: A XOR B === B XOR A
			assert.deepStrictEqual(ab, xorSortedArrIterative(b, a))

			// Associativity: (A XOR B) XOR C === A XOR (B XOR C)
			assert.deepStrictEqual(
				xorSortedArrIterative(ab, c),
				xorSortedArrIterative(a, xorSortedArrIterative(b, c)),
			)

			// Identity and self-inverse
			assert.deepStrictEqual(xorSortedArrIterative(ab, b), a)
			assert.deepStrictEqual(xorSortedArrIterative(ab, a), b)
		}
	})

	test('handles large arrays iteratively without recursion/stack limits', () => {
		const n = 50_000
		const evens = Array.from({ length: n }, (_, i) => i * 2)
		const multiplesOfThree = Array.from({ length: n }, (_, i) => i * 3)

		const actual = xorSortedArrIterative(evens, multiplesOfThree)
		const expected = referenceXorSet(evens, multiplesOfThree)
		assert.deepStrictEqual(actual, expected)
	})
})
