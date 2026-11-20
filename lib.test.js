import { test } from 'node:test'
import assert from 'node:assert'
import { add, partialX } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('partialX computes derivative of polynomial f(x, y)', () => {
	const f = (x, y) => x * x * y + 3 * x - y ** 3
	// ∂f/∂x = 2*x*y + 3
	assert.ok(Math.abs(partialX(f, 2, 4) - 19) < 1e-7)
	assert.ok(Math.abs(partialX(f, -3, 2) - (-9)) < 1e-7)
})

test('partialX returns 0 for functions independent of x', () => {
	const f = (_x, y) => 5 * y * y + 7
	assert.equal(partialX(f, 10, -3), 0)
	assert.equal(partialX(f, 0, 0), 0)
})

test('partialX computes derivative of trigonometric and exponential functions', () => {
	const trig = (x, y) => Math.sin(x) * Math.cos(y)
	const x0 = 0.7
	const y0 = 1.2
	const expectedTrig = Math.cos(x0) * Math.cos(y0)
	assert.ok(Math.abs(partialX(trig, x0, y0) - expectedTrig) < 1e-9)

	const expFn = (x, y) => Math.exp(x * y)
	const expectedExp = y0 * Math.exp(x0 * y0)
	assert.ok(Math.abs(partialX(expFn, x0, y0) - expectedExp) < 1e-7)
})

test('partialX satisfies linearity and product rule identities', () => {
	const f = (x, y) => x ** 3 + y
	const g = (x, y) => Math.cos(x) + 2 * x * y
	const a = 2.5
	const b = -1.5
	const x = 1.1
	const y = -0.8

	// Linearity: ∂(a*f + b*g)/∂x = a*∂f/∂x + b*∂g/∂x
	const linearComb = (u, v) => a * f(u, v) + b * g(u, v)
	const lhsLin = partialX(linearComb, x, y)
	const rhsLin = a * partialX(f, x, y) + b * partialX(g, x, y)
	assert.ok(Math.abs(lhsLin - rhsLin) < 1e-7)

	// Product rule: ∂(f*g)/∂x = (∂f/∂x)*g + f*(∂g/∂x)
	const product = (u, v) => f(u, v) * g(u, v)
	const lhsProd = partialX(product, x, y)
	const rhsProd = partialX(f, x, y) * g(x, y) + f(x, y) * partialX(g, x, y)
	assert.ok(Math.abs(lhsProd - rhsProd) < 1e-6)
})

test('partialX respects custom step size h and is exact for quadratics', () => {
	const quad = (x, y) => 4 * x * x - 2 * x * y + 9 * y * y
	// ∂f/∂x = 8*x - 2*y; at (0, 0) -> 0, at (-1.5, 2.5) -> -17
	assert.ok(Math.abs(partialX(quad, 0, 0, 1e-2) - 0) < 1e-12)
	assert.ok(Math.abs(partialX(quad, -1.5, 2.5, 1e-2) - (-17)) < 1e-11)
	assert.ok(Math.abs(partialX(quad, -1.5, 2.5, -1e-2) - (-17)) < 1e-11)
})

test('partialX validates arguments on invalid inputs', () => {
	assert.throws(() => partialX(null, 1, 2), TypeError)
	assert.throws(() => partialX(42, 1, 2), TypeError)
	assert.throws(() => partialX((x, y) => x + y, 1, 2, 0), RangeError)
	assert.throws(() => partialX((x, y) => x + y, 1, 2, Number.NaN), RangeError)
	assert.throws(() => partialX((x, y) => x + y, 1, 2, Number.POSITIVE_INFINITY), RangeError)
})
