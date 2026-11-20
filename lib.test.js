import { test } from 'node:test'
import assert from 'node:assert'
import { add, biharmonic2D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('biharmonic2D matches exact values for quartic polynomials', () => {
	const tol = 1e-4
	assert.ok(Math.abs(biharmonic2D((x) => x ** 4, 1.5, -2.0) - 24) < tol)
	assert.ok(Math.abs(biharmonic2D((_x, y) => y ** 4, -0.5, 1.2) - 24) < tol)
	assert.ok(Math.abs(biharmonic2D((x, y) => x * x * y * y, 1.0, 2.0) - 8) < tol)
	assert.ok(
		Math.abs(biharmonic2D((x, y) => (x * x + y * y) ** 2, 0.7, -0.3) - 64) < tol
	)
})

test('biharmonic2D vanishes on constants, cubics, harmonic, and biharmonic functions', () => {
	const tol = 1e-3
	assert.ok(Math.abs(biharmonic2D(() => 42, 3, -4)) < 1e-6)
	assert.ok(
		Math.abs(biharmonic2D((x, y) => 2 * x ** 3 - 5 * x * y ** 2 + 3 * y, 1, 2)) <
			tol
	)
	assert.ok(Math.abs(biharmonic2D((x, y) => x * x - y * y, 1.2, -0.8)) < tol)
	assert.ok(
		Math.abs(biharmonic2D((x, y) => Math.exp(x) * Math.cos(y), 0.5, 0.7)) < tol
	)
	assert.ok(
		Math.abs(biharmonic2D((x, y) => x ** 4 - y ** 4, 0.9, -1.1)) < tol
	)
	assert.ok(
		Math.abs(biharmonic2D((x, y) => x * (x * x + y * y), -1.3, 0.6)) < tol
	)
})

test('biharmonic2D approximates exponential and trigonometric eigenfunctions', () => {
	const a = 1.5
	const b = -0.8
	const x = 0.4
	const y = -0.6
	const factor = (a * a + b * b) ** 2

	const expFn = (px, py) => Math.exp(a * px + b * py)
	const expectedExp = factor * expFn(x, y)
	assert.ok(Math.abs(biharmonic2D(expFn, x, y) - expectedExp) < 1e-2)

	const trigFn = (px, py) => Math.sin(a * px) * Math.cos(b * py)
	const expectedTrig = factor * trigFn(x, y)
	assert.ok(Math.abs(biharmonic2D(trigFn, x, y) - expectedTrig) < 1e-2)
})

test('biharmonic2D satisfies linearity', () => {
	const f = (x, y) => Math.sin(x) * Math.exp(0.5 * y)
	const g = (x, y) => (x * x + y * y) ** 2 + Math.cos(y)
	const alpha = 2.5
	const beta = -1.75
	const x = 0.6
	const y = -0.4

	const lhs = biharmonic2D((px, py) => alpha * f(px, py) + beta * g(px, py), x, y)
	const rhs = alpha * biharmonic2D(f, x, y) + beta * biharmonic2D(g, x, y)
	assert.ok(Math.abs(lhs - rhs) < 1e-4)
})

test('biharmonic2D respects rotational invariance and step-size convergence', () => {
	// f(x, y) = (x^2 + y^2)^3 = r^6 => ∇^4(r^6) = 576 * r^2
	const f = (x, y) => (x * x + y * y) ** 3
	const r = 1.1
	const expected = 576 * r * r

	const val1 = biharmonic2D(f, r, 0)
	const val2 = biharmonic2D(f, r * Math.cos(1.1), r * Math.sin(1.1))
	assert.ok(Math.abs(val1 - expected) < 0.5)
	assert.ok(Math.abs(val2 - expected) < 0.5)
	assert.ok(Math.abs(val1 - val2) < 0.1)

	const coarseErr = Math.abs(biharmonic2D(f, r, 0, 1e-1) - expected)
	const fineErr = Math.abs(biharmonic2D(f, r, 0, 1e-2) - expected)
	assert.ok(fineErr < coarseErr * 0.05)
})

test('biharmonic2D validates inputs and boundary cases', () => {
	assert.throws(() => biharmonic2D(null, 0, 0), TypeError)
	assert.throws(() => biharmonic2D('not-a-fn', 0, 0), TypeError)
	assert.throws(() => biharmonic2D((x, y) => x + y, NaN, 0), RangeError)
	assert.throws(() => biharmonic2D((x, y) => x + y, 0, Infinity), RangeError)
	assert.throws(() => biharmonic2D((x, y) => x + y, 0, 0, 0), RangeError)
	assert.throws(() => biharmonic2D((x, y) => x + y, 0, 0, -1e-2), RangeError)
	assert.throws(() => biharmonic2D((x, y) => x + y, 0, 0, NaN), RangeError)
})
