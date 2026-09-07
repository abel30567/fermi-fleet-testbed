import { test } from 'node:test'
import assert from 'node:assert'
import { add, matVec3 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('matVec3: identity leaves vector unchanged', () => {
	const identity = [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	]
	assert.deepEqual(matVec3(identity, [3, -5, 7]), [3, -5, 7])
})

test('matVec3: zero matrix maps to zero vector', () => {
	const zero = [
		[0, 0, 0],
		[0, 0, 0],
		[0, 0, 0],
	]
	assert.deepEqual(matVec3(zero, [1, 2, 3]), [0, 0, 0])
})

test('matVec3: scalar multiple of identity scales the vector', () => {
	const scaled = [
		[2, 0, 0],
		[0, 2, 0],
		[0, 0, 2],
	]
	assert.deepEqual(matVec3(scaled, [1, -2, 3]), [2, -4, 6])
})

test('matVec3: general matrix times vector', () => {
	const m = [
		[1, 2, 3],
		[4, 5, 6],
		[7, 8, 9],
	]
	assert.deepEqual(matVec3(m, [1, 0, -1]), [-2, -2, -2])
})

test('matVec3: permutation matrix reorders components', () => {
	const permute = [
		[0, 1, 0],
		[0, 0, 1],
		[1, 0, 0],
	]
	assert.deepEqual(matVec3(permute, [10, 20, 30]), [20, 30, 10])
})

test('matVec3: zero vector maps to zero vector', () => {
	const m = [
		[5, -3, 2],
		[1, 0, 4],
		[-2, 6, 7],
	]
	assert.deepEqual(matVec3(m, [0, 0, 0]), [0, 0, 0])
})
