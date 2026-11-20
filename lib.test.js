import { test } from 'node:test'
import assert from 'node:assert'
import { add, matMul } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('matMul - multiplies rectangular m x k and k x n matrices', () => {
	const A = [
		[1, 2, 3],
		[4, 5, 6],
	]
	const B = [
		[7, 8],
		[9, 10],
		[11, 12],
	]
	assert.deepStrictEqual(matMul(A, B), [
		[58, 64],
		[139, 154],
	])
})

test('matMul - satisfies identity and zero matrix properties', () => {
	const A = [
		[2, -3, 1],
		[0, 4, -5],
	]
	const I2 = [
		[1, 0],
		[0, 1],
	]
	const I3 = [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	]
	const Z = [
		[0, 0],
		[0, 0],
		[0, 0],
	]
	assert.deepStrictEqual(matMul(I2, A), A)
	assert.deepStrictEqual(matMul(A, I3), A)
	assert.deepStrictEqual(matMul(A, Z), [
		[0, 0],
		[0, 0],
	])
})

test('matMul - satisfies associativity (AB)C = A(BC) and non-commutativity', () => {
	const A = [
		[1, 2],
		[3, 4],
	]
	const B = [
		[2, 0],
		[1, 2],
	]
	const C = [
		[0, 1],
		[-1, 3],
	]
	assert.deepStrictEqual(matMul(matMul(A, B), C), matMul(A, matMul(B, C)))
	assert.notDeepStrictEqual(matMul(A, B), matMul(B, A))
})

test('matMul - handles 1x1, row-by-column (inner product), and column-by-row (outer product)', () => {
	assert.deepStrictEqual(matMul([[6]], [[7]]), [[42]])
	assert.deepStrictEqual(matMul([[1, 2, 3]], [[4], [5], [6]]), [[32]])
	assert.deepStrictEqual(matMul([[1], [2], [3]], [[4, 5]]), [
		[4, 5],
		[8, 10],
		[12, 15],
	])
})

test('matMul - handles negative numbers and floating-point values', () => {
	const A = [
		[-1.5, 2.5],
		[0.5, -3.0],
	]
	const B = [
		[2.0, -4.0],
		[1.0, 0.5],
	]
	const result = matMul(A, B)
	assert.deepStrictEqual(result, [
		[-0.5, 7.25],
		[-2.0, -3.5],
	])
})

test('matMul - throws on dimension mismatch and invalid matrices', () => {
	assert.throws(
		() =>
			matMul(
				[
					[1, 2],
					[3, 4],
				],
				[[1, 2, 3]]
			),
		/Dimension mismatch/
	)
	assert.throws(() => matMul([], [[1]]), /non-empty/)
	assert.throws(() => matMul([[1]], []), /non-empty/)
	assert.throws(() => matMul([[]], [[1]]), /non-empty/)
	assert.throws(() => matMul([[1, 2], [3]], [[1], [2]]), /rectangular/)
	assert.throws(() => matMul([[1, 2]], [[1], [2, 3]]), /rectangular/)
	assert.throws(() => matMul(null, [[1]]), TypeError)
})
