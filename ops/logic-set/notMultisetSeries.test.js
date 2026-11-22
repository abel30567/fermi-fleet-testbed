import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { notMultisetSeries } from './notMultisetSeries.js'

/**
 * Helper: multiset logical AND (pointwise minimum), omitting zeros.
 */
function multisetAnd(a, b) {
	const result = new Map()
	for (const [key, aCount] of a) {
		const bCount = b.get(key) ?? 0
		const count = Math.min(aCount, bCount)
		if (count > 0) result.set(key, count)
	}
	return result
}

/**
 * Helper: multiset logical OR (pointwise maximum), omitting zeros.
 */
function multisetOr(a, b) {
	const result = new Map()
	const keys = new Set([...a.keys(), ...b.keys()])
	for (const key of keys) {
		const count = Math.max(a.get(key) ?? 0, b.get(key) ?? 0)
		if (count > 0) result.set(key, count)
	}
	return result
}

/**
 * Helper: canonicalize a multiset by removing zero-count entries.
 */
function canonicalize(m) {
	const result = new Map()
	for (const [key, count] of m) {
		if (count > 0) result.set(key, count)
	}
	return result
}

describe('notMultisetSeries', () => {
	describe('normal cases', () => {
		it('computes complement relative to universe multiset', () => {
			const a = new Map([
				['a', 1],
				['b', 3],
			])
			const u = new Map([
				['a', 4],
				['b', 3],
				['c', 2],
			])

			const res = notMultisetSeries(a, u)
			assert.deepEqual(
				res,
				new Map([
					['a', 3],
					['c', 2],
				])
			)
		})

		it('omits zero counts from output even when input maps contain explicit zeros', () => {
			const a = new Map([
				['x', 0],
				['y', 2],
			])
			const u = new Map([
				['x', 0],
				['y', 2],
				['z', 5],
			])

			const res = notMultisetSeries(a, u)
			assert.deepEqual(res, new Map([['z', 5]]))
			assert.equal(res.has('x'), false)
			assert.equal(res.has('y'), false)
		})

		it('supports arbitrary Map key types (numbers, objects, symbols, null, undefined)', () => {
			const objKey = { id: 1 }
			const symKey = Symbol('k')
			const a = new Map([
				[1, 2],
				[objKey, 1],
				[symKey, 3],
				[null, 1],
			])
			const u = new Map([
				[1, 5],
				[objKey, 4],
				[symKey, 3],
				[null, 2],
				[undefined, 6],
			])

			const res = notMultisetSeries(a, u)
			assert.deepEqual(
				res,
				new Map([
					[1, 3],
					[objKey, 3],
					[null, 1],
					[undefined, 6],
				])
			)
		})

		it('does not mutate input multisets', () => {
			const a = new Map([['a', 2]])
			const u = new Map([
				['a', 5],
				['b', 1],
			])
			const aSnapshot = new Map(a)
			const uSnapshot = new Map(u)

			notMultisetSeries(a, u)
			assert.deepEqual(a, aSnapshot)
			assert.deepEqual(u, uSnapshot)
		})
	})

	describe('edge cases', () => {
		it('returns canonical copy of universe when multiset is empty', () => {
			const u = new Map([
				['a', 3],
				['b', 0],
				['c', 1],
			])
			const res = notMultisetSeries(new Map(), u)
			assert.deepEqual(
				res,
				new Map([
					['a', 3],
					['c', 1],
				])
			)
			assert.notEqual(res, u)
		})

		it('returns empty Map when universe is empty', () => {
			const a = new Map([
				['a', 2],
				['b', 5],
			])
			const res = notMultisetSeries(a, new Map())
			assert.deepEqual(res, new Map())
		})

		it('returns empty Map when both multiset and universe are empty', () => {
			const res = notMultisetSeries(new Map(), new Map())
			assert.deepEqual(res, new Map())
		})

		it('clamps A(x) > U(x) to 0 and omits those keys', () => {
			const a = new Map([
				['a', 10],
				['b', 4],
				['extra', 7],
			])
			const u = new Map([
				['a', 3],
				['b', 4],
				['c', 2],
			])

			const res = notMultisetSeries(a, u)
			assert.deepEqual(res, new Map([['c', 2]]))
		})

		it('returns empty Map when A == U (distinct Maps and identical reference)', () => {
			const u = new Map([
				['a', 2],
				['b', 5],
			])
			assert.deepEqual(notMultisetSeries(new Map(u), u), new Map())
			assert.deepEqual(notMultisetSeries(u, u), new Map())
		})

		it('handles Number.MAX_SAFE_INTEGER counts without precision loss', () => {
			const max = Number.MAX_SAFE_INTEGER
			const a = new Map([
				['zero', 0],
				['one', 1],
				['max', max],
			])
			const u = new Map([
				['zero', max],
				['one', max],
				['max', max],
				['small', 1],
			])

			const res = notMultisetSeries(a, u)
			assert.deepEqual(
				res,
				new Map([
					['zero', max],
					['one', max - 1],
					['small', 1],
				])
			)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when multiset or universe is not a Map', () => {
			const valid = new Map([['a', 1]])
			for (const bad of [null, undefined, {}, [], 'map', 42, new Set()]) {
				assert.throws(() => notMultisetSeries(bad, valid), TypeError)
				assert.throws(() => notMultisetSeries(valid, bad), TypeError)
			}
			assert.throws(() => notMultisetSeries(), TypeError)
		})

		it('throws TypeError when any count is not a number', () => {
			const valid = new Map([['a', 1]])
			for (const badCount of ['1', null, undefined, true, 1n, {}, []]) {
				assert.throws(
					() => notMultisetSeries(new Map([['a', badCount]]), valid),
					TypeError
				)
				assert.throws(
					() => notMultisetSeries(valid, new Map([['a', badCount]])),
					TypeError
				)
			}
		})

		it('throws RangeError for negative, fractional, non-finite, or unsafe counts', () => {
			const valid = new Map([['a', 1]])
			const invalidCounts = [
				-1,
				-100,
				0.5,
				1.25,
				Number.NaN,
				Number.POSITIVE_INFINITY,
				Number.NEGATIVE_INFINITY,
				Number.MAX_SAFE_INTEGER + 1,
				Number.MIN_SAFE_INTEGER - 1,
			]

			for (const badCount of invalidCounts) {
				assert.throws(
					() => notMultisetSeries(new Map([['a', badCount]]), valid),
					RangeError
				)
				assert.throws(
					() => notMultisetSeries(valid, new Map([['a', badCount]])),
					RangeError
				)
			}
		})

		it('validates counts in multiset even for keys absent from universe', () => {
			const u = new Map([['a', 3]])
			assert.throws(
				() => notMultisetSeries(new Map([['absent', -2]]), u),
				RangeError
			)
			assert.throws(
				() => notMultisetSeries(new Map([['absent', '3']]), u),
				TypeError
			)
		})
	})

	describe('algebraic identities & cross-checks', () => {
		it('satisfies involution not(not(A, U), U) == A whenever A ⊆ U', () => {
			const u = new Map([
				['a', 5],
				['b', 3],
				['c', 8],
				['d', 1],
			])
			const subsets = [
				new Map(),
				new Map([
					['a', 0],
					['b', 2],
					['c', 8],
				]),
				new Map([
					['a', 5],
					['b', 3],
					['c', 8],
					['d', 1],
				]),
				new Map([
					['a', 1],
					['d', 1],
				]),
			]

			for (const a of subsets) {
				const doubleNot = notMultisetSeries(notMultisetSeries(a, u), u)
				assert.deepEqual(doubleNot, canonicalize(a))
			}
		})

		it('satisfies not(not(A, U), U) == A ∩ U when A is not a subset of U', () => {
			const u = new Map([
				['a', 3],
				['b', 2],
				['c', 5],
			])
			const a = new Map([
				['a', 7],
				['b', 1],
				['extra', 4],
			])

			const doubleNot = notMultisetSeries(notMultisetSeries(a, u), u)
			assert.deepEqual(doubleNot, multisetAnd(a, u))
		})

		it("satisfies De Morgan's laws: not(A ∧ B, U) == not(A, U) ∨ not(B, U) and dual", () => {
			const u = new Map([
				['x', 6],
				['y', 4],
				['z', 9],
				['w', 2],
			])
			const pairs = [
				[
					new Map([
						['x', 2],
						['y', 4],
						['z', 0],
					]),
					new Map([
						['x', 5],
						['y', 1],
						['w', 2],
					]),
				],
				[
					new Map([
						['x', 10],
						['y', 3],
						['extra', 4],
					]),
					new Map([
						['x', 2],
						['y', 8],
						['z', 9],
					]),
				],
				[new Map(), new Map(u)],
			]

			for (const [a, b] of pairs) {
				// First De Morgan law: not(A ∧ B, U) == not(A, U) ∨ not(B, U)
				const lhsAnd = notMultisetSeries(multisetAnd(a, b), u)
				const rhsOr = multisetOr(
					notMultisetSeries(a, u),
					notMultisetSeries(b, u)
				)
				assert.deepEqual(lhsAnd, rhsOr)

				// Second De Morgan law: not(A ∨ B, U) == not(A, U) ∧ not(B, U)
				const lhsOr = notMultisetSeries(multisetOr(a, b), u)
				const rhsAnd = multisetAnd(
					notMultisetSeries(a, u),
					notMultisetSeries(b, u)
				)
				assert.deepEqual(lhsOr, rhsAnd)
			}
		})

		it('matches independent max(0, U(x) - A(x)) reference across deterministic cases', () => {
			const referenceNot = (a, u) => {
				const out = new Map()
				for (const [k, uVal] of u) {
					const val = Math.max(0, uVal - (a.get(k) ?? 0))
					if (val > 0) out.set(k, val)
				}
				return out
			}

			let seed = 1337
			const nextInt = (max) => {
				seed = (seed * 1103515245 + 12345) % 2147483648
				return seed % (max + 1)
			}

			const keys = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5']
			for (let trial = 0; trial < 25; trial++) {
				const a = new Map()
				const u = new Map()
				for (const k of keys) {
					if (nextInt(3) > 0) a.set(k, nextInt(10))
					if (nextInt(3) > 0) u.set(k, nextInt(10))
				}

				const actual = notMultisetSeries(a, u)
				const expected = referenceNot(a, u)
				assert.deepEqual(actual, expected)
			}
		})
	})
})
