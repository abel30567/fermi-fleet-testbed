import { test } from 'node:test'
import assert from 'node:assert'
import { add, distance3 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('distance3: 3-4-5 triangle in the xy-plane', () => {
	assert.equal(distance3([0, 0, 0], [3, 4, 0]), 5)
})

test('distance3: same point is zero distance', () => {
	assert.equal(distance3([1, 2, 3], [1, 2, 3]), 0)
})

test('distance3: origin to unit point along z-axis', () => {
	assert.equal(distance3([0, 0, 0], [0, 0, 1]), 1)
})

test('distance3: is symmetric', () => {
	const p = [1, 2, 3]
	const q = [4, 6, 3]
	assert.equal(distance3(p, q), distance3(q, p))
})

test('distance3: handles negative coordinates', () => {
	assert.equal(distance3([-1, -1, -1], [2, 3, -1]), 5)
})
