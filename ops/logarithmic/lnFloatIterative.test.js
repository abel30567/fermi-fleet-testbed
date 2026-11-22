import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { lnFloatIterative } from './lnFloatIterative.js'

function assertClose(actual, expected, relTol = 1e-14, absTol = 1e-15, label = '') {
	const diff = Math.abs(actual - expected)
	const limit = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= limit,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${limit} of ${expected} (diff=${diff})`
	)
}

describe('lnFloatIterative', () => {
	test('handles normal values: 1, e, powers of e, and fractions', () => {
		assert.strictEqual(lnFloatIterative(1), 0)
		assert.ok(Object.is(lnFloatIterative(1), 0), 'ln(1) should be +0')

		assertClose(lnFloatIterative(Math.E), 1, 1e-15, 1e-15, 'ln(e)')

		for (const power of [-5, -2, -1, 2, 3, 10, 20]) {
			const val = Math.exp(power)
			assertClose(lnFloatIterative(val), power, 1e-14, 1e-14, `ln(e^${power})`)
		}

		const fractions = [0.1, 0.25, 0.5, 1 / 3, 2 / 3, 0.75, 0.9999999, 1.0000001, 1.5, 2, 10]
		for (const x of fractions) {
			assertClose(lnFloatIterative(x), Math.log(x), 1e-14, 1e-15, `ln(${x})`)
		}
	})

	test('handles boundary values around range reduction thresholds', () => {
		const boundaries = [
			Math.SQRT1_2,
			Math.SQRT1_2 * (1 - 1e-12),
			Math.SQRT1_2 * (1 + 1e-12),
			Math.SQRT2,
			Math.SQRT2 * (1 - 1e-12),
			Math.SQRT2 * (1 + 1e-12),
			1 + Number.EPSILON,
			1 - Number.EPSILON / 2,
		]
		for (const x of boundaries) {
			assertClose(lnFloatIterative(x), Math.log(x), 1e-14, 1e-15, `boundary ln(${x})`)
		}
	})

	test('handles tiny positives (including subnormals) and huge positives', () => {
		const extremes = [
			Number.MIN_VALUE,
			Number.MIN_VALUE * 2,
			Number.MIN_VALUE * 1e10,
			Number.MIN_SAFE_INTEGER * -1,
			2.2250738585072014e-308, // smallest normal float64
			1e-300,
			1e-100,
			1e100,
			1e300,
			Number.MAX_VALUE / 2,
			Number.MAX_VALUE,
		]
		for (const x of extremes) {
			assertClose(lnFloatIterative(x), Math.log(x), 1e-14, 1e-15, `extreme ln(${x})`)
		}
	})

	test('handles Infinity and NaN', () => {
		assert.strictEqual(lnFloatIterative(Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY)
		assert.ok(Number.isNaN(lnFloatIterative(Number.NaN)))
	})

	test('throws RangeError for zero and negative inputs', () => {
		const invalidRange = [0, -0, -Number.MIN_VALUE, -1e-100, -1, -Math.E, -Number.MAX_VALUE, Number.NEGATIVE_INFINITY]
		for (const x of invalidRange) {
			assert.throws(
				() => lnFloatIterative(x),
				{ name: 'RangeError' },
				`Expected RangeError for ${Object.is(x, -0) ? '-0' : x}`
			)
		}
	})

	test('throws TypeError for non-number inputs', () => {
		const invalidTypes = [undefined, null, '1', '2.718', true, false, {}, [], () => 1, Symbol('x'), 1n]
		for (const x of invalidTypes) {
			assert.throws(
				() => lnFloatIterative(x),
				{ name: 'TypeError' },
				`Expected TypeError for ${String(x)}`
			)
		}
	})

	test('cross-checks against Math.log and Math.exp(ln(x)) ~= x', () => {
		const samples = [
			1e-200,
			1e-50,
			1e-10,
			0.001,
			0.37,
			0.99,
			1.01,
			2.5,
			Math.PI,
			42,
			1e6,
			1e50,
			1e200,
		]

		for (const x of samples) {
			const actual = lnFloatIterative(x)
			const expected = Math.log(x)
			assertClose(actual, expected, 1e-14, 1e-15, `Math.log(${x})`)
			assertClose(Math.exp(actual), x, 1e-12, 0, `exp(ln(${x}))`)
		}
	})
})
