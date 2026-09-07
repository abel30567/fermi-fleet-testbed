import { test } from 'node:test'
import assert from 'node:assert'
import { add, sqrt } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('sqrt of perfect square', () => {
	assert.equal(sqrt(9), 3)
})

test('sqrt of zero', () => {
	assert.equal(sqrt(0), 0)
})

test('sqrt of negative throws', () => {
	assert.throws(() => sqrt(-4), { message: /negative/ })
})
