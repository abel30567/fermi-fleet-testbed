import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { addFloatIterative } from './addFloatIterative.js'

describe('addFloatIterative', () => {
	test('adds two positive and fractional numbers', () => {
		assert.equal(addFloatIterative(2, 3), 5)
		assert.equal(addFloatIterative(1.5, 2.25), 3.75)
		assert.equal(addFloatIterative(0.1, 0.2), 0.1 + 0.2)
	})

	test('adds negative numbers and mixed signs', () => {
		assert.equal(addFloatIterative(-4, -6), -10)
		assert.equal(addFloatIterative(-4.5, 1.5), -3)
		assert.equal(addFloatIterative(10, -3.25, -6.75), 0)
	})

	test('adds more than two numbers iteratively', () => {
		assert.equal(addFloatIterative(1, 2, 3, 4, 5), 15)
		assert.equal(addFloatIterative(-10, 2.5, 3.5, 4, 0.5), 0.5)
	})

	test('handles zeros and IEEE-754 signed zero semantics', () => {
		assert.ok(Object.is(addFloatIterative(0, 0), 0))
		assert.ok(Object.is(addFloatIterative(-0, -0), -0))
		assert.ok(Object.is(addFloatIterative(-0, 0), 0))
		assert.ok(Object.is(addFloatIterative(0, -0), 0))
		assert.ok(Object.is(addFloatIterative(-0, -0, -0), -0))
		assert.equal(addFloatIterative(0, 42.5), 42.5)
		assert.equal(addFloatIterative(-0, -42.5), -42.5)
	})

	test('handles Infinity, -Infinity, and overflow', () => {
		assert.equal(addFloatIterative(Infinity, 1), Infinity)
		assert.equal(addFloatIterative(1, Infinity), Infinity)
		assert.equal(addFloatIterative(-Infinity, -1), -Infinity)
		assert.equal(addFloatIterative(Infinity, Infinity), Infinity)
		assert.equal(addFloatIterative(-Infinity, -Infinity), -Infinity)
		assert.ok(Number.isNaN(addFloatIterative(Infinity, -Infinity)))
		assert.ok(Number.isNaN(addFloatIterative(1, Infinity, -Infinity)))
		assert.equal(addFloatIterative(Number.MAX_VALUE, Number.MAX_VALUE), Infinity)
		assert.equal(addFloatIterative(-Number.MAX_VALUE, -Number.MAX_VALUE), -Infinity)
	})

	test('handles NaN propagation', () => {
		assert.ok(Number.isNaN(addFloatIterative(NaN, 1)))
		assert.ok(Number.isNaN(addFloatIterative(1, NaN)))
		assert.ok(Number.isNaN(addFloatIterative(1, 2, NaN, 4)))
		assert.ok(Number.isNaN(addFloatIterative(Infinity, NaN)))
	})

	test('handles precision with large and small numbers and subnormals', () => {
		assert.equal(addFloatIterative(1e16, 1, -1e16), 1)
		assert.equal(addFloatIterative(1e16, 1, 1, 1, -1e16), 3)
		assert.equal(addFloatIterative(1, 1e-16, 1e-16, -1), 2e-16)
		assert.equal(
			addFloatIterative(Number.MIN_VALUE, Number.MIN_VALUE),
			2 * Number.MIN_VALUE
		)
	})

	test('throws RangeError when given fewer than two arguments', () => {
		assert.throws(() => addFloatIterative(), RangeError)
		assert.throws(() => addFloatIterative(1), RangeError)
	})

	test('throws TypeError on non-number inputs', () => {
		const invalidValues = [
			'1',
			null,
			undefined,
			true,
			false,
			{},
			[1],
			1n,
			Symbol('x'),
			new Number(1),
		]

		for (const invalid of invalidValues) {
			assert.throws(() => addFloatIterative(invalid, 1), TypeError)
			assert.throws(() => addFloatIterative(1, invalid), TypeError)
			assert.throws(() => addFloatIterative(NaN, invalid), TypeError)
			assert.throws(() => addFloatIterative(Infinity, invalid), TypeError)
		}
	})

	test('cross-checks against independent exact integer/rational computation', () => {
		// Sum of 1..1000 via closed-form arithmetic series: n * (n + 1) / 2
		const n = 1000
		const integers = Array.from({ length: n }, (_, i) => i + 1)
		const expectedSeriesSum = (n * (n + 1)) / 2
		assert.equal(addFloatIterative(...integers), expectedSeriesSum)

		// Exact dyadic rationals (k / 16) checked via scaled BigInt summation
		const numerators = [1n, -3n, 7n, 15n, -9n, 33n, 1024n, -512n, 5n, 11n]
		const floats = numerators.map((num) => Number(num) / 16)
		const exactNumeratorSum = numerators.reduce((acc, num) => acc + num, 0n)
		const expectedDyadicSum = Number(exactNumeratorSum) / 16
		assert.equal(addFloatIterative(...floats), expectedDyadicSum)

		// Repeated tenths (10000 * 0.1) compared against exact scaled decimal value
		const tenThousandTenths = Array.from({ length: 10000 }, () => 0.1)
		const compensatedSum = addFloatIterative(...tenThousandTenths)
		assert.ok(
			Math.abs(compensatedSum - 1000) < 1e-11,
			`expected compensated sum close to 1000, got ${compensatedSum}`
		)
	})
})
