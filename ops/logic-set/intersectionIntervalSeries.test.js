import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { intersectionIntervalSeries } from './intersectionIntervalSeries.js'

/**
 * Independent reference implementation using the distributive pairwise closed-form
 * identity: (⋃_i I_i) ∩ (⋃_j J_j) = ⋃_{i,j} [max(l_i, l_j), min(u_i, u_j)],
 * followed by naive sorting and merging.
 *
 * @param {Array<[number, number]>} a
 * @param {Array<[number, number]>} b
 * @returns {Array<[number, number]>}
 */
function pairwiseDistributiveIntersection(a, b) {
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
	raw.sort((x, y) => x[0] - y[0] || x[1] - y[1])
	const merged = []
	for (const [lo, hi] of raw) {
		if (merged.length === 0 || lo > merged[merged.length - 1][1]) {
			merged.push([lo, hi])
		} else {
			merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], hi)
		}
	}
	return merged
}

/**
 * Independent membership predicate directly evaluating `x ∈ ⋃_i [l_i, u_i]`.
 *
 * @param {Array<[number, number]>} set
 * @param {number} x
 * @returns {boolean}
 */
function containsPoint(set, x) {
	return set.some(([lo, hi]) => x >= lo && x <= hi)
}

/**
 * Independent Lebesgue measure (total length) of a normalized disjoint interval set.
 *
 * @param {Array<[number, number]>} normalizedSet
 * @returns {number}
 */
function measure(normalizedSet) {
	return normalizedSet.reduce((sum, [lo, hi]) => sum + (hi - lo), 0)
}

/**
 * Independent union via sort-and-merge for inclusion-exclusion cross-checking.
 *
 * @param {Array<[number, number]>} a
 * @param {Array<[number, number]>} b
 * @returns {Array<[number, number]>}
 */
function unionMerged(a, b) {
	const all = [...a, ...b].map(([lo, hi]) => [lo, hi])
	all.sort((x, y) => x[0] - y[0] || x[1] - y[1])
	const merged = []
	for (const [lo, hi] of all) {
		if (merged.length === 0 || lo > merged[merged.length - 1][1]) {
			merged.push([lo, hi])
		} else {
			merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], hi)
		}
	}
	return merged
}

