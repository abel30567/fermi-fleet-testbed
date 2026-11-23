import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { notIntervalRecursive } from './notIntervalRecursive.js'

/**
 * Independent iterative point-membership check on an arbitrary (unnormalized) interval set.
 * Checks strict interior membership for non-degenerate intervals.
 */
function pointInAny(x, intervals) {
	for (const [lo, hi] of intervals) {
		if (lo < x && x < hi) {
			return true
		}
	}
	return false
}

/**
 * Independent iterative interval-set intersection on two normalized interval sets.
 */
function intersectNormalized(a, b) {
	const out = []
	let i = 0
	let j = 0
	while (i < a.length && j < b.length) {
		const lo = Math.max(a[i][0], b[j][0])
		const hi = Math.min(a[i][1], b[j][1])
		if (lo < hi) {
			out.push([lo, hi])
		}
		if (a[i][1] <= b[j][1]) {
			i++
		} else {
			j++
		}
	}
	return out
}

/**
 * Independent iterative reference normalizer for clipping, sorting, and merging.
 */
function referenceNormalize(intervals, universe = [-Infinity, Infinity]) {
	const [uLo, uHi] = universe
	if (uLo === uHi) return []
	const clipped = []
	for (const [lo, hi] of intervals) {
		const cLo = Math.max(lo, uLo)
		const cHi = Math.min(hi, uHi)
		if (cLo < cHi) {
			clipped.push([cLo === 0 ? 0 : cLo, cHi === 0 ? 0 : cHi])
		}
	}
	clipped.sort((a, b) => a[0] - b[0] || a[1] - b[1])
	const merged = []
	for (const [lo, hi] of clipped) {
		if (merged.length === 0 || lo > merged[merged.length - 1][1]) {
			merged.push([lo, hi])
		} else if (hi > merged[merged.length - 1][1]) {
			merged[merged.length - 1][1] = hi
		}
	}
	return merged
}

/**
 * Assert that `result` satisfies all normalization invariants within `universe`.
 */
