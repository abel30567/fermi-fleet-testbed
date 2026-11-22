import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { derivativeFloatIterative } from './derivativeFloatIterative.js'

function assertClose(actual, expected, tol = 1e-9, message) {
	const scale = Math.max(1, Math.abs(expected))
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol * scale,
		message ?? `Expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`
	)
}

describe('derivativeFloatIterative', () => {
	describe('basic and elementary functions', () => {
		test('constant function has zero derivative', () => {
			const f = () => 42
			assert.equal(derivativeFloatIterative(f, 0), 0)
			assert.equal(derivativeFloatIterative(f, -7.5), 0)
			assert.equal(derivativeFloatIterative(f, 1e6), 0)
		})

		test('linear function has constant slope', () => {
			const f = (x) => 3.5 * x - 11
			assertClose(derivativeFloatIterative(f, 0), 3.5, 1e-12)
			assertClose(derivativeFloatIterative(f, -4.2), 3.5, 1e-12)
			assertClose(derivativeFloatIterative(f, 100), 3.5, 1e-12)
		})

		test('polynomial functions at positive, negative, and zero points', () => {
			const f = (x) => 2 * x ** 3 - 5 * x ** 2 + 7 * x - 9
			const df = (x) => 6 * x ** 2 - 10 * x + 7
			for (const x of [-10, -2.5, -0.001, 0, 0.5, 3, 12.25]) {
				assertClose(derivativeFloatIterative(f, x), df(x), 1e-10)
			}
		})

		test('negative x and zero edge points', () => {
			const f = (x) => x ** 2 + Math.exp(-x)
			const df = (x) => 2 * x - Math.exp(-x)
			for (const x of [-5, -1, -1e-4, 0, 1e-4]) {
				assertClose(derivativeFloatIterative(f, x), df(x), 1e-10)
			}
		})

		test('even function at zero returns non-negative zero', () => {
			const result = derivativeFloatIterative((x) => x * x, 0)
			assert.equal(Object.is(result, -0), false)
			assert.equal(result, 0)
		})
	})

	describe('analytic derivative cross-checks', () => {
		test('d/dx sin(x) = cos(x) across domain', () => {
			const points = [-2 * Math.PI, -Math.PI / 3, -0.5, 0, 0.7, Math.PI / 2, Math.PI, 4.2]
			for (const x of points) {
				assertClose(derivativeFloatIterative(Math.sin, x), Math.cos(x), 1e-11)
			}
		})

		test('d/dx cos(x) = -sin(x) across domain', () => {
			const points = [-3.1, -1, 0, 1.25, 2.7, 5.5]
			for (const x of points) {
				assertClose(derivativeFloatIterative(Math.cos, x), -Math.sin(x), 1e-11)
			}
		})

		test('d/dx exp(x) = exp(x) across domain', () => {
			const points = [-5, -1.5, 0, 1, 3.5, 10]
			for (const x of points) {
				assertClose(derivativeFloatIterative(Math.exp, x), Math.exp(x), 1e-11)
			}
		})

		test('d/dx x^4 = 4x^3 across domain', () => {
			const f = (x) => x ** 4
			const points = [-8, -1.5, -0.1, 0, 0.25, 2, 7.5]
			for (const x of points) {
				assertClose(derivativeFloatIterative(f, x), 4 * x ** 3, 1e-11)
			}
		})

		test('d/dx ln(x) = 1/x and d/dx sqrt(x) = 1/(2*sqrt(x))', () => {
			for (const x of [0.05, 0.5, 1, 2.718281828, 25]) {
				assertClose(derivativeFloatIterative(Math.log, x), 1 / x, 1e-10)
				assertClose(derivativeFloatIterative(Math.sqrt, x), 1 / (2 * Math.sqrt(x)), 1e-10)
			}
		})

		test('composite transcendental function matches chain rule', () => {
			const f = (x) => Math.sin(x * x) * Math.exp(-0.5 * x)
			const df = (x) =>
				2 * x * Math.cos(x * x) * Math.exp(-0.5 * x) - 0.5 * Math.sin(x * x) * Math.exp(-0.5 * x)
			for (const x of [-1.5, 0, 0.8, 2.1]) {
				assertClose(derivativeFloatIterative(f, x), df(x), 1e-10)
			}
		})
	})

	describe('options: step h, iterations, tolerance, and higher-order derivatives', () => {
		test('accepts numeric step shorthand as 3rd argument', () => {
			assertClose(derivativeFloatIterative(Math.sin, 1.0, 1e-3), Math.cos(1.0), 1e-11)
		})

		test('single iteration performs plain central difference', () => {
			const h = 1 / 65536
			const expected = (Math.sin(1 + h) - Math.sin(1 - h)) / (2 * h)
			const actual = derivativeFloatIterative(Math.sin, 1, { h, iterations: 1 })
			assertClose(actual, expected, 1e-15)

			const hDec = 1e-5
			const expectedExactSpan = (Math.sin(1 + hDec) - Math.sin(1 - hDec)) / ((1 + hDec) - (1 - hDec))
			const actualDec = derivativeFloatIterative(Math.sin, 1, { h: hDec, iterations: 1 })
			assert.equal(actualDec, expectedExactSpan)
		})

		test('Richardson extrapolation improves accuracy over single iteration', () => {
			const x = 1.2
			const exact = Math.exp(x)
			const single = derivativeFloatIterative(Math.exp, x, { h: 0.1, iterations: 1 })
			const refined = derivativeFloatIterative(Math.exp, x, { h: 0.1, iterations: 6 })
			assert.ok(Math.abs(refined - exact) < Math.abs(single - exact) * 1e-6)
			assertClose(refined, exact, 1e-12)
		})

		test('higher-order derivatives cross-checked against analytic formulas', () => {
			// d^2/dx^2 sin(x) = -sin(x), d^3/dx^3 sin(x) = -cos(x), d^4/dx^4 sin(x) = sin(x)
			const x = 0.9
			assertClose(derivativeFloatIterative(Math.sin, x, { order: 2 }), -Math.sin(x), 1e-8)
			assertClose(derivativeFloatIterative(Math.sin, x, { order: 3 }), -Math.cos(x), 1e-6)
			assertClose(derivativeFloatIterative(Math.sin, x, { order: 4 }), Math.sin(x), 1e-5)

			// d^2/dx^2 x^4 = 12x^2, d^3/dx^3 x^4 = 24x, d^4/dx^4 x^4 = 24
			const poly = (t) => t ** 4
			assertClose(derivativeFloatIterative(poly, 2, { order: 2 }), 48, 1e-8)
			assertClose(derivativeFloatIterative(poly, 2, { order: 3 }), 48, 1e-6)
			assertClose(derivativeFloatIterative(poly, 2, { order: 4 }), 24, 1e-5)
		})

		test('large magnitude x scales step appropriately', () => {
			const f = (x) => 0.5 * x * x
			assertClose(derivativeFloatIterative(f, 1e6), 1e6, 1e-9)
			assertClose(derivativeFloatIterative(f, -1e6), -1e6, 1e-9)
		})
	})

	describe('input validation and error handling', () => {
		test('rejects invalid function argument f', () => {
			for (const badF of [null, undefined, 123, 'x => x', {}]) {
				assert.throws(() => derivativeFloatIterative(badF, 1), TypeError)
			}
		})

		test('rejects non-number or non-finite x', () => {
			assert.throws(() => derivativeFloatIterative(Math.sin, '1'), TypeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, null), TypeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, undefined), TypeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, NaN), RangeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, Infinity), RangeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, -Infinity), RangeError)
		})

		test('rejects invalid options argument and invalid option fields', () => {
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, null), TypeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, []), TypeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, '1e-4'), TypeError)

			// Invalid h
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, 0), RangeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, -1e-4), RangeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, NaN), RangeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, Infinity), RangeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, { h: '0.01' }), TypeError)

			// Invalid order
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, { order: 0 }), RangeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, { order: -1 }), RangeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, { order: 1.5 }), RangeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, { order: 9 }), RangeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, { order: '1' }), TypeError)

			// Invalid iterations
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, { iterations: 0 }), RangeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, { iterations: -3 }), RangeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, { iterations: 2.5 }), RangeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, { iterations: 31 }), RangeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, { iterations: '5' }), TypeError)

			// Invalid tolerance
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, { tolerance: -1e-6 }), RangeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, { tolerance: NaN }), RangeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, { tolerance: Infinity }), RangeError)
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, { tolerance: '1e-9' }), TypeError)
		})

		test('rejects step size h that underflows relative to x', () => {
			assert.throws(() => derivativeFloatIterative(Math.sin, 1, { h: 1e-30 }), RangeError)
		})

		test('rejects non-finite or non-numeric outputs from f', () => {
			assert.throws(() => derivativeFloatIterative(() => NaN, 1), RangeError)
			assert.throws(() => derivativeFloatIterative(() => Infinity, 1), RangeError)
			assert.throws(() => derivativeFloatIterative(() => -Infinity, 1), RangeError)
			assert.throws(() => derivativeFloatIterative(() => '42', 1), RangeError)
			assert.throws(() => derivativeFloatIterative((x) => Math.sqrt(x), -1), RangeError)
			assert.throws(() => derivativeFloatIterative((x) => 1 / (x - 1), 1, { h: 0.1, order: 2 }), RangeError)
		})
	})
})
