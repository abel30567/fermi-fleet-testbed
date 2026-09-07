import { test } from 'node:test'
import assert from 'node:assert'
import { add, scalarCurl2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('scalarCurl2: P=-y, Q=x gives ~2 (uniform rotation)', () => {
	const P = (x, y) => -y
	const Q = (x, y) => x
	assert.ok(Math.abs(scalarCurl2(P, Q, 0, 0) - 2) < 1e-6)
	assert.ok(Math.abs(scalarCurl2(P, Q, 3, -4) - 2) < 1e-6)
})

test('scalarCurl2: irrotational field (gradient) gives ~0', () => {
	// P = 2x, Q = 2y => dQ/dx - dP/dy = 0
	const P = (x, y) => 2 * x
	const Q = (x, y) => 2 * y
	assert.ok(Math.abs(scalarCurl2(P, Q, 1, 1)) < 1e-6)
})

test('scalarCurl2: P=0, Q=x*y gives dQ/dx = y', () => {
	const P = (x, y) => 0
	const Q = (x, y) => x * y
	assert.ok(Math.abs(scalarCurl2(P, Q, 2, 5) - 5) < 1e-4)
})

test('scalarCurl2: P=x*y, Q=0 gives -dP/dy = -x', () => {
	const P = (x, y) => x * y
	const Q = (x, y) => 0
	assert.ok(Math.abs(scalarCurl2(P, Q, 7, 3) - (-7)) < 1e-4)
})

test('scalarCurl2: respects custom step size h', () => {
	const P = (x, y) => -y
	const Q = (x, y) => x
	assert.ok(Math.abs(scalarCurl2(P, Q, 0, 0, 1e-3) - 2) < 1e-4)
})
