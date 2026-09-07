import { test } from 'node:test'
import assert from 'node:assert'
import { add, quadraticForm2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('quadraticForm2: identity matrix gives |v|^2', () => {
	const identity = [
		[1, 0],
		[0, 1],
	]
	assert.equal(quadraticForm2(identity, [3, 4]), 25)
	assert.equal(quadraticForm2(identity, [0, 0]), 0)
	assert.equal(quadraticForm2(identity, [1, 0]), 1)
})

test('quadraticForm2: diagonal matrix', () => {
	const m = [
		[2, 0],
		[0, 3],
	]
	// 2*x^2 + 3*y^2
	assert.equal(quadraticForm2(m, [1, 1]), 5)
	assert.equal(quadraticForm2(m, [2, 1]), 11)
})

test('quadraticForm2: symmetric matrix with cross terms', () => {
	const m = [
		[1, 2],
		[2, 1],
	]
	// x^2 + 2xy + 2xy + y^2 = x^2 + 4xy + y^2
	assert.equal(quadraticForm2(m, [1, 1]), 6)
	assert.equal(quadraticForm2(m, [2, -1]), 2 * 2 - 2 * 2 * 2 * 1 + 1)
})

test('quadraticForm2: non-symmetric matrix', () => {
	const m = [
		[1, 2],
		[3, 4],
	]
	// v^T M v = 1*x^2 + (2+3)*xy + 4*y^2
	assert.equal(quadraticForm2(m, [1, 1]), 1 + 5 + 4)
	assert.equal(quadraticForm2(m, [2, 3]), 1 * 4 + 5 * 6 + 4 * 9)
})

test('quadraticForm2: zero vector gives 0', () => {
	const m = [
		[5, 6],
		[7, 8],
	]
	assert.equal(quadraticForm2(m, [0, 0]), 0)
})
