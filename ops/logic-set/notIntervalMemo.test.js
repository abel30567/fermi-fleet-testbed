import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notIntervalMemo } from './notIntervalMemo.js'

/**
 * Independent reference helpers for cross-checking without sharing implementation.
 */

function naiveNormalize(intervals, uLo = -Infinity, uHi = Infinity) {
	const clipped = []
	for (const [lo, hi] of intervals) {
		const a = Math.max(lo, uLo)
		const b = Math.min(hi, uHi)
		if (a < b) clipped.push([a === 0 ? 0 : a, b === 0 ? 0 : b])
	}
	clipped.sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : p[1] - q[1]))
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

function naiveUnion(a, b, uLo = -Infinity, uHi = Infinity) {
	return naiveNormalize([...a, ...b], uLo, uHi)
}

function naiveIntersect(a, b, uLo = -Infinity, uHi = Infinity) {
	const na = naiveNormalize(a, uLo, uHi)
	const nb = naiveNormalize(b, uLo, uHi)
	const out = []
	for (const [aLo, aHi] of na) {
		for (const [bLo, bHi] of nb) {
			const lo = Math.max(aLo, bLo)
			const hi = Math.min(aHi, bHi)
			if (lo < hi) out.push([lo, hi])
		}
	}
	return naiveNormalize(out, uLo, uHi)
}

function isInsideOpen(x, intervals) {
	return intervals.some(([lo, hi]) => x > lo && x < hi)
}

function assertNormalizedAndMerged(intervals, uLo = -Infinity, uHi = Infinity) {
	for (let i = 0; i < intervals.length; i++) {
		const [lo, hi] = intervals[i]
		assert.ok(lo < hi, `Expected lo < hi at index ${i}, got [${lo}, ${hi}]`)
		assert.ok(lo >= uLo, `Expected lo >= ${uLo}, got ${lo}`)
		assert.ok(hi <= uHi, `Expected hi <= ${uHi}, got ${hi}`)
		if (i > 0) {
			assert.ok(
				intervals[i - 1][1] < lo,
				`Expected strictly separated intervals, got ${JSON.stringify(intervals[i - 1])} and ${JSON.stringify(intervals[i])}`,
			)
		}
	}
}

test('precomputed canonical cases over (-Infinity, Infinity)', () => {
	assert.deepEqual(notIntervalMemo([]), [[-Infinity, Infinity]])
	assert.deepEqual(notIntervalMemo([[-Infinity, Infinity]]), [])
	assert.deepEqual(notIntervalMemo([[-Infinity, 0]]), [[0, Infinity]])
	assert.deepEqual(notIntervalMemo([[0, Infinity]]), [[-Infinity, 0]])
	assert.deepEqual(notIntervalMemo([[0, 1]]), [
		[-Infinity, 0],
		[1, Infinity],
	])
	assert.deepEqual(notIntervalMemo([[-1, 1]]), [
		[-Infinity, -1],
		[1, Infinity],
	])
})

test('normal multi-interval sets', () => {
	assert.deepEqual(
		notIntervalMemo([
			[1, 3],
			[5, 8],
		]),
		[
			[-Infinity, 1],
			[3, 5],
			[8, Infinity],
		],
	)
	assert.deepEqual(
		notIntervalMemo([
			[-Infinity, -2],
			[0, 4],
			[10, Infinity],
		]),
		[
			[-2, 0],
			[4, 10],
		],
	)
})

test('unsorted, overlapping, duplicate, and touching intervals are normalized and merged', () => {
	const input = [
		[5, 8],
		[1, 3],
		[2, 4],
		[4, 5],
		[1, 3],
		[10, 12],
		[11, 11.5],
	]
	assert.deepEqual(notIntervalMemo(input), [
		[-Infinity, 1],
		[8, 10],
		[12, Infinity],
	])
})

