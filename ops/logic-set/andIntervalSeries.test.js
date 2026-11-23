import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { andIntervalSeries } from './andIntervalSeries.js'

/**
 * Independent reference implementation using naive pairwise closed-form
 * intersection `[max(a, c), min(b, d)]` followed by sort-and-merge.
 */
function naivePairwiseAnd(setA, setB) {
	const raw = []
	for (const [a0, a1] of setA) {
		for (const [b0, b1] of setB) {
			const lo = Math.max(a0, b0)
			const hi = Math.min(a1, b1)
			if (lo <= hi) {
				raw.push([lo === 0 ? 0 : lo, hi === 0 ? 0 : hi])
			}
		}
	}
	if (raw.length <= 1) return raw
	raw.sort((u, v) => (u[0] !== v[0] ? u[0] - v[0] : u[1] - v[1]))
	const merged = [raw[0]]
	for (let i = 1; i < raw.length; i++) {
		const [lo, hi] = raw[i]
		const last = merged[merged.length - 1]
		if (lo <= last[1]) {
			if (hi > last[1]) last[1] = hi
		} else {
			merged.push([lo, hi])
		}
	}
	return merged
}

/**
 * Independent point-membership test for a set of closed intervals.
 */
function containsPoint(set, x) {
	for (const [lo, hi] of set) {
		if (lo <= x && x <= hi) return true
	}
	return false
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property-based cross-checks.
 */
function mulberry32(seed) {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

describe('andIntervalSeries', () => {
	test('computes intersection of two overlapping single intervals', () => {
		assert.deepEqual(andIntervalSeries([[0, 5]], [[2, 8]]), [[2, 5]])
	})

	test('computes intersection of multiple disjoint intervals', () => {
		const a = [
			[0, 3],
			[5, 10],
			[12, 15],
		]
		const b = [
			[2, 6],
			[8, 13],
		]
		assert.deepEqual(andIntervalSeries(a, b), [
			[2, 3],
			[5, 6],
			[8, 10],
			[12, 13],
		])
	})

	test('normalizes and merges unsorted, overlapping, and touching input intervals', () => {
		const a = [
			[5, 8],
			[1, 3],
			[2, 5],
			[10, 12],
		]
		const b = [
			[6, 11],
			[0, 4],
			[4, 6],
		]
		assert.deepEqual(andIntervalSeries(a, b), [
			[1, 8],
			[10, 11],
		])
	})

	test('handles negative numbers and floating-point endpoints', () => {
		const a = [
			[-10.5, -2.25],
			[-1.5, 4.75],
		]
		const b = [
			[-5.5, 0.5],
			[3.25, 10.0],
		]
		assert.deepEqual(andIntervalSeries(a, b), [
			[-5.5, -2.25],
			[-1.5, 0.5],
			[3.25, 4.75],
		])
	})

	test('supports variadic logical AND across three or more interval sets', () => {
		const a = [
			[0, 10],
			[20, 30],
		]
		const b = [
			[2, 15],
			[18, 25],
		]
		const c = [
			[4, 8],
			[22, 28],
		]
		const d = [
			[5, 7],
			[23, 24],
		]
		assert.deepEqual(andIntervalSeries(a, b, c), [
			[4, 8],
			[22, 25],
		])
		assert.deepEqual(andIntervalSeries(a, b, c, d), [
			[5, 7],
			[23, 24],
		])
	})

	test('handles empty sets and completely disjoint sets', () => {
		assert.deepEqual(andIntervalSeries([], [[1, 5]]), [])
		assert.deepEqual(andIntervalSeries([[1, 5]], []), [])
		assert.deepEqual(andIntervalSeries([], []), [])
		assert.deepEqual(
			andIntervalSeries(
				[
					[0, 1],
					[4, 5],
				],
				[
					[2, 3],
					[6, 7],
				]
			),
			[]
		)
	})

	test('handles touching endpoints and degenerate point intervals [p, p]', () => {
		assert.deepEqual(andIntervalSeries([[1, 3]], [[3, 5]]), [[3, 3]])
		assert.deepEqual(andIntervalSeries([[2, 2]], [[1, 3]]), [[2, 2]])
		assert.deepEqual(andIntervalSeries([[2, 2]], [[2, 2]]), [[2, 2]])
		assert.deepEqual(andIntervalSeries([[2, 2]], [[3, 5]]), [])
		assert.deepEqual(
			andIntervalSeries(
				[
					[1, 3],
					[5, 7],
				],
				[
					[3, 5],
					[7, 9],
				]
			),
			[
				[3, 3],
				[5, 5],
				[7, 7],
			]
		)
	})

	test('normalizes -0 to +0 and does not mutate input arrays', () => {
		const a = [
			[-0, 2],
			[4, 6],
		]
		const b = [
			[-1, -0],
			[4, 6],
		]
		const aSnap = structuredClone(a)
		const bSnap = structuredClone(b)

		const res = andIntervalSeries(a, b)
		assert.deepEqual(res, [
			[0, 0],
			[4, 6],
		])
		assert.equal(Object.is(res[0][0], 0), true)
		assert.equal(Object.is(res[0][1], 0), true)
		assert.deepEqual(a, aSnap)
		assert.deepEqual(b, bSnap)
	})

	test('rejects invalid inputs with TypeError or RangeError', () => {
		assert.throws(() => andIntervalSeries(), TypeError)
		assert.throws(() => andIntervalSeries([[0, 1]]), TypeError)
		assert.throws(() => andIntervalSeries(null, [[0, 1]]), TypeError)
		assert.throws(() => andIntervalSeries([[0, 1]], 'bad'), TypeError)
		assert.throws(() => andIntervalSeries([[0, 1]], {}), TypeError)
		assert.throws(() => andIntervalSeries([[0]], [[0, 1]]), TypeError)
		assert.throws(() => andIntervalSeries([[0, 1, 2]], [[0, 1]]), TypeError)
		assert.throws(() => andIntervalSeries(['not-pair'], [[0, 1]]), TypeError)
		assert.throws(() => andIntervalSeries([['0', 1]], [[0, 1]]), TypeError)
		assert.throws(() => andIntervalSeries([[0, null]], [[0, 1]]), TypeError)

		assert.throws(() => andIntervalSeries([[NaN, 1]], [[0, 1]]), RangeError)
		assert.throws(
			() => andIntervalSeries([[0, Infinity]], [[0, 1]]),
			RangeError
		)
		assert.throws(
			() => andIntervalSeries([[-Infinity, 1]], [[0, 1]]),
			RangeError
		)
		assert.throws(() => andIntervalSeries([[5, 2]], [[0, 10]]), RangeError)

		// Validation must still run on later arguments even if an earlier set is empty
		assert.throws(() => andIntervalSeries([], [[5, 2]]), RangeError)
		assert.throws(() => andIntervalSeries([], 'invalid'), TypeError)
	})

	test('cross-check: matches independent naive pairwise intersection and pointwise indicator across randomized cases', () => {
		const rand = mulberry32(0x20261123)

		function randomIntervalSet() {
			const count = Math.floor(rand() * 8)
			const set = []
			for (let i = 0; i < count; i++) {
				// Use integer grid values so touching and point intervals occur frequently
				const x = Math.floor(rand() * 21) - 10
				const span = Math.floor(rand() * 7)
				set.push([x, x + span])
			}
			return set
		}

		for (let trial = 0; trial < 200; trial++) {
			const a = randomIntervalSet()
			const b = randomIntervalSet()
			const c = randomIntervalSet()

			const gotAB = andIntervalSeries(a, b)
			const expectedAB = naivePairwiseAnd(a, b)
			assert.deepEqual(gotAB, expectedAB)

			// Commutativity: A ∧ B = B ∧ A
			assert.deepEqual(andIntervalSeries(b, a), gotAB)

			// Associativity: (A ∧ B) ∧ C = A ∧ (B ∧ C) = andIntervalSeries(A, B, C)
			const leftAssoc = andIntervalSeries(gotAB, c)
			const rightAssoc = andIntervalSeries(a, andIntervalSeries(b, c))
			const variadic = andIntervalSeries(a, b, c)
			assert.deepEqual(leftAssoc, rightAssoc)
			assert.deepEqual(variadic, leftAssoc)

			// Idempotence: (A ∧ B) ∧ (A ∧ B) = A ∧ B
			assert.deepEqual(andIntervalSeries(gotAB, gotAB), gotAB)

			// Strict normalization invariant on output
			for (let i = 0; i < gotAB.length; i++) {
				const [lo, hi] = gotAB[i]
				assert.ok(lo <= hi)
				if (i > 0) {
					assert.ok(gotAB[i - 1][1] < lo)
				}
			}

			// Independent pointwise indicator verification on integer and half-integer sample grid
			for (let s = -11; s <= 17; s += 0.5) {
				const expectedMember = containsPoint(a, s) && containsPoint(b, s)
				assert.equal(containsPoint(gotAB, s), expectedMember)
			}
		}
	})
})
