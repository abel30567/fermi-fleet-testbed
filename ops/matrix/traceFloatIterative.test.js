import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { traceFloatIterative } from './traceFloatIterative.js'

function approxEqual(actual, expected, eps = 1e-12) {
	assert.ok(
		Math.abs(actual - expected) <= eps,
		`expected ${actual} to be within ${eps} of ${expected}`
	)
}

function transpose(matrix) {
	const n = matrix.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => matrix[j][i])
	)
}

function addMatrices(a, b) {
	const n = a.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => a[i][j] + b[i][j])
	)
}

function scaleMatrix(matrix, scalar) {
	return matrix.map((row) => row.map((v) => v * scalar))
}

function multiplyMatrices(a, b) {
	const n = a.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => {
			let sum = 0
			for (let k = 0; k < n; k++) {
				sum += a[i][k] * b[k][j]
			}
			return sum
		})
	)
}

describe('traceFloatIterative', () => {
	test('computes trace of standard 2x2 and 3x3 matrices', () => {
		assert.equal(
			traceFloatIterative([
				[1, 2],
				[3, 4],
			]),
			5
		)
		assert.equal(
			traceFloatIterative([
				[1, 2, 3],
				[4, 5, 6],
				[7, 8, 9],
			]),
			15
		)
	})

	test('handles 1x1 matrices', () => {
		assert.equal(traceFloatIterative([[42]]), 42)
		assert.equal(traceFloatIterative([[-3.5]]), -3.5)
		assert.equal(traceFloatIterative([[0]]), 0)
	})

	test('handles identity, diagonal, and zero matrices', () => {
		assert.equal(
			traceFloatIterative([
				[1, 0, 0, 0],
				[0, 1, 0, 0],
				[0, 0, 1, 0],
				[0, 0, 0, 1],
			]),
			4
		)
		assert.equal(
			traceFloatIterative([
				[2.5, 0, 0],
				[0, -1.25, 0],
				[0, 0, 4.75],
			]),
			6
		)
		assert.equal(
			traceFloatIterative([
				[0, 0, 0],
				[0, 0, 0],
				[0, 0, 0],
			]),
			0
		)
	})

	test('handles negative and floating-point entries', () => {
		const m = [
			[-1.5, 99.9, -0.25],
			[12.3, 2.75, 4.5],
			[8.1, -3.3, -4.125],
		]
		approxEqual(traceFloatIterative(m), -2.875)

		const canceling = [
			[1e-7, 5],
			[-5, -1e-7],
		]
		assert.equal(traceFloatIterative(canceling), 0)
	})

	test('does not mutate the input matrix', () => {
		const m = [
			[1.5, -2],
			[3, 4.5],
		]
		const snapshot = structuredClone(m)
		assert.equal(traceFloatIterative(m), 6)
		assert.deepEqual(m, snapshot)
	})

	test('cross-check: linearity, transpose invariance, and cyclic property', () => {
		const A = [
			[1.25, -0.5, 3.0],
			[2.5, -4.75, 1.5],
			[-1.0, 2.25, 6.5],
		]
		const B = [
			[-3.5, 1.25, 0.75],
			[4.0, 2.0, -2.5],
			[0.5, -1.75, 5.25],
		]
		const alpha = 2.5
		const beta = -1.75

		// Linearity: tr(alpha*A + beta*B) === alpha*tr(A) + beta*tr(B)
		const linearCombo = addMatrices(scaleMatrix(A, alpha), scaleMatrix(B, beta))
		approxEqual(
			traceFloatIterative(linearCombo),
			alpha * traceFloatIterative(A) + beta * traceFloatIterative(B)
		)

		// Additivity: tr(A + B) === tr(A) + tr(B)
		approxEqual(
			traceFloatIterative(addMatrices(A, B)),
			traceFloatIterative(A) + traceFloatIterative(B)
		)

		// Transpose invariance: tr(A^T) === tr(A)
		assert.equal(traceFloatIterative(transpose(A)), traceFloatIterative(A))

		// Cyclic property: tr(A * B) === tr(B * A)
		approxEqual(
			traceFloatIterative(multiplyMatrices(A, B)),
			traceFloatIterative(multiplyMatrices(B, A))
		)
	})

	test('rejects invalid, empty, non-square, and non-finite inputs', () => {
		// Non-array inputs
		assert.throws(() => traceFloatIterative(null), TypeError)
		assert.throws(() => traceFloatIterative(undefined), TypeError)
		assert.throws(() => traceFloatIterative(123), TypeError)
		assert.throws(() => traceFloatIterative('[[1]]'), TypeError)
		assert.throws(() => traceFloatIterative({}), TypeError)

		// Empty matrix
		assert.throws(() => traceFloatIterative([]), RangeError)

		// Non-array row
		assert.throws(() => traceFloatIterative([1, 2]), TypeError)
		assert.throws(() => traceFloatIterative([[1, 2], null]), TypeError)

		// Non-square matrices
		assert.throws(() => traceFloatIterative([[]]), RangeError)
		assert.throws(
			() =>
				traceFloatIterative([
					[1, 2, 3],
					[4, 5, 6],
				]),
			RangeError
		)
		assert.throws(
			() =>
				traceFloatIterative([
					[1, 2],
					[3],
				]),
			RangeError
		)

		// Non-number entries (both diagonal and off-diagonal)
		assert.throws(
			() =>
				traceFloatIterative([
					['1', 2],
					[3, 4],
				]),
			TypeError
		)
		assert.throws(
			() =>
				traceFloatIterative([
					[1, null],
					[3, 4],
				]),
			TypeError
		)
		assert.throws(
			() =>
				traceFloatIterative([
					[1, undefined],
					[3, 4],
				]),
			TypeError
		)
		assert.throws(
			() => traceFloatIterative([new Array(2), [1, 2]]),
			TypeError
		)

		// Non-finite numbers (both diagonal and off-diagonal)
		assert.throws(
			() =>
				traceFloatIterative([
					[NaN, 0],
					[0, 1],
				]),
			RangeError
		)
		assert.throws(
			() =>
				traceFloatIterative([
					[1, Infinity],
					[0, 1],
				]),
			RangeError
		)
		assert.throws(
			() =>
				traceFloatIterative([
					[1, 0],
					[-Infinity, 1],
				]),
			RangeError
		)
	})
})
