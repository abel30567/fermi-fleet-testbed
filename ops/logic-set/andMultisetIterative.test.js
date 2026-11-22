import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { andMultisetIterative } from './andMultisetIterative.js'

/**
 * Helper to assert two multisets have identical key-multiplicity pairs
 * regardless of Map insertion order, and that both are canonical (no 0 counts).
 *
 * @template T
 * @param {Map<T, number>} actual
 * @param {Map<T, number>} expected
 */
function assertMultisetEqual(actual, expected) {
	assert.ok(actual instanceof Map, 'actual should be a Map')
	assert.ok(expected instanceof Map, 'expected should be a Map')
	assert.equal(actual.size, expected.size, `size mismatch: ${actual.size} !== ${expected.size}`)
	for (const [k, v] of actual) {
		assert.ok(v > 0, `actual multiset contains non-positive count ${v}`)
		assert.ok(expected.has(k), `unexpected key ${String(k)} in actual`)
		assert.equal(v, expected.get(k), `count mismatch for key ${String(k)}`)
	}
}

/**
 * Canonicalize a multiset by removing zero-count entries.
 *
 * @template T
 * @param {Map<T, number>} m
 * @returns {Map<T, number>}
 */
function canonicalize(m) {
	const out = new Map()
	for (const [k, v] of m) {
		if (v > 0) out.set(k, v)
	}
	return out
}

/**
 * Independent multiset OR (union / max multiplicity) used to verify
 * lattice absorption and distributivity identities.
 *
 * @template T
 * @param {Map<T, number>} a
 * @param {Map<T, number>} b
 * @returns {Map<T, number>}
 */
function orMultisetReference(a, b) {
	const out = new Map()
	for (const [k, v] of a) {
		if (v > 0) out.set(k, v)
	}
	for (const [k, v] of b) {
		if (v > 0) {
			const prev = out.get(k) ?? 0
			out.set(k, Math.max(prev, v))
		}
	}
	return out
}

/**
 * Independent reference implementation via sorted-array bag expansion
 * and two-pointer sorted-array intersection.
 *
 * @param {Map<number, number>} a
 * @param {Map<number, number>} b
 * @returns {Map<number, number>}
 */
function sortedArrayBagIntersection(a, b) {
	/** @type {number[]} */
	const bagA = []
	for (const [val, count] of a) {
		for (let i = 0; i < count; i++) bagA.push(val)
	}
	/** @type {number[]} */
	const bagB = []
	for (const [val, count] of b) {
		for (let i = 0; i < count; i++) bagB.push(val)
	}

	bagA.sort((x, y) => x - y)
	bagB.sort((x, y) => x - y)

	/** @type {number[]} */
	const intersected = []
	let i = 0
	let j = 0
	while (i < bagA.length && j < bagB.length) {
		if (bagA[i] === bagB[j]) {
			intersected.push(bagA[i])
			i++
			j++
		} else if (bagA[i] < bagB[j]) {
			i++
		} else {
			j++
		}
	}

	const result = new Map()
	for (const val of intersected) {
		result.set(val, (result.get(val) ?? 0) + 1)
	}
	return result
}

/**
 * Deterministic LCG PRNG for reproducible fuzz testing.
 *
 * @param {number} seed
 */
function createRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

