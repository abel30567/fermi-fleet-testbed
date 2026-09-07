import { test } from 'node:test'
import assert from 'node:assert'
import { add, scalarTriple } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('scalarTriple: unit axes give 1', () => {
	assert.equal(scalarTriple([1, 0, 0], [0, 1, 0], [0, 0, 1]), 1)
})

test('scalarTriple: unit axes in reversed order give -1', () => {
	assert.equal(scalarTriple([0, 1, 0], [1, 0, 0], [0, 0, 1]), -1)
})

test('scalarTriple: coplanar vectors give 0', () => {
	assert.equal(scalarTriple([1, 0, 0], [0, 1, 0], [1, 1, 0]), 0)
})

test('scalarTriple: duplicate vector gives 0', () => {
	assert.equal(scalarTriple([2, -1, 3], [2, -1, 3], [5, 0, 1]), 0)
})

test('scalarTriple: general vectors match determinant formula', () => {
	assert.equal(scalarTriple([1, 2, 3], [4, 5, 6], [7, 8, 10]), -3)
})

test('scalarTriple: is invariant under cyclic permutation', () => {
	const u = [1, 2, 3]
	const v = [4, 0, 5]
	const w = [-1, 2, 6]
	assert.equal(scalarTriple(u, v, w), scalarTriple(v, w, u))
	assert.equal(scalarTriple(u, v, w), scalarTriple(w, u, v))
})
