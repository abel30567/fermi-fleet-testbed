import { test } from 'node:test'
import assert from 'node:assert'
import { add, linearApprox2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('linearApprox2: f = x^2 + y^2 near (1,1) at (1.1,1.1)', () => {
	const f = (x, y) => x * x + y * y
	const result = linearApprox2(f, 1, 1, 1.1, 1.1)
	assert.ok(Math.abs(result - 2.4) < 1e-2)
})

test('linearApprox2: exact at the base point', () => {
	const f = (x, y) => x * x + y * y
	const result = linearApprox2(f, 1, 1, 1, 1)
	assert.ok(Math.abs(result - f(1, 1)) < 1e-6)
})

test('linearApprox2: exact for a linear function everywhere', () => {
	const f = (x, y) => 3 * x + 2 * y + 5
	const result = linearApprox2(f, 2, -1, 10, 7)
	assert.ok(Math.abs(result - f(10, 7)) < 1e-6)
})

test('linearApprox2: matches partial derivatives for f = x*y at (2,3)', () => {
	// df/dx = y = 3, df/dy = x = 2 at (2,3); f(2,3) = 6
	const f = (x, y) => x * y
	const result = linearApprox2(f, 2, 3, 2.01, 2.99)
	const expected = 6 + 3 * 0.01 + 2 * -0.01
	assert.ok(Math.abs(result - expected) < 1e-4)
})

test('linearApprox2: respects custom step size h', () => {
	const f = (x, y) => x * x + y * y
	const result = linearApprox2(f, 1, 1, 1.1, 1.1, 1e-3)
	assert.ok(Math.abs(result - 2.4) < 1e-2)
})
