import { test } from 'node:test'
import assert from 'node:assert'
import { add, doubleIntegralMid } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('doubleIntegralMid: constant function over unit square', () => {
	const result = doubleIntegralMid(() => 1, 0, 1, 0, 1)
	assert.ok(Math.abs(result - 1) < 1e-9)
})

test('doubleIntegralMid: f(x,y)=x*y over [0,1]^2 ~ 0.25', () => {
	const result = doubleIntegralMid((x, y) => x * y, 0, 1, 0, 1)
	assert.ok(Math.abs(result - 0.25) < 1e-3)
})

test('doubleIntegralMid: constant function over non-unit rectangle scales by area', () => {
	const result = doubleIntegralMid(() => 2, 0, 3, 0, 4)
	assert.ok(Math.abs(result - 24) < 1e-9)
})

test('doubleIntegralMid: f(x,y)=x+y over [0,2]x[0,2]', () => {
	const result = doubleIntegralMid((x, y) => x + y, 0, 2, 0, 2, 200)
	assert.ok(Math.abs(result - 8) < 1e-3)
})

test('doubleIntegralMid: respects custom n parameter', () => {
	const result = doubleIntegralMid((x, y) => x * y, 0, 1, 0, 1, 10)
	assert.ok(Math.abs(result - 0.25) < 1e-2)
})
