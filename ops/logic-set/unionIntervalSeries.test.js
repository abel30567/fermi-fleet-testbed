import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { unionIntervalSeries } from './unionIntervalSeries.js'

/**
 * Independent reference implementation via direct sort-and-merge.
 */
function referenceSortMergeUnion(...sets) {
	const all = []
	for (const set of sets) {
		for (const [lo, hi] of set) {
			all.push([lo === 0 ? 0 : lo, hi === 0 ? 0 : hi])
		}
	}
	if (all.length === 0) return []
	all.sort((a, b) => {
		if (a[0] < b[0]) return -1
		if (a[0] > b[0]) return 1
		if (a[1] < b[1]) return -1
		if (a[1] > b[1]) return 1
		return 0
	})
	const out = [[all[0][0], all[0][1]]]
	for (let i = 1; i < all.length; i++) {
		const [lo, hi] = all[i]
		const last = out[out.length - 1]
		if (lo <= last[1]) {
			if (hi > last[1]) last[1] = hi
		} else {
			out.push([lo, hi])
		}
	}
	return out
}

/**
 * Indicator function: returns true iff x belongs to at least one closed interval.
 */
function inIntervalSet(set, x) {
	for (const [lo, hi] of set) {
		if (x >= lo && x <= hi) return true
	}
	return false
}

/**
 * Computes total Lebesgue length of a normalized disjoint finite interval set.
 */
function totalLength(set) {
	return set.reduce((sum, [lo, hi]) => sum + (hi - lo), 0)
}

/**
 * Computes intersection of two normalized finite interval sets for inclusion-exclusion check.
 */
function intersectIntervalSets(a, b) {
	const result = []
	for (const [aLo, aHi] of a) {
		for (const [bLo, bHi] of b) {
			const lo = Math.max(aLo, bLo)
			const hi = Math.min(aHi, bHi)
			if (lo <= hi) result.push([lo, hi])
		}
	}
	return unionIntervalSeries(result)
}

