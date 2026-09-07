import { test } from 'node:test'
import assert from 'node:assert'
import { add, projectOnto } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('projectOnto: basic axis-aligned projection', () => {
	assert.deepEqual(projectOnto([2, 2, 0], [1, 0, 0]), [2, 0, 0])
})

test('projectOnto: projection onto a scaled vector gives same result', () => {
	assert.deepEqual(projectOnto([2, 2, 0], [5, 0, 0]), [2, 0, 0])
})

test('projectOnto: projection of orthogonal vectors is zero', () => {
	assert.deepEqual(projectOnto([0, 1, 0], [1, 0, 0]), [0, 0, 0])
})

test('projectOnto: projection of parallel vectors returns u', () => {
	assert.deepEqual(projectOnto([3, 4, 5], [3, 4, 5]), [3, 4, 5])
})

test('projectOnto: non axis-aligned vector', () => {
	const result = projectOnto([1, 1, 1], [1, 1, 0])
	assert.equal(result[0], 1)
	assert.equal(result[1], 1)
	assert.equal(result[2], 0)
})

test('projectOnto: negative components', () => {
	assert.deepEqual(projectOnto([-2, -2, 0], [1, 0, 0]), [-2, 0, 0])
})

test('projectOnto: throws RangeError on zero vector', () => {
	assert.throws(() => projectOnto([1, 2, 3], [0, 0, 0]), RangeError)
})
