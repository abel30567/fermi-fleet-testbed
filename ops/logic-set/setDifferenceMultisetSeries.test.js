import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { setDifferenceMultisetSeries } from './setDifferenceMultisetSeries.js'

/**
 * Independent helper: multiset intersection `A ∩ B` with m_{A ∩ B}(x) = min(m_A(x), m_B(x)).
 *
 * @template T
 * @param {Map<T, number>} a
 * @param {Map<T, number>} b
 * @returns {Map<T, number>}
 */
function multisetIntersection(a, b) {
	const out = new Map()
	for (const [key, countA] of a) {
		const countB = b.get(key) ?? 0
		const m = Math.min(countA, countB)
		if (m > 0) {
			out.set(key, m)
		}
	}
	return out
}

/**
 * Independent helper: multiset sum `X + Y` with m_{X + Y}(x) = m_X(x) + m_Y(x).
 *
 * @template T
 * @param {Map<T, number>} x
 * @param {Map<T, number>} y
 * @returns {Map<T, number>}
 */
function multisetSum(x, y) {
	const out = new Map()
	for (const [key, count] of x) {
		if (count > 0) out.set(key, count)
	}
	for (const [key, count] of y) {
		if (count > 0) out.set(key, (out.get(key) ?? 0) + count)
	}
	return out
}

/**
 * Strips explicit zero-count entries to canonical multiset form.
 *
 * @template T
 * @param {Map<T, number>} m
 * @returns {Map<T, number>}
 */
function canonicalize(m) {
	const out = new Map()
	for (const [key, count] of m) {
		if (count > 0) out.set(key, count)
	}
	return out
}

