import { describe, test } from 'node:test'
import assert from 'node:assert'
import { unionIntervalRecursive } from './unionIntervalRecursive.js'

/**
 * Independent iterative sweep-line reference implementation for cross-checking.
 */
function referenceUnionSweepLine(...sets) {
	const all = []
	for (const set of sets) {
		for (const [lo, hi] of set) {
			all.push([lo === 0 ? 0 : lo, hi === 0 ? 0 : hi])
		}
	}
	if (all.length === 0) return []
	all.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]))

	const merged = [all[0].slice()]
	for (let i = 1; i < all.length; i++) {
		const [lo, hi] = all[i]
		const last = merged[merged.length - 1]
		if (lo <= last[1]) {
			if (hi > last[1]) last[1] = hi
		} else {
			merged.push([lo, hi])
		}
	}
	return merged
}

/**
 * Point-membership predicate for a set of closed real intervals.
 */
function pointInSet(x, intervals) {
	for (const [lo, hi] of intervals) {
		if (x >= lo && x <= hi) return true
	}
	return false
}

/**
 * Asserts that `intervals` satisfies the normalized interval-set invariants.
 */
function assertNormalized(intervals) {
	for (let i = 0; i < intervals.length; i++) {
		const [lo, hi] = intervals[i]
		assert.ok(Number.isFinite(lo) && Number.isFinite(hi), 'endpoints must be finite')
		assert.ok(lo <= hi, `expected lo <= hi at index ${i}, got [${lo}, ${hi}]`)
		assert.ok(!Object.is(lo, -0) && !Object.is(hi, -0), 'expected -0 canonicalized to 0')
		if (i > 0) {
			const prevHi = intervals[i - 1][1]
			assert.ok(
				prevHi < lo,
				`expected strictly disjoint non-touching intervals: [${intervals[i - 1]}] and [${intervals[i]}]`
			)
		}
	}
}

