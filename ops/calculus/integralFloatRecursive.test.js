import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { integralFloatRecursive } from './integralFloatRecursive.js'

function assertApproxEqual(actual, expected, tol = 1e-9, message = '') {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		`${message ? `${message}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`,
	)
}

describe('integralFloatRecursive', () => {
	describe('exact analytic integrals', () => {
		test('constant and linear functions', () => {
			assertApproxEqual(integralFloatRecursive(() => 5, 0, 4), 20, 1e-12)
			assertApproxEqual(integralFloatRecursive(() => 0, -10, 10), 0, 1e-15)
			assertApproxEqual(integralFloatRecursive((x) => 3 * x + 2, -2, 5), 45.5, 1e-12)
		})

		test('polynomials of various degrees', () => {
			// ∫_0^1 x^2 dx = 1/3
			assertApproxEqual(integralFloatRecursive((x) => x * x, 0, 1), 1 / 3, 1e-12)
			// ∫_0^2 (x^4 - 3x^2 + 1) dx = [x^5/5 - x^3 + x]_0^2 = 32/5 - 8 + 2 = 0.4
			assertApproxEqual(
				integralFloatRecursive((x) => x ** 4 - 3 * x ** 2 + 1, 0, 2),
				0.4,
				1e-11,
			)
			// ∫_-1^2 x^5 dx = (64 - 1)/6 = 10.5
			assertApproxEqual(integralFloatRecursive((x) => x ** 5, -1, 2), 10.5, 1e-11)
		})

		test('trigonometric, exponential, logarithmic, and rational integrals', () => {
			// ∫_0^π sin(x) dx = 2
			assertApproxEqual(integralFloatRecursive(Math.sin, 0, Math.PI), 2, 1e-10)
			// ∫_0^(2π) sin^2(2x) dx = π (guards against coarse midpoint aliasing)
			assertApproxEqual(
				integralFloatRecursive((x) => Math.sin(2 * x) ** 2, 0, 2 * Math.PI),
				Math.PI,
				1e-10,
			)
			// ∫_0^1 e^x dx = e - 1
			assertApproxEqual(integralFloatRecursive(Math.exp, 0, 1), Math.E - 1, 1e-11)
			// ∫_1^e (1/x) dx = 1
			assertApproxEqual(integralFloatRecursive((x) => 1 / x, 1, Math.E), 1, 1e-10)
			// ∫_0^1 4 / (1 + x^2) dx = π
			assertApproxEqual(
				integralFloatRecursive((x) => 4 / (1 + x * x), 0, 1),
				Math.PI,
				1e-10,
			)
			// ∫_0^1 sqrt(x) dx = 2/3 (vertical derivative at x = 0)
			assertApproxEqual(integralFloatRecursive(Math.sqrt, 0, 1), 2 / 3, 1e-8)
		})
	})

	describe('reversed and equal limits', () => {
		test('equal limits return +0', () => {
			const res = integralFloatRecursive((x) => x * x + 1, 3.5, 3.5)
			assert.strictEqual(res, 0)
			assert.strictEqual(Object.is(res, -0), false)
		})

		test('reversed limits negate the integral exactly', () => {
			const f = (x) => Math.exp(-x * x) + 0.5 * Math.cos(3 * x)
			const forward = integralFloatRecursive(f, -1.5, 2.5)
			const backward = integralFloatRecursive(f, 2.5, -1.5)
			assert.strictEqual(backward, -forward)
		})

		test('reversed limits on zero-integral function return +0', () => {
			const res = integralFloatRecursive(() => 0, 5, 1)
			assert.strictEqual(res, 0)
			assert.strictEqual(Object.is(res, -0), false)
		})
	})

	describe('integral properties and independent cross-checks', () => {
		test('interval additivity: ∫_a^c f + ∫_c^b f = ∫_a^b f', () => {
			const cases = [
				{ f: (x) => Math.sin(3 * x) + Math.exp(0.2 * x), a: -1, c: 0.7, b: 3.2 },
				{ f: (x) => 1 / (1 + 25 * x * x), a: -2, c: -0.1, b: 2 },
				// Also test c outside [a, b] (signed additivity)
				{ f: (x) => x ** 3 - 2 * x + 1, a: 0, c: 3, b: 1.5 },
			]

			for (const { f, a, c, b } of cases) {
				const whole = integralFloatRecursive(f, a, b, { tolerance: 1e-11 })
				const left = integralFloatRecursive(f, a, c, { tolerance: 1e-11 })
				const right = integralFloatRecursive(f, c, b, { tolerance: 1e-11 })
				assertApproxEqual(left + right, whole, 1e-9, `additivity on [${a}, ${c}, ${b}]`)
			}
		})

		test('linearity: ∫(αf + βg) = α∫f + β∫g', () => {
			const f = (x) => Math.sin(x)
			const g = (x) => Math.exp(-x)
			const alpha = 2.75
			const beta = -1.25
			const lhs = integralFloatRecursive((x) => alpha * f(x) + beta * g(x), 0, 2)
			const rhs =
				alpha * integralFloatRecursive(f, 0, 2) + beta * integralFloatRecursive(g, 0, 2)
			assertApproxEqual(lhs, rhs, 1e-10)
		})

		test('odd function on symmetric interval integrates to 0', () => {
			const odd = (x) => x ** 3 * Math.cos(x) + Math.sin(5 * x)
			assertApproxEqual(integralFloatRecursive(odd, -2.5, 2.5), 0, 1e-10)
		})

		test('cross-check against independent composite midpoint rule', () => {
			const f = (x) => Math.exp(-x * x) * Math.cos(2 * x)
			const a = -1
			const b = 2
			const recursiveVal = integralFloatRecursive(f, a, b, { tolerance: 1e-11 })

			// Independent uniform midpoint Riemann sum with N = 20000
			const n = 20000
			const h = (b - a) / n
			let midpointVal = 0
			for (let i = 0; i < n; i++) {
				midpointVal += f(a + (i + 0.5) * h)
			}
			midpointVal *= h

			assertApproxEqual(recursiveVal, midpointVal, 1e-7)
		})
	})

	describe('edge cases and adaptive refinement', () => {
		test('sharp Gaussian peak requires adaptive subdivision', () => {
			// ∫_-5^5 exp(-1000 * (x - 0.3)^2) dx ≈ sqrt(π / 1000)
			const exact = Math.sqrt(Math.PI / 1000)
			const approx = integralFloatRecursive(
				(x) => Math.exp(-1000 * (x - 0.3) ** 2),
				-5,
				5,
				{ tolerance: 1e-10 },
			)
			assertApproxEqual(approx, exact, 1e-9)
		})

		test('non-smooth function |x| on [-1, 2]', () => {
			// ∫_-1^2 |x| dx = 0.5 + 2 = 2.5
			assertApproxEqual(integralFloatRecursive(Math.abs, -1, 2), 2.5, 1e-9)
		})

		test('high-frequency oscillation', () => {
			// ∫_0^1 cos(50x) dx = sin(50) / 50
			assertApproxEqual(
				integralFloatRecursive((x) => Math.cos(50 * x), 0, 1, { tolerance: 1e-10 }),
				Math.sin(50) / 50,
				1e-9,
			)
		})

		test('very small interval near float64 precision', () => {
			const a = 1
			const b = 1 + 1e-12
			assertApproxEqual(integralFloatRecursive((x) => x * x, a, b), (b ** 3 - a ** 3) / 3, 1e-22)
		})

		test('large magnitude integral does not stall on rounding floor', () => {
			// ∫_0^1000 1e6 * x dx = 5e11
			const res = integralFloatRecursive((x) => 1e6 * x, 0, 1000, { tolerance: 1e-10 })
			assertApproxEqual(res, 5e11, 1e-2)
		})

		test('maxDepth: 0 performs single Simpson step without recursing', () => {
			let calls = 0
			const res = integralFloatRecursive(
				(x) => {
					calls++
					return x * x * x
				},
				0,
				2,
				{ maxDepth: 0 },
			)
			assert.strictEqual(calls, 3)
			assertApproxEqual(res, 4, 1e-12)
		})
	})

	describe('input validation', () => {
		test('rejects non-function integrand', () => {
			assert.throws(() => integralFloatRecursive(null, 0, 1), TypeError)
			assert.throws(() => integralFloatRecursive(42, 0, 1), TypeError)
		})

		test('rejects invalid integration limits', () => {
			assert.throws(() => integralFloatRecursive((x) => x, '0', 1), TypeError)
			assert.throws(() => integralFloatRecursive((x) => x, 0, '1'), TypeError)
			assert.throws(() => integralFloatRecursive((x) => x, Number.NaN, 1), RangeError)
			assert.throws(() => integralFloatRecursive((x) => x, 0, Number.POSITIVE_INFINITY), RangeError)
			assert.throws(() => integralFloatRecursive((x) => x, -1e308, 1e308), RangeError)
		})

		test('rejects invalid options', () => {
			assert.throws(() => integralFloatRecursive((x) => x, 0, 1, null), TypeError)
			assert.throws(() => integralFloatRecursive((x) => x, 0, 1, []), TypeError)
			assert.throws(() => integralFloatRecursive((x) => x, 0, 1, { tolerance: '1e-6' }), TypeError)
			assert.throws(() => integralFloatRecursive((x) => x, 0, 1, { tolerance: 0 }), RangeError)
			assert.throws(() => integralFloatRecursive((x) => x, 0, 1, { tolerance: -1e-6 }), RangeError)
			assert.throws(
				() => integralFloatRecursive((x) => x, 0, 1, { tolerance: Number.NaN }),
				RangeError,
			)
			assert.throws(() => integralFloatRecursive((x) => x, 0, 1, { maxDepth: 1.5 }), RangeError)
			assert.throws(() => integralFloatRecursive((x) => x, 0, 1, { maxDepth: -1 }), RangeError)
			assert.throws(() => integralFloatRecursive((x) => x, 0, 1, { maxDepth: '10' }), TypeError)
		})

		test('rejects non-number or non-finite return values from f(x)', () => {
			assert.throws(() => integralFloatRecursive(() => '1', 0, 1), TypeError)
			assert.throws(() => integralFloatRecursive(() => Number.NaN, 0, 1), RangeError)
			assert.throws(() => integralFloatRecursive((x) => 1 / x, 0, 1), RangeError)
		})
	})
})