describe('unionIntervalSeries', () => {
	describe('normal cases', () => {
		it('merges overlapping intervals across two sets', () => {
			const a = [
				[1, 4],
				[8, 10],
			]
			const b = [
				[3, 6],
				[9, 12],
			]
			assert.deepStrictEqual(unionIntervalSeries(a, b), [
				[1, 6],
				[8, 12],
			])
		})

		it('keeps disjoint intervals sorted in ascending order', () => {
			const a = [
				[10, 12],
				[0, 2],
			]
			const b = [
				[5, 7],
				[-5, -3],
			]
			assert.deepStrictEqual(unionIntervalSeries(a, b), [
				[-5, -3],
				[0, 2],
				[5, 7],
				[10, 12],
			])
		})

		it('merges touching closed intervals', () => {
			const a = [
				[1, 2],
				[4, 5],
			]
			const b = [
				[2, 4],
				[5, 6],
			]
			assert.deepStrictEqual(unionIntervalSeries(a, b), [[1, 6]])
		})

		it('absorbs nested and duplicate intervals', () => {
			const a = [
				[0, 10],
				[2, 5],
				[0, 10],
			]
			const b = [
				[1, 3],
				[4, 9],
				[10, 10],
			]
			assert.deepStrictEqual(unionIntervalSeries(a, b), [[0, 10]])
		})

		it('supports variadic union over three or more sets', () => {
			const a = [[0, 2]]
			const b = [[4, 6]]
			const c = [[1.5, 4.5]]
			const d = [[10, 12]]
			assert.deepStrictEqual(unionIntervalSeries(a, b, c, d), [
				[0, 6],
				[10, 12],
			])
		})

		it('handles floating-point and negative intervals', () => {
			const a = [
				[-3.5, -1.25],
				[0.1, 0.5],
			]
			const b = [
				[-2.0, 0.2],
				[0.5, 1.75],
			]
			assert.deepStrictEqual(unionIntervalSeries(a, b), [[-3.5, 1.75]])
		})
	})

	describe('edge cases', () => {
		it('returns empty set when called with no arguments or empty sets', () => {
			assert.deepStrictEqual(unionIntervalSeries(), [])
			assert.deepStrictEqual(unionIntervalSeries([]), [])
			assert.deepStrictEqual(unionIntervalSeries([], [], []), [])
		})

		it('normalizes a single unsorted overlapping set', () => {
			const a = [
				[5, 7],
				[1, 3],
				[2, 6],
			]
			assert.deepStrictEqual(unionIntervalSeries(a), [[1, 7]])
		})

		it('preserves isolated degenerate point intervals [x, x] and merges touching ones', () => {
			assert.deepStrictEqual(
				unionIntervalSeries(
					[
						[2, 2],
						[5, 5],
					],
					[
						[2, 2],
						[5, 7],
						[9, 9],
					]
				),
				[
					[2, 2],
					[5, 7],
					[9, 9],
				]
			)
		})

		it('normalizes -0 endpoints to +0', () => {
			const result = unionIntervalSeries([[-0, 1]], [[-2, -0]])
			assert.deepStrictEqual(result, [[-2, 1]])
			const zeroPoint = unionIntervalSeries([[-0, -0]])
			assert.equal(Object.is(zeroPoint[0][0], 0), true)
			assert.equal(Object.is(zeroPoint[0][1], 0), true)
		})

		it('handles extended real intervals with -Infinity and +Infinity', () => {
			assert.deepStrictEqual(
				unionIntervalSeries([[-Infinity, 0]], [[0, Infinity]]),
				[[-Infinity, Infinity]]
			)
			assert.deepStrictEqual(
				unionIntervalSeries(
					[[-Infinity, -10]],
					[
						[-15, -5],
						[10, Infinity],
					]
				),
				[
					[-Infinity, -5],
					[10, Infinity],
				]
			)
		})

		it('handles extreme finite magnitudes without overflow', () => {
			const result = unionIntervalSeries(
				[[-Number.MAX_VALUE, -1e300]],
				[[-1e300, Number.MAX_VALUE]]
			)
			assert.deepStrictEqual(result, [[-Number.MAX_VALUE, Number.MAX_VALUE]])
		})

		it('does not mutate input sets or intervals', () => {
			const i1 = [3, 5]
			const i2 = [1, 4]
			const a = [i1, i2]
			const b = [[4, 6]]
			const out = unionIntervalSeries(a, b)
			assert.deepStrictEqual(a, [
				[3, 5],
				[1, 4],
			])
			assert.deepStrictEqual(b, [[4, 6]])
			out[0][0] = 999
			assert.deepStrictEqual(i2, [1, 4])
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when a set argument is not an array', () => {
			assert.throws(() => unionIntervalSeries(null), TypeError)
			assert.throws(() => unionIntervalSeries(undefined), TypeError)
			assert.throws(() => unionIntervalSeries([], 'not-an-array'), TypeError)
			assert.throws(() => unionIntervalSeries({ 0: [1, 2] }), TypeError)
		})

		it('throws TypeError when an interval is not a 2-element array', () => {
			assert.throws(() => unionIntervalSeries([1]), TypeError)
			assert.throws(() => unionIntervalSeries([[1]]), TypeError)
			assert.throws(() => unionIntervalSeries([[1, 2, 3]]), TypeError)
			assert.throws(() => unionIntervalSeries([{ lo: 1, hi: 2 }]), TypeError)
		})

		it('throws TypeError when endpoints are not numbers', () => {
			assert.throws(() => unionIntervalSeries([['1', 2]]), TypeError)
			assert.throws(() => unionIntervalSeries([[1, null]]), TypeError)
			assert.throws(() => unionIntervalSeries([[undefined, 2]]), TypeError)
			assert.throws(() => unionIntervalSeries([[1n, 2n]]), TypeError)
		})

		it('throws RangeError for NaN endpoints', () => {
			assert.throws(() => unionIntervalSeries([[NaN, 1]]), RangeError)
			assert.throws(() => unionIntervalSeries([[1, NaN]]), RangeError)
		})

		it('throws RangeError when lo > hi', () => {
			assert.throws(() => unionIntervalSeries([[5, 2]]), RangeError)
			assert.throws(() => unionIntervalSeries([[Infinity, -Infinity]]), RangeError)
		})

		it('throws RangeError for degenerate infinite intervals', () => {
			assert.throws(() => unionIntervalSeries([[Infinity, Infinity]]), RangeError)
			assert.throws(() => unionIntervalSeries([[-Infinity, -Infinity]]), RangeError)
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		it('matches direct sort-and-merge reference and pointwise indicator identity across deterministic random sets', () => {
			// Deterministic LCG PRNG
			let seed = 0x5eed1234
			const rand = () => {
				seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
				return seed / 0x100000000
			}

			for (let trial = 0; trial < 40; trial++) {
				const numSets = 1 + Math.floor(rand() * 4)
				const sets = []
				const coords = new Set()

				for (let s = 0; s < numSets; s++) {
					const len = Math.floor(rand() * 8)
					const set = []
					for (let i = 0; i < len; i++) {
						const x = Math.floor((rand() - 0.5) * 30) / 2
						const width = rand() < 0.2 ? 0 : Math.floor(rand() * 12) / 2
						const lo = x
						const hi = x + width
						set.push([lo, hi])
						coords.add(lo)
						coords.add(hi)
					}
					sets.push(set)
				}

				const actual = unionIntervalSeries(...sets)
				const expected = referenceSortMergeUnion(...sets)
				assert.deepStrictEqual(actual, expected)

				// Verify canonical output invariants: strictly separated and lo <= hi
				for (let i = 0; i < actual.length; i++) {
					assert.ok(actual[i][0] <= actual[i][1])
					if (i > 0) {
						assert.ok(actual[i - 1][1] < actual[i][0])
					}
				}

				// Pointwise indicator identity at all critical endpoints, midpoints, and outside bounds
				const sortedCoords = [...coords].sort((a, b) => a - b)
				const probePoints = []
				if (sortedCoords.length > 0) {
					probePoints.push(sortedCoords[0] - 1)
					for (let i = 0; i < sortedCoords.length; i++) {
						probePoints.push(sortedCoords[i])
						if (i + 1 < sortedCoords.length) {
							probePoints.push((sortedCoords[i] + sortedCoords[i + 1]) / 2)
						}
					}
					probePoints.push(sortedCoords[sortedCoords.length - 1] + 1)
				}

				for (const x of probePoints) {
					const inUnion = inIntervalSet(actual, x)
					const inAny = sets.some((s) => inIntervalSet(s, x))
					assert.equal(inUnion, inAny)
				}
			}
		})

		it('satisfies set-algebra laws (commutativity, associativity, idempotence, identity) and inclusion-exclusion measure', () => {
			const a = [
				[-4, -1],
				[0, 3],
				[7, 10],
			]
			const b = [
				[-2, 1],
				[2, 5],
				[9, 12],
			]
			const c = [
				[-6, -3],
				[4, 8],
			]

			// Commutativity: A U B = B U A
			assert.deepStrictEqual(unionIntervalSeries(a, b), unionIntervalSeries(b, a))

			// Associativity: (A U B) U C = A U (B U C) = U(A, B, C)
			const leftAssoc = unionIntervalSeries(unionIntervalSeries(a, b), c)
			const rightAssoc = unionIntervalSeries(a, unionIntervalSeries(b, c))
			const variadic = unionIntervalSeries(a, b, c)
			assert.deepStrictEqual(leftAssoc, rightAssoc)
			assert.deepStrictEqual(leftAssoc, variadic)

			// Idempotence: A U A = norm(A)
			assert.deepStrictEqual(unionIntervalSeries(a, a), unionIntervalSeries(a))

			// Identity element: A U {} = norm(A)
			assert.deepStrictEqual(unionIntervalSeries(a, []), unionIntervalSeries(a))

			// Inclusion-exclusion measure identity: mu(A U B) = mu(A) + mu(B) - mu(A n B)
			const normA = unionIntervalSeries(a)
			const normB = unionIntervalSeries(b)
			const unionAB = unionIntervalSeries(a, b)
			const interAB = intersectIntervalSets(normA, normB)
			assert.equal(
				totalLength(unionAB),
				totalLength(normA) + totalLength(normB) - totalLength(interAB)
			)
		})
	})
})
