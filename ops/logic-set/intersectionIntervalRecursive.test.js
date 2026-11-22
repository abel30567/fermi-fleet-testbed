import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { intersectionIntervalRecursive } from './intersectionIntervalRecursive.js'

/**
 * Independent reference implementation using standard Array.prototype.sort,
 * iterative merge, and iterative two-pointer sweep for cross-checking.
 */
function iterativeTwoPointerIntersection(setA, setB) {
	const normalize = (set) => {
		if (set.length === 0) return []
		const sorted = set
			.map(([lo, hi]) => [lo === 0 ? 0 : lo, hi === 0 ? 0 : hi])
			.sort((x, y) => (x[0] !== y[0] ? x[0] - y[0] : x[1] - y[1]))
		const merged = [sorted[0]]
		for (let i = 1; i < sorted.length; i++) {
			const prev = merged[merged.length - 1]
			const curr = sorted[i]
			if (curr[0] <= prev[1]) {
				if (curr[1] > prev[1]) prev[1] = curr[1]
			} else {
				merged.push(curr)
			}
		}
		return merged
	}

	const a = normalize(setA)
	const b = normalize(setB)
	const out = []
	let i = 0
	let j = 0
	while (i < a.length && j < b.length) {
		const lo = Math.max(a[i][0], b[j][0])
		const hi = Math.min(a[i][1], b[j][1])
		if (lo <= hi) {
			out.push([lo === 0 ? 0 : lo, hi === 0 ? 0 : hi])
		}
		if (a[i][1] < b[j][1]) {
			i++
		} else {
			j++
		}
	}
	return out
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property tests.
 */
function createRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

describe('intersectionIntervalRecursive', () => {
	describe('normal cases', () => {
		test('intersects overlapping sorted interval sets', () => {
			const a = [
				[0, 2],
				[5, 10],
				[13, 23],
				[24, 25],
			]
			const b = [
				[1, 5],
				[8, 12],
				[15, 24],
				[25, 26],
			]
			assert.deepEqual(intersectionIntervalRecursive(a, b), [
				[1, 2],
				[5, 5],
				[8, 10],
				[15, 23],
				[24, 24],
				[25, 25],
			])
		})

		test('handles negative numbers and floating-point values', () => {
			const a = [
				[-10.5, -2.25],
				[-1.5, 3.75],
				[10.1, 20.9],
			]
			const b = [
				[-12.0, -5.0],
				[-3.0, 0.5],
				[2.5, 15.0],
			]
			assert.deepEqual(intersectionIntervalRecursive(a, b), [
				[-10.5, -5.0],
				[-3.0, -2.25],
				[-1.5, 0.5],
				[2.5, 3.75],
				[10.1, 15.0],
			])
		})

		test('handles extreme finite real values without overflow', () => {
			const M = Number.MAX_VALUE
			const a = [[-M, M]]
			const b = [
				[-M, -M / 2],
				[0, M],
			]
			assert.deepEqual(intersectionIntervalRecursive(a, b), [
				[-M, -M / 2],
				[0, M],
			])
		})

		test('does not mutate input arrays or tuples', () => {
			const a = [
				[5, 10],
				[1, 6],
			]
			const b = [
				[4, 8],
				[0, 2],
			]
			const snapA = structuredClone(a)
			const snapB = structuredClone(b)

			const res = intersectionIntervalRecursive(a, b)
			assert.deepEqual(res, [
				[1, 2],
				[4, 8],
			])
			assert.deepEqual(a, snapA)
			assert.deepEqual(b, snapB)
		})

		test('satisfies set algebra laws: commutativity, idempotence, associativity', () => {
			const a = [
				[10, 20],
				[0, 5],
				[3, 8],
			]
			const b = [
				[2, 12],
				[18, 25],
			]
			const c = [
				[4, 6],
				[11, 19],
			]

			assert.deepEqual(
				intersectionIntervalRecursive(a, b),
				intersectionIntervalRecursive(b, a),
			)
			assert.deepEqual(intersectionIntervalRecursive(a, a), [
				[0, 8],
				[10, 20],
			])
			assert.deepEqual(
				intersectionIntervalRecursive(intersectionIntervalRecursive(a, b), c),
				intersectionIntervalRecursive(a, intersectionIntervalRecursive(b, c)),
			)
		})
	})

	describe('edge cases', () => {
		test('empty sets', () => {
			assert.deepEqual(intersectionIntervalRecursive([], []), [])
			assert.deepEqual(intersectionIntervalRecursive([], [[0, 10]]), [])
			assert.deepEqual(intersectionIntervalRecursive([[0, 10]], []), [])
		})

		test('disjoint sets (separated and interleaved)', () => {
			assert.deepEqual(
				intersectionIntervalRecursive(
					[
						[0, 1],
						[2, 3],
					],
					[
						[4, 5],
						[6, 7],
					],
				),
				[],
			)
			assert.deepEqual(
				intersectionIntervalRecursive(
					[
						[0, 1],
						[4, 5],
						[8, 9],
					],
					[
						[2, 3],
						[6, 7],
						[10, 11],
					],
				),
				[],
			)
		})

		test('touching at single points and degenerate point intervals', () => {
			assert.deepEqual(
				intersectionIntervalRecursive([[0, 2]], [[2, 5]]),
				[[2, 2]],
			)
			assert.deepEqual(
				intersectionIntervalRecursive(
					[
						[0, 2],
						[3, 5],
					],
					[[2, 3]],
				),
				[
					[2, 2],
					[3, 3],
				],
			)
			assert.deepEqual(
				intersectionIntervalRecursive([[2, 2]], [[0, 5]]),
				[[2, 2]],
			)
			assert.deepEqual(
				intersectionIntervalRecursive([[2, 2]], [[2, 2]]),
				[[2, 2]],
			)
			assert.deepEqual(intersectionIntervalRecursive([[2, 2]], [[3, 3]]), [])
		})

		test('nested and straddling intervals', () => {
			const outer = [[0, 100]]
			const inner = [
				[1, 5],
				[10, 20],
				[30, 40],
				[90, 99],
			]
			assert.deepEqual(intersectionIntervalRecursive(outer, inner), inner)
			assert.deepEqual(intersectionIntervalRecursive(inner, outer), inner)

			// Single interval straddling both sides of a pivot interval
			const a = [
				[0, 1],
				[3, 4],
				[6, 7],
			]
			const b = [[0.5, 6.5]]
			assert.deepEqual(intersectionIntervalRecursive(a, b), [
				[0.5, 1],
				[3, 4],
				[6, 6.5],
			])
		})

		test('unnormalized inputs: unsorted, overlapping, touching, duplicates, -0', () => {
			const a = [
				[5, 8],
				[1, 3],
				[3, 5],
				[1, 3],
				[2, 6],
				[-0, 0.5],
				[0.5, 1],
			]
			const b = [
				[7, 9],
				[-0, 4],
				[4, 7],
				[2, 5],
			]
			const result = intersectionIntervalRecursive(a, b)
			assert.deepEqual(result, [[0, 8]])
			assert.equal(Object.is(result[0][0], 0), true)
		})

		test('large unbalanced inputs stay fast and do not overflow call stack', () => {
			const many = []
			for (let i = 0; i < 10000; i++) {
				many.push([i * 2, i * 2 + 1])
			}
			const few = [
				[500, 505],
				[19990, 20010],
			]
			const expected = [
				[500, 501],
				[502, 503],
				[504, 505],
				[19990, 19991],
				[19992, 19993],
				[19994, 19995],
				[19996, 19997],
				[19998, 19999],
			]
			assert.deepEqual(intersectionIntervalRecursive(many, few), expected)
			assert.deepEqual(intersectionIntervalRecursive(few, many), expected)
		})
	})

	describe('invalid inputs', () => {
		test('rejects non-array sets', () => {
			for (const bad of [null, undefined, 42, '[]', {}, new Set()]) {
				assert.throws(() => intersectionIntervalRecursive(bad, []), TypeError)
				assert.throws(() => intersectionIntervalRecursive([], bad), TypeError)
			}
			assert.throws(() => intersectionIntervalRecursive([]), TypeError)
		})

		test('rejects malformed interval elements and sparse arrays', () => {
			for (const badInterval of [
				null,
				undefined,
				5,
				'0,1',
				{ lo: 0, hi: 1 },
				[],
				[1],
				[1, 2, 3],
			]) {
				assert.throws(
					() => intersectionIntervalRecursive([badInterval], []),
					TypeError,
				)
				assert.throws(
					() => intersectionIntervalRecursive([], [badInterval]),
					TypeError,
				)
			}
			const sparse = new Array(2)
			assert.throws(() => intersectionIntervalRecursive(sparse, []), TypeError)
		})

		test('rejects non-number endpoints', () => {
			for (const badPair of [
				['0', 1],
				[0, '1'],
				[null, 1],
				[0, undefined],
				[true, 1],
				[0, {}],
			]) {
				assert.throws(
					() => intersectionIntervalRecursive([badPair], []),
					TypeError,
				)
				assert.throws(
					() => intersectionIntervalRecursive([], [badPair]),
					TypeError,
				)
			}
		})

		test('rejects non-finite endpoints and inverted intervals', () => {
			for (const badPair of [
				[NaN, 1],
				[0, NaN],
				[-Infinity, 1],
				[0, Infinity],
				[-Infinity, Infinity],
				[5, 1],
				[0.0001, 0],
			]) {
				assert.throws(
					() => intersectionIntervalRecursive([badPair], []),
					RangeError,
				)
				assert.throws(
					() => intersectionIntervalRecursive([], [badPair]),
					RangeError,
				)
			}
		})
	})

	describe('independent cross-checks', () => {
		test('matches iterative two-pointer sweep across 250 randomized unnormalized cases', () => {
			const rng = createRng(0x5eed1234)

			const randomSet = (maxCount, spread) => {
				const count = Math.floor(rng() * (maxCount + 1))
				const set = []
				for (let i = 0; i < count; i++) {
					const a = Math.round((rng() * 2 - 1) * spread * 2) / 2
					const width = rng() < 0.15 ? 0 : Math.round(rng() * 12 * 2) / 2
					set.push([a, a + width])
				}
				return set
			}

			for (let trial = 0; trial < 250; trial++) {
				const maxA = trial % 5 === 0 ? 60 : 20
				const maxB = trial % 7 === 0 ? 60 : 20
				const setA = randomSet(maxA, 40)
				const setB = randomSet(maxB, 40)

				const actual = intersectionIntervalRecursive(setA, setB)
				const expected = iterativeTwoPointerIntersection(setA, setB)

				assert.deepEqual(
					actual,
					expected,
					`mismatch on trial ${trial}: A=${JSON.stringify(setA)} B=${JSON.stringify(setB)}`,
				)

				// Verify normalized output invariants directly
				for (let i = 0; i < actual.length; i++) {
					assert.ok(actual[i][0] <= actual[i][1])
					if (i > 0) {
						assert.ok(
							actual[i - 1][1] < actual[i][0],
							'output intervals must be strictly disjoint and sorted',
						)
					}
				}
			}
		})

		test('matches point-sampling oracle on integer and half-integer grid', () => {
			const rng = createRng(0xc0ffee99)
			const containsPoint = (set, x) =>
				set.some(([lo, hi]) => lo <= x && x <= hi)

			for (let trial = 0; trial < 50; trial++) {
				const makeIntSet = (n) => {
					const s = []
					for (let i = 0; i < n; i++) {
						const lo = Math.floor(rng() * 41) - 20
						const hi = lo + Math.floor(rng() * 8)
						s.push([lo, hi])
					}
					return s
				}

				const setA = makeIntSet(Math.floor(rng() * 12))
				const setB = makeIntSet(Math.floor(rng() * 12))
				const result = intersectionIntervalRecursive(setA, setB)

				// Every integer and half-integer point in [-21, 30] must agree
				for (let p = -42; p <= 60; p++) {
					const x = p / 2
					const inResult = containsPoint(result, x)
					const inBoth = containsPoint(setA, x) && containsPoint(setB, x)
					assert.equal(
						inResult,
						inBoth,
						`point ${x} disagreement on trial ${trial}`,
					)
				}
			}
		})
	})
})
