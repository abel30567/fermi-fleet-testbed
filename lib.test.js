import { test } from 'node:test'
import assert from 'node:assert'
import { add, partialX } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('partialX: d/dx(x^2 y) at (2,3) ~= 12', () => {
	const f = (x, y) => x * x * y
	const result = partialX(f, 2, 3)
	assert.ok(Math.abs(result - 12) < 1e-3)
})

test('partialX: d/dx(x*y) at (5,4) ~= y = 4', () => {
	const f = (x, y) => x * y
	const result = partialX(f, 5, 4)
	assert.ok(Math.abs(result - 4) < 1e-3)
})

test('partialX: d/dx(constant wrt x) at any point ~= 0', () => {
	const f = (x, y) => y * y
	const result = partialX(f, 10, 7)
	assert.ok(Math.abs(result - 0) < 1e-3)
})

test('partialX: respects custom h', () => {
	const f = (x, y) => x * x * y
	const result = partialX(f, 2, 3, 1e-3)
	assert.ok(Math.abs(result - 12) < 1e-3)
})

test('partialX: works with negative coordinates', () => {
	const f = (x, y) => x * x * y
	const result = partialX(f, -2, 3)
	assert.ok(Math.abs(result - (-12)) < 1e-3)
})
