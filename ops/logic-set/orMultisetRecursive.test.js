import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { orMultisetRecursive } from './orMultisetRecursive.js'

/**
 * Independent iterative reference implementation of multiset OR (maximum multiplicity).
 *
 * @template T
 * @param {...Map<T, number>} multisets
 * @returns {Map<T, number>}
 */
function orMultisetIterativeRef(...multisets) {
	const out = new Map()
	for (const ms of multisets) {
		for (const [k, c] of ms) {
			if (c > 0) {
				const prev = out.get(k) ?? 0
				if (c > prev) {
					out.set(k, c)
				}
			}
		}
	}
	return out
}

/**
 * Asserts two multisets have identical keys and multiplicities regardless of insertion order.
 *
 * @template T
 * @param {Map<T, number>} actual
 * @param {Map<T, number>} expected
 */
function assertMultisetEqual(actual, expected) {
	assert.ok(actual instanceof Map, 'result must be a Map')
	assert.equal(actual.size, expected.size, `expected size ${expected.size}, got ${actual.size}`)
	for (const [key, count] of expected.entries()) {
		assert.ok(actual.has(key), `missing key ${String(key)}`)
		assert.equal(actual.get(key), count, `mismatch for key ${String(key)}`)
	}
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property and cross-check tests.
 *
 * @param {number} seed
 * @returns {() => number}
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

describe('orMultisetRecursive', () => {
	test('computes pointwise maximum multiplicity for two overlapping multisets', () => {
		const a = new Map([
			['a', 2],
			['b', 1],
			['c', 4]
		])
		const b = new Map([
			['a', 1],
			['b', 5],
			['d', 3]
		])
		const res = orMultisetRecursive(a, b)
		assertMultisetEqual(
			res,
			new Map([
				['a', 2],
				['b', 5],
				['c', 4],
				['d', 3]
			])
		)
	})

	test('supports variadic inputs (3+ multisets)', () => {
		const m1 = new Map([['x', 1], ['y', 4]])
		const m2 = new Map([['y', 2], ['z', 3]])
		const m3 = new Map([['x', 5], ['w', 1]])
		const m4 = new Map([['z', 7], ['y', 4]])
		const m5 = new Map([['v', 2]])

		const res = orMultisetRecursive(m1, m2, m3, m4, m5)
		assertMultisetEqual(
			res,
			new Map([
				['x', 5],
				['y', 4],
				['z', 7],
				['w', 1],
				['v', 2]
			])
		)
	})

	test('handles zero and single arguments', () => {
		assertMultisetEqual(orMultisetRecursive(), new Map())

		const single = new Map([
			['a', 3],
			['zero', 0],
			['b', 1]
		])
		const res = orMultisetRecursive(single)
		assertMultisetEqual(
			res,
			new Map([
				['a', 3],
				['b', 1]
			])
		)
		assert.notEqual(res, single, 'should return a new Map instance')
	})

	test('handles empty maps and identity behavior', () => {
		const empty1 = new Map()
		const empty2 = new Map()
		const nonEmpty = new Map([
			['k1', 2],
			['k2', 9]
		])

		assertMultisetEqual(orMultisetRecursive(empty1, empty2), new Map())
		assertMultisetEqual(orMultisetRecursive(empty1, nonEmpty), nonEmpty)
		assertMultisetEqual(orMultisetRecursive(nonEmpty, empty1), nonEmpty)
	})

	test('handles disjoint maps', () => {
		const a = new Map([
			[1, 2],
			[2, 3]
		])
		const b = new Map([
			[3, 4],
			[4, 5]
		])
		assertMultisetEqual(
			orMultisetRecursive(a, b),
			new Map([
				[1, 2],
				[2, 3],
				[3, 4],
				[4, 5]
			])
		)
	})

	test('omits zero-count entries even when present in both maps', () => {
		const a = new Map([
			['onlyZero', 0],
			['zeroVsPos', 0],
			['posVsZero', 3],
			['negZero', -0]
		])
		const b = new Map([
			['onlyZero', 0],
			['zeroVsPos', 2],
			['posVsZero', 0],
			['alsoZero', 0]
		])
		const res = orMultisetRecursive(a, b)
		assertMultisetEqual(
			res,
			new Map([
				['zeroVsPos', 2],
				['posVsZero', 3]
			])
		)
		assert.equal(res.has('onlyZero'), false)
		assert.equal(res.has('alsoZero'), false)
		assert.equal(res.has('negZero'), false)
	})

	test('handles identical maps and does not mutate inputs', () => {
		const a = new Map([
			['p', 4],
			['q', 0],
			['r', 2]
		])
		const b = new Map([
			['p', 4],
			['q', 0],
			['r', 2]
		])
		const res = orMultisetRecursive(a, b)
		assertMultisetEqual(
			res,
			new Map([
				['p', 4],
				['r', 2]
			])
		)
		assert.equal(a.size, 3)
		assert.equal(a.get('q'), 0)
		assert.equal(b.size, 3)
		assert.notEqual(res, a)
		assert.notEqual(res, b)
	})

	test('supports arbitrary Map key types (objects, symbols, NaN, null, undefined)', () => {
		const objKey = { id: 1 }
		const symKey = Symbol('s')
		const a = new Map([
			[objKey, 2],
			[symKey, 5],
			[NaN, 1],
			[null, 3],
			[undefined, 0]
		])
		const b = new Map([
			[objKey, 4],
			[symKey, 2],
			[NaN, 6],
			[null, 1],
			[undefined, 2]
		])
		const res = orMultisetRecursive(a, b)
		assertMultisetEqual(
			res,
			new Map([
				[objKey, 4],
				[symKey, 5],
				[NaN, 6],
				[null, 3],
				[undefined, 2]
			])
		)
	})

	test('handles large multisets without overflowing the call stack', () => {
		const a = new Map()
		const b = new Map()
		for (let i = 0; i < 20000; i++) {
			a.set(i, i % 5)
			b.set(i + 10000, (i * 3) % 7)
		}
		const actual = orMultisetRecursive(a, b)
		const expected = orMultisetIterativeRef(a, b)
		assertMultisetEqual(actual, expected)
	})

	test('rejects non-Map arguments with TypeError', () => {
		const valid = new Map([['a', 1]])
		const invalidInputs = [null, undefined, {}, [], new Set(['a']), 'map', 123, true]
		for (const bad of invalidInputs) {
			assert.throws(() => orMultisetRecursive(bad), TypeError)
			assert.throws(() => orMultisetRecursive(valid, bad), TypeError)
			assert.throws(() => orMultisetRecursive(bad, valid), TypeError)
		}
	})

	test('rejects invalid counts with TypeError or RangeError', () => {
		const nonNumericCounts = ['1', null, undefined, true, 1n, {}, []]
		for (const count of nonNumericCounts) {
			assert.throws(() => orMultisetRecursive(new Map([['a', count]])), TypeError)
		}

		const badNumericCounts = [-1, -100, 1.5, -0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]
		for (const count of badNumericCounts) {
			assert.throws(() => orMultisetRecursive(new Map([['a', count]])), RangeError)
		}

		// Ensure later arguments are validated even when earlier arguments are empty
		assert.throws(
			() => orMultisetRecursive(new Map(), new Map([['bad', -2]])),
			RangeError
		)
	})

	test('matches iterative reference across randomized inputs and satisfies algebraic laws', () => {
		const rng = createRng(0x5eed1234)
		const alphabet = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']

		const randomMultiset = () => {
			const m = new Map()
			const size = Math.floor(rng() * 12)
			for (let i = 0; i < size; i++) {
				const key = alphabet[Math.floor(rng() * alphabet.length)]
				const count = Math.floor(rng() * 8) // includes 0
				m.set(key, count)
			}
			return m
		}

		for (let trial = 0; trial < 100; trial++) {
			const a = randomMultiset()
			const b = randomMultiset()
			const c = randomMultiset()

			// Cross-check against independent iterative reference
			assertMultisetEqual(orMultisetRecursive(a, b), orMultisetIterativeRef(a, b))
			assertMultisetEqual(orMultisetRecursive(a, b, c), orMultisetIterativeRef(a, b, c))

			// Commutativity: a OR b === b OR a
			assertMultisetEqual(orMultisetRecursive(a, b), orMultisetRecursive(b, a))

			// Associativity: (a OR b) OR c === a OR (b OR c) === OR(a, b, c)
			const leftAssoc = orMultisetRecursive(orMultisetRecursive(a, b), c)
			const rightAssoc = orMultisetRecursive(a, orMultisetRecursive(b, c))
			const variadic = orMultisetRecursive(a, b, c)
			assertMultisetEqual(leftAssoc, rightAssoc)
			assertMultisetEqual(leftAssoc, variadic)

			// Idempotence: a OR a === normalize(a)
			assertMultisetEqual(orMultisetRecursive(a, a), orMultisetRecursive(a))

			// Identity: a OR ∅ === normalize(a)
			assertMultisetEqual(orMultisetRecursive(a, new Map()), orMultisetRecursive(a))
		}
	})
})
