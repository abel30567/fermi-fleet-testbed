import { test } from 'node:test'
import assert from 'node:assert'
import { add, outerProduct } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('outerProduct normal case', () => {
	assert.deepEqual(outerProduct([1, 2], [3, 4, 5]), [
		[3, 4, 5],
		[6, 8, 10],
	])
})

test('outerProduct empty a', () => {
	assert.deepEqual(outerProduct([], [1, 2]), [])
})

test('outerProduct empty b', () => {
	assert.deepEqual(outerProduct([1, 2], []), [[], []])
})

test('outerProduct zeros and negatives', () => {
	assert.deepEqual(outerProduct([0, -2], [3, -1]), [
		[0, 0],
		[-6, 2],
	])
})

test('outerProduct single elements', () => {
	assert.deepEqual(outerProduct([7], [3]), [[21]])
})

test('outerProduct throws when a is not an array', () => {
	assert.throws(() => outerProduct(1, [2, 3]), { name: 'TypeError' })
})

test('outerProduct throws when b is not an array', () => {
	assert.throws(() => outerProduct([1, 2], 'x'), { name: 'TypeError' })
})
