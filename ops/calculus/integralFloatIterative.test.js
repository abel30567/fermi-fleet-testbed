import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { integralFloatIterative } from './integralFloatIterative.js'

function assertClose(actual, expected, tolerance = 1e-10, message) {
	assert.ok(
		Math.abs(actual - expected) <= tolerance,
		message ?? `Expected ${actual} to be within ${tolerance} of ${expected} (diff=${Math.abs(actual - expected)})`
	)
}

describe('integralFloatIterative', () => {
	describe('normal cases', () => {
		it('integrates constant functions accurately', () => {
			assertClose(integralFloatIterative(() => 5, 2, 7), 25, 1e-12)
			assertClose(integralFloatIterative(() => -3.25, -4, 4), -26, 1e-12)
		})

		it('integrates linear functions accurately', () => {
			assertClose(integralFloatIterative((x) => 3 * x + 2, 0, 4), 32, 1e-12)
		})

		it('integrates quadratic and cubic polynomials exactly even with 1 step', () => {
			// Integral of x^2 from 0 to 3 is 9
			assertClose(integralFloatIterative((x) => x * x, 0, 3, 1), 9, 1e-12)
			// Integral of (2x^3 - 3x^2 + 4x - 5) from -2 to 3:
			// Antiderivative F(x) = 0.5x^4 - x^3 + 2x^2 - 5x
			// F(3) = 40.5 - 27 + 18 - 15 = 16.5
			// F(-2) = 8 + 8 + 8 + 10 = 34
			// F(3) - F(-2) = -17.5
			const cubic = (x) => 2 * x ** 3 - 3 * x ** 2 + 4 * x - 5
			assertClose(integralFloatIterative(cubic, -2, 3, 1), -17.5, 1e-12)
		})

		it('integrates higher-degree polynomials accurately', () => {
			// Integral of x^5 from 0 to 2 is 64 / 6 = 32 / 3
			assertClose(integralFloatIterative((x) => x ** 5, 0, 2), 32 / 3, 1e-11)
		})

		it('integrates trigonometric functions', () => {
			assertClose(integralFloatIterative(Math.sin, 0, Math.PI), 2, 1e-12)
			assertClose(integralFloatIterative(Math.cos, 0, Math.PI / 2), 1, 1e-12)
		})

		it('integrates exponential, logarithmic, and rational functions', () => {
			assertClose(integralFloatIterative(Math.exp, 0, 1), Math.E - 1, 1e-12)
			assertClose(integralFloatIterative((x) => 1 / x, 1, Math.E), 1, 1e-12)
			assertClose(integralFloatIterative((x) => 4 / (1 + x * x), 0, 1), Math.PI, 1e-12)
		})
	})

	describe('edge cases', () => {
		it('returns 0 when a === b', () => {
			assert.equal(integralFloatIterative((x) => x * x, 5, 5), 0)
			assert.equal(integralFloatIterative((x) => x * x, -3.5, -3.5), 0)
			assert.ok(Object.is(integralFloatIterative((x) => x, -0, 0), 0))
		})

		it('negates the result when integration limits are reversed (a > b)', () => {
			const forward = integralFloatIterative(Math.sin, 0, Math.PI)
			const backward = integralFloatIterative(Math.sin, Math.PI, 0)
			assertClose(backward, -forward, 1e-13)
			assertClose(backward, -2, 1e-12)
		})

		it('integrates odd functions over symmetric intervals to 0', () => {
			assertClose(integralFloatIterative(Math.sin, -Math.PI, Math.PI), 0, 1e-14)
			assertClose(integralFloatIterative((x) => x ** 3, -5, 5), 0, 1e-12)
		})

		it('handles very small and large integration intervals', () => {
			const dx = 2 ** -30
			assertClose(integralFloatIterative((x) => 2 * x, 1, 1 + dx, 10), 2 * dx + dx * dx, 1e-20)
			assertClose(integralFloatIterative((x) => 3 * x * x, 0, 1e-6, 10), 1e-18, 1e-32)
			assertClose(integralFloatIterative((x) => 1e-6 * x, 0, 1e6, 100), 5e5, 1e-6)
		})

		it('supports odd and even step counts', () => {
			assertClose(integralFloatIterative(Math.sin, 0, Math.PI, 51), 2, 1e-7)
			assertClose(integralFloatIterative(Math.sin, 0, Math.PI, 50), 2, 1e-7)
		})
	})

	describe('input validation', () => {
		it('throws TypeError if fn is not a function', () => {
			for (const badFn of [null, undefined, 42, 'x => x', {}]) {
				assert.throws(() => integralFloatIterative(badFn, 0, 1), TypeError)
			}
		})

		it('throws TypeError if a, b, or steps is not a number', () => {
			assert.throws(() => integralFloatIterative((x) => x, '0', 1), TypeError)
			assert.throws(() => integralFloatIterative((x) => x, 0, null), TypeError)
			assert.throws(() => integralFloatIterative((x) => x, 0, 1, '10'), TypeError)
			assert.throws(() => integralFloatIterative((x) => x, 0n, 1), TypeError)
		})

		it('throws RangeError if a or b is non-finite', () => {
			assert.throws(() => integralFloatIterative((x) => x, Number.NaN, 1), RangeError)
			assert.throws(() => integralFloatIterative((x) => x, 0, Number.POSITIVE_INFINITY), RangeError)
			assert.throws(() => integralFloatIterative((x) => x, Number.NEGATIVE_INFINITY, 0), RangeError)
		})

		it('throws RangeError if steps is not a positive safe integer', () => {
			for (const badSteps of [0, -1, -100, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => integralFloatIterative((x) => x, 0, 1, badSteps), RangeError)
			}
		})

		it('throws TypeError or RangeError if fn returns invalid values', () => {
			assert.throws(() => integralFloatIterative(() => '1', 0, 1, 4), TypeError)
			assert.throws(() => integralFloatIterative(() => undefined, 0, 1, 4), TypeError)
			assert.throws(() => integralFloatIterative(() => Number.NaN, 0, 1, 4), RangeError)
			assert.throws(() => integralFloatIterative((x) => 1 / x, 0, 1, 4), RangeError)
		})

		it('throws RangeError if the interval span overflows float64', () => {
			assert.throws(
				() => integralFloatIterative(() => 1, -Number.MAX_VALUE, Number.MAX_VALUE, 10),
				RangeError
			)
		})
	})

	describe('independent cross-checks', () => {
		function compositeTrapezoidal(fn, a, b, n) {
			const h = (b - a) / n
			let sum = 0.5 * (fn(a) + fn(b))
			for (let i = 1; i < n; i++) {
				sum += fn(a + i * h)
			}
			return sum * h
		}

		it('agrees with an independent composite trapezoidal rule on non-trivial integrands', () => {
			const cases = [
				{ fn: (x) => Math.sin(x) + Math.exp(-x), a: 0, b: 3 },
				{ fn: (x) => Math.sqrt(1 + x ** 3), a: 0, b: 2 },
				{ fn: (x) => Math.log(1 + x * x), a: -1, b: 2 },
			]

			for (const { fn, a, b } of cases) {
				const simpson = integralFloatIterative(fn, a, b, 1000)
				const trap = compositeTrapezoidal(fn, a, b, 50000)
				assertClose(simpson, trap, 1e-7)
			}
		})

		it('satisfies interval additivity and linearity of integration', () => {
			const f = (x) => Math.exp(-x * x)
			const g = (x) => Math.cos(2 * x)
			const alpha = 2.5
			const beta = -1.75

			// Additivity: int_a^c = int_a^b + int_b^c
			const total = integralFloatIterative(f, -1, 2, 1000)
			const left = integralFloatIterative(f, -1, 0.3, 500)
			const right = integralFloatIterative(f, 0.3, 2, 500)
			assertClose(total, left + right, 1e-12)

			// Linearity: int(alpha*f + beta*g) = alpha*int(f) + beta*int(g)
			const combined = integralFloatIterative((x) => alpha * f(x) + beta * g(x), 0, 2, 1000)
			const separate = alpha * integralFloatIterative(f, 0, 2, 1000) + beta * integralFloatIterative(g, 0, 2, 1000)
			assertClose(combined, separate, 1e-12)
		})

		it('exhibits O(h^4) convergence order when doubling step count', () => {
			// Integral of x^4 from 0 to 1 is 0.2
			const exact = 0.2
			const errN = Math.abs(integralFloatIterative((x) => x ** 4, 0, 1, 10) - exact)
			const err2N = Math.abs(integralFloatIterative((x) => x ** 4, 0, 1, 20) - exact)
			const ratio = errN / err2N
			assertClose(ratio, 16, 1e-4)
		})
	})
})
