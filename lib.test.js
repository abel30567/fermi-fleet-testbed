import { test } from 'node:test'
import assert from 'node:assert'
import { add, vecSub } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('vecSub: basic elementwise difference', () => {
	assert.deepEqual(vecSub([4, 5, 6], [1, 2, 3]), [3, 3, 3])
})

test('vecSub: zero vector', () => {
	assert.deepEqual(vecSub([1, 2, 3], [0, 0, 0]), [1, 2, 3])
})

test('vecSub: subtracting itself yields zero vector', () => {
	assert.deepEqual(vecSub([7, -2, 5], [7, -2, 5]), [0, 0, 0])
})

test('vecSub: negative components', () => {
	assert.deepEqual(vecSub([-1, -2, -3], [1, 2, 3]), [-2, -4, -6])
})

test('vecSub: non-integer components', () => {
	assert.deepEqual(vecSub([1.5, 2.25, 3], [0.5, 1.25, 1]), [1, 1, 2])
})
