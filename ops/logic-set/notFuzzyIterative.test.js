import { describe, test } from 'node:test'
import assert from 'node:assert'
import { notFuzzyIterative } from './notFuzzyIterative.js'

const EPSILON = 1e-12

function assertClose(actual, expected, eps = EPSILON) {
	assert.ok(
		Math.abs(actual - expected) <= eps,
		`Expected ${actual} to be within ${eps} of ${expected}`,
	)
}

describe('notFuzzyIterative', () => {
	describe('scalar fuzzy truth values', () => {
		test('handles boundary values 0, 1, and -0', () => {
			assert.strictEqual(notFuzzyIterative(0), 1)
			assert.strictEqual(notFuzzyIterative(-0), 1)
			const complementOfOne = notFuzzyIterative(1)
			assert.strictEqual(complementOfOne, 0)
			assert.ok(Object.is(complementOfOne, 0))
		})

		test('handles interior values and fixed point 0.5', () => {
			assert.strictEqual(notFuzzyIterative(0.5), 0.5)
			assert.strictEqual(notFuzzyIterative(0.25), 0.75)
			assert.strictEqual(notFuzzyIterative(0.75), 0.25)
			assertClose(notFuzzyIterative(0.2), 0.8)
			assertClose(notFuzzyIterative(0.37), 0.63)
			assert.strictEqual(notFuzzyIterative(Number.MIN_VALUE), 1 - Number.MIN_VALUE)
			assert.strictEqual(notFuzzyIterative(1 - Number.EPSILON), Number.EPSILON)
		})
	})

	describe('array fuzzy sets', () => {
		test('negates elements iteratively without mutating input', () => {
			const input = [0, 0.25, 0.5, 0.75, 1]
			const snapshot = [...input]
			const result = notFuzzyIterative(input)

			assert.notStrictEqual(result, input)
			assert.deepStrictEqual(result, [1, 0.75, 0.5, 0.25, 0])
			assert.deepStrictEqual(input, snapshot)
		})

		test('handles empty array', () => {
			const input = []
			const result = notFuzzyIterative(input)
			assert.notStrictEqual(result, input)
			assert.deepStrictEqual(result, [])
		})

		test('handles large arrays iteratively without stack issues', () => {
			const size = 20000
			const input = new Array(size)
			for (let i = 0; i < size; i += 1) {
				input[i] = i / (size - 1)
			}
			const result = notFuzzyIterative(input)
			assert.strictEqual(result.length, size)
			assert.strictEqual(result[0], 1)
			assert.strictEqual(result[size - 1], 0)
			assertClose(result[Math.floor(size / 2)], 1 - input[Math.floor(size / 2)])
		})
	})

	describe('Map fuzzy sets', () => {
		test('negates Map values preserving keys and insertion order without mutating input', () => {
			const objKey = { id: 1 }
			const input = new Map([
				['cold', 0],
				['warm', 0.25],
				[42, 0.5],
				[objKey, 1],
			])
			const result = notFuzzyIterative(input)

			assert.ok(result instanceof Map)
			assert.notStrictEqual(result, input)
			assert.deepStrictEqual(Array.from(result.entries()), [
				['cold', 1],
				['warm', 0.75],
				[42, 0.5],
				[objKey, 0],
			])
			assert.strictEqual(input.get('warm'), 0.25)
		})

		test('handles empty Map', () => {
			const input = new Map()
			const result = notFuzzyIterative(input)
			assert.ok(result instanceof Map)
			assert.notStrictEqual(result, input)
			assert.strictEqual(result.size, 0)
		})
	})

	describe('plain object fuzzy sets', () => {
		test('negates plain object values without mutating input', () => {
			const input = { low: 0, medium: 0.25, mid: 0.5, high: 1 }
			const result = notFuzzyIterative(input)

			assert.notStrictEqual(result, input)
			assert.deepStrictEqual(result, { low: 1, medium: 0.75, mid: 0.5, high: 0 })
			assert.strictEqual(input.medium, 0.25)
		})

		test('handles empty plain object', () => {
			const input = {}
			const result = notFuzzyIterative(input)
			assert.notStrictEqual(result, input)
			assert.deepStrictEqual(result, {})
		})

		test('preserves null-prototype plain objects', () => {
			const input = Object.create(null)
			input.a = 0.25
			input.b = 1
			const result = notFuzzyIterative(input)

			assert.strictEqual(Object.getPrototypeOf(result), null)
			assert.strictEqual(result.a, 0.75)
			assert.strictEqual(result.b, 0)
		})

		test('handles literal __proto__ own property safely', () => {
			const input = JSON.parse('{"__proto__": 0.25, "x": 0.5}')
			const result = notFuzzyIterative(input)

			assert.strictEqual(Object.getPrototypeOf(result), Object.prototype)
			assert.strictEqual(Object.prototype.hasOwnProperty.call(result, '__proto__'), true)
			assert.strictEqual(result['__proto__'], 0.75)
			assert.strictEqual(result.x, 0.5)
		})
	})

	describe('input validation', () => {
		test('rejects unsupported top-level types with TypeError', () => {
			class CustomSet {
				constructor() {
					this.a = 0.5
				}
			}

			const invalidInputs = [
				undefined,
				null,
				'0.5',
				true,
				false,
				1n,
				Symbol('fuzzy'),
				() => 0.5,
				new Set([0.5]),
				new Date(),
				/fuzzy/,
				new CustomSet(),
				new Float64Array([0.5]),
			]

			for (const bad of invalidInputs) {
				assert.throws(() => notFuzzyIterative(bad), TypeError)
			}
		})

		test('rejects out-of-range and non-finite scalars with RangeError', () => {
			const badNumbers = [-0.0001, -1, 1.0001, 2, NaN, Infinity, -Infinity]
			for (const bad of badNumbers) {
				assert.throws(() => notFuzzyIterative(bad), RangeError)
			}
		})

		test('rejects invalid elements inside arrays', () => {
			assert.throws(() => notFuzzyIterative([0.5, -0.1]), RangeError)
			assert.throws(() => notFuzzyIterative([0.5, 1.1]), RangeError)
			assert.throws(() => notFuzzyIterative([0.5, NaN]), RangeError)
			assert.throws(() => notFuzzyIterative([0.5, Infinity]), RangeError)
			assert.throws(() => notFuzzyIterative([0.5, '0.5']), TypeError)
			assert.throws(() => notFuzzyIterative([0.5, null]), TypeError)
			assert.throws(() => notFuzzyIterative([0.5, undefined]), TypeError)

			const sparse = new Array(2)
			sparse[0] = 0.5
			assert.throws(() => notFuzzyIterative(sparse), TypeError)
		})

		test('rejects invalid values inside Map and plain objects', () => {
			assert.throws(() => notFuzzyIterative(new Map([['a', -0.2]])), RangeError)
			assert.throws(() => notFuzzyIterative(new Map([['a', 1.2]])), RangeError)
			assert.throws(() => notFuzzyIterative(new Map([['a', NaN]])), RangeError)
			assert.throws(() => notFuzzyIterative(new Map([['a', '0.5']])), TypeError)

			assert.throws(() => notFuzzyIterative({ a: -0.2 }), RangeError)
			assert.throws(() => notFuzzyIterative({ a: 1.2 }), RangeError)
			assert.throws(() => notFuzzyIterative({ a: Infinity }), RangeError)
			assert.throws(() => notFuzzyIterative({ a: true }), TypeError)
		})
	})

	describe('algebraic laws and independent cross-checks', () => {
		test('satisfies double negation involution: not(not(A)) == A', () => {
			const scalarValues = [0, 0.1, 0.25, 0.3333333, 0.5, 0.7, 0.999, 1]
			for (const v of scalarValues) {
				assertClose(notFuzzyIterative(notFuzzyIterative(v)), v)
			}

			const arr = [0, 0.15, 0.42, 0.5, 0.87, 1]
			const doubleArr = notFuzzyIterative(notFuzzyIterative(arr))
			for (let i = 0; i < arr.length; i += 1) {
				assertClose(doubleArr[i], arr[i])
			}

			const map = new Map([
				['x', 0.12],
				['y', 0.5],
				['z', 0.89],
			])
			const doubleMap = notFuzzyIterative(notFuzzyIterative(map))
			for (const [k, v] of map.entries()) {
				assertClose(doubleMap.get(k), v)
			}

			const obj = { a: 0.05, b: 0.5, c: 0.95 }
			const doubleObj = notFuzzyIterative(notFuzzyIterative(obj))
			for (const k of Object.keys(obj)) {
				assertClose(doubleObj[k], obj[k])
			}
		})

		test('satisfies Zadeh De Morgan laws against independent min/max union and intersection', () => {
			const A = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1]
			const B = [1, 0.8, 0.3, 0.2, 0.9, 0.4, 0]

			// Independent Zadeh union (max) and intersection (min)
			const unionAB = A.map((a, i) => Math.max(a, B[i]))
			const interAB = A.map((a, i) => Math.min(a, B[i]))

			const notUnion = notFuzzyIterative(unionAB)
			const notInter = notFuzzyIterative(interAB)
			const notA = notFuzzyIterative(A)
			const notB = notFuzzyIterative(B)

			const interNotANotB = notA.map((a, i) => Math.min(a, notB[i]))
			const unionNotANotB = notA.map((a, i) => Math.max(a, notB[i]))

			for (let i = 0; i < A.length; i += 1) {
				// not(A ∪ B) = not(A) ∩ not(B)
				assertClose(notUnion[i], interNotANotB[i])
				// not(A ∩ B) = not(A) ∪ not(B)
				assertClose(notInter[i], unionNotANotB[i])
			}
		})

		test('matches independent integer-scaled exact reference computation and is antitonic', () => {
			const steps = 1000
			const grid = Array.from({ length: steps + 1 }, (_, k) => k / steps)
			const actual = notFuzzyIterative(grid)

			for (let k = 0; k <= steps; k += 1) {
				const reference = (steps - k) / steps
				assertClose(actual[k], reference)
				if (k > 0) {
					assert.ok(actual[k] <= actual[k - 1], 'Zadeh negation must be order-reversing')
				}
			}
		})
	})
})
