import { test } from 'node:test'
import assert from 'node:assert'
import { add, partialY } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('partialY: polynomial functions', () => {
	const f = (x, y) => x * x * y + 3 * y ** 3 - 2 * x + 5
	// ∂f/∂y = x^2 + 9y^2
	assert.ok(Math.abs(partialY(f, 2, 3) - (4 + 81)) < 1e-6)
	assert.ok(Math.abs(partialY(f, -1.5, 0.5) - (2.25 + 2.25)) < 1e-6)
})

test('partialY: trigonometric and exponential functions', () => {
	const f = (x, y) => Math.sin(x * y) * Math.exp(y)
	// ∂f/∂y = e^y * (x * cos(x*y) + sin(x*y))
	const x = 1.2
	const y = 0.7
	const expected = Math.exp(y) * (x * Math.cos(x * y) + Math.sin(x * y))
	assert.ok(Math.abs(partialY(f, x, y) - expected) < 1e-8)
})

test('partialY: constant and linear in y', () => {
	const independentOfY = (x) => x ** 3 + 7
	assert.equal(partialY(independentOfY, 5, 0), 0)
	assert.equal(partialY(independentOfY, -3, 10), 0)

	const linearInY = (x, y) => 4 * x - 7 * y + 2
	assert.ok(Math.abs(partialY(linearInY, 10, -4) - (-7)) < 1e-8)
})

test('partialY: linearity, product rule, and symmetry identities', () => {
	const f = (x, y) => x * Math.cos(y) + y * y
	const g = (x, y) => Math.exp(-x) * (y + 1)
	const a = 2.5
	const b = -1.75
	const x = 0.8
	const y = 1.3

	// Linearity: ∂(a*f + b*g)/∂y = a*∂f/∂y + b*∂g/∂y
	const combined = (u, v) => a * f(u, v) + b * g(u, v)
	const lhsLin = partialY(combined, x, y)
	const rhsLin = a * partialY(f, x, y) + b * partialY(g, x, y)
	assert.ok(Math.abs(lhsLin - rhsLin) < 1e-7)

	// Product rule: ∂(f*g)/∂y = (∂f/∂y)*g + f*(∂g/∂y)
	const prod = (u, v) => f(u, v) * g(u, v)
	const lhsProd = partialY(prod, x, y)
	const rhsProd = partialY(f, x, y) * g(x, y) + f(x, y) * partialY(g, x, y)
	assert.ok(Math.abs(lhsProd - rhsProd) < 1e-7)

	// Symmetry for even function in y: ∂(y^2)/∂y is odd and 0 at y = 0
	const evenY = (u, v) => u + v * v
	assert.equal(partialY(evenY, 3, 0), 0)
	assert.ok(Math.abs(partialY(evenY, 3, -2) + partialY(evenY, 3, 2)) < 1e-9)
})

test('partialY: custom step size h and exactness on quadratics', () => {
	// Central difference is algebraically exact for polynomials of degree <= 2 in y
	const quad = (x, y) => x * y * y - 5 * y + x * x
	// ∂f/∂y = 2*x*y - 5 -> at (3, 4) = 19
	assert.equal(partialY(quad, 3, 4, 1), 19)
	assert.ok(Math.abs(partialY(quad, 3, 4, 1e-4) - 19) < 1e-10)
})

test('partialY: boundary cases and invalid input errors', () => {
	assert.throws(() => partialY(null, 1, 2), TypeError)
	assert.throws(() => partialY((x, y) => x + y, NaN, 1), RangeError)
	assert.throws(() => partialY((x, y) => x + y, 1, Infinity), RangeError)
	assert.throws(() => partialY((x, y) => x + y, 1, 2, 0), RangeError)
	assert.throws(() => partialY((x, y) => x + y, 1, 2, -1e-6), RangeError)
	assert.throws(() => partialY((x, y) => x + y, 1, 2, NaN), RangeError)
})
