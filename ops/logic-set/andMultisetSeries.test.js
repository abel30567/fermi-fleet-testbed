import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { andMultisetSeries } from './andMultisetSeries.js'

/**
 * Independent reference implementation via explicit array expansion and
 * element-by-element multiset intersection.
 *
 * @template K
 * @param {Map<K, number>} a
 * @param {Map<K, number>} b
 * @returns {Map<K, number>}
 */
function arrayExpansionAnd(a, b) {
	const expandedA = []
	for (const [key, count] of a.entries()) {
		for (let i = 0; i < count; i++) {
			expandedA.push(key)
		}
	}

	const poolB = []
	for (const [key, count] of b.entries()) {
		for (let i = 0; i < count; i++) {
			poolB.push(key)
		}
	}

	const matched = []
	for (const item of expandedA) {
		const idx = poolB.findIndex((candidate) => Object.is(candidate, item))
		if (idx !== -1) {
			matched.push(item)
			poolB.splice(idx, 1)
		}
	}

	const result = new Map()
	for (const item of matched) {
		result.set(item, (result.get(item) ?? 0) + 1)
	}
	return result
}

/**
 * Computes multiset logical OR (join / max multiplicity) for identity checks.
 *
 * @template K
 * @param {Map<K, number>} a
 * @param {Map<K, number>} b
 * @returns {Map<K, number>}
 */
function multisetOr(a, b) {
	const result = new Map()
	const keys = new Set([...a.keys(), ...b.keys()])
	for (const key of keys) {
		const maxCount = Math.max(a.get(key) ?? 0, b.get(key) ?? 0)
		if (maxCount > 0) {
			result.set(key, maxCount)
		}
	}
	return result
}

/**
 * Computes total cardinality (sum of multiplicities) of a multiset.
 *
 * @param {Map<unknown, number>} m
 * @returns {number}
 */
function cardinality(m) {
	let total = 0
	for (const count of m.values()) {
		total += count
	}
	return total
}

