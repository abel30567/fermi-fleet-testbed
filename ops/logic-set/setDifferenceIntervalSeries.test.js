import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { setDifferenceIntervalSeries } from './setDifferenceIntervalSeries.js'

/**
 * Independent reference implementation using the characteristic/Heaviside step-series
 * identity `1_{A \ B}(x) = 1_A(x) * (1 - 1_B(x))` evaluated over the elementary
 * partition of ℝ induced by all finite endpoints of `a` and `b`.
 *
 * @param {Array<[number, number]>} a
 * @param {Array<[number, number]>} b
 * @returns {Array<[number, number]>}
 */
function referenceIndicatorDifference(a, b) {
	const inSet = (set, x) => set.some(([lo, hi]) => lo <= x && x <= hi)

	const pts = new Set()
	for (const [lo, hi] of a) {
		if (Number.isFinite(lo)) pts.add(lo)
		if (Number.isFinite(hi)) pts.add(hi)
	}
	for (const [lo, hi] of b) {
		if (Number.isFinite(lo)) pts.add(lo)
		if (Number.isFinite(hi)) pts.add(hi)
	}

	const coords = [...pts].sort((x, y) => x - y)
	const pieces = []

	// Check (-Infinity, coords[0]) or (-Infinity, Infinity)
	if (coords.length === 0) {
		if (inSet(a, 0) && !inSet(b, 0)) {
			return [[-Infinity, Infinity]]
		}
		return []
	}

	const leftSample = coords[0] - 1
	if (inSet(a, leftSample) && !inSet(b, leftSample)) {
		pieces.push([-Infinity, coords[0]])
	}

	for (let i = 0; i < coords.length; i++) {
		const p = coords[i]
		if (inSet(a, p) && !inSet(b, p)) {
			pieces.push([p, p])
		}
		if (i + 1 < coords.length) {
			const mid = (p + coords[i + 1]) / 2
			if (inSet(a, mid) && !inSet(b, mid)) {
				pieces.push([p, coords[i + 1]])
			}
		}
	}

	const rightSample = coords[coords.length - 1] + 1
	if (inSet(a, rightSample) && !inSet(b, rightSample)) {
		pieces.push([coords[coords.length - 1], Infinity])
	}

	if (pieces.length <= 1) {
		return pieces
	}
	const merged = [pieces[0].slice()]
	for (let i = 1; i < pieces.length; i++) {
		const [lo, hi] = pieces[i]
		const last = merged[merged.length - 1]
		if (lo <= last[1]) {
			last[1] = Math.max(last[1], hi)
		} else {
			merged.push([lo, hi])
		}
	}
	return merged
}

/**
 * Computes total Lebesgue measure of a normalized finite interval set.
 *
 * @param {Array<[number, number]>} intervals
 * @returns {number}
 */
