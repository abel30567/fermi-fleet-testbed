import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { intersectionMultisetSeries } from './intersectionMultisetSeries.js'

/**
 * Independent reference implementation via the discrete layer-cake / level-set
 * indicator series:
 *
 *   m_{∩ A_i}(x) = sum_{k = 1}^{M(x)} prod_i 1[m_{A_i}(x) >= k]
 *
 * Completely independent of the closed-form (a + b - |a - b|) / 2 formula.
 */
function layerCakeSeriesIntersection(...multisets) {
	const keys = new Set()
	for (const m of multisets) {
		for (const k of m.keys()) {
			keys.add(k)
		}
	}

	const result = new Map()
	for (const key of keys) {
		let upperBound = 0
		for (const m of multisets) {
			const c = m.get(key) ?? 0
			if (c > upperBound) {
				upperBound = c
			}
		}

		let seriesSum = 0
		for (let level = 1; level <= upperBound; level++) {
			let indicatorProduct = 1
			for (const m of multisets) {
				indicatorProduct *= (m.get(key) ?? 0) >= level ? 1 : 0
			}
			seriesSum += indicatorProduct
		}

		if (seriesSum > 0) {
			result.set(key, seriesSum)
		}
	}

	return result
}

/**
 * Independent multiset union (pointwise max) for inclusion-exclusion cross-checks.
 */
function multisetUnion(...multisets) {
	const result = new Map()
	for (const m of multisets) {
		for (const [k, c] of m.entries()) {
			if (c === 0) continue
			const prev = result.get(k) ?? 0
			result.set(k, c > prev ? c : prev)
		}
	}
	return result
}

function multisetCardinality(m) {
	let total = 0
	for (const c of m.values()) {
		total += c
	}
	return total
}

