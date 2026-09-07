import { test } from 'node:test'
import assert from 'node:assert'
import { add, cylindricalToCartesian } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('cylindricalToCartesian: (2, pi, 5) -> [-2, 0, 5]', () => {
	const [x, y, z] = cylindricalToCartesian(2, Math.PI, 5)
	assert.ok(Math.abs(x - -2) < 1e-9)
	assert.ok(Math.abs(y - 0) < 1e-9)
	assert.equal(z, 5)
})

test('cylindricalToCartesian: (0, theta, z) -> [0, 0, z]', () => {
	const [x, y, z] = cylindricalToCartesian(0, 1.2345, 7)
	assert.ok(Math.abs(x - 0) < 1e-9)
	assert.ok(Math.abs(y - 0) < 1e-9)
	assert.equal(z, 7)
})

test('cylindricalToCartesian: (1, 0, 0) -> [1, 0, 0]', () => {
	const [x, y, z] = cylindricalToCartesian(1, 0, 0)
	assert.ok(Math.abs(x - 1) < 1e-9)
	assert.ok(Math.abs(y - 0) < 1e-9)
	assert.equal(z, 0)
})

test('cylindricalToCartesian: (1, pi/2, 3) -> [0, 1, 3]', () => {
	const [x, y, z] = cylindricalToCartesian(1, Math.PI / 2, 3)
	assert.ok(Math.abs(x - 0) < 1e-9)
	assert.ok(Math.abs(y - 1) < 1e-9)
	assert.equal(z, 3)
})

test('cylindricalToCartesian: (3, -pi/2, -4) -> [0, -3, -4]', () => {
	const [x, y, z] = cylindricalToCartesian(3, -Math.PI / 2, -4)
	assert.ok(Math.abs(x - 0) < 1e-9)
	assert.ok(Math.abs(y - -3) < 1e-9)
	assert.equal(z, -4)
})
