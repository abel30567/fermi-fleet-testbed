import { test } from 'node:test'
import assert from 'node:assert'
import { add, laplacian2D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('laplacian2D computes exact Laplacian for quadratic polynomials', () => {
	const f = (x, y) => x * x + y * y
	assert.ok(Math.abs(laplacian2D(f, 0, 0) - 4) < 1e-5)
	assert.ok(Math.abs(laplacian2D(f, 3, -4) - 4) < 1e-4)

	const g = (x, y) => 3 * x * x - 2 * y * y + 5 * x * y
	assert.ok(Math.abs(laplacian2D(g, 1.5, -2.5) - 2) < 1e-4)
})

test('laplacian2D vanishes for harmonic and affine functions', () => {
	const harmonicPoly = (x, y) => x * x - y * y
	assert.ok(Math.abs(laplacian2D(harmonicPoly, 2, -3)) < 1e-5)

	const harmonicExp = (x, y) => Math.exp(x) * Math.cos(y)
	assert.ok(Math.abs(laplacian2D(harmonicExp, 0.5, 1.2)) < 1e-5)

	const affine = (x, y) => 7 * x - 11 * y + 42
	assert.ok(Math.abs(laplacian2D(affine, -5, 8)) < 1e-5)
})

test('laplacian2D satisfies eigenfunction identities for trig and exponential functions', () => {
	const trig = (x, y) => Math.sin(x) * Math.cos(y)
	const x1 = 0.7
	const y1 = 1.1
	assert.ok(Math.abs(laplacian2D(trig, x1, y1) - -2 * trig(x1, y1)) < 1e-5)

	const expFn = (x, y) => Math.exp(2 * x + 3 * y)
	const x2 = 0.2
	const y2 = -0.3
	assert.ok(Math.abs(laplacian2D(expFn, x2, y2) - 13 * expFn(x2, y2)) < 1e-4)
})

test('laplacian2D handles higher-degree polynomials with cross terms', () => {
	const f = (x, y) => x ** 3 * y + 2 * x * y ** 3 + 4 * x * y
	const x = 1.5
	const y = -2
	const expected = 6 * x * y + 12 * x * y
	assert.ok(Math.abs(laplacian2D(f, x, y) - expected) < 1e-4)
})

test('laplacian2D obeys linearity and supports custom step size h', () => {
	const f = (x, y) => Math.sin(x * y)
	const g = (x, y) => x ** 4 + y ** 3
	const a = 2.5
	const b = -1.3
	const combined = (x, y) => a * f(x, y) + b * g(x, y)
	const lhs = laplacian2D(combined, 1.1, 0.8, 1e-3)
	const rhs = a * laplacian2D(f, 1.1, 0.8, 1e-3) + b * laplacian2D(g, 1.1, 0.8, 1e-3)
	assert.ok(Math.abs(lhs - rhs) < 1e-5)
})

test('laplacian2D handles constant functions and validates arguments', () => {
	assert.equal(laplacian2D(() => 42, 10, -20), 0)
	assert.throws(() => laplacian2D('not-a-fn', 0, 0), TypeError)
	assert.throws(() => laplacian2D((x, y) => x + y, NaN, 0), TypeError)
	assert.throws(() => laplacian2D((x, y) => x + y, 0, Infinity), TypeError)
	assert.throws(() => laplacian2D((x, y) => x + y, 0, 0, 0), RangeError)
	assert.throws(() => laplacian2D((x, y) => x + y, 0, 0, -1e-4), RangeError)
	assert.throws(() => laplacian2D((x, y) => x + y, 0, 0, NaN), RangeError)
})
