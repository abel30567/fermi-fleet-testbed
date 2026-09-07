import { test } from 'node:test'
import assert from 'node:assert'
import { add, vecScale } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('vecScale scales a 3D vector by a positive scalar', () => {
	assert.deepEqual(vecScale([1, -2, 3], 2), [2, -4, 6])
})

test('vecScale scales by zero', () => {
	assert.deepEqual(vecScale([1, -2, 3], 0), [0, 0, 0])
})

test('vecScale scales by a negative scalar', () => {
	assert.deepEqual(vecScale([1, -2, 3], -1), [-1, 2, -3])
})

test('vecScale scales by a fractional scalar', () => {
	assert.deepEqual(vecScale([2, 4, -6], 0.5), [1, 2, -3])
})

test('vecScale does not mutate the input vector', () => {
	const v = [1, -2, 3]
	vecScale(v, 2)
	assert.deepEqual(v, [1, -2, 3])
})
