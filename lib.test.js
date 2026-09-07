import { test } from 'node:test'
import assert from 'node:assert'
import { add, sphericalToCartesian } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('sphericalToCartesian: phi=0 gives north pole regardless of theta', () => {
	const [x, y, z] = sphericalToCartesian(1, 0, 0)
	assert.ok(Math.abs(x - 0) < 1e-9)
	assert.ok(Math.abs(y - 0) < 1e-9)
	assert.ok(Math.abs(z - 1) < 1e-9)
})

test('sphericalToCartesian: phi=pi/2, theta=0 gives point on +x axis', () => {
	const [x, y, z] = sphericalToCartesian(1, 0, Math.PI / 2)
	assert.ok(Math.abs(x - 1) < 1e-9)
	assert.ok(Math.abs(y - 0) < 1e-9)
	assert.ok(Math.abs(z - 0) < 1e-9)
})

test('sphericalToCartesian: phi=pi/2, theta=pi/2 gives point on +y axis', () => {
	const [x, y, z] = sphericalToCartesian(1, Math.PI / 2, Math.PI / 2)
	assert.ok(Math.abs(x - 0) < 1e-9)
	assert.ok(Math.abs(y - 1) < 1e-9)
	assert.ok(Math.abs(z - 0) < 1e-9)
})

test('sphericalToCartesian: phi=pi gives south pole', () => {
	const [x, y, z] = sphericalToCartesian(1, 0, Math.PI)
	assert.ok(Math.abs(x - 0) < 1e-9)
	assert.ok(Math.abs(y - 0) < 1e-9)
	assert.ok(Math.abs(z - -1) < 1e-9)
})

test('sphericalToCartesian: scales with rho', () => {
	const [x, y, z] = sphericalToCartesian(2, 0, Math.PI / 2)
	assert.ok(Math.abs(x - 2) < 1e-9)
	assert.ok(Math.abs(y - 0) < 1e-9)
	assert.ok(Math.abs(z - 0) < 1e-9)
})
