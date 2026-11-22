import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { orSortedArrRecursive } from './orSortedArrRecursive.js'

/**
 * Independent iterative two-pointer merge reference implementation for set union.
 *
 * @param {readonly number[]} a
 * @param {readonly number[]} b
 * @returns {number[]}
 */
function iterativeUnionReference(a, b) {
	const out = []
	let i = 0
	let j = 0
	while (i < a.length && j < b.length) {
		if (a[i] < b[j]) {
			out.push(a[i] === 0 ? 0 : a[i])
			i++
		} else if (b[j] < a[i]) {
			out.push(b[j] === 0 ? 0 : b[j])
			j++
		} else {
			out.push(a[i] === 0 ? 0 : a[i])
			i++
			j++
		}
	}
	while (i < a.length) {
		out.push(a[i] === 0 ? 0 : a[i])
		i++
	}
	while (j < b.length) {
		out.push(b[j] === 0 ? 0 : b[j])
		j++
	}
	return out
}

/**
 * Independent Set + sort reference implementation for set union.
 *
 * @param {readonly number[]} a
 * @param {readonly number[]} b
 * @returns {number[]}
 */
function setUnionReference(a, b) {
	const set = new Set()
	for (const x of a) set.add(x === 0 ? 0 : x)
	for (const x of b) set.add(x === 0 ? 0 : x)
	return Array.from(set).sort((x, y) => x - y)
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible randomized cross-checks.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function mulberry32(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * Generates a sorted, de-duplicated array of integers using the given PRNG.
 *
 * @param {() => number} rand
 * @param {number} maxLen
 * @param {number} minVal
 * @param {number} maxVal
 * @returns {number[]}
 */
function randomSortedUnique(rand, maxLen, minVal, maxVal) {
	const len = Math.floor(rand() * (maxLen + 1))
	const set = new Set()
	const span = maxVal - minVal + 1
	for (let i = 0; i < len; i++) {
		set.add(minVal + Math.floor(rand() * span))
	}
	return Array.from(set).sort((x, y) => x - y)
}

describe('orSortedArrRecursive', () => {
	describe('normal cases', () => {
		it('computes union of overlapping sorted arrays', () => {
			assert.deepStrictEqual(
				orSortedArrRecursive([1, 3, 5, 7], [2, 3, 4, 7, 9]),
				[1, 2, 3, 4, 5, 7, 9]
			)
		})

		it('computes union of completely disjoint arrays in both orders', () => {
			assert.deepStrictEqual(
				orSortedArrRecursive([1, 2, 3], [10, 20, 30]),
				[1, 2, 3, 10, 20, 30]
			)
			assert.deepStrictEqual(
				orSortedArrRecursive([10, 20, 30], [1, 2, 3]),
				[1, 2, 3, 10, 20, 30]
			)
		})

		it('computes union of interleaved arrays', () => {
			assert.deepStrictEqual(
				orSortedArrRecursive([0, 2, 4, 6, 8], [1, 3, 5, 7, 9]),
				[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
			)
		})

		it('computes union when one array is a subset of the other', () => {
			assert.deepStrictEqual(
				orSortedArrRecursive([2, 4], [1, 2, 3, 4, 5]),
				[1, 2, 3, 4, 5]
			)
			assert.deepStrictEqual(
				orSortedArrRecursive([1, 2, 3, 4, 5], [2, 4]),
				[1, 2, 3, 4, 5]
			)
		})

		it('computes union of identical arrays and same-reference array', () => {
			const arr = [-5, 0, 5, 10]
			assert.deepStrictEqual(orSortedArrRecursive(arr, [-5, 0, 5, 10]), [
				-5, 0, 5, 10
			])
			const sameRef = orSortedArrRecursive(arr, arr)
			assert.deepStrictEqual(sameRef, arr)
			assert.notStrictEqual(sameRef, arr)
		})

		it('handles negative numbers, floats, subnormals, and extreme finite values', () => {
			const a = [
				-Number.MAX_VALUE,
				Number.MIN_SAFE_INTEGER,
				-1.5,
				-Number.MIN_VALUE,
				0.25,
				Number.MAX_SAFE_INTEGER
			]
			const b = [
				Number.MIN_SAFE_INTEGER,
				-1.25,
				0,
				Number.MIN_VALUE,
				0.25,
				Number.MAX_VALUE
			]
			assert.deepStrictEqual(orSortedArrRecursive(a, b), [
				-Number.MAX_VALUE,
				Number.MIN_SAFE_INTEGER,
				-1.5,
				-1.25,
				-Number.MIN_VALUE,
				0,
				Number.MIN_VALUE,
				0.25,
				Number.MAX_SAFE_INTEGER,
				Number.MAX_VALUE
			])
		})

		it('handles highly asymmetric array lengths in both argument orders', () => {
			const big = Array.from({ length: 2000 }, (_, i) => i * 2)
			assert.deepStrictEqual(
				orSortedArrRecursive(big, [1001]),
				iterativeUnionReference(big, [1001])
			)
			assert.deepStrictEqual(
				orSortedArrRecursive([1001], big),
				iterativeUnionReference([1001], big)
			)
			assert.deepStrictEqual(
				orSortedArrRecursive(big, [1000]),
				big
			)
		})
	})

	describe('edge cases', () => {
		it('handles empty arrays', () => {
			assert.deepStrictEqual(orSortedArrRecursive([], []), [])
			assert.deepStrictEqual(orSortedArrRecursive([], [1, 2, 3]), [1, 2, 3])
			assert.deepStrictEqual(orSortedArrRecursive([1, 2, 3], []), [1, 2, 3])
		})

		it('handles single-element arrays', () => {
			assert.deepStrictEqual(orSortedArrRecursive([5], [5]), [5])
			assert.deepStrictEqual(orSortedArrRecursive([3], [7]), [3, 7])
			assert.deepStrictEqual(orSortedArrRecursive([7], [3]), [3, 7])
		})

		it('normalizes -0 to 0 and treats -0 and 0 as equal', () => {
			const res1 = orSortedArrRecursive([-0], [0])
			assert.deepStrictEqual(res1, [0])
			assert.ok(Object.is(res1[0], 0))

			const res2 = orSortedArrRecursive([0], [-0])
			assert.deepStrictEqual(res2, [0])
			assert.ok(Object.is(res2[0], 0))

			const res3 = orSortedArrRecursive([-0], [])
			assert.deepStrictEqual(res3, [0])
			assert.ok(Object.is(res3[0], 0))

			const res4 = orSortedArrRecursive([], [-1, -0, 1])
			assert.deepStrictEqual(res4, [-1, 0, 1])
			assert.ok(Object.is(res4[1], 0))
		})

		it('does not mutate inputs and always returns a new array', () => {
			const a = [1, 3, 5]
			const b = []
			const res = orSortedArrRecursive(a, b)
			assert.notStrictEqual(res, a)
			assert.notStrictEqual(res, b)
			res.push(999)
			assert.deepStrictEqual(a, [1, 3, 5])
			assert.deepStrictEqual(b, [])
		})

		it('handles large arrays without stack overflow (logarithmic recursion depth)', () => {
			const n = 50_000
			const a = Array.from({ length: n }, (_, i) => i * 2)
			const b = Array.from({ length: n }, (_, i) => i * 2 + 1)
			const res = orSortedArrRecursive(a, b)
			assert.equal(res.length, 2 * n)
			assert.equal(res[0], 0)
			assert.equal(res[res.length - 1], 2 * n - 1)
			assert.deepStrictEqual(res, iterativeUnionReference(a, b))
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-array inputs', () => {
			const invalid = [
				null,
				undefined,
				42,
				'123',
				{},
				new Set([1, 2]),
				new Float64Array([1, 2])
			]
			for (const bad of invalid) {
				assert.throws(() => orSortedArrRecursive(bad, [1, 2]), TypeError)
				assert.throws(() => orSortedArrRecursive([1, 2], bad), TypeError)
			}
		})

		it('throws TypeError for sparse arrays', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3]
			assert.throws(() => orSortedArrRecursive(sparse, [2]), TypeError)
			assert.throws(() => orSortedArrRecursive([2], sparse), TypeError)
			assert.throws(() => orSortedArrRecursive(new Array(2), []), TypeError)
		})

		it('throws TypeError for non-number elements', () => {
			const badArrays = [
				['1', 2],
				[1, null],
				[1, undefined],
				[1, 2n],
				[true],
				[{}]
			]
			for (const bad of badArrays) {
				assert.throws(() => orSortedArrRecursive(bad, [1]), TypeError)
				assert.throws(() => orSortedArrRecursive([1], bad), TypeError)
			}
		})

		it('throws RangeError for non-finite numbers', () => {
			for (const bad of [[NaN], [1, NaN], [-Infinity, 0], [0, Infinity]]) {
				assert.throws(() => orSortedArrRecursive(bad, [1]), RangeError)
				assert.throws(() => orSortedArrRecursive([1], bad), RangeError)
			}
		})

		it('throws RangeError for arrays with duplicate elements', () => {
			for (const bad of [
				[1, 1],
				[1, 2, 2, 3],
				[-0, 0],
				[0, -0]
			]) {
				assert.throws(() => orSortedArrRecursive(bad, []), RangeError)
				assert.throws(() => orSortedArrRecursive([], bad), RangeError)
			}
		})

		it('throws RangeError for unsorted arrays even when the other array is empty', () => {
			for (const bad of [
				[2, 1],
				[1, 3, 2],
				[5, 4, 3, 2, 1]
			]) {
				assert.throws(() => orSortedArrRecursive(bad, []), RangeError)
				assert.throws(() => orSortedArrRecursive([], bad), RangeError)
			}
		})
	})

	describe('cross-checks and algebraic identities', () => {
		it('matches both iterative merge and Set-based union across 150 random pairs', () => {
			const rand = mulberry32(20261122)
			for (let trial = 0; trial < 150; trial++) {
				const a = randomSortedUnique(rand, 60, -50, 50)
				const b = randomSortedUnique(rand, 60, -50, 50)
				const actual = orSortedArrRecursive(a, b)
				const expectedIter = iterativeUnionReference(a, b)
				const expectedSet = setUnionReference(a, b)

				assert.deepStrictEqual(actual, expectedIter)
				assert.deepStrictEqual(actual, expectedSet)

				// Verify output invariant: strictly ascending
				for (let i = 1; i < actual.length; i++) {
					assert.ok(actual[i] > actual[i - 1])
				}
			}
		})

		it('satisfies set union algebraic laws (commutativity, associativity, idempotence, identity, inclusion-exclusion)', () => {
			const rand = mulberry32(1337)
			for (let trial = 0; trial < 40; trial++) {
				const a = randomSortedUnique(rand, 30, -25, 25)
				const b = randomSortedUnique(rand, 30, -25, 25)
				const c = randomSortedUnique(rand, 30, -25, 25)

				// Commutativity: A ∪ B = B ∪ A
				const ab = orSortedArrRecursive(a, b)
				const ba = orSortedArrRecursive(b, a)
				assert.deepStrictEqual(ab, ba)

				// Associativity: (A ∪ B) ∪ C = A ∪ (B ∪ C)
				const lhs = orSortedArrRecursive(ab, c)
				const rhs = orSortedArrRecursive(a, orSortedArrRecursive(b, c))
				assert.deepStrictEqual(lhs, rhs)

				// Idempotence: A ∪ A = A
				assert.deepStrictEqual(orSortedArrRecursive(a, a), a)

				// Identity: A ∪ ∅ = A and ∅ ∪ A = A
				assert.deepStrictEqual(orSortedArrRecursive(a, []), a)
				assert.deepStrictEqual(orSortedArrRecursive([], a), a)

				// Inclusion-exclusion: |A ∪ B| = |A| + |B| - |A ∩ B|
				const bSet = new Set(b)
				const intersectionSize = a.filter((x) => bSet.has(x)).length
				assert.equal(ab.length, a.length + b.length - intersectionSize)
			}
		})
	})
})
