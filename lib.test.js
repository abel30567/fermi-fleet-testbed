import { test } from 'node:test'
import assert from 'node:assert'
import { add, dotProduct } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('dotProduct normal case', () => {
	assert.equal(dotProduct([1, 2, 3], [4, 5, 6]), 32)
})

test('dotProduct zeros', () => {
	assert.equal(dotProduct([0, 0, 0], [1, 2, 3]), 0)
})

test('dotProduct empty vectors', () => {
	assert.equal(dotProduct([], []), 0)
})

test('dotProduct single element', () => {
	assert.equal(dotProduct([7], [3]), 21)
})

test('dotProduct negatives', () => {
	assert.equal(dotProduct([-1, 2], [3, -4]), -11)
})

test('dotProduct throws on length mismatch', () => {
	assert.throws(() => dotProduct([1, 2], [1]), /length/i)
})
