import { describe, test } from 'node:test'
import assert from 'node:assert'
import { andSortedArrRecursive } from './andSortedArrRecursive.js'

/**
 * Independent linear two-pointer merge reference implementation for cross-checking.
 *
 * @param {readonly number[]} a
 * @param {readonly number[]} b
 * @returns {number[]}
 */
function referenceTwoPointerAnd(a, b) {
	const out = []
	let i = 0
	let j = 0
	while (i < a.length && j < b.length) {
		if (a[i] < b[j]) {
			i++
		} else if (a[i] > b[j]) {
			j++
		} else {
			out.push(a[i])
			i++
			j++
		}
	}
	return out
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property-based cross-checks.
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
 * Generates a sorted, de-duplicated array of integers using the supplied RNG.
 *
 * @param {() => number} rng
 * @param {number} maxLen
 * @param {number} minVal
 * @param {number} maxVal
 * @returns {number[]}
 */
function randomSortedUniqueInts(rng, maxLen, minVal, maxVal) {
	const len = Math.floor(rng() * (maxLen + 1))
	const set = new Set()
	const span = maxVal - minVal + 1
	for (let i = 0; i < len; i++) {
		set.add(minVal + Math.floor(rng() * span))
	}
	return Array.from(set).sort((x, y) => x - y)
}

describe('andSortedArrRecursive — normal cases', () => {
	test('computes intersection of overlapping numeric arrays', () => {
		assert.deepStrictEqual(
			andSortedArrRecursive([1, 2, 3, 5, 8, 13], [2, 3, 4, 8, 10, 13, 21]),
			[2, 3, 8, 13],
		)
	})

	test('returns equal copy for identical arrays', () => {
		const a = [-10, -2, 0, 4, 99]
		const b = [-10, -2, 0, 4, 99]
		const out = andSortedArrRecursive(a, b)
		assert.deepStrictEqual(out, [-10, -2, 0, 4, 99])
		assert.notStrictEqual(out, a)
		assert.notStrictEqual(out, b)
	})

	test('returns empty array for disjoint ranges and interleaved disjoint arrays', () => {
		assert.deepStrictEqual(andSortedArrRecursive([1, 2, 3], [4, 5, 6]), [])
		assert.deepStrictEqual(andSortedArrRecursive([10, 20, 30], [1, 2, 3]), [])
		assert.deepStrictEqual(andSortedArrRecursive([0, 2, 4, 6, 8], [1, 3, 5, 7, 9]), [])
	})

	test('handles subset and superset in both directions', () => {
		const small = [2, 5, 9]
		const large = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
		assert.deepStrictEqual(andSortedArrRecursive(small, large), [2, 5, 9])
		assert.deepStrictEqual(andSortedArrRecursive(large, small), [2, 5, 9])
	})

	test('handles single shared element at start, middle, and end', () => {
		assert.deepStrictEqual(andSortedArrRecursive([1, 2, 3], [1, 4, 5]), [1])
		assert.deepStrictEqual(andSortedArrRecursive([1, 5, 9], [2, 5, 8]), [5])
		assert.deepStrictEqual(andSortedArrRecursive([1, 2, 9], [7, 8, 9]), [9])
	})

	test('supports negative numbers, floats, and infinities', () => {
		assert.deepStrictEqual(
			andSortedArrRecursive(
				[-Infinity, -10.5, -0.25, 0, 3.14, Infinity],
				[-Infinity, -5, -0.25, 1.5, 3.14, Infinity],
			),
			[-Infinity, -0.25, 3.14, Infinity],
		)
	})

	test('supports sorted string arrays and bigint arrays with default comparator', () => {
		assert.deepStrictEqual(
			andSortedArrRecursive(['alpha', 'beta', 'delta', 'gamma'], ['beta', 'epsilon', 'gamma']),
			['beta', 'gamma'],
		)
		assert.deepStrictEqual(
			andSortedArrRecursive(
				[-100000000000000000000n, 0n, 42n, 999999999999999999999n],
				[0n, 42n, 100n],
			),
			[0n, 42n],
		)
	})

	test('supports custom comparator for objects and preserves element from first array', () => {
		const byId = (x, y) => x.id - y.id
		const a = [
			{ id: 1, src: 'a' },
			{ id: 3, src: 'a' },
			{ id: 5, src: 'a' },
		]
		const b = [
			{ id: 2, src: 'b' },
			{ id: 3, src: 'b' },
			{ id: 4, src: 'b' },
			{ id: 5, src: 'b' },
			{ id: 6, src: 'b' },
		]

		const outAB = andSortedArrRecursive(a, b, byId)
		assert.deepStrictEqual(outAB, [
			{ id: 3, src: 'a' },
			{ id: 5, src: 'a' },
		])
		assert.strictEqual(outAB[0], a[1])
		assert.strictEqual(outAB[1], a[2])

		// Also exercise lenB < lenA branch with custom comparator
		const outBA = andSortedArrRecursive(b, a, byId)
		assert.deepStrictEqual(outBA, [
			{ id: 3, src: 'b' },
			{ id: 5, src: 'b' },
		])
		assert.strictEqual(outBA[0], b[1])
		assert.strictEqual(outBA[1], b[3])
	})

	test('supports custom descending comparator', () => {
		const desc = (x, y) => y - x
		assert.deepStrictEqual(
			andSortedArrRecursive([20, 15, 10, 5, 1], [18, 15, 7, 5, 0], desc),
			[15, 5],
		)
	})
})

describe('andSortedArrRecursive — edge cases', () => {
	test('handles empty arrays in all combinations', () => {
		assert.deepStrictEqual(andSortedArrRecursive([], []), [])
		assert.deepStrictEqual(andSortedArrRecursive([], [1, 2, 3]), [])
		assert.deepStrictEqual(andSortedArrRecursive([1, 2, 3], []), [])
		assert.deepStrictEqual(andSortedArrRecursive([], ['a', 'b']), [])
	})

	test('handles single-element arrays', () => {
		assert.deepStrictEqual(andSortedArrRecursive([7], [7]), [7])
		assert.deepStrictEqual(andSortedArrRecursive([7], [8]), [])
		assert.deepStrictEqual(andSortedArrRecursive([8], [7]), [])
	})

	test('handles highly asymmetric large arrays without stack overflow', () => {
		const large = Array.from({ length: 50_000 }, (_, i) => i * 2)
		const small = [0, 500, 10_000, 49_999, 99_998, 100_000]
		assert.deepStrictEqual(andSortedArrRecursive(small, large), [0, 500, 10_000, 99_998])
		assert.deepStrictEqual(andSortedArrRecursive(large, small), [0, 500, 10_000, 99_998])
	})

	test('does not mutate input arrays', () => {
		const a = [1, 3, 5, 7]
		const b = [2, 3, 6, 7]
		const aSnap = [...a]
		const bSnap = [...b]
		const out = andSortedArrRecursive(a, b)
		out.push(999)
		assert.deepStrictEqual(a, aSnap)
		assert.deepStrictEqual(b, bSnap)
	})
})

describe('andSortedArrRecursive — invalid input errors', () => {
	test('throws TypeError when either input is not an array', () => {
		for (const bad of [null, undefined, 42, '123', {}, new Set([1, 2]), new Int32Array([1, 2])]) {
			assert.throws(() => andSortedArrRecursive(bad, [1, 2]), TypeError)
			assert.throws(() => andSortedArrRecursive([1, 2], bad), TypeError)
		}
	})

	test('throws TypeError when compare is provided but not a function', () => {
		for (const badCmp of [null, 123, 'asc', {}, []]) {
			assert.throws(() => andSortedArrRecursive([1, 2], [2, 3], badCmp), TypeError)
		}
	})

	test('throws RangeError for unsorted arrays (even when other array is empty)', () => {
		assert.throws(() => andSortedArrRecursive([1, 3, 2], [1, 2]), RangeError)
		assert.throws(() => andSortedArrRecursive([1, 2], [3, 2, 1]), RangeError)
		assert.throws(() => andSortedArrRecursive([], [2, 1]), RangeError)
		assert.throws(() => andSortedArrRecursive([2, 1], []), RangeError)
	})

	test('throws RangeError for arrays with duplicate elements', () => {
		assert.throws(() => andSortedArrRecursive([1, 2, 2, 3], [1, 2]), RangeError)
		assert.throws(() => andSortedArrRecursive([1, 2], [1, 1]), RangeError)
		assert.throws(() => andSortedArrRecursive([-0, 0], [0]), RangeError)
		assert.throws(() => andSortedArrRecursive([], [5, 5]), RangeError)
	})

	test('throws RangeError for NaN elements with default comparator', () => {
		assert.throws(() => andSortedArrRecursive([NaN], [1]), RangeError)
		assert.throws(() => andSortedArrRecursive([1, NaN], [1]), RangeError)
		assert.throws(() => andSortedArrRecursive([1], [NaN]), RangeError)
	})

	test('throws TypeError for unsupported or mismatched types with default comparator', () => {
		assert.throws(() => andSortedArrRecursive([null], [1]), TypeError)
		assert.throws(() => andSortedArrRecursive([undefined], []), TypeError)
		assert.throws(() => andSortedArrRecursive([{ id: 1 }], [{ id: 1 }]), TypeError)
		assert.throws(() => andSortedArrRecursive([false, true], [true]), TypeError)
		assert.throws(() => andSortedArrRecursive([1, '2'], [1]), TypeError)
		assert.throws(() => andSortedArrRecursive([1, 2], ['1', '2']), TypeError)
		assert.throws(() => andSortedArrRecursive([1, 2], [1n, 2n]), TypeError)
	})

	test('throws TypeError when custom comparator returns non-number or NaN', () => {
		assert.throws(() => andSortedArrRecursive([1, 2], [1, 2], () => NaN), TypeError)
		assert.throws(() => andSortedArrRecursive([1, 2], [1, 2], () => '0'), TypeError)
		assert.throws(() => andSortedArrRecursive([1], [1], () => undefined), TypeError)
	})
})

describe('andSortedArrRecursive — independent cross-checks and algebraic properties', () => {
	test('matches Set intersection and linear two-pointer merge across 200 randomized pairs', () => {
		const rng = mulberry32(0x20261123)
		for (let trial = 0; trial < 200; trial++) {
			const maxA = trial % 5 === 0 ? 5 : 80
			const maxB = trial % 7 === 0 ? 5 : 80
			const a = randomSortedUniqueInts(rng, maxA, -50, 50)
			const b = randomSortedUniqueInts(rng, maxB, -50, 50)

			const actual = andSortedArrRecursive(a, b)

			// Oracle 1: JavaScript Set intersection
			const bSet = new Set(b)
			const expectedSet = a.filter((x) => bSet.has(x))

			// Oracle 2: Linear two-pointer merge
			const expectedLinear = referenceTwoPointerAnd(a, b)

			assert.deepStrictEqual(actual, expectedSet)
			assert.deepStrictEqual(actual, expectedLinear)

			// Verify output invariant: strictly ascending (sorted & de-duplicated)
			for (let i = 1; i < actual.length; i++) {
				assert.ok(actual[i - 1] < actual[i])
			}
		}
	})

	test('satisfies logical-AND algebraic laws (commutativity, idempotence, associativity)', () => {
		const rng = mulberry32(0xdeadbeef)
		for (let trial = 0; trial < 50; trial++) {
			const a = randomSortedUniqueInts(rng, 40, -30, 30)
			const b = randomSortedUniqueInts(rng, 40, -30, 30)
			const c = randomSortedUniqueInts(rng, 40, -30, 30)

			// Commutativity: A ∩ B = B ∩ A
			assert.deepStrictEqual(andSortedArrRecursive(a, b), andSortedArrRecursive(b, a))

			// Idempotence: A ∩ A = A
			assert.deepStrictEqual(andSortedArrRecursive(a, a), a)

			// Associativity: (A ∩ B) ∩ C = A ∩ (B ∩ C)
			assert.deepStrictEqual(
				andSortedArrRecursive(andSortedArrRecursive(a, b), c),
				andSortedArrRecursive(a, andSortedArrRecursive(b, c)),
			)
		}
	})
})
