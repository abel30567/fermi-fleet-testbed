import { test } from 'node:test'
import assert from 'node:assert'
import { add, scalarMultiply } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('scalarMultiply multiplies each element', () => {
	assert.deepEqual(scalarMultiply(3, [1, 2, 3]), [3, 6, 9])
})

test('scalarMultiply with zero', () => {
	assert.deepEqual(scalarMultiply(0, [1, 2, 3]), [0, 0, 0])
})

test('scalarMultiply with empty array', () => {
	assert.deepEqual(scalarMultiply(5, []), [])
})

test('scalarMultiply with negative scalar', () => {
	assert.deepEqual(scalarMultiply(-2, [1, -3, 4]), [-2, 6, -8])
})

test('scalarMultiply throws when k is not a number', () => {
	assert.throws(() => scalarMultiply('2', [1, 2]), { name: 'TypeError' })
})

test('scalarMultiply throws when v is not an array', () => {
	assert.throws(() => scalarMultiply(2, 'not-array'), { name: 'TypeError' })
})
