import { test } from 'node:test'
import assert from 'node:assert'
import { add, secondPartialXX } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('secondPartialXX: f = x^2*y at (2,3) ~ 6', () => {
	const f = (x, y) => x * x * y
	const result = secondPartialXX(f, 2, 3)
	assert.ok(Math.abs(result - 6) < 1e-2)
})

test('secondPartialXX: f = x^3 at (1,0), d2f/dx2 = 6x = 6', () => {
	const f = (x, y) => x * x * x
	const result = secondPartialXX(f, 1, 0)
	assert.ok(Math.abs(result - 6) < 1e-2)
})

test('secondPartialXX: f independent of x has zero second partial', () => {
	const f = (x, y) => y * y
	const result = secondPartialXX(f, 5, 4)
	assert.ok(Math.abs(result - 0) < 1e-2)
})

test('secondPartialXX: f = sin(x) at x=0, d2f/dx2 = -sin(x) = 0', () => {
	const f = (x, y) => Math.sin(x) + y
	const result = secondPartialXX(f, 0, 10)
	assert.ok(Math.abs(result - 0) < 1e-2)
})

test('secondPartialXX: custom h still yields accurate result', () => {
	const f = (x, y) => x * x * y
	const result = secondPartialXX(f, 2, 3, 1e-3)
	assert.ok(Math.abs(result - 6) < 1e-2)
})
