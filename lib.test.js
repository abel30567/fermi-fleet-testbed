import { test } from 'node:test'
import assert from 'node:assert'
import { add, tangentPlane } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('tangentPlane: f = x^2 + y^2 at (1, 1)', () => {
	const f = (x, y) => x * x + y * y
	const { fx, fy, z0 } = tangentPlane(f, 1, 1)
	assert.ok(Math.abs(fx - 2) < 1e-4)
	assert.ok(Math.abs(fy - 2) < 1e-4)
	assert.equal(z0, 2)
})

test('tangentPlane: f = x^2 + y^2 at origin (flat point)', () => {
	const f = (x, y) => x * x + y * y
	const { fx, fy, z0 } = tangentPlane(f, 0, 0)
	assert.ok(Math.abs(fx - 0) < 1e-4)
	assert.ok(Math.abs(fy - 0) < 1e-4)
	assert.equal(z0, 0)
})

test('tangentPlane: f = 3x + 4y + 5 (already planar, exact gradient)', () => {
	const f = (x, y) => 3 * x + 4 * y + 5
	const { fx, fy, z0 } = tangentPlane(f, 2, -3)
	assert.ok(Math.abs(fx - 3) < 1e-6)
	assert.ok(Math.abs(fy - 4) < 1e-6)
	assert.equal(z0, f(2, -3))
})

test('tangentPlane: f = x*y at (2, 3)', () => {
	const f = (x, y) => x * y
	const { fx, fy, z0 } = tangentPlane(f, 2, 3)
	assert.ok(Math.abs(fx - 3) < 1e-4)
	assert.ok(Math.abs(fy - 2) < 1e-4)
	assert.equal(z0, 6)
})

test('tangentPlane: respects custom step size h', () => {
	const f = (x, y) => x * x + y * y
	const { fx, fy, z0 } = tangentPlane(f, 1, 1, 1e-3)
	assert.ok(Math.abs(fx - 2) < 1e-2)
	assert.ok(Math.abs(fy - 2) < 1e-2)
	assert.equal(z0, 2)
})
