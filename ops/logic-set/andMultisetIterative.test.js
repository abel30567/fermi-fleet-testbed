import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { andMultisetIterative } from './andMultisetIterative.js'

/**
 * Independent reference implementation of multiset AND using expanded element bags.
 * Expands each multiset into a flat list of elements, consumes matching elements
 * one-for-one, and tallies the survivors back into a Map.
 *
 * @template T
 * @param {Map<T, number>} a
 * @param {Map<T, number>} b
 * @returns {Map<T, number>}
 */
function referenceAndViaBagExpansion(a, b) {
	const bagA = []
	for (const [value, count] of a) {
		for (let i = 0; i < count; i++) {
			bagA.push(value)
		}
	}

	const bagB = []
	for (const [value, count] of b) {
		for (let i = 0; i < count; i++) {
			bagB.push(value)
		}
	}

	const usedB = new Array(bagB.length).fill(false)
	const intersectionBag = []
	for (const item of bagA) {
		for (let j = 0; j < bagB.length; j++) {
			if (!usedB[j] && Object.is(item, bagB[j])) {
				usedB[j] = true
				intersectionBag.push(item)
				break
			}
		}
	}

	const out = new Map()
	for (const item of intersectionBag) {
		out.set(item, (out.get(item) ?? 0) + 1)
	}
	return out
}

/**
 * Compares two multisets for equality independent of Map insertion order.
 *
 * @param {Map<unknown, number>} actual
 * @param {Map<unknown, number>} expected
 */
function assertMultisetEqual(actual, expected) {
	assert.ok(actual instanceof Map)
	assert.equal(actual.size, expected.size)
	for (const [key, count] of expected) {
		assert.equal(actual.has(key), true, `missing expected key ${String(key)}`)
		assert.equal(actual.get(key), count)
	}
}

