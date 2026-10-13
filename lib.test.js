import { test } from 'node:test'
import assert from 'node:assert'
import { add, scale2D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('scale2D scales each axis', () => {
	assert.deepEqual(scale2D([1, 2], 3, 4), [3, 8])
})

test('scale2D by zero collapses to origin', () => {
	assert.deepEqual(scale2D([5, 5], 0, 0), [0, 0])
})

test('scale2D negative factor flips axis', () => {
	assert.deepEqual(scale2D([2, 3], -1, 1), [-2, 3])
})

test('scale2D fractional factors', () => {
	assert.deepEqual(scale2D([4, 4], 0.5, 0.25), [2, 1])
})

test('scale2D uniform scale', () => {
	assert.deepEqual(scale2D([1, -1], 10, 10), [10, -10])
})

test('scale2D leaves zero vector at origin', () => {
	assert.deepEqual(scale2D([0, 0], 7, 9), [0, 0])
})
