import { test } from 'node:test'
import assert from 'node:assert'
import { add, averageValue2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('averageValue2: f=x over [0,2]x[0,1] is ~1', () => {
	const result = averageValue2((x, y) => x, 0, 2, 0, 1)
	assert.ok(Math.abs(result - 1) < 1e-3)
})

test('averageValue2: f=y over [0,2]x[0,4] is ~2', () => {
	const result = averageValue2((x, y) => y, 0, 2, 0, 4)
	assert.ok(Math.abs(result - 2) < 1e-3)
})

test('averageValue2: constant f=5 over any rectangle is 5', () => {
	const result = averageValue2(() => 5, -3, 7, 1, 9)
	assert.ok(Math.abs(result - 5) < 1e-9)
})

test('averageValue2: f=x*y over [0,1]x[0,1] is ~0.25', () => {
	const result = averageValue2((x, y) => x * y, 0, 1, 0, 1)
	assert.ok(Math.abs(result - 0.25) < 1e-3)
})

test('averageValue2: f=x^2+y^2 over [-1,1]x[-1,1] is ~2/3', () => {
	const result = averageValue2((x, y) => x * x + y * y, -1, 1, -1, 1)
	assert.ok(Math.abs(result - 2 / 3) < 1e-3)
})

test('averageValue2: respects custom n and still converges', () => {
	const result = averageValue2((x, y) => x + y, 0, 4, 0, 2, 500)
	assert.ok(Math.abs(result - 3) < 1e-3)
})
