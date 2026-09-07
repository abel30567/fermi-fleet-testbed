import { test } from 'node:test'
import assert from 'node:assert'
import { add, partialY } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('partialY: df/dy of x^2*y at (2,3) is x^2 = 4', () => {
	const f = (x, y) => x * x * y
	const result = partialY(f, 2, 3)
	assert.ok(Math.abs(result - 4) < 1e-3)
})

test('partialY: df/dy of x*y^2 at (2,3) is 2*x*y = 12', () => {
	const f = (x, y) => x * y * y
	const result = partialY(f, 2, 3)
	assert.ok(Math.abs(result - 12) < 1e-3)
})

test('partialY: df/dy of sin(y) at (0,0) is cos(0) = 1', () => {
	const f = (x, y) => Math.sin(y)
	const result = partialY(f, 0, 0)
	assert.ok(Math.abs(result - 1) < 1e-3)
})

test('partialY: f independent of y has zero partial derivative', () => {
	const f = (x, y) => x * x * x
	const result = partialY(f, 5, 10)
	assert.ok(Math.abs(result - 0) < 1e-3)
})

test('partialY: respects custom step size h', () => {
	const f = (x, y) => x * x * y
	const result = partialY(f, 2, 3, 1e-3)
	assert.ok(Math.abs(result - 4) < 1e-3)
})
