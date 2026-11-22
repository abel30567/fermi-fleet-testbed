import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { intersectionSortedArrRecursive } from './intersectionSortedArrRecursive.js'

/**
 * Independent iterative two-pointer merge reference implementation
 * for cross-checking against the recursive divide-and-conquer implementation.
 *
 * @param {readonly number[]} a
 * @param {readonly number[]} b
 * @returns {number[]}
 */
function iterativeMergeIntersection(a, b) {
	const out = []
	let i = 0
	let j = 0
	while (i < a.length && j < b.length) {
		if (a[i] < b[j]) {
			i++
		} else if (a[i] > b[j]) {
			j++
		} else {
			out.push(a[i] === 0 ? 0 : a[i])
			i++
			j++
		}
	}
	return out
}

/**
 * Deterministic PRNG (Mulberry32) so randomized cross-checks are 100% reproducible.
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
 * Generates a strictly ascending sorted, de-duplicated integer array using `rng`.
 *
 * @param {() => number} rng
 * @param {number} maxLen
 * @param {number} valueSpread
 * @returns {number[]}
 */
function randomSortedUnique(rng, maxLen, valueSpread) {
	const targetLen = Math.floor(rng() * (maxLen + 1))
	const set = new Set()
	for (let i = 0; i < targetLen; i++) {
		set.add(Math.floor(rng() * valueSpread) - Math.floor(valueSpread / 2))
	}
	return [...set].sort((x, y) => x - y)
}

