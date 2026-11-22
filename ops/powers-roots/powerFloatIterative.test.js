import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { powerFloatIterative } from './powerFloatIterative.js'

/**
 * Asserts two finite float64 numbers are close within a relative tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [relTol=1e-12]
 * @param {string} [message]
 */
function assertClose(actual, expected, relTol = 1e-12, message = '') {
	assert.equal(Number.isNaN(actual), false, `Expected finite number, got NaN (${message})`)
	if (expected === 0) {
		assert.ok(Math.abs(actual) <= relTol, `Expected ~0, got ${actual} (${message})`)
		return
	}
	const relErr = Math.abs(actual - expected) / Math.abs(expected)
	assert.ok(
		relErr <= relTol,
		`Expected ${actual} to be within relTol=${relTol} of ${expected} (relErr=${relErr}) ${message}`,
	)
}

describe('powerFloatIterative', () => {
	describe('normal cases', () => {
		it('handles positive integer exponents', () => {
			assert.equal(powerFloatIterative(2, 0), 1)
			assert.equal(powerFloatIterative(2, 1), 2)
			assert.equal(powerFloatIterative(2, 10), 1024)
			assert.equal(powerFloatIterative(3, 5), 243)
			assert.equal(powerFloatIterative(10, 6), 1_000_000)
			assertClose(powerFloatIterative(1.5, 4), 5.0625, 1e-15)
		})

		it('handles negative integer exponents', () => {
			assert.equal(powerFloatIterative(2, -1), 0.5)
			assert.equal(powerFloatIterative(2, -3), 0.125)
			assert.equal(powerFloatIterative(10, -3), 0.001)
			assert.equal(powerFloatIterative(0.5, -4), 16)
			assertClose(powerFloatIterative(4, -2), 0.0625, 1e-15)
		})

		it('handles positive fractional exponents', () => {
			assertClose(powerFloatIterative(4, 0.5), 2, 1e-14)
			assertClose(powerFloatIterative(2, 0.5), Math.SQRT2, 1e-14)
			assertClose(powerFloatIterative(27, 1 / 3), 3, 1e-14)
			assertClose(powerFloatIterative(16, 0.75), 8, 1e-14)
			assertClose(powerFloatIterative(9, 1.5), 27, 1e-14)
			assertClose(powerFloatIterative(Math.E, 2.5), Math.exp(2.5), 1e-14)
		})

		it('handles negative fractional exponents', () => {
			assertClose(powerFloatIterative(4, -0.5), 0.5, 1e-14)
			assertClose(powerFloatIterative(100, -0.5), 0.1, 1e-14)
			assertClose(powerFloatIterative(8, -1 / 3), 0.5, 1e-14)
			assertClose(powerFloatIterative(16, -0.75), 0.125, 1e-14)
			assertClose(powerFloatIterative(0.25, -0.5), 2, 1e-14)
		})
	})

	describe('edge cases', () => {
		it('handles 0^0 and x^0 (including -0, NaN, Infinity)', () => {
			assert.equal(powerFloatIterative(0, 0), 1)
			assert.equal(powerFloatIterative(-0, 0), 1)
			assert.equal(powerFloatIterative(0, -0), 1)
			assert.equal(powerFloatIterative(-0, -0), 1)
			assert.equal(powerFloatIterative(42, 0), 1)
			assert.equal(powerFloatIterative(-42, -0), 1)
			assert.equal(powerFloatIterative(NaN, 0), 1)
			assert.equal(powerFloatIterative(NaN, -0), 1)
			assert.equal(powerFloatIterative(Infinity, 0), 1)
			assert.equal(powerFloatIterative(-Infinity, -0), 1)
		})

		it('handles 0^n and (-0)^n with proper signed zero and infinity semantics', () => {
			assert.ok(Object.is(powerFloatIterative(0, 3), 0))
			assert.ok(Object.is(powerFloatIterative(0, 0.5), 0))
			assert.equal(powerFloatIterative(0, -3), Infinity)
			assert.equal(powerFloatIterative(0, -0.5), Infinity)

			assert.ok(Object.is(powerFloatIterative(-0, 3), -0))
			assert.ok(Object.is(powerFloatIterative(-0, 2), 0))
			assert.ok(Object.is(powerFloatIterative(-0, 0.5), 0))
			assert.equal(powerFloatIterative(-0, -3), -Infinity)
			assert.equal(powerFloatIterative(-0, -2), Infinity)
			assert.equal(powerFloatIterative(-0, -0.5), Infinity)
		})

		it('handles negative bases with integer and non-integer exponents', () => {
			assert.equal(powerFloatIterative(-2, 3), -8)
			assert.equal(powerFloatIterative(-2, 4), 16)
			assert.equal(powerFloatIterative(-2, -3), -0.125)
			assert.equal(powerFloatIterative(-2, -2), 0.25)
			assert.equal(powerFloatIterative(-1, 2), 1)
			assert.equal(powerFloatIterative(-1, 3), -1)
			assert.equal(powerFloatIterative(-1, Number.MAX_SAFE_INTEGER), -1)
			assert.equal(powerFloatIterative(-1, Number.MAX_SAFE_INTEGER + 1), 1)

			// Domain errors: negative base with non-integer exponent -> NaN
			assert.ok(Number.isNaN(powerFloatIterative(-2, 0.5)))
			assert.ok(Number.isNaN(powerFloatIterative(-2, -0.5)))
			assert.ok(Number.isNaN(powerFloatIterative(-1, 1.5)))
			assert.ok(Number.isNaN(powerFloatIterative(-0.001, 1 / 3)))
		})

		it('handles large and small exponents including overflow, underflow, and subnormals', () => {
			assert.equal(powerFloatIterative(2, 1023), Math.pow(2, 1023))
			assert.equal(powerFloatIterative(2, 1024), Infinity)
			assert.equal(powerFloatIterative(2, -1024), Math.pow(2, -1024))
			assert.equal(powerFloatIterative(2, -1074), Number.MIN_VALUE)
			assert.ok(Object.is(powerFloatIterative(2, -1075), 0))
			assert.ok(Object.is(powerFloatIterative(-2, -1075), -0))
			assert.equal(powerFloatIterative(10, 309), Infinity)
			assert.equal(powerFloatIterative(2, 1e20), Infinity)
			assert.equal(powerFloatIterative(0.5, 1e20), 0)
			assert.equal(powerFloatIterative(1, 1e308), 1)
			assertClose(powerFloatIterative(1e300, 0.5), 1e150, 1e-13)
			assertClose(powerFloatIterative(1e-300, 0.5), 1e-150, 1e-13)
			assertClose(powerFloatIterative(Number.MIN_VALUE, 0.5), Math.pow(Number.MIN_VALUE, 0.5), 1e-13)
			assert.equal(powerFloatIterative(2, 1024.5), Infinity)
			assert.equal(powerFloatIterative(2, -1075.5), 0)
		})

		it('handles NaN and Infinity operands per IEEE-754 / ECMA-262', () => {
			assert.ok(Number.isNaN(powerFloatIterative(2, NaN)))
			assert.ok(Number.isNaN(powerFloatIterative(NaN, 2)))
			assert.ok(Number.isNaN(powerFloatIterative(NaN, NaN)))
			assert.ok(Number.isNaN(powerFloatIterative(1, NaN)))

			assert.equal(powerFloatIterative(2, Infinity), Infinity)
			assert.equal(powerFloatIterative(-2, Infinity), Infinity)
			assert.ok(Object.is(powerFloatIterative(0.5, Infinity), 0))
			assert.ok(Object.is(powerFloatIterative(-0.5, Infinity), 0))
			assert.ok(Number.isNaN(powerFloatIterative(1, Infinity)))
			assert.ok(Number.isNaN(powerFloatIterative(-1, Infinity)))

			assert.ok(Object.is(powerFloatIterative(2, -Infinity), 0))
			assert.ok(Object.is(powerFloatIterative(-2, -Infinity), 0))
			assert.equal(powerFloatIterative(0.5, -Infinity), Infinity)
			assert.equal(powerFloatIterative(-0.5, -Infinity), Infinity)
			assert.ok(Number.isNaN(powerFloatIterative(1, -Infinity)))
			assert.ok(Number.isNaN(powerFloatIterative(-1, -Infinity)))

			assert.equal(powerFloatIterative(Infinity, 2), Infinity)
			assert.equal(powerFloatIterative(Infinity, 0.5), Infinity)
			assert.ok(Object.is(powerFloatIterative(Infinity, -2), 0))
			assert.ok(Object.is(powerFloatIterative(Infinity, -0.5), 0))

			assert.equal(powerFloatIterative(-Infinity, 3), -Infinity)
			assert.equal(powerFloatIterative(-Infinity, 2), Infinity)
			assert.equal(powerFloatIterative(-Infinity, 0.5), Infinity)
			assert.ok(Object.is(powerFloatIterative(-Infinity, -3), -0))
			assert.ok(Object.is(powerFloatIterative(-Infinity, -2), 0))
			assert.ok(Object.is(powerFloatIterative(-Infinity, -0.5), 0))
		})

		it('throws TypeError on non-number inputs', () => {
			const invalidValues = ['2', null, undefined, {}, [], true, false, 2n, Symbol('x')]
			for (const bad of invalidValues) {
				assert.throws(() => powerFloatIterative(bad, 2), TypeError)
				assert.throws(() => powerFloatIterative(2, bad), TypeError)
			}
			assert.throws(() => powerFloatIterative(), TypeError)
		})
	})

	describe('cross-check against Math.pow', () => {
		it('matches Math.pow across a grid of integer and fractional inputs', () => {
			const bases = [0.001, 0.1, 0.5, 0.999999, 1, 1.000001, 2, Math.E, Math.PI, 10, 123.456]
			const exponents = [-10, -3.7, -2, -1.5, -0.5, -0.1, 0, 0.1, 0.5, 1.5, 2, 3.7, 10]

			for (const base of bases) {
				for (const exponent of exponents) {
					const actual = powerFloatIterative(base, exponent)
					const expected = Math.pow(base, exponent)
					assertClose(actual, expected, 1e-12, `base=${base}, exponent=${exponent}`)
				}
			}
		})

		it('matches Math.pow on negative bases with integer exponents and special values', () => {
			const pairs = [
				[-3, 5],
				[-3, 4],
				[-3, -5],
				[-3, -4],
				[-0.25, 3],
				[-0.25, -3],
				[0, Infinity],
				[0, -Infinity],
				[-0, Infinity],
				[-0, -Infinity],
				[Infinity, Infinity],
				[Infinity, -Infinity],
				[-Infinity, Infinity],
				[-Infinity, -Infinity],
			]

			for (const [base, exponent] of pairs) {
				const actual = powerFloatIterative(base, exponent)
				const expected = Math.pow(base, exponent)
				if (Number.isFinite(expected) && expected !== 0) {
					assertClose(actual, expected, 1e-13, `base=${base}, exponent=${exponent}`)
				} else {
					assert.ok(
						Object.is(actual, expected),
						`Expected Object.is(${actual}, ${expected}) for base=${base}, exponent=${exponent}`,
					)
				}
			}
		})
	})
})
