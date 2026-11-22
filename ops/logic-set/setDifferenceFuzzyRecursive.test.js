import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { setDifferenceFuzzyRecursive } from './setDifferenceFuzzyRecursive.js'

/**
 * Independent iterative reference implementation of Zadeh fuzzy set difference.
 *
 * @param {Record<string, number>} setA
 * @param {Record<string, number>} setB
 * @returns {Record<string, number>}
 */
function iterativeReference(setA, setB) {
	const result = {}
	for (const key of Object.keys(setA)) {
		const muA = setA[key]
		const muB = Object.hasOwn(setB, key) ? setB[key] : 0
		const degree = Math.min(muA, 1 - muB)
		if (degree > 0) {
			Object.defineProperty(result, key, {
				value: degree,
				enumerable: true,
				writable: true,
				configurable: true,
			})
		}
	}
	return result
}

describe('setDifferenceFuzzyRecursive', () => {
	describe('normal cases', () => {
		test('computes Zadeh fuzzy set difference min(A(x), 1 - B(x))', () => {
			const setA = { a: 0.75, b: 0.5, c: 0.25, d: 1 }
			const setB = { a: 0.5, b: 0.25, c: 0.75, d: 0.75 }
			// a: min(0.75, 0.5) = 0.5
			// b: min(0.5, 0.75) = 0.5
			// c: min(0.25, 0.25) = 0.25
			// d: min(1, 0.25) = 0.25
			const result = setDifferenceFuzzyRecursive(setA, setB)
			assert.deepStrictEqual(result, { a: 0.5, b: 0.5, c: 0.25, d: 0.25 })
		})

		test('handles partial overlap between keys of A and B', () => {
			const setA = { x: 0.8, y: 0.6, z: 0.25 }
			const setB = { y: 0.5, w: 0.9 }
			const result = setDifferenceFuzzyRecursive(setA, setB)
			assert.deepStrictEqual(result, { x: 0.8, y: 0.5, z: 0.25 })
		})

		test('does not mutate input sets', () => {
			const setA = { a: 0.75, b: 0.5 }
			const setB = { a: 0.25, c: 0.5 }
			const snapshotA = { ...setA }
			const snapshotB = { ...setB }

			const result = setDifferenceFuzzyRecursive(setA, setB)
			assert.deepStrictEqual(setA, snapshotA)
			assert.deepStrictEqual(setB, snapshotB)
			assert.notStrictEqual(result, setA)
			assert.notStrictEqual(result, setB)
		})

		test('accepts null-prototype plain objects', () => {
			const setA = Object.assign(Object.create(null), { a: 0.75, b: 0.5 })
			const setB = Object.assign(Object.create(null), { a: 0.5, b: 1 })
			assert.deepStrictEqual(setDifferenceFuzzyRecursive(setA, setB), { a: 0.5 })
		})
	})

	describe('edge cases', () => {
		test('empty sets: {} \\ {}, A \\ {}, {} \\ B', () => {
			assert.deepStrictEqual(setDifferenceFuzzyRecursive({}, {}), {})
			assert.deepStrictEqual(setDifferenceFuzzyRecursive({ a: 0.5, b: 0.25 }, {}), {
				a: 0.5,
				b: 0.25,
			})
			assert.deepStrictEqual(setDifferenceFuzzyRecursive({}, { a: 0.5, b: 1 }), {})
		})

		test('omits zero-membership elements in canonical support form', () => {
			assert.deepStrictEqual(setDifferenceFuzzyRecursive({ a: 0, b: -0, c: 0.5 }, {}), {
				c: 0.5,
			})
			assert.deepStrictEqual(setDifferenceFuzzyRecursive({ a: 0.5, b: 1 }, { a: 1, b: 1 }), {})
		})

		test('disjoint keys leave A unchanged (for positive memberships)', () => {
			const setA = { a: 0.25, b: 0.75, c: 1 }
			const setB = { d: 0.5, e: 1, f: 0.1 }
			assert.deepStrictEqual(setDifferenceFuzzyRecursive(setA, setB), {
				a: 0.25,
				b: 0.75,
				c: 1,
			})
		})

		test('crisp sets reduce to classical set difference', () => {
			const setA = { a: 1, b: 1, c: 1, d: 0 }
			const setB = { b: 1, d: 1, e: 1 }
			assert.deepStrictEqual(setDifferenceFuzzyRecursive(setA, setB), { a: 1, c: 1 })
		})

		test('A \\ A for crisp sets is empty, while for fuzzy sets equals min(A(x), 1 - A(x))', () => {
			const crispA = { a: 1, b: 0, c: 1 }
			assert.deepStrictEqual(setDifferenceFuzzyRecursive(crispA, crispA), {})

			const fuzzyA = { a: 0.5, b: 0.75, c: 0.25, d: 1, e: 0 }
			// a: min(0.5, 0.5) = 0.5
			// b: min(0.75, 0.25) = 0.25
			// c: min(0.25, 0.75) = 0.25
			// d: min(1, 0) = 0 (omitted)
			// e: min(0, 1) = 0 (omitted)
			assert.deepStrictEqual(setDifferenceFuzzyRecursive(fuzzyA, fuzzyA), {
				a: 0.5,
				b: 0.25,
				c: 0.25,
			})
		})

		test('single-element sets', () => {
			assert.deepStrictEqual(setDifferenceFuzzyRecursive({ only: 0.75 }, { only: 0.5 }), {
				only: 0.5,
			})
			assert.deepStrictEqual(setDifferenceFuzzyRecursive({ only: 0.5 }, { only: 1 }), {})
		})

		test('keys matching Object.prototype names and __proto__ are handled safely', () => {
			const setA = { toString: 0.75, constructor: 0.5, valueOf: 0.25 }
			Object.defineProperty(setA, '__proto__', {
				value: 0.5,
				enumerable: true,
				writable: true,
				configurable: true,
			})
			const setB = { constructor: 0.25 }

			const result = setDifferenceFuzzyRecursive(setA, setB)
			assert.strictEqual(result.toString, 0.75)
			assert.strictEqual(result.constructor, 0.5)
			assert.strictEqual(result.valueOf, 0.25)
			assert.strictEqual(Object.hasOwn(result, '__proto__'), true)
			assert.strictEqual(Object.getOwnPropertyDescriptor(result, '__proto__').value, 0.5)
		})
	})

	describe('input validation errors', () => {
		test('rejects non-plain-object arguments for setA and setB', () => {
			const invalidSets = [
				null,
				undefined,
				42,
				'fuzzy',
				true,
				[0.5],
				new Map([['a', 0.5]]),
				new Set(['a']),
				new Date(),
				/abc/,
				() => {},
			]

			for (const bad of invalidSets) {
				assert.throws(() => setDifferenceFuzzyRecursive(bad, {}), TypeError)
				assert.throws(() => setDifferenceFuzzyRecursive({}, bad), TypeError)
			}
		})

		test('rejects non-number membership values', () => {
			const badValues = ['0.5', true, false, null, undefined, {}, [], Symbol('x'), 1n]

			for (const val of badValues) {
				assert.throws(() => setDifferenceFuzzyRecursive({ a: val }, {}), TypeError)
				assert.throws(() => setDifferenceFuzzyRecursive({}, { a: val }), TypeError)
				assert.throws(() => setDifferenceFuzzyRecursive({ a: 0.5 }, { b: val }), TypeError)
			}
		})

		test('rejects non-finite and out-of-range membership values', () => {
			const outOfRange = [NaN, Infinity, -Infinity, -0.0001, -1, 1.0001, 2, Number.MAX_VALUE]

			for (const val of outOfRange) {
				assert.throws(() => setDifferenceFuzzyRecursive({ a: val }, {}), RangeError)
				assert.throws(() => setDifferenceFuzzyRecursive({}, { a: val }), RangeError)
				assert.throws(() => setDifferenceFuzzyRecursive({ a: 0.5 }, { b: val }), RangeError)
			}
		})
	})

	describe('cross-check against independent iterative computation and algebraic properties', () => {
		test('matches iterative reference across deterministic pseudo-random fuzzy sets', () => {
			// Deterministic linear congruential generator for reproducible tests
			let seed = 1337
			const nextRand = () => {
				seed = (seed * 1664525 + 1013904223) >>> 0
				return seed / 0xffffffff
			}

			for (let trial = 0; trial < 50; trial++) {
				const sizeA = trial % 25
				const sizeB = (trial * 7) % 25
				const setA = {}
				const setB = {}

				for (let i = 0; i < sizeA; i++) {
					const key = `k${(trial + i * 3) % 30}`
					const r = nextRand()
					setA[key] = r < 0.1 ? 0 : r > 0.9 ? 1 : r
				}
				for (let i = 0; i < sizeB; i++) {
					const key = `k${(trial * 2 + i * 5) % 30}`
					const r = nextRand()
					setB[key] = r < 0.1 ? 0 : r > 0.9 ? 1 : r
				}

				const recursiveResult = setDifferenceFuzzyRecursive(setA, setB)
				const iterativeResult = iterativeReference(setA, setB)

				assert.deepStrictEqual(recursiveResult, iterativeResult)

				// Verify Zadeh bounds: 0 <= (A \ B)(x) <= min(A(x), 1 - B(x)) <= A(x)
				for (const key of Object.keys(setA)) {
					const out = Object.hasOwn(recursiveResult, key) ? recursiveResult[key] : 0
					const muA = setA[key]
					const muB = Object.hasOwn(setB, key) ? setB[key] : 0
					assert.ok(out >= 0 && out <= 1)
					assert.ok(out <= muA)
					assert.ok(out <= 1 - muB)
				}
			}
		})

		test('matches iterative reference on a large fuzzy set without stack overflow', () => {
			const setA = {}
			const setB = {}
			const count = 10000

			for (let i = 0; i < count; i++) {
				setA[`e${i}`] = (i % 101) / 100
				if (i % 2 === 0) {
					setB[`e${i}`] = ((i * 3) % 101) / 100
				}
			}

			const recursiveResult = setDifferenceFuzzyRecursive(setA, setB)
			const iterativeResult = iterativeReference(setA, setB)
			assert.deepStrictEqual(recursiveResult, iterativeResult)
		})
	})
})
