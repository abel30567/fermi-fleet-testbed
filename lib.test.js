import { test } from 'node:test'
import assert from 'node:assert'
import { add, cartesianToCylindrical } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('cartesianToCylindrical: (0, 2, 3) -> [2, pi/2, 3]', () => {
	const [r, theta, z] = cartesianToCylindrical(0, 2, 3)
	assert.ok(Math.abs(r - 2) < 1e-9)
	assert.ok(Math.abs(theta - Math.PI / 2) < 1e-9)
	assert.equal(z, 3)
})

test('cartesianToCylindrical: origin on axis (0, 0, 5) -> [0, 0, 5]', () => {
	const [r, theta, z] = cartesianToCylindrical(0, 0, 5)
	assert.equal(r, 0)
	assert.equal(theta, 0)
	assert.equal(z, 5)
})

test('cartesianToCylindrical: (3, 4, -2) -> [5, atan2(4,3), -2]', () => {
	const [r, theta, z] = cartesianToCylindrical(3, 4, -2)
	assert.ok(Math.abs(r - 5) < 1e-9)
	assert.ok(Math.abs(theta - Math.atan2(4, 3)) < 1e-9)
	assert.equal(z, -2)
})

test('cartesianToCylindrical: negative x, y (-1, -1, 0) -> theta in (-pi, -pi/2)', () => {
	const [r, theta, z] = cartesianToCylindrical(-1, -1, 0)
	assert.ok(Math.abs(r - Math.sqrt(2)) < 1e-9)
	assert.ok(Math.abs(theta - (-3 * Math.PI / 4)) < 1e-9)
	assert.equal(z, 0)
})
