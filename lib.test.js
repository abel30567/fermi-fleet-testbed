import { test } from 'node:test'
import assert from 'node:assert'
import { add, gradientN } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('gradientN: f = x^2 + y^2 at [1, 2]', () => {
	const f = (v) => v[0] * v[0] + v[1] * v[1]
	const grad = gradientN(f, [1, 2])
	assert.ok(Math.abs(grad[0] - 2) < 1e-4)
	assert.ok(Math.abs(grad[1] - 4) < 1e-4)
})

test('gradientN: constant function has zero gradient', () => {
	const f = () => 42
	const grad = gradientN(f, [1, 2, 3])
	for (const g of grad) {
		assert.ok(Math.abs(g) < 1e-6)
	}
})

test('gradientN: linear function f = 3x + 5y - z', () => {
	const f = (v) => 3 * v[0] + 5 * v[1] - v[2]
	const grad = gradientN(f, [0, 0, 0])
	assert.ok(Math.abs(grad[0] - 3) < 1e-4)
	assert.ok(Math.abs(grad[1] - 5) < 1e-4)
	assert.ok(Math.abs(grad[2] - -1) < 1e-4)
})

test('gradientN: single-variable function', () => {
	const f = (v) => v[0] * v[0] * v[0]
	const grad = gradientN(f, [2])
	assert.ok(Math.abs(grad[0] - 12) < 1e-3)
})

test('gradientN: respects custom h', () => {
	const f = (v) => v[0] * v[0]
	const grad = gradientN(f, [3], 1e-3)
	assert.ok(Math.abs(grad[0] - 6) < 1e-2)
})
