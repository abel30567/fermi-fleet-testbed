import { test } from 'node:test'
import assert from 'node:assert'
import { add, gradientNorm2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('gradientNorm2: x^2 + y^2 at (3,4) is ~10', () => {
	const f = (x, y) => x * x + y * y
	assert.ok(Math.abs(gradientNorm2(f, 3, 4) - 10) < 1e-3)
})

test('gradientNorm2: constant function has zero gradient', () => {
	const f = () => 42
	assert.ok(Math.abs(gradientNorm2(f, 1, 1) - 0) < 1e-3)
})

test('gradientNorm2: linear function f = 3x + 2y has constant gradient norm sqrt(13)', () => {
	const f = (x, y) => 3 * x + 2 * y
	assert.ok(Math.abs(gradientNorm2(f, 0, 0) - Math.sqrt(13)) < 1e-3)
	assert.ok(Math.abs(gradientNorm2(f, 100, -50) - Math.sqrt(13)) < 1e-3)
})

test('gradientNorm2: f = x*y at (2,5) matches gradient (y,x) -> sqrt(29)', () => {
	const f = (x, y) => x * y
	assert.ok(Math.abs(gradientNorm2(f, 2, 5) - Math.sqrt(2 * 2 + 5 * 5)) < 1e-3)
})

test('gradientNorm2: respects custom step size h', () => {
	const f = (x, y) => x * x + y * y
	assert.ok(Math.abs(gradientNorm2(f, 3, 4, 1e-3) - 10) < 1e-3)
})