describe('intersectionMultisetSeries', () => {
	describe('normal cases', () => {
		it('computes pointwise minimum multiplicities for overlapping multisets', () => {
			const a = new Map([
				['apple', 3],
				['banana', 2],
				['cherry', 5],
			])
			const b = new Map([
				['apple', 1],
				['banana', 4],
				['date', 2],
			])

			const res = intersectionMultisetSeries(a, b)
			assert.deepEqual(
				res,
				new Map([
					['apple', 1],
					['banana', 2],
				])
			)
		})

		it('supports n-ary intersection across three or more multisets', () => {
			const a = new Map([
				['x', 5],
				['y', 3],
				['z', 2],
			])
			const b = new Map([
				['x', 2],
				['y', 4],
				['z', 7],
			])
			const c = new Map([
				['x', 4],
				['y', 1],
				['w', 9],
			])

			const res = intersectionMultisetSeries(a, b, c)
			assert.deepEqual(
				res,
				new Map([
					['x', 2],
					['y', 1],
				])
			)
		})

		it('supports arbitrary Map key types (numbers, NaN, objects, symbols, null, undefined)', () => {
			const obj1 = { id: 1 }
			const obj2 = { id: 2 }
			const sym = Symbol('tag')

			const a = new Map([
				[1, 3],
				[NaN, 4],
				[obj1, 2],
				[obj2, 5],
				[sym, 6],
				[null, 2],
				[undefined, 3],
			])
			const b = new Map([
				[1, 5],
				[NaN, 2],
				[obj1, 7],
				[sym, 3],
				[null, 2],
				[undefined, 1],
			])

			const res = intersectionMultisetSeries(a, b)
			assert.equal(res.size, 6)
			assert.equal(res.get(1), 3)
			assert.equal(res.get(NaN), 2)
			assert.equal(res.get(obj1), 2)
			assert.equal(res.has(obj2), false)
			assert.equal(res.get(sym), 3)
			assert.equal(res.get(null), 2)
			assert.equal(res.get(undefined), 1)
		})
	})

	describe('edge cases', () => {
		it('returns an empty Map for disjoint multisets', () => {
			const a = new Map([
				['a', 2],
				['b', 3],
			])
			const b = new Map([
				['c', 1],
				['d', 4],
			])
			assert.deepEqual(intersectionMultisetSeries(a, b), new Map())
		})

		it('returns an empty Map when either or both multisets are empty', () => {
			const nonEmpty = new Map([['a', 3]])
			const empty = new Map()

			assert.deepEqual(intersectionMultisetSeries(nonEmpty, empty), new Map())
			assert.deepEqual(intersectionMultisetSeries(empty, nonEmpty), new Map())
			assert.deepEqual(intersectionMultisetSeries(empty, empty), new Map())
		})

		it('canonicalizes explicit zero and -0 counts by omitting them from the result', () => {
			const a = new Map([
				['zero', 0],
				['negZero', -0],
				['pos', 3],
			])
			const b = new Map([
				['zero', 5],
				['negZero', 2],
				['pos', 2],
			])

			const res = intersectionMultisetSeries(a, b)
			assert.deepEqual(res, new Map([['pos', 2]]))
			assert.equal(res.has('zero'), false)
			assert.equal(res.has('negZero'), false)
		})

		it('handles Number.MAX_SAFE_INTEGER without intermediate overflow or precision loss', () => {
			const MAX = Number.MAX_SAFE_INTEGER
			const a = new Map([
				['bothMax', MAX],
				['maxAndMaxMinus1', MAX],
				['maxAndOne', MAX],
			])
			const b = new Map([
				['bothMax', MAX],
				['maxAndMaxMinus1', MAX - 1],
				['maxAndOne', 1],
			])

			const res = intersectionMultisetSeries(a, b)
			assert.equal(res.get('bothMax'), MAX)
			assert.equal(res.get('maxAndMaxMinus1'), MAX - 1)
			assert.equal(res.get('maxAndOne'), 1)
		})

		it('does not mutate inputs and returns a fresh Map even for self-intersection', () => {
			const a = new Map([
				['k', 4],
				['z', 0],
			])
			const snapshot = new Map(a)
			const res = intersectionMultisetSeries(a, a)

			assert.notEqual(res, a)
			assert.deepEqual(a, snapshot)
			assert.deepEqual(res, new Map([['k', 4]]))
		})

		it('normalizes -0 and +0 numeric keys identically per Map SameValueZero', () => {
			const a = new Map([[-0, 5]])
			const b = new Map([[0, 3]])
			const res = intersectionMultisetSeries(a, b)
			assert.equal(res.get(0), 3)
			assert.equal(res.size, 1)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when fewer than two arguments are provided', () => {
			assert.throws(() => intersectionMultisetSeries(), TypeError)
			assert.throws(() => intersectionMultisetSeries(new Map()), TypeError)
		})

		it('throws TypeError when any argument is not a Map', () => {
			const valid = new Map([['a', 1]])
			assert.throws(() => intersectionMultisetSeries(null, valid), TypeError)
			assert.throws(() => intersectionMultisetSeries(valid, undefined), TypeError)
			assert.throws(() => intersectionMultisetSeries({ a: 1 }, valid), TypeError)
			assert.throws(() => intersectionMultisetSeries(valid, [['a', 1]]), TypeError)
			assert.throws(() => intersectionMultisetSeries(valid, new Set(['a'])), TypeError)
			assert.throws(() => intersectionMultisetSeries(valid, valid, 'bad'), TypeError)
		})

		it('throws TypeError for non-number counts, including on non-intersecting keys', () => {
			const valid = new Map([['a', 1]])
			assert.throws(
				() => intersectionMultisetSeries(valid, new Map([['onlyInB', '2']])),
				TypeError
			)
			assert.throws(
				() => intersectionMultisetSeries(new Map([['onlyInA', null]]), valid),
				TypeError
			)
			assert.throws(
				() => intersectionMultisetSeries(valid, new Map([['a', 2n]])),
				TypeError
			)
			assert.throws(
				() => intersectionMultisetSeries(valid, new Map([['a', true]])),
				TypeError
			)
		})

		it('throws RangeError for negative, fractional, NaN, infinite, or unsafe counts', () => {
			const valid = new Map([['a', 1]])
			const badCounts = [
				-1,
				1.5,
				NaN,
				Infinity,
				-Infinity,
				Number.MAX_SAFE_INTEGER + 1,
			]

			for (const bad of badCounts) {
				assert.throws(
					() => intersectionMultisetSeries(valid, new Map([['onlyInB', bad]])),
					RangeError,
					`Expected RangeError for count ${String(bad)}`
				)
			}
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		it('matches the discrete layer-cake indicator series across deterministic pseudo-random multisets', () => {
			// Linear congruential generator for reproducible test cases
			let seed = 0x5eed1234
			const nextInt = (maxExclusive) => {
				seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
				return seed % maxExclusive
			}

			const universe = ['u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7']
			for (let trial = 0; trial < 40; trial++) {
				const numSets = 2 + (trial % 3) // 2, 3, or 4 multisets
				const multisets = []
				for (let s = 0; s < numSets; s++) {
					const m = new Map()
					for (const key of universe) {
						if (nextInt(3) !== 0) {
							m.set(key, nextInt(12)) // includes explicit 0s
						}
					}
					multisets.push(m)
				}

				const actual = intersectionMultisetSeries(...multisets)
				const expected = layerCakeSeriesIntersection(...multisets)
				assert.deepEqual(actual, expected)
			}
		})

		it('satisfies binary and ternary inclusion-exclusion identities', () => {
			const a = new Map([
				['a', 4],
				['b', 2],
				['c', 0],
				['d', 7],
			])
			const b = new Map([
				['a', 1],
				['b', 5],
				['c', 3],
				['e', 6],
			])
			const c = new Map([
				['a', 3],
				['b', 2],
				['d', 2],
				['e', 4],
			])

			// Binary inclusion-exclusion: |A ∩ B| + |A ∪ B| = |A| + |B|
			const abInter = intersectionMultisetSeries(a, b)
			const abUnion = multisetUnion(a, b)
			assert.equal(
				multisetCardinality(abInter) + multisetCardinality(abUnion),
				multisetCardinality(a) + multisetCardinality(b)
			)

			// Ternary inclusion-exclusion:
			// |A ∩ B ∩ C| = |A| + |B| + |C| - |A ∪ B| - |A ∪ C| - |B ∪ C| + |A ∪ B ∪ C|
			const abcInter = intersectionMultisetSeries(a, b, c)
			const expectedCard =
				multisetCardinality(a) +
				multisetCardinality(b) +
				multisetCardinality(c) -
				multisetCardinality(multisetUnion(a, b)) -
				multisetCardinality(multisetUnion(a, c)) -
				multisetCardinality(multisetUnion(b, c)) +
				multisetCardinality(multisetUnion(a, b, c))
			assert.equal(multisetCardinality(abcInter), expectedCard)
		})

		it('satisfies commutativity, associativity, and distributivity over multiset union', () => {
			const a = new Map([
				['p', 6],
				['q', 1],
				['r', 4],
			])
			const b = new Map([
				['p', 2],
				['q', 5],
				['s', 3],
			])
			const c = new Map([
				['p', 4],
				['q', 3],
				['r', 2],
				['s', 7],
			])

			// Commutativity: A ∩ B = B ∩ A
			assert.deepEqual(
				intersectionMultisetSeries(a, b),
				intersectionMultisetSeries(b, a)
			)

			// Associativity: (A ∩ B) ∩ C = A ∩ (B ∩ C) = ∩(A, B, C)
			const leftAssoc = intersectionMultisetSeries(
				intersectionMultisetSeries(a, b),
				c
			)
			const rightAssoc = intersectionMultisetSeries(
				a,
				intersectionMultisetSeries(b, c)
			)
			const direct = intersectionMultisetSeries(a, b, c)
			assert.deepEqual(leftAssoc, rightAssoc)
			assert.deepEqual(leftAssoc, direct)

			// Distributivity: A ∩ (B ∪ C) = (A ∩ B) ∪ (A ∩ C)
			const lhs = intersectionMultisetSeries(a, multisetUnion(b, c))
			const rhs = multisetUnion(
				intersectionMultisetSeries(a, b),
				intersectionMultisetSeries(a, c)
			)
			assert.deepEqual(lhs, rhs)
		})
	})
})
