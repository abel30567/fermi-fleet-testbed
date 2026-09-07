import { test } from 'node:test'
import assert from 'node:assert'
import { add, jacobian22 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('jacobian22 of [x*y, x+y] at (2,3)', () => {
	const F = (x, y) => [x * y, x + y]
	const J = jacobian22(F, 2, 3)
	assert.ok(Math.abs(J[0][0] - 3) < 1e-3)
	assert.ok(Math.abs(J[0][1] - 2) < 1e-3)
	assert.ok(Math.abs(J[1][0] - 1) < 1e-3)
	assert.ok(Math.abs(J[1][1] - 1) < 1e-3)
})

test('jacobian22 of [x^2*y, y^2] at (1,2)', () => {
	const F = (x, y) => [x * x * y, y * y]
	const J = jacobian22(F, 1, 2)
	// du/dx = 2xy = 4, du/dy = x^2 = 1, dv/dx = 0, dv/dy = 2y = 4
	assert.ok(Math.abs(J[0][0] - 4) < 1e-3)
	assert.ok(Math.abs(J[0][1] - 1) < 1e-3)
	assert.ok(Math.abs(J[1][0] - 0) < 1e-3)
	assert.ok(Math.abs(J[1][1] - 4) < 1e-3)
})

test('jacobian22 respects custom h', () => {
	const F = (x, y) => [Math.sin(x) + y, x - Math.cos(y)]
	const J = jacobian22(F, 0, 0, 1e-6)
	// du/dx = cos(x) = 1, du/dy = 1, dv/dx = 1, dv/dy = sin(y) = 0
	assert.ok(Math.abs(J[0][0] - 1) < 1e-3)
	assert.ok(Math.abs(J[0][1] - 1) < 1e-3)
	assert.ok(Math.abs(J[1][0] - 1) < 1e-3)
	assert.ok(Math.abs(J[1][1] - 0) < 1e-3)
})
