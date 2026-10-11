import { test } from 'node:test'
import assert from 'node:assert'
import { add, hadamardProduct } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('hadamardProduct normal case', () => {
	assert.deepEqual(hadamardProduct([1, 2, 3], [4, 5, 6]), [4, 10, 18])
})

test('hadamardProduct empty arrays', () => {
	assert.deepEqual(hadamardProduct([], []), [])
})

test('hadamardProduct with zeros and negatives', () => {
	assert.deepEqual(hadamardProduct([0, -2, 3], [5, 4, -1]), [0, -8, -3])
})

test('hadamardProduct throws on length mismatch', () => {
	assert.throws(
		() => hadamardProduct([1, 2], [1, 2, 3]),
		/same length/
	)
})
