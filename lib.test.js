import { test } from 'node:test'
import assert from 'node:assert'
import { add, sphericalJacobian } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('sphericalJacobian: rho=2, phi=pi/2 -> 4', () => {
	assert.equal(sphericalJacobian(2, Math.PI / 2), 4)
})

test('sphericalJacobian: phi=0 -> 0', () => {
	assert.equal(sphericalJacobian(5, 0), 0)
})

test('sphericalJacobian: phi=pi -> ~0', () => {
	assert.ok(Math.abs(sphericalJacobian(3, Math.PI)) < 1e-10)
})

test('sphericalJacobian: rho=0 -> 0', () => {
	assert.equal(sphericalJacobian(0, Math.PI / 4), 0)
})

test('sphericalJacobian: rho=1, phi=pi/6', () => {
	assert.ok(Math.abs(sphericalJacobian(1, Math.PI / 6) - 0.5) < 1e-10)
})

test('sphericalJacobian: negative rho squares to positive', () => {
	assert.equal(sphericalJacobian(-2, Math.PI / 2), 4)
})