describe('andMultisetIterative', () => {
	describe('normal cases', () => {
		it('computes pointwise minimum for overlapping multisets', () => {
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

			const result = andMultisetIterative(a, b)
			assert.deepEqual(
				result,
				new Map([
					['apple', 1],
					['banana', 2],
				]),
			)
		})

		it('returns an empty Map for disjoint multisets', () => {
			const a = new Map([
				['x', 2],
				['y', 3],
			])
			const b = new Map([
				['z', 1],
				['w', 4],
			])

			assert.deepEqual(andMultisetIterative(a, b), new Map())
		})

		it('matches classical set intersection when counts are 1', () => {
			const a = new Map([
				[1, 1],
				[2, 1],
				[3, 1],
			])
			const b = new Map([
				[2, 1],
				[3, 1],
				[4, 1],
			])

			assert.deepEqual(
				andMultisetIterative(a, b),
				new Map([
					[2, 1],
					[3, 1],
				]),
			)
		})

		it('supports diverse Map key types including NaN, symbols, null, undefined, and objects', () => {
			const sym = Symbol('k')
			const objShared = { id: 1 }
			const objOnlyA = { id: 2 }

			const a = new Map([
				[NaN, 3],
				[sym, 2],
				[null, 4],
				[undefined, 1],
				[objShared, 5],
				[objOnlyA, 2],
				[true, 2],
			])
			const b = new Map([
				[NaN, 2],
				[sym, 5],
				[null, 1],
				[undefined, 3],
				[objShared, 2],
				[true, 2],
			])

			const result = andMultisetIterative(a, b)
			assert.deepEqual(
				result,
				new Map([
					[NaN, 2],
					[sym, 2],
					[null, 1],
					[undefined, 1],
					[objShared, 2],
					[true, 2],
				]),
			)
		})

		it('does not mutate either input Map and returns a new Map instance', () => {
			const a = new Map([
				['a', 2],
				['b', 3],
			])
			const b = new Map([
				['a', 5],
				['b', 1],
			])

			const result = andMultisetIterative(a, b)
			assert.notEqual(result, a)
			assert.notEqual(result, b)
			assert.deepEqual(
				a,
				new Map([
					['a', 2],
					['b', 3],
				]),
			)
			assert.deepEqual(
				b,
				new Map([
					['a', 5],
					['b', 1],
				]),
			)
		})
	})

	describe('edge cases', () => {
		it('handles empty Maps', () => {
			const empty = new Map()
			const nonEmpty = new Map([['a', 3]])

			assert.deepEqual(andMultisetIterative(empty, empty), new Map())
			assert.deepEqual(andMultisetIterative(empty, nonEmpty), new Map())
			assert.deepEqual(andMultisetIterative(nonEmpty, empty), new Map())
		})

		it('omits keys whose count is 0 or -0 in either input', () => {
			const a = new Map([
				['a', 0],
				['b', 3],
				['c', -0],
				['d', 2],
			])
			const b = new Map([
				['a', 4],
				['b', 0],
				['c', 5],
				['d', 2],
			])

			const result = andMultisetIterative(a, b)
			assert.deepEqual(result, new Map([['d', 2]]))
			assert.equal(result.has('a'), false)
			assert.equal(result.has('b'), false)
			assert.equal(result.has('c'), false)
		})

		it('handles Number.MAX_SAFE_INTEGER counts accurately', () => {
			const max = Number.MAX_SAFE_INTEGER
			const a = new Map([
				['big', max],
				['pair', max - 1],
			])
			const b = new Map([
				['big', max],
				['pair', max],
			])

			assert.deepEqual(
				andMultisetIterative(a, b),
				new Map([
					['big', max],
					['pair', max - 1],
				]),
			)
		})

		it('handles aliasing when the same Map instance is passed for both arguments', () => {
			const m = new Map([
				['x', 0],
				['y', 4],
			])
			const result = andMultisetIterative(m, m)

			assert.notEqual(result, m)
			assert.deepEqual(result, new Map([['y', 4]]))
		})

		it('handles larger multisets efficiently', () => {
			const a = new Map()
			const b = new Map()
			for (let i = 0; i < 2000; i++) {
				a.set(`k${i}`, (i % 7) + 1)
				if (i % 2 === 0) {
					b.set(`k${i}`, (i % 5) + 1)
				}
			}

			const result = andMultisetIterative(a, b)
			assert.equal(result.size, 1000)
			for (let i = 0; i < 2000; i += 2) {
				assert.equal(result.get(`k${i}`), Math.min((i % 7) + 1, (i % 5) + 1))
			}
		})
	})

	describe('input validation', () => {
		it('throws TypeError when a or b is not a Map', () => {
			const valid = new Map([['a', 1]])
			const invalidInputs = [null, undefined, {}, [], new Set(['a']), 'abc', 42]

			for (const bad of invalidInputs) {
				assert.throws(() => andMultisetIterative(bad, valid), TypeError)
				assert.throws(() => andMultisetIterative(valid, bad), TypeError)
			}
		})

		it('throws TypeError when any count is not a number', () => {
			const valid = new Map([['a', 1]])
			const badCounts = ['1', null, undefined, true, 1n, {}]

			for (const badCount of badCounts) {
				const badMap = new Map([['a', badCount]])
				assert.throws(() => andMultisetIterative(badMap, valid), TypeError)
				assert.throws(() => andMultisetIterative(valid, badMap), TypeError)
			}
		})

		it('throws RangeError for negative, non-integer, non-finite, or unsafe integer counts', () => {
			const valid = new Map([['a', 1]])
			const badCounts = [
				-1,
				-100,
				0.5,
				2.75,
				NaN,
				Infinity,
				-Infinity,
				Number.MAX_SAFE_INTEGER + 1,
				1e20,
			]

			for (const badCount of badCounts) {
				const badMap = new Map([['a', badCount]])
				assert.throws(() => andMultisetIterative(badMap, valid), RangeError)
				assert.throws(() => andMultisetIterative(valid, badMap), RangeError)
			}
		})

		it('validates all entries in both Maps even when one Map is empty or keys do not overlap', () => {
			const empty = new Map()
			const disjointValid = new Map([['ok', 2]])
			const malformed = new Map([['bad', -3]])
			const nullProtoKeyMalformed = new Map([[Object.create(null), -1]])

			assert.throws(() => andMultisetIterative(empty, malformed), RangeError)
			assert.throws(() => andMultisetIterative(malformed, empty), RangeError)
			assert.throws(() => andMultisetIterative(disjointValid, malformed), RangeError)
			assert.throws(() => andMultisetIterative(malformed, disjointValid), RangeError)
			assert.throws(() => andMultisetIterative(nullProtoKeyMalformed, empty), RangeError)
		})
	})

	describe('independent cross-checks and algebraic laws', () => {
		it('agrees with expanded-bag reference implementation across deterministic fuzz cases', () => {
			const alphabet = ['a', 'b', 'c', 'd', 'e', 'f']
			let seed = 1337
			const nextInt = (maxExclusive) => {
				seed = (seed * 1103515245 + 12345) & 0x7fffffff
				return seed % maxExclusive
			}

			for (let trial = 0; trial < 50; trial++) {
				const a = new Map()
				const b = new Map()
				for (const ch of alphabet) {
					if (nextInt(3) !== 0) {
						a.set(ch, nextInt(6))
					}
					if (nextInt(3) !== 0) {
						b.set(ch, nextInt(6))
					}
				}

				const actual = andMultisetIterative(a, b)
				const expected = referenceAndViaBagExpansion(a, b)
				assertMultisetEqual(actual, expected)
			}
		})

		it('satisfies commutativity, associativity, and idempotence', () => {
			const a = new Map([
				['p', 4],
				['q', 2],
				['r', 0],
				['s', 5],
			])
			const b = new Map([
				['p', 2],
				['q', 7],
				['t', 3],
			])
			const c = new Map([
				['p', 3],
				['q', 1],
				['s', 5],
			])

			// Commutativity: A AND B === B AND A
			assertMultisetEqual(andMultisetIterative(a, b), andMultisetIterative(b, a))

			// Associativity: (A AND B) AND C === A AND (B AND C)
			assertMultisetEqual(
				andMultisetIterative(andMultisetIterative(a, b), c),
				andMultisetIterative(a, andMultisetIterative(b, c)),
			)

			// Idempotence: A AND A === normalized(A)
			const normalizedA = new Map([
				['p', 4],
				['q', 2],
				['s', 5],
			])
			assertMultisetEqual(andMultisetIterative(a, a), normalizedA)
		})
	})
})
