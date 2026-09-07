import { test } from 'node:test'
import assert from 'node:assert'
import { add, dot } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('dot: basic product', () => {
	assert.equal(dot([1, 2, 3], [4, 5, 6]), 32)
})

test('dot: orthogonal vectors give 0', () => {
	assert.equal(dot([1, 0, 0], [0, 1, 0]), 0)
	assert.equal(dot([0, 1, 0], [0, 0, 1]), 0)
})

test('dot: with zero vector is 0', () => {
	assert.equal(dot([0, 0, 0], [7, -3, 2]), 0)
})

test('dot: with negative components', () => {
	assert.equal(dot([-1, -2, -3], [4, 5, 6]), -32)
})

test('dot: is commutative', () => {
	const u = [2, -3, 5]
	const v = [-1, 4, 7]
	assert.equal(dot(u, v), dot(v, u))
})
