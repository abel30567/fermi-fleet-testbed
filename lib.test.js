import { test } from 'node:test'
import assert from 'node:assert'
import { add, matMul2 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

const A = [[1, 2], [3, 4]]
const B = [[5, 6], [7, 8]]
const I = [[1, 0], [0, 1]]
const Z = [[0, 0], [0, 0]]

test('matMul2 spec example', () => {
	assert.deepEqual(matMul2(A, B), [[19, 22], [43, 50]])
})

test('matMul2 identity on either side', () => {
	assert.deepEqual(matMul2(I, A), A)
	assert.deepEqual(matMul2(A, I), A)
})

test('matMul2 zero matrix', () => {
	assert.deepEqual(matMul2(Z, A), Z)
	assert.deepEqual(matMul2(A, Z), Z)
})

test('matMul2 is not commutative', () => {
	assert.deepEqual(matMul2(B, A), [[23, 34], [31, 46]])
	assert.notDeepEqual(matMul2(A, B), matMul2(B, A))
})

test('matMul2 negative and non-integer entries', () => {
	assert.deepEqual(matMul2([[-1, 0.5], [2, -1.5]], [[0.25, -2], [4, 0.5]]), [[1.75, 2.25], [-5.5, -4.75]])
})
