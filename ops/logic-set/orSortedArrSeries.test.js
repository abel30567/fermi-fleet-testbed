import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { orSortedArrSeries } from './orSortedArrSeries.js'

/**
 * Independent reference implementation via ECMAScript Set union + numeric sort.
 * @param {...number[]} arrays
 * @returns {number[]}
 */
function refSetUnion(...arrays) {
	const set = new Set()
	for (const arr of arrays) {
		for (const x of arr) {
			set.add(x)
		}
	}
	return Array.from(set).sort((a, b) => a - b)
}

/**
 * Independent reference intersection via Set for Boolean algebra identity checks.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function refSetIntersection(a, b) {
	const setB = new Set(b)
	return a.filter((x) => setB.has(x))
}

/**
 * Deterministic LCG PRNG for reproducible randomized cross-checks.
 * @param {number} seed
 */
function createRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

/**
 * Generates a sorted, de-duplicated array of integers or floats using rng.
 */
function randomSortedUnique(rng, maxLen, minVal, maxVal, floats = false) {
	const len = Math.floor(rng() * (maxLen + 1))
	const set = new Set()
	for (let i = 0; i < len; i++) {
		const raw = minVal + rng() * (maxVal - minVal)
		const val = floats ? Math.round(raw * 100) / 100 : Math.floor(raw)
		set.add(val)
	}
	return Array.from(set).sort((a, b) => a - b)
}

