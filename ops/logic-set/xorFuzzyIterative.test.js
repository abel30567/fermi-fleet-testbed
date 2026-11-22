import { describe, test } from 'node:test'
import assert from 'node:assert'
import { xorFuzzyIterative } from './xorFuzzyIterative.js'

const EPSILON = 1e-12

function assertClose(actual, expected, message) {
	assert.ok(
		Math.abs(actual - expected) <= EPSILON,
		message ?? `Expected ${actual} to be within ${EPSILON} of ${expected}`
	)
}

/**
 * Independent Zadeh set-theoretic symmetric difference: (A \ B) ∪ (B \ A)
 * where NOT(x) = 1 - x, AND(x, y) = min(x, y), OR(x, y) = max(x, y),
 * and DIFF(x, y) = AND(x, NOT(y)).
 */
function zadehNot(x) {
	return 1 - x
}

function zadehAnd(x, y) {
	return x < y ? x : y
}

function zadehOr(x, y) {
	return x > y ? x : y
}

function zadehSymmetricDifferenceScalar(a, b) {
	const aMinusB = zadehAnd(a, zadehNot(b))
	const bMinusA = zadehAnd(b, zadehNot(a))
	return zadehOr(aMinusB, bMinusA)
}

/**
 * Independent algebraic equivalent in Zadeh logic: (A ∪ B) ∩ ¬(A ∩ B).
 */
function zadehUnionMinusIntersectionScalar(a, b) {
	return zadehAnd(zadehOr(a, b), zadehNot(zadehAnd(a, b)))
}

