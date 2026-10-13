import { test } from 'node:test'
import assert from 'node:assert'
import { add, reflect2D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('reflect2D across x-axis flips y', () => {
	assert.deepEqual(reflect2D([3, 4], 'x'), [3, -4])
})

test('reflect2D across y-axis flips x', () => {
	assert.deepEqual(reflect2D([3, 4], 'y'), [-3, 4])
})

test('reflect2D across y=x swaps coordinates', () => {
	assert.deepEqual(reflect2D([3, 4], 'y=x'), [4, 3])
})

test('reflect2D point on mirror axis is unchanged', () => {
	assert.deepEqual(reflect2D([0, 5], 'x'), [0, -5])
	assert.deepEqual(reflect2D([5, 0], 'y'), [-5, 0])
	assert.deepEqual(reflect2D([7, 7], 'y=x'), [7, 7])
})

test('reflect2D twice is identity', () => {
	assert.deepEqual(reflect2D(reflect2D([3, 4], 'x'), 'x'), [3, 4])
})

test('reflect2D unknown axis throws', () => {
	assert.throws(() => reflect2D([1, 1], 'z'), /unknown axis/)
})
