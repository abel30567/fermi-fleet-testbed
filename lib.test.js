import { test } from 'node:test'
import assert from 'node:assert'
import { add, pow } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('pow: positive integer exponent', () => {
	assert.equal(pow(2, 3), 8)
	assert.equal(pow(5, 2), 25)
	assert.equal(pow(10, 4), 10000)
})

test('pow: zero exponent returns 1', () => {
	assert.equal(pow(2, 0), 1)
	assert.equal(pow(100, 0), 1)
	assert.equal(pow(-5, 0), 1)
})

test('pow: exponent of 1 returns base', () => {
	assert.equal(pow(7, 1), 7)
	assert.equal(pow(-3, 1), -3)
})

test('pow: negative exponent', () => {
	assert.equal(pow(2, -1), 0.5)
	assert.equal(pow(2, -2), 0.25)
	assert.equal(pow(4, -1), 0.25)
	assert.equal(pow(10, -3), 0.001)
})

test('pow: negative base with positive exponent', () => {
	assert.equal(pow(-2, 3), -8)
	assert.equal(pow(-2, 2), 4)
})

test('pow: negative base with negative exponent', () => {
	assert.equal(pow(-2, -1), -0.5)
	assert.equal(pow(-2, -2), 0.25)
})

test('pow: base zero', () => {
	assert.equal(pow(0, 5), 0)
	assert.equal(pow(0, 1), 0)
})

test('pow: zero to zero power', () => {
	assert.equal(pow(0, 0), 1)
})

test('pow: fractional exponent', () => {
	assert.equal(pow(4, 0.5), 2)
	assert.equal(pow(27, 1 / 3), 3)
})

test('pow: large exponent', () => {
	assert.equal(pow(2, 10), 1024)
	assert.equal(pow(2, 20), 1048576)
})
