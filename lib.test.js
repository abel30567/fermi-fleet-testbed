import { test } from 'node:test'
import assert from 'node:assert'
import { add, shear2D } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('shear2D x-shear shifts y-axis point', () => {
	assert.deepEqual(shear2D([0, 1], 2, 0), [2, 1])
})

test('shear2D x-shear leaves x-axis point in place', () => {
	assert.deepEqual(shear2D([1, 0], 2, 0), [1, 0])
})

test('shear2D y-shear shifts x-axis point', () => {
	assert.deepEqual(shear2D([1, 0], 0, 3), [1, 3])
})

test('shear2D zero factors are identity', () => {
	assert.deepEqual(shear2D([2, 3], 0, 0), [2, 3])
})

test('shear2D combined shear', () => {
	assert.deepEqual(shear2D([2, 3], 1, 1), [5, 5])
})

test('shear2D negative shear factor', () => {
	assert.deepEqual(shear2D([0, 2], -1, 0), [-2, 2])
})
