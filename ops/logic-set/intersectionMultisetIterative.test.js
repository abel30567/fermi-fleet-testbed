import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { intersectionMultisetIterative } from './intersectionMultisetIterative.js'

/**
 * Independent helper: canonicalize a multiset (omit 0-count entries).
 */
function canonicalize(m) {
	const out = new Map()
	for (const [k, v] of m) {
		if (v > 0) {
			out.set(k, v)
		}
	}
	return out
}

/**
 * Independent helper: check mathematical multiset equality (order-independent).
 */
function assertMultisetEqual(actual, expected, msg) {
	assert.ok(actual instanceof Map, `${msg ?? ''}: result must be a Map`)
	assert.equal(
		actual.size,
		expected.size,
		`${msg ?? ''}: size mismatch (${actual.size} !== ${expected.size})`,
	)
	for (const [k, v] of expected) {
		assert.equal(actual.has(k), true, `${msg ?? ''}: missing key ${String(k)}`)
		assert.equal(
			actual.get(k),
			v,
			`${msg ?? ''}: count mismatch for key ${String(k)}`,
		)
	}
	for (const [, v] of actual) {
		assert.ok(v > 0, `${msg ?? ''}: canonical multiset must omit zero counts`)
	}
}

/**
 * Independent helper: multiset union (max multiplicity per key).
 */
function unionMultiset(a, b) {
	const out = new Map()
	for (const [k, v] of a) {
		if (v > 0) {
			out.set(k, v)
		}
	}
	for (const [k, v] of b) {
		const prev = out.get(k) ?? 0
		const maxCount = v > prev ? v : prev
		if (maxCount > 0) {
			out.set(k, maxCount)
		}
	}
	return out
}

/**
 * Independent helper: multiset cardinality |M| = sum of multiplicities (BigInt to avoid overflow).
 */
function cardinality(m) {
	let total = 0n
	for (const count of m.values()) {
		total += BigInt(count)
	}
	return total
}

/**
 * Independent reference implementation via flat array-bag expansion and element-by-element matching.
 */
function arrayBagIntersection(a, b) {
	const bagA = []
	for (const [key, count] of a) {
		for (let i = 0; i < count; i++) {
			bagA.push(key)
		}
	}

	const bagB = []
	for (const [key, count] of b) {
		for (let i = 0; i < count; i++) {
			bagB.push(key)
		}
	}

	const matched = []
	const usedB = new Array(bagB.length).fill(false)

	for (const itemA of bagA) {
		for (let j = 0; j < bagB.length; j++) {
			if (!usedB[j] && Object.is(itemA, bagB[j]) || (!usedB[j] && itemA === bagB[j])) {
				usedB[j] = true
				matched.push(itemA)
				break
			}
		}
	}

	const result = new Map()
	for (const item of matched) {
		result.set(item, (result.get(item) ?? 0) + 1)
	}
	return result
}

/**
 * Deterministic LCG PRNG for reproducible property tests.
 */
function createPrng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

