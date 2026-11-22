import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { orMultisetIterative } from './orMultisetIterative.js'

/**
 * Helper: compares two Maps for exact key-value equality regardless of insertion order.
 */
function assertMapsEqual(actual, expected) {
	assert.equal(actual instanceof Map, true, 'expected result to be a Map')
	assert.equal(actual.size, expected.size, `size mismatch: ${actual.size} !== ${expected.size}`)
	for (const [k, v] of expected) {
		assert.equal(actual.has(k), true, `missing expected key ${String(k)}`)
		assert.equal(actual.get(k), v, `value mismatch for key ${String(k)}`)
	}
}

/**
 * Independent reference implementation via bag/array expansion and counting.
 * Expands each multiset into a flat array of repeated items, then counts
 * occurrences in each expanded bag and takes the maximum count per distinct item.
 */
function expandToBag(multiset) {
	const bag = []
	for (const [item, count] of multiset) {
		for (let i = 0; i < count; i++) {
			bag.push(item)
		}
	}
	return bag
}

function orViaArrayExpansion(a, b) {
	const bagA = expandToBag(a)
	const bagB = expandToBag(b)

	const distinct = []
	for (const item of [...bagA, ...bagB]) {
		if (!distinct.some((x) => Object.is(x, item) || (x === 0 && item === 0))) {
			distinct.push(item)
		}
	}

	const expected = new Map()
	for (const item of distinct) {
		const isMatch = (x) => Object.is(x, item) || (x === 0 && item === 0)
		const countA = bagA.filter(isMatch).length
		const countB = bagB.filter(isMatch).length
		const maxCount = countA >= countB ? countA : countB
		if (maxCount > 0) {
			expected.set(item, maxCount)
		}
	}
	return expected
}

/**
 * Independent multiset intersection (conjunction) and cardinality helpers
 * for verifying inclusion-exclusion: |A or B| + |A and B| = |A| + |B|.
 */
function andMultisetReference(a, b) {
	const out = new Map()
	for (const [k, ca] of a) {
		const cb = b.get(k) ?? 0
		const m = Math.min(ca, cb)
		if (m > 0) {
			out.set(k, m)
		}
	}
	return out
}

function cardinality(multiset) {
	let total = 0
	for (const count of multiset.values()) {
		total += count
	}
	return total
}

function canonicalize(multiset) {
	const out = new Map()
	for (const [k, v] of multiset) {
		if (v > 0) {
			out.set(k, v)
		}
	}
	return out
}

