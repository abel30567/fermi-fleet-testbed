import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { setDifferenceMultisetRecursive } from './setDifferenceMultisetRecursive.js'

/**
 * Independent iterative reference implementation of multiset difference.
 */
function referenceMultisetDifference(a, b) {
	const result = new Map()
	for (const [key, countA] of a) {
		const countB = b.get(key) ?? 0
		const diff = countA - countB
		if (diff > 0) {
			result.set(key, diff)
		}
	}
	return result
}

/**
 * Helper: multiset sum (A ⊎ B), where m(x) = m_A(x) + m_B(x).
 */
function multisetSum(a, b) {
	const result = new Map()
	for (const [key, count] of a) {
		if (count > 0) result.set(key, (result.get(key) ?? 0) + count)
	}
	for (const [key, count] of b) {
		if (count > 0) result.set(key, (result.get(key) ?? 0) + count)
	}
	return result
}

/**
 * Helper: multiset intersection (A ∩ B), where m(x) = min(m_A(x), m_B(x)).
 */
function multisetIntersection(a, b) {
	const result = new Map()
	for (const [key, countA] of a) {
		const countB = b.get(key) ?? 0
		const m = Math.min(countA, countB)
		if (m > 0) result.set(key, m)
	}
	return result
}

/**
 * Helper: canonicalize a multiset (drop zero-count entries).
 */
