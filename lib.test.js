import { test } from 'node:test'
import assert from 'node:assert'
import { add, gradient3 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('gradient3 of f = x*y + z at (2,3,1)', () => {
	const f = (x, y, z) => x * y + z
	const [gx, gy, gz] = gradient3(f, 2, 3, 1)
	assert.ok(Math.abs(gx - 3) < 1e-3)
	assert.ok(Math.abs(gy - 2) < 1e-3)
	assert.ok(Math.abs(gz - 1) < 1e-3)
})

test('gradient3 of constant function is zero vector', () => {
	const f = () => 42
	const [gx, gy, gz] = gradient3(f, 5, -2, 3)
	assert.ok(Math.abs(gx) < 1e-3)
	assert.ok(Math.abs(gy) < 1e-3)
	assert.ok(Math.abs(gz) < 1e-3)
})

test('gradient3 of f = x^2 + y^2 + z^2 at (1,2,3)', () => {
	const f = (x, y, z) => x * x + y * y + z * z
	const [gx, gy, gz] = gradient3(f, 1, 2, 3)
	assert.ok(Math.abs(gx - 2) < 1e-3)
	assert.ok(Math.abs(gy - 4) < 1e-3)
	assert.ok(Math.abs(gz - 6) < 1e-3)
})

test('gradient3 respects custom step size h', () => {
	const f = (x, y, z) => x * y * z
	const [gx, gy, gz] = gradient3(f, 2, 3, 4, 1e-3)
	assert.ok(Math.abs(gx - 12) < 1e-2)
	assert.ok(Math.abs(gy - 8) < 1e-2)
	assert.ok(Math.abs(gz - 6) < 1e-2)
})
