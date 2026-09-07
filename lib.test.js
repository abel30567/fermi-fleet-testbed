import { test } from 'node:test'
import assert from 'node:assert'
import { add, totalDifferential } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('totalDifferential: f=x*y at (2,3), dx=0.1, dy=0.2 ~ 0.7', () => {
	const f = (x, y) => x * y
	const df = totalDifferential(f, 2, 3, 0.1, 0.2)
	assert.ok(Math.abs(df - 0.7) < 1e-3, `expected ~0.7, got ${df}`)
})

test('totalDifferential: f=x^2+y^2 at (1,1), dx=0.01, dy=0.01 ~ 0.04', () => {
	const f = (x, y) => x * x + y * y
	const df = totalDifferential(f, 1, 1, 0.01, 0.01)
	assert.ok(Math.abs(df - 0.04) < 1e-3, `expected ~0.04, got ${df}`)
})

test('totalDifferential: zero displacement gives zero', () => {
	const f = (x, y) => x * y + Math.sin(x) * y
	const df = totalDifferential(f, 2, 3, 0, 0)
	assert.ok(Math.abs(df) < 1e-9, `expected ~0, got ${df}`)
})

test('totalDifferential: respects custom step size h', () => {
	const f = (x, y) => x * y
	const df = totalDifferential(f, 2, 3, 0.1, 0.2, 1e-3)
	assert.ok(Math.abs(df - 0.7) < 1e-3, `expected ~0.7, got ${df}`)
})

test('totalDifferential: f depending only on x', () => {
	const f = (x, y) => x * x
	const df = totalDifferential(f, 3, 5, 0.01, 100)
	assert.ok(Math.abs(df - 0.06) < 1e-3, `expected ~0.06, got ${df}`)
})
