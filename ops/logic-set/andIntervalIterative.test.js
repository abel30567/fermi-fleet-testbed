import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { andIntervalIterative } from './andIntervalIterative.js'

/**
 * Independent point-membership oracle evaluated directly on raw (unnormalized)
 * interval lists.
 *
 * @param {number} x
 * @param {[number, number][]} intervals
 * @returns {boolean}
 */
function containsPoint(x, intervals) {
	for (const [lo, hi] of intervals) {
		if (lo <= x && x <= hi) {
			return true
		}
	}
	return false
}

/**
 * Independent naive O(n * m) pairwise intersection + merge reference.
 *
 * @param {[number, number][]} a
 * @param {[number, number][]} b
 * @returns {[number, number][]}
 */
function naiveAndReference(a, b) {
	const raw = []
	for (const [aLo, aHi] of a) {
		for (const [bLo, bHi] of b) {
			const lo = Math.max(aLo, bLo)
			const hi = Math.min(aHi, bHi)
			if (lo <= hi) {
				raw.push([lo === 0 ? 0 : lo, hi === 0 ? 0 : hi])
			}
		}
	}
	if (raw.length === 0) return []
	raw.sort((u, v) => (u[0] !== v[0] ? u[0] - v[0] : u[1] - v[1]))
	const merged = [raw[0]]
	for (let i = 1; i < raw.length; i += 1) {
		const last = merged[merged.length - 1]
		if (raw[i][0] <= last[1]) {
			last[1] = Math.max(last[1], raw[i][1])
		} else {
			merged.push(raw[i])
		}
	}
	return merged
}

/**
 * Deterministic LCG PRNG for reproducible property tests.
 *
 * @param {number} seed
 */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

