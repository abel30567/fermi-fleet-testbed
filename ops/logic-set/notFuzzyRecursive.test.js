import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { notFuzzyRecursive } from './notFuzzyRecursive.js'

const EPSILON = 1e-12

function assertClose(actual, expected, eps = EPSILON) {
	assert.ok(
		Math.abs(actual - expected) <= eps,
		`Expected ${actual} to be within ${eps} of ${expected}`
	)
}

describe('notFuzzyRecursive', () => {
	describe('normal cases', () => {
		test('computes Zadeh NOT (1 - x) for scalar membership values', () => {
			assertClose(notFuzzyRecursive(0.2), 0.8)
			assertClose(notFuzzyRecursive(0.35), 0.65)
			assertClose(notFuzzyRecursive(0.75), 0.25)
			assertClose(notFuzzyRecursive(0.9), 0.1)
		})

		test('computes Zadeh NOT over arrays of odd and even lengths without mutating input', () => {
			const evenInput = [0, 0.25, 0.5, 1]
			const evenCopy = [...evenInput]
			assert.deepStrictEqual(notFuzzyRecursive(evenInput), [1, 0.75, 0.5, 0])
			assert.deepStrictEqual(evenInput, evenCopy)

			const oddInput = [0.1, 0.3, 0.5, 0.7, 0.9]
			const oddResult = notFuzzyRecursive(oddInput)
			const expectedOdd = [0.9, 0.7, 0.5, 0.3, 0.1]
			assert.equal(oddResult.length, expectedOdd.length)
			for (let i = 0; i < expectedOdd.length; i++) {
				assertClose(oddResult[i], expectedOdd[i])
			}
		})

		test('computes Zadeh NOT over plain-object fuzzy sets without mutating input', () => {
			const fuzzySet = { cold: 0.2, mild: 0.5, warm: 0.75, hot: 1 }
			const snapshot = { ...fuzzySet }
			const result = notFuzzyRecursive(fuzzySet)

			assert.deepStrictEqual(fuzzySet, snapshot)
			assert.deepStrictEqual(Object.keys(result), ['cold', 'mild', 'warm', 'hot'])
			assertClose(result.cold, 0.8)
			assert.equal(result.mild, 0.5)
			assert.equal(result.warm, 0.25)
			assert.equal(result.hot, 0)
		})

		test('supports null-prototype fuzzy set objects', () => {
			const nullProtoSet = Object.assign(Object.create(null), { a: 0, b: 0.25, c: 1 })
			const result = notFuzzyRecursive(nullProtoSet)
			assert.equal(Object.getPrototypeOf(result), null)
			assert.equal(result.a, 1)
			assert.equal(result.b, 0.75)
			assert.equal(result.c, 0)
		})
	})

	describe('edge cases and algebraic properties', () => {
		test('handles boundary values 0, -0, 0.5, and 1', () => {
			assert.strictEqual(notFuzzyRecursive(0), 1)
			assert.strictEqual(notFuzzyRecursive(-0), 1)
			assert.strictEqual(notFuzzyRecursive(0.5), 0.5)
			assert.strictEqual(notFuzzyRecursive(1), 0)
			assert.ok(!Object.is(notFuzzyRecursive(1), -0))
		})

		test('handles empty and single-element arrays and objects', () => {
			assert.deepStrictEqual(notFuzzyRecursive([]), [])
			assert.deepStrictEqual(notFuzzyRecursive([0.25]), [0.75])
			assert.deepStrictEqual(notFuzzyRecursive({}), {})
			assert.deepStrictEqual(notFuzzyRecursive({ only: 0.5 }), { only: 0.5 })
		})

		test('satisfies involution property: not(not(x)) = x', () => {
			const exactValues = [0, 0.25, 0.5, 0.75, 1]
			for (const x of exactValues) {
				assert.strictEqual(notFuzzyRecursive(notFuzzyRecursive(x)), x)
			}

			const generalValues = [0.0001, 0.1, 0.3, 1 / 3, 0.61803398875, 0.9999]
			for (const x of generalValues) {
				assertClose(notFuzzyRecursive(notFuzzyRecursive(x)), x)
			}

			const arrayDouble = notFuzzyRecursive(notFuzzyRecursive(generalValues))
			assert.equal(arrayDouble.length, generalValues.length)
			for (let i = 0; i < generalValues.length; i++) {
				assertClose(arrayDouble[i], generalValues[i])
			}

			const obj = { a: 0.1, b: 0.5, c: 0.9 }
			const objDouble = notFuzzyRecursive(notFuzzyRecursive(obj))
			assertClose(objDouble.a, obj.a)
			assert.strictEqual(objDouble.b, obj.b)
			assertClose(objDouble.c, obj.c)
		})

		test('is strictly order-reversing (antitonic): x < y => not(x) > not(y)', () => {
			const ascending = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]
			const complemented = notFuzzyRecursive(ascending)
			for (let i = 0; i < complemented.length - 1; i++) {
				assert.ok(complemented[i] > complemented[i + 1])
			}
		})
	})

	describe('input validation errors', () => {
		test('throws RangeError for numbers outside [0, 1] or non-finite numbers', () => {
			const invalidNumbers = [
				-Number.EPSILON,
				-0.0001,
				-1,
				1 + Number.EPSILON,
				1.0001,
				2,
				Number.NaN,
				Number.POSITIVE_INFINITY,
				Number.NEGATIVE_INFINITY
			]

			for (const bad of invalidNumbers) {
				assert.throws(() => notFuzzyRecursive(bad), RangeError)
				assert.throws(() => notFuzzyRecursive([0.5, bad, 0.2]), RangeError)
				assert.throws(() => notFuzzyRecursive({ ok: 0.5, bad }), RangeError)
			}
		})

		test('throws TypeError for wrong top-level types', () => {
			const invalidInputs = [
				undefined,
				null,
				'0.5',
				'',
				true,
				false,
				1n,
				Symbol('fuzzy'),
				() => 0.5,
				new Date(),
				new Map([['a', 0.5]]),
				new Set([0.5]),
				/0\.5/,
				new Number(0.5)
			]

			for (const bad of invalidInputs) {
				assert.throws(() => notFuzzyRecursive(bad), TypeError)
			}
		})

		test('throws TypeError for wrong element types in arrays and objects, and for sparse arrays', () => {
			assert.throws(() => notFuzzyRecursive([0.2, '0.5']), TypeError)
			assert.throws(() => notFuzzyRecursive([0.2, null]), TypeError)
			assert.throws(() => notFuzzyRecursive([0.2, undefined]), TypeError)
			assert.throws(() => notFuzzyRecursive([0.2, true]), TypeError)
			assert.throws(() => notFuzzyRecursive([[0.2]]), TypeError)
			assert.throws(() => notFuzzyRecursive({ a: 0.2, b: '0.5' }), TypeError)
			assert.throws(() => notFuzzyRecursive({ a: null }), TypeError)

			// Sparse array with a hole
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [0.2, , 0.8]
			assert.throws(() => notFuzzyRecursive(sparse), TypeError)
			assert.throws(() => notFuzzyRecursive(new Array(3)), TypeError)
		})
	})

	describe('cross-check against independent iterative computation', () => {
		test('matches independent iterative Zadeh NOT across large array and object sets', () => {
			// Deterministic pseudo-random generator (LCG) producing values in [0, 1]
			let seed = 42
			const nextUnit = () => {
				seed = (seed * 1664525 + 1013904223) >>> 0
				return seed / 0xffffffff
			}

			const size = 257 // non-power-of-two size to exercise asymmetric splits
			const arr = []
			const obj = {}
			for (let i = 0; i < size; i++) {
				const v = i === 0 ? 0 : i === size - 1 ? 1 : nextUnit()
				arr.push(v)
				obj[`elem_${i}`] = v
			}

			// Independent iterative reference implementation
			const iterativeArray = []
			for (let i = 0; i < arr.length; i++) {
				const c = 1 - arr[i]
				iterativeArray.push(c === 0 ? 0 : c)
			}

			const iterativeObj = {}
			for (const [k, v] of Object.entries(obj)) {
				const c = 1 - v
				iterativeObj[k] = c === 0 ? 0 : c
			}

			assert.deepStrictEqual(notFuzzyRecursive(arr), iterativeArray)
			assert.deepStrictEqual(notFuzzyRecursive(obj), iterativeObj)
		})
	})
})
