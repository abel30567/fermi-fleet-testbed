import { test } from 'node:test'
import assert from 'node:assert'
import { add, multiply } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('multiply', () => {
	assert.equal(multiply(2, 3), 6)
})

test('multiply negative', () => {
	assert.equal(multiply(-2, 3), -6)
})