function lebesgueMeasure(intervals) {
	return intervals.reduce((sum, [lo, hi]) => sum + (hi - lo), 0)
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property tests.
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

describe('setDifferenceIntervalSeries', () => {
	describe('normal cases', () => {
		test('splits a single interval when subtrahend lies strictly inside', () => {
			assert.deepEqual(
				setDifferenceIntervalSeries([[0, 10]], [[3, 7]]),
				[[0, 3], [7, 10]],
			)
		})

		test('trims left and right ends of intervals', () => {
			assert.deepEqual(
				setDifferenceIntervalSeries([[0, 10]], [[-2, 4]]),
				[[4, 10]],
			)
			assert.deepEqual(
				setDifferenceIntervalSeries([[0, 10]], [[6, 12]]),
				[[0, 6]],
			)
		})

		test('preserves disjoint intervals unchanged (normalized)', () => {
			assert.deepEqual(
				setDifferenceIntervalSeries([[5, 7], [0, 2]], [[8, 10], [3, 4]]),
				[[0, 2], [5, 7]],
			)
		})

		test('normalizes overlapping and touching inputs before subtracting', () => {
			const a = [[5, 8], [0, 3], [2, 5], [10, 15]]
			const b = [[4, 6], [1, 2], [12, 13], [13, 14]]
			assert.deepEqual(
				setDifferenceIntervalSeries(a, b),
				[[0, 1], [2, 4], [6, 8], [10, 12], [14, 15]],
			)
		})

		test('returns empty set when b completely covers a', () => {
			assert.deepEqual(
				setDifferenceIntervalSeries([[1, 3], [5, 7]], [[0, 10]]),
				[],
			)
		})

		test('handles negative and fractional real endpoints', () => {
			assert.deepEqual(
				setDifferenceIntervalSeries([[-10.5, -2.25], [0.25, 4.75]], [[-6.5, 1.5]]),
				[[-10.5, -6.5], [1.5, 4.75]],
			)
		})

		test('does not mutate input arrays or inner interval tuples', () => {
			const a = [[4, 8], [0, 5]]
			const b = [[2, 6]]
			const aSnap = structuredClone(a)
			const bSnap = structuredClone(b)

			const res = setDifferenceIntervalSeries(a, b)
			assert.deepEqual(res, [[0, 2], [6, 8]])
			assert.deepEqual(a, aSnap)
			assert.deepEqual(b, bSnap)
		})
	})

	describe('edge cases', () => {
		test('handles empty sets', () => {
			assert.deepEqual(setDifferenceIntervalSeries([], []), [])
			assert.deepEqual(setDifferenceIntervalSeries([], [[0, 5]]), [])
			assert.deepEqual(
				setDifferenceIntervalSeries([[3, 5], [0, 3], [8, 9]], []),
				[[0, 5], [8, 9]],
			)
		})

		test('returns empty set for identical interval sets', () => {
			const a = [[0, 2], [4, 7], [10, 10]]
			assert.deepEqual(setDifferenceIntervalSeries(a, a), [])
		})

		test('handles touching boundary intervals cleanly', () => {
			assert.deepEqual(setDifferenceIntervalSeries([[0, 5]], [[5, 10]]), [[0, 5]])
			assert.deepEqual(setDifferenceIntervalSeries([[5, 10]], [[0, 5]]), [[5, 10]])
		})

		test('handles degenerate point intervals [p, p]', () => {
			// Point removed by identical or covering interval
			assert.deepEqual(setDifferenceIntervalSeries([[5, 5]], [[5, 5]]), [])
			assert.deepEqual(setDifferenceIntervalSeries([[5, 5]], [[0, 10]]), [])
			assert.deepEqual(setDifferenceIntervalSeries([[5, 5]], [[0, 5]]), [])
			assert.deepEqual(setDifferenceIntervalSeries([[5, 5]], [[5, 10]]), [])

			// Point preserved when disjoint from b
			assert.deepEqual(
				setDifferenceIntervalSeries([[5, 5]], [[0, 4], [6, 10]]),
				[[5, 5]],
			)

			// Point cut inside or at boundary of a non-degenerate interval merges back
			assert.deepEqual(setDifferenceIntervalSeries([[0, 10]], [[3, 3]]), [[0, 10]])
			assert.deepEqual(
				setDifferenceIntervalSeries([[0, 10]], [[0, 0], [5, 5], [10, 10]]),
				[[0, 10]],
			)
		})

		test('handles unbounded intervals with -Infinity and Infinity', () => {
			assert.deepEqual(
				setDifferenceIntervalSeries([[-Infinity, Infinity]], [[0, 5]]),
				[[-Infinity, 0], [5, Infinity]],
			)
			assert.deepEqual(
				setDifferenceIntervalSeries([[-Infinity, 10]], [[-Infinity, 0]]),
				[[0, 10]],
			)
			assert.deepEqual(
				setDifferenceIntervalSeries([[-Infinity, Infinity]], [[-Infinity, Infinity]]),
				[],
			)
			assert.deepEqual(
				setDifferenceIntervalSeries([[-Infinity, 0], [0, Infinity]], [[-5, 5]]),
				[[-Infinity, -5], [5, Infinity]],
			)
		})

		test('normalizes -0 endpoints to +0', () => {
			const res = setDifferenceIntervalSeries([[-0, 5]], [[2, 4]])
			assert.deepEqual(res, [[0, 2], [4, 5]])
			assert.equal(Object.is(res[0][0], 0), true)

			const pointRes = setDifferenceIntervalSeries([[-0, -0]], [[1, 2]])
			assert.equal(Object.is(pointRes[0][0], 0), true)
			assert.equal(Object.is(pointRes[0][1], 0), true)
		})
	})

	describe('invalid inputs', () => {
		test('rejects non-array arguments with TypeError', () => {
			for (const bad of [null, undefined, 123, '[[0,1]]', {}, new Set()]) {
				assert.throws(() => setDifferenceIntervalSeries(bad, []), TypeError)
				assert.throws(() => setDifferenceIntervalSeries([], bad), TypeError)
			}
		})

		test('rejects malformed interval tuples with TypeError', () => {
			for (const bad of [null, 1, [], [1], [1, 2, 3], { lo: 0, hi: 1 }]) {
				assert.throws(() => setDifferenceIntervalSeries([bad], []), TypeError)
				assert.throws(() => setDifferenceIntervalSeries([], [bad]), TypeError)
			}
		})

		test('rejects non-number endpoints with TypeError', () => {
			for (const bad of [['0', 1], [0, '1'], [null, 1], [0, undefined], [0n, 1]]) {
				assert.throws(() => setDifferenceIntervalSeries([bad], []), TypeError)
				assert.throws(() => setDifferenceIntervalSeries([], [bad]), TypeError)
			}
		})

		test('rejects NaN, inverted bounds, and degenerate infinite points with RangeError', () => {
			const badIntervals = [
				[NaN, 1],
				[0, NaN],
				[5, 2],
				[Infinity, 0],
				[0, -Infinity],
				[Infinity, Infinity],
				[-Infinity, -Infinity],
			]
			for (const bad of badIntervals) {
				assert.throws(() => setDifferenceIntervalSeries([bad], []), RangeError)
				assert.throws(() => setDifferenceIntervalSeries([], [bad]), RangeError)
			}
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		test('matches independent indicator-partition reference across 100 random instances', () => {
			const rand = mulberry32(0x5eed1234)
			const genSet = (allowInf) => {
				const count = Math.floor(rand() * 8)
				const out = []
				for (let i = 0; i < count; i++) {
					const r = rand()
					if (allowInf && r < 0.08) {
						const hi = Math.floor(rand() * 21) - 10
						out.push([-Infinity, hi])
					} else if (allowInf && r < 0.16) {
						const lo = Math.floor(rand() * 21) - 10
						out.push([lo, Infinity])
					} else {
						const x = Math.floor(rand() * 21) - 10
						const width = rand() < 0.2 ? 0 : Math.floor(rand() * 8)
						out.push([x, x + width])
					}
				}
				return out
			}

			for (let trial = 0; trial < 100; trial++) {
				const allowInf = trial >= 70
				const a = genSet(allowInf)
				const b = genSet(allowInf)
				const actual = setDifferenceIntervalSeries(a, b)
				const expected = referenceIndicatorDifference(a, b)
				assert.deepEqual(actual, expected, `mismatch on trial ${trial}`)

				// Verify canonical normalized invariants
				for (let i = 0; i < actual.length; i++) {
					assert.ok(actual[i][0] <= actual[i][1], 'lo <= hi invariant')
					if (i > 0) {
						assert.ok(actual[i - 1][1] < actual[i][0], 'strictly disjoint & non-touching')
					}
				}
			}
		})

		test('satisfies set-algebraic and Lebesgue measure identities', () => {
			const rand = mulberry32(0xc0ffee42)
			const genFiniteSet = () => {
				const count = Math.floor(rand() * 7)
				const out = []
				for (let i = 0; i < count; i++) {
					const lo = Math.floor(rand() * 40) - 20
					const hi = lo + Math.floor(rand() * 12)
					out.push([lo, hi])
				}
				return out
			}

			const U = [[-Infinity, Infinity]]

			for (let trial = 0; trial < 50; trial++) {
				const a = genFiniteSet()
				const b = genFiniteSet()
				const c = genFiniteSet()

				const normA = setDifferenceIntervalSeries(a, [])
				const diffAB = setDifferenceIntervalSeries(a, b)

				// Double-complement identity: U \ (U \ A) equals the regular-closed part of A
				// (all non-degenerate components lo < hi of normalize(A))
				const regularA = normA.filter(([lo, hi]) => lo < hi)
				const doubleComp = setDifferenceIntervalSeries(
					U,
					setDifferenceIntervalSeries(U, a),
				)
				assert.deepEqual(doubleComp, regularA)

				// Chained difference identity: (A \ B) \ C = A \ (B ∪ C)
				const lhs = setDifferenceIntervalSeries(diffAB, c)
				const rhs = setDifferenceIntervalSeries(a, [...b, ...c])
				assert.deepEqual(lhs, rhs)

				// Measure identity: μ(A \ B) + μ(A ∩ B) = μ(A), where A ∩ B = A \ (A \ B)
				const interAB = setDifferenceIntervalSeries(a, diffAB)
				assert.equal(
					lebesgueMeasure(diffAB) + lebesgueMeasure(interAB),
					lebesgueMeasure(normA),
				)

				// Disjointness of (A \ B) and B: (A \ B) \ B = A \ B
				assert.deepEqual(setDifferenceIntervalSeries(diffAB, b), diffAB)
			}
		})
	})
})