describe('xorFuzzyIterative', () => {
	describe('crisp boolean truth table cross-check', () => {
		test('matches boolean XOR on scalar 0/1 inputs', () => {
			const table = [
				[0, 0, 0],
				[0, 1, 1],
				[1, 0, 1],
				[1, 1, 0],
			]
			for (const [a, b, expected] of table) {
				const booleanXor = Number(Boolean(a) !== Boolean(b))
				assert.strictEqual(xorFuzzyIterative(a, b), expected)
				assert.strictEqual(xorFuzzyIterative(a, b), booleanXor)
			}
		})

		test('matches boolean XOR on crisp arrays and fuzzy set objects', () => {
			const arrA = [0, 0, 1, 1]
			const arrB = [0, 1, 0, 1]
			assert.deepStrictEqual(xorFuzzyIterative(arrA, arrB), [0, 1, 1, 0])

			const setA = { p: 0, q: 0, r: 1, s: 1 }
			const setB = { p: 0, q: 1, r: 0, s: 1 }
			assert.deepStrictEqual(xorFuzzyIterative(setA, setB), {
				p: 0,
				q: 1,
				r: 1,
				s: 0,
			})
		})
	})

	describe('scalar fuzzy membership values', () => {
		test('computes expected Zadeh XOR for normal fuzzy values', () => {
			assert.strictEqual(xorFuzzyIterative(0.5, 0.5), 0.5)
			assert.strictEqual(xorFuzzyIterative(0.25, 0.75), 0.75)
			assertClose(xorFuzzyIterative(0.2, 0.8), 0.8)
			assertClose(xorFuzzyIterative(0.8, 0.9), 0.2)
			assertClose(xorFuzzyIterative(0.3, 0.4), 0.4)
			assertClose(xorFuzzyIterative(0.6, 0.7), 0.4)
		})

		test('satisfies boundary, identity, complement, and symmetry properties', () => {
			const samples = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]
			for (const a of samples) {
				assertClose(xorFuzzyIterative(a, 0), a)
				assertClose(xorFuzzyIterative(0, a), a)
				assertClose(xorFuzzyIterative(a, 1), 1 - a)
				assertClose(xorFuzzyIterative(1, a), 1 - a)
				assertClose(xorFuzzyIterative(a, a), Math.min(a, 1 - a))
				for (const b of samples) {
					const ab = xorFuzzyIterative(a, b)
					const ba = xorFuzzyIterative(b, a)
					assert.strictEqual(ab, ba)
					assert.ok(ab >= 0 && ab <= 1)
				}
			}
		})

		test('normalizes -0 to +0', () => {
			assert.ok(Object.is(xorFuzzyIterative(-0, -0), 0))
			assert.ok(Object.is(xorFuzzyIterative(-0, 0), 0))
		})
	})

	describe('array fuzzy sets', () => {
		test('computes element-wise Zadeh XOR iteratively without mutating inputs', () => {
			const a = [0, 0.25, 0.5, 0.75, 1]
			const b = [0.5, 0.75, 0.5, 0.25, 0.25]
			const snapshotA = [...a]
			const snapshotB = [...b]

			const result = xorFuzzyIterative(a, b)
			assert.deepStrictEqual(result, [0.5, 0.75, 0.5, 0.75, 0.75])
			assert.deepStrictEqual(a, snapshotA)
			assert.deepStrictEqual(b, snapshotB)
		})

		test('handles empty and single-element arrays', () => {
			assert.deepStrictEqual(xorFuzzyIterative([], []), [])
			assert.deepStrictEqual(xorFuzzyIterative([0.25], [0.5]), [0.5])
		})
	})

	describe('plain object fuzzy sets', () => {
		test('computes Zadeh XOR over overlapping and disjoint keys without mutating inputs', () => {
			const a = { cold: 0.75, warm: 0.5, hot: 0.25 }
			const b = { warm: 0.25, hot: 0.75, boiling: 1 }
			const snapshotA = { ...a }
			const snapshotB = { ...b }

			const result = xorFuzzyIterative(a, b)
			assert.deepStrictEqual(result, {
				cold: 0.75,
				warm: 0.5,
				hot: 0.75,
				boiling: 1,
			})
			assert.deepStrictEqual(a, snapshotA)
			assert.deepStrictEqual(b, snapshotB)
		})

		test('handles empty fuzzy set objects and null-prototype objects', () => {
			assert.deepStrictEqual(xorFuzzyIterative({}, {}), {})
			assert.deepStrictEqual(xorFuzzyIterative({ x: 0.5 }, {}), { x: 0.5 })
			assert.deepStrictEqual(xorFuzzyIterative({}, { y: 0.25 }), { y: 0.25 })

			const nullProtoA = Object.create(null)
			nullProtoA.alpha = 0.25
			const nullProtoB = Object.create(null)
			nullProtoB.alpha = 0.75
			nullProtoB.beta = 0.5
			assert.deepStrictEqual(xorFuzzyIterative(nullProtoA, nullProtoB), {
				alpha: 0.75,
				beta: 0.5,
			})
		})
	})

	describe('independent cross-checks', () => {
		test('matches Zadeh symmetric difference (A \\ B) ∪ (B \\ A) and (A ∪ B) ∩ ¬(A ∩ B)', () => {
			const grid = [0, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 1]

			for (const a of grid) {
				for (const b of grid) {
					const actual = xorFuzzyIterative(a, b)
					const symDiff = zadehSymmetricDifferenceScalar(a, b)
					const unionMinusInter = zadehUnionMinusIntersectionScalar(a, b)
					assertClose(actual, symDiff)
					assertClose(actual, unionMinusInter)
				}
			}

			const vecA = [0, 0.15, 0.4, 0.5, 0.7, 0.95, 1]
			const vecB = [1, 0.85, 0.6, 0.5, 0.3, 0.2, 0]
			const vecActual = xorFuzzyIterative(vecA, vecB)
			for (let i = 0; i < vecA.length; i += 1) {
				assertClose(vecActual[i], zadehSymmetricDifferenceScalar(vecA[i], vecB[i]))
			}

			const setA = { u1: 0.1, u2: 0.6, u3: 0.9, u4: 1 }
			const setB = { u2: 0.4, u3: 0.8, u4: 1, u5: 0.3 }
			const setActual = xorFuzzyIterative(setA, setB)
			const allKeys = new Set([...Object.keys(setA), ...Object.keys(setB)])
			assert.strictEqual(Object.keys(setActual).length, allKeys.size)
			for (const key of allKeys) {
				const muA = Object.hasOwn(setA, key) ? setA[key] : 0
				const muB = Object.hasOwn(setB, key) ? setB[key] : 0
				assertClose(setActual[key], zadehSymmetricDifferenceScalar(muA, muB))
			}
		})
	})

	describe('input validation', () => {
		test('throws RangeError for out-of-range or non-finite numbers', () => {
			assert.throws(() => xorFuzzyIterative(-0.01, 0.5), RangeError)
			assert.throws(() => xorFuzzyIterative(0.5, 1.01), RangeError)
			assert.throws(() => xorFuzzyIterative(Infinity, 0.5), RangeError)
			assert.throws(() => xorFuzzyIterative(0.5, -Infinity), RangeError)
			assert.throws(() => xorFuzzyIterative([0.2, 1.5], [0.2, 0.5]), RangeError)
			assert.throws(() => xorFuzzyIterative({ a: -0.1 }, { a: 0.5 }), RangeError)
			assert.throws(() => xorFuzzyIterative({}, { b: 2 }), RangeError)
		})

		test('throws RangeError for mismatched array lengths', () => {
			assert.throws(() => xorFuzzyIterative([0.1, 0.2], [0.1]), RangeError)
			assert.throws(() => xorFuzzyIterative([], [0.5]), RangeError)
		})

		test('throws TypeError for NaN, invalid types, mismatched shapes, non-plain objects, and sparse arrays', () => {
			assert.throws(() => xorFuzzyIterative(NaN, 0.5), TypeError)
			assert.throws(() => xorFuzzyIterative(0.5, NaN), TypeError)
			assert.throws(() => xorFuzzyIterative(0.5), TypeError)
			assert.throws(() => xorFuzzyIterative(), TypeError)
			assert.throws(() => xorFuzzyIterative('0.5', 0.5), TypeError)
			assert.throws(() => xorFuzzyIterative(true, false), TypeError)
			assert.throws(() => xorFuzzyIterative(null, null), TypeError)
			assert.throws(() => xorFuzzyIterative(0.5, [0.5]), TypeError)
			assert.throws(() => xorFuzzyIterative([0.5], { a: 0.5 }), TypeError)
			assert.throws(() => xorFuzzyIterative(0.5, { a: 0.5 }), TypeError)
			assert.throws(() => xorFuzzyIterative(new Map(), new Map()), TypeError)
			assert.throws(() => xorFuzzyIterative(new Set(), new Set()), TypeError)
			assert.throws(() => xorFuzzyIterative(new Date(), new Date()), TypeError)
			assert.throws(() => xorFuzzyIterative([NaN], [0.5]), TypeError)
			assert.throws(() => xorFuzzyIterative([0.5], ['0.5']), TypeError)
			assert.throws(() => xorFuzzyIterative({ a: '0.5' }, { a: 0.5 }), TypeError)

			const sparse = new Array(2)
			sparse[0] = 0.5
			assert.throws(() => xorFuzzyIterative(sparse, [0.5, 0.5]), TypeError)
			assert.throws(() => xorFuzzyIterative([0.5, 0.5], sparse), TypeError)
		})
	})
})
