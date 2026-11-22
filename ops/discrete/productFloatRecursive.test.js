import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { productFloatRecursive } from './productFloatRecursive.js'

describe('productFloatRecursive', () => {
	test('computes products for normal cases across odd and even lengths', () => {
		assert.equal(productFloatRecursive([2, 3]), 6)
		assert.equal(productFloatRecursive([2, 3, 4]), 24)
		assert.equal(productFloatRecursive([1, 2, 3, 4]), 24)
		assert.equal(productFloatRecursive([1, 2, 3, 4, 5]), 120)
		assert.equal(productFloatRecursive([2, 2, 2, 2, 2, 2, 2]), 128)
		assert.equal(productFloatRecursive([3, 5, 7, 11, 13, 17, 19, 23]), 111546435)
	})

	test('handles empty array and single-element arrays', () => {
		assert.equal(productFloatRecursive([]), 1)
		assert.equal(productFloatRecursive([42]), 42)
		assert.equal(productFloatRecursive([-3.25]), -3.25)
		assert.equal(productFloatRecursive([0]), 0)
	})

	test('handles zero factors and IEEE-754 signed zero', () => {
		assert.equal(productFloatRecursive([5, 0, 7]), 0)
		assert.equal(productFloatRecursive([0, 1, 2, 3, 4]), 0)
		assert.equal(productFloatRecursive([1, 2, 3, 4, 0]), 0)
		assert.ok(Object.is(productFloatRecursive([-2, 0, 3]), -0))
		assert.ok(Object.is(productFloatRecursive([-2, -0, 3]), 0))
	})

	test('handles negative signs accurately', () => {
		assert.equal(productFloatRecursive([-2, 3, 4]), -24)
		assert.equal(productFloatRecursive([-2, -3, 4]), 24)
		assert.equal(productFloatRecursive([-2, -3, -4]), -24)
		assert.equal(productFloatRecursive([-1, -1, -1, -1, -1]), -1)
		assert.equal(productFloatRecursive([-1, -1, -1, -1, -1, -1]), 1)
	})

	test('handles fractional values', () => {
		assert.equal(productFloatRecursive([0.5, 0.25, 8]), 1)
		assert.equal(productFloatRecursive([1.5, 2.5, 4]), 15)
		assert.equal(productFloatRecursive([0.125, 0.5, 16, 0.25]), 0.25)
		assert.ok(Math.abs(productFloatRecursive([0.1, 0.2, 0.3]) - 0.006) < 1e-15)
	})

	test('handles deeper recursion on larger arrays without mutating input', () => {
		const values = Array.from({ length: 1024 }, (_, i) => (i % 2 === 0 ? 2 : 0.5))
		const snapshot = values.slice()
		assert.equal(productFloatRecursive(values), 1)
		assert.deepEqual(values, snapshot)
	})

	test('rejects invalid inputs with strict validation', () => {
		for (const bad of [null, undefined, 42, '123', {}, true, new Float64Array([1, 2])]) {
			assert.throws(() => productFloatRecursive(bad), TypeError)
		}

		for (const badArray of [
			[1, '2', 3],
			[1, null, 3],
			[1, undefined, 3],
			[1, 2n, 3],
			[true],
			[0, 'invalid-after-zero']
		]) {
			assert.throws(() => productFloatRecursive(badArray), TypeError)
		}

		// Sparse array hole
		const sparse = [1, , 3] // eslint-disable-line no-sparse-arrays
		assert.throws(() => productFloatRecursive(sparse), TypeError)

		for (const nonFinite of [
			[NaN],
			[1, NaN, 2],
			[Infinity],
			[1, -Infinity, 2],
			[0, NaN],
			[0, Infinity]
		]) {
			assert.throws(() => productFloatRecursive(nonFinite), RangeError)
		}
	})

	test('cross-check against exact factorials up to 18!', () => {
		let exactFactorial = 1n
		for (let n = 1; n <= 18; n += 1) {
			exactFactorial *= BigInt(n)
			const factors = Array.from({ length: n }, (_, i) => i + 1)
			assert.equal(productFloatRecursive(factors), Number(exactFactorial))
		}
	})

	test('cross-check against exp(sum(ln(x))) for positive floats', () => {
		const xs = [1.1, 2.3, 0.7, Math.PI, 0.42, 1.6180339887, Math.E, 0.91, 4.5, 0.37]
		const recursiveProduct = productFloatRecursive(xs)
		const logSpaceProduct = Math.exp(xs.reduce((sum, x) => sum + Math.log(x), 0))
		const relError = Math.abs(recursiveProduct - logSpaceProduct) / Math.abs(logSpaceProduct)
		assert.ok(relError < 1e-12, `relative error ${relError} exceeded 1e-12`)
	})

	test('cross-check against telescoping product prod_{k=1}^{100} (k+1)/k == 101', () => {
		const terms = Array.from({ length: 100 }, (_, i) => (i + 2) / (i + 1))
		const result = productFloatRecursive(terms)
		assert.ok(Math.abs(result - 101) < 1e-11, `expected ~101, got ${result}`)
	})
})