describe('andMultisetSeries', () => {
	describe('normal cases', () => {
		it('computes pairwise multiset intersection counts', () => {
			const a = new Map([
				['a', 3],
				['b', 2],
				['c', 5]
			])
			const b = new Map([
				['a', 1],
				['b', 4],
				['d', 2]
			])

			const res = andMultisetSeries(a, b)
			assert.deepStrictEqual(
				res,
				new Map([
					['a', 1],
					['b', 2]
				])
			)
		})

		it('supports variadic series of 3+ multisets via associative fold', () => {
			const m1 = new Map([
				['x', 5],
				['y', 3],
				['z', 1]
			])
			const m2 = new Map([
				['x', 2],
				['y', 4],
				['z', 2]
			])
			const m3 = new Map([
				['x', 7],
				['y', 1],
				['w', 9]
			])

			const res = andMultisetSeries(m1, m2, m3)
			assert.deepStrictEqual(
				res,
				new Map([
					['x', 2],
					['y', 1]
				])
			)

			// Associativity check: (m1 ∧ m2) ∧ m3 === m1 ∧ (m2 ∧ m3)
			const left = andMultisetSeries(andMultisetSeries(m1, m2), m3)
			const right = andMultisetSeries(m1, andMultisetSeries(m2, m3))
			assert.deepStrictEqual(res, left)
			assert.deepStrictEqual(left, right)
		})

		it('supports single multiset input by returning a normalized copy without mutation', () => {
			const original = new Map([
				['a', 2],
				['b', 0],
				['c', 5]
			])
			const res = andMultisetSeries(original)

			assert.notStrictEqual(res, original)
			assert.deepStrictEqual(
				res,
				new Map([
					['a', 2],
					['c', 5]
				])
			)
			// Ensure original map was not mutated
			assert.strictEqual(original.get('b'), 0)
			assert.strictEqual(original.size, 3)
		})

		it('does not mutate any input maps', () => {
			const a = new Map([
				['k', 4],
				['m', 2]
			])
			const b = new Map([
				['k', 1],
				['n', 3]
			])
			const snapshotA = new Map(a)
			const snapshotB = new Map(b)

			const res = andMultisetSeries(a, b)
			assert.deepStrictEqual(a, snapshotA)
			assert.deepStrictEqual(b, snapshotB)
			res.set('k', 999)
			assert.strictEqual(a.get('k'), 4)
			assert.strictEqual(b.get('k'), 1)
		})
	})

	describe('edge cases', () => {
		it('handles empty maps', () => {
			const empty = new Map()
			const nonEmpty = new Map([
				['a', 2],
				['b', 3]
			])

			assert.deepStrictEqual(andMultisetSeries(empty, empty), new Map())
			assert.deepStrictEqual(andMultisetSeries(empty, nonEmpty), new Map())
			assert.deepStrictEqual(andMultisetSeries(nonEmpty, empty), new Map())
			assert.deepStrictEqual(
				andMultisetSeries(nonEmpty, empty, nonEmpty),
				new Map()
			)
		})

		it('handles disjoint multisets', () => {
			const a = new Map([
				['a', 2],
				['b', 5]
			])
			const b = new Map([
				['c', 1],
				['d', 3]
			])

			assert.deepStrictEqual(andMultisetSeries(a, b), new Map())
		})

		it('omits zero counts (including -0) from output', () => {
			const a = new Map([
				['a', 0],
				['b', 3],
				['c', -0],
				['d', 2]
			])
			const b = new Map([
				['a', 5],
				['b', 0],
				['c', 4],
				['d', 2]
			])

			const res = andMultisetSeries(a, b)
			assert.deepStrictEqual(res, new Map([['d', 2]]))
			assert.strictEqual(res.has('a'), false)
			assert.strictEqual(res.has('b'), false)
			assert.strictEqual(res.has('c'), false)
		})

		it('is idempotent on identical multisets', () => {
			const a = new Map([
				['p', 1],
				['q', 4],
				['r', 0]
			])
			const expected = new Map([
				['p', 1],
				['q', 4]
			])

			assert.deepStrictEqual(andMultisetSeries(a, a), expected)
			assert.deepStrictEqual(andMultisetSeries(a, new Map(a)), expected)
		})

		it('handles non-string keys (numbers, objects, symbols, booleans, null, NaN)', () => {
			const obj1 = { id: 1 }
			const obj2 = { id: 2 }
			const sym = Symbol('tag')

			const a = new Map([
				[42, 3],
				[obj1, 2],
				[obj2, 5],
				[sym, 4],
				[true, 2],
				[null, 3],
				[Number.NaN, 2]
			])
			const b = new Map([
				[42, 5],
				[obj1, 1],
				[{ id: 2 }, 5], // distinct object identity from obj2
				[sym, 2],
				[true, 6],
				[null, 1],
				[Number.NaN, 4]
			])

			const res = andMultisetSeries(a, b)
			assert.deepStrictEqual(
				res,
				new Map([
					[42, 3],
					[obj1, 1],
					[sym, 2],
					[true, 2],
					[null, 1],
					[Number.NaN, 2]
				])
			)
			assert.strictEqual(res.has(obj2), false)
		})

		it('preserves exact precision near Number.MAX_SAFE_INTEGER without overflow', () => {
			const max = Number.MAX_SAFE_INTEGER
			const nearMax = max - 3

			const a = new Map([
				['big1', max],
				['big2', nearMax]
			])
			const b = new Map([
				['big1', nearMax],
				['big2', max]
			])

			const res = andMultisetSeries(a, b)
			assert.deepStrictEqual(
				res,
				new Map([
					['big1', nearMax],
					['big2', nearMax]
				])
			)
		})
	})

	describe('validation and invalid inputs', () => {
		it('throws TypeError when called with no arguments', () => {
			assert.throws(() => andMultisetSeries(), TypeError)
		})

		it('throws TypeError for non-Map inputs even when an earlier Map is empty', () => {
			assert.throws(() => andMultisetSeries(null), TypeError)
			assert.throws(() => andMultisetSeries(undefined), TypeError)
			assert.throws(() => andMultisetSeries({ a: 1 }), TypeError)
			assert.throws(() => andMultisetSeries([['a', 1]]), TypeError)
			assert.throws(() => andMultisetSeries(new Set(['a'])), TypeError)
			assert.throws(
				() => andMultisetSeries(new Map(), { a: 1 }),
				TypeError
			)
		})

		it('throws TypeError for non-number counts', () => {
			assert.throws(
				() => andMultisetSeries(new Map([['a', '2']]), new Map()),
				TypeError
			)
			assert.throws(
				() => andMultisetSeries(new Map(), new Map([['a', 2n]])),
				TypeError
			)
			assert.throws(
				() => andMultisetSeries(new Map([['a', null]])),
				TypeError
			)
			assert.throws(
				() => andMultisetSeries(new Map([['a', undefined]])),
				TypeError
			)
		})

		it('throws RangeError for negative, fractional, non-finite, or unsafe integer counts', () => {
			assert.throws(
				() => andMultisetSeries(new Map([['a', -1]]), new Map()),
				RangeError
			)
			assert.throws(
				() => andMultisetSeries(new Map([['a', 1.5]]), new Map()),
				RangeError
			)
			assert.throws(
				() => andMultisetSeries(new Map([['a', Number.NaN]]), new Map()),
				RangeError
			)
			assert.throws(
				() =>
					andMultisetSeries(
						new Map([['a', Number.POSITIVE_INFINITY]]),
						new Map()
					),
				RangeError
			)
			assert.throws(
				() =>
					andMultisetSeries(
						new Map([['a', Number.NEGATIVE_INFINITY]]),
						new Map()
					),
				RangeError
			)
			assert.throws(
				() =>
					andMultisetSeries(
						new Map([['a', Number.MAX_SAFE_INTEGER + 1]]),
						new Map()
					),
				RangeError
			)
		})
	})

	describe('cross-checks and algebraic identities', () => {
		it('matches independent array-expansion multiset intersection across varied inputs', () => {
			const obj = { tag: 'obj' }
			const pairs = [
				[
					new Map([
						['a', 4],
						['b', 2],
						['c', 0],
						['d', 3]
					]),
					new Map([
						['a', 2],
						['b', 5],
						['c', 3],
						['e', 1]
					])
				],
				[
					new Map([
						[1, 3],
						[2, 1],
						[obj, 4]
					]),
					new Map([
						[1, 3],
						[3, 2],
						[obj, 2]
					])
				],
				[new Map(), new Map([['x', 5]])]
			]

			for (const [a, b] of pairs) {
				const actual = andMultisetSeries(a, b)
				const expected = arrayExpansionAnd(a, b)
				assert.deepStrictEqual(actual, expected)
				// Commutativity: A ∧ B === B ∧ A
				assert.deepStrictEqual(andMultisetSeries(b, a), expected)
			}
		})

		it('satisfies multiset inclusion-exclusion identity |A AND B| + |A OR B| = |A| + |B|', () => {
			const cases = [
				[
					new Map([
						['a', 3],
						['b', 7],
						['c', 2]
					]),
					new Map([
						['a', 5],
						['b', 2],
						['d', 4]
					])
				],
				[
					new Map([
						['x', 0],
						['y', 6]
					]),
					new Map([
						['x', 4],
						['y', 0],
						['z', 3]
					])
				],
				[
					new Map([
						[10, 12],
						[20, 8]
					]),
					new Map([
						[10, 12],
						[20, 8]
					])
				]
			]

			for (const [a, b] of cases) {
				const andRes = andMultisetSeries(a, b)
				const orRes = multisetOr(a, b)

				assert.strictEqual(
					cardinality(andRes) + cardinality(orRes),
					cardinality(a) + cardinality(b)
				)

				// Pointwise identity: (A ∧ B)(x) + (A ∨ B)(x) = A(x) + B(x)
				const keys = new Set([...a.keys(), ...b.keys()])
				for (const key of keys) {
					assert.strictEqual(
						(andRes.get(key) ?? 0) + (orRes.get(key) ?? 0),
						(a.get(key) ?? 0) + (b.get(key) ?? 0)
					)
				}
			}
		})

		it('satisfies De Morgan law over a bounding universe U: U - (A AND B) = (U - A) OR (U - B)', () => {
			const universe = new Map([
				['a', 10],
				['b', 10],
				['c', 10],
				['d', 10]
			])
			const a = new Map([
				['a', 3],
				['b', 8],
				['c', 0]
			])
			const b = new Map([
				['a', 6],
				['b', 2],
				['d', 5]
			])

			const complement = (m) => {
				const res = new Map()
				for (const [key, uCount] of universe.entries()) {
					const diff = uCount - (m.get(key) ?? 0)
					if (diff > 0) {
						res.set(key, diff)
					}
				}
				return res
			}

			const lhs = complement(andMultisetSeries(a, b))
			const rhs = multisetOr(complement(a), complement(b))
			assert.deepStrictEqual(lhs, rhs)
		})
	})
})
