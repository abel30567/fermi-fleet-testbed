import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sqrtFloatIterative } from './sqrtFloatIterative.js'

/**
 * Asserts that `actual` is within `maxRelError` relative error of `expected`.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [maxRelError=Number.EPSILON]
 */
function assertRelClose(actual, expected, maxRelError = Number.EPSILON) {
	if (expected === 0) {
		assert.equal(actual, 0)
		return
	}
	const relErr = Math.abs(actual - expected) / Math.abs(expected)
	assert.ok(
		relErr <= maxRelError,
		`Expected ${actual} to be within relative error ${maxRelError} of ${expected} (got ${relErr})`
	)
}

describe('sqrtFloatIterative', () => {
	test('computes exact roots for perfect squares and powers of four', () => {
		const cases = [
			[1, 1],
			[4, 2],
			[9, 3],
			[16, 4],
			[25, 5],
			[144, 12],
			[10000, 100],
			[0.25, 0.5],
			[2.25, 1.5],
			[0.0625, 0.25],
			[2 ** 20, 2 ** 10],
			[2 ** -20, 2 ** -10],
		]

		for (const [input, expected] of cases) {
			assert.equal(sqrtFloatIterative(input), expected)
		}
	})

	test('computes accurate roots for normal non-square inputs', () => {
		const inputs = [2, 3, 5, 7, 10, 0.5, 0.1, 1.5, 3.141592653589793, 12345.6789]

		for (const x of inputs) {
			const r = sqrtFloatIterative(x)
			assertRelClose(r, Math.sqrt(x), Number.EPSILON)
			assertRelClose(r * r, x, 2 * Number.EPSILON)
		}
	})

	test('handles zero, negative zero, one, Infinity, and NaN', () => {
		assert.ok(Object.is(sqrtFloatIterative(0), 0))
		assert.ok(Object.is(sqrtFloatIterative(-0), -0))
		assert.equal(sqrtFloatIterative(1), 1)
		assert.equal(sqrtFloatIterative(Infinity), Infinity)
		assert.ok(Number.isNaN(sqrtFloatIterative(NaN)))
	})

	test('handles subnormals and very small numbers without underflow', () => {
		const tinyInputs = [
			Number.MIN_VALUE,
			Number.MIN_VALUE * 2,
			Number.MIN_VALUE * 17,
			1e-320,
			1e-310,
			2 ** -1022,
			1e-300,
			1e-150,
			Number.EPSILON,
		]

		for (const x of tinyInputs) {
			const r = sqrtFloatIterative(x)
			assert.ok(Number.isFinite(r) && r > 0, `Expected finite positive root for ${x}, got ${r}`)
			assertRelClose(r, Math.sqrt(x), Number.EPSILON)
		}
	})

	test('handles huge numbers up to Number.MAX_VALUE without overflow', () => {
		const hugeInputs = [
			Number.MAX_SAFE_INTEGER,
			1e50,
			1e150,
			1e200,
			1e300,
			1e308,
			Number.MAX_VALUE / 2,
			Number.MAX_VALUE,
		]

		for (const x of hugeInputs) {
			const r = sqrtFloatIterative(x)
			assert.ok(Number.isFinite(r) && r > 0, `Expected finite positive root for ${x}, got ${r}`)
			assertRelClose(r, Math.sqrt(x), Number.EPSILON)
		}
	})

	test('throws RangeError on negative numbers', () => {
		const negativeInputs = [
			-Number.MIN_VALUE,
			-1e-100,
			-0.5,
			-1,
			-4,
			-1e100,
			-Number.MAX_VALUE,
			-Infinity,
		]

		for (const x of negativeInputs) {
			assert.throws(() => sqrtFloatIterative(x), RangeError)
		}
	})

	test('throws TypeError on non-number inputs', () => {
		const invalidInputs = [
			undefined,
			null,
			true,
			false,
			'4',
			'',
			{},
			[],
			[4],
			4n,
			Symbol('4'),
			() => 4,
		]

		for (const val of invalidInputs) {
			assert.throws(() => sqrtFloatIterative(val), TypeError)
		}
	})

	test('cross-checks against Math.sqrt and r * r ≈ x across magnitudes', () => {
		for (let exp = -300; exp <= 300; exp += 7) {
			for (const mantissa of [1.0, 1.37, 2.718281828459045, 3.999999999999999, 9.87654321]) {
				const x = mantissa * 10 ** exp
				const r = sqrtFloatIterative(x)
				assertRelClose(r, Math.sqrt(x), Number.EPSILON)
				assertRelClose(r * r, x, 2 * Number.EPSILON)
			}
		}
	})
})
