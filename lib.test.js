import { test } from 'node:test'
import assert from 'node:assert'
import { add, gaussLegendre5 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('gaussLegendre5 integrates polynomials up to degree 9 exactly', () => {
	const poly = (x) =>
		x ** 9 - 3 * x ** 7 + 2 * x ** 4 - 5 * x ** 2 + 7 * x - 1
	const antideriv = (x) =>
		x ** 10 / 10 -
		(3 * x ** 8) / 8 +
		(2 * x ** 5) / 5 -
		(5 * x ** 3) / 3 +
		(7 * x ** 2) / 2 -
		x

	const exact1 = antideriv(1) - antideriv(0)
	assert.ok(Math.abs(gaussLegendre5(poly, 0, 1) - exact1) < 1e-12)

	const exact2 = antideriv(3) - antideriv(-2)
	assert.ok(Math.abs(gaussLegendre5(poly, -2, 3) - exact2) < 1e-9)

	// Monomials x^0 through x^9 on [-1, 1]
	for (let k = 0; k <= 9; k++) {
		const expected = k % 2 === 0 ? 2 / (k + 1) : 0
		const actual = gaussLegendre5((x) => x ** k, -1, 1)
		assert.ok(
			Math.abs(actual - expected) < 1e-13,
			`x^${k}: expected ${expected}, got ${actual}`,
		)
	}
})

test('gaussLegendre5 accurately integrates smooth transcendental functions', () => {
	const sinIntegral = gaussLegendre5(Math.sin, 0, Math.PI)
	assert.ok(Math.abs(sinIntegral - 2) < 1e-6)

	const expIntegral = gaussLegendre5(Math.exp, 0, 1)
	assert.ok(Math.abs(expIntegral - (Math.E - 1)) < 1e-12)

	const invIntegral = gaussLegendre5((x) => 1 / x, 1, 2)
	assert.ok(Math.abs(invIntegral - Math.LN2) < 1e-6)
})

test('gaussLegendre5 satisfies linearity and interval additivity', () => {
	const f = (x) => x ** 4 + 1
	const g = (x) => Math.cos(x)
	const alpha = 2.5
	const beta = -1.75

	const combined = gaussLegendre5((x) => alpha * f(x) + beta * g(x), -1, 2)
	const separate =
		alpha * gaussLegendre5(f, -1, 2) + beta * gaussLegendre5(g, -1, 2)
	assert.ok(Math.abs(combined - separate) < 1e-12)

	const p = (x) => x ** 8 - 2 * x ** 3 + 4
	const whole = gaussLegendre5(p, -1, 3)
	const parts = gaussLegendre5(p, -1, 1) + gaussLegendre5(p, 1, 3)
	assert.ok(Math.abs(whole - parts) < 1e-9)
})

test('gaussLegendre5 satisfies reversed-bounds negation and odd-function symmetry', () => {
	const f = (x) => x ** 3 + 2 * x ** 2 + 1
	const forward = gaussLegendre5(f, 1, 4)
	const backward = gaussLegendre5(f, 4, 1)
	assert.ok(Math.abs(forward + backward) < 1e-12)

	const odd = (x) => Math.sin(x) * x ** 2
	assert.ok(Math.abs(gaussLegendre5(odd, -2.5, 2.5)) < 1e-14)
})

test('gaussLegendre5 handles boundary cases and invalid arguments', () => {
	assert.equal(gaussLegendre5((x) => x ** 2, 3, 3), 0)
	assert.equal(gaussLegendre5(() => 42, -5, -1), 168)

	assert.throws(() => gaussLegendre5(null, 0, 1), TypeError)
	assert.throws(() => gaussLegendre5((x) => x, NaN, 1), RangeError)
	assert.throws(() => gaussLegendre5((x) => x, 0, Infinity), RangeError)
})
