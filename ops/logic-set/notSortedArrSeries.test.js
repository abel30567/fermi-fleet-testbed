import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { notSortedArrSeries } from './notSortedArrSeries.js'

/**
 * Independent reference complement implementation using JavaScript `Set`.
 * @param {readonly number[]} a
 * @param {readonly number[]} universe
 * @returns {number[]}
 */
function setComplementRef(a, universe) {
	const setA = new Set(a)
	return universe.filter((u) => !setA.has(u))
}

/**
 * Independent `Set`-based sorted union helper for Boolean identity verification.
 * @param {readonly number[]} a
 * @param {readonly number[]} b
 * @returns {number[]}
 */
function setUnionRef(a, b) {
	return [...new Set([...a, ...b])].sort((x, y) => x - y)
}

/**
 * Independent `Set`-based sorted intersection helper for Boolean identity verification.
 * @param {readonly number[]} a
 * @param {readonly number[]} b
 * @returns {number[]}
 */
function setIntersectionRef(a, b) {
	const setB = new Set(b)
	return a.filter((x) => setB.has(x))
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible randomized property tests.
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

describe('notSortedArrSeries', () => {
	describe('normal cases', () => {
		it('computes complement for a standard subset of universe', () => {
			assert.deepEqual(notSortedArrSeries([2, 4, 6], [1, 2, 3, 4, 5, 6, 7]), [1, 3, 5, 7])
		})

		it('handles negative, zero, and floating-point numbers', () => {
			const universe = [-100.5, -10, -0.25, 0, 0.25, 1.5, 42.125]
			const a = [-10, 0, 1.5]
			assert.deepEqual(notSortedArrSeries(a, universe), [-100.5, -0.25, 0.25, 42.125])
		})

		it('handles elements in `a` that lie outside `universe` (U \\ A = U \\ (A ∩ U))', () => {
			const universe = [10, 20, 30, 40]
			const a = [-5, 0, 10, 15, 25, 30, 50, 100]
			assert.deepEqual(notSortedArrSeries(a, universe), [20, 40])
		})

		it('handles completely disjoint `a` and `universe`', () => {
			assert.deepEqual(notSortedArrSeries([1, 2, 3], [10, 20, 30]), [10, 20, 30])
			assert.deepEqual(notSortedArrSeries([40, 50, 60], [10, 20, 30]), [10, 20, 30])
			assert.deepEqual(notSortedArrSeries([5, 15, 25, 35], [10, 20, 30]), [10, 20, 30])
		})

		it('does not mutate inputs and returns a fresh array copy', () => {
			const a = [2, 4]
			const universe = [1, 2, 3, 4, 5]
			const aCopy = [...a]
			const uCopy = [...universe]

			const res = notSortedArrSeries(a, universe)
			assert.deepEqual(res, [1, 3, 5])
			assert.deepEqual(a, aCopy)
			assert.deepEqual(universe, uCopy)

			const fullCopy = notSortedArrSeries([], universe)
			assert.deepEqual(fullCopy, universe)
			assert.notEqual(fullCopy, universe)
		})
	})

	describe('edge cases', () => {
		it('handles empty arrays', () => {
			assert.deepEqual(notSortedArrSeries([], []), [])
			assert.deepEqual(notSortedArrSeries([], [1, 2, 3]), [1, 2, 3])
			assert.deepEqual(notSortedArrSeries([1, 2, 3], []), [])
		})

		it('handles single-element arrays', () => {
			assert.deepEqual(notSortedArrSeries([5], [5]), [])
			assert.deepEqual(notSortedArrSeries([4], [5]), [5])
			assert.deepEqual(notSortedArrSeries([6], [5]), [5])
			assert.deepEqual(notSortedArrSeries([], [5]), [5])
			assert.deepEqual(notSortedArrSeries([5], []), [])
		})

		it('handles extreme finite IEEE-754 numeric bounds', () => {
			const universe = [
				-Number.MAX_VALUE,
				Number.MIN_SAFE_INTEGER,
				-Number.MIN_VALUE,
				0,
				Number.MIN_VALUE,
				Number.MAX_SAFE_INTEGER,
				Number.MAX_VALUE,
			]
			const a = [-Number.MAX_VALUE, 0, Number.MAX_VALUE]
			assert.deepEqual(notSortedArrSeries(a, universe), [
				Number.MIN_SAFE_INTEGER,
				-Number.MIN_VALUE,
				Number.MIN_VALUE,
				Number.MAX_SAFE_INTEGER,
			])
		})

		it('treats -0 and +0 as equal in membership matching', () => {
			assert.deepEqual(notSortedArrSeries([-0], [-1, 0, 1]), [-1, 1])
			assert.deepEqual(notSortedArrSeries([0], [-1, -0, 1]), [-1, 1])
		})

		it('scales linearly on large arrays', () => {
			const n = 20000
			const universe = Array.from({ length: n }, (_, i) => i)
			const evens = Array.from({ length: n / 2 }, (_, i) => i * 2)
			const odds = Array.from({ length: n / 2 }, (_, i) => i * 2 + 1)

			assert.deepEqual(notSortedArrSeries(evens, universe), odds)
			assert.deepEqual(notSortedArrSeries(odds, universe), evens)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-array inputs', () => {
			assert.throws(() => notSortedArrSeries(), TypeError)
			assert.throws(() => notSortedArrSeries([]), TypeError)
			assert.throws(() => notSortedArrSeries(null, []), TypeError)
			assert.throws(() => notSortedArrSeries([], null), TypeError)
			assert.throws(() => notSortedArrSeries(undefined, []), TypeError)
			assert.throws(() => notSortedArrSeries([], undefined), TypeError)
			assert.throws(() => notSortedArrSeries('123', [1, 2, 3]), TypeError)
			assert.throws(() => notSortedArrSeries([1, 2], '123'), TypeError)
			assert.throws(() => notSortedArrSeries(new Set([1]), [1, 2]), TypeError)
			assert.throws(() => notSortedArrSeries([1], new Set([1, 2])), TypeError)
			assert.throws(() => notSortedArrSeries(new Float64Array([1]), [1, 2]), TypeError)
			assert.throws(() => notSortedArrSeries({}, []), TypeError)
		})

		it('throws TypeError for non-number elements', () => {
			assert.throws(() => notSortedArrSeries(['1'], [1, 2]), TypeError)
			assert.throws(() => notSortedArrSeries([1], [1, '2']), TypeError)
			assert.throws(() => notSortedArrSeries([null], [1, 2]), TypeError)
			assert.throws(() => notSortedArrSeries([1], [undefined]), TypeError)
			assert.throws(() => notSortedArrSeries([true], [1]), TypeError)
			assert.throws(() => notSortedArrSeries([1n], [1]), TypeError)
			// Validates entire `a` even when `universe` is empty
			assert.throws(() => notSortedArrSeries([1, 'bad'], []), TypeError)
		})

		it('throws RangeError for non-finite numbers (NaN, Infinity, -Infinity)', () => {
			assert.throws(() => notSortedArrSeries([NaN], [1, 2]), RangeError)
			assert.throws(() => notSortedArrSeries([1], [NaN]), RangeError)
			assert.throws(() => notSortedArrSeries([Infinity], [1, 2]), RangeError)
			assert.throws(() => notSortedArrSeries([-Infinity], [1, 2]), RangeError)
			assert.throws(() => notSortedArrSeries([1], [-Infinity, 1, Infinity]), RangeError)
			// Validates trailing elements in `a` past `universe` max
			assert.throws(() => notSortedArrSeries([1, 100, NaN], [1, 2]), RangeError)
		})

		it('throws RangeError for unsorted arrays', () => {
			assert.throws(() => notSortedArrSeries([2, 1], [1, 2, 3]), RangeError)
			assert.throws(() => notSortedArrSeries([1, 3, 2], [1, 2, 3]), RangeError)
			assert.throws(() => notSortedArrSeries([1], [3, 2, 1]), RangeError)
			assert.throws(() => notSortedArrSeries([], [1, 5, 4]), RangeError)
			assert.throws(() => notSortedArrSeries([10, 5], []), RangeError)
		})

		it('throws RangeError for duplicate elements', () => {
			assert.throws(() => notSortedArrSeries([1, 1], [1, 2, 3]), RangeError)
			assert.throws(() => notSortedArrSeries([1, 2, 2, 3], [1, 2, 3]), RangeError)
			assert.throws(() => notSortedArrSeries([1], [1, 2, 2]), RangeError)
			assert.throws(() => notSortedArrSeries([-0, 0], [-1, 0, 1]), RangeError)
			assert.throws(() => notSortedArrSeries([], [0, -0]), RangeError)
		})
	})

	describe('cross-checks and Boolean algebra identities', () => {
		it('satisfies boundary identities: NOT(∅, U) = U and NOT(U, U) = ∅', () => {
			const universes = [[], [0], [-5, -1, 0, 2.5, 10], [1, 2, 3, 4, 5, 6, 7, 8]]
			for (const U of universes) {
				assert.deepEqual(notSortedArrSeries([], U), U)
				assert.deepEqual(notSortedArrSeries(U, U), [])
			}
		})

		it('satisfies double negation identity: NOT(NOT(A, U), U) = A for A ⊆ U, and A ∩ U in general', () => {
			const U = [-10, -5, -1, 0, 1, 2, 3, 4, 5, 10]
			const subsets = [[], [-10], [0, 3, 10], [-10, -5, -1, 0, 1, 2, 3, 4, 5, 10]]

			for (const A of subsets) {
				const notA = notSortedArrSeries(A, U)
				const notNotA = notSortedArrSeries(notA, U)
				assert.deepEqual(notNotA, A)
			}

			// General case where A is not a subset of U: NOT(NOT(A, U), U) = A ∩ U
			const generalA = [-100, -10, -3, 0, 2.5, 5, 99]
			const notNotGeneral = notSortedArrSeries(notSortedArrSeries(generalA, U), U)
			assert.deepEqual(notNotGeneral, setIntersectionRef(generalA, U))
		})

		it("satisfies De Morgan's laws: NOT(A ∪ B) = NOT(A) ∩ NOT(B) and NOT(A ∩ B) = NOT(A) ∪ NOT(B)", () => {
			const rand = mulberry32(0x5eed1234)
			for (let trial = 0; trial < 40; trial++) {
				const uSize = Math.floor(rand() * 35)
				const uSet = new Set()
				while (uSet.size < uSize) {
					uSet.add(Math.floor(rand() * 80) - 40)
				}
				const U = [...uSet].sort((x, y) => x - y)

				const A = U.filter(() => rand() < 0.45)
				const B = U.filter(() => rand() < 0.45)

				const notA = notSortedArrSeries(A, U)
				const notB = notSortedArrSeries(B, U)
				const unionAB = setUnionRef(A, B)
				const interAB = setIntersectionRef(A, B)

				// De Morgan 1: NOT(A ∪ B) = NOT(A) ∩ NOT(B)
				assert.deepEqual(
					notSortedArrSeries(unionAB, U),
					setIntersectionRef(notA, notB)
				)

				// De Morgan 2: NOT(A ∩ B) = NOT(A) ∪ NOT(B)
				assert.deepEqual(
					notSortedArrSeries(interAB, U),
					setUnionRef(notA, notB)
				)
			}
		})

		it('satisfies excluded middle, non-contradiction, cardinality, antitone order, and indicator identity', () => {
			const rand = mulberry32(0xcafebabe)
			for (let trial = 0; trial < 50; trial++) {
				const U = Array.from({ length: 30 }, (_, i) => (i - 15) * 0.5)
				const A = U.filter(() => rand() < 0.4)
				// Construct B such that A ⊆ B ⊆ U
				const B = U.filter((u) => A.includes(u) || rand() < 0.35)

				const notA = notSortedArrSeries(A, U)
				const notB = notSortedArrSeries(B, U)

				// Excluded middle: A ∪ NOT(A) = U
				assert.deepEqual(setUnionRef(A, notA), U)

				// Non-contradiction: A ∩ NOT(A) = ∅
				assert.deepEqual(setIntersectionRef(A, notA), [])

				// Cardinality: |A| + |NOT(A)| = |U|
				assert.equal(A.length + notA.length, U.length)

				// Antitone property: A ⊆ B => NOT(B) ⊆ NOT(A)
				const setNotA = new Set(notA)
				for (const x of notB) {
					assert.equal(setNotA.has(x), true)
				}

				// Indicator identity: 1_{NOT(A)}(u) = 1 - 1_A(u) for all u ∈ U
				const setA = new Set(A)
				for (const u of U) {
					const indA = setA.has(u) ? 1 : 0
					const indNotA = setNotA.has(u) ? 1 : 0
					assert.equal(indNotA, 1 - indA)
				}
			}
		})

		it('matches independent Set-based complement across randomized inputs (including out-of-universe values)', () => {
			const rand = mulberry32(0x12345678)
			for (let trial = 0; trial < 100; trial++) {
				const makeSortedUnique = (maxLen) => {
					const len = Math.floor(rand() * maxLen)
					const s = new Set()
					for (let k = 0; k < len; k++) {
						s.add(Math.floor(rand() * 120) - 60)
					}
					return [...s].sort((x, y) => x - y)
				}

				const A = makeSortedUnique(50)
				const U = makeSortedUnique(50)

				const actual = notSortedArrSeries(A, U)
				const expected = setComplementRef(A, U)
				assert.deepEqual(actual, expected)

				// Verify strict monotonicity and uniqueness invariant on output
				for (let k = 1; k < actual.length; k++) {
					assert.ok(actual[k - 1] < actual[k])
				}
			}
		})
	})
})