describe('setDifferenceMultisetSeries', () => {
	test('computes normal multiset difference with partial, full, and untouched counts', () => {
		const a = new Map([
			['apple', 5],
			['banana', 3],
			['cherry', 2],
			['date', 4],
		])
		const b = new Map([
			['apple', 2],
			['banana', 3],
			['cherry', 7],
			['elderberry', 6],
		])

		const diff = setDifferenceMultisetSeries(a, b)

		assert.deepEqual(
			diff,
			new Map([
				['apple', 3],
				['date', 4],
			]),
		)
		assert.equal(diff.has('banana'), false)
		assert.equal(diff.has('cherry'), false)
		assert.equal(diff.has('elderberry'), false)
	})

	test('does not mutate input maps', () => {
		const a = new Map([
			['x', 4],
			['y', 1],
		])
		const b = new Map([
			['x', 2],
			['z', 3],
		])

		const diff = setDifferenceMultisetSeries(a, b)

		assert.notEqual(diff, a)
		assert.notEqual(diff, b)
		assert.deepEqual(
			a,
			new Map([
				['x', 4],
				['y', 1],
			]),
		)
		assert.deepEqual(
			b,
			new Map([
				['x', 2],
				['z', 3],
			]),
		)
	})

	test('handles empty maps in all combinations', () => {
		const empty = new Map()
		const nonEmpty = new Map([
			['a', 2],
			['b', 5],
		])

		assert.deepEqual(setDifferenceMultisetSeries(empty, empty), new Map())
		assert.deepEqual(setDifferenceMultisetSeries(empty, nonEmpty), new Map())
		assert.deepEqual(setDifferenceMultisetSeries(nonEmpty, empty), nonEmpty)
	})

	test('satisfies A \\ A = ∅ (self-difference is empty)', () => {
		const a = new Map([
			['p', 1],
			['q', 100],
			['r', 0],
		])

		const diff = setDifferenceMultisetSeries(a, a)
		assert.equal(diff.size, 0)
		assert.deepEqual(diff, new Map())
	})

	test('returns canonical copy of A for disjoint multisets', () => {
		const a = new Map([
			['a', 3],
			['b', 0],
			['c', 7],
		])
		const b = new Map([
			['d', 2],
			['e', 9],
		])

		const diff = setDifferenceMultisetSeries(a, b)
		assert.deepEqual(
			diff,
			new Map([
				['a', 3],
				['c', 7],
			]),
		)
	})

	test('clamps m_B(x) > m_A(x) to 0 and omits zero counts from output', () => {
		const a = new Map([
			['low', 1],
			['zero', 0],
			['equal', 5],
			['high', 10],
		])
		const b = new Map([
			['low', 999],
			['zero', 4],
			['equal', 5],
			['high', 0],
		])

		const diff = setDifferenceMultisetSeries(a, b)
		assert.deepEqual(diff, new Map([['high', 10]]))
		assert.equal(diff.size, 1)
	})

	test('supports arbitrary Map key types and large safe integer counts without overflow', () => {
		const objKey = { id: 1 }
		const symKey = Symbol('k')
		const max = Number.MAX_SAFE_INTEGER

		const a = new Map([
			[objKey, max],
			[symKey, max],
			[NaN, 3],
			[null, 2],
			[undefined, 4],
			[42, 1],
		])
		const b = new Map([
			[objKey, 0],
			[symKey, 1],
			[NaN, 1],
			[null, 5],
			[undefined, 4],
		])

		const diff = setDifferenceMultisetSeries(a, b)
		assert.equal(diff.get(objKey), max)
		assert.equal(diff.get(symKey), max - 1)
		assert.equal(diff.get(NaN), 2)
		assert.equal(diff.has(null), false)
		assert.equal(diff.has(undefined), false)
		assert.equal(diff.get(42), 1)
		assert.equal(diff.size, 4)
	})

	test('accepts -0 as zero count and omits it from output', () => {
		const a = new Map([
			['a', -0],
			['b', 3],
		])
		const b = new Map([['b', -0]])

		const diff = setDifferenceMultisetSeries(a, b)
		assert.deepEqual(diff, new Map([['b', 3]]))
		assert.equal(diff.has('a'), false)
	})

	test('validates inputs and throws on non-Map arguments or invalid counts', () => {
		const valid = new Map([['a', 1]])

		// Non-Map arguments
		assert.throws(() => setDifferenceMultisetSeries(null, valid), TypeError)
		assert.throws(() => setDifferenceMultisetSeries(valid, null), TypeError)
		assert.throws(() => setDifferenceMultisetSeries(undefined, valid), TypeError)
		assert.throws(() => setDifferenceMultisetSeries({}, valid), TypeError)
		assert.throws(() => setDifferenceMultisetSeries(valid, new Set(['a'])), TypeError)
		assert.throws(() => setDifferenceMultisetSeries([['a', 1]], valid), TypeError)

		// Non-number counts in a or b (including keys in b not present in a)
		assert.throws(
			() => setDifferenceMultisetSeries(new Map([['a', '2']]), valid),
			TypeError,
		)
		assert.throws(
			() => setDifferenceMultisetSeries(valid, new Map([['other', 2n]])),
			TypeError,
		)
		assert.throws(
			() => setDifferenceMultisetSeries(valid, new Map([['other', null]])),
			TypeError,
		)

		// Negative, fractional, non-finite, or unsafe integer counts
		assert.throws(
			() => setDifferenceMultisetSeries(new Map([['a', -1]]), valid),
			RangeError,
		)
		assert.throws(
			() => setDifferenceMultisetSeries(valid, new Map([['unseen', -3]])),
			RangeError,
		)
		assert.throws(
			() => setDifferenceMultisetSeries(new Map([['a', 1.5]]), valid),
			RangeError,
		)
		assert.throws(
			() => setDifferenceMultisetSeries(valid, new Map([['a', NaN]])),
			RangeError,
		)
		assert.throws(
			() => setDifferenceMultisetSeries(new Map([['a', Infinity]]), valid),
			RangeError,
		)
		assert.throws(
			() =>
				setDifferenceMultisetSeries(
					new Map([['a', Number.MAX_SAFE_INTEGER + 1]]),
					valid,
				),
			RangeError,
		)
	})

	test('cross-check identity: (A \\ B) + (A ∩ B) = A (exact multiplicity conservation)', () => {
		const cases = [
			[
				new Map([
					['a', 0],
					['b', 1],
					['c', 5],
					['d', 12],
					['e', 3],
				]),
				new Map([
					['a', 2],
					['b', 1],
					['c', 8],
					['d', 4],
					['f', 9],
				]),
			],
			[
				new Map([
					[1, 100],
					[2, 50],
					[3, 25],
				]),
				new Map([
					[1, 100],
					[2, 51],
					[3, 0],
					[4, 7],
				]),
			],
			[
				new Map([
					['big', Number.MAX_SAFE_INTEGER],
					['mid', 123456789],
				]),
				new Map([
					['big', 987654321],
					['mid', 123456789],
				]),
			],
		]

		for (const [a, b] of cases) {
			const diff = setDifferenceMultisetSeries(a, b)
			const inter = multisetIntersection(a, b)
			const reconstructed = multisetSum(diff, inter)

			assert.deepEqual(reconstructed, canonicalize(a))
		}
	})

	test('property cross-check: deterministic pseudorandom multisets conserve multiplicity', () => {
		let seed = 0x5f3759df
		const nextInt = (maxExclusive) => {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
			return seed % maxExclusive
		}

		const universe = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7']

		for (let trial = 0; trial < 50; trial++) {
			const a = new Map()
			const b = new Map()
			for (const k of universe) {
				if (nextInt(4) !== 0) a.set(k, nextInt(15))
				if (nextInt(4) !== 0) b.set(k, nextInt(15))
			}

			const diff = setDifferenceMultisetSeries(a, b)
			const inter = multisetIntersection(a, b)

			// Identity: (A \ B) + (A ∩ B) = A
			assert.deepEqual(multisetSum(diff, inter), canonicalize(a))

			// Verify no zero counts leak into diff and direct formula matches max(0, m_A - m_B)
			for (const [k, v] of diff) {
				assert.ok(v > 0)
				assert.equal(v, Math.max(0, (a.get(k) ?? 0) - (b.get(k) ?? 0)))
			}
			for (const k of universe) {
				const expected = Math.max(0, (a.get(k) ?? 0) - (b.get(k) ?? 0))
				assert.equal(diff.get(k) ?? 0, expected)
			}
		}
	})
})