describe('orSortedArrSeries', () => {
	describe('normal cases', () => {
		it('merges two overlapping sorted arrays and removes duplicates', () => {
			assert.deepStrictEqual(
				orSortedArrSeries([1, 3, 5, 7], [2, 3, 4, 7, 8]),
				[1, 2, 3, 4, 5, 7, 8]
			)
		})

		it('handles disjoint ranges in both orders (fast concatenation paths)', () => {
			assert.deepStrictEqual(
				orSortedArrSeries([1, 2, 3], [10, 20, 30]),
				[1, 2, 3, 10, 20, 30]
			)
			assert.deepStrictEqual(
				orSortedArrSeries([10, 20, 30], [1, 2, 3]),
				[1, 2, 3, 10, 20, 30]
			)
		})

		it('handles interleaved disjoint arrays', () => {
			assert.deepStrictEqual(
				orSortedArrSeries([0, 2, 4, 6, 8], [1, 3, 5, 7, 9]),
				[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
			)
		})

		it('handles subset and superset pairs', () => {
			assert.deepStrictEqual(
				orSortedArrSeries([2, 4], [1, 2, 3, 4, 5]),
				[1, 2, 3, 4, 5]
			)
			assert.deepStrictEqual(
				orSortedArrSeries([1, 2, 3, 4, 5], [2, 4]),
				[1, 2, 3, 4, 5]
			)
		})

		it('handles identical arrays (distinct instances and same reference)', () => {
			const a = [-5, 0, 5]
			assert.deepStrictEqual(orSortedArrSeries(a, [-5, 0, 5]), [-5, 0, 5])
			const sameRef = orSortedArrSeries(a, a)
			assert.deepStrictEqual(sameRef, [-5, 0, 5])
			assert.notStrictEqual(sameRef, a)
		})

		it('handles negative numbers, floating-point values, and extreme finite bounds', () => {
			assert.deepStrictEqual(
				orSortedArrSeries(
					[-Number.MAX_VALUE, -10.5, -Number.MIN_VALUE, 0.25, Number.MAX_SAFE_INTEGER],
					[-100, -10.5, 0, Number.MIN_VALUE, Number.MAX_VALUE]
				),
				[
					-Number.MAX_VALUE,
					-100,
					-10.5,
					-Number.MIN_VALUE,
					0,
					Number.MIN_VALUE,
					0.25,
					Number.MAX_SAFE_INTEGER,
					Number.MAX_VALUE,
				]
			)
		})

		it('merges a variadic series of 3, 4, 5, and 7 arrays via balanced pairwise merge', () => {
			assert.deepStrictEqual(
				orSortedArrSeries([1, 5], [2, 5, 8], [0, 3, 8, 9]),
				[0, 1, 2, 3, 5, 8, 9]
			)
			assert.deepStrictEqual(
				orSortedArrSeries([1, 10], [2, 10], [3, 10], [4, 10]),
				[1, 2, 3, 4, 10]
			)
			assert.deepStrictEqual(
				orSortedArrSeries([10], [2, 8], [1, 5, 9], [3, 6], [4, 7]),
				[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
			)
			assert.deepStrictEqual(
				orSortedArrSeries([7], [6], [5], [4], [3], [2], [1]),
				[1, 2, 3, 4, 5, 6, 7]
			)
		})
	})

	describe('edge cases', () => {
		it('returns empty array for 0 arguments (empty disjunction identity)', () => {
			assert.deepStrictEqual(orSortedArrSeries(), [])
		})

		it('returns a fresh copy for a single array argument', () => {
			const input = [1, 2, 3]
			const out = orSortedArrSeries(input)
			assert.deepStrictEqual(out, [1, 2, 3])
			assert.notStrictEqual(out, input)
		})

		it('handles empty arrays in all positions and multiplicities', () => {
			assert.deepStrictEqual(orSortedArrSeries([]), [])
			assert.deepStrictEqual(orSortedArrSeries([], []), [])
			assert.deepStrictEqual(orSortedArrSeries([], [], []), [])
			assert.deepStrictEqual(orSortedArrSeries([], [1, 2, 3]), [1, 2, 3])
			assert.deepStrictEqual(orSortedArrSeries([1, 2, 3], []), [1, 2, 3])
			assert.deepStrictEqual(
				orSortedArrSeries([], [3, 5], [], [1, 3], []),
				[1, 3, 5]
			)
			const only = [4, 9]
			const res = orSortedArrSeries([], only, [])
			assert.deepStrictEqual(res, [4, 9])
			assert.notStrictEqual(res, only)
		})

		it('normalizes -0 to +0 consistently across all paths', () => {
			const single = orSortedArrSeries([-0])
			assert.strictEqual(single.length, 1)
			assert.ok(Object.is(single[0], 0))

			const mergedEqual = orSortedArrSeries([-0], [0])
			assert.strictEqual(mergedEqual.length, 1)
			assert.ok(Object.is(mergedEqual[0], 0))

			const mergedRev = orSortedArrSeries([0], [-0])
			assert.deepStrictEqual(mergedEqual, mergedRev)

			const disjointLeft = orSortedArrSeries([-2, -0], [1, 2])
			assert.ok(Object.is(disjointLeft[1], 0))

			const disjointRight = orSortedArrSeries([1, 2], [-2, -0])
			assert.ok(Object.is(disjointRight[1], 0))

			const sameRef = [-0]
			const idem = orSortedArrSeries(sameRef, sameRef)
			assert.ok(Object.is(idem[0], 0))
		})

		it('does not mutate input arrays', () => {
			const a = [1, 3, 5]
			const b = [2, 3, 4]
			const c = [0, 5, 6]
			const snapA = [...a]
			const snapB = [...b]
			const snapC = [...c]

			const out = orSortedArrSeries(a, b, c)
			assert.deepStrictEqual(out, [0, 1, 2, 3, 4, 5, 6])
			assert.deepStrictEqual(a, snapA)
			assert.deepStrictEqual(b, snapB)
			assert.deepStrictEqual(c, snapC)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-array arguments', () => {
			const badArgs = [
				null,
				undefined,
				42,
				'123',
				{},
				new Set([1, 2]),
				new Float64Array([1, 2]),
			]
			for (const bad of badArgs) {
				assert.throws(() => orSortedArrSeries(bad), TypeError)
				assert.throws(() => orSortedArrSeries([], bad), TypeError)
				assert.throws(() => orSortedArrSeries([1, 2], [3], bad), TypeError)
			}
		})

		it('throws TypeError for non-number elements or sparse arrays', () => {
			assert.throws(() => orSortedArrSeries(['1', '2']), TypeError)
			assert.throws(() => orSortedArrSeries([1, null]), TypeError)
			assert.throws(() => orSortedArrSeries([1, undefined]), TypeError)
			assert.throws(() => orSortedArrSeries([1n, 2n]), TypeError)
			assert.throws(() => orSortedArrSeries([true]), TypeError)
			assert.throws(() => orSortedArrSeries([{}]), TypeError)

			// Sparse arrays
			// eslint-disable-next-line no-sparse-arrays
			assert.throws(() => orSortedArrSeries([1, , 3]), TypeError)
			assert.throws(() => orSortedArrSeries(new Array(2)), TypeError)
		})

		it('throws RangeError for non-finite numeric elements', () => {
			assert.throws(() => orSortedArrSeries([NaN]), RangeError)
			assert.throws(() => orSortedArrSeries([1, NaN]), RangeError)
			assert.throws(() => orSortedArrSeries([Infinity]), RangeError)
			assert.throws(() => orSortedArrSeries([-Infinity, 0]), RangeError)
			assert.throws(() => orSortedArrSeries([1, 2], [3, Infinity]), RangeError)
		})

		it('throws RangeError for unsorted arrays', () => {
			assert.throws(() => orSortedArrSeries([2, 1]), RangeError)
			assert.throws(() => orSortedArrSeries([1, 3, 2]), RangeError)
			assert.throws(() => orSortedArrSeries([5, 4, 3]), RangeError)
			assert.throws(() => orSortedArrSeries([], [1, 0]), RangeError)
		})

		it('throws RangeError for duplicate elements', () => {
			assert.throws(() => orSortedArrSeries([1, 1]), RangeError)
			assert.throws(() => orSortedArrSeries([1, 2, 2, 3]), RangeError)
			assert.throws(() => orSortedArrSeries([-0, 0]), RangeError)
			assert.throws(() => orSortedArrSeries([1, 2], [3, 3]), RangeError)
		})
	})

	describe('independent cross-checks & Boolean algebra identities', () => {
		it('matches Set-based union + sort across randomized k-way integer and float trials', () => {
			const rng = createRng(0x5eed1234)
			const ks = [0, 1, 2, 3, 4, 5, 7, 12, 25]

			for (const k of ks) {
				for (let trial = 0; trial < 15; trial++) {
					const useFloats = trial % 2 === 1
					const inputs = Array.from({ length: k }, () =>
						randomSortedUnique(rng, 25, -40, 40, useFloats)
					)
					const actual = orSortedArrSeries(...inputs)
					const expected = refSetUnion(...inputs)

					assert.deepStrictEqual(actual, expected)

					// Verify strict monotonicity invariant on output
					for (let i = 1; i < actual.length; i++) {
						assert.ok(actual[i] > actual[i - 1])
					}
				}
			}
		})

		it('satisfies idempotence, commutativity, associativity, absorption, and distributivity', () => {
			const rng = createRng(0xabc98765)

			for (let trial = 0; trial < 30; trial++) {
				const A = randomSortedUnique(rng, 20, -25, 25)
				const B = randomSortedUnique(rng, 20, -25, 25)
				const C = randomSortedUnique(rng, 20, -25, 25)

				// Identity: A ∪ ∅ = A = ∅ ∪ A
				assert.deepStrictEqual(orSortedArrSeries(A, []), A)
				assert.deepStrictEqual(orSortedArrSeries([], A), A)

				// Idempotence: A ∪ A = A and A ∪ A ∪ A = A
				assert.deepStrictEqual(orSortedArrSeries(A, A), A)
				assert.deepStrictEqual(orSortedArrSeries(A, [...A], [...A]), A)

				// Commutativity: A ∪ B = B ∪ A and permutations of (A, B, C)
				const ab = orSortedArrSeries(A, B)
				assert.deepStrictEqual(ab, orSortedArrSeries(B, A))
				const abc = orSortedArrSeries(A, B, C)
				assert.deepStrictEqual(abc, orSortedArrSeries(C, A, B))
				assert.deepStrictEqual(abc, orSortedArrSeries(B, C, A))

				// Associativity: (A ∪ B) ∪ C = A ∪ (B ∪ C) = orSortedArrSeries(A, B, C)
				assert.deepStrictEqual(
					orSortedArrSeries(ab, C),
					orSortedArrSeries(A, orSortedArrSeries(B, C))
				)
				assert.deepStrictEqual(orSortedArrSeries(ab, C), abc)

				// Absorption: A ∪ (A ∩ B) = A and A ∩ (A ∪ B) = A
				const aInterB = refSetIntersection(A, B)
				assert.deepStrictEqual(orSortedArrSeries(A, aInterB), A)
				assert.deepStrictEqual(refSetIntersection(A, ab), A)

				// Distributivity: A ∪ (B ∩ C) = (A ∪ B) ∩ (A ∪ C)
				const lhsDist = orSortedArrSeries(A, refSetIntersection(B, C))
				const rhsDist = refSetIntersection(
					orSortedArrSeries(A, B),
					orSortedArrSeries(A, C)
				)
				assert.deepStrictEqual(lhsDist, rhsDist)

				// Inclusion-exclusion cardinality identity:
				// |A ∪ B| = |A| + |B| - |A ∩ B|
				assert.strictEqual(ab.length, A.length + B.length - aInterB.length)

				// 3-set inclusion-exclusion cardinality identity:
				const aInterC = refSetIntersection(A, C)
				const bInterC = refSetIntersection(B, C)
				const aInterBInterC = refSetIntersection(aInterB, C)
				assert.strictEqual(
					abc.length,
					A.length +
						B.length +
						C.length -
						aInterB.length -
						aInterC.length -
						bInterC.length +
						aInterBInterC.length
				)
			}
		})

		it('satisfies the pointwise indicator-function identity 1_{A∪B}(x) = 1_A(x) + 1_B(x) - 1_A(x)·1_B(x)', () => {
			const A = [-10, -4, -1, 0, 3, 7, 12]
			const B = [-9, -4, 0, 2, 3, 8, 12, 15]
			const union = orSortedArrSeries(A, B)

			const setA = new Set(A)
			const setB = new Set(B)
			const setU = new Set(union)

			for (let x = -12; x <= 16; x++) {
				const iA = setA.has(x) ? 1 : 0
				const iB = setB.has(x) ? 1 : 0
				const iU = setU.has(x) ? 1 : 0
				assert.strictEqual(iU, iA + iB - iA * iB)
			}
		})

		it('handles large multi-way merge series accurately', () => {
			const rng = createRng(0x13579bdf)
			const k = 64
			const arrays = Array.from({ length: k }, () =>
				randomSortedUnique(rng, 200, -5000, 5000)
			)
			const actual = orSortedArrSeries(...arrays)
			const expected = refSetUnion(...arrays)
			assert.deepStrictEqual(actual, expected)
		})
	})
})