describe('intersectionIntervalSeries', () => {
	describe('normal cases', () => {
		test('intersects partially overlapping single intervals', () => {
			assert.deepEqual(
				intersectionIntervalSeries([[1, 5]], [[3, 7]]),
				[[3, 5]],
			)
		})

		test('intersects multiple disjoint intervals with containment and partial overlap', () => {
			assert.deepEqual(
				intersectionIntervalSeries(
					[[0, 2], [5, 10], [13, 23], [24, 25]],
					[[1, 5], [8, 12], [15, 24], [25, 26]],
				),
				[[1, 2], [5, 5], [8, 10], [15, 23], [24, 24], [25, 25]],
			)
		})

		test('normalizes unsorted, overlapping, and duplicate input intervals', () => {
			const a = [[6, 10], [1, 4], [2, 5], [6, 10], [9, 12]]
			const b = [[8, 11], [0, 3], [2.5, 4.5]]
			assert.deepEqual(intersectionIntervalSeries(a, b), [
				[1, 4.5],
				[8, 11],
			])
		})

		test('handles negative and floating-point real intervals', () => {
			const a = [[-10.5, -2.25], [-0.5, 3.75]]
			const b = [[-5.0, 0.25], [2.5, 10.0]]
			assert.deepEqual(intersectionIntervalSeries(a, b), [
				[-5.0, -2.25],
				[-0.5, 0.25],
				[2.5, 3.75],
			])
		})

		test('supports n-ary intersection across three or more interval sets', () => {
			const a = [[0, 10], [20, 30]]
			const b = [[-5, 6], [8, 25]]
			const c = [[2, 4], [5, 9], [22, 28]]
			assert.deepEqual(intersectionIntervalSeries(a, b, c), [
				[2, 4],
				[5, 6],
				[8, 9],
				[22, 25],
			])
		})
	})

	describe('edge cases', () => {
		test('returns empty array when any input set is empty', () => {
			assert.deepEqual(intersectionIntervalSeries([], []), [])
			assert.deepEqual(intersectionIntervalSeries([], [[1, 2]]), [])
			assert.deepEqual(intersectionIntervalSeries([[1, 2]], []), [])
			assert.deepEqual(
				intersectionIntervalSeries([[1, 5]], [[2, 4]], []),
				[],
			)
		})

		test('returns empty array for strictly disjoint interval sets', () => {
			assert.deepEqual(
				intersectionIntervalSeries([[1, 2], [5, 6]], [[3, 4], [7, 8]]),
				[],
			)
		})

		test('preserves closed touching boundary points as degenerate intervals [p, p]', () => {
			assert.deepEqual(
				intersectionIntervalSeries([[1, 3]], [[3, 5]]),
				[[3, 3]],
			)
			assert.deepEqual(
				intersectionIntervalSeries([[1, 2], [3, 4]], [[2, 3]]),
				[[2, 2], [3, 3]],
			)
		})

		test('handles degenerate point intervals [p, p] accurately', () => {
			assert.deepEqual(
				intersectionIntervalSeries([[2, 2]], [[1, 3]]),
				[[2, 2]],
			)
			assert.deepEqual(
				intersectionIntervalSeries([[2, 2]], [[2, 2]]),
				[[2, 2]],
			)
			assert.deepEqual(
				intersectionIntervalSeries([[2, 2]], [[3, 3]]),
				[],
			)
			assert.deepEqual(
				intersectionIntervalSeries([[2, 2]], [[1, 2]], [[2, 5]]),
				[[2, 2]],
			)
		})

		test('merges touching intervals within a single set before intersecting', () => {
			// [1, 2] ∪ [2, 3] = [1, 3], so intersecting with [1.5, 2.5] must yield [[1.5, 2.5]]
			assert.deepEqual(
				intersectionIntervalSeries([[1, 2], [2, 3]], [[1.5, 2.5]]),
				[[1.5, 2.5]],
			)
		})

		test('normalizes -0 to +0 in output intervals', () => {
			const res = intersectionIntervalSeries([[-0, 1]], [[-1, -0]])
			assert.deepEqual(res, [[0, 0]])
			assert.ok(Object.is(res[0][0], 0))
			assert.ok(Object.is(res[0][1], 0))
		})

		test('handles extreme finite floating-point bounds without overflow', () => {
			const res = intersectionIntervalSeries(
				[[-Number.MAX_VALUE, Number.MAX_VALUE]],
				[[-1e308, 1e308]],
			)
			assert.deepEqual(res, [[-1e308, 1e308]])
		})

		test('does not mutate input arrays or interval tuples', () => {
			const a = [[5, 8], [1, 3], [2, 4]]
			const b = [[3, 6], [0, 1]]
			const aSnapshot = structuredClone(a)
			const bSnapshot = structuredClone(b)

			const res = intersectionIntervalSeries(a, b)
			assert.deepEqual(res, [[1, 1], [3, 4], [5, 6]])
			assert.deepEqual(a, aSnapshot)
			assert.deepEqual(b, bSnapshot)
		})
	})

	describe('invalid inputs', () => {
		test('throws TypeError when fewer than two arguments are provided', () => {
			assert.throws(() => intersectionIntervalSeries(), TypeError)
			assert.throws(() => intersectionIntervalSeries([[1, 2]]), TypeError)
		})

		test('throws TypeError when any argument is not an array', () => {
			for (const bad of [null, undefined, 42, 'interval', {}, new Set()]) {
				assert.throws(() => intersectionIntervalSeries(bad, [[1, 2]]), TypeError)
				assert.throws(() => intersectionIntervalSeries([[1, 2]], bad), TypeError)
				// Must still validate later sets even if earlier set is empty
				assert.throws(() => intersectionIntervalSeries([], bad), TypeError)
			}
		})

		test('throws TypeError when any interval is not a 2-element numeric tuple', () => {
			assert.throws(() => intersectionIntervalSeries([1, 2], [[1, 2]]), TypeError)
			assert.throws(() => intersectionIntervalSeries([[]], [[1, 2]]), TypeError)
			assert.throws(() => intersectionIntervalSeries([[1]], [[1, 2]]), TypeError)
			assert.throws(
				() => intersectionIntervalSeries([[1, 2, 3]], [[1, 2]]),
				TypeError,
			)
			assert.throws(
				() => intersectionIntervalSeries([['1', 2]], [[1, 2]]),
				TypeError,
			)
			assert.throws(
				() => intersectionIntervalSeries([[1, null]], [[1, 2]]),
				TypeError,
			)
			assert.throws(
				() => intersectionIntervalSeries([[1n, 2n]], [[1, 2]]),
				TypeError,
			)
		})

		test('throws RangeError for non-finite bounds or inverted intervals (lo > hi)', () => {
			assert.throws(
				() => intersectionIntervalSeries([[NaN, 1]], [[0, 2]]),
				RangeError,
			)
			assert.throws(
				() => intersectionIntervalSeries([[0, NaN]], [[0, 2]]),
				RangeError,
			)
			assert.throws(
				() => intersectionIntervalSeries([[-Infinity, 1]], [[0, 2]]),
				RangeError,
			)
			assert.throws(
				() => intersectionIntervalSeries([[0, Infinity]], [[0, 2]]),
				RangeError,
			)
			assert.throws(
				() => intersectionIntervalSeries([[5, 2]], [[0, 10]]),
				RangeError,
			)
			// Must validate even when another set is empty
			assert.throws(
				() => intersectionIntervalSeries([], [[5, 2]]),
				RangeError,
			)
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		/**
		 * Deterministic LCG PRNG for reproducible fuzz/cross-check suites.
		 * @param {number} seed
		 */
		function makePrng(seed) {
			let state = seed >>> 0
			return () => {
				state = (1664525 * state + 1013904223) >>> 0
				return state / 0x100000000
			}
		}

		/**
		 * Generates a random unnormalized set of closed intervals on integer/half-integer grid.
		 * @param {() => number} rand
		 * @param {number} maxCount
		 * @returns {Array<[number, number]>}
		 */
		function randomIntervalSet(rand, maxCount) {
			const count = Math.floor(rand() * (maxCount + 1))
			const set = []
			for (let i = 0; i < count; i++) {
				const lo = Math.floor(rand() * 25) - 12
				const width = Math.floor(rand() * 8) // allows 0-width point intervals
				set.push([lo / 2, (lo + width) / 2])
			}
			return set
		}

		test('matches pairwise distributive reference and point-indicator oracle over 100 random cases', () => {
			const rand = makePrng(0x5eed1234)
			for (let trial = 0; trial < 100; trial++) {
				const a = randomIntervalSet(rand, 8)
				const b = randomIntervalSet(rand, 8)
				const c = randomIntervalSet(rand, 6)

				const ab = intersectionIntervalSeries(a, b)
				const abRef = pairwiseDistributiveIntersection(a, b)
				assert.deepEqual(ab, abRef)

				// Output canonicality invariant: strictly separated, valid closed intervals
				for (let i = 0; i < ab.length; i++) {
					assert.ok(ab[i][0] <= ab[i][1])
					if (i > 0) {
						assert.ok(ab[i - 1][1] < ab[i][0])
					}
				}

				// Independent indicator-membership cross-check on all endpoints & midpoints
				const coords = new Set([-100, 100])
				for (const set of [a, b, ab]) {
					for (const [lo, hi] of set) {
						coords.add(lo)
						coords.add(hi)
					}
				}
				const sortedCoords = [...coords].sort((x, y) => x - y)
				const probes = []
				for (let i = 0; i < sortedCoords.length; i++) {
					probes.push(sortedCoords[i])
					if (i + 1 < sortedCoords.length) {
						probes.push((sortedCoords[i] + sortedCoords[i + 1]) / 2)
					}
				}
				for (const x of probes) {
					const expected = containsPoint(a, x) && containsPoint(b, x)
					assert.equal(containsPoint(ab, x), expected)
				}

				// Algebraic identities: commutativity, associativity, idempotence
				assert.deepEqual(ab, intersectionIntervalSeries(b, a))
				assert.deepEqual(
					intersectionIntervalSeries(a, b, c),
					intersectionIntervalSeries(ab, c),
				)
				assert.deepEqual(
					intersectionIntervalSeries(a, b, c),
					intersectionIntervalSeries(a, intersectionIntervalSeries(b, c)),
				)
				assert.deepEqual(
					intersectionIntervalSeries(ab, ab),
					ab,
				)

				// Measure inclusion-exclusion identity: μ(A ∪ B) = μ(A) + μ(B) - μ(A ∩ B)
				const normA = unionMerged(a, [])
				const normB = unionMerged(b, [])
				const normUnion = unionMerged(a, b)
				assert.equal(
					measure(normUnion),
					measure(normA) + measure(normB) - measure(ab),
				)
			}
		})
	})
})
