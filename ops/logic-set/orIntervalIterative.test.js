import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { orIntervalIterative } from './orIntervalIterative.js'

/**
 * Independent membership indicator over a raw (unmerged, unsorted) interval set.
 * @param {number} x
 * @param {Array<[number, number]>} intervals
 * @returns {boolean}
 */
function containsPoint(x, intervals) {
	for (const [lo, hi] of intervals) {
		if (lo <= x && x <= hi) return true
	}
	return false
}

/**
 * Verifies canonical normalized form: every interval satisfies lo <= hi and
 * consecutive intervals are strictly separated (prev.hi < next.lo).
 * @param {Array<[number, number]>} intervals
 */
function assertNormalized(intervals) {
	for (let i = 0; i < intervals.length; i += 1) {
		const [lo, hi] = intervals[i]
		assert.ok(lo <= hi, `interval[${i}] must have lo <= hi, got [${lo}, ${hi}]`)
		if (i > 0) {
			assert.ok(
				intervals[i - 1][1] < lo,
				`intervals[${i - 1}] and intervals[${i}] must be strictly disjoint and non-touching`,
			)
		}
	}
}

describe('orIntervalIterative', () => {
	describe('normal cases', () => {
		test('unions disjoint intervals in sorted order', () => {
			assert.deepStrictEqual(
				orIntervalIterative(
					[[1, 2], [7, 9]],
					[[3, 5], [12, 15]],
				),
				[[1, 2], [3, 5], [7, 9], [12, 15]],
			)
		})

		test('merges overlapping intervals across both sets', () => {
			assert.deepStrictEqual(
				orIntervalIterative(
					[[1, 5], [10, 14]],
					[[3, 8], [12, 20]],
				),
				[[1, 8], [10, 20]],
			)
		})

		test('merges nested and bridging intervals into a single interval', () => {
			assert.deepStrictEqual(
				orIntervalIterative(
					[[0, 2], [4, 6], [8, 10]],
					[[1, 9], [3, 5]],
				),
				[[0, 10]],
			)
		})

		test('normalizes unsorted and internally overlapping inputs', () => {
			assert.deepStrictEqual(
				orIntervalIterative(
					[[10, 12], [2, 5], [4, 7]],
					[[11, 15], [-3, -1], [-2, 0]],
				),
				[[-3, 0], [2, 7], [10, 15]],
			)
		})

		test('handles floating-point endpoints', () => {
			assert.deepStrictEqual(
				orIntervalIterative(
					[[-2.5, -0.25], [1.1, 2.2]],
					[[-0.5, 0.75], [2.2, 3.5]],
				),
				[[-2.5, 0.75], [1.1, 3.5]],
			)
		})
	})

	describe('edge cases', () => {
		test('handles empty sets', () => {
			assert.deepStrictEqual(orIntervalIterative([], []), [])
			assert.deepStrictEqual(
				orIntervalIterative([], [[5, 8], [1, 3], [2, 4]]),
				[[1, 4], [5, 8]],
			)
			assert.deepStrictEqual(
				orIntervalIterative([[5, 8], [1, 3], [2, 4]], []),
				[[1, 4], [5, 8]],
			)
		})

		test('merges touching closed intervals', () => {
			assert.deepStrictEqual(
				orIntervalIterative([[1, 3], [5, 7]], [[3, 5]]),
				[[1, 7]],
			)
			assert.deepStrictEqual(
				orIntervalIterative([[-10, 0]], [[0, 10]]),
				[[-10, 10]],
			)
		})

		test('handles point intervals [x, x]', () => {
			// Disjoint point intervals
			assert.deepStrictEqual(
				orIntervalIterative([[1, 1], [5, 5]], [[3, 3]]),
				[[1, 1], [3, 3], [5, 5]],
			)
			// Duplicate point intervals
			assert.deepStrictEqual(
				orIntervalIterative([[2, 2]], [[2, 2]]),
				[[2, 2]],
			)
			// Point touching left/right endpoints or strictly inside
			assert.deepStrictEqual(
				orIntervalIterative([[1, 1], [3, 3], [5, 5]], [[1, 5]]),
				[[1, 5]],
			)
			assert.deepStrictEqual(
				orIntervalIterative([[1, 5]], [[1, 1], [3, 3], [5, 5]]),
				[[1, 5]],
			)
		})

		test('handles -Infinity and Infinity bounds without NaN comparator issues', () => {
			assert.deepStrictEqual(
				orIntervalIterative([[-Infinity, 0]], [[0, Infinity]]),
				[[-Infinity, Infinity]],
			)
			assert.deepStrictEqual(
				orIntervalIterative([[-Infinity, -5]], [[5, Infinity]]),
				[[-Infinity, -5], [5, Infinity]],
			)
			assert.deepStrictEqual(
				orIntervalIterative([[-Infinity, 2], [-Infinity, -10]], [[-Infinity, 5], [1, 3]]),
				[[-Infinity, 5]],
			)
			assert.deepStrictEqual(
				orIntervalIterative([[10, Infinity], [2, Infinity]], [[5, Infinity]]),
				[[2, Infinity]],
			)
			assert.deepStrictEqual(
				orIntervalIterative([[-Infinity, Infinity]], [[1, 2], [3, 4]]),
				[[-Infinity, Infinity]],
			)
			assert.deepStrictEqual(
				orIntervalIterative([[-Infinity, -Infinity]], [[Infinity, Infinity]]),
				[[-Infinity, -Infinity], [Infinity, Infinity]],
			)
			assert.deepStrictEqual(
				orIntervalIterative([[-Infinity, -Infinity]], [[-Infinity, 0]]),
				[[-Infinity, 0]],
			)
			assert.deepStrictEqual(
				orIntervalIterative([[Infinity, Infinity]], [[0, Infinity]]),
				[[0, Infinity]],
			)
		})

		test('handles extreme finite numbers safely without overflow', () => {
			assert.deepStrictEqual(
				orIntervalIterative([[-Number.MAX_VALUE, -1]], [[1, Number.MAX_VALUE]]),
				[[-Number.MAX_VALUE, -1], [1, Number.MAX_VALUE]],
			)
			assert.deepStrictEqual(
				orIntervalIterative([[-Number.MAX_VALUE, 0]], [[0, Number.MAX_VALUE]]),
				[[-Number.MAX_VALUE, Number.MAX_VALUE]],
			)
			assert.deepStrictEqual(
				orIntervalIterative([[0, 0]], [[Number.MIN_VALUE, Number.MIN_VALUE]]),
				[[0, 0], [Number.MIN_VALUE, Number.MIN_VALUE]],
			)
		})

		test('normalizes -0 endpoints to +0', () => {
			const res = orIntervalIterative([[-0, -0]], [[-0, 1]])
			assert.deepStrictEqual(res, [[0, 1]])
			assert.ok(Object.is(res[0][0], 0))

			const resPoint = orIntervalIterative([[-0, -0]], [])
			assert.ok(Object.is(resPoint[0][0], 0))
			assert.ok(Object.is(resPoint[0][1], 0))
		})

		test('does not mutate inputs and returns fresh interval tuples', () => {
			const setA = [[5, 7], [1, 3]]
			const setB = [[2, 4]]
			const snapA = structuredClone(setA)
			const snapB = structuredClone(setB)

			const result = orIntervalIterative(setA, setB)
			assert.deepStrictEqual(setA, snapA)
			assert.deepStrictEqual(setB, snapB)

			// Mutating the output must not leak into inputs
			result[0][0] = -999
			assert.deepStrictEqual(setA, snapA)
			assert.deepStrictEqual(setB, snapB)
		})
	})

	describe('algebraic properties', () => {
		const a = [[5, 8], [-4, -1], [0, 0]]
		const b = [[-2, 1], [7, 10], [12, 15]]
		const c = [[10, 12], [-10, -5], [2, 6]]

		test('commutativity: or(A, B) === or(B, A)', () => {
			assert.deepStrictEqual(orIntervalIterative(a, b), orIntervalIterative(b, a))
		})

		test('associativity: or(or(A, B), C) === or(A, or(B, C))', () => {
			assert.deepStrictEqual(
				orIntervalIterative(orIntervalIterative(a, b), c),
				orIntervalIterative(a, orIntervalIterative(b, c)),
			)
		})

		test('idempotence and identity: or(A, A) === or(A, [])', () => {
			assert.deepStrictEqual(orIntervalIterative(a, a), orIntervalIterative(a, []))
		})

		test('absorbing element: or(A, [[-Infinity, Infinity]]) === [[-Infinity, Infinity]]', () => {
			assert.deepStrictEqual(
				orIntervalIterative(a, [[-Infinity, Infinity]]),
				[[-Infinity, Infinity]],
			)
		})
	})

	describe('input validation', () => {
		test('rejects non-array set arguments with TypeError', () => {
			for (const bad of [null, undefined, 42, '[]', {}, new Set()]) {
				assert.throws(() => orIntervalIterative(bad, []), TypeError)
				assert.throws(() => orIntervalIterative([], bad), TypeError)
			}
		})

		test('rejects non-array interval elements and sparse arrays with TypeError', () => {
			assert.throws(() => orIntervalIterative([null], []), TypeError)
			assert.throws(() => orIntervalIterative([], [{ lo: 0, hi: 1 }]), TypeError)
			assert.throws(() => orIntervalIterative([123], []), TypeError)
			// Sparse array with a hole
			// eslint-disable-next-line no-sparse-arrays
			assert.throws(() => orIntervalIterative([, [1, 2]], []), TypeError)
		})

		test('rejects intervals whose length is not 2 with RangeError', () => {
			assert.throws(() => orIntervalIterative([[]], []), RangeError)
			assert.throws(() => orIntervalIterative([[1]], []), RangeError)
			assert.throws(() => orIntervalIterative([], [[1, 2, 3]]), RangeError)
		})

		test('rejects non-number endpoints with TypeError', () => {
			assert.throws(() => orIntervalIterative([['0', 1]], []), TypeError)
			assert.throws(() => orIntervalIterative([[0, null]], []), TypeError)
			assert.throws(() => orIntervalIterative([], [[undefined, 2]]), TypeError)
			assert.throws(() => orIntervalIterative([[0n, 1n]], []), TypeError)
			// eslint-disable-next-line no-sparse-arrays
			assert.throws(() => orIntervalIterative([[, 1]], []), TypeError)
		})

		test('rejects NaN endpoints with RangeError', () => {
			assert.throws(() => orIntervalIterative([[NaN, 1]], []), RangeError)
			assert.throws(() => orIntervalIterative([[1, NaN]], []), RangeError)
			assert.throws(() => orIntervalIterative([], [[NaN, NaN]]), RangeError)
		})

		test('rejects inverted intervals (lo > hi) with RangeError', () => {
			assert.throws(() => orIntervalIterative([[5, 2]], []), RangeError)
			assert.throws(() => orIntervalIterative([], [[0, -1e-12]]), RangeError)
			assert.throws(() => orIntervalIterative([[Infinity, -Infinity]], []), RangeError)
			assert.throws(() => orIntervalIterative([[1, -Infinity]], []), RangeError)
			assert.throws(() => orIntervalIterative([[Infinity, 1]], []), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		test('dense grid indicator-function check across pseudo-random interval sets', () => {
			// Deterministic LCG PRNG so tests are 100% reproducible
			let seed = 0x12345678
			const nextRand = () => {
				seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
				return seed / 0x100000000
			}

			const makeRandomSet = (count) => {
				const out = []
				for (let i = 0; i < count; i += 1) {
					// Endpoints in [-16, 16] quantized to 0.25 so touching & point intervals occur frequently
					const a = Math.floor(nextRand() * 129 - 64) / 4
					const b = Math.floor(nextRand() * 129 - 64) / 4
					out.push(a <= b ? [a, b] : [b, a])
				}
				return out
			}

			for (let trial = 0; trial < 25; trial += 1) {
				const setA = makeRandomSet(trial % 8)
				const setB = makeRandomSet((trial * 3) % 8)
				const merged = orIntervalIterative(setA, setB)

				assertNormalized(merged)

				// Dense grid with step 0.125 hits every 0.25 endpoint AND every midpoint between them
				for (let k = -132; k <= 132; k += 1) {
					const x = k / 8
					const expected = containsPoint(x, setA) || containsPoint(x, setB)
					const actual = containsPoint(x, merged)
					assert.strictEqual(
						actual,
						expected,
						`trial ${trial} mismatch at x=${x}: expected ${expected}, got ${actual}`,
					)
				}
			}
		})

		test('exact endpoint & midpoint indicator check with irrationals and infinities', () => {
			const setA = [
				[-Infinity, -Math.PI],
				[-Math.SQRT2, 0.5],
				[Math.E, Math.E],
				[10, 12.5],
			]
			const setB = [
				[-4, -2],
				[0.5, Math.E],
				[12.5, Infinity],
			]

			const merged = orIntervalIterative(setA, setB)
			assertNormalized(merged)

			// Collect all finite endpoints, sort uniquely, then probe endpoints, midpoints, and ±Infinity
			const finitePts = [...new Set([...setA, ...setB].flat().filter(Number.isFinite))].sort(
				(x, y) => x - y,
			)
			const probes = [-Infinity, finitePts[0] - 1]
			for (let i = 0; i < finitePts.length; i += 1) {
				probes.push(finitePts[i])
				if (i + 1 < finitePts.length) {
					probes.push((finitePts[i] + finitePts[i + 1]) / 2)
				}
			}
			probes.push(finitePts[finitePts.length - 1] + 1, Infinity)

			for (const x of probes) {
				assert.strictEqual(
					containsPoint(x, merged),
					containsPoint(x, setA) || containsPoint(x, setB),
					`mismatch at probe x=${x}`,
				)
			}
		})
	})
})