function assertNormalized(result, universe = [-Infinity, Infinity]) {
	const [uLo, uHi] = universe
	assert.ok(Array.isArray(result))
	for (let i = 0; i < result.length; i++) {
		const [lo, hi] = result[i]
		assert.ok(lo < hi, `interval[${i}] must satisfy lo < hi, got [${lo}, ${hi}]`)
		assert.ok(lo >= uLo && hi <= uHi, `interval[${i}] must be inside universe [${uLo}, ${uHi}]`)
		assert.ok(!Object.is(lo, -0) && !Object.is(hi, -0), 'bounds must not be -0')
		if (i > 0) {
			assert.ok(
				result[i - 1][1] < lo,
				`intervals must be strictly sorted and non-touching: [${result[i - 1]}] vs [${lo}, ${hi}]`,
			)
		}
	}
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property cross-checks.
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

describe('notIntervalRecursive', () => {
	describe('normal cases', () => {
		it('complements a single finite interval in default universe', () => {
			assert.deepStrictEqual(notIntervalRecursive([[1, 5]]), [
				[-Infinity, 1],
				[5, Infinity],
			])
		})

		it('complements multiple sorted disjoint intervals in default universe', () => {
			assert.deepStrictEqual(
				notIntervalRecursive([
					[-10, -2],
					[0, 3],
					[7, 12],
				]),
				[
					[-Infinity, -10],
					[-2, 0],
					[3, 7],
					[12, Infinity],
				],
			)
		})

		it('complements multiple intervals in a custom finite universe', () => {
			assert.deepStrictEqual(
				notIntervalRecursive(
					[
						[10, 20],
						[30, 45],
						[60, 80],
					],
					[0, 100],
				),
				[
					[0, 10],
					[20, 30],
					[45, 60],
					[80, 100],
				],
			)
		})

		it('handles fractional and negative floating-point bounds', () => {
			assert.deepStrictEqual(
				notIntervalRecursive(
					[
						[-3.5, -1.25],
						[0.5, 2.75],
					],
					[-5, 5],
				),
				[
					[-5, -3.5],
					[-1.25, 0.5],
					[2.75, 5],
				],
			)
		})
	})

	describe('edge cases', () => {
		it('returns full default universe for empty interval set', () => {
			assert.deepStrictEqual(notIntervalRecursive([]), [[-Infinity, Infinity]])
		})

		it('returns full custom universe for empty interval set', () => {
			assert.deepStrictEqual(notIntervalRecursive([], [-5, 10]), [[-5, 10]])
		})

		it('returns empty set when input covers full default universe', () => {
			assert.deepStrictEqual(notIntervalRecursive([[-Infinity, Infinity]]), [])
			assert.deepStrictEqual(
				notIntervalRecursive([
					[-Infinity, 0],
					[0, Infinity],
				]),
				[],
			)
			assert.deepStrictEqual(
				notIntervalRecursive([
					[5, Infinity],
					[-Infinity, -5],
					[-10, 10],
				]),
				[],
			)
		})

		it('returns empty set when input covers or exceeds custom universe', () => {
			assert.deepStrictEqual(notIntervalRecursive([[0, 10]], [0, 10]), [])
			assert.deepStrictEqual(notIntervalRecursive([[-5, 15]], [0, 10]), [])
			assert.deepStrictEqual(
				notIntervalRecursive(
					[
						[-2, 4],
						[4, 7],
						[6, 12],
					],
					[0, 10],
				),
				[],
			)
		})

		it('handles unsorted, overlapping, nested, duplicate, and touching intervals', () => {
			const input = [
				[10, 12],
				[3, 6],
				[1, 4],
				[2, 3],
				[5, 8],
				[10, 12],
				[8, 9],
			]
			assert.deepStrictEqual(notIntervalRecursive(input, [0, 15]), [
				[0, 1],
				[9, 10],
				[12, 15],
			])
		})

		it('handles intervals completely outside or straddling custom universe', () => {
			assert.deepStrictEqual(
				notIntervalRecursive(
					[
						[-20, -10],
						[20, 30],
					],
					[0, 10],
				),
				[[0, 10]],
			)
			assert.deepStrictEqual(
				notIntervalRecursive(
					[
						[-5, 2],
						[8, 25],
					],
					[0, 10],
				),
				[[2, 8]],
			)
			assert.deepStrictEqual(notIntervalRecursive([[0, 3]], [0, 10]), [[3, 10]])
			assert.deepStrictEqual(notIntervalRecursive([[7, 10]], [0, 10]), [[0, 7]])
		})

		it('handles one-sided infinities in intervals and universe', () => {
			assert.deepStrictEqual(notIntervalRecursive([[-Infinity, 0]]), [[0, Infinity]])
			assert.deepStrictEqual(notIntervalRecursive([[0, Infinity]]), [[-Infinity, 0]])
			assert.deepStrictEqual(
				notIntervalRecursive([
					[-Infinity, -1],
					[1, Infinity],
				]),
				[[-1, 1]],
			)
			assert.deepStrictEqual(notIntervalRecursive([[2, 5]], [0, Infinity]), [
				[0, 2],
				[5, Infinity],
			])
			assert.deepStrictEqual(notIntervalRecursive([[-5, -2]], [-Infinity, 0]), [
				[-Infinity, -5],
				[-2, 0],
			])
		})

		it('handles degenerate point intervals and zero-width universe', () => {
			assert.deepStrictEqual(notIntervalRecursive([[5, 5]], [0, 10]), [[0, 10]])
			assert.deepStrictEqual(
				notIntervalRecursive(
					[
						[5, 5],
						[2, 4],
						[Infinity, Infinity],
						[-Infinity, -Infinity],
					],
					[0, 10],
				),
				[
					[0, 2],
					[4, 10],
				],
			)
			assert.deepStrictEqual(notIntervalRecursive([], [5, 5]), [])
			assert.deepStrictEqual(notIntervalRecursive([[0, 10]], [5, 5]), [])
		})

		it('normalizes -0 to 0 in outputs', () => {
			const res1 = notIntervalRecursive([[-0, 1]], [-1, 2])
			assert.deepStrictEqual(res1, [
				[-1, 0],
				[1, 2],
			])
			assert.ok(Object.is(res1[0][1], 0))

			const res2 = notIntervalRecursive([], [-0, 1])
			assert.deepStrictEqual(res2, [[0, 1]])
			assert.ok(Object.is(res2[0][0], 0))
		})

		it('does not mutate input intervals or universe', () => {
			const intervals = [
				[5, 8],
				[1, 3],
				[2, 6],
			]
			const universe = [0, 10]
			const intervalsSnapshot = structuredClone(intervals)
			const universeSnapshot = structuredClone(universe)

			const result = notIntervalRecursive(intervals, universe)
			assert.deepStrictEqual(intervals, intervalsSnapshot)
			assert.deepStrictEqual(universe, universeSnapshot)
			assert.deepStrictEqual(result, [
				[0, 1],
				[8, 10],
			])
		})

		it('handles large inputs efficiently without stack overflow', () => {
			const n = 10000
			const intervals = []
			for (let i = n - 1; i >= 0; i--) {
				intervals.push([i * 2, i * 2 + 1])
			}
			const result = notIntervalRecursive(intervals, [0, n * 2])
			assert.equal(result.length, n)
			assertNormalized(result, [0, n * 2])
			assert.deepStrictEqual(result[0], [1, 2])
			assert.deepStrictEqual(result[n - 1], [n * 2 - 1, n * 2])
		})
	})

	describe('input validation', () => {
		it('rejects non-array intervals with TypeError', () => {
			for (const bad of [null, undefined, 42, '[]', {}, new Set()]) {
				assert.throws(() => notIntervalRecursive(bad), TypeError)
			}
		})

		it('rejects malformed interval tuples with TypeError', () => {
			for (const bad of [
				[null],
				[undefined],
				[[]],
				[[1]],
				[[1, 2, 3]],
				[['0', 1]],
				[[0, '1']],
				[[0, null]],
				[[0n, 1]],
				[{ lo: 0, hi: 1 }],
			]) {
				assert.throws(() => notIntervalRecursive(bad), TypeError)
			}
			// Sparse array
			const sparse = new Array(2)
			sparse[1] = [1, 2]
			assert.throws(() => notIntervalRecursive(sparse), TypeError)
		})

		it('rejects NaN bounds and inverted intervals with RangeError', () => {
			for (const bad of [
				[[NaN, 1]],
				[[0, NaN]],
				[[NaN, NaN]],
				[[5, 2]],
				[[Infinity, -Infinity]],
			]) {
				assert.throws(() => notIntervalRecursive(bad), RangeError)
			}
		})

		it('validates universe parameter', () => {
			for (const bad of [null, 10, '0,1', {}, [], [0], [0, 1, 2], ['0', 1], [0, null]]) {
				assert.throws(() => notIntervalRecursive([], bad), TypeError)
			}
			for (const bad of [
				[NaN, 10],
				[0, NaN],
				[10, 0],
				[Infinity, -Infinity],
			]) {
				assert.throws(() => notIntervalRecursive([], bad), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('satisfies double complement involution: not(not(A, U), U) === normalize(clip(A, U))', () => {
			const rand = mulberry32(20261123)
			const universes = [
				[-Infinity, Infinity],
				[-20, 20],
				[0, Infinity],
				[-Infinity, 0],
				[-5, 5],
			]

			for (let trial = 0; trial < 100; trial++) {
				const universe = universes[trial % universes.length]
				const count = Math.floor(rand() * 25)
				const intervals = []
				for (let i = 0; i < count; i++) {
					const a = Math.floor(rand() * 61) - 30
					const b = a + Math.floor(rand() * 15)
					intervals.push([a, b])
				}

				const comp = notIntervalRecursive(intervals, universe)
				assertNormalized(comp, universe)

				const doubleComp = notIntervalRecursive(comp, universe)
				assertNormalized(doubleComp, universe)

				const expected = referenceNormalize(intervals, universe)
				assert.deepStrictEqual(doubleComp, expected)
			}
		})

		it('matches point-membership sampling oracle at all critical midpoints', () => {
			const rand = mulberry32(133742)
			const universes = [
				[-Infinity, Infinity],
				[-15, 15],
				[-10, Infinity],
				[-Infinity, 10],
			]

			for (let trial = 0; trial < 80; trial++) {
				const universe = universes[trial % universes.length]
				const count = Math.floor(rand() * 20)
				const intervals = []
				const finitePoints = new Set()

				for (let i = 0; i < count; i++) {
					const mode = rand()
					let lo
					let hi
					if (mode < 0.05) {
						lo = -Infinity
						hi = Math.floor(rand() * 41) - 20
					} else if (mode < 0.1) {
						lo = Math.floor(rand() * 41) - 20
						hi = Infinity
					} else {
						lo = Math.floor(rand() * 41) - 20
						hi = lo + Math.floor(rand() * 12)
					}
					intervals.push([lo, hi])
					if (Number.isFinite(lo)) finitePoints.add(lo)
					if (Number.isFinite(hi)) finitePoints.add(hi)
				}

				if (Number.isFinite(universe[0])) finitePoints.add(universe[0])
				if (Number.isFinite(universe[1])) finitePoints.add(universe[1])

				const comp = notIntervalRecursive(intervals, universe)
				assertNormalized(comp, universe)

				const sorted = [...finitePoints].sort((a, b) => a - b)
				const probes = []
				if (sorted.length === 0) {
					probes.push(0)
				} else {
					probes.push(sorted[0] - 1)
					for (let i = 0; i < sorted.length - 1; i++) {
						probes.push((sorted[i] + sorted[i + 1]) / 2)
					}
					probes.push(sorted[sorted.length - 1] + 1)
				}

				for (const x of probes) {
					const inUniverse = universe[0] < x && x < universe[1]
					const expectedInComp = inUniverse && !pointInAny(x, intervals)
					const actualInComp = pointInAny(x, comp)
					assert.equal(
						actualInComp,
						expectedInComp,
						`membership mismatch at x=${x} for universe=[${universe}]`,
					)
				}
			}
		})

		it('satisfies De Morgan law: not(A ∪ B, U) === not(A, U) ∩ not(B, U)', () => {
			const rand = mulberry32(99991)
			for (let trial = 0; trial < 50; trial++) {
				const universe = trial % 2 === 0 ? [-Infinity, Infinity] : [-25, 25]
				const makeSet = () => {
					const len = Math.floor(rand() * 12)
					const arr = []
					for (let i = 0; i < len; i++) {
						const lo = Math.floor(rand() * 61) - 30
						const hi = lo + Math.floor(rand() * 12)
						arr.push([lo, hi])
					}
					return arr
				}
				const a = makeSet()
				const b = makeSet()

				const lhs = notIntervalRecursive([...a, ...b], universe)
				const rhs = intersectNormalized(
					notIntervalRecursive(a, universe),
					notIntervalRecursive(b, universe),
				)
				assert.deepStrictEqual(lhs, rhs)
			}
		})
	})
})
