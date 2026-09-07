import { test } from 'node:test'
import assert from 'node:assert'
import { add, matVec2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('matVec2: spec example', () => {
	assert.deepEqual(matVec2([[1, 2], [3, 4]], [5, 6]), [17, 39])
})

test('matVec2: identity matrix is identity', () => {
	assert.deepEqual(matVec2([[1, 0], [0, 1]], [7, -3]), [7, -3])
})

test('matVec2: zero matrix maps to zero vector', () => {
	assert.deepEqual(matVec2([[0, 0], [0, 0]], [7, -3]), [0, 0])
})

test('matVec2: zero vector maps to zero vector', () => {
	assert.deepEqual(matVec2([[1, 2], [3, 4]], [0, 0]), [0, 0])
})

test('matVec2: handles negative and non-integer components', () => {
	assert.deepEqual(matVec2([[-1, 0.5], [2, -1.5]], [4, -2]), [-5, 11])
})
