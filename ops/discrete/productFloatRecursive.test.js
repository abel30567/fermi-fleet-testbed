import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { productFloatRecursive } from './productFloatRecursive.js'

describe('productFloatRecursive', () => {
	describe('normal cases', () => {
		test('multiplies positive integers', () => {
			assert.equal(productFloatRecursive([1, 2, 3, 4, 5]), 120)
			assert.equal(productFloatRecursive([2, 3]), 6)
			assert.equal(productFloatRecursive([2, 3, 5, 7]), 210)
		})

		test('handles negative numbers with even and odd counts', () => {
			assert.equal(productFloatRecursive([-2, 3, -4]), 24)
			assert.equal(productFloatRecursive([-2, -3, -4]), -24)
			assert.equal(productFloatRecursive([-1, -1, -1, -1, -1]), -1)
		})

		test('multiplies floating-point numbers across odd and even lengths', () => {
			assert.equal(productFloatRecursive([0.5, 2, 1.5, 4]), 6)
			assert.equal(productFloatRecursive([1.25, 0.8, 2.5]), 2.5)
			assert.equal(productFloatRecursive([0.25, 4, 0.5, 2, 0.125, 8, 3]), 3)
		})

		test('does not mutate the input array', () => {
			const input = [2, 3, 5, 7, 11]
			const snapshot = [...input]
			const result = productFloatRecursive(input)
			assert.equal(result, 2310)
			assert.deepEqual(input, snapshot)
		})
	})

	describe('edge cases', () => {
		test('returns multiplicative identity 1 for an empty array', () => {
			assert.equal(productFloatRecursive([]), 1)
		})

		test('returns the single element unchanged for length-1 arrays', () => {
			assert.equal(productFloatRecursive([42]), 42)
			assert.equal(productFloatRecursive([-3.5]), -3.5)
			assert.ok(Object.is(productFloatRecursive([-0]), -0))
			assert.ok(Number.isNaN(productFloatRecursive([NaN])))
		})

		test('preserves IEEE-754 zero and signed-zero semantics', () => {
			assert.ok(Object.is(productFloatRecursive([1, 0, 5]), 0))
			assert.ok(Object.is(productFloatRecursive([-1, 0]), -0))
			assert.ok(Object.is(productFloatRecursive([-0, 2]), -0))
			assert.ok(Object.is(productFloatRecursive([-0, -0]), 0))
			assert.ok(Object.is(productFloatRecursive([-1, -0, 3]), 0))
		})

		test('propagates NaN, Infinity, overflow, underflow, and subnormals per IEEE-754', () => {
			assert.ok(Number.isNaN(productFloatRecursive([1, NaN, 3])))
			assert.equal(productFloatRecursive([2, Infinity, 3]), Infinity)
			assert.equal(productFloatRecursive([-2, Infinity, 3]), -Infinity)
			assert.ok(Number.isNaN(productFloatRecursive([0, Infinity])))
			assert.equal(productFloatRecursive([1e200, 1e200]), Infinity)
			assert.equal(productFloatRecursive([-1e200, 1e200]), -Infinity)
			assert.ok(Object.is(productFloatRecursive([1e-200, 1e-200]), 0))
			assert.equal(
				productFloatRecursive([Number.MIN_VALUE, 2]),
				Number.MIN_VALUE * 2
			)
		})

		test('handles large arrays without stack overflow via O(log n) recursion depth', () => {
			const n = 100_000
			const values = new Array(n)
			for (let i = 0; i < n; i++) {
				values[i] = i % 2 === 0 ? 2 : 0.5
			}
			assert.equal(productFloatRecursive(values), 1)
		})
	})

	describe('invalid inputs', () => {
		test('throws TypeError for non-array inputs', () => {
			for (const bad of [null, undefined, 42, '123', {}, true, new Set([1, 2])]) {
				assert.throws(() => productFloatRecursive(bad), TypeError)
			}
		})

		test('throws TypeError for arrays containing non-number elements', () => {
			const invalidArrays = [
				[1, '2', 3],
				[1, null, 3],
				[1, undefined, 3],
				[1, 2n, 3],
				[1, true, 3],
				[1, {}, 3],
				[Symbol('x')]
			]
			for (const arr of invalidArrays) {
				assert.throws(() => productFloatRecursive(arr), TypeError)
			}
		})

		test('throws TypeError for sparse arrays with holes', () => {
			const sparse = new Array(3)
			assert.throws(() => productFloatRecursive(sparse), TypeError)
			// eslint-disable-next-line no-sparse-arrays
			assert.throws(() => productFloatRecursive([1, , 3]), TypeError)
		})
	})

	describe('independent cross-checks', () => {
		test('matches independent BigInt product on exact integer sequences', () => {
			const cases = [
				[2, -3, 5, -7, 11, -13, 17],
				[3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
				[-2, 4, -8, 16, -32, 64]
			]
			for (const seq of cases) {
				const expected = Number(
					seq.reduce((acc, v) => acc * BigInt(v), 1n)
				)
				assert.equal(productFloatRecursive(seq), expected)
			}
		})

		test('matches analytical closed form for telescoping product prod_{k=1..n} (k+1)/k = n+1', () => {
			const n = 500
			const terms = Array.from({ length: n }, (_, idx) => (idx + 2) / (idx + 1))
			const actual = productFloatRecursive(terms)
			const expected = n + 1
			assert.ok(
				Math.abs(actual - expected) <= 1e-11 * expected,
				`Expected ~${expected}, got ${actual}`
			)
		})

		test('matches independent log-sum exponential formula exp(sum(ln(x_i))) on positive floats', () => {
			const values = Array.from(
				{ length: 64 },
				(_, i) => 0.75 + ((i * 37) % 50) * 0.01
			)
			const actual = productFloatRecursive(values)
			const logSum = values.reduce((acc, x) => acc + Math.log(x), 0)
			const expected = Math.exp(logSum)
			const relErr = Math.abs(actual - expected) / Math.abs(expected)
			assert.ok(relErr < 1e-12, `Relative error too large: ${relErr}`)
		})

		test('matches iterative multiplication bit-for-bit on exact dyadic rationals', () => {
			const values = [0.5, 2, 0.25, 8, 1.5, 0.5, -4, 0.125, 16, -0.5, 3]
			let iterative = 1
			for (const v of values) {
				iterative *= v
			}
			assert.equal(productFloatRecursive(values), iterative)
		})
	})
})
