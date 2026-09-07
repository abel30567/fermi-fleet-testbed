import { test } from 'node:test'
import assert from 'node:assert'
import { add, secondPartialYY } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('secondPartialYY: f = x*y^2 at (3,2) is ~6', () => {
	const f = (x, y) => x * y * y
	const result = secondPartialYY(f, 3, 2)
	assert.ok(Math.abs(result - 6) < 1e-2)
})

test('secondPartialYY: f = y^3 at (0,2) is ~12', () => {
	const f = (x, y) => y * y * y
	const result = secondPartialYY(f, 0, 2)
	assert.ok(Math.abs(result - 12) < 1e-2)
})

test('secondPartialYY: f independent of y has zero second partial', () => {
	const f = (x, y) => x * x + 5
	const result = secondPartialYY(f, 4, 1)
	assert.ok(Math.abs(result - 0) < 1e-2)
})

test('secondPartialYY: f = sin(y) at y=0 is ~0', () => {
	const f = (x, y) => Math.sin(y)
	const result = secondPartialYY(f, 1, 0)
	assert.ok(Math.abs(result - 0) < 1e-2)
})

test('secondPartialYY: accepts a custom step size h', () => {
	const f = (x, y) => x * y * y
	const result = secondPartialYY(f, 3, 2, 1e-3)
	assert.ok(Math.abs(result - 6) < 1e-2)
})
