import { test } from 'node:test'
import assert from 'node:assert'
import { add, divergence2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('divergence2: P=x, Q=y gives ~2 everywhere', () => {
	const P = (x, y) => x
	const Q = (x, y) => y
	assert.ok(Math.abs(divergence2(P, Q, 0, 0) - 2) < 1e-6)
	assert.ok(Math.abs(divergence2(P, Q, 3, -4) - 2) < 1e-6)
	assert.ok(Math.abs(divergence2(P, Q, -2.5, 7.1) - 2) < 1e-6)
})

test('divergence2: constant field has zero divergence', () => {
	const P = () => 5
	const Q = () => -3
	assert.ok(Math.abs(divergence2(P, Q, 1, 1)) < 1e-6)
})

test('divergence2: P=x^2, Q=y^2 gives ~2x+2y', () => {
	const P = (x, y) => x * x
	const Q = (x, y) => y * y
	const result = divergence2(P, Q, 3, 4)
	assert.ok(Math.abs(result - (2 * 3 + 2 * 4)) < 1e-3)
})

test('divergence2: P=-y, Q=x (rotation field) has zero divergence', () => {
	const P = (x, y) => -y
	const Q = (x, y) => x
	assert.ok(Math.abs(divergence2(P, Q, 2, -1)) < 1e-6)
})

test('divergence2: respects custom step size h', () => {
	const P = (x, y) => x
	const Q = (x, y) => y
	assert.ok(Math.abs(divergence2(P, Q, 0, 0, 1e-3) - 2) < 1e-4)
})