describe('intersectionSortedArrRecursive', () => {
	describe('normal cases', () => {
		it('computes intersection of partially overlapping sorted arrays', () => {
			assert.deepStrictEqual(
				intersectionSortedArrRecursive([1, 2, 4, 6, 8, 10], [2, 3, 4, 7, 8, 9]),
				[2, 4, 8]
			)
		})

		it('handles negative numbers and floating-point values', () => {
			assert.deepStrictEqual(
				intersectionSortedArrRecursive([-10.5, -3.25, -1, 0, 1.5, 4.75], [-10.5, -2, 0, 1.5, 9]),
				[-10.5, 0, 1.5]
			)
		})

		it('handles identical arrays and returns a new array without mutating inputs', () => {
			const a = [1, 3, 5, 7, 9]
			const b = [1, 3, 5, 7, 9]
			const aSnap = [...a]
			const bSnap = [...b]

			const result = intersectionSortedArrRecursive(a, b)
			assert.deepStrictEqual(result, [1, 3, 5, 7, 9])
			assert.notStrictEqual(result, a)
			assert.notStrictEqual(result, b)
			assert.deepStrictEqual(a, aSnap)
			assert.deepStrictEqual(b, bSnap)
		})

		it('handles subset and superset in both operand orders', () => {
			const small = [2, 5, 8]
			const large = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
			assert.deepStrictEqual(intersectionSortedArrRecursive(small, large), [2, 5, 8])
			assert.deepStrictEqual(intersectionSortedArrRecursive(large, small), [2, 5, 8])
		})

		it('handles disjoint ranges and interleaved disjoint arrays', () => {
			assert.deepStrictEqual(intersectionSortedArrRecursive([1, 2, 3], [4, 5, 6]), [])
			assert.deepStrictEqual(intersectionSortedArrRecursive([10, 20, 30], [1, 2, 3]), [])
			assert.deepStrictEqual(intersectionSortedArrRecursive([1, 3, 5, 7, 9], [2, 4, 6, 8, 10]), [])
		})

		it('supports a custom comparator for strings and objects', () => {
			const cmpStr = (x, y) => (x < y ? -1 : x > y ? 1 : 0)
			assert.deepStrictEqual(
				intersectionSortedArrRecursive(
					['apple', 'banana', 'cherry', 'date'],
					['apricot', 'banana', 'date', 'fig'],
					cmpStr
				),
				['banana', 'date']
			)

			const aObjs = [
				{ id: 1, src: 'a' },
				{ id: 3, src: 'a' },
				{ id: 5, src: 'a' },
				{ id: 7, src: 'a' },
			]
			const bObjs = [
				{ id: 3, src: 'b' },
				{ id: 7, src: 'b' },
			]
			const cmpId = (x, y) => x.id - y.id
			// Prefers elements from the left operand `a` even when `b` is shorter.
			assert.deepStrictEqual(intersectionSortedArrRecursive(aObjs, bObjs, cmpId), [
				{ id: 3, src: 'a' },
				{ id: 7, src: 'a' },
			])
		})
	})

	describe('edge cases', () => {
		it('handles empty arrays', () => {
			assert.deepStrictEqual(intersectionSortedArrRecursive([], []), [])
			assert.deepStrictEqual(intersectionSortedArrRecursive([], [1, 2, 3]), [])
			assert.deepStrictEqual(intersectionSortedArrRecursive([1, 2, 3], []), [])
		})

		it('handles single-element arrays', () => {
			assert.deepStrictEqual(intersectionSortedArrRecursive([42], [42]), [42])
			assert.deepStrictEqual(intersectionSortedArrRecursive([42], [43]), [])
			assert.deepStrictEqual(intersectionSortedArrRecursive([42], [10, 42, 99]), [42])
			assert.deepStrictEqual(intersectionSortedArrRecursive([10, 42, 99], [42]), [42])
		})

		it('handles extreme finite IEEE-754 boundary numbers without comparator overflow', () => {
			const a = [
				-Number.MAX_VALUE,
				Number.MIN_SAFE_INTEGER,
				-Number.MIN_VALUE,
				0,
				Number.MIN_VALUE,
				Number.MAX_SAFE_INTEGER,
				Number.MAX_VALUE,
			]
			const b = [-Number.MAX_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE]
			assert.deepStrictEqual(intersectionSortedArrRecursive(a, b), [
				-Number.MAX_VALUE,
				-Number.MIN_VALUE,
				Number.MAX_VALUE,
			])
		})

		it('normalizes -0 to +0 in default numeric mode', () => {
			const res1 = intersectionSortedArrRecursive([-1, -0, 1], [-2, 0, 2])
			assert.deepStrictEqual(res1, [0])
			assert.ok(Object.is(res1[0], 0))

			const res2 = intersectionSortedArrRecursive([-2, 0, 2], [-1, -0, 1])
			assert.deepStrictEqual(res2, [0])
			assert.ok(Object.is(res2[0], 0))
		})

		it('handles large and heavily imbalanced arrays without stack overflow', () => {
			const large = Array.from({ length: 50_000 }, (_, i) => i * 2) // 0, 2, 4, ..., 99998
			const small = [0, 50_000, 99_998, 100_001]

			assert.deepStrictEqual(intersectionSortedArrRecursive(small, large), [0, 50_000, 99_998])
			assert.deepStrictEqual(intersectionSortedArrRecursive(large, small), [0, 50_000, 99_998])

			const largeB = Array.from({ length: 50_000 }, (_, i) => i * 3) // 0, 3, 6, ..., 149997
			const actual = intersectionSortedArrRecursive(large, largeB)
			const expected = iterativeMergeIntersection(large, largeB)
			assert.deepStrictEqual(actual, expected)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when a or b is not an array', () => {
			for (const bad of [null, undefined, 123, '123', {}, new Set([1, 2]), new Int32Array([1, 2])]) {
				assert.throws(() => intersectionSortedArrRecursive(bad, [1, 2]), TypeError)
				assert.throws(() => intersectionSortedArrRecursive([1, 2], bad), TypeError)
			}
		})

		it('throws TypeError on sparse arrays', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3]
			assert.throws(() => intersectionSortedArrRecursive(sparse, [1, 3]), TypeError)
			assert.throws(() => intersectionSortedArrRecursive([1, 3], new Array(2)), TypeError)
			assert.throws(
				() => intersectionSortedArrRecursive(sparse, [1, 3], (x, y) => x - y),
				TypeError
			)
		})

		it('throws TypeError on non-number elements with default comparator', () => {
			assert.throws(() => intersectionSortedArrRecursive(['1', '2'], [1, 2]), TypeError)
			assert.throws(() => intersectionSortedArrRecursive([1, 2], [1, null]), TypeError)
			assert.throws(() => intersectionSortedArrRecursive([1n, 2n], [1n]), TypeError)
			assert.throws(() => intersectionSortedArrRecursive([1, undefined], [1]), TypeError)
		})

		it('throws RangeError on non-finite numbers with default comparator', () => {
			assert.throws(() => intersectionSortedArrRecursive([NaN], [1]), RangeError)
			assert.throws(() => intersectionSortedArrRecursive([1, Infinity], [1]), RangeError)
			assert.throws(() => intersectionSortedArrRecursive([-Infinity, 0], [0]), RangeError)
		})

		it('throws RangeError on unsorted or duplicated arrays', () => {
			assert.throws(() => intersectionSortedArrRecursive([3, 1, 2], [1, 2]), RangeError)
			assert.throws(() => intersectionSortedArrRecursive([1, 2], [5, 4]), RangeError)
			assert.throws(() => intersectionSortedArrRecursive([1, 2, 2, 3], [2]), RangeError)
			assert.throws(() => intersectionSortedArrRecursive([1, 2], [1, 1]), RangeError)
			assert.throws(() => intersectionSortedArrRecursive([-0, 0], [0]), RangeError)
			assert.throws(() => intersectionSortedArrRecursive([0, -0], [0]), RangeError)
		})

		it('throws TypeError on invalid compare argument or invalid comparator return value', () => {
			assert.throws(() => intersectionSortedArrRecursive([1], [1], null), TypeError)
			assert.throws(() => intersectionSortedArrRecursive([1], [1], 'asc'), TypeError)
			assert.throws(() => intersectionSortedArrRecursive([1], [1], 42), TypeError)

			assert.throws(
				() => intersectionSortedArrRecursive([1, 2], [1, 2], () => NaN),
				TypeError
			)
			assert.throws(
				() => intersectionSortedArrRecursive([1, 2], [1, 2], () => Infinity),
				TypeError
			)
			assert.throws(
				() => intersectionSortedArrRecursive([1, 2], [1, 2], () => '0'),
				TypeError
			)
		})

		it('throws RangeError when arrays violate strict ascending order under custom comparator', () => {
			const cmpDesc = (x, y) => y - x
			assert.throws(() => intersectionSortedArrRecursive([1, 2, 3], [3, 2, 1], cmpDesc), RangeError)
			assert.throws(() => intersectionSortedArrRecursive([3, 2, 2], [3, 1], cmpDesc), RangeError)
		})
	})

	describe('cross-checks and set-algebraic identities', () => {
		it('matches independent iterative two-pointer merge and Set-based intersection on 200 random pairs', () => {
			const rng = createRng(0x5eed17)
			for (let trial = 0; trial < 200; trial++) {
				const maxLenA = trial % 5 === 0 ? 150 : 30
				const maxLenB = trial % 7 === 0 ? 150 : 30
				const spread = 20 + (trial % 80)
				const a = randomSortedUnique(rng, maxLenA, spread)
				const b = randomSortedUnique(rng, maxLenB, spread)

				const recursiveResult = intersectionSortedArrRecursive(a, b)
				const iterativeResult = iterativeMergeIntersection(a, b)

				const setB = new Set(b)
				const setResult = a.filter((x) => setB.has(x))

				assert.deepStrictEqual(recursiveResult, iterativeResult)
				assert.deepStrictEqual(recursiveResult, setResult)
			}
		})

		it('satisfies commutativity, associativity, idempotence, and subset invariants', () => {
			const rng = createRng(0xabc12345)
			for (let trial = 0; trial < 50; trial++) {
				const a = randomSortedUnique(rng, 40, 50)
				const b = randomSortedUnique(rng, 40, 50)
				const c = randomSortedUnique(rng, 40, 50)

				// Commutativity: A ∩ B = B ∩ A
				const ab = intersectionSortedArrRecursive(a, b)
				const ba = intersectionSortedArrRecursive(b, a)
				assert.deepStrictEqual(ab, ba)

				// Associativity: (A ∩ B) ∩ C = A ∩ (B ∩ C)
				const ab_c = intersectionSortedArrRecursive(ab, c)
				const bc = intersectionSortedArrRecursive(b, c)
				const a_bc = intersectionSortedArrRecursive(a, bc)
				assert.deepStrictEqual(ab_c, a_bc)

				// Idempotence: A ∩ A = A
				assert.deepStrictEqual(intersectionSortedArrRecursive(a, a), a)

				// Empty absorption: A ∩ ∅ = ∅
				assert.deepStrictEqual(intersectionSortedArrRecursive(a, []), [])

				// Subset invariant: every element of A ∩ B is in both A and B, and result is strictly ascending
				const setA = new Set(a)
				const setB = new Set(b)
				for (let i = 0; i < ab.length; i++) {
					assert.ok(setA.has(ab[i]))
					assert.ok(setB.has(ab[i]))
					if (i > 0) {
						assert.ok(ab[i - 1] < ab[i])
					}
				}
			}
		})
	})
})