describe('orMultisetIterative', () => {
	describe('normal cases', () => {
		it('computes maximum multiplicity across overlapping and disjoint keys', () => {
			const a = new Map([
				['apple', 3],
				['banana', 1],
				['cherry', 4],
			])
			const b = new Map([
				['banana', 5],
				['cherry', 4],
				['date', 2],
			])

			const result = orMultisetIterative(a, b)
			assertMapsEqual(
				result,
				new Map([
					['apple', 3],
					['banana', 5],
					['cherry', 4],
					['date', 2],
				]),
			)
		})

		it('handles empty multisets', () => {
			const empty = new Map()
			const a = new Map([
				['x', 2],
				['y', 7],
			])

			assertMapsEqual(orMultisetIterative(empty, empty), new Map())
			assertMapsEqual(orMultisetIterative(a, empty), a)
			assertMapsEqual(orMultisetIterative(empty, a), a)
		})

		it('supports diverse Map key types (objects, symbols, null, undefined, NaN)', () => {
			const obj1 = { id: 1 }
			const obj2 = { id: 2 }
			const sym = Symbol('tag')

			const a = new Map([
				[obj1, 2],
				[sym, 1],
				[null, 3],
				[NaN, 4],
			])
			const b = new Map([
				[obj1, 5],
				[obj2, 1],
				[undefined, 2],
				[NaN, 2],
			])

			const result = orMultisetIterative(a, b)
			assertMapsEqual(
				result,
				new Map([
					[obj1, 5],
					[obj2, 1],
					[sym, 1],
					[null, 3],
					[undefined, 2],
					[NaN, 4],
				]),
			)
		})

		it('does not mutate inputs and returns a fresh Map instance', () => {
			const a = new Map([
				['k', 2],
				['zero', 0],
			])
			const b = new Map([
				['k', 5],
				['m', 1],
			])
			const snapshotA = [...a.entries()]
			const snapshotB = [...b.entries()]

			const result = orMultisetIterative(a, b)

			assert.notEqual(result, a)
			assert.notEqual(result, b)
			assert.deepEqual([...a.entries()], snapshotA)
			assert.deepEqual([...b.entries()], snapshotB)

			const selfOr = orMultisetIterative(a, a)
			assert.notEqual(selfOr, a)
			assertMapsEqual(selfOr, new Map([['k', 2]]))
		})
	})

	describe('edge cases', () => {
		it('omits entries whose resulting multiplicity is 0 (including -0)', () => {
			const a = new Map([
				['zeroBoth', 0],
				['negZero', -0],
				['zeroInA', 0],
				['posInA', 3],
			])
			const b = new Map([
				['zeroBoth', 0],
				['zeroInB', 0],
				['zeroInA', 4],
				['posInA', 0],
			])

			const result = orMultisetIterative(a, b)
			assertMapsEqual(
				result,
				new Map([
					['zeroInA', 4],
					['posInA', 3],
				]),
			)
			assert.equal(result.has('zeroBoth'), false)
			assert.equal(result.has('negZero'), false)
			assert.equal(result.has('zeroInB'), false)
		})

		it('handles Number.MAX_SAFE_INTEGER counts accurately', () => {
			const max = Number.MAX_SAFE_INTEGER
			const a = new Map([
				['big', max],
				['small', 1],
			])
			const b = new Map([
				['big', max - 1],
				['small', max],
			])

			assertMapsEqual(
				orMultisetIterative(a, b),
				new Map([
					['big', max],
					['small', max],
				]),
			)
		})

		it('handles large multisets iteratively without stack overflow', () => {
			const n = 10_000
			const a = new Map()
			const b = new Map()
			for (let i = 0; i < n; i++) {
				a.set(i, i % 5)
				b.set(i + 5_000, (i * 3) % 7)
			}

			const result = orMultisetIterative(a, b)
			assert.equal(result.get(0), undefined) // a has 0, not in b
			assert.equal(result.get(5_000), Math.max(5_000 % 5, 0) || undefined)
			assert.equal(result.get(5_001), Math.max(5_001 % 5, 3))
			assert.equal(result.get(14_999), (9_999 * 3) % 7)
		})
	})

	describe('input validation', () => {
		it('throws TypeError if either argument is not a Map', () => {
			const valid = new Map([['a', 1]])
			const invalidInputs = [null, undefined, {}, [], new Set(['a']), 'abc', 123, true]

			for (const bad of invalidInputs) {
				assert.throws(() => orMultisetIterative(bad, valid), TypeError)
				assert.throws(() => orMultisetIterative(valid, bad), TypeError)
			}
		})

		it('throws TypeError if any count is not a number', () => {
			const valid = new Map([['a', 1]])
			const badCounts = ['1', null, undefined, true, 1n, {}, []]

			for (const bad of badCounts) {
				assert.throws(() => orMultisetIterative(new Map([['x', bad]]), valid), TypeError)
				assert.throws(() => orMultisetIterative(valid, new Map([['x', bad]])), TypeError)
			}
		})

		it('throws RangeError if any count is negative, fractional, non-finite, or unsafe', () => {
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
				-Number.MAX_SAFE_INTEGER,
			]

			for (const bad of badCounts) {
				assert.throws(() => orMultisetIterative(new Map([['x', bad]]), valid), RangeError)
				assert.throws(() => orMultisetIterative(valid, new Map([['x', bad]])), RangeError)
			}
		})

		it('validates all entries in b even when a is empty', () => {
			assert.throws(
				() => orMultisetIterative(new Map(), new Map([['ok', 1], ['bad', -2]])),
				RangeError,
			)
		})
	})

	describe('independent cross-checks and algebraic laws', () => {
		// Deterministic LCG for reproducible test multisets
		function makePrng(seed) {
			let state = seed >>> 0
			return () => {
				state = (1664525 * state + 1013904223) >>> 0
				return state
			}
		}

		function randomMultiset(nextRand, universe, maxCount = 6) {
			const m = new Map()
			for (const elem of universe) {
				const roll = nextRand() % 4
				if (roll !== 0) {
					// Include occasional 0 entries to test canonicalization as well
					m.set(elem, nextRand() % (maxCount + 1))
				}
			}
			return m
		}

		it('matches independent array-expansion/counting computation across deterministic cases', () => {
			const nextRand = makePrng(20261122)
			const universe = ['a', 'b', 'c', 'd', 'e', 1, 2, null]

			for (let trial = 0; trial < 40; trial++) {
				const a = randomMultiset(nextRand, universe, 8)
				const b = randomMultiset(nextRand, universe, 8)

				const actual = orMultisetIterative(a, b)
				const expected = orViaArrayExpansion(a, b)
				assertMapsEqual(actual, expected)
			}
		})

		it('satisfies commutativity, associativity, idempotence, identity, and inclusion-exclusion', () => {
			const nextRand = makePrng(424242)
			const universe = ['p', 'q', 'r', 's', 't', 'u']
			const empty = new Map()

			for (let trial = 0; trial < 30; trial++) {
				const a = randomMultiset(nextRand, universe, 10)
				const b = randomMultiset(nextRand, universe, 10)
				const c = randomMultiset(nextRand, universe, 10)

				// Commutativity: A ∨ B = B ∨ A
				const ab = orMultisetIterative(a, b)
				const ba = orMultisetIterative(b, a)
				assertMapsEqual(ab, ba)

				// Associativity: (A ∨ B) ∨ C = A ∨ (B ∨ C)
				const leftAssoc = orMultisetIterative(ab, c)
				const rightAssoc = orMultisetIterative(a, orMultisetIterative(b, c))
				assertMapsEqual(leftAssoc, rightAssoc)

				// Idempotence: A ∨ A = canonical(A)
				assertMapsEqual(orMultisetIterative(a, a), canonicalize(a))

				// Identity: A ∨ ∅ = canonical(A) and ∅ ∨ A = canonical(A)
				assertMapsEqual(orMultisetIterative(a, empty), canonicalize(a))
				assertMapsEqual(orMultisetIterative(empty, a), canonicalize(a))

				// Inclusion-exclusion: |A ∨ B| + |A ∧ B| = |A| + |B|
				const aAndB = andMultisetReference(a, b)
				assert.equal(
					cardinality(ab) + cardinality(aAndB),
					cardinality(a) + cardinality(b),
				)

				// Upper-bound property: m_A(k) <= m_{A ∨ B}(k) and m_B(k) <= m_{A ∨ B}(k)
				for (const k of universe) {
					const mAB = ab.get(k) ?? 0
					assert.ok(mAB >= (a.get(k) ?? 0))
					assert.ok(mAB >= (b.get(k) ?? 0))
				}
			}
		})

		it('agrees with classical set union on indicator multisets (counts in {0, 1})', () => {
			const setA = new Set(['alpha', 'beta', 'gamma'])
			const setB = new Set(['beta', 'delta'])

			const mA = new Map([...setA].map((x) => [x, 1]))
			const mB = new Map([...setB].map((x) => [x, 1]))

			const result = orMultisetIterative(mA, mB)
			const unionSet = new Set([...setA, ...setB])

			assert.equal(result.size, unionSet.size)
			for (const item of unionSet) {
				assert.equal(result.get(item), 1)
			}
		})
	})
})
