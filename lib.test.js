import { test } from 'node:test'
import assert from 'node:assert'
import { add, vecAdd } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('vecAdd: elementwise sum of two 3D vectors', () => {
	assert.deepEqual(vecAdd([1, 2, 3], [4, 5, 6]), [5, 7, 9])
})

test('vecAdd: zero vector is identity', () => {
	assert.deepEqual(vecAdd([1, 2, 3], [0, 0, 0]), [1, 2, 3])
})

test('vecAdd: handles negative components', () => {
	assert.deepEqual(vecAdd([-1, -2, -3], [1, 2, 3]), [0, 0, 0])
})

test('vecAdd: handles non-integer components', () => {
	assert.deepEqual(vecAdd([0.5, 1.5, 2.5], [0.5, 0.5, 0.5]), [1, 2, 3])
})
