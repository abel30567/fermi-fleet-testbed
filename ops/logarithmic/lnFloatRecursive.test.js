import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { lnFloatRecursive } from './lnFloatRecursive.js'

/**
 * Asserts that `actual` is within a tight relative tolerance of `expected`
 * (or absolute tolerance when `expected` is 0).
 */
function assertClose(actual, expected, relTol = 1e-14, label = '') {
	assert.equal(typeof actual, 'number', `${label}: result must be a number`)
	assert.ok(Number.isFinite(actual), `${label}: expected finite result, got ${actual}`)
	if (expected === 0) {
		assert.ok(Math.abs(actual) <= relTol, `${label}: expected ~0, got ${actual}`)
		return
	}
	const relErr = Math.abs(actual - expected) / Math.abs(expected)
	assert.ok(
		relErr <= relTol,
		`${label}: expected ${expected}, got ${actual} (relErr=${relErr} > ${relTol})`,
	)
}

describe('lnFloatRecursive', () => {
	describe('input validation', () => {
		test('throws TypeError for non-number inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				'1',
				'2.71828',
				'',
				true,
				false,
				2n,
				{},
				[],
				[2],
				Symbol('x'),
				() => 1,
			]
			for (const bad of invalidInputs) {
				assert.throws(
					() => lnFloatRecursive(bad),
					{ name: 'TypeError' },
					`expected TypeError for ${String(bad)}`,
				)
			}
			assert.throws(() => lnFloatRecursive(), { name: 'TypeError' })
		})
	})

	describe('IEEE-754 special values', () => {
		test('handles NaN and negative numbers', () => {
			assert.ok(Number.isNaN(lnFloatRecursive(NaN)))
			assert.ok(Number.isNaN(lnFloatRecursive(-Infinity)))
			assert.ok(Number.isNaN(lnFloatRecursive(-1)))
			assert.ok(Number.isNaN(lnFloatRecursive(-0.5)))
			assert.ok(Number.isNaN(lnFloatRecursive(-Number.MIN_VALUE)))
			assert.ok(Number.isNaN(lnFloatRecursive(-Number.MAX_VALUE)))
		})

		test('handles zero, one, and +Infinity', () => {
			assert.equal(lnFloatRecursive(0), -Infinity)
			assert.equal(lnFloatRecursive(-0), -Infinity)
			assert.ok(Object.is(lnFloatRecursive(1), 0), 'ln(1) must be +0')
			assert.equal(lnFloatRecursive(Infinity), Infinity)
		})
	})

	describe('normal cases and mathematical constants', () => {
		test('computes known logarithms accurately', () => {
			assertClose(lnFloatRecursive(Math.E), 1, 1e-15, 'ln(e)')
			assertClose(lnFloatRecursive(2), Math.LN2, 1e-15, 'ln(2)')
			assertClose(lnFloatRecursive(10), Math.LN10, 1e-15, 'ln(10)')
			assertClose(lnFloatRecursive(0.5), -Math.LN2, 1e-15, 'ln(0.5)')
			assertClose(lnFloatRecursive(Math.SQRT2), 0.5 * Math.LN2, 1e-15, 'ln(sqrt(2))')
			assertClose(lnFloatRecursive(Math.SQRT1_2), -0.5 * Math.LN2, 1e-15, 'ln(sqrt(1/2))')
			assertClose(lnFloatRecursive(Math.E ** 5), 5, 1e-15, 'ln(e^5)')
			assertClose(lnFloatRecursive(Math.E ** -5), -5, 1e-15, 'ln(e^-5)')
		})

		test('handles exact powers of two across the entire float64 exponent range', () => {
			const exponents = [-1074, -1050, -1023, -1022, -513, -512, -511, -100, -1, 1, 2, 100, 511, 512, 513, 1022, 1023]
			for (const exp of exponents) {
				const x = 2 ** exp
				const expected = Math.log(x)
				assertClose(lnFloatRecursive(x), expected, 1e-15, `ln(2^${exp})`)
			}
		})
	})

	describe('extreme magnitudes and precision boundaries', () => {
		test('handles subnormals and Number.MIN_VALUE', () => {
			const subnormals = [
				Number.MIN_VALUE,
				Number.MIN_VALUE * 2,
				Number.MIN_VALUE * 3,
				Number.MIN_VALUE * 1023,
				1e-320,
				1e-315,
				2.225073858507201e-308, // largest subnormal
				2.2250738585072014e-308, // smallest normal (2^-1022)
			]
			for (const x of subnormals) {
				assertClose(lnFloatRecursive(x), Math.log(x), 1e-15, `subnormal ln(${x})`)
			}
		})

		test('handles very large floats including Number.MAX_VALUE', () => {
			const largeValues = [
				1e100,
				1e200,
				1e300,
				1e308,
				Number.MAX_VALUE * 0.5,
				Number.MAX_VALUE,
			]
			for (const x of largeValues) {
				assertClose(lnFloatRecursive(x), Math.log(x), 1e-15, `large ln(${x})`)
			}
		})

		test('preserves accuracy very close to 1 and around reduction boundaries', () => {
			const nearValues = [
				1 + Number.EPSILON,
				1 - Number.EPSILON / 2,
				1 + 1e-12,
				1 - 1e-12,
				1 + 1e-8,
				1 - 1e-8,
				1 + 1e-4,
				1 - 1e-4,
				Math.SQRT1_2 - 1e-15,
				Math.SQRT1_2,
				Math.SQRT1_2 + 1e-15,
				Math.SQRT2 - 1e-15,
				Math.SQRT2,
				Math.SQRT2 + 1e-15,
			]
			for (const x of nearValues) {
				assertClose(lnFloatRecursive(x), Math.log(x), 1e-14, `boundary ln(${x})`)
			}
		})
	})

	describe('independent cross-checks', () => {
		test('matches Math.log across a log-spaced sweep of positive float64 values', () => {
			for (let exp = -322; exp <= 307; exp += 3) {
				for (const mantissa of [1.0, 1.37, 2.718281828459045, 5.5, 9.999999999999]) {
					const x = mantissa * 10 ** exp
					if (!Number.isFinite(x) || x <= 0) continue
					assertClose(lnFloatRecursive(x), Math.log(x), 1e-15, `sweep ln(${x})`)
				}
			}
		})

		test('satisfies inverse identity Math.exp(lnFloatRecursive(x)) == x', () => {
			const values = [
				1e-300,
				1e-100,
				1e-10,
				0.00123456789,
				0.5,
				0.9999999,
				1.0000001,
				1.5,
				Math.PI,
				42,
				1e10,
				1e100,
				1e300,
			]
			for (const x of values) {
				const y = lnFloatRecursive(x)
				const reconstructed = Math.exp(y)
				assertClose(reconstructed, x, 1e-12, `exp(ln(${x}))`)
			}
		})

		test('satisfies logarithmic identities ln(a * b) == ln(a) + ln(b) and ln(1/x) == -ln(x)', () => {
			const pairs = [
				[2, 3],
				[7.25, 13.875],
				[1e-50, 1e80],
				[0.123456, 98765.4321],
				[Math.PI, Math.SQRT2],
			]
			for (const [a, b] of pairs) {
				assertClose(
					lnFloatRecursive(a * b),
					lnFloatRecursive(a) + lnFloatRecursive(b),
					1e-14,
					`ln(${a} * ${b})`,
				)
				assertClose(lnFloatRecursive(1 / a), -lnFloatRecursive(a), 1e-14, `ln(1 / ${a})`)
			}
		})
	})
})
