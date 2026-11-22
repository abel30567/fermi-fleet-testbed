import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { unionSortedArrRecursive } from './unionSortedArrRecursive.js'

/**
 * Independent iterative two-pointer merge-union reference implementation.
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
			i += 1
		} else if (a[i] > b[j]) {
			out.push(b[j] === 0 ? 0 : b[j])
			j += 1
		} else {
			out.push(a[i] === 0 ? 0 : a[i])
			i += 1
			j += 1
		}
	}
	while (i < a.length) {
		out.push(a[i] === 0 ? 0 : a[i])
		i += 1
	}
	while (j < b.length) {
		out.push(b[j] === 0 ? 0 : b[j])
		j += 1
	}
	return out
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property-based tests.
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
 * Generates a sorted, de-duplicated array of integers using the supplied RNG.
 *
 * @param {() => number} rng
 * @param {number} maxLen
 * @param {number} range
 * @returns {number[]}
 */
function randomSortedUnique(rng, maxLen, range) {
	const len = Math.floor(rng() * (maxLen + 1))
	const set = new Set()
	for (let i = 0; i < len; i += 1) {
		set.add(Math.floor(rng() * (2 * range + 1)) - range)
	}
	return Array.from(set).sort((x, y) => x - y)
}

describe('unionSortedArrRecursive', () => {
	describe('normal cases', () => {
		it('merges overlapping sorted arrays and removes duplicates', () => {
			assert.deepStrictEqual(
				unionSortedArrRecursive([1, 3, 5, 7], [2, 3, 6, 7, 8]),
				[1, 2, 3, 5, 6, 7, 8],
			)
		})

		it('merges disjoint arrays regardless of relative order', () => {
			assert.deepStrictEqual(
				unionSortedArrRecursive([1, 2, 3], [4, 5, 6]),
				[1, 2, 3, 4, 5, 6],
			)
			assert.deepStrictEqual(
				unionSortedArrRecursive([10, 20, 30], [1, 2, 3]),
				[1, 2, 3, 10, 20, 30],
			)
		})

		it('handles subset, superset, and identical arrays', () => {
			assert.deepStrictEqual(
				unionSortedArrRecursive([2, 4], [1, 2, 3, 4, 5]),
				[1, 2, 3, 4, 5],
			)
			assert.deepStrictEqual(
				unionSortedArrRecursive([1, 2, 3, 4, 5], [2, 4]),
				[1, 2, 3, 4, 5],
			)
			assert.deepStrictEqual(
				unionSortedArrRecursive([1, 2, 3], [1, 2, 3]),
				[1, 2, 3],
			)
		})

		it('handles negative numbers, floats, and extreme finite bounds', () => {
			const a = [-Number.MAX_VALUE, -100.5, -0.25, 0, 1.5, Number.MAX_SAFE_INTEGER]
			const b = [Number.MIN_SAFE_INTEGER, -100.5, 0.25, 1.5, Number.MAX_VALUE]
			assert.deepStrictEqual(unionSortedArrRecursive(a, b), [
				-Number.MAX_VALUE,
				Number.MIN_SAFE_INTEGER,
				-100.5,
				-0.25,
				0,
				0.25,
				1.5,
				Number.MAX_SAFE_INTEGER,
				Number.MAX_VALUE,
			])
		})

		it('handles strongly asymmetric input lengths in either direction', () => {
			const many = Array.from({ length: 100 }, (_, i) => i * 2)
			const oneHit = [42]
			const oneMiss = [43]

			assert.deepStrictEqual(unionSortedArrRecursive(oneHit, many), many)
			assert.deepStrictEqual(unionSortedArrRecursive(many, oneHit), many)

			const expectedWithMiss = [...many.slice(0, 22), 43, ...many.slice(22)]
			assert.deepStrictEqual(unionSortedArrRecursive(oneMiss, many), expectedWithMiss)
			assert.deepStrictEqual(unionSortedArrRecursive(many, oneMiss), expectedWithMiss)
		})

		it('does not mutate inputs and always returns a new array instance', () => {
			const a = [1, 3, 5]
			const b = []
			const resA = unionSortedArrRecursive(a, b)
			const resB = unionSortedArrRecursive(b, a)

			assert.deepStrictEqual(resA, [1, 3, 5])
			assert.deepStrictEqual(resB, [1, 3, 5])
			assert.notEqual(resA, a)
			assert.notEqual(resB, a)

			resA.push(999)
			assert.deepStrictEqual(a, [1, 3, 5])
			assert.deepStrictEqual(b, [])
		})
	})

	describe('edge cases', () => {
		it('handles empty arrays', () => {
			const emptyA = []
			const emptyB = []
			const res = unionSortedArrRecursive(emptyA, emptyB)
			assert.deepStrictEqual(res, [])
			assert.notEqual(res, emptyA)
			assert.notEqual(res, emptyB)

			assert.deepStrictEqual(unionSortedArrRecursive([7], []), [7])
			assert.deepStrictEqual(unionSortedArrRecursive([], [7]), [7])
		})

		it('handles single-element arrays', () => {
			assert.deepStrictEqual(unionSortedArrRecursive([5], [5]), [5])
			assert.deepStrictEqual(unionSortedArrRecursive([3], [5]), [3, 5])
			assert.deepStrictEqual(unionSortedArrRecursive([5], [3]), [3, 5])
		})

		it('normalizes -0 to +0 consistently regardless of operand order or size', () => {
			const r1 = unionSortedArrRecursive([-0], [0])
			const r2 = unionSortedArrRecursive([-0, 1], [0])
			const r3 = unionSortedArrRecursive([-0], [0, 1])
			const r4 = unionSortedArrRecursive([-0], [])

			assert.equal(r1.length, 1)
			assert.equal(Object.is(r1[0], 0), true)
			assert.equal(Object.is(r2[0], 0), true)
			assert.equal(Object.is(r3[0], 0), true)
			assert.equal(Object.is(r4[0], 0), true)
		})

		it('supports custom comparators and preserves first-array representative on ties', () => {
			const cmpStr = (x, y) => (x < y ? -1 : x > y ? 1 : 0)
			assert.deepStrictEqual(
				unionSortedArrRecursive(['apple', 'cherry', 'fig'], ['banana', 'cherry', 'grape'], cmpStr),
				['apple', 'banana', 'cherry', 'fig', 'grape'],
			)

			const byId = (x, y) => x.id - y.id
			const a = [{ id: 2, src: 'a' }]
			const b = [
				{ id: 1, src: 'b' },
				{ id: 2, src: 'b' },
				{ id: 3, src: 'b' },
			]
			assert.deepStrictEqual(unionSortedArrRecursive(a, b, byId), [
				{ id: 1, src: 'b' },
				{ id: 2, src: 'a' },
				{ id: 3, src: 'b' },
			])
		})

		it('scales to large arrays without exceeding call stack depth (O(log(n+m)) depth)', () => {
			const n = 50_000
			const evens = Array.from({ length: n }, (_, i) => i * 2)
			const multsOfThree = Array.from({ length: n }, (_, i) => i * 3)

			const actual = unionSortedArrRecursive(evens, multsOfThree)
			const expected = iterativeUnionReference(evens, multsOfThree)

			assert.equal(actual.length, expected.length)
			assert.deepStrictEqual(actual, expected)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-array inputs', () => {
			for (const bad of [null, undefined, 42, '123', {}, new Set([1, 2])]) {
				assert.throws(() => unionSortedArrRecursive(bad, [1]), TypeError)
				assert.throws(() => unionSortedArrRecursive([1], bad), TypeError)
			}
		})

		it('throws TypeError for sparse arrays', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3]
			assert.throws(() => unionSortedArrRecursive(sparse, [2]), TypeError)
			assert.throws(() => unionSortedArrRecursive([2], sparse), TypeError)
			assert.throws(
				() => unionSortedArrRecursive(sparse, [2], (x, y) => x - y),
				TypeError,
			)
		})

		it('throws TypeError for non-number elements under default comparator', () => {
			assert.throws(() => unionSortedArrRecursive(['1', '2'], [3]), TypeError)
			assert.throws(() => unionSortedArrRecursive([1], [2, null]), TypeError)
			assert.throws(() => unionSortedArrRecursive([1, undefined], []), TypeError)
			assert.throws(() => unionSortedArrRecursive([1n, 2n], [3]), TypeError)
		})

		it('throws RangeError for non-finite numeric elements under default comparator', () => {
			assert.throws(() => unionSortedArrRecursive([Number.NaN], [1]), RangeError)
			assert.throws(() => unionSortedArrRecursive([1, Infinity], [2]), RangeError)
			assert.throws(() => unionSortedArrRecursive([1], [-Infinity, 2]), RangeError)
		})

		it('throws RangeError for unsorted or duplicated arrays', () => {
			assert.throws(() => unionSortedArrRecursive([3, 1, 2], [4]), RangeError)
			assert.throws(() => unionSortedArrRecursive([1], [2, 1]), RangeError)
			assert.throws(() => unionSortedArrRecursive([1, 2, 2, 3], [4]), RangeError)
			assert.throws(() => unionSortedArrRecursive([1], [5, 5]), RangeError)
			assert.throws(() => unionSortedArrRecursive([-0, 0], [1]), RangeError)
			assert.throws(
				() => unionSortedArrRecursive(['b', 'a'], ['c'], (x, y) => x.localeCompare(y)),
				RangeError,
			)
			assert.throws(
				() => unionSortedArrRecursive(['a', 'a'], ['b'], (x, y) => x.localeCompare(y)),
				RangeError,
			)
		})

		it('throws TypeError for invalid comparator or non-finite comparator result', () => {
			assert.throws(() => unionSortedArrRecursive([1], [2], 'not-a-fn'), TypeError)
			assert.throws(() => unionSortedArrRecursive([1], [2], 123), TypeError)
			assert.throws(() => unionSortedArrRecursive([1], [2], () => Number.NaN), TypeError)
			assert.throws(() => unionSortedArrRecursive([1], [2], () => '0'), TypeError)
			assert.throws(() => unionSortedArrRecursive([1, 2], [3], () => Infinity), TypeError)
		})
	})

	describe('cross-checks and algebraic identities', () => {
		it('matches independent Set-based and iterative reference implementations on random cases', () => {
			const rng = createRng(20261122)

			for (let trial = 0; trial < 200; trial += 1) {
				const maxLen = trial % 20 === 0 ? 200 : 30
				const range = trial % 5 === 0 ? 15 : 100
				const a = randomSortedUnique(rng, maxLen, range)
				const b = randomSortedUnique(rng, maxLen, range)

				const actual = unionSortedArrRecursive(a, b)
				const iterRef = iterativeUnionReference(a, b)
				const setRef = Array.from(new Set([...a, ...b])).sort((x, y) => x - y)

				assert.deepStrictEqual(actual, iterRef)
				assert.deepStrictEqual(actual, setRef)

				// Verify strict ascending invariant of result
				for (let i = 1; i < actual.length; i += 1) {
					assert.ok(actual[i - 1] < actual[i])
				}
			}
		})

		it('satisfies commutativity, associativity, idempotence, identity, and inclusion-exclusion', () => {
			const rng = createRng(987654321)

			for (let trial = 0; trial < 50; trial += 1) {
				const a = randomSortedUnique(rng, 25, 20)
				const b = randomSortedUnique(rng, 25, 20)
				const c = randomSortedUnique(rng, 25, 20)

				const ab = unionSortedArrRecursive(a, b)
				const ba = unionSortedArrRecursive(b, a)

				// Commutativity: A ∪ B = B ∪ A
				assert.deepStrictEqual(ab, ba)

				// Associativity: (A ∪ B) ∪ C = A ∪ (B ∪ C)
				assert.deepStrictEqual(
					unionSortedArrRecursive(ab, c),
					unionSortedArrRecursive(a, unionSortedArrRecursive(b, c)),
				)

				// Idempotence: A ∪ A = A
				assert.deepStrictEqual(unionSortedArrRecursive(a, a), a)

				// Identity: A ∪ ∅ = A = ∅ ∪ A
				assert.deepStrictEqual(unionSortedArrRecursive(a, []), a)
				assert.deepStrictEqual(unionSortedArrRecursive([], a), a)

				// Inclusion-Exclusion: |A ∪ B| = |A| + |B| - |A ∩ B|
				const setB = new Set(b)
				let intersectionSize = 0
				for (const x of a) {
					if (setB.has(x)) intersectionSize += 1
				}
				assert.equal(ab.length, a.length + b.length - intersectionSize)
			}
		})
	})
})