describe('andMultisetIterative', () => {
	describe('normal cases', () => {
		test('computes minimum multiplicities for overlapping string multisets', () => {
			const a = new Map([
				['apple', 3],
				['banana', 2],
				['cherry', 5],
			])
			const b = new Map([
				['banana', 4],
				['cherry', 1],
				['date', 7],
			])

			const res = andMultisetIterative(a, b)
			assertMultisetEqual(
				res,
				new Map([
					['banana', 2],
					['cherry', 1],
				]),
			)
		})

		test('returns empty Map for disjoint multisets', () => {
			const a = new Map([
				[1, 2],
				[2, 3],
			])
			const b = new Map([
				[3, 4],
				[4, 5],
			])

			const res = andMultisetIterative(a, b)
			assert.equal(res.size, 0)
		})

		test('supports arbitrary Map key types (primitives, NaN, symbols, objects)', () => {
			const sym = Symbol('k')
			const objShared = { id: 1 }
			const objOnlyA = { id: 2 }

			const a = new Map([
				[sym, 3],
				[objShared, 2],
				[objOnlyA, 5],
				[NaN, 4],
				[null, 2],
				[undefined, 6],
				[true, 1],
			])
			const b = new Map([
				[sym, 1],
				[objShared, 9],
				[{ id: 2 }, 5], // distinct object identity
				[NaN, 2],
				[null, 3],
				[undefined, 2],
				[true, 1],
			])

			const res = andMultisetIterative(a, b)
			assertMultisetEqual(
				res,
				new Map([
					[sym, 1],
					[objShared, 2],
					[NaN, 2],
					[null, 2],
					[undefined, 2],
					[true, 1],
				]),
			)
		})

		test('handles large safe integer multiplicities including MAX_SAFE_INTEGER', () => {
			const max = Number.MAX_SAFE_INTEGER
			const a = new Map([
				['x', max],
				['y', max - 1],
			])
			const b = new Map([
				['x', max],
				['y', max],
			])

			const res = andMultisetIterative(a, b)
			assertMultisetEqual(
				res,
				new Map([
					['x', max],
					['y', max - 1],
				]),
			)
		})
	})

	describe('edge cases and immutability', () => {
		test('handles empty multisets', () => {
			const empty = new Map()
			const nonEmpty = new Map([['a', 2]])

			assertMultisetEqual(andMultisetIterative(empty, empty), new Map())
			assertMultisetEqual(andMultisetIterative(nonEmpty, empty), new Map())
			assertMultisetEqual(andMultisetIterative(empty, nonEmpty), new Map())
		})

		test('omits explicit zero and negative-zero multiplicities from output', () => {
			const a = new Map([
				['a', 0],
				['b', -0],
				['c', 3],
				['d', 2],
			])
			const b = new Map([
				['a', 5],
				['b', 5],
				['c', 0],
				['d', 4],
			])

			const res = andMultisetIterative(a, b)
			assertMultisetEqual(res, new Map([['d', 2]]))
			assert.equal(res.has('a'), false)
			assert.equal(res.has('b'), false)
			assert.equal(res.has('c'), false)
		})

		test('treats -0 and +0 keys identically per Map SameValueZero semantics', () => {
			const a = new Map([[-0, 3]])
			const b = new Map([[+0, 2]])

			const res = andMultisetIterative(a, b)
			assert.equal(res.size, 1)
			assert.equal(res.get(0), 2)
		})

		test('does not mutate inputs and returns a fresh Map even when aliased', () => {
			const a = new Map([
				['x', 0],
				['y', 3],
			])
			const b = new Map([
				['y', 2],
				['z', 4],
			])

			const res = andMultisetIterative(a, b)
			assert.notEqual(res, a)
			assert.notEqual(res, b)
			assert.deepStrictEqual([...a.entries()], [
				['x', 0],
				['y', 3],
			])
			assert.deepStrictEqual([...b.entries()], [
				['y', 2],
				['z', 4],
			])

			const selfRes = andMultisetIterative(a, a)
			assert.notEqual(selfRes, a)
			assertMultisetEqual(selfRes, new Map([['y', 3]]))
			assert.equal(a.has('x'), true)
		})
	})

	describe('input validation', () => {
		test('throws TypeError when a or b is not a Map', () => {
			const valid = new Map([['a', 1]])
			const invalidInputs = [null, undefined, {}, [], new Set(['a']), 'abc', 123, true]

			for (const bad of invalidInputs) {
				assert.throws(() => andMultisetIterative(bad, valid), TypeError)
				assert.throws(() => andMultisetIterative(valid, bad), TypeError)
			}
		})

		test('throws TypeError when any count is not a number (including unmatched keys)', () => {
			const valid = new Map([['shared', 2]])
			const badCounts = ['2', null, undefined, true, 2n, {}, []]

			for (const badCount of badCounts) {
				const badMap = new Map([
					['shared', 1],
					['unmatched', badCount],
				])
				assert.throws(() => andMultisetIterative(badMap, valid), TypeError)
				assert.throws(() => andMultisetIterative(valid, badMap), TypeError)
			}
		})

		test('throws RangeError when any count is negative, non-integer, non-finite, or unsafe', () => {
			const valid = new Map([['shared', 2]])
			const badCounts = [
				-1,
				-100,
				0.5,
				1.25,
				NaN,
				Infinity,
				-Infinity,
				Number.MAX_SAFE_INTEGER + 1,
				-Number.MAX_SAFE_INTEGER - 1,
			]

			for (const badCount of badCounts) {
				const badMap = new Map([
					['shared', 1],
					['onlyHere', badCount],
				])
				assert.throws(() => andMultisetIterative(badMap, valid), RangeError)
				assert.throws(() => andMultisetIterative(valid, badMap), RangeError)
			}
		})

		test('formats errors safely even for null-prototype object keys', () => {
			const nullProtoKey = Object.create(null)
			const badType = new Map([[nullProtoKey, 'not-a-number']])
			const badRange = new Map([[nullProtoKey, -3]])
			const empty = new Map()

			assert.throws(() => andMultisetIterative(badType, empty), TypeError)
			assert.throws(() => andMultisetIterative(badRange, empty), RangeError)
		})
	})

	describe('cross-check against sorted-array bag intersection', () => {
		test('matches sorted-array bag intersection on 100 randomized multiset pairs', () => {
			const rand = createRng(0x5eed1234)

			for (let trial = 0; trial < 100; trial++) {
				const a = new Map()
				const b = new Map()
				const universeSize = 12

				for (let k = 0; k < universeSize; k++) {
					if (rand() < 0.7) {
						// Include occasional explicit 0 multiplicities
						a.set(k, Math.floor(rand() * 6))
					}
					if (rand() < 0.7) {
						b.set(k, Math.floor(rand() * 6))
					}
				}

				const actual = andMultisetIterative(a, b)
				const expected = sortedArrayBagIntersection(a, b)
				assertMultisetEqual(actual, expected)
			}
		})
	})

	describe('algebraic identities', () => {
		test('satisfies commutativity, associativity, idempotence, absorption, distributivity, and monotonicity', () => {
			const rand = createRng(0xabcddcba)
			const empty = new Map()

			for (let trial = 0; trial < 50; trial++) {
				const gen = () => {
					const m = new Map()
					for (let k = 0; k < 10; k++) {
						if (rand() < 0.65) {
							m.set(`k${k}`, Math.floor(rand() * 7))
						}
					}
					return m
				}

				const a = gen()
				const b = gen()
				const c = gen()
				const canonA = canonicalize(a)

				// Commutativity: A ∧ B = B ∧ A
				const ab = andMultisetIterative(a, b)
				const ba = andMultisetIterative(b, a)
				assertMultisetEqual(ab, ba)

				// Associativity: (A ∧ B) ∧ C = A ∧ (B ∧ C)
				assertMultisetEqual(
					andMultisetIterative(ab, c),
					andMultisetIterative(a, andMultisetIterative(b, c)),
				)

				// Idempotence: A ∧ A = canonical(A)
				assertMultisetEqual(andMultisetIterative(a, a), canonA)

				// Annihilation with empty multiset: A ∧ ∅ = ∅
				assertMultisetEqual(andMultisetIterative(a, empty), empty)
				assertMultisetEqual(andMultisetIterative(empty, a), empty)

				// Absorption with multiset OR (max):
				// A ∧ (A ∨ B) = canonical(A) and A ∨ (A ∧ B) = canonical(A)
				const aOrB = orMultisetReference(a, b)
				assertMultisetEqual(andMultisetIterative(a, aOrB), canonA)
				assertMultisetEqual(orMultisetReference(canonA, ab), canonA)

				// Distributivity: A ∧ (B ∨ C) = (A ∧ B) ∨ (A ∧ C)
				assertMultisetEqual(
					andMultisetIterative(a, orMultisetReference(b, c)),
					orMultisetReference(ab, andMultisetIterative(a, c)),
				)

				// Monotonicity & cardinality bound
				let totalA = 0
				for (const v of a.values()) totalA += v
				let totalB = 0
				for (const v of b.values()) totalB += v
				let totalAB = 0
				for (const [k, v] of ab) {
					totalAB += v
					assert.ok(v <= (a.get(k) ?? 0))
					assert.ok(v <= (b.get(k) ?? 0))
				}
				assert.ok(totalAB <= Math.min(totalA, totalB))
			}
		})
	})
})