describe('intersectionMultisetIterative', () => {
	describe('normal cases', () => {
		test('computes min multiplicity for overlapping keys and drops non-overlapping keys', () => {
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

			const result = intersectionMultisetIterative(a, b)
			assertMultisetEqual(
				result,
				new Map([
					['banana', 2],
					['cherry', 1],
				]),
			)
		})

		test('returns empty Map for disjoint multisets', () => {
			const a = new Map([
				['x', 2],
				['y', 3],
			])
			const b = new Map([
				['z', 4],
				['w', 1],
			])

			assertMultisetEqual(intersectionMultisetIterative(a, b), new Map())
		})

		test('returns canonical copy for identical multisets', () => {
			const a = new Map([
				['k1', 1],
				['k2', 4],
				['k3', 9],
			])
			const b = new Map([
				['k1', 1],
				['k2', 4],
				['k3', 9],
			])

			const result = intersectionMultisetIterative(a, b)
			assertMultisetEqual(result, a)
			assert.notEqual(result, a)
			assert.notEqual(result, b)
		})

		test('handles subset and superset multisets', () => {
			const sub = new Map([
				['a', 1],
				['b', 2],
			])
			const sup = new Map([
				['a', 5],
				['b', 2],
				['c', 10],
			])

			assertMultisetEqual(intersectionMultisetIterative(sub, sup), sub)
			assertMultisetEqual(intersectionMultisetIterative(sup, sub), sub)
		})

		test('supports arbitrary Map key types with SameValueZero semantics', () => {
			const sym = Symbol('shared')
			const symOnlyA = Symbol('onlyA')
			const objShared = { id: 1 }
			const objDistinctA = { id: 2 }
			const objDistinctB = { id: 2 }

			const a = new Map([
				[1, 3],
				[NaN, 4],
				[null, 2],
				[undefined, 5],
				[true, 1],
				[sym, 6],
				[symOnlyA, 2],
				[objShared, 3],
				[objDistinctA, 4],
				[-0, 2],
			])
			const b = new Map([
				[1, 1],
				[NaN, 2],
				[null, 7],
				[undefined, 3],
				[false, 1],
				[sym, 2],
				[objShared, 5],
				[objDistinctB, 4],
				[+0, 5],
			])

			const result = intersectionMultisetIterative(a, b)
			assertMultisetEqual(
				result,
				new Map([
					[1, 1],
					[NaN, 2],
					[null, 2],
					[undefined, 3],
					[sym, 2],
					[objShared, 3],
					[0, 2],
				]),
			)
		})

		test('handles large safe integer multiplicities accurately', () => {
			const max = Number.MAX_SAFE_INTEGER
			const a = new Map([
				['big', max],
				['same', max],
			])
			const b = new Map([
				['big', max - 1],
				['same', max],
			])

			assertMultisetEqual(
				intersectionMultisetIterative(a, b),
				new Map([
					['big', max - 1],
					['same', max],
				]),
			)
		})
	})

	describe('edge cases and immutability', () => {
		test('handles empty Maps', () => {
			const empty = new Map()
			const nonEmpty = new Map([['a', 3]])

			assertMultisetEqual(intersectionMultisetIterative(empty, empty), new Map())
			assertMultisetEqual(
				intersectionMultisetIterative(empty, nonEmpty),
				new Map(),
			)
			assertMultisetEqual(
				intersectionMultisetIterative(nonEmpty, empty),
				new Map(),
			)
		})

		test('accepts explicit 0 and -0 counts and omits them from canonical result', () => {
			const a = new Map([
				['zeroBoth', 0],
				['zeroA', 0],
				['negZeroA', -0],
				['zeroB', 5],
				['pos', 3],
			])
			const b = new Map([
				['zeroBoth', 0],
				['zeroA', 4],
				['negZeroA', 2],
				['zeroB', 0],
				['pos', 2],
			])

			const result = intersectionMultisetIterative(a, b)
			assertMultisetEqual(result, new Map([['pos', 2]]))
			assert.equal(result.has('zeroBoth'), false)
			assert.equal(result.has('zeroA'), false)
			assert.equal(result.has('negZeroA'), false)
			assert.equal(result.has('zeroB'), false)
		})

		test('does not mutate inputs and returns an independent Map', () => {
			const a = new Map([
				['a', 2],
				['b', 0],
				['c', 5],
			])
			const b = new Map([
				['a', 4],
				['c', 1],
				['d', 3],
			])
			const snapshotA = [...a.entries()]
			const snapshotB = [...b.entries()]

			const result = intersectionMultisetIterative(a, b)
			result.set('a', 999)
			result.set('extra', 42)

			assert.deepEqual([...a.entries()], snapshotA)
			assert.deepEqual([...b.entries()], snapshotB)
		})

		test('handles same Map reference passed for both arguments', () => {
			const a = new Map([
				['x', 3],
				['y', 0],
			])
			const result = intersectionMultisetIterative(a, a)
			assertMultisetEqual(result, new Map([['x', 3]]))
			assert.notEqual(result, a)
			assert.equal(a.has('y'), true)
		})
	})

	describe('input validation', () => {
		test('throws TypeError when a or b is not a Map', () => {
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
				assert.throws(
					() => intersectionMultisetIterative(bad, valid),
					{ name: 'TypeError' },
				)
				assert.throws(
					() => intersectionMultisetIterative(valid, bad),
					{ name: 'TypeError' },
				)
			}
		})

		test('throws TypeError for non-number counts', () => {
			const valid = new Map([['a', 1]])
			const badCounts = ['1', 1n, null, undefined, true, false, {}, []]

			for (const count of badCounts) {
				assert.throws(
					() => intersectionMultisetIterative(new Map([['a', count]]), valid),
					{ name: 'TypeError' },
				)
				assert.throws(
					() => intersectionMultisetIterative(valid, new Map([['a', count]])),
					{ name: 'TypeError' },
				)
			}
		})

		test('throws RangeError for non-finite, non-integer, unsafe, or negative counts', () => {
			const valid = new Map([['a', 1]])
			const badCounts = [
				NaN,
				Infinity,
				-Infinity,
				-1,
				-100,
				0.5,
				2.75,
				-0.1,
				Number.MAX_SAFE_INTEGER + 1,
				1e20,
				-Number.MAX_SAFE_INTEGER,
			]

			for (const count of badCounts) {
				assert.throws(
					() => intersectionMultisetIterative(new Map([['a', count]]), valid),
					{ name: 'RangeError' },
				)
				assert.throws(
					() => intersectionMultisetIterative(valid, new Map([['a', count]])),
					{ name: 'RangeError' },
				)
			}
		})

		test('validates all entries even for non-overlapping keys or when other Map is empty', () => {
			const empty = new Map()
			const disjointGood = new Map([['good', 2]])
			const bad = new Map([['nonOverlapping', -3]])

			assert.throws(() => intersectionMultisetIterative(bad, empty), {
				name: 'RangeError',
			})
			assert.throws(() => intersectionMultisetIterative(empty, bad), {
				name: 'RangeError',
			})
			assert.throws(() => intersectionMultisetIterative(disjointGood, bad), {
				name: 'RangeError',
			})
			assert.throws(() => intersectionMultisetIterative(bad, disjointGood), {
				name: 'RangeError',
			})
		})

		test('formats unprintable keys safely in validation error messages', () => {
			const unprintableKey = Object.create(null)
			const bad = new Map([[unprintableKey, -1]])
			assert.throws(() => intersectionMultisetIterative(bad, new Map()), {
				name: 'RangeError',
				message: /\[unprintable key\]/,
			})
		})
	})

	describe('independent cross-checks and algebraic laws', () => {
		test('cross-checks against independent array-bag matching across 100 random pairs', () => {
			const rand = createPrng(0x5eed1234)
			const universe = ['a', 'b', 'c', 'd', 'e', 'f', 1, 2, null, NaN]

			for (let trial = 0; trial < 100; trial++) {
				const a = new Map()
				const b = new Map()

				for (const key of universe) {
					if (rand() < 0.7) {
						a.set(key, Math.floor(rand() * 8)) // includes 0 counts
					}
					if (rand() < 0.7) {
						b.set(key, Math.floor(rand() * 8)) // includes 0 counts
					}
				}

				const actual = intersectionMultisetIterative(a, b)
				const expected = arrayBagIntersection(a, b)
				assertMultisetEqual(actual, expected, `trial ${trial}`)
			}
		})

		test('satisfies inclusion-exclusion |A ∪ B| + |A ∩ B| = |A| + |B|', () => {
			const rand = createPrng(0xc0ffee99)
			const universe = ['p', 'q', 'r', 's', 't', 'u', 'v', 'w']

			// Include extreme safe-integer case to verify with BigInt cardinality
			const extremePairs = [
				[
					new Map([
						['x', Number.MAX_SAFE_INTEGER],
						['y', 123456],
					]),
					new Map([
						['x', Number.MAX_SAFE_INTEGER - 7],
						['z', Number.MAX_SAFE_INTEGER],
					]),
				],
				[new Map(), new Map([['x', 10]])],
				[new Map([['x', 0]]), new Map([['x', 0]])],
			]

			for (const [a, b] of extremePairs) {
				const inter = intersectionMultisetIterative(a, b)
				const uni = unionMultiset(a, b)
				assert.equal(
					cardinality(uni) + cardinality(inter),
					cardinality(a) + cardinality(b),
				)
			}

			for (let trial = 0; trial < 100; trial++) {
				const a = new Map()
				const b = new Map()
				for (const key of universe) {
					if (rand() < 0.65) {
						a.set(key, Math.floor(rand() * 25))
					}
					if (rand() < 0.65) {
						b.set(key, Math.floor(rand() * 25))
					}
				}

				const inter = intersectionMultisetIterative(a, b)
				const uni = unionMultiset(a, b)
				assert.equal(
					cardinality(uni) + cardinality(inter),
					cardinality(a) + cardinality(b),
					`inclusion-exclusion failed on trial ${trial}`,
				)
			}
		})

		test('satisfies commutativity, associativity, idempotence, and distributivity over union', () => {
			const rand = createPrng(0xabcdef01)
			const universe = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5']

			const randomMultiset = () => {
				const m = new Map()
				for (const key of universe) {
					if (rand() < 0.7) {
						m.set(key, Math.floor(rand() * 10))
					}
				}
				return m
			}

			for (let trial = 0; trial < 50; trial++) {
				const a = randomMultiset()
				const b = randomMultiset()
				const c = randomMultiset()

				// Commutativity: A ∩ B = B ∩ A
				assertMultisetEqual(
					intersectionMultisetIterative(a, b),
					intersectionMultisetIterative(b, a),
					`commutativity trial ${trial}`,
				)

				// Associativity: (A ∩ B) ∩ C = A ∩ (B ∩ C)
				assertMultisetEqual(
					intersectionMultisetIterative(
						intersectionMultisetIterative(a, b),
						c,
					),
					intersectionMultisetIterative(
						a,
						intersectionMultisetIterative(b, c),
					),
					`associativity trial ${trial}`,
				)

				// Idempotence: A ∩ A = canonical(A)
				assertMultisetEqual(
					intersectionMultisetIterative(a, a),
					canonicalize(a),
					`idempotence trial ${trial}`,
				)

				// Distributivity: A ∩ (B ∪ C) = (A ∩ B) ∪ (A ∩ C)
				assertMultisetEqual(
					intersectionMultisetIterative(a, unionMultiset(b, c)),
					unionMultiset(
						intersectionMultisetIterative(a, b),
						intersectionMultisetIterative(a, c),
					),
					`distributivity trial ${trial}`,
				)
			}
		})
	})
})
