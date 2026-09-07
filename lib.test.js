import { test } from 'node:test'
import assert from 'node:assert'
import { add, divergence3 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('divergence3 of identity field P=x,Q=y,R=z is ~3', () => {
	const P = (x, y, z) => x
	const Q = (x, y, z) => y
	const R = (x, y, z) => z
	const div = divergence3(P, Q, R, 1, 2, 3)
	assert.ok(Math.abs(div - 3) < 1e-6, `expected ~3, got ${div}`)
})

test('divergence3 of zero field is ~0', () => {
	const zero = () => 0
	const div = divergence3(zero, zero, zero, 1, 1, 1)
	assert.ok(Math.abs(div - 0) < 1e-6, `expected ~0, got ${div}`)
})

test('divergence3 of scaled linear field P=2x,Q=3y,R=4z is ~9', () => {
	const P = (x, y, z) => 2 * x
	const Q = (x, y, z) => 3 * y
	const R = (x, y, z) => 4 * z
	const div = divergence3(P, Q, R, 0, 0, 0)
	assert.ok(Math.abs(div - 9) < 1e-6, `expected ~9, got ${div}`)
})

test('divergence3 of quadratic field P=x^2,Q=y^2,R=z^2 at (1,2,3) is ~2(x+y+z)=12', () => {
	const P = (x, y, z) => x * x
	const Q = (x, y, z) => y * y
	const R = (x, y, z) => z * z
	const div = divergence3(P, Q, R, 1, 2, 3)
	assert.ok(Math.abs(div - 12) < 1e-4, `expected ~12, got ${div}`)
})

test('divergence3 respects a custom step size h', () => {
	const P = (x, y, z) => x
	const Q = (x, y, z) => y
	const R = (x, y, z) => z
	const div = divergence3(P, Q, R, 5, -5, 10, 1e-3)
	assert.ok(Math.abs(div - 3) < 1e-6, `expected ~3, got ${div}`)
})
