import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { xorSortedArrRecursive } from './xorSortedArrRecursive.js'

/**
 * Independent iterative two-pointer reference implementation for cross-checking.
 */
function xorIterativeReference(a, b) {
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
 * Independent Set-based symmetric difference `(A \ B) ∪ (B \ A)` for cross-checking.
 */
function xorSetReference(a, b) {
	const setA = new Set(a.map((x) => (x === 0 ? 0 : x)))
	const setB = new Set(b.map((x) => (x === 0 ? 0 : x)))
	const out = []
	for (const x of setA) {
		if (!setB.has(x)) out.push(x)
	}
	for (const x of setB) {
		if (!setA.has(x)) out.push(x)
	}
	out.sort((x, y) => x - y)
	return out
}

/**
 * Simple deterministic PRNG (Mulberry32) for reproducible randomized tests.
 */
function createPrng(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function generateSortedUniqueArray(rand, maxLen, minVal, maxVal) {
	const len = Math.floor(rand() * (maxLen + 1))
	const set = new Set()
	const span = maxVal - minVal + 1
	for (let i = 0; i < len; i++) {
		set.add(minVal + Math.floor(rand() * span))
	}
	return Array.from(set).sort((x, y) => x - y)
}

describe('xorSortedArrRecursive', () => {
	describe('normal cases', () => {
		it('computes symmetric difference of partially overlapping arrays', () => {
			assert.deepStrictEqual(xorSortedArrRecursive([1, 2, 3, 5], [2, 3, 4, 6]), [1, 4, 5, 6])
			assert.deepStrictEqual(xorSortedArrRecursive([1, 3, 5, 7, 9], [2, 3, 5, 8, 9]), [1, 2, 7, 8])
		})

		it('computes symmetric difference of disjoint arrays', () => {
			assert.deepStrictEqual(xorSortedArrRecursive([1, 2, 3], [4, 5, 6]), [1, 2, 3, 4, 5, 6])
			assert.deepStrictEqual(xorSortedArrRecursive([10, 20, 30], [-5, 0, 5]), [-5, 0, 5, 10, 20, 30])
			assert.deepStrictEqual(xorSortedArrRecursive([0, 2, 4, 6], [1, 3, 5, 7]), [0, 1, 2, 3, 4, 5, 6, 7])
		})

		it('handles subset and superset relationships', () => {
			assert.deepStrictEqual(xorSortedArrRecursive([2, 4], [1, 2, 3, 4, 5]), [1, 3, 5])
			assert.deepStrictEqual(xorSortedArrRecursive([1, 2, 3, 4, 5], [2, 4]), [1, 3, 5])
		})

		it('handles negative numbers and floating-point values', () => {
			assert.deepStrictEqual(
				xorSortedArrRecursive([-10.5, -2.25, 0, 1.5, 3.14], [-10.5, -1, 0, 2.71, 3.14]),
				[-2.25, -1, 1.5, 2.71],
			)
		})

		it('handles highly asymmetric array lengths in both directions', () => {
			const big = Array.from({ length: 100 }, (_, i) => i * 2)
			const small = [0, 50, 99, 198, 250]
			const expected = xorIterativeReference(big, small)

			assert.deepStrictEqual(xorSortedArrRecursive(big, small), expected)
			assert.deepStrictEqual(xorSortedArrRecursive(small, big), expected)
		})
	})

	describe('edge cases', () => {
		it('handles empty arrays', () => {
			assert.deepStrictEqual(xorSortedArrRecursive([], []), [])
			assert.deepStrictEqual(xorSortedArrRecursive([1, 2, 3], []), [1, 2, 3])
			assert.deepStrictEqual(xorSortedArrRecursive([], [1, 2, 3]), [1, 2, 3])
		})

		it('handles single-element arrays', () => {
			assert.deepStrictEqual(xorSortedArrRecursive([42], [42]), [])
			assert.deepStrictEqual(xorSortedArrRecursive([1], [2]), [1, 2])
			assert.deepStrictEqual(xorSortedArrRecursive([2], [1]), [1, 2])
		})

		it('returns empty array for identical inputs', () => {
			const arr = [-100, -1, 0, 1, 42, 1000]
			assert.deepStrictEqual(xorSortedArrRecursive(arr, [...arr]), [])
			assert.deepStrictEqual(xorSortedArrRecursive(arr, arr), [])
		})

		it('handles extreme finite boundary numbers', () => {
			const a = [-Number.MAX_VALUE, Number.MIN_SAFE_INTEGER, -Number.MIN_VALUE, Number.MAX_SAFE_INTEGER]
			const b = [-Number.MAX_VALUE, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE]
			assert.deepStrictEqual(xorSortedArrRecursive(a, b), [
				Number.MIN_SAFE_INTEGER,
				-Number.MIN_VALUE,
				Number.MIN_VALUE,
				Number.MAX_VALUE,
			])
		})

		it('treats -0 and 0 as equal and avoids emitting -0', () => {
			assert.deepStrictEqual(xorSortedArrRecursive([-0], [0]), [])
			const resLeft = xorSortedArrRecursive([-0, 2], [1, 2])
			assert.deepStrictEqual(resLeft, [0, 1])
			assert.equal(Object.is(resLeft[0], 0), true)

			const resEmptyRight = xorSortedArrRecursive([-0], [])
			assert.deepStrictEqual(resEmptyRight, [0])
			assert.equal(Object.is(resEmptyRight[0], 0), true)

			const resEmptyLeft = xorSortedArrRecursive([], [-0])
			assert.deepStrictEqual(resEmptyLeft, [0])
			assert.equal(Object.is(resEmptyLeft[0], 0), true)
		})

		it('does not mutate inputs and always returns a new array', () => {
			const a = [1, 2, 3]
			const b = []
			const resA = xorSortedArrRecursive(a, b)
			assert.notEqual(resA, a)
			assert.notEqual(resA, b)
			resA.push(99)
			assert.deepStrictEqual(a, [1, 2, 3])
			assert.deepStrictEqual(b, [])

			const c = [2, 3, 4]
			const resAC = xorSortedArrRecursive(a, c)
			assert.deepStrictEqual(resAC, [1, 4])
			assert.deepStrictEqual(a, [1, 2, 3])
			assert.deepStrictEqual(c, [2, 3, 4])
		})

		it('handles large inputs without overflowing the call stack', () => {
			const n = 50_000
			// Evens [0, 2, 4, ...] vs multiples of 3 [0, 3, 6, ...]
			const a = Array.from({ length: n }, (_, i) => i * 2)
			const b = Array.from({ length: n }, (_, i) => i * 3)
			const actual = xorSortedArrRecursive(a, b)
			const expected = xorIterativeReference(a, b)
			assert.deepStrictEqual(actual, expected)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-array arguments', () => {
			const invalid = [null, undefined, 42, '123', {}, new Set([1, 2]), new Float64Array([1, 2])]
			for (const bad of invalid) {
				assert.throws(() => xorSortedArrRecursive(bad, [1, 2]), TypeError)
				assert.throws(() => xorSortedArrRecursive([1, 2], bad), TypeError)
			}
		})

		it('throws TypeError for non-number elements and sparse arrays', () => {
			const sparse = [1, , 3] // eslint-disable-line no-sparse-arrays
			const badArrays = [['1'], [1, '2'], [null], [undefined], [true], [1n], [{}], sparse, new Array(2)]
			for (const bad of badArrays) {
				assert.throws(() => xorSortedArrRecursive(bad, []), TypeError)
				assert.throws(() => xorSortedArrRecursive([], bad), TypeError)
			}
		})

		it('throws RangeError for non-finite numeric elements', () => {
			const nonFinite = [[NaN], [1, NaN], [Infinity], [-Infinity], [-Infinity, 0, 1], [0, 1, Infinity]]
			for (const bad of nonFinite) {
				assert.throws(() => xorSortedArrRecursive(bad, [1]), RangeError)
				assert.throws(() => xorSortedArrRecursive([1], bad), RangeError)
			}
		})

		it('throws RangeError for duplicate elements', () => {
			const withDups = [
				[1, 1],
				[1, 2, 2, 3],
				[-5, -5, 0],
				[-0, 0],
			]
			for (const bad of withDups) {
				assert.throws(() => xorSortedArrRecursive(bad, []), RangeError)
				assert.throws(() => xorSortedArrRecursive([], bad), RangeError)
			}
		})

		it('throws RangeError for unsorted arrays', () => {
			const unsorted = [
				[2, 1],
				[1, 3, 2],
				[5, 4, 3, 2, 1],
				[-1, -2],
			]
			for (const bad of unsorted) {
				assert.throws(() => xorSortedArrRecursive(bad, []), RangeError)
				assert.throws(() => xorSortedArrRecursive([], bad), RangeError)
			}
		})
	})

	describe('cross-checks and algebraic identities', () => {
		it('matches independent iterative and Set references across 200 randomized trials', () => {
			const rand = createPrng(0x5eed15)
			for (let trial = 0; trial < 200; trial++) {
				const a = generateSortedUniqueArray(rand, 60, -40, 40)
				const b = generateSortedUniqueArray(rand, 60, -40, 40)
				const actual = xorSortedArrRecursive(a, b)
				const expectedIter = xorIterativeReference(a, b)
				const expectedSet = xorSetReference(a, b)

				assert.deepStrictEqual(actual, expectedIter)
				assert.deepStrictEqual(actual, expectedSet)

				// Output invariant: strictly ascending and de-duplicated
				for (let i = 1; i < actual.length; i++) {
					assert.ok(actual[i - 1] < actual[i])
				}
			}
		})

		it('satisfies Boolean ring / symmetric difference algebraic laws', () => {
			const rand = createPrng(0xdecafbad)
			for (let trial = 0; trial < 50; trial++) {
				const a = generateSortedUniqueArray(rand, 30, -20, 20)
				const b = generateSortedUniqueArray(rand, 30, -20, 20)
				const c = generateSortedUniqueArray(rand, 30, -20, 20)

				const ab = xorSortedArrRecursive(a, b)
				const ba = xorSortedArrRecursive(b, a)

				// Commutativity: A Δ B = B Δ A
				assert.deepStrictEqual(ab, ba)

				// Associativity: (A Δ B) Δ C = A Δ (B Δ C)
				const leftAssoc = xorSortedArrRecursive(ab, c)
				const rightAssoc = xorSortedArrRecursive(a, xorSortedArrRecursive(b, c))
				assert.deepStrictEqual(leftAssoc, rightAssoc)

				// Self-inverse: A Δ A = ∅
				assert.deepStrictEqual(xorSortedArrRecursive(a, a), [])

				// Identity: A Δ ∅ = A
				assert.deepStrictEqual(xorSortedArrRecursive(a, []), a)

				// Cancellation: (A Δ B) Δ B = A
				assert.deepStrictEqual(xorSortedArrRecursive(ab, b), a)
			}
		})
	})
})
