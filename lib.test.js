import { test } from 'node:test'
import assert from 'node:assert'
import { add, frobeniusNorm } from './lib.js'

test('add', () => {
	assert.equal(add(2, 3), 5)
})

test('frobeniusNorm computes norm of normal square and rectangular matrices', () => {
	assert.equal(frobeniusNorm([[3, 4]]), 5)
	assert.ok(Math.abs(frobeniusNorm([[1, 2], [3, 4]]) - Math.sqrt(30)) < 1e-12)
	assert.ok(Math.abs(frobeniusNorm([[1, -2, 2], [-2, 1, -2]]) - Math.sqrt(18)) < 1e-12)
})

test('frobeniusNorm satisfies identity matrix and transpose invariance identities', () => {
	const I4 = [
		[1, 0, 0, 0],
		[0, 1, 0, 0],
		[0, 0, 1, 0],
		[0, 0, 0, 1],
	]
	assert.ok(Math.abs(frobeniusNorm(I4) - 2) < 1e-12)

	const A = [
		[1, -3, 5],
		[2, 4, -6],
	]
	const AT = [
		[1, 2],
		[-3, 4],
		[5, -6],
	]
	assert.ok(Math.abs(frobeniusNorm(A) - frobeniusNorm(AT)) < 1e-12)
})

test('frobeniusNorm satisfies absolute homogeneity and triangle inequality', () => {
	const A = [
		[1, 2],
		[-3, 4],
	]
	const B = [
		[2, -1],
		[0, 5],
	]
	const scalar = -3.5
	const scaledA = A.map((row) => row.map((v) => v * scalar))
	assert.ok(
		Math.abs(frobeniusNorm(scaledA) - Math.abs(scalar) * frobeniusNorm(A)) < 1e-12,
	)

	const sumAB = A.map((row, i) => row.map((v, j) => v + B[i][j]))
	assert.ok(frobeniusNorm(sumAB) <= frobeniusNorm(A) + frobeniusNorm(B) + 1e-12)
})

test('frobeniusNorm handles empty, zero, and 1x1 matrices', () => {
	assert.equal(frobeniusNorm([]), 0)
	assert.equal(frobeniusNorm([[], []]), 0)
	assert.equal(frobeniusNorm([[0, 0], [0, 0]]), 0)
	assert.equal(frobeniusNorm([[-7.5]]), 7.5)
})

test('frobeniusNorm avoids overflow/underflow and handles Infinity/NaN', () => {
	const large = frobeniusNorm([[3e200, 4e200]])
	assert.ok(Math.abs(large - 5e200) / 5e200 < 1e-12)

	const small = frobeniusNorm([[3e-200, 4e-200]])
	assert.ok(Math.abs(small - 5e-200) / 5e-200 < 1e-12)

	assert.equal(frobeniusNorm([[1, Infinity], [2, 3]]), Infinity)
	assert.ok(Number.isNaN(frobeniusNorm([[1, NaN], [2, 3]])))
})

test('frobeniusNorm validates input structure and types', () => {
	assert.throws(() => frobeniusNorm(null), TypeError)
	assert.throws(() => frobeniusNorm([1, 2, 3]), TypeError)
	assert.throws(() => frobeniusNorm([[1, 2], [3]]), RangeError)
	assert.throws(() => frobeniusNorm([[1, '2']]), TypeError)
})
