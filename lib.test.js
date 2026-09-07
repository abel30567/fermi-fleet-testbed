import { test } from 'node:test'
import assert from 'node:assert'
import { add, doubleIntegralSimpson } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('doubleIntegralSimpson: f=x*y over [0,1]x[0,1] ~ 0.25', () => {
	const result = doubleIntegralSimpson((x, y) => x * y, 0, 1, 0, 1)
	assert.ok(Math.abs(result - 0.25) < 1e-6)
})

test('doubleIntegralSimpson: constant function over unit square = area', () => {
	const result = doubleIntegralSimpson(() => 1, 0, 1, 0, 1)
	assert.ok(Math.abs(result - 1) < 1e-9)
})

test('doubleIntegralSimpson: f=1 over rectangle [0,2]x[0,3] = area = 6', () => {
	const result = doubleIntegralSimpson(() => 1, 0, 2, 0, 3, 20)
	assert.ok(Math.abs(result - 6) < 1e-9)
})

test('doubleIntegralSimpson: f=x^2+y^2 over [0,1]x[0,1] ~ 2/3', () => {
	const result = doubleIntegralSimpson((x, y) => x * x + y * y, 0, 1, 0, 1)
	assert.ok(Math.abs(result - 2 / 3) < 1e-6)
})

test('doubleIntegralSimpson: respects custom n', () => {
	const result = doubleIntegralSimpson((x, y) => x * y, 0, 1, 0, 1, 4)
	assert.ok(Math.abs(result - 0.25) < 1e-6)
})

test('doubleIntegralSimpson: throws RangeError for odd n', () => {
	assert.throws(() => doubleIntegralSimpson((x, y) => x * y, 0, 1, 0, 1, 3), RangeError)
})
