import { test } from 'node:test'
import assert from 'node:assert'
import { add, midpoint3 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('midpoint3 basic', () => {
	assert.deepEqual(midpoint3([0, 0, 0], [2, 4, 6]), [1, 2, 3])
})

test('midpoint3 identical points', () => {
	assert.deepEqual(midpoint3([1, 2, 3], [1, 2, 3]), [1, 2, 3])
})

test('midpoint3 negative coordinates', () => {
	assert.deepEqual(midpoint3([-2, -4, -6], [2, 4, 6]), [0, 0, 0])
})

test('midpoint3 non-integer result', () => {
	assert.deepEqual(midpoint3([0, 0, 0], [1, 1, 1]), [0.5, 0.5, 0.5])
})

test('midpoint3 origin and point', () => {
	assert.deepEqual(midpoint3([0, 0, 0], [0, 0, 0]), [0, 0, 0])
})