function canonicalize(m) {
	const result = new Map()
	for (const [k, v] of m) {
		if (v > 0) result.set(k, v)
	}
	return result
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property cross-checks.
 */
function createRng(seed) {
	let s = seed >>> 0
	return () => {
		s = (s + 0x6d2b79f5) >>> 0
		let t = Math.imul(s ^ (s >>> 15), 1 | s)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

describe('setDifferenceMultisetRecursive', () => {
	test('computes normal multiset difference with partial, exact, and excess subtraction', () => {
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
			['elderberry', 1],
		])

		const result = setDifferenceMultisetRecursive(a, b)
		assert.deepEqual(
			result,
			new Map([
				['apple', 3],
				['date', 4],
			])
		)
	})

	test('preserves insertion order from the minuend and does not mutate inputs', () => {
		const a = new Map([
			['z', 4],
			['a', 2],
			['m', 5],
			['b', 1],
		])
		const b = new Map([
			['a', 2],
			['m', 3],
		])
		const snapshotA = new Map(a)
		const snapshotB = new Map(b)

		const result = setDifferenceMultisetRecursive(a, b)
		assert.deepEqual([...result.entries()], [
			['z', 4],
			['m', 2],
			['b', 1],
		])
		assert.deepEqual(a, snapshotA)
		assert.deepEqual(b, snapshotB)
		assert.notEqual(result, a)
		assert.notEqual(result, b)
	})

	test('handles empty multisets and single-element multisets', () => {
		const empty = new Map()
		const single = new Map([['only', 3]])

		assert.deepEqual(setDifferenceMultisetRecursive(empty, empty), new Map())
		assert.deepEqual(setDifferenceMultisetRecursive(empty, single), new Map())

		const diffFromEmpty = setDifferenceMultisetRecursive(single, empty)
		assert.deepEqual(diffFromEmpty, new Map([['only', 3]]))
		assert.notEqual(diffFromEmpty, single)

		assert.deepEqual(
			setDifferenceMultisetRecursive(single, new Map([['only', 1]])),
			new Map([['only', 2]])
		)
		assert.deepEqual(
			setDifferenceMultisetRecursive(single, new Map([['only', 3]])),
			new Map()
		)
		assert.deepEqual(
			setDifferenceMultisetRecursive(single, new Map([['only', 10]])),
			new Map()
		)
	})

	test('handles zero counts in inputs and canonicalizes output', () => {
		const a = new Map([
			['x', 0],
			['y', 3],
			['z', -0],
		])
		const b = new Map([
			['x', 0],
			['y', 0],
			['w', 0],
		])

		const result = setDifferenceMultisetRecursive(a, b)
		assert.deepEqual(result, new Map([['y', 3]]))
		assert.equal(result.has('x'), false)
		assert.equal(result.has('z'), false)
	})

	test('handles self-difference (same Map reference) and disjoint multisets', () => {
		const a = new Map([
			[1, 10],
			[2, 20],
			[3, 30],
		])
		const disjoint = new Map([
			[4, 5],
			[5, 6],
		])

		assert.deepEqual(setDifferenceMultisetRecursive(a, a), new Map())
		assert.deepEqual(setDifferenceMultisetRecursive(a, disjoint), a)
	})

	test('supports diverse Map key types including objects, symbols, null, undefined, NaN, and -0/+0', () => {
		const obj1 = { id: 1 }
		const obj2 = { id: 2 }
		const sym = Symbol('tag')

		const a = new Map([
			[obj1, 4],
			[obj2, 2],
			[sym, 3],
			[null, 5],
			[undefined, 2],
			[NaN, 6],
			[-0, 7],
		])
		const b = new Map([
			[obj1, 1],
			[obj2, 2],
			[sym, 1],
			[null, 5],
			[undefined, 1],
			[NaN, 2],
			[0, 3],
		])

		const result = setDifferenceMultisetRecursive(a, b)
		assert.equal(result.get(obj1), 3)
		assert.equal(result.has(obj2), false)
		assert.equal(result.get(sym), 2)
		assert.equal(result.has(null), false)
		assert.equal(result.get(undefined), 1)
		assert.equal(result.get(NaN), 4)
		assert.equal(result.get(0), 4)
		assert.equal(result.size, 5)
	})

	test('handles large safe integer multiplicities and large map sizes without stack overflow', () => {
		const max = Number.MAX_SAFE_INTEGER
		const bigCounts = setDifferenceMultisetRecursive(
			new Map([['big', max]]),
			new Map([['big', max - 42]])
		)
		assert.deepEqual(bigCounts, new Map([['big', 42]]))

		const size = 20_000
		const a = new Map()
		const b = new Map()
		for (let i = 0; i < size; i++) {
			a.set(i, (i % 7) + 1)
			if (i % 2 === 0) {
				b.set(i, (i % 5) + 1)
			}
		}

		const actual = setDifferenceMultisetRecursive(a, b)
		const expected = referenceMultisetDifference(a, b)
		assert.deepEqual(actual, expected)
	})

	test('throws TypeError when arguments are not Map instances', () => {
		const valid = new Map([['a', 1]])
		const invalidInputs = [
			null,
			undefined,
			{},
			{ a: 1 },
			[['a', 1]],
			new Set(['a']),
			'map',
			42,
		]

		for (const bad of invalidInputs) {
			assert.throws(() => setDifferenceMultisetRecursive(bad, valid), TypeError)
			assert.throws(() => setDifferenceMultisetRecursive(valid, bad), TypeError)
		}
	})

	test('throws TypeError or RangeError on invalid counts in either multiset', () => {
		const valid = new Map([['a', 2]])
		const empty = new Map()

		// Non-number or NaN counts -> TypeError
		for (const badCount of ['2', null, undefined, true, 2n, {}, NaN]) {
			const badMap = new Map([['a', badCount]])
			assert.throws(() => setDifferenceMultisetRecursive(badMap, valid), TypeError)
			assert.throws(() => setDifferenceMultisetRecursive(valid, badMap), TypeError)
			// Even when `a` is empty, `b` must still be validated
			assert.throws(() => setDifferenceMultisetRecursive(empty, badMap), TypeError)
		}

		// Negative, non-integer, infinite, or unsafe integer counts -> RangeError
		for (const badCount of [
			-1,
			-100,
			1.5,
			0.1,
			Infinity,
			-Infinity,
			Number.MAX_SAFE_INTEGER + 1,
		]) {
			const badMap = new Map([['a', badCount]])
			assert.throws(() => setDifferenceMultisetRecursive(badMap, valid), RangeError)
			assert.throws(() => setDifferenceMultisetRecursive(valid, badMap), RangeError)
			assert.throws(() => setDifferenceMultisetRecursive(empty, badMap), RangeError)
		}
	})

	test('cross-check against iterative reference implementation and algebraic identities over randomized multisets', () => {
		const rng = createRng(0x5eed1234)
		const universe = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9']

		function randomMultiset() {
			const m = new Map()
			for (const k of universe) {
				if (rng() < 0.65) {
					m.set(k, Math.floor(rng() * 8)) // includes 0 counts
				}
			}
			return m
		}

		for (let trial = 0; trial < 100; trial++) {
			const A = randomMultiset()
			const B = randomMultiset()
			const C = randomMultiset()

			const diffAB = setDifferenceMultisetRecursive(A, B)

			// 1. Exact agreement with independent iterative reference
			assert.deepEqual(diffAB, referenceMultisetDifference(A, B))

			// 2. Partition identity: (A \ B) ⊎ (A ∩ B) === canonical(A)
			const reconstructed = multisetSum(diffAB, multisetIntersection(A, B))
			assert.deepEqual(reconstructed, canonicalize(A))

			// 3. Iterated difference identity: (A \ B) \ C === A \ (B ⊎ C)
			const lhs = setDifferenceMultisetRecursive(diffAB, C)
			const rhs = setDifferenceMultisetRecursive(A, multisetSum(B, C))
			assert.deepEqual(lhs, rhs)

			// 4. Self-difference identity: A \ A === ∅
			assert.deepEqual(setDifferenceMultisetRecursive(A, A), new Map())
		}
	})
})
