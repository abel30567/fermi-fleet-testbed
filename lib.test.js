import { test } from 'node:test'
import assert from 'node:assert'
import { add, crossProduct } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('crossProduct standard basis', () => {
	assert.deepEqual(crossProduct([1, 0, 0], [0, 1, 0]), [0, 0, 1])
})

test('crossProduct anticommutative', () => {
	assert.deepEqual(crossProduct([0, 1, 0], [1, 0, 0]), [0, 0, -1])
})

test('crossProduct parallel vectors yield zero', () => {
	assert.deepEqual(crossProduct([2, 4, 6], [1, 2, 3]), [0, 0, 0])
})

test('crossProduct mixed components', () => {
	assert.deepEqual(crossProduct([1, 2, 3], [4, 5, 6]), [-3, 6, -3])
})

test('crossProduct throws when a is not length 3', () => {
	assert.throws(() => crossProduct([1, 2], [1, 2, 3]), /length-3/)
})

test('crossProduct throws when b is not length 3', () => {
	assert.throws(() => crossProduct([1, 2, 3], [1, 2, 3, 4]), /length-3/)
})
