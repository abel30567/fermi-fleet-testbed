import { test } from 'node:test'
import assert from 'node:assert'
import { add, matMul } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('matMul spec example (2x3 times 3x2)', () => {
	assert.deepEqual(matMul([[1, 2, 3], [4, 5, 6]], [[7, 8], [9, 10], [11, 12]]), [[58, 64], [139, 154]])
})

test('matMul row times column gives dot product', () => {
	assert.deepEqual(matMul([[1, 2, 3]], [[4], [5], [6]]), [[32]])
})

test('matMul column times row gives outer product', () => {
	assert.deepEqual(matMul([[1], [2], [3]], [[4, 5, 6]]), [[4, 5, 6], [8, 10, 12], [12, 15, 18]])
})

test('matMul identity on both sides', () => {
	const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
	const m = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
	assert.deepEqual(matMul(I, m), m)
	assert.deepEqual(matMul(m, I), m)
})

test('matMul throws RangeError on mismatched inner dimensions', () => {
	assert.throws(() => matMul([[1, 2, 3]], [[1, 2], [3, 4]]), RangeError)
})

test('matMul throws RangeError on ragged matrix', () => {
	assert.throws(() => matMul([[1, 2], [3]], [[1], [2]]), RangeError)
	assert.throws(() => matMul([[1, 2]], [[1, 2], [3]]), RangeError)
})
