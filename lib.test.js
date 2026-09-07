import { test } from 'node:test'
import assert from 'node:assert'
import { add, momentY2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('momentY2: density=1 over [0,1]x[0,1] is ~0.5', () => {
	const result = momentY2(() => 1, 0, 1, 0, 1)
	assert.ok(Math.abs(result - 0.5) < 1e-3)
})

test('momentY2: density=1 over [1,2]x[0,1] is ~1.5', () => {
	const result = momentY2(() => 1, 1, 2, 0, 1)
	assert.ok(Math.abs(result - 1.5) < 1e-3)
})

test('momentY2: density=1 over [0,2]x[0,1] is ~2', () => {
	const result = momentY2(() => 1, 0, 2, 0, 1)
	assert.ok(Math.abs(result - 2) < 1e-3)
})

test('momentY2: density=x+y over [0,1]x[0,1] is ~7/12', () => {
	const result = momentY2((x, y) => x + y, 0, 1, 0, 1)
	assert.ok(Math.abs(result - 7 / 12) < 1e-3)
})

test('momentY2: respects custom n', () => {
	const result = momentY2(() => 1, 0, 1, 0, 1, 500)
	assert.ok(Math.abs(result - 0.5) < 1e-4)
})
