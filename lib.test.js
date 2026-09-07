import { test } from 'node:test'
import assert from 'node:assert'
import { add, laplacian3 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('laplacian3 of x^2+y^2+z^2 is ~6', () => {
	const f = (x, y, z) => x * x + y * y + z * z
	const result = laplacian3(f, 1, 2, 3)
	assert.ok(Math.abs(result - 6) < 1e-2, `expected ~6, got ${result}`)
})

test('laplacian3 of a linear function is ~0', () => {
	const f = (x, y, z) => 3 * x + 4 * y - 2 * z + 7
	const result = laplacian3(f, 1, -1, 2)
	assert.ok(Math.abs(result - 0) < 1e-2, `expected ~0, got ${result}`)
})

test('laplacian3 of constant function is ~0', () => {
	const f = () => 42
	const result = laplacian3(f, 0, 0, 0)
	assert.ok(Math.abs(result - 0) < 1e-2, `expected ~0, got ${result}`)
})

test('laplacian3 of x^2*y^2*z^2 matches analytic value', () => {
	const f = (x, y, z) => x * x * y * y * z * z
	const x = 1, y = 2, z = 3
	const expected = 2 * y * y * z * z + 2 * x * x * z * z + 2 * x * x * y * y
	const result = laplacian3(f, x, y, z)
	assert.ok(Math.abs(result - expected) < 1e-1, `expected ~${expected}, got ${result}`)
})

test('laplacian3 respects custom step size h', () => {
	const f = (x, y, z) => x * x + y * y + z * z
	const result = laplacian3(f, 1, 2, 3, 1e-3)
	assert.ok(Math.abs(result - 6) < 1e-2, `expected ~6, got ${result}`)
})
