import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { xorIntervalSeries } from './xorIntervalSeries.js'

/**
 * Independent reference helpers for cross-checking via classical set algebra
 * `(A \ B) U (B \ A)` and `(A U B) \ (A n B)` as well as point sampling.
 */
function refNormalize(intervals) {
	if (intervals.length === 0) return []
	const sorted = intervals
		.map(([lo, hi]) => [lo === 0 ? 0 : lo, hi === 0 ? 0 : hi])
		.sort((u, v) => (u[0] < v[0] ? -1 : u[0] > v[0] ? 1 : u[1] < v[1] ? -1 : u[1] > v[1] ? 1 : 0))
	const out = [[sorted[0][0], sorted[0][1]]]
	for (let i = 1; i < sorted.length; i++) {
		const prev = out[out.length - 1]
		const [lo, hi] = sorted[i]
		if (lo <= prev[1]) {
			if (hi > prev[1]) prev[1] = hi
		} else {
			out.push([lo, hi])
		}
	}
	return out
}

function refUnion(a, b) {
	return refNormalize([...a, ...b])
}

function refIntersect(a, b) {
	const na = refNormalize(a)
	const nb = refNormalize(b)
	const out = []
	for (const [a0, a1] of na) {
		for (const [b0, b1] of nb) {
			const lo = Math.max(a0, b0)
			const hi = Math.min(a1, b1)
			if (lo < hi) {
				out.push([lo, hi])
			} else if (lo === hi && (a0 === a1 || b0 === b1)) {
				out.push([lo, hi])
			}
		}
	}
	return refNormalize(out)
}

function refDifference(a, b) {
	const na = refNormalize(a)
	const nb = refNormalize(b)
	const out = []
	for (const [a0, a1] of na) {
		if (a0 === a1) {
			const covered = nb.some(([b0, b1]) => b0 <= a0 && a0 <= b1)
			if (!covered) out.push([a0, a1])
			continue
		}
		let pieces = [[a0, a1]]
		for (const [b0, b1] of nb) {
			if (b0 === b1) continue
			const next = []
			for (const [p0, p1] of pieces) {
				if (b1 <= p0 || b0 >= p1) {
					next.push([p0, p1])
				} else {
					if (p0 < b0) next.push([p0, b0])
					if (b1 < p1) next.push([b1, p1])
				}
			}
			pieces = next
		}
		out.push(...pieces)
	}
	return refNormalize(out)
}

function refContains(intervals, x) {
	return intervals.some(([lo, hi]) => lo <= x && x <= hi)
}

function refMeasure(intervals) {
	return refNormalize(intervals).reduce((sum, [lo, hi]) => sum + (hi - lo), 0)
}

function assertCanonical(intervals) {
	for (let i = 0; i < intervals.length; i++) {
		const [lo, hi] = intervals[i]
		assert.equal(typeof lo, 'number')
		assert.equal(typeof hi, 'number')
		assert.ok(Number.isFinite(lo) && Number.isFinite(hi))
		assert.ok(!Object.is(lo, -0), 'lo should not be -0')
		assert.ok(!Object.is(hi, -0), 'hi should not be -0')
		assert.ok(lo <= hi, `interval [${lo}, ${hi}] must satisfy lo <= hi`)
		if (i > 0) {
			assert.ok(intervals[i - 1][1] < lo, 'intervals must be strictly sorted and non-touching')
		}
	}
}