describe('andIntervalIterative', () => {
	describe('normal cases', () => {
		test('intersects single overlapping intervals', () => {
			assert.deepEqual(
				andIntervalIterative([[0, 5]], [[3, 8]]),
				[[3, 5]]
			)
		})

		test('handles containment and identical sets', () => {
			assert.deepEqual(
				andIntervalIterative([[0, 10]], [[2, 4], [6, 9]]),
				[[2, 4], [6, 9]]
			)
			assert.deepEqual(
				andIntervalIterative([[-3, 1], [4, 7]], [[-3, 1], [4, 7]]),
				[[-3, 1], [4, 7]]
			)
		})

		test('intersects multiple interleaved intervals', () => {
			const a = [[0, 2], [5, 10], [13, 23], [24, 25]]
			const b = [[1, 5], [8, 12], [15, 24], [25, 26]]
			assert.deepEqual(
				andIntervalIterative(a, b),
				[[1, 2], [5, 5], [8, 10], [15, 23], [24, 24], [25, 25]]
			)
		})

		test('normalizes unsorted, overlapping, and duplicate input intervals', () => {
			const a = [[10, 12], [1, 4], [3, 6], [1, 4], [6, 8]]
			const b = [[7, 15], [2, 5], [0, 3]]
			assert.deepEqual(
				andIntervalIterative(a, b),
				[[1, 5], [7, 8], [10, 12]]
			)
		})

		test('handles negative numbers and floating-point endpoints', () => {
			const a = [[-10.5, -2.25], [-0.5, 3.75]]
			const b = [[-4.75, 0.25], [2.5, 5.125]]
			assert.deepEqual(
				andIntervalIterative(a, b),
				[[-4.75, -2.25], [-0.5, 0.25], [2.5, 3.75]]
			)
		})
	})

	describe('edge cases', () => {
		test('returns empty set when either or both inputs are empty', () => {
			assert.deepEqual(andIntervalIterative([], []), [])
			assert.deepEqual(andIntervalIterative([], [[1, 5]]), [])
			assert.deepEqual(andIntervalIterative([[1, 5]], []), [])
		})

		test('returns empty set for strictly disjoint interval sets', () => {
			assert.deepEqual(
				andIntervalIterative([[0, 1], [4, 5]], [[2, 3], [6, 7]]),
				[]
			)
		})

		test('preserves degenerate single-point intersections at shared boundaries', () => {
			assert.deepEqual(
				andIntervalIterative([[1, 3]], [[3, 5]]),
				[[3, 3]]
			)
			assert.deepEqual(
				andIntervalIterative([[3, 3]], [[1, 5]]),
				[[3, 3]]
			)
			assert.deepEqual(
				andIntervalIterative([[3, 3]], [[3, 3]]),
				[[3, 3]]
			)
			assert.deepEqual(
				andIntervalIterative([[3, 3]], [[4, 4]]),
				[]
			)
		})

		test('merges touching intervals within an input before intersecting', () => {
			assert.deepEqual(
				andIntervalIterative([[1, 3], [3, 5]], [[2, 4]]),
				[[2, 4]]
			)
		})

		test('normalizes -0 endpoints to +0', () => {
			const out = andIntervalIterative([[-0, 2]], [[-1, -0]])
			assert.deepEqual(out, [[0, 0]])
			assert.equal(Object.is(out[0][0], 0), true)
			assert.equal(Object.is(out[0][1], 0), true)
		})

		test('does not mutate inputs and returns fresh interval tuples', () => {
			const a = [[5, 8], [1, 4]]
			const b = [[2, 6]]
			const snapshotA = structuredClone(a)
			const snapshotB = structuredClone(b)

			const out = andIntervalIterative(a, b)
			assert.deepEqual(a, snapshotA)
			assert.deepEqual(b, snapshotB)

			out[0][0] = 999
			assert.deepEqual(a, snapshotA)
			assert.deepEqual(b, snapshotB)
		})

		test('satisfies commutativity, idempotence, and associativity', () => {
			const a = [[6, 9], [0, 3], [2, 5]]
			const b = [[1, 4], [4, 7], [8, 10]]
			const c = [[-2, 2], [3, 8.5]]

			assert.deepEqual(andIntervalIterative(a, b), andIntervalIterative(b, a))
			assert.deepEqual(
				andIntervalIterative(a, a),
				[[0, 5], [6, 9]]
			)
			assert.deepEqual(
				andIntervalIterative(andIntervalIterative(a, b), c),
				andIntervalIterative(a, andIntervalIterative(b, c))
			)
		})
	})

	describe('invalid inputs', () => {
		test('throws TypeError when either argument is not an array', () => {
			for (const bad of [null, undefined, 42, '[]', {}, true]) {
				assert.throws(() => andIntervalIterative(bad, [[0, 1]]), TypeError)
				assert.throws(() => andIntervalIterative([[0, 1]], bad), TypeError)
			}
		})

		test('validates both inputs even when the other is empty', () => {
			assert.throws(() => andIntervalIterative([], null), TypeError)
			assert.throws(() => andIntervalIterative(null, []), TypeError)
			assert.throws(() => andIntervalIterative([], [[5, 2]]), RangeError)
			assert.throws(() => andIntervalIterative([[5, 2]], []), RangeError)
		})

		test('throws TypeError for malformed interval tuples', () => {
			assert.throws(() => andIntervalIterative([123], [[0, 1]]), TypeError)
			assert.throws(() => andIntervalIterative([[]], [[0, 1]]), TypeError)
			assert.throws(() => andIntervalIterative([[1]], [[0, 1]]), TypeError)
			assert.throws(() => andIntervalIterative([[1, 2, 3]], [[0, 1]]), TypeError)
			assert.throws(() => andIntervalIterative([[0, 1]], [{ lo: 0, hi: 1 }]), TypeError)
		})

		test('throws TypeError for non-number endpoints', () => {
			assert.throws(() => andIntervalIterative([['0', 1]], [[0, 1]]), TypeError)
			assert.throws(() => andIntervalIterative([[0, null]], [[0, 1]]), TypeError)
			assert.throws(() => andIntervalIterative([[0, 1]], [[undefined, 2]]), TypeError)
		})

		test('throws RangeError for non-finite endpoints or inverted intervals', () => {
			assert.throws(() => andIntervalIterative([[NaN, 1]], [[0, 1]]), RangeError)
			assert.throws(() => andIntervalIterative([[0, NaN]], [[0, 1]]), RangeError)
			assert.throws(() => andIntervalIterative([[-Infinity, 1]], [[0, 1]]), RangeError)
			assert.throws(() => andIntervalIterative([[0, Infinity]], [[0, 1]]), RangeError)
			assert.throws(() => andIntervalIterative([[5, 2]], [[0, 10]]), RangeError)
			assert.throws(() => andIntervalIterative([[0, 10]], [[3, -1]]), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		test('point-sampling membership grid and naive reference match across randomized sets', () => {
			const rand = makeRng(0x5eed1234)
			const MIN = -12
			const MAX = 12

			for (let trial = 0; trial < 200; trial += 1) {
				const genSet = () => {
					const count = Math.floor(rand() * 8)
					/** @type {[number, number][]} */
					const set = []
					for (let k = 0; k < count; k += 1) {
						// Half-integer endpoints on [-12, 12]
						const u = Math.floor(rand() * ((MAX - MIN) * 2 + 1)) / 2 + MIN
						const v = Math.floor(rand() * ((MAX - MIN) * 2 + 1)) / 2 + MIN
						set.push(u <= v ? [u, v] : [v, u])
					}
					return set
				}

				const a = genSet()
				const b = genSet()
				const actual = andIntervalIterative(a, b)
				const expected = naiveAndReference(a, b)

				// 1. Exact agreement with independent naive O(n * m) reference
				assert.deepEqual(actual, expected)

				// 2. Output normalized & merged invariants: valid, strictly sorted, strictly disjoint
				for (let k = 0; k < actual.length; k += 1) {
					const [lo, hi] = actual[k]
					assert.ok(lo <= hi, `output interval ${k} must satisfy lo <= hi`)
					if (k > 0) {
						assert.ok(
							actual[k - 1][1] < lo,
							`output intervals ${k - 1} and ${k} must be strictly disjoint and sorted`
						)
					}
				}

				// 3. Point-sampling membership verification across a quarter-step grid
				// (covers every half-integer endpoint and strict interior/exterior midpoints)
				for (let step = MIN * 4 - 2; step <= MAX * 4 + 2; step += 1) {
					const x = step / 4
					const expectedMember = containsPoint(x, a) && containsPoint(x, b)
					const actualMember = containsPoint(x, actual)
					assert.equal(
						actualMember,
						expectedMember,
						`membership mismatch at x=${x} on trial ${trial}`
					)
				}
			}
		})
	})
})
