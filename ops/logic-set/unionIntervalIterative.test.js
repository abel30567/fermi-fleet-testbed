import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { unionIntervalIterative } from './unionIntervalIterative.js'

describe('unionIntervalIterative', () => {
	describe('normal cases', () => {
		it('unions disjoint sorted interval sets', () => {
			const a = [[0, 1], [4, 5]]
			const b = [[2, 3], [6, 7]]
			assert.deepEqual(unionIntervalIterative(a, b), [
				[0, 1],
				[2, 3],
				[4, 5],
				[6, 7],
			])
		})

		it('merges partially overlapping intervals across sets', () => {
			const a = [[1, 4], [8, 12]]
			const b = [[3, 6], [10, 15]]
			assert.deepEqual(unionIntervalIterative(a, b), [
				[1, 6],
				[8, 15],
			])
		})

		it('handles strictly nested intervals', () => {
			const a = [[0, 10]]
			const b = [[2, 3], [5, 8]]
			assert.deepEqual(unionIntervalIterative(a, b), [[0, 10]])
		})

		it('handles negative and floating-point bounds', () => {
			const a = [[-10.5, -2.25], [0.1, 0.5]]
			const b = [[-3.0, 0.1], [1.25, 2.75]]
			assert.deepEqual(unionIntervalIterative(a, b), [
				[-10.5, 0.5],
				[1.25, 2.75],
			])
		})
	})

	describe('edge cases', () => {
		it('handles empty sets, zero arguments, and single argument', () => {
			assert.deepEqual(unionIntervalIterative(), [])
			assert.deepEqual(unionIntervalIterative([]), [])
			assert.deepEqual(unionIntervalIterative([], []), [])
			assert.deepEqual(unionIntervalIterative([], [], []), [])
			assert.deepEqual(unionIntervalIterative([[2, 4]], []), [[2, 4]])
			assert.deepEqual(unionIntervalIterative([], [[2, 4]]), [[2, 4]])
			assert.deepEqual(
				unionIntervalIterative([[5, 7], [1, 3], [2, 5]]),
				[[1, 7]]
			)
		})

		it('merges touching closed intervals', () => {
			const a = [[1, 3], [5, 7]]
			const b = [[3, 5], [7, 9]]
			assert.deepEqual(unionIntervalIterative(a, b), [[1, 9]])
		})

		it('normalizes unsorted and internally overlapping input sets', () => {
			const a = [[10, 12], [1, 3], [2, 5], [10, 11]]
			const b = [[6, 8], [5, 6], [-2, -1], [-3, -2]]
			assert.deepEqual(unionIntervalIterative(a, b), [
				[-3, -1],
				[1, 8],
				[10, 12],
			])
		})

		it('handles degenerate point intervals [x, x]', () => {
			// Disjoint points
			assert.deepEqual(
				unionIntervalIterative([[3, 3], [1, 1]], [[2, 2]]),
				[[1, 1], [2, 2], [3, 3]]
			)

			// Duplicate points
			assert.deepEqual(
				unionIntervalIterative([[2, 2]], [[2, 2]]),
				[[2, 2]]
			)

			// Point touching endpoints or strictly inside another interval
			assert.deepEqual(
				unionIntervalIterative([[1, 1], [4, 4], [2.5, 2.5]], [[1, 4]]),
				[[1, 4]]
			)

			// Point bridging two touching intervals
			assert.deepEqual(
				unionIntervalIterative([[0, 2]], [[2, 2]], [[2, 5]]),
				[[0, 5]]
			)
		})

		it('handles infinite bounds and extreme finite bounds safely', () => {
			assert.deepEqual(
				unionIntervalIterative([[-Infinity, 0]], [[0, Infinity]]),
				[[-Infinity, Infinity]]
			)

			assert.deepEqual(
				unionIntervalIterative([[-Infinity, -5]], [[-10, 2]]),
				[[-Infinity, 2]]
			)

			assert.deepEqual(
				unionIntervalIterative([[5, Infinity]], [[10, 20]]),
				[[5, Infinity]]
			)

			assert.deepEqual(
				unionIntervalIterative([[-Infinity, -1]], [[1, Infinity]]),
				[[-Infinity, -1], [1, Infinity]]
			)

			assert.deepEqual(
				unionIntervalIterative([[-Infinity, Infinity]], [[-100, 100], [500, 600]]),
				[[-Infinity, Infinity]]
			)

			assert.deepEqual(
				unionIntervalIterative(
					[[-Number.MAX_VALUE, -1e308]],
					[[1e308, Number.MAX_VALUE]]
				),
				[
					[-Number.MAX_VALUE, -1e308],
					[1e308, Number.MAX_VALUE],
				]
			)
		})

		it('canonicalizes -0 bounds to +0', () => {
			const res1 = unionIntervalIterative([[-0, -0]], [[-0, -0]])
			assert.deepEqual(res1, [[0, 0]])
			assert.equal(Object.is(res1[0][0], 0), true)
			assert.equal(Object.is(res1[0][1], 0), true)

			const res2 = unionIntervalIterative([[-0, 1]], [[-1, -0]])
			assert.deepEqual(res2, [[-1, 1]])
		})

		it('supports variadic multi-set union (3+ sets)', () => {
			const s1 = [[0, 2], [20, 25]]
			const s2 = [[4, 6], [10, 12]]
			const s3 = [[2, 4], [11, 15]]
			const s4 = []
			const s5 = [[15, 20], [-5, -1]]
			assert.deepEqual(unionIntervalIterative(s1, s2, s3, s4, s5), [
				[-5, -1],
				[0, 6],
				[10, 25],
			])
		})

		it('does not mutate inputs and returns fresh interval tuples', () => {
			const a = [[3, 5], [1, 2]]
			const b = [[2, 4]]
			const snapshotA = structuredClone(a)
			const snapshotB = structuredClone(b)

			const result = unionIntervalIterative(a, b)
			assert.deepEqual(a, snapshotA)
			assert.deepEqual(b, snapshotB)

			// Mutating output must not affect original inputs
			result[0][0] = 999
			assert.deepEqual(a, snapshotA)
			assert.deepEqual(b, snapshotB)
		})

		it('handles large input sizes iteratively without stack issues', () => {
			const a = []
			const b = []
			for (let i = 0; i < 5000; i++) {
				a.push([i * 2, i * 2 + 1])
				b.push([i * 2 + 1, i * 2 + 2])
			}
			assert.deepEqual(unionIntervalIterative(a, b), [[0, 10000]])
		})
	})

	describe('algebraic properties', () => {
		it('satisfies commutativity, associativity, idempotence, and identity', () => {
			const a = [[1, 3], [7, 9], [-4, -4]]
			const b = [[2, 5], [10, 12]]
			const c = [[5, 7], [-5, -3]]

			// Commutativity
			assert.deepEqual(
				unionIntervalIterative(a, b),
				unionIntervalIterative(b, a)
			)

			// Associativity
			const leftAssoc = unionIntervalIterative(unionIntervalIterative(a, b), c)
			const rightAssoc = unionIntervalIterative(a, unionIntervalIterative(b, c))
			const variadic = unionIntervalIterative(a, b, c)
			assert.deepEqual(leftAssoc, rightAssoc)
			assert.deepEqual(leftAssoc, variadic)

			// Idempotence
			assert.deepEqual(
				unionIntervalIterative(a, a),
				unionIntervalIterative(a)
			)

			// Identity
			assert.deepEqual(
				unionIntervalIterative(a, []),
				unionIntervalIterative(a)
			)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when an interval set is not an array', () => {
			assert.throws(() => unionIntervalIterative(null, []), TypeError)
			assert.throws(() => unionIntervalIterative([], undefined), TypeError)
			assert.throws(() => unionIntervalIterative(42, []), TypeError)
			assert.throws(() => unionIntervalIterative('[]', []), TypeError)
			assert.throws(() => unionIntervalIterative({}, []), TypeError)
			assert.throws(() => unionIntervalIterative([[0, 1]], [[2, 3]], 'bad'), TypeError)
		})

		it('throws TypeError when an interval is not a 2-element tuple', () => {
			assert.throws(() => unionIntervalIterative([null], []), TypeError)
			assert.throws(() => unionIntervalIterative([{ lo: 0, hi: 1 }], []), TypeError)
			assert.throws(() => unionIntervalIterative([[]], []), TypeError)
			assert.throws(() => unionIntervalIterative([[1]], []), TypeError)
			assert.throws(() => unionIntervalIterative([[1, 2, 3]], []), TypeError)
			// Sparse array hole
			// eslint-disable-next-line no-sparse-arrays
			assert.throws(() => unionIntervalIterative([, [0, 1]], []), TypeError)
		})

		it('throws TypeError when interval bounds are not numbers', () => {
			assert.throws(() => unionIntervalIterative([['0', 1]], []), TypeError)
			assert.throws(() => unionIntervalIterative([[0, null]], []), TypeError)
			assert.throws(() => unionIntervalIterative([[undefined, 1]], []), TypeError)
			assert.throws(() => unionIntervalIterative([[0, 1n]], []), TypeError)
		})

		it('throws RangeError for NaN bounds or inverted intervals (lo > hi)', () => {
			assert.throws(() => unionIntervalIterative([[NaN, 1]], []), RangeError)
			assert.throws(() => unionIntervalIterative([[0, NaN]], []), RangeError)
			assert.throws(() => unionIntervalIterative([[NaN, NaN]], []), RangeError)
			assert.throws(() => unionIntervalIterative([[5, 2]], []), RangeError)
			assert.throws(() => unionIntervalIterative([[Infinity, 0]], []), RangeError)
			assert.throws(() => unionIntervalIterative([[0, -Infinity]], []), RangeError)
			assert.throws(() => unionIntervalIterative([[Infinity, -Infinity]], []), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		/**
		 * Independent point-membership oracle for an arbitrary (possibly unnormalized) interval set.
		 * @param {Array<[number, number]>} intervals
		 * @param {number} x
		 */
		function containsPoint(intervals, x) {
			for (const [lo, hi] of intervals) {
				if (x >= lo && x <= hi) return true
			}
			return false
		}

		/**
		 * Independent sweep-line event-counter oracle for closed interval union.
		 * Processes start events (+1) before end events (-1) at equal coordinates
		 * so touching intervals [a, b] and [b, c] merge into [a, c].
		 * @param {Array<Array<[number, number]>>} sets
		 */
		function sweepLineUnionOracle(sets) {
			const events = []
			for (const set of sets) {
				for (const [lo, hi] of set) {
					events.push([lo === 0 ? 0 : lo, 0]) // 0 = start
					events.push([hi === 0 ? 0 : hi, 1]) // 1 = end
				}
			}
			events.sort((a, b) => {
				if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1
				return a[1] - b[1]
			})

			const out = []
			let depth = 0
			let openLo = 0
			for (const [x, kind] of events) {
				if (kind === 0) {
					if (depth === 0) openLo = x
					depth++
				} else {
					depth--
					if (depth === 0) out.push([openLo, x])
				}
			}
			return out
		}

		it('matches dense point-sampling + exact endpoint/midpoint membership and sweep-line oracle across randomized multi-set trials', () => {
			// Deterministic LCG PRNG for reproducible tests
			let seed = 0x5f3759df
			function rand() {
				seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
				return seed / 0x100000000
			}

			for (let trial = 0; trial < 30; trial++) {
				const numSets = 2 + (trial % 4) // 2 to 5 sets
				const sets = []
				const allEndpoints = new Set()

				for (let s = 0; s < numSets; s++) {
					const count = Math.floor(rand() * 12)
					const set = []
					for (let i = 0; i < count; i++) {
						// Snap to quarter-integers in [-10, 10] to encourage frequent overlaps, touching, and singletons
						const a = Math.floor(rand() * 81 - 40) / 4
						const span = rand() < 0.15 ? 0 : Math.floor(rand() * 20) / 4
						const b = a + span
						set.push([a, b])
						allEndpoints.add(a)
						allEndpoints.add(b)
					}
					sets.push(set)
				}

				const actual = unionIntervalIterative(...sets)

				// 1. Canonical invariant checks
				for (let i = 0; i < actual.length; i++) {
					const [lo, hi] = actual[i]
					assert.ok(lo <= hi, `Trial ${trial}: lo <= hi failed for [${lo}, ${hi}]`)
					if (i > 0) {
						assert.ok(
							actual[i - 1][1] < lo,
							`Trial ${trial}: intervals not strictly disjoint/non-touching at index ${i}`
						)
					}
				}

				// 2. Sweep-line independent oracle cross-check
				const expectedSweep = sweepLineUnionOracle(sets)
				assert.deepEqual(actual, expectedSweep, `Trial ${trial}: sweep-line mismatch`)

				// 3. Dense grid point-sampling check across [-11, 16] at step 0.125
				for (let x = -11; x <= 16; x += 0.125) {
					const expectedMember = sets.some((s) => containsPoint(s, x))
					const actualMember = containsPoint(actual, x)
					assert.equal(
						actualMember,
						expectedMember,
						`Trial ${trial}: membership mismatch at grid point x=${x}`
					)
				}

				// 4. Exact endpoint and consecutive midpoint membership check
				const sortedEndpoints = [...allEndpoints].sort((x, y) => x - y)
				for (let i = 0; i < sortedEndpoints.length; i++) {
					const ep = sortedEndpoints[i]
					assert.equal(
						containsPoint(actual, ep),
						sets.some((s) => containsPoint(s, ep)),
						`Trial ${trial}: membership mismatch at endpoint x=${ep}`
					)
					if (i + 1 < sortedEndpoints.length) {
						const mid = (ep + sortedEndpoints[i + 1]) / 2
						assert.equal(
							containsPoint(actual, mid),
							sets.some((s) => containsPoint(s, mid)),
							`Trial ${trial}: membership mismatch at midpoint x=${mid}`
						)
					}
				}
			}
		})
	})
})
