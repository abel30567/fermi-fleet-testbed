import { describe, test } from 'node:test'
import assert from 'node:assert'
import { intersectionIntervalMemo } from './intersectionIntervalMemo.js'

/**
 * Independent reference oracle for closed real-interval set intersection.
 *
 * Evaluates membership `inSet(A, x) && inSet(B, x)` over the elementary partition
 * induced by all distinct finite endpoints (each endpoint and each open midpoint
 * between consecutive endpoints), then reconstructs the canonical merged intervals.
 *
 * @param {Array<[number, number]>} setA
 * @param {Array<[number, number]>} setB
 * @returns {Array<[number, number]>}
 */
function referencePartitionIntersection(setA, setB) {
	const inSet = (set, x) => set.some(([lo, hi]) => lo <= x && x <= hi)
	const inBoth = (x) => inSet(setA, x) && inSet(setB, x)

	const pointSet = new Set()
	for (const [lo, hi] of [...setA, ...setB]) {
		pointSet.add(lo === 0 ? 0 : lo)
		pointSet.add(hi === 0 ? 0 : hi)
	}
	const pts = [...pointSet].sort((a, b) => a - b)
	if (pts.length === 0) return []

	/** @type {Array<[number, number]>} */
	const pieces = []
	for (let i = 0; i < pts.length; i++) {
		const p = pts[i]
		if (inBoth(p)) {
			pieces.push([p, p])
		}
		if (i + 1 < pts.length) {
			const q = pts[i + 1]
			const mid = (p + q) / 2
			if (inBoth(mid)) {
				pieces.push([p, q])
			}
		}
	}

	if (pieces.length === 0) return []
	const merged = [pieces[0].slice()]
	for (let i = 1; i < pieces.length; i++) {
		const last = merged[merged.length - 1]
		if (pieces[i][0] <= last[1]) {
			if (pieces[i][1] > last[1]) last[1] = pieces[i][1]
		} else {
			merged.push(pieces[i].slice())
		}
	}
	return merged
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible randomized cross-check tests.
 *
 * @param {number} seed
 */
function makeRng(seed) {
	let s = seed >>> 0
	return () => {
		s = (s + 0x6d2b79f5) >>> 0
		let t = Math.imul(s ^ (s >>> 15), 1 | s)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

describe('intersectionIntervalMemo', () => {
	test('basic overlapping intervals', () => {
		assert.deepStrictEqual(
			intersectionIntervalMemo(
				[
					[0, 5],
					[10, 20],
				],
				[
					[3, 12],
					[18, 25],
				],
			),
			[
				[3, 5],
				[10, 12],
				[18, 20],
			],
		)
	})

	test('normalizes unsorted, overlapping, adjacent, and duplicate intervals', () => {
		const a = [
			[5, 7],
			[1, 3],
			[2, 4],
			[4, 4.5],
			[1, 3],
		]
		const b = [
			[6, 8],
			[3, 6],
			[0, 1],
		]
		assert.deepStrictEqual(intersectionIntervalMemo(a, b), [
			[1, 1],
			[3, 4.5],
			[5, 7],
		])
	})

	test('empty and disjoint sets return empty array', () => {
		assert.deepStrictEqual(intersectionIntervalMemo([], []), [])
		assert.deepStrictEqual(intersectionIntervalMemo([], [[1, 2]]), [])
		assert.deepStrictEqual(intersectionIntervalMemo([[1, 2]], []), [])
		assert.deepStrictEqual(
			intersectionIntervalMemo(
				[
					[0, 1],
					[5, 6],
				],
				[
					[2, 4],
					[7, 9],
				],
			),
			[],
		)
	})

	test('touching boundaries and degenerate point intervals [x, x]', () => {
		assert.deepStrictEqual(intersectionIntervalMemo([[1, 2]], [[2, 3]]), [[2, 2]])
		assert.deepStrictEqual(intersectionIntervalMemo([[2, 2]], [[1, 3]]), [[2, 2]])
		assert.deepStrictEqual(intersectionIntervalMemo([[2, 2]], [[2, 2]]), [[2, 2]])
		assert.deepStrictEqual(intersectionIntervalMemo([[2, 2]], [[3, 3]]), [])
		assert.deepStrictEqual(
			intersectionIntervalMemo(
				[
					[1, 2],
					[4, 5],
				],
				[[2, 4]],
			),
			[
				[2, 2],
				[4, 4],
			],
		)
	})

	test('negative numbers, floats, and -0 canonicalization', () => {
		assert.deepStrictEqual(
			intersectionIntervalMemo(
				[
					[-5.5, -1.25],
					[0.1, 2.5],
				],
				[[-3.0, 0.5]],
			),
			[
				[-3, -1.25],
				[0.1, 0.5],
			],
		)

		const zeroResult = intersectionIntervalMemo([[-0, 1]], [[-1, -0]])
		assert.deepStrictEqual(zeroResult, [[0, 0]])
		assert.strictEqual(Object.is(zeroResult[0][0], 0), true)
		assert.strictEqual(Object.is(zeroResult[0][1], 0), true)
	})

	test('unbounded intervals with -Infinity and Infinity', () => {
		assert.deepStrictEqual(intersectionIntervalMemo([[-Infinity, 0]], [[-5, 5]]), [[-5, 0]])
		assert.deepStrictEqual(intersectionIntervalMemo([[0, Infinity]], [[-5, 5]]), [[0, 5]])
		assert.deepStrictEqual(
			intersectionIntervalMemo(
				[[-Infinity, Infinity]],
				[
					[1, 2],
					[4, 5],
				],
			),
			[
				[1, 2],
				[4, 5],
			],
		)
		assert.deepStrictEqual(
			intersectionIntervalMemo([[-Infinity, 3]], [[-2, Infinity]]),
			[[-2, 3]],
		)
		assert.deepStrictEqual(
			intersectionIntervalMemo([[-Infinity, -Infinity]], [[-Infinity, 0]]),
			[[-Infinity, -Infinity]],
		)
	})

	test('supports variadic intersection of three or more interval sets', () => {
		const a = [
			[0, 10],
			[20, 30],
		]
		const b = [
			[5, 25],
			[28, 35],
		]
		const c = [
			[7, 9],
			[22, 29],
		]
		assert.deepStrictEqual(intersectionIntervalMemo(a, b, c), [
			[7, 9],
			[22, 25],
			[28, 29],
		])
		assert.deepStrictEqual(intersectionIntervalMemo(a, b, [[100, 200]]), [])
	})

	test('memoization safety: immutability of inputs, outputs, symmetry, and cache eviction', () => {
		const a = [
			[1, 5],
			[10, 15],
		]
		const b = [
			[3, 12],
			[14, 20],
		]
		const aCopy = structuredClone(a)
		const bCopy = structuredClone(b)

		const r1 = intersectionIntervalMemo(a, b)
		assert.deepStrictEqual(a, aCopy)
		assert.deepStrictEqual(b, bCopy)

		// Mutate returned result and verify subsequent cached calls are unaffected
		r1[0][0] = 999
		r1.push([1000, 2000])

		const r2 = intersectionIntervalMemo(a, b)
		const r3 = intersectionIntervalMemo(b, a)
		const expected = [
			[3, 5],
			[10, 12],
			[14, 15],
		]
		assert.deepStrictEqual(r2, expected)
		assert.deepStrictEqual(r3, expected)
		assert.notStrictEqual(r2, r3)

		// Exercise bounded LRU cache eviction (> 1024 unique pairs)
		for (let k = 0; k < 1200; k++) {
			const res = intersectionIntervalMemo([[k, k + 2]], [[k + 1, k + 3]])
			assert.deepStrictEqual(res, [[k + 1, k + 2]])
		}
		assert.deepStrictEqual(intersectionIntervalMemo(a, b), expected)
	})

	test('input validation throws TypeError and RangeError on invalid inputs', () => {
		assert.throws(() => intersectionIntervalMemo(), TypeError)
		assert.throws(() => intersectionIntervalMemo([]), TypeError)
		assert.throws(() => intersectionIntervalMemo(null, []), TypeError)
		assert.throws(() => intersectionIntervalMemo([], 'not-an-array'), TypeError)
		assert.throws(() => intersectionIntervalMemo([1, 2], []), TypeError)
		assert.throws(() => intersectionIntervalMemo([[1]], []), TypeError)
		assert.throws(() => intersectionIntervalMemo([[1, 2, 3]], []), TypeError)
		assert.throws(() => intersectionIntervalMemo([['1', 2]], []), TypeError)
		assert.throws(() => intersectionIntervalMemo([[NaN, 2]], []), TypeError)
		assert.throws(() => intersectionIntervalMemo([[1, NaN]], []), TypeError)
		assert.throws(() => intersectionIntervalMemo([], [[1, undefined]]), TypeError)
		assert.throws(() => intersectionIntervalMemo([[5, 2]], [[0, 10]]), RangeError)
		assert.throws(() => intersectionIntervalMemo([[0, 10]], [[Infinity, -Infinity]]), RangeError)
		assert.throws(
			() => intersectionIntervalMemo([[0, 1]], [[0, 1]], [[3, 1]]),
			RangeError,
		)
	})

	test('independent cross-check against endpoint-partition oracle and set-algebra laws', () => {
		const rng = makeRng(0x5eed1234)
		const genSet = () => {
			const len = Math.floor(rng() * 8)
			/** @type {Array<[number, number]>} */
			const out = []
			for (let i = 0; i < len; i++) {
				// Mix integers and half-integers in [-10, 10] to trigger frequent overlaps & touches
				const p = Math.floor(rng() * 41 - 20) / 2
				const q = Math.floor(rng() * 41 - 20) / 2
				out.push(p <= q ? [p, q] : [q, p])
			}
			return out
		}

		for (let trial = 0; trial < 150; trial++) {
			const a = genSet()
			const b = genSet()
			const c = genSet()

			const actualAB = intersectionIntervalMemo(a, b)
			const oracleAB = referencePartitionIntersection(a, b)
			assert.deepStrictEqual(actualAB, oracleAB)

			// Commutativity: A ∩ B = B ∩ A
			assert.deepStrictEqual(intersectionIntervalMemo(b, a), actualAB)

			// Associativity: (A ∩ B) ∩ C = A ∩ (B ∩ C) = intersection(A, B, C)
			const leftAssoc = intersectionIntervalMemo(actualAB, c)
			const rightAssoc = intersectionIntervalMemo(a, intersectionIntervalMemo(b, c))
			const variadic = intersectionIntervalMemo(a, b, c)
			assert.deepStrictEqual(leftAssoc, rightAssoc)
			assert.deepStrictEqual(variadic, leftAssoc)

			// Idempotence: A ∩ A = norm(A), and A ∩ [-Infinity, Infinity] = A ∩ A
			const idemp = intersectionIntervalMemo(a, a)
			assert.deepStrictEqual(intersectionIntervalMemo(a, [[-Infinity, Infinity]]), idemp)

			// Verify output invariants: strictly sorted and strictly disjoint
			for (let i = 0; i < actualAB.length; i++) {
				assert.ok(actualAB[i][0] <= actualAB[i][1])
				if (i > 0) {
					assert.ok(actualAB[i - 1][1] < actualAB[i][0])
				}
			}
		}
	})
})
