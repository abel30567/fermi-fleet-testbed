import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { andMultisetSeries } from './andMultisetSeries.js'

/**
 * Independent reference implementation of multiset AND via the threshold /
 * layer-cake indicator series:
 *
 *   m_{A ∧ B}(x) = sum_{k=1}^{max(m_A(x), m_B(x))} (1[m_A(x) >= k] AND 1[m_B(x) >= k])
 *
 * Uses explicit boolean conjunction at each threshold level `k`, completely
 * independent of the closed-form `(a + b - |a - b|) / 2` formula.
 *
 * @template T
 * @param {Map<T, number>} a
 * @param {Map<T, number>} b
 * @returns {Map<T, number>}
 */
function referenceAndViaIndicatorSeries(a, b) {
	const result = new Map()
	const keys = new Set([...a.keys(), ...b.keys()])
	for (const key of keys) {
		const ca = a.get(key) ?? 0
		const cb = b.get(key) ?? 0
		const upper = Math.max(ca, cb)
		let count = 0
		for (let k = 1; k <= upper; k++) {
			if (ca >= k && cb >= k) {
				count += 1
			}
		}
		if (count > 0) {
			result.set(key, count)
		}
	}
	return result
}

describe('andMultisetSeries', () => {
	describe('normal cases', () => {
		test('computes multiset AND for overlapping keys', () => {
			const a = new Map([
				['x', 3],
				['y', 5],
				['z', 2],
			])
			const b = new Map([
				['x', 4],
				['y', 2],
				['w', 7],
			])

			const result = andMultisetSeries(a, b)
			assert.deepEqual(
				result,
				new Map([
					['x', 3],
					['y', 2],
				]),
			)
		})

		test('returns empty map for disjoint multisets', () => {
			const a = new Map([
				['a', 2],
				['b', 1],
			])
			const b = new Map([
				['c', 3],
				['d', 4],
			])

			assert.deepEqual(andMultisetSeries(a, b), new Map())
		})

		test('supports arbitrary Map key types (objects, symbols, numbers, booleans, null, undefined)', () => {
			const obj1 = { id: 1 }
			const obj2 = { id: 2 }
			const sym = Symbol('k')

			const a = new Map([
				[obj1, 4],
				[obj2, 2],
				[sym, 3],
				[42, 5],
				[true, 2],
				[null, 3],
				[undefined, 1],
			])
			const b = new Map([
				[obj1, 2],
				[sym, 6],
				[42, 5],
				[true, 1],
				[null, 4],
				[undefined, 2],
			])

			assert.deepEqual(
				andMultisetSeries(a, b),
				new Map([
					[obj1, 2],
					[sym, 3],
					[42, 5],
					[true, 1],
					[null, 3],
					[undefined, 1],
				]),
			)
		})

		test('supports variadic n-ary multiset AND across 3+ multisets', () => {
			const a = new Map([
				['p', 5],
				['q', 3],
				['r', 2],
			])
			const b = new Map([
				['p', 2],
				['q', 4],
				['r', 1],
			])
			const c = new Map([
				['p', 7],
				['q', 1],
			])

			assert.deepEqual(
				andMultisetSeries(a, b, c),
				new Map([
					['p', 2],
					['q', 1],
				]),
			)
		})
	})

	describe('edge cases', () => {
		test('handles empty multisets', () => {
			const empty = new Map()
			const nonEmpty = new Map([['a', 3]])

			assert.deepEqual(andMultisetSeries(empty, empty), new Map())
			assert.deepEqual(andMultisetSeries(empty, nonEmpty), new Map())
			assert.deepEqual(andMultisetSeries(nonEmpty, empty), new Map())
		})

		test('accepts zero and -0 multiplicities in inputs and omits zeros from output', () => {
			const a = new Map([
				['a', 0],
				['b', -0],
				['c', 4],
				['d', 2],
			])
			const b = new Map([
				['a', 5],
				['b', 3],
				['c', 0],
				['d', 3],
			])

			const result = andMultisetSeries(a, b)
			assert.deepEqual(result, new Map([['d', 2]]))
			assert.equal(result.has('a'), false)
			assert.equal(result.has('b'), false)
			assert.equal(result.has('c'), false)
		})

		test('preserves exactness at Number.MAX_SAFE_INTEGER boundary without overflow', () => {
			const max = Number.MAX_SAFE_INTEGER
			const a = new Map([
				['sameMax', max],
				['nearMax', max - 1],
				['largeSmall', max],
				['halfPlus', Math.floor(max / 2) + 10],
			])
			const b = new Map([
				['sameMax', max],
				['nearMax', max],
				['largeSmall', 1],
				['halfPlus', Math.floor(max / 2) + 25],
			])

			const result = andMultisetSeries(a, b)
			assert.equal(result.get('sameMax'), max)
			assert.equal(result.get('nearMax'), max - 1)
			assert.equal(result.get('largeSmall'), 1)
			assert.equal(result.get('halfPlus'), Math.floor(max / 2) + 10)
		})

		test('does not mutate inputs and returns a fresh Map even when a === b', () => {
			const a = new Map([
				['x', 2],
				['y', 0],
			])
			const b = new Map([
				['x', 5],
				['z', 1],
			])

			const result = andMultisetSeries(a, b)
			assert.notEqual(result, a)
			assert.notEqual(result, b)
			assert.deepEqual(
				a,
				new Map([
					['x', 2],
					['y', 0],
				]),
			)
			assert.deepEqual(
				b,
				new Map([
					['x', 5],
					['z', 1],
				]),
			)

			const selfAnd = andMultisetSeries(a, a)
			assert.notEqual(selfAnd, a)
			assert.deepEqual(selfAnd, new Map([['x', 2]]))
		})
	})

	describe('input validation', () => {
		test('throws TypeError when fewer than two Maps or non-Map inputs are provided', () => {
			const valid = new Map([['a', 1]])

			assert.throws(() => andMultisetSeries(), TypeError)
			assert.throws(() => andMultisetSeries(valid), TypeError)
			assert.throws(() => andMultisetSeries(null, valid), TypeError)
			assert.throws(() => andMultisetSeries(valid, undefined), TypeError)
			assert.throws(() => andMultisetSeries({ a: 1 }, valid), TypeError)
			assert.throws(() => andMultisetSeries(valid, [['a', 1]]), TypeError)
			assert.throws(() => andMultisetSeries(new Set(['a']), valid), TypeError)
			assert.throws(() => andMultisetSeries(valid, valid, 'not-a-map'), TypeError)
		})

		test('throws TypeError for non-numeric or NaN multiplicities', () => {
			const valid = new Map([['a', 1]])

			assert.throws(
				() => andMultisetSeries(new Map([['a', '2']]), valid),
				TypeError,
			)
			assert.throws(
				() => andMultisetSeries(valid, new Map([['a', Number.NaN]])),
				TypeError,
			)
			assert.throws(
				() => andMultisetSeries(new Map([['a', 1n]]), valid),
				TypeError,
			)
			assert.throws(
				() => andMultisetSeries(valid, new Map([['a', null]])),
				TypeError,
			)
			assert.throws(
				() => andMultisetSeries(valid, new Map([['a', true]])),
				TypeError,
			)
		})

		test('throws RangeError for negative, fractional, non-finite, or unsafe integer multiplicities', () => {
			const valid = new Map([['a', 1]])

			assert.throws(
				() => andMultisetSeries(new Map([['a', -1]]), valid),
				RangeError,
			)
			assert.throws(
				() => andMultisetSeries(valid, new Map([['a', 1.5]])),
				RangeError,
			)
			assert.throws(
				() => andMultisetSeries(new Map([['a', Number.POSITIVE_INFINITY]]), valid),
				RangeError,
			)
			assert.throws(
				() => andMultisetSeries(valid, new Map([['a', Number.NEGATIVE_INFINITY]])),
				RangeError,
			)
			assert.throws(
				() => andMultisetSeries(new Map([['a', Number.MAX_SAFE_INTEGER + 1]]), valid),
				RangeError,
			)
		})

		test('validates all entries even on non-overlapping keys or when the other map is empty', () => {
			const empty = new Map()
			const badCount = new Map([['unshared', -3]])
			const badType = new Map([['unshared', 'oops']])

			assert.throws(() => andMultisetSeries(empty, badCount), RangeError)
			assert.throws(() => andMultisetSeries(badCount, empty), RangeError)
			assert.throws(() => andMultisetSeries(empty, badType), TypeError)
		})
	})

	describe('independent cross-checks & algebraic identities', () => {
		test('matches independent threshold/layer-cake indicator series across diverse multisets', () => {
			const universe = ['a', 'b', 'c', 'd', 'e', 'f']
			// Deterministic LCG for reproducible test pairs
			let seed = 1337
			const nextInt = (maxInclusive) => {
				seed = (seed * 1664525 + 1013904223) >>> 0
				return seed % (maxInclusive + 1)
			}

			for (let trial = 0; trial < 50; trial++) {
				const a = new Map()
				const b = new Map()
				for (const key of universe) {
					const ca = nextInt(15)
					const cb = nextInt(15)
					if (nextInt(3) > 0) a.set(key, ca)
					if (nextInt(3) > 0) b.set(key, cb)
				}

				const actual = andMultisetSeries(a, b)
				const expected = referenceAndViaIndicatorSeries(a, b)
				assert.deepEqual(actual, expected)
			}
		})

		test('satisfies inclusion-exclusion, commutativity, associativity, and crisp-set reduction', () => {
			const a = new Map([
				['x', 6],
				['y', 2],
				['z', 0],
				['u', 4],
			])
			const b = new Map([
				['x', 3],
				['y', 5],
				['v', 7],
			])
			const c = new Map([
				['x', 4],
				['y', 1],
				['v', 2],
			])

			// Commutativity: A ∧ B = B ∧ A
			assert.deepEqual(andMultisetSeries(a, b), andMultisetSeries(b, a))

			// Associativity: (A ∧ B) ∧ C = A ∧ (B ∧ C) = andMultisetSeries(A, B, C)
			const leftAssoc = andMultisetSeries(andMultisetSeries(a, b), c)
			const rightAssoc = andMultisetSeries(a, andMultisetSeries(b, c))
			const nAry = andMultisetSeries(a, b, c)
			assert.deepEqual(leftAssoc, rightAssoc)
			assert.deepEqual(nAry, leftAssoc)

			// Inclusion-exclusion: m_{A ∧ B}(k) + max(m_A(k), m_B(k)) = m_A(k) + m_B(k)
			const meet = andMultisetSeries(a, b)
			const allKeys = new Set([...a.keys(), ...b.keys()])
			for (const k of allKeys) {
				const ca = a.get(k) ?? 0
				const cb = b.get(k) ?? 0
				const cMeet = meet.get(k) ?? 0
				const cJoin = Math.max(ca, cb)
				assert.equal(cMeet + cJoin, ca + cb)
			}

			// Reduction to classical boolean set intersection when all counts ∈ {0, 1}
			const setA = new Map([
				['alpha', 1],
				['beta', 1],
				['gamma', 0],
			])
			const setB = new Map([
				['beta', 1],
				['gamma', 1],
				['delta', 1],
			])
			assert.deepEqual(andMultisetSeries(setA, setB), new Map([['beta', 1]]))
		})
	})
})
