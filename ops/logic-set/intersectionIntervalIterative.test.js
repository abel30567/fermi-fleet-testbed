import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { intersectionIntervalIterative } from './intersectionIntervalIterative.js'

/**
 * Helper to check that a result satisfies canonical normalized invariants:
 * each interval has lo <= hi, intervals are strictly increasing and non-touching,
 * and no endpoint is -0.
 */
function assertNormalized(intervals) {
	assert.ok(Array.isArray(intervals))
	for (let i = 0; i < intervals.length; i += 1) {
		const [lo, hi] = intervals[i]
		assert.ok(lo <= hi, `expected lo <= hi at index ${i}, got [${lo}, ${hi}]`)
		assert.ok(!Object.is(lo, -0), `expected normalized 0 rather than -0 at lo[${i}]`)
		assert.ok(!Object.is(hi, -0), `expected normalized 0 rather than -0 at hi[${i}]`)
		if (i > 0) {
			assert.ok(
				intervals[i - 1][1] < lo,
				`expected strictly separated intervals, got [${intervals[i - 1]}] and [${lo}, ${hi}]`
			)
		}
	}
}

/**
 * Deterministic LCG PRNG for reproducible randomized cross-checks.
 */
function createPrng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

describe('intersectionIntervalIterative', () => {
	test('computes basic two-set intersections', () => {
		assert.deepEqual(
			intersectionIntervalIterative(
				[
					[0, 5],
					[10, 20]
				],
				[
					[2, 12],
					[15, 25]
				]
			),
			[
				[2, 5],
				[10, 12],
				[15, 20]
			]
		)

		assert.deepEqual(
			intersectionIntervalIterative(
				[
					[-10, -2],
					[0.5, 3.25],
					[7.5, 9]
				],
				[
					[-5, 1.5],
					[2, 8]
				]
			),
			[
				[-5, -2],
				[0.5, 1.5],
				[2, 3.25],
				[7.5, 8]
			]
		)
	})

	test('handles empty sets', () => {
		assert.deepEqual(intersectionIntervalIterative([], []), [])
		assert.deepEqual(intersectionIntervalIterative([], [[0, 10]]), [])
		assert.deepEqual(intersectionIntervalIterative([[0, 10]], []), [])
		assert.deepEqual(
			intersectionIntervalIterative([[0, 10]], [[2, 8]], [], [[3, 5]]),
			[]
		)
	})

	test('handles disjoint sets', () => {
		assert.deepEqual(
			intersectionIntervalIterative(
				[
					[0, 1],
					[4, 5]
				],
				[
					[2, 3],
					[6, 7]
				]
			),
			[]
		)
		assert.deepEqual(
			intersectionIntervalIterative([[-10, -5]], [[5, 10]]),
			[]
		)
	})

	test('handles touching endpoints and degenerate point intervals', () => {
		assert.deepEqual(intersectionIntervalIterative([[1, 3]], [[3, 5]]), [
			[3, 3]
		])
		assert.deepEqual(
			intersectionIntervalIterative(
				[[1, 2]],
				[
					[0, 1],
					[2, 3]
				]
			),
			[
				[1, 1],
				[2, 2]
			]
		)
		assert.deepEqual(intersectionIntervalIterative([[2, 2]], [[1, 3]]), [
			[2, 2]
		])
		assert.deepEqual(intersectionIntervalIterative([[2, 2]], [[2, 2]]), [
			[2, 2]
		])
		assert.deepEqual(intersectionIntervalIterative([[2, 2]], [[2.0001, 5]]), [])
		// Touching intervals within one input set merge first before intersecting
		assert.deepEqual(
			intersectionIntervalIterative(
				[
					[1, 2],
					[2, 3]
				],
				[[1.5, 2.5]]
			),
			[[1.5, 2.5]]
		)
	})

	test('normalizes unsorted, overlapping, nested, and duplicate input intervals', () => {
		const res = intersectionIntervalIterative(
			[
				[5, 10],
				[1, 3],
				[2, 6],
				[1, 3],
				[3, 4],
				[15, 20],
				[16, 18]
			],
			[
				[17, 25],
				[4, 12],
				[0, 2],
				[0, 2]
			]
		)
		assert.deepEqual(res, [
			[1, 2],
			[4, 10],
			[17, 20]
		])
		assertNormalized(res)
	})

	test('handles infinite bounds', () => {
		assert.deepEqual(
			intersectionIntervalIterative([[-Infinity, 5]], [[0, Infinity]]),
			[[0, 5]]
		)
		assert.deepEqual(
			intersectionIntervalIterative(
				[[-Infinity, Infinity]],
				[
					[-10, -5],
					[3, 7]
				]
			),
			[
				[-10, -5],
				[3, 7]
			]
		)
		assert.deepEqual(
			intersectionIntervalIterative(
				[[-Infinity, 0]],
				[
					[-Infinity, -2],
					[0, Infinity]
				]
			),
			[
				[-Infinity, -2],
				[0, 0]
			]
		)
		assert.deepEqual(
			intersectionIntervalIterative([[5, Infinity]], [[10, Infinity]]),
			[[10, Infinity]]
		)
		assert.deepEqual(
			intersectionIntervalIterative([[-Infinity, -Infinity]], [[-Infinity, 0]]),
			[[-Infinity, -Infinity]]
		)
		assert.deepEqual(
			intersectionIntervalIterative([[Infinity, Infinity]], [[0, Infinity]]),
			[[Infinity, Infinity]]
		)
		assert.deepEqual(
			intersectionIntervalIterative(
				[[-Infinity, Infinity]],
				[[-Infinity, Infinity]]
			),
			[[-Infinity, Infinity]]
		)
	})

	test('normalizes negative zero endpoints to positive zero', () => {
		const res = intersectionIntervalIterative([[-0, 1]], [[-1, -0]])
		assert.deepEqual(res, [[0, 0]])
		assertNormalized(res)
	})

	test('supports multi-set variadic intersection and algebraic laws', () => {
		const a = [
			[0, 10],
			[15, 30]
		]
		const b = [
			[-5, 6],
			[8, 20],
			[25, 35]
		]
		const c = [
			[2, 18],
			[22, 28]
		]
		const d = [
			[4, 9],
			[16, 27]
		]

		const expected = [
			[4, 6],
			[8, 9],
			[16, 18],
			[25, 27]
		]
		const actual = intersectionIntervalIterative(a, b, c, d)
		assert.deepEqual(actual, expected)
		assertNormalized(actual)

		// Associativity and commutativity
		assert.deepEqual(
			intersectionIntervalIterative(a, b, c),
			intersectionIntervalIterative(intersectionIntervalIterative(a, b), c)
		)
		assert.deepEqual(
			intersectionIntervalIterative(a, b, c),
			intersectionIntervalIterative(c, a, b)
		)

		// Idempotence and universal identity
		assert.deepEqual(
			intersectionIntervalIterative(a, a),
			intersectionIntervalIterative(a, [[-Infinity, Infinity]])
		)
	})

	test('does not mutate input arrays or interval tuples', () => {
		const setA = [
			[5, 10],
			[1, 6]
		]
		const setB = [
			[7, 12],
			[0, 3]
		]
		const snapshotA = structuredClone(setA)
		const snapshotB = structuredClone(setB)

		const res = intersectionIntervalIterative(setA, setB)
		assert.deepEqual(res, [
			[1, 3],
			[7, 10]
		])
		assert.deepEqual(setA, snapshotA)
		assert.deepEqual(setB, snapshotB)

		// Mutating returned intervals must not affect inputs
		res[0][0] = 999
		assert.deepEqual(setA, snapshotA)
		assert.deepEqual(setB, snapshotB)
	})

	test('throws descriptive errors for invalid inputs', () => {
		// Arity validation
		assert.throws(() => intersectionIntervalIterative(), RangeError)
		assert.throws(() => intersectionIntervalIterative([[0, 1]]), RangeError)

		// Non-array sets
		assert.throws(() => intersectionIntervalIterative(null, [[0, 1]]), TypeError)
		assert.throws(
			() => intersectionIntervalIterative([[0, 1]], undefined),
			TypeError
		)
		assert.throws(
			() => intersectionIntervalIterative([[0, 1]], 'not-an-array'),
			TypeError
		)
		assert.throws(
			() => intersectionIntervalIterative(new Set([[0, 1]]), [[0, 1]]),
			TypeError
		)

		// Malformed interval entries
		assert.throws(
			() => intersectionIntervalIterative([[0]], [[0, 1]]),
			TypeError
		)
		assert.throws(
			() => intersectionIntervalIterative([[0, 1, 2]], [[0, 1]]),
			TypeError
		)
		assert.throws(
			() => intersectionIntervalIterative([null], [[0, 1]]),
			TypeError
		)
		assert.throws(
			() => intersectionIntervalIterative([{ lo: 0, hi: 1 }], [[0, 1]]),
			TypeError
		)

		// Non-number endpoints
		assert.throws(
			() => intersectionIntervalIterative([['0', 1]], [[0, 1]]),
			TypeError
		)
		assert.throws(
			() => intersectionIntervalIterative([[0, null]], [[0, 1]]),
			TypeError
		)
		assert.throws(
			() => intersectionIntervalIterative([[0n, 1n]], [[0, 1]]),
			TypeError
		)

		// NaN endpoints
		assert.throws(
			() => intersectionIntervalIterative([[NaN, 1]], [[0, 1]]),
			RangeError
		)
		assert.throws(
			() => intersectionIntervalIterative([[0, NaN]], [[0, 1]]),
			RangeError
		)

		// Inverted intervals (lo > hi)
		assert.throws(
			() => intersectionIntervalIterative([[5, 2]], [[0, 10]]),
			RangeError
		)
		assert.throws(
			() => intersectionIntervalIterative([[Infinity, -Infinity]], [[0, 10]]),
			RangeError
		)
		assert.throws(
			() => intersectionIntervalIterative([[0, -Infinity]], [[0, 10]]),
			RangeError
		)
		assert.throws(
			() => intersectionIntervalIterative([[Infinity, 0]], [[0, 10]]),
			RangeError
		)

		// Validation must still run on later arguments even when first set is empty
		assert.throws(
			() => intersectionIntervalIterative([], 'bad-second-arg'),
			TypeError
		)
		assert.throws(
			() => intersectionIntervalIterative([], [[5, 2]]),
			RangeError
		)
	})

	test('cross-check against dense grid & exact endpoint indicator-function membership', () => {
		const rand = createPrng(0x5eed1234)
		const inSet = (set, x) => set.some(([lo, hi]) => lo <= x && x <= hi)

		for (let trial = 0; trial < 60; trial += 1) {
			const numSets = 2 + (trial % 4) // 2, 3, 4, or 5 sets
			const sets = []
			const endpoints = new Set([-21, 21])

			for (let s = 0; s < numSets; s += 1) {
				const numIntervals = Math.floor(rand() * 8)
				const set = []
				for (let k = 0; k < numIntervals; k += 1) {
					// Half-integer endpoints in [-20, 20]
					const a = Math.floor(rand() * 81 - 40) / 2
					const b = Math.floor(rand() * 81 - 40) / 2
					const lo = Math.min(a, b)
					const hi = Math.max(a, b)
					set.push([lo, hi])
					endpoints.add(lo)
					endpoints.add(hi)
				}
				sets.push(set)
			}

			const result = intersectionIntervalIterative(...sets)
			assertNormalized(result)

			// 1. Dense uniform grid indicator check on [-21, 21] at step 0.25
			for (let q = -84; q <= 84; q += 1) {
				const x = q / 4
				const expectedMember = sets.every((set) => inSet(set, x))
				const actualMember = inSet(result, x)
				assert.equal(
					actualMember,
					expectedMember,
					`trial ${trial}: grid mismatch at x=${x}`
				)
			}

			// 2. Exact topological check at all endpoints and midpoints between consecutive endpoints
			const sortedPts = [...endpoints].sort((u, v) => u - v)
			const probes = []
			for (let i = 0; i < sortedPts.length; i += 1) {
				probes.push(sortedPts[i])
				if (i + 1 < sortedPts.length) {
					probes.push((sortedPts[i] + sortedPts[i + 1]) / 2)
				}
			}

			for (const x of probes) {
				const expectedMember = sets.every((set) => inSet(set, x))
				const actualMember = inSet(result, x)
				assert.equal(
					actualMember,
					expectedMember,
					`trial ${trial}: probe mismatch at x=${x}`
				)
			}
		}
	})
})