test('bounded universe clipping and precomputed unit-universe cases', () => {
	assert.deepEqual(notIntervalMemo([], [0, 1]), [[0, 1]])
	assert.deepEqual(notIntervalMemo([[0, 1]], [0, 1]), [])
	assert.deepEqual(notIntervalMemo([[0, 0.5]], [0, 1]), [[0.5, 1]])
	assert.deepEqual(notIntervalMemo([[0.5, 1]], [0, 1]), [[0, 0.5]])

	assert.deepEqual(
		notIntervalMemo(
			[
				[-10, -5],
				[-2, 2],
				[4, 6],
				[9, 15],
				[20, 30],
			],
			[0, 10],
		),
		[
			[2, 4],
			[6, 9],
		],
	)
	assert.deepEqual(notIntervalMemo([[-5, 20]], [0, 10]), [])
	assert.deepEqual(
		notIntervalMemo(
			[
				[-10, 0],
				[10, 20],
			],
			[0, 10],
		),
		[[0, 10]],
	)
})

test('edge cases: zero-width intervals, degenerate universe, -0, infinite endpoints', () => {
	// Measure-zero intervals in a non-degenerate universe
	assert.deepEqual(notIntervalMemo([[5, 5]]), [[-Infinity, Infinity]])
	assert.deepEqual(
		notIntervalMemo([
			[1, 3],
			[5, 5],
			[7, 9],
		]),
		[
			[-Infinity, 1],
			[3, 7],
			[9, Infinity],
		],
	)
	assert.deepEqual(notIntervalMemo([[Infinity, Infinity]]), [[-Infinity, Infinity]])
	assert.deepEqual(notIntervalMemo([[-Infinity, -Infinity]]), [[-Infinity, Infinity]])

	// Degenerate point universe [p, p]
	assert.deepEqual(notIntervalMemo([], [5, 5]), [[5, 5]])
	assert.deepEqual(notIntervalMemo([[1, 3]], [5, 5]), [[5, 5]])
	assert.deepEqual(notIntervalMemo([[5, 5]], [5, 5]), [])
	assert.deepEqual(notIntervalMemo([[0, 10]], [5, 5]), [])

	// Negative zero canonicalization
	const res = notIntervalMemo([[-0, 2]])
	assert.deepEqual(res, [
		[-Infinity, 0],
		[2, Infinity],
	])
	assert.ok(Object.is(res[0][1], 0), 'Expected +0, not -0')
})

test('memoization returns equivalent results, isolates mutations, and handles cache eviction', () => {
	const first = notIntervalMemo([
		[2, 4],
		[3, 6],
	])
	// Mutate returned array and inner tuple
	first[0][1] = 999
	first.push([100, 200])

	// Equivalent canonical input must still return pristine result
	const second = notIntervalMemo([[2, 6]])
	assert.deepEqual(second, [
		[-Infinity, 2],
		[6, Infinity],
	])

	// Also verify precomputed entry cannot be mutated
	const pre1 = notIntervalMemo([])
	pre1[0][0] = 42
	assert.deepEqual(notIntervalMemo([]), [[-Infinity, Infinity]])

	// Exercise LRU cache beyond 1024 entries
	for (let i = 1; i <= 1100; i++) {
		const out = notIntervalMemo([[i, i + 1]])
		assert.deepEqual(out, [
			[-Infinity, i],
			[i + 1, Infinity],
		])
	}
	// Re-query an evicted entry and a recently cached entry
	assert.deepEqual(notIntervalMemo([[1, 2]]), [
		[-Infinity, 1],
		[2, Infinity],
	])
	assert.deepEqual(notIntervalMemo([[1100, 1101]]), [
		[-Infinity, 1100],
		[1101, Infinity],
	])
})

