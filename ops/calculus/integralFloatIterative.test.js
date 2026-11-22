import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { integralFloatIterative } from './integralFloatIterative.js'

function assertClose(actual, expected, tolerance = 1e-10) {
	assert.ok(
		Math.abs(actual - expected) <= tolerance,
		`Expected ${actual} to be within ${tolerance} of ${expected} (diff: ${Math.abs(actual - expected)})`,
	)
}

describe('integralFloatIterative', () => {
	describe('analytic antiderivative cross-checks', () => {
		test('integrates sin(x) from 0 to pi === 2', () => {
			assertClose(integralFloatIterative(Math.sin, 0, Math.PI), 2, 1e-12)
		})

		test('integrates cos(x) from 0 to pi/2 === 1', () => {
			assertClose(integralFloatIterative(Math.cos, 0, Math.PI / 2), 1, 1e-12)
		})

		test('integrates x^3 from 0 to 1 === 0.25', () => {
			assertClose(integralFloatIterative((x) => x ** 3, 0, 1), 0.25, 1e-15)
		})

		test('integrates exp(x) from 0 to 1 === e - 1', () => {
			assertClose(integralFloatIterative(Math.exp, 0, 1), Math.E - 1, 1e-12)
		})

		test('integrates 1/x from 1 to e === 1', () => {
			assertClose(integralFloatIterative((x) => 1 / x, 1, Math.E), 1, 1e-12)
		})
	})

	describe('polynomials and standard functions', () => {
		test('constant, linear, quadratic, and cubic functions are exact even with steps = 1', () => {
			assertClose(integralFloatIterative(() => 7, -3, 5, 1), 56, 1e-14)
			assertClose(integralFloatIterative((x) => 2 * x + 3, 1, 4, 1), 24, 1e-14)
			assertClose(integralFloatIterative((x) => x ** 2, 0, 3, 1), 9, 1e-14)
			// ∫_{-1}^{2} (x^3 - 2x^2 + x - 4) dx = -51/4 = -12.75
			assertClose(integralFloatIterative((x) => x ** 3 - 2 * x ** 2 + x - 4, -1, 2, 1), -51 / 4, 1e-14)
		})

		test('higher-degree polynomial matches analytic integral', () => {
			// ∫_0^2 (3x^4 - 2x^2 + 5) dx = 96/5 - 16/3 + 10 = 358/15
			const f = (x) => 3 * x ** 4 - 2 * x ** 2 + 5
			assertClose(integralFloatIterative(f, 0, 2), 358 / 15, 1e-11)
		})

		test('increasing steps improves accuracy for non-cubic functions', () => {
			const exact = Math.E - 1
			const errCoarse = Math.abs(integralFloatIterative(Math.exp, 0, 1, 2) - exact)
			const errFine = Math.abs(integralFloatIterative(Math.exp, 0, 1, 20) - exact)
			assert.ok(errFine < errCoarse, `Expected finer error (${errFine}) < coarse error (${errCoarse})`)
			assert.ok(errFine < 1e-8)
		})
	})

	describe('interval and symmetry edge cases', () => {
		test('a === b returns +0', () => {
			assert.ok(Object.is(integralFloatIterative(Math.sin, 0, 0), 0))
			assert.ok(Object.is(integralFloatIterative((x) => x ** 2, 3.5, 3.5), 0))
			assert.ok(Object.is(integralFloatIterative(Math.exp, -2, -2), 0))
		})

		test('a > b reverses sign with exact antisymmetry', () => {
			const forward = integralFloatIterative(Math.exp, 0, 2)
			const backward = integralFloatIterative(Math.exp, 2, 0)
			assert.equal(backward, -forward)
			assertClose(backward, -(Math.exp(2) - 1), 1e-12)
		})

		test('negative intervals', () => {
			// ∫_{-2}^{-1} x^2 dx = (-1/3) - (-8/3) = 7/3
			assertClose(integralFloatIterative((x) => x ** 2, -2, -1), 7 / 3, 1e-14)
			// ∫_{-1}^{-2} x^2 dx = -7/3
			assertClose(integralFloatIterative((x) => x ** 2, -1, -2), -7 / 3, 1e-14)
		})

		test('symmetric intervals for odd and even functions', () => {
			assertClose(integralFloatIterative((x) => x ** 3, -3, 3), 0, 1e-14)
			assertClose(integralFloatIterative(Math.sin, -Math.PI, Math.PI), 0, 1e-14)
			assertClose(integralFloatIterative((x) => x ** 2, -1, 1), 2 / 3, 1e-14)
		})

		test('handles both odd and even custom step counts', () => {
			assertClose(integralFloatIterative(Math.sin, 0, Math.PI, 7), 2, 1e-4)
			assertClose(integralFloatIterative(Math.sin, 0, Math.PI, 8), 2, 1e-4)
			assertClose(integralFloatIterative(Math.sin, 0, Math.PI, 101), 2, 1e-9)
		})

		test('interval additivity and linearity', () => {
			const f = (x) => Math.sin(x) + 0.5 * x ** 2
			const g = (x) => Math.exp(-x)

			const left = integralFloatIterative(f, 0, 1.2)
			const right = integralFloatIterative(f, 1.2, 3)
			const full = integralFloatIterative(f, 0, 3)
			assertClose(left + right, full, 1e-12)

			const combined = integralFloatIterative((x) => 2 * f(x) - 3 * g(x), 0, 2)
			const linear = 2 * integralFloatIterative(f, 0, 2) - 3 * integralFloatIterative(g, 0, 2)
			assertClose(combined, linear, 1e-12)
		})

		test('handles endpoint-sensitive domain without stepping past bounds', () => {
			// ∫_{-1}^{1} sqrt(1 - x^2) dx = pi / 2
			const semicircle = (x) => Math.sqrt(1 - x * x)
			assertClose(integralFloatIterative(semicircle, -1, 1, 2000), Math.PI / 2, 1e-5)
		})
	})

	describe('input validation', () => {
		test('throws TypeError when f is not a function', () => {
			for (const bad of [null, undefined, 42, 'sin', {}]) {
				assert.throws(() => integralFloatIterative(bad, 0, 1), TypeError)
			}
		})

		test('throws TypeError when a or b is not a number', () => {
			for (const bad of [null, undefined, '0', {}, 1n]) {
				assert.throws(() => integralFloatIterative(Math.sin, bad, 1), TypeError)
				assert.throws(() => integralFloatIterative(Math.sin, 0, bad), TypeError)
			}
		})

		test('throws RangeError when a or b is not finite', () => {
			for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
				assert.throws(() => integralFloatIterative(Math.sin, bad, 1), RangeError)
				assert.throws(() => integralFloatIterative(Math.sin, 0, bad), RangeError)
			}
		})

		test('throws TypeError when steps is not a number', () => {
			for (const bad of [null, '10', {}, 10n]) {
				assert.throws(() => integralFloatIterative(Math.sin, 0, 1, bad), TypeError)
			}
		})

		test('throws RangeError when steps is not a positive safe integer', () => {
			for (const bad of [0, -1, -100, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => integralFloatIterative(Math.sin, 0, 1, bad), RangeError)
			}
		})

		test('throws TypeError when integrand returns a non-number', () => {
			assert.throws(() => integralFloatIterative(() => '1', 0, 1, 4), TypeError)
			assert.throws(() => integralFloatIterative(() => undefined, 0, 1, 4), TypeError)
		})

		test('throws RangeError when integrand returns a non-finite number', () => {
			assert.throws(() => integralFloatIterative(() => Number.NaN, 0, 1, 4), RangeError)
			assert.throws(() => integralFloatIterative(() => Number.POSITIVE_INFINITY, 0, 1, 4), RangeError)
			assert.throws(() => integralFloatIterative((x) => 1 / x, 0, 1, 4), RangeError)
		})
	})
})