function mulberry32(seed) {
	let s = seed >>> 0
	return () => {
		s = (s + 0x6d2b79f5) >>> 0
		let t = Math.imul(s ^ (s >>> 15), 1 | s)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

describe('xorIntervalSeries', () => {
	describe('normal cases', () => {
		it('combines disjoint intervals into sorted union', () => {
			assert.deepEqual(
				xorIntervalSeries([[1, 2], [5, 6]], [[3, 4], [7, 8]]),
				[[1, 2], [3, 4], [5, 6], [7, 8]],
			)
		})

		it('removes overlap between partially overlapping intervals', () => {
			assert.deepEqual(xorIntervalSeries([[0, 4]], [[2, 6]]), [[0, 2], [4, 6]])
		})

		it('punches a hole when one interval is strictly nested in another', () => {
			assert.deepEqual(xorIntervalSeries([[0, 10]], [[3, 7]]), [[0, 3], [7, 10]])
			assert.deepEqual(xorIntervalSeries([[3, 7]], [[0, 10]]), [[0, 3], [7, 10]])
		})

		it('handles complex multi-interval alternating overlaps', () => {
			assert.deepEqual(
				xorIntervalSeries([[1, 3], [5, 7], [9, 12]], [[2, 6], [10, 11]]),
				[[1, 2], [3, 5], [6, 7], [9, 10], [11, 12]],
			)
		})

		it('normalizes unsorted, overlapping, touching, and duplicate input intervals', () => {
			const a = [[5, 8], [1, 3], [2, 4], [4, 5], [1, 3]]
			const b = [[6, 10], [0, 2], [6, 7]]
			// norm(a) = [[1, 8]], norm(b) = [[0, 2], [6, 10]]
			assert.deepEqual(xorIntervalSeries(a, b), [[0, 1], [2, 6], [8, 10]])
		})

		it('works with negative and floating-point coordinates and canonicalizes -0', () => {
			const res = xorIntervalSeries([[-5.5, -0], [1.25, 3.75]], [[-2.5, 2.25]])
			assertCanonical(res)
			assert.deepEqual(res, [[-5.5, -2.5], [0, 1.25], [2.25, 3.75]])
		})

		it('does not mutate input arrays or interval tuples', () => {
			const a = [[4, 6], [1, 3]]
			const b = [[2, 5]]
			const snapA = structuredClone(a)
			const snapB = structuredClone(b)
			xorIntervalSeries(a, b)
			assert.deepEqual(a, snapA)
			assert.deepEqual(b, snapB)
		})
	})

	describe('edge cases', () => {
		it('handles empty sets (identity element)', () => {
			assert.deepEqual(xorIntervalSeries([], []), [])
			assert.deepEqual(xorIntervalSeries([[3, 5], [1, 2], [2, 3]], []), [[1, 5]])
			assert.deepEqual(xorIntervalSeries([], [[3, 5], [1, 2]]), [[1, 2], [3, 5]])
		})

		it('returns empty set for identical interval sets (self-inverse)', () => {
			assert.deepEqual(xorIntervalSeries([[1, 4], [6, 9]], [[6, 9], [1, 4]]), [])
			assert.deepEqual(xorIntervalSeries([[0, 2], [2, 5]], [[0, 5]]), [])
		})

		it('merges touching intervals across sets', () => {
			assert.deepEqual(xorIntervalSeries([[0, 2]], [[2, 4]]), [[0, 4]])
			assert.deepEqual(xorIntervalSeries([[0, 2], [4, 6]], [[2, 4]]), [[0, 6]])
		})

		it('handles degenerate point intervals [c, c]', () => {
			// Isolated point XOR empty -> preserved
			assert.deepEqual(xorIntervalSeries([[5, 5]], []), [[5, 5]])
			assert.deepEqual(xorIntervalSeries([], [[5, 5]]), [[5, 5]])
			// Identical points cancel out
			assert.deepEqual(xorIntervalSeries([[5, 5]], [[5, 5]]), [])
			// Disjoint point + interval
			assert.deepEqual(xorIntervalSeries([[5, 5]], [[0, 2]]), [[0, 2], [5, 5]])
			// Point inside or on boundary of a non-degenerate interval
			assert.deepEqual(xorIntervalSeries([[5, 5]], [[0, 10]]), [[0, 10]])
			assert.deepEqual(xorIntervalSeries([[2, 2]], [[0, 2]]), [[0, 2]])
			// Multiple degenerate points with overlap
			assert.deepEqual(
				xorIntervalSeries([[1, 1], [3, 3], [5, 5]], [[3, 3], [4, 4]]),
				[[1, 1], [4, 4], [5, 5]],
			)
		})

		it('avoids overflow near Number.MAX_VALUE and -Number.MAX_VALUE', () => {
			const big = 1e308
			const res = xorIntervalSeries([[-big, big / 2]], [[-big / 2, big]])
			assertCanonical(res)
			assert.deepEqual(res, [[-big, -big / 2], [big / 2, big]])
		})

		it('preserves precision at Number.EPSILON spacing', () => {
			const e = Number.EPSILON
			const res = xorIntervalSeries([[1, 1 + 2 * e]], [[1 + e, 1 + 3 * e]])
			assertCanonical(res)
			assert.deepEqual(res, [[1, 1 + e], [1 + 2 * e, 1 + 3 * e]])
		})

		it('handles large sets of alternating intervals efficiently', () => {
			const a = []
			const b = []
			for (let i = 0; i < 500; i++) {
				a.push([2 * i, 2 * i + 1])
				b.push([2 * i + 1, 2 * i + 2])
			}
			// Alternating touching intervals merge into one single interval [0, 1000]
			assert.deepEqual(xorIntervalSeries(a, b), [[0, 1000]])
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when a or b is not an array', () => {
			for (const bad of [null, undefined, 42, '[]', {}, true]) {
				assert.throws(() => xorIntervalSeries(bad, []), TypeError)
				assert.throws(() => xorIntervalSeries([], bad), TypeError)
			}
		})

		it('throws TypeError for malformed interval tuples', () => {
			for (const bad of [null, undefined, 1, '1,2', {}, [], [1], [1, 2, 3]]) {
				assert.throws(() => xorIntervalSeries([bad], []), TypeError)
				assert.throws(() => xorIntervalSeries([], [bad]), TypeError)
			}
		})

		it('throws TypeError for non-finite or non-number bounds', () => {
			const badPairs = [
				[NaN, 1],
				[0, NaN],
				[-Infinity, 0],
				[0, Infinity],
				['0', 1],
				[0, '1'],
				[null, 1],
				[0, undefined],
				[0n, 1n],
			]
			for (const pair of badPairs) {
				assert.throws(() => xorIntervalSeries([pair], []), TypeError)
				assert.throws(() => xorIntervalSeries([], [pair]), TypeError)
			}
		})

		it('throws RangeError when lo > hi', () => {
			assert.throws(() => xorIntervalSeries([[5, 2]], []), RangeError)
			assert.throws(() => xorIntervalSeries([], [[-1, -2]]), RangeError)
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		it('matches independent set-algebra identities, point-sampling oracle, and measure law across random instances', () => {
			const rng = mulberry32(20261123)
			const randSet = (maxCount) => {
				const count = Math.floor(rng() * (maxCount + 1))
				const out = []
				for (let i = 0; i < count; i++) {
					const x = Math.floor(rng() * 41) - 20
					const len = Math.floor(rng() * 10) + 1
					out.push([x, x + len])
				}
				return out
			}

			for (let trial = 0; trial < 80; trial++) {
				const a = randSet(8)
				const b = randSet(8)
				const c = randSet(6)

				const res = xorIntervalSeries(a, b)
				assertCanonical(res)

				// Cross-check 1: (A \ B) U (B \ A)
				const viaDiffUnion = refUnion(refDifference(a, b), refDifference(b, a))
				assert.deepEqual(res, viaDiffUnion, `trial ${trial}: (A\\B)U(B\\A) mismatch`)

				// Cross-check 2: (A U B) \ (A n B)
				const viaUnionMinusInter = refDifference(refUnion(a, b), refIntersect(a, b))
				assert.deepEqual(res, viaUnionMinusInter, `trial ${trial}: (AUB)\\(AnB) mismatch`)

				// Cross-check 3: Point-sampling oracle at all half-integer midpoints
				const na = refNormalize(a)
				const nb = refNormalize(b)
				for (let x = -21.5; x <= 31.5; x += 1) {
					const inRes = refContains(res, x)
					const expected = refContains(na, x) !== refContains(nb, x)
					assert.equal(inRes, expected, `trial ${trial}: point x=${x} mismatch`)
				}

				// Cross-check 4: Commutativity, involution, associativity, and Lebesgue measure
				assert.deepEqual(res, xorIntervalSeries(b, a), `trial ${trial}: commutativity`)
				assert.deepEqual(xorIntervalSeries(res, b), na, `trial ${trial}: involution`)
				assert.deepEqual(
					xorIntervalSeries(res, c),
					xorIntervalSeries(a, xorIntervalSeries(b, c)),
					`trial ${trial}: associativity`,
				)

				const muXor = refMeasure(res)
				const muExpected = refMeasure(na) + refMeasure(nb) - 2 * refMeasure(refIntersect(na, nb))
				assert.equal(muXor, muExpected, `trial ${trial}: Lebesgue measure identity`)
			}
		})
	})
})
