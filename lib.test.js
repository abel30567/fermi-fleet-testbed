import { test } from 'node:test'
import assert from 'node:assert'
import { add, subtract } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('subtract', () => {
	assert.equal(subtract(5, 3), 2)
})

test('subtract negative', () => {
	assert.equal(subtract(2, 5), -3)
})
