import { test } from 'node:test'
import assert from 'node:assert'
import { add, cartesianToSpherical } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('cartesianToSpherical: point on positive z-axis', () => {
	const [rho, theta, phi] = cartesianToSpherical(0, 0, 2)
	assert.equal(rho, 2)
	assert.equal(theta, 0)
	assert.equal(phi, 0)
})

test('cartesianToSpherical: point on positive x-axis', () => {
	const [rho, theta, phi] = cartesianToSpherical(1, 0, 0)
	assert.equal(rho, 1)
	assert.equal(theta, 0)
	assert.equal(phi, Math.PI / 2)
})

test('cartesianToSpherical: point on positive y-axis', () => {
	const [rho, theta, phi] = cartesianToSpherical(0, 1, 0)
	assert.equal(rho, 1)
	assert.equal(theta, Math.PI / 2)
	assert.equal(phi, Math.PI / 2)
})

test('cartesianToSpherical: origin', () => {
	const [rho, theta, phi] = cartesianToSpherical(0, 0, 0)
	assert.equal(rho, 0)
	assert.equal(theta, 0)
	assert.equal(phi, 0)
})

test('cartesianToSpherical: negative z-axis', () => {
	const [rho, theta, phi] = cartesianToSpherical(0, 0, -3)
	assert.equal(rho, 3)
	assert.equal(theta, 0)
	assert.equal(phi, Math.PI)
})

test('cartesianToSpherical: general point matches known formula', () => {
	const [rho, theta, phi] = cartesianToSpherical(1, 1, 1)
	assert.ok(Math.abs(rho - Math.sqrt(3)) < 1e-12)
	assert.ok(Math.abs(theta - Math.PI / 4) < 1e-12)
	assert.ok(Math.abs(phi - Math.acos(1 / Math.sqrt(3))) < 1e-12)
})
