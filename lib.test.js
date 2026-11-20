import { test } from 'node:test'
import assert from 'node:assert'
import { add, matInv3 } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

function matMul3(A, B) {
	return Array.from({ length: 3 }, (_, r) =>
		Array.from({ length: 3 }, (_, c) => A[r][0] * B[0][c] + A[r][1] * B[1][c] + A[r][2] * B[2][c]),
	)
}

function assertMatClose(actual, expected, eps = 1e-10) {
	assert.equal(actual.length, 3)
	for (let r = 0; r < 3; r++) {
		assert.equal(actual[r].length, 3)
		for (let c = 0; c < 3; c++) {
			assert.ok(
				Math.abs(actual[r][c] - expected[r][c]) <= eps,
				`Mismatch at [${r}][${c}]: got ${actual[r][c]}, expected ${expected[r][c]}`,
			)
		}
	}
}

const I3 = [
	[1, 0, 0],
	[0, 1, 0],
	[0, 0, 1],
]

test('matInv3: identity matrix is its own inverse', () => {
	assert.deepStrictEqual(matInv3(I3), I3)
})

test('matInv3: general invertible matrix matches exact inverse and A * A^-1 = A^-1 * A = I', () => {
	const A = [
		[1, 2, 3],
		[0, 1, 4],
		[5, 6, 0],
	]
	const expected = [
		[-24, 18, 5],
		[20, -15, -4],
		[-5, 4, 1],
	]
	const inv = matInv3(A)
	assertMatClose(inv, expected)
	assertMatClose(matMul3(A, inv), I3)
	assertMatClose(matMul3(inv, A), I3)
})

test('matInv3: involution property (A^-1)^-1 = A and product rule (AB)^-1 = B^-1 A^-1', () => {
	const A = [
		[2, -1, 0],
		[-1, 2, -1],
		[0, -1, 2],
	]
	const B = [
		[3, 0, 2],
		[2, 0, -2],
		[0, 1, 1],
	]
	const invA = matInv3(A)
	const invB = matInv3(B)
	assertMatClose(matInv3(invA), A)
	assertMatClose(matInv3(matMul3(A, B)), matMul3(invB, invA))
})

test('matInv3: diagonal, negative, and small-scale invertible matrices', () => {
	const D = [
		[2, 0, 0],
		[0, -4, 0],
		[0, 0, 0.5],
	]
	assert.deepStrictEqual(matInv3(D), [
		[0.5, 0, 0],
		[0, -0.25, 0],
		[0, 0, 2],
	])

	const small = [
		[1e-5, 0, 0],
		[0, 1e-5, 0],
		[0, 0, 1e-5],
	]
	assertMatClose(matInv3(small), [
		[1e5, 0, 0],
		[0, 1e5, 0],
		[0, 0, 1e5],
	], 1e-5)
})

test('matInv3: throws on singular matrices (zero, linearly dependent, floating-point dependent)', () => {
	const zero = [
		[0, 0, 0],
		[0, 0, 0],
		[0, 0, 0],
	]
	const dependent = [
		[1, 2, 3],
		[4, 5, 6],
		[7, 8, 9],
	]
	const floatDependent = [
		[0.1, 0.2, 0.3],
		[0.2, 0.4, 0.6],
		[0.3, 0.6, 0.9],
	]
	assert.throws(() => matInv3(zero), /singular/i)
	assert.throws(() => matInv3(dependent), /singular/i)
	assert.throws(() => matInv3(floatDependent), /singular/i)
})

test('matInv3: does not mutate input and validates shape/entries', () => {
	const A = [
		[4, 7, 2],
		[3, 6, 1],
		[2, 5, 1],
	]
	const snapshot = structuredClone(A)
	matInv3(A)
	assert.deepStrictEqual(A, snapshot)

	assert.throws(() => matInv3([[1, 0], [0, 1]]), TypeError)
	assert.throws(
		() =>
			matInv3([
				[1, 0, NaN],
				[0, 1, 0],
				[0, 0, 1],
			]),
		TypeError,
	)
})
