import { test } from 'node:test'
import assert from 'node:assert'
import { add, trapezoid1D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('trapezoid1D integrates constant and linear functions exactly', () => {
	assert.ok(Math.abs(trapezoid1D(() => 5, 1, 4, 1) - 15) < 1e-12)
	assert.ok(Math.abs(trapezoid1D((x) => 3 * x + 2, 0, 4, 1) - 32) < 1e-12)
	assert.ok(Math.abs(trapezoid1D((x) => -2 * x + 7, -3, 5, 10) - 40) < 1e-12)
})

test('trapezoid1D integrates polynomials and transcendental functions accurately', () => {
	const xSquared = trapezoid1D((x) => x * x, 0, 1)
	assert.ok(Math.abs(xSquared - 1 / 3) < 1e-6)

	const xCubed = trapezoid1D((x) => x ** 3, 0, 2)
	assert.ok(Math.abs(xCubed - 4) < 1e-5)

	const sinIntegral = trapezoid1D(Math.sin, 0, Math.PI)
	assert.ok(Math.abs(sinIntegral - 2) < 1e-5)

	const expIntegral = trapezoid1D(Math.exp, 0, 1)
	assert.ok(Math.abs(expIntegral - (Math.E - 1)) < 1e-6)
})

test('trapezoid1D satisfies reversed-bounds, additivity, and linearity identities', () => {
	const f = (x) => Math.sin(x) + x * x
	const g = (x) => Math.cos(x)

	const forward = trapezoid1D(f, 0, 2, 500)
	const backward = trapezoid1D(f, 2, 0, 500)
	assert.ok(Math.abs(forward + backward) < 1e-12)

	const total = trapezoid1D(f, 0, 3, 1000)
	const part1 = trapezoid1D(f, 0, 1.5, 500)
	const part2 = trapezoid1D(f, 1.5, 3, 500)
	assert.ok(Math.abs(total - (part1 + part2)) < 1e-12)

	const combined = trapezoid1D((x) => 2 * f(x) - 3 * g(x), 0, 2, 500)
	const linear = 2 * trapezoid1D(f, 0, 2, 500) - 3 * trapezoid1D(g, 0, 2, 500)
	assert.ok(Math.abs(combined - linear) < 1e-12)
})

test('trapezoid1D exhibits O(h^2) convergence order', () => {
	const err100 = Math.abs(trapezoid1D(Math.sin, 0, Math.PI, 100) - 2)
	const err200 = Math.abs(trapezoid1D(Math.sin, 0, Math.PI, 200) - 2)
	const ratio = err100 / err200
	assert.ok(ratio > 3.9 && ratio < 4.1, `Expected ratio ~4, got ${ratio}`)
})

test('trapezoid1D handles boundary cases (zero-width interval and n=1)', () => {
	assert.equal(trapezoid1D(Math.sin, 2.5, 2.5), 0)
	assert.equal(trapezoid1D((x) => x * x, 0, 2, 1), 4)
})

test('trapezoid1D validates arguments', () => {
	assert.throws(() => trapezoid1D(null, 0, 1), TypeError)
	assert.throws(() => trapezoid1D(Math.sin, Number.NaN, 1), RangeError)
	assert.throws(() => trapezoid1D(Math.sin, 0, Number.POSITIVE_INFINITY), RangeError)
	assert.throws(() => trapezoid1D(Math.sin, 0, 1, 0), RangeError)
	assert.throws(() => trapezoid1D(Math.sin, 0, 1, -10), RangeError)
	assert.throws(() => trapezoid1D(Math.sin, 0, 1, 2.5), RangeError)
})
