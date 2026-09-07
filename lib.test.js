import { test } from 'node:test'
import assert from 'node:assert'
import { add, partialZ } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('partialZ: df/dz of x*y*z at (2,3,4) is x*y = 6', () => {
	const f = (x, y, z) => x * y * z
	assert.ok(Math.abs(partialZ(f, 2, 3, 4) - 6) < 1e-3)
})

test('partialZ: df/dz of z^2 at (0,0,3) is 2z = 6', () => {
	const f = (x, y, z) => z * z
	assert.ok(Math.abs(partialZ(f, 0, 0, 3) - 6) < 1e-3)
})

test('partialZ: f independent of z has zero derivative', () => {
	const f = (x, y, z) => x + y
	assert.ok(Math.abs(partialZ(f, 5, 7, 9) - 0) < 1e-3)
})

test('partialZ: respects custom h', () => {
	const f = (x, y, z) => x * y * z
	assert.ok(Math.abs(partialZ(f, 2, 3, 4, 1e-3) - 6) < 1e-3)
})
