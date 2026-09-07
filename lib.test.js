import { test } from 'node:test'
import assert from 'node:assert'
import { add, det3 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('det3: identity matrix is 1', () => {
	assert.equal(
		det3([
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1],
		]),
		1
	)
})

test('det3: singular matrix (duplicate row) is 0', () => {
	assert.equal(
		det3([
			[1, 2, 3],
			[1, 2, 3],
			[7, 8, 9],
		]),
		0
	)
})

test('det3: singular matrix (linearly dependent rows) is 0', () => {
	assert.equal(
		det3([
			[1, 2, 3],
			[2, 4, 6],
			[7, 8, 9],
		]),
		0
	)
})

test('det3: known non-trivial determinant', () => {
	assert.equal(
		det3([
			[2, -3, 1],
			[2, 0, -1],
			[1, 4, 5],
		]),
		49
	)
})

test('det3: scalar multiple of identity', () => {
	assert.equal(
		det3([
			[2, 0, 0],
			[0, 3, 0],
			[0, 0, 4],
		]),
		24
	)
})
