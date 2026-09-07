import { test } from 'node:test'
import assert from 'node:assert'
import { add, gradient2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('gradient2 of x^2 + y^2 at (1, 2)', () => {
	const f = (x, y) => x * x + y * y
	const [dfdx, dfdy] = gradient2(f, 1, 2)
	assert.ok(Math.abs(dfdx - 2) < 1e-3)
	assert.ok(Math.abs(dfdy - 4) < 1e-3)
})

test('gradient2 of a constant function is zero', () => {
	const f = () => 42
	const [dfdx, dfdy] = gradient2(f, 5, -3)
	assert.ok(Math.abs(dfdx) < 1e-3)
	assert.ok(Math.abs(dfdy) < 1e-3)
})

test('gradient2 of x*y at (3, 4)', () => {
	const f = (x, y) => x * y
	const [dfdx, dfdy] = gradient2(f, 3, 4)
	assert.ok(Math.abs(dfdx - 4) < 1e-3)
	assert.ok(Math.abs(dfdy - 3) < 1e-3)
})

test('gradient2 respects a custom step size h', () => {
	const f = (x, y) => x * x + y * y
	const [dfdx, dfdy] = gradient2(f, 1, 2, 1e-3)
	assert.ok(Math.abs(dfdx - 2) < 1e-3)
	assert.ok(Math.abs(dfdy - 4) < 1e-3)
})
