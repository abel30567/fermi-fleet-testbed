import { test } from 'node:test'
import assert from 'node:assert'
import { abs, add } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('abs returns positive numbers unchanged', () => {
	assert.equal(abs(5), 5)
})

test('abs returns the magnitude of negative numbers', () => {
	assert.equal(abs(-5), 5)
})

test('abs returns zero for zero', () => {
	assert.equal(abs(0), 0)
})
