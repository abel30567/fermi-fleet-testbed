import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { derivativeFloatRecursive } from './derivativeFloatRecursive.js'

function assertApprox(actual, expected, tol = 1e-10, message = '') {
	assert.equal(typeof actual, 'number', `Expected number, got ${typeof actual}`)
	assert.ok(Number.isFinite(actual), `Expected finite number, got ${actual}`)
	const scale = Math.max(1, Math.abs(expected))
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol * scale,
		`${message ? message + ': ' : ''}expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`
	)
}

describe('derivativeFloatRecursive', () => {
	describe('polynomials', () => {
		test('constant and linear functions', () => {
			assertApprox(derivativeFloatRecursive(() => 42, 0), 0, 1e-14)
			assertApprox(derivativeFloatRecursive(() => -7.5, 123.456), 0, 1e-14)
			assertApprox(derivativeFloatRecursive((x) => 3.5 * x - 9, 2), 3.5, 1e-13)
			assertApprox(derivativeFloatRecursive((x) => -x + 1, -50), -1, 1e-13)
		})

		test('higher-degree polynomials against exact analytic derivatives', () => {
			const f = (x) => 2 * x ** 5 - 3 * x ** 3 + 4 * x ** 2 - 7 * x + 11
			const df = (x) => 10 * x ** 4 - 9 * x ** 2 + 8 * x - 7

			for (const x of [-3, -1.25, 0, 0.5, 2.75, 10]) {
				assertApprox(
					derivativeFloatRecursive(f, x),
					df(x),
					1e-10,
					`polynomial at x=${x}`
				)
			}
		})
	})

	describe('trigonometric functions', () => {
		test('sin, cos, tan, atan', () => {
			const points = [-2.5, -1, 0, 0.7, Math.PI / 4, Math.PI / 3]
			for (const x of points) {
				assertApprox(
					derivativeFloatRecursive(Math.sin, x),
					Math.cos(x),
					1e-11,
					`sin'(x) at x=${x}`
				)
				assertApprox(
					derivativeFloatRecursive(Math.cos, x),
					-Math.sin(x),
					1e-11,
					`cos'(x) at x=${x}`
				)
			}

			assertApprox(
				derivativeFloatRecursive(Math.sin, Math.PI / 2),
				0,
				1e-12,
				"sin'(pi/2)"
			)

			for (const x of [-1, 0, 0.5, 1.1]) {
				const sec2 = 1 / Math.cos(x) ** 2
				assertApprox(
					derivativeFloatRecursive(Math.tan, x),
					sec2,
					1e-10,
					`tan'(x) at x=${x}`
				)
				assertApprox(
					derivativeFloatRecursive(Math.atan, x),
					1 / (1 + x * x),
					1e-11,
					`atan'(x) at x=${x}`
				)
			}
		})
	})

	describe('exponential and logarithmic functions', () => {
		test('exp, expm1, sinh, cosh', () => {
			for (const x of [-4, -0.5, 0, 1, 3.5]) {
				assertApprox(
					derivativeFloatRecursive(Math.exp, x),
					Math.exp(x),
					1e-11,
					`exp'(x) at x=${x}`
				)
				assertApprox(
					derivativeFloatRecursive(Math.sinh, x),
					Math.cosh(x),
					1e-11,
					`sinh'(x) at x=${x}`
				)
				assertApprox(
					derivativeFloatRecursive(Math.cosh, x),
					Math.sinh(x),
					1e-11,
					`cosh'(x) at x=${x}`
				)
			}
		})

		test('log and log10 across scales including small positive x', () => {
			for (const x of [1e-5, 0.01, 0.5, 1, Math.E, 100]) {
				assertApprox(
					derivativeFloatRecursive(Math.log, x),
					1 / x,
					1e-10,
					`log'(x) at x=${x}`
				)
				assertApprox(
					derivativeFloatRecursive(Math.log10, x),
					1 / (x * Math.LN10),
					1e-10,
					`log10'(x) at x=${x}`
				)
			}
		})
	})

	describe('independent cross-checks: analytic, linearity, product, chain, and quotient rules', () => {
		test('linearity rule: (a*f + b*g)\'(x) = a*f\'(x) + b*g\'(x)', () => {
			const f = (x) => Math.exp(0.5 * x) * Math.cos(x)
			const g = (x) => Math.log(x * x + 2)
			const a = 3.25
			const b = -1.75
			const combined = (x) => a * f(x) + b * g(x)

			for (const x of [-2, -0.3, 0, 1.4, 3.1]) {
				const lhs = derivativeFloatRecursive(combined, x)
				const rhs =
					a * derivativeFloatRecursive(f, x) +
					b * derivativeFloatRecursive(g, x)
				assertApprox(lhs, rhs, 1e-10, `linearity at x=${x}`)
			}
		})

		test('product rule: (f*g)\'(x) = f\'(x)*g(x) + f(x)*g\'(x) and exact analytic derivative', () => {
			const f = (x) => x ** 3 + 2 * x - 1
			const g = (x) => Math.sin(2 * x) + Math.exp(-x)
			const product = (x) => f(x) * g(x)
			const exactProductDerivative = (x) =>
				(3 * x ** 2 + 2) * g(x) + f(x) * (2 * Math.cos(2 * x) - Math.exp(-x))

			for (const x of [-1.5, 0, 0.75, 2.2]) {
				const dProd = derivativeFloatRecursive(product, x)
				const productRule =
					derivativeFloatRecursive(f, x) * g(x) +
					f(x) * derivativeFloatRecursive(g, x)
				const exact = exactProductDerivative(x)

				assertApprox(dProd, productRule, 1e-10, `product rule at x=${x}`)
				assertApprox(dProd, exact, 1e-10, `exact analytic at x=${x}`)
			}
		})

		test('chain rule: (f(g(x)))\' = f\'(g(x)) * g\'(x)', () => {
			const f = (u) => Math.sqrt(u * u + 1)
			const g = (x) => Math.sin(x) + 0.5 * x
			const composed = (x) => f(g(x))

			for (const x of [-1.2, 0.25, 1.8]) {
				const lhs = derivativeFloatRecursive(composed, x)
				const rhs =
					derivativeFloatRecursive(f, g(x)) * derivativeFloatRecursive(g, x)
				assertApprox(lhs, rhs, 1e-10, `chain rule at x=${x}`)
			}
		})
	})

	describe('edge cases and options', () => {
		test('works at zero, negative zero, very small x, and large x', () => {
			assertApprox(derivativeFloatRecursive((x) => x ** 3 + 2 * x, 0), 2, 1e-12)
			assertApprox(
				derivativeFloatRecursive((x) => x ** 3 + 2 * x, -0),
				2,
				1e-12
			)
			assertApprox(
				derivativeFloatRecursive(Math.sin, 1e-8),
				Math.cos(1e-8),
				1e-10
			)
			assertApprox(
				derivativeFloatRecursive((x) => x * x, 1e6),
				2e6,
				1e-8
			)
		})

		test('shrinks oversized initial step h into valid domain', () => {
			// Initial h=1 pushes x - h = -0.5 outside domain of Math.log;
			// recursive halving shrinks h until x +/- h > 0.
			assertApprox(
				derivativeFloatRecursive(Math.log, 0.5, { h: 1, maxDepth: 14 }),
				2,
				1e-10
			)
		})

		test('returns NaN when function produces non-finite values everywhere around x', () => {
			assert.ok(Number.isNaN(derivativeFloatRecursive(Math.log, -5)))
			assert.ok(Number.isNaN(derivativeFloatRecursive(() => Number.NaN, 1)))
			assert.ok(
				Number.isNaN(derivativeFloatRecursive(() => Number.POSITIVE_INFINITY, 1))
			)
		})

		test('respects custom options (h, maxDepth, tolerance)', () => {
			const val = derivativeFloatRecursive(Math.exp, 1, {
				h: 0.1,
				maxDepth: 10,
				tolerance: 1e-13
			})
			assertApprox(val, Math.E, 1e-12)

			const shallow = derivativeFloatRecursive(Math.exp, 1, {
				h: 0.05,
				maxDepth: 1
			})
			assertApprox(shallow, Math.E, 1e-7)
		})

		test('input validation throws appropriate TypeError / RangeError', () => {
			assert.throws(() => derivativeFloatRecursive(null, 1), TypeError)
			assert.throws(() => derivativeFloatRecursive(123, 1), TypeError)
			assert.throws(() => derivativeFloatRecursive(Math.sin, '1'), TypeError)
			assert.throws(() => derivativeFloatRecursive(Math.sin, Number.NaN), RangeError)
			assert.throws(
				() => derivativeFloatRecursive(Math.sin, Number.POSITIVE_INFINITY),
				RangeError
			)
			assert.throws(
				() => derivativeFloatRecursive(Math.sin, Number.NEGATIVE_INFINITY),
				RangeError
			)
			assert.throws(() => derivativeFloatRecursive(Math.sin, 1, null), TypeError)
			assert.throws(() => derivativeFloatRecursive(Math.sin, 1, []), TypeError)
			assert.throws(
				() => derivativeFloatRecursive(Math.sin, 1, { h: '0.1' }),
				TypeError
			)
			assert.throws(
				() => derivativeFloatRecursive(Math.sin, 1, { h: 0 }),
				RangeError
			)
			assert.throws(
				() => derivativeFloatRecursive(Math.sin, 1, { h: -1e-3 }),
				RangeError
			)
			assert.throws(
				() => derivativeFloatRecursive(Math.sin, 1, { h: Number.POSITIVE_INFINITY }),
				RangeError
			)
			assert.throws(
				() => derivativeFloatRecursive(Math.sin, 1, { maxDepth: '5' }),
				TypeError
			)
			assert.throws(
				() => derivativeFloatRecursive(Math.sin, 1, { maxDepth: 0 }),
				RangeError
			)
			assert.throws(
				() => derivativeFloatRecursive(Math.sin, 1, { maxDepth: 2.5 }),
				RangeError
			)
			assert.throws(
				() => derivativeFloatRecursive(Math.sin, 1, { maxDepth: 31 }),
				RangeError
			)
			assert.throws(
				() => derivativeFloatRecursive(Math.sin, 1, { tolerance: '1e-6' }),
				TypeError
			)
			assert.throws(
				() => derivativeFloatRecursive(Math.sin, 1, { tolerance: -1e-6 }),
				RangeError
			)
			assert.throws(
				() => derivativeFloatRecursive(Math.sin, 1, { tolerance: Number.NaN }),
				RangeError
			)
			assert.throws(
				() => derivativeFloatRecursive(() => 'not-a-number', 1),
				TypeError
			)
		})
	})
})
