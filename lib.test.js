import { test } from 'node:test'
import assert from 'node:assert'
import { add, limit } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('limit of x*x as x approaches 3 is approximately 9', () => {
	const result = limit(x => x * x, 3)
	assert.ok(Math.abs(result - 9) < 1e-3)
})

test('limit returns NaN when left and right disagree', () => {
	const result = limit(x => (x > 0 ? 1 : -1), 0)
	assert.ok(Number.isNaN(result))
})

test('limit of sin(x)/x as x approaches 0 is approximately 1', () => {
	const result = limit(x => Math.sin(x) / x, 0)
	assert.ok(Math.abs(result - 1) < 1e-3)
})

test('limit returns NaN for 1/x at 0', () => {
	const result = limit(x => 1 / x, 0)
	assert.ok(Number.isNaN(result))
})