test('input validation rejects malformed arguments', () => {
	assert.throws(() => notIntervalMemo(null), TypeError)
	assert.throws(() => notIntervalMemo('not-an-array'), TypeError)
	assert.throws(() => notIntervalMemo([123]), TypeError)
	assert.throws(() => notIntervalMemo([[1]]), TypeError)
	assert.throws(() => notIntervalMemo([[1, 2, 3]]), TypeError)
	assert.throws(() => notIntervalMemo([['1', 2]]), TypeError)
	assert.throws(() => notIntervalMemo([[NaN, 2]]), TypeError)
	assert.throws(() => notIntervalMemo([[1, NaN]]), TypeError)
	assert.throws(() => notIntervalMemo([[5, 2]]), RangeError)

	// Invalid universe
	assert.throws(() => notIntervalMemo([], null), TypeError)
	assert.throws(() => notIntervalMemo([], [0]), TypeError)
	assert.throws(() => notIntervalMemo([], [NaN, 10]), TypeError)
	assert.throws(() => notIntervalMemo([], [10, 0]), RangeError)
})

test('independent cross-check: point-sampling oracle, involution, and De Morgan laws', () => {
	// Deterministic LCG PRNG for reproducible property tests
	let seed = 0x12345678
	const rand = () => {
		seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
		return seed / 0x100000000
	}
	const randInt = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1))

	const randomSet = () => {
		const count = randInt(0, 8)
		const arr = []
		for (let i = 0; i < count; i++) {
			const a = randInt(-20, 20)
			const b = a + randInt(0, 10)
			arr.push([a, b])
		}
		return arr
	}

	const universes = [
		[-Infinity, Infinity],
		[-15, 15],
		[-Infinity, 10],
		[-10, Infinity],
	]

	for (let trial = 0; trial < 80; trial++) {
		const A = randomSet()
		const B = randomSet()
		const U = universes[trial % universes.length]
		const [uLo, uHi] = U

		const notA = notIntervalMemo(A, U)
		assertNormalizedAndMerged(notA, uLo, uHi)

		// 1. Point-sampling oracle: at every midpoint between critical coordinates,
		//    x in notA <=> x not in A (for x in U)
		const normA = naiveNormalize(A, uLo, uHi)
		const pts = new Set()
		for (const [lo, hi] of [...normA, ...notA]) {
			if (Number.isFinite(lo)) pts.add(lo)
			if (Number.isFinite(hi)) pts.add(hi)
		}
		if (Number.isFinite(uLo)) pts.add(uLo)
		if (Number.isFinite(uHi)) pts.add(uHi)
		const sorted = [...pts].sort((x, y) => x - y)
		const samples = []
		if (sorted.length === 0) {
			samples.push(0)
		} else {
			if (uLo === -Infinity) samples.push(sorted[0] - 1)
			if (uHi === Infinity) samples.push(sorted[sorted.length - 1] + 1)
			for (let i = 0; i + 1 < sorted.length; i++) {
				samples.push((sorted[i] + sorted[i + 1]) / 2)
			}
		}
		for (const x of samples) {
			if (x > uLo && x < uHi) {
				assert.equal(
					isInsideOpen(x, notA),
					!isInsideOpen(x, normA),
					`Sample point x=${x} failed complement check for A=${JSON.stringify(A)}, U=${JSON.stringify(U)}`,
				)
			}
		}

		// 2. Involution: not(not(A)) === normalize(A)
		assert.deepEqual(notIntervalMemo(notA, U), normA)

		// 3. Exhaustiveness and disjointness
		assert.deepEqual(naiveUnion(normA, notA, uLo, uHi), [U])
		assert.deepEqual(naiveIntersect(normA, notA, uLo, uHi), [])

		// 4. De Morgan's Law: not(A U B) === not(A) ∩ not(B)
		const notAUnionB = notIntervalMemo(naiveUnion(A, B, uLo, uHi), U)
		const notAInterNotB = naiveIntersect(notA, notIntervalMemo(B, U), uLo, uHi)
		assert.deepEqual(notAUnionB, notAInterNotB)
	}
})