/**
 * Deterministic PRNG (Mulberry32) so randomized cross-checks are fully reproducible.
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

describe('unionIntervalRecursive', () => {
	test('handles empty calls and empty sets', () => {
		assert.deepStrictEqual(unionIntervalRecursive(), [])
		assert.deepStrictEqual(unionIntervalRecursive([]), [])
		assert.deepStrictEqual(unionIntervalRecursive([], []), [])
		assert.deepStrictEqual(unionIntervalRecursive([], [], []), [])
		assert.deepStrictEqual(unionIntervalRecursive([], [[1, 3]], []), [[1, 3]])
	})

	test('normalizes a single unsorted, overlapping set of intervals', () => {
		const input = [[5, 8], [1, 3], [2, 6], [10, 12], [12, 15], [10, 11]]
		assert.deepStrictEqual(unionIntervalRecursive(input), [[1, 8], [10, 15]])
	})

	test('merges overlapping, touching, nested, and disjoint intervals across two sets', () => {
		const a = [[1, 3], [6, 8], [12, 20]]
		const b = [[2, 5], [8, 10], [14, 16], [25, 30]]
		assert.deepStrictEqual(unionIntervalRecursive(a, b), [
			[1, 5],
			[6, 10],
			[12, 20],
			[25, 30]
		])
	})

	test('merges chains of touching intervals into a single interval', () => {
		const a = [[0, 1], [2, 3], [4, 5]]
		const b = [[1, 2], [3, 4], [5, 6]]
		assert.deepStrictEqual(unionIntervalRecursive(a, b), [[0, 6]])
	})

	test('handles degenerate point intervals [x, x]', () => {
		// Isolated and duplicate points
		assert.deepStrictEqual(unionIntervalRecursive([[5, 5], [1, 1], [5, 5], [3, 3]]), [
			[1, 1],
			[3, 3],
			[5, 5]
		])

		// Points touching endpoints or strictly inside intervals
		assert.deepStrictEqual(
			unionIntervalRecursive([[1, 4], [7, 7]], [[1, 1], [2.5, 2.5], [4, 4], [7, 7]]),
			[[1, 4], [7, 7]]
		)

		// Point bridging nothing vs adjacent non-touching points
		assert.deepStrictEqual(unionIntervalRecursive([[0, 0]], [[1, 1]]), [[0, 0], [1, 1]])
	})

	test('handles negative, floating-point, extreme finite values, and -0 canonicalization', () => {
		const res = unionIntervalRecursive(
			[[-10.5, -2.25], [-0, 0]],
			[[-3, -1], [0, 1.5], [1e15, 2e15]]
		)
		assert.deepStrictEqual(res, [
			[-10.5, -1],
			[0, 1.5],
			[1e15, 2e15]
		])
		assert.ok(Object.is(res[1][0], 0))

		const extreme = unionIntervalRecursive(
			[[-Number.MAX_VALUE, -1e300]],
			[[1e300, Number.MAX_VALUE], [-Number.MIN_VALUE, Number.MIN_VALUE]]
		)
		assert.deepStrictEqual(extreme, [
			[-Number.MAX_VALUE, -1e300],
			[-Number.MIN_VALUE, Number.MIN_VALUE],
			[1e300, Number.MAX_VALUE]
		])
	})

	test('handles union across many sets and satisfies set-algebra laws', () => {
		const a = [[1, 2], [10, 15]]
		const b = [[2, 4], [12, 18]]
		const c = [[5, 7], [18, 20]]
		const d = [[4, 5], [100, 101]]

		// Variadic union
		assert.deepStrictEqual(unionIntervalRecursive(a, b, c, d), [
			[1, 7],
			[10, 20],
			[100, 101]
		])

		// Commutativity
		assert.deepStrictEqual(unionIntervalRecursive(a, b), unionIntervalRecursive(b, a))

		// Associativity
		assert.deepStrictEqual(
			unionIntervalRecursive(unionIntervalRecursive(a, b), c),
			unionIntervalRecursive(a, unionIntervalRecursive(b, c))
		)
		assert.deepStrictEqual(
			unionIntervalRecursive(a, b, c),
			unionIntervalRecursive(unionIntervalRecursive(a, b), c)
		)

		// Idempotence & identity
		assert.deepStrictEqual(unionIntervalRecursive(a, a), unionIntervalRecursive(a))
		assert.deepStrictEqual(unionIntervalRecursive(a, []), unionIntervalRecursive(a))
	})

	test('does not mutate inputs and returns defensively copied intervals', () => {
		const a = [[5, 7], [1, 3]]
		const b = [[2, 4]]
		const aSnapshot = structuredClone(a)
		const bSnapshot = structuredClone(b)

		const result = unionIntervalRecursive(a, b)
		assert.deepStrictEqual(a, aSnapshot)
		assert.deepStrictEqual(b, bSnapshot)

		// Mutating output must not affect inputs
		result[0][0] = -999
		assert.deepStrictEqual(a, aSnapshot)
		assert.deepStrictEqual(b, bSnapshot)
	})

	test('rejects invalid inputs with descriptive TypeError / RangeError', () => {
		// Non-array set arguments
		for (const badSet of [null, undefined, 42, '[[1,2]]', {}, new Set()]) {
			assert.throws(() => unionIntervalRecursive(badSet), TypeError)
			assert.throws(() => unionIntervalRecursive([[1, 2]], badSet), TypeError)
		}

		// Non-array intervals inside a set
		for (const badInterval of [null, undefined, 1, '1,2', { lo: 1, hi: 2 }]) {
			assert.throws(() => unionIntervalRecursive([badInterval]), TypeError)
		}

		// Sparse array set and sparse interval tuple
		const sparseSet = []
		sparseSet[1] = [1, 2]
		assert.throws(() => unionIntervalRecursive(sparseSet), TypeError)
		assert.throws(() => unionIntervalRecursive([new Array(2)]), TypeError)

		// Wrong tuple length
		assert.throws(() => unionIntervalRecursive([[]]), RangeError)
		assert.throws(() => unionIntervalRecursive([[1]]), RangeError)
		assert.throws(() => unionIntervalRecursive([[1, 2, 3]]), RangeError)

		// Non-numeric endpoints
		assert.throws(() => unionIntervalRecursive([['1', 2]]), TypeError)
		assert.throws(() => unionIntervalRecursive([[1, '2']]), TypeError)
		assert.throws(() => unionIntervalRecursive([[null, 2]]), TypeError)
		assert.throws(() => unionIntervalRecursive([[1, undefined]]), TypeError)
		assert.throws(() => unionIntervalRecursive([[1n, 2n]]), TypeError)

		// Non-finite endpoints
		assert.throws(() => unionIntervalRecursive([[NaN, 1]]), RangeError)
		assert.throws(() => unionIntervalRecursive([[1, NaN]]), RangeError)
		assert.throws(() => unionIntervalRecursive([[-Infinity, 1]]), RangeError)
		assert.throws(() => unionIntervalRecursive([[1, Infinity]]), RangeError)
		assert.throws(() => unionIntervalRecursive([[-Infinity, Infinity]]), RangeError)

		// Inverted intervals (lo > hi)
		assert.throws(() => unionIntervalRecursive([[5, 2]]), RangeError)
		assert.throws(() => unionIntervalRecursive([[0.001, 0]]), RangeError)
		assert.throws(() => unionIntervalRecursive([[1, 2]], [[3, 2.999]]), RangeError)
	})

	test('cross-checks against iterative sweep-line and point-sampling oracle over random cases', () => {
		const rng = createRng(0x5eed1234)

		for (let trial = 0; trial < 150; trial++) {
			const numSets = Math.floor(rng() * 6)
			const sets = []
			const endpoints = new Set()

			for (let s = 0; s < numSets; s++) {
				const count = Math.floor(rng() * 15)
				const set = []
				for (let k = 0; k < count; k++) {
					// Mix integer grid values (higher chance of touching/point intervals) and floats
					const useGrid = rng() < 0.65
					const a = useGrid ? Math.floor(rng() * 21) - 10 : Math.round((rng() * 20 - 10) * 100) / 100
					const span = rng() < 0.2 ? 0 : useGrid ? Math.floor(rng() * 6) : Math.round(rng() * 5 * 100) / 100
					const lo = a
					const hi = a + span
					set.push([lo, hi])
					endpoints.add(lo)
					endpoints.add(hi)
				}
				sets.push(set)
			}

			const actual = unionIntervalRecursive(...sets)
			const expected = referenceUnionSweepLine(...sets)

			// 1. Exact agreement with independent iterative sweep-line implementation
			assert.deepStrictEqual(actual, expected)

			// 2. Normalization invariants
			assertNormalized(actual)

			// 3. Independent point-sampling membership oracle over all endpoints, midpoints, and exterior probes
			const sortedPts = [...endpoints].sort((x, y) => x - y)
			const probes = []
			if (sortedPts.length === 0) {
				probes.push(-1, 0, 1)
			} else {
				probes.push(sortedPts[0] - 1)
				for (let i = 0; i < sortedPts.length; i++) {
					probes.push(sortedPts[i])
					if (i + 1 < sortedPts.length) {
						probes.push((sortedPts[i] + sortedPts[i + 1]) / 2)
					}
				}
				probes.push(sortedPts[sortedPts.length - 1] + 1)
			}

			for (const x of probes) {
				const inActual = pointInSet(x, actual)
				const inInputs = sets.some((set) => pointInSet(x, set))
				assert.strictEqual(
					inActual,
					inInputs,
					`membership mismatch at x=${x} on trial ${trial}`
				)
			}
		}
	})

	test('handles large inputs efficiently without stack overflow', () => {
		const rng = createRng(0xdeadbeef)
		const n = 5000
		const setA = []
		const setB = []
		for (let i = 0; i < n; i++) {
			const loA = Math.floor(rng() * 20000) - 10000
			setA.push([loA, loA + Math.floor(rng() * 5)])
			const loB = Math.floor(rng() * 20000) - 10000
			setB.push([loB, loB + Math.floor(rng() * 5)])
		}

		const actual = unionIntervalRecursive(setA, setB)
		const expected = referenceUnionSweepLine(setA, setB)
		assert.deepStrictEqual(actual, expected)
		assertNormalized(actual)
	})
})
