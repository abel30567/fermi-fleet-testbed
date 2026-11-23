import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { productFloatIterative } from './productFloatIterative.js'

describe('productFloatIterative', () => {
	describe('normal cases', () => {
		test('computes product of positive integers', () => {
			assert.equal(productFloatIterative([1, 2, 3, 4]), 24)
			assert.equal(productFloatIterative([2, 5, 10]), 100)
		})

		test('computes product of exact binary fractions and decimals', () => {
			assert.equal(productFloatIterative([0.5, 1.5, 2, 4]), 6)
			const decimalProduct = productFloatIterative([0.1, 0.2, 0.3])
			assert.ok(
				Math.abs(decimalProduct - 0.006) < 1e-15,
				`Expected ~0.006, got ${decimalProduct}`,
			)
		})

		test('handles negative numbers with even and odd counts', () => {
			assert.equal(productFloatIterative([-2, 3, -4]), 24)
			assert.equal(productFloatIterative([-2, 3, -4, -5]), -120)
		})

		test('accepts typed arrays, sets, and generators', () => {
			assert.equal(
				productFloatIterative(new Float64Array([1.5, 2, 4])),
				12,
			)
			assert.equal(productFloatIterative(new Set([2, 3, 5])), 30)

			function* gen() {
				yield 2
				yield 3
				yield 7
			}
			assert.equal(productFloatIterative(gen()), 42)
		})
	})

	describe('edge cases', () => {
		test('returns multiplicative identity 1 for empty iterables', () => {
			assert.equal(productFloatIterative([]), 1)
			assert.equal(productFloatIterative(new Float64Array(0)), 1)
			assert.equal(productFloatIterative(new Set()), 1)
		})

		test('returns the element itself for single-element iterables', () => {
			assert.equal(productFloatIterative([42.5]), 42.5)
			assert.equal(productFloatIterative([-7]), -7)
			assert.ok(Object.is(productFloatIterative([0]), 0))
			assert.ok(Object.is(productFloatIterative([-0]), -0))
		})

		test('preserves IEEE-754 zero and signed zero semantics', () => {
			assert.ok(Object.is(productFloatIterative([5, 0, 10]), 0))
			assert.ok(Object.is(productFloatIterative([-1, 0]), -0))
			assert.ok(Object.is(productFloatIterative([-1, -0]), 0))
			assert.ok(Object.is(productFloatIterative([1, -0]), -0))
		})

		test('handles IEEE-754 overflow and underflow', () => {
			assert.equal(productFloatIterative([1e200, 1e200]), Infinity)
			assert.equal(productFloatIterative([-1e200, 1e200]), -Infinity)
			assert.ok(Object.is(productFloatIterative([1e-200, 1e-200]), 0))
			assert.ok(Object.is(productFloatIterative([-1e-200, 1e-200]), -0))
		})

		test('handles complementary powers of two without rounding loss', () => {
			assert.equal(productFloatIterative([2 ** -50, 2 ** 50]), 1)
			assert.equal(
				productFloatIterative([2 ** -100, 2 ** 50, 2 ** 50]),
				1,
			)
		})
	})

	describe('input validation', () => {
		test('throws TypeError for non-iterable or string inputs', () => {
			for (const invalid of [null, undefined, 123, true, {}, '123']) {
				assert.throws(
					() => productFloatIterative(invalid),
					{ name: 'TypeError' },
				)
			}
		})

		test('throws TypeError for non-number elements including after zero', () => {
			for (const bad of ['2', null, undefined, 2n, {}, true]) {
				assert.throws(
					() => productFloatIterative([1, bad]),
					{ name: 'TypeError' },
				)
				assert.throws(
					() => productFloatIterative([0, bad]),
					{ name: 'TypeError' },
				)
			}
		})

		test('throws RangeError for non-finite elements including after zero', () => {
			for (const bad of [NaN, Infinity, -Infinity]) {
				assert.throws(
					() => productFloatIterative([1, bad]),
					{ name: 'RangeError' },
				)
				assert.throws(
					() => productFloatIterative([0, bad]),
					{ name: 'RangeError' },
				)
			}
		})
	})

	describe('independent cross-checks', () => {
		test('matches exact BigInt factorial for n = 0..18', () => {
			let expectedBig = 1n
			for (let n = 0; n <= 18; n += 1) {
				if (n > 0) {
					expectedBig *= BigInt(n)
				}
				const factors = Array.from({ length: n }, (_, i) => i + 1)
				assert.equal(
					productFloatIterative(factors),
					Number(expectedBig),
				)
			}
		})

		test('satisfies telescoping product prod_{k=1}^{n} (k+1)/k = n + 1', () => {
			const n = 100
			const terms = Array.from({ length: n }, (_, i) => (i + 2) / (i + 1))
			const result = productFloatIterative(terms)
			assert.ok(
				Math.abs(result - (n + 1)) < 1e-11,
				`Expected ${n + 1}, got ${result}`,
			)
		})

		test('matches exponentiation for repeated binary-exact base and exp(sum(log))', () => {
			const repeated = Array.from({ length: 10 }, () => 1.5)
			assert.equal(productFloatIterative(repeated), 1.5 ** 10)

			const values = [1.2, 2.5, 0.75, 3.1, 0.4, 5.25]
			const viaLog = Math.exp(
				values.reduce((acc, x) => acc + Math.log(x), 0),
			)
			const direct = productFloatIterative(values)
			assert.ok(
				Math.abs(direct - viaLog) <= 1e-12 * Math.abs(viaLog),
				`Expected ~${viaLog}, got ${direct}`,
			)
		})
	})
})
