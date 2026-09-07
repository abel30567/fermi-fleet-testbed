import { test } from 'node:test'
import assert from 'node:assert'
import { add, cross } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('cross: standard basis vectors', () => {
	assert.deepEqual(cross([1, 0, 0], [0, 1, 0]), [0, 0, 1])
	assert.deepEqual(cross([0, 1, 0], [0, 0, 1]), [1, 0, 0])
	assert.deepEqual(cross([0, 0, 1], [1, 0, 0]), [0, 1, 0])
})

test('cross: anti-commutativity', () => {
	const u = [1, 2, 3]
	const v = [4, 5, 6]
	const uv = cross(u, v)
	const vu = cross(v, u)
	assert.deepEqual(uv, [uv[0], uv[1], uv[2]])
	assert.deepEqual(vu, [-uv[0], -uv[1], -uv[2]])
})

test('cross: parallel vectors yield zero vector', () => {
	assert.deepEqual(cross([2, 4, 6], [1, 2, 3]), [0, 0, 0])
})

test('cross: cross product with itself is zero', () => {
	assert.deepEqual(cross([3, -1, 2], [3, -1, 2]), [0, 0, 0])
})

test('cross: general vectors', () => {
	assert.deepEqual(cross([1, 2, 3], [4, 5, 6]), [-3, 6, -3])
})
