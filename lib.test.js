import { test } from 'node:test'
import assert from 'node:assert'
import { add, magnitude } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('magnitude of a 3-4-0 vector is 5', () => {
	assert.equal(magnitude([3, 4, 0]), 5)
})

test('magnitude of the zero vector is 0', () => {
	assert.equal(magnitude([0, 0, 0]), 0)
})

test('magnitude of a vector with negative components', () => {
	assert.equal(magnitude([-1, -2, -2]), 3)
})

test('magnitude of a unit axis vector', () => {
	assert.equal(magnitude([0, 0, 1]), 1)
})
