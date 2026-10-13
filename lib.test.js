import { test } from 'node:test'
import assert from 'node:assert'
import { add, composeTransforms } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('composeTransforms single matrix returns it unchanged', () => {
	assert.deepEqual(composeTransforms([[1, 2], [3, 4]]), [[1, 2], [3, 4]])
})

test('composeTransforms identity on either side', () => {
	const m = [[1, 2], [3, 4]]
	const I = [[1, 0], [0, 1]]
	assert.deepEqual(composeTransforms(m, I), m)
	assert.deepEqual(composeTransforms(I, m), m)
})

test('composeTransforms multiplies A.B', () => {
	assert.deepEqual(composeTransforms([[1, 2], [3, 4]], [[5, 6], [7, 8]]), [[19, 22], [43, 50]])
})

test('composeTransforms order matters (B.A differs)', () => {
	assert.deepEqual(composeTransforms([[5, 6], [7, 8]], [[1, 2], [3, 4]]), [[23, 34], [31, 46]])
})

test('composeTransforms chains three matrices left-associatively', () => {
	assert.deepEqual(composeTransforms([[2, 0], [0, 2]], [[0, -1], [1, 0]], [[1, 1], [0, 1]]), [[0, -2], [2, 2]])
})

test('composeTransforms with no matrices throws', () => {
	assert.throws(() => composeTransforms(), /at least one matrix/)
})
