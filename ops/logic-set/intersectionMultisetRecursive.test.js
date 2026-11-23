import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { intersectionMultisetRecursive } from './intersectionMultisetRecursive.js'

/**
 * Independent iterative reference implementation for cross-checking.
 * Computes exact multiset intersection across all provided Maps.
 *
 * @template T
 * @param {...Map<T, number>} maps
 * @returns {Map<T, number>}
 */
function referenceIterativeIntersection(...maps) {
	const result = new Map()
	const [first, ...rest] = maps
	for (const [key, firstCount] of first.entries()) {
		if (firstCount <= 0) continue
		let minCount = firstCount
		let presentInAll = true
		for (const m of rest) {
			if (!m.has(key)) {
				presentInAll = false
				break
			}
			const c = m.get(key)
			if (c <= 0) {
				presentInAll = false
				break
			}
			if (c < minCount) {
				minCount = c
			}
		}
		if (presentInAll && minCount > 0) {
			result.set(key, minCount)
		}
	}
	return result
}

/**
 * Asserts two multisets have identical keys and multiplicities regardless of insertion order.
 */
function assertMultisetEqual(actual, expected) {
	assert.ok(actual instanceof Map, 'result should be a Map')
	assert.equal(actual.size, expected.size, 'multiset sizes should match')
	for (const [key, count] of expected.entries()) {
		assert.equal(actual.has(key), true, `missing expected key ${String(key)}`)
		assert.equal(actual.get(key), count, `count mismatch for key ${String(key)}`)
	}
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property tests.
 */
function mulberry32(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

describe('intersectionMultisetRecursive', () => {
	describe('normal cases', () => {
		test('intersects two overlapping multisets with min multiplicities', () => {
			const a = new Map([
				['apple', 3],
				['banana', 2],
				['cherry', 1],
			])
			const b = new Map([
				['banana', 5],
				['cherry', 1],
				['date', 4],
			])

			const result = intersectionMultisetRecursive(a, b)
			assertMultisetEqual(
				result,
				new Map([
					['banana', 2],
					['cherry', 1],
				]),
			)
		})

		test('supports variadic intersection across 3, 4, and 5 multisets', () => {
			const m1 = new Map([
				['a', 5],
				['b', 4],
				['c', 3],
			])
			const m2 = new Map([
				['a', 2],
				['b', 6],
				['c', 3],
				['d', 1],
			])
			const m3 = new Map([
				['a', 7],
				['b', 1],
				['e', 9],
			])
			const m4 = new Map([
				['a', 3],
				['b', 2],
			])
			const m5 = new Map([
				['a', 4],
				['b', 1],
			])

			assertMultisetEqual(
				intersectionMultisetRecursive(m1, m2, m3),
				new Map([
					['a', 2],
					['b', 1],
				]),
			)
			assertMultisetEqual(
				intersectionMultisetRecursive(m1, m2, m3, m4, m5),
				new Map([
					['a', 2],
					['b', 1],
				]),
			)
		})

		test('supports diverse Map key types (objects, symbols, NaN, booleans, null, undefined)', () => {
			const obj1 = { id: 1 }
			const obj2 = { id: 2 }
			const sym = Symbol('k')

			const a = new Map([
				[obj1, 4],
				[obj2, 1],
				[sym, 3],
				[NaN, 2],
				[null, 5],
				[undefined, 1],
				[false, 2],
			])
			const b = new Map([
				[obj1, 2],
				[sym, 7],
				[NaN, 6],
				[null, 3],
				[undefined, 4],
				[false, 2],
				[true, 9],
			])

			const result = intersectionMultisetRecursive(a, b)
			assertMultisetEqual(
				result,
				new Map([
					[obj1, 2],
					[sym, 3],
					[NaN, 2],
					[null, 3],
					[undefined, 1],
					[false, 2],
				]),
			)
		})

		test('does not mutate input multisets', () => {
			const a = new Map([
				['x', 3],
				['y', 0],
			])
			const b = new Map([
				['x', 2],
				['z', 5],
			])

			const result = intersectionMultisetRecursive(a, b)
			assert.notEqual(result, a)
			assert.notEqual(result, b)
			assert.deepEqual([...a.entries()], [
				['x', 3],
				['y', 0],
			])
			assert.deepEqual([...b.entries()], [
				['x', 2],
				['z', 5],
			])
		})
	})

	describe('edge cases', () => {
		test('handles empty maps', () => {
			const empty = new Map()
			const nonEmpty = new Map([['a', 2]])

			assertMultisetEqual(intersectionMultisetRecursive(empty, empty), new Map())
			assertMultisetEqual(intersectionMultisetRecursive(empty, nonEmpty), new Map())
			assertMultisetEqual(intersectionMultisetRecursive(nonEmpty, empty), new Map())
			assertMultisetEqual(
				intersectionMultisetRecursive(nonEmpty, empty, nonEmpty),
				new Map(),
			)
		})

		test('handles disjoint maps', () => {
			const a = new Map([
				['a', 1],
				['b', 2],
			])
			const b = new Map([
				['c', 3],
				['d', 4],
			])
			assertMultisetEqual(intersectionMultisetRecursive(a, b), new Map())
		})

		test('omits zero-count entries (including -0)', () => {
			const a = new Map([
				['a', 0],
				['b', 3],
				['c', -0],
			])
			const b = new Map([
				['a', 5],
				['b', 0],
				['c', 2],
			])
			const result = intersectionMultisetRecursive(a, b)
			assertMultisetEqual(result, new Map())
			assert.equal(result.has('a'), false)
			assert.equal(result.has('b'), false)
			assert.equal(result.has('c'), false)
		})

		test('handles identical maps and single-map normalization', () => {
			const a = new Map([
				['x', 4],
				['y', 0],
				['z', 7],
			])
			const expected = new Map([
				['x', 4],
				['z', 7],
			])

			const single = intersectionMultisetRecursive(a)
			assert.notEqual(single, a)
			assertMultisetEqual(single, expected)

			const pair = intersectionMultisetRecursive(a, new Map(a))
			assertMultisetEqual(pair, expected)
		})

		test('handles large multisets without stack overflow and large integer counts', () => {
			const a = new Map()
			const b = new Map()
			const size = 20000
			for (let i = 0; i < size; i++) {
				a.set(i, i % 10)
				if (i % 2 === 0) {
					b.set(i, (i * 3) % 10)
				}
			}
			a.set('max', Number.MAX_SAFE_INTEGER)
			b.set('max', Number.MAX_SAFE_INTEGER - 1)

			const actual = intersectionMultisetRecursive(a, b)
			const expected = referenceIterativeIntersection(a, b)
			assertMultisetEqual(actual, expected)
			assert.equal(actual.get('max'), Number.MAX_SAFE_INTEGER - 1)
		})
	})

	describe('invalid inputs', () => {
		test('throws RangeError when called with zero arguments', () => {
			assert.throws(() => intersectionMultisetRecursive(), RangeError)
		})

		test('throws TypeError when any argument is not a Map', () => {
			const valid = new Map([['a', 1]])
			for (const bad of [null, undefined, {}, [], new Set(['a']), 'abc', 42]) {
				assert.throws(() => intersectionMultisetRecursive(bad), TypeError)
				assert.throws(() => intersectionMultisetRecursive(valid, bad), TypeError)
				assert.throws(() => intersectionMultisetRecursive(new Map(), bad), TypeError)
			}
		})

		test('throws RangeError for negative, fractional, NaN, or infinite counts', () => {
			const valid = new Map([['a', 1]])
			for (const badCount of [-1, -100, 1.5, 0.1, NaN, Infinity, -Infinity]) {
				const badMap = new Map([['a', badCount]])
				assert.throws(() => intersectionMultisetRecursive(badMap), RangeError)
				assert.throws(() => intersectionMultisetRecursive(valid, badMap), RangeError)
				// Ensure validation runs even when an earlier map is empty
				assert.throws(() => intersectionMultisetRecursive(new Map(), badMap), RangeError)
			}
		})

		test('throws TypeError for non-number counts', () => {
			const valid = new Map([['a', 1]])
			for (const badCount of ['2', null, undefined, true, false, {}, 2n]) {
				const badMap = new Map([['a', badCount]])
				assert.throws(() => intersectionMultisetRecursive(badMap), TypeError)
				assert.throws(() => intersectionMultisetRecursive(valid, badMap), TypeError)
				assert.throws(() => intersectionMultisetRecursive(new Map(), badMap), TypeError)
			}
		})
	})

	describe('algebraic laws & iterative reference cross-check', () => {
		const rand = mulberry32(0x5eed1234)
		const universe = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9']

		function randomMultiset() {
			const m = new Map()
			for (const k of universe) {
				if (rand() < 0.7) {
					m.set(k, Math.floor(rand() * 6)) // includes 0 counts
				}
			}
			return m
		}

		test('matches independent iterative reference across 100 randomized cases (1..6 multisets)', () => {
			for (let trial = 0; trial < 100; trial++) {
				const k = 1 + (trial % 6)
				const inputs = Array.from({ length: k }, () => randomMultiset())
				const actual = intersectionMultisetRecursive(...inputs)
				const expected = referenceIterativeIntersection(...inputs)
				assertMultisetEqual(actual, expected)
			}
		})

		test('satisfies commutativity: A ∩ B = B ∩ A', () => {
			for (let trial = 0; trial < 40; trial++) {
				const a = randomMultiset()
				const b = randomMultiset()
				assertMultisetEqual(
					intersectionMultisetRecursive(a, b),
					intersectionMultisetRecursive(b, a),
				)
			}
		})

		test('satisfies associativity: (A ∩ B) ∩ C = A ∩ (B ∩ C) = A ∩ B ∩ C', () => {
			for (let trial = 0; trial < 40; trial++) {
				const a = randomMultiset()
				const b = randomMultiset()
				const c = randomMultiset()
				const leftAssoc = intersectionMultisetRecursive(
					intersectionMultisetRecursive(a, b),
					c,
				)
				const rightAssoc = intersectionMultisetRecursive(
					a,
					intersectionMultisetRecursive(b, c),
				)
				const variadic = intersectionMultisetRecursive(a, b, c)
				assertMultisetEqual(leftAssoc, rightAssoc)
				assertMultisetEqual(leftAssoc, variadic)
			}
		})

		test('satisfies idempotence: A ∩ A = normalize(A) and absorption with ∅', () => {
			const empty = new Map()
			for (let trial = 0; trial < 40; trial++) {
				const a = randomMultiset()
				const norm = intersectionMultisetRecursive(a)
				assertMultisetEqual(intersectionMultisetRecursive(a, a), norm)
				assertMultisetEqual(intersectionMultisetRecursive(a, a, a), norm)
				assertMultisetEqual(intersectionMultisetRecursive(a, empty), empty)
				assertMultisetEqual(intersectionMultisetRecursive(empty, a), empty)
			}
		})
	})
})
