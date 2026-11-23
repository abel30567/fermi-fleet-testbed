import { test } from 'node:test'
import assert from 'node:assert/strict'
import { transposeFloatIterative } from './transposeFloatIterative.js'

/**
 * Deterministic LCG PRNG for reproducible tests.
 * @param {number} seed
 * @returns {() => number}
 */
function makePrng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

/**
 * Independent reference matrix multiplication for cross-check tests.
 * @param {number[][]} a
 * @param {number[][]} b
 * @returns {number[][]}
 */
function matMul(a, b) {
	const m = a.length
	const k = a[0].length
	const n = b[0].length
	const out = Array.from({ length: m }, () => new Array(n).fill(0))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = 0
			for (let p = 0; p < k; p++) {
				sum += a[i][p] * b[p][j]
			}
			out[i][j] = sum
		}
	}
	return out
}

test('transposes rectangular 2x3 and 3x2 float64 matrices', () => {
	const m2x3 = [
		[1.5, -2.25, 3.125],
		[4.0, 5.5, -6.75],
	]
	assert.deepStrictEqual(transposeFloatIterative(m2x3), [
		[1.5, 4.0],
		[-2.25, 5.5],
		[3.125, -6.75],
	])

	const m3x2 = [
		[0.1, 0.2],
		[0.3, 0.4],
		[0.5, 0.6],
	]
	assert.deepStrictEqual(transposeFloatIterative(m3x2), [
		[0.1, 0.3, 0.5],
		[0.2, 0.4, 0.6],
	])
})

test('transposes square and symmetric matrices', () => {
	const square = [
		[1, 2, 3],
		[4, 5, 6],
		[7, 8, 9],
	]
	assert.deepStrictEqual(transposeFloatIterative(square), [
		[1, 4, 7],
		[2, 5, 8],
		[3, 6, 9],
	])

	const symmetric = [
		[1.25, -3.5, 7.0],
		[-3.5, 2.5, 0.125],
		[7.0, 0.125, -9.75],
	]
	assert.deepStrictEqual(transposeFloatIterative(symmetric), symmetric)
})

test('does not mutate input and returns independent arrays', () => {
	const input = [
		[1, 2],
		[3, 4],
	]
	const snapshot = input.map((r) => [...r])
	const result = transposeFloatIterative(input)

	assert.deepStrictEqual(input, snapshot)
	result[0][0] = 999
	assert.deepStrictEqual(input, snapshot)
})

test('handles empty matrices and zero-column matrices', () => {
	assert.deepStrictEqual(transposeFloatIterative([]), [])
	assert.deepStrictEqual(transposeFloatIterative([[]]), [])
	assert.deepStrictEqual(transposeFloatIterative([[], [], []]), [])
})

test('handles 1x1, row vector (1xn), and column vector (mx1) matrices', () => {
	assert.deepStrictEqual(transposeFloatIterative([[42.5]]), [[42.5]])
	assert.deepStrictEqual(transposeFloatIterative([[1.1, 2.2, 3.3, 4.4]]), [
		[1.1],
		[2.2],
		[3.3],
		[4.4],
	])
	assert.deepStrictEqual(
		transposeFloatIterative([[-1], [0], [2.5]]),
		[[-1, 0, 2.5]],
	)
})

test('preserves IEEE-754 float64 special values bit-for-bit', () => {
	const matrix = [
		[-0, +0, Number.NaN, Number.POSITIVE_INFINITY],
		[
			Number.NEGATIVE_INFINITY,
			Number.MAX_VALUE,
			Number.MIN_VALUE,
			Number.EPSILON,
		],
	]
	const t = transposeFloatIterative(matrix)

	assert.equal(t.length, 4)
	assert.equal(t[0].length, 2)
	assert.equal(Object.is(t[0][0], -0), true)
	assert.equal(Object.is(t[0][1], Number.NEGATIVE_INFINITY), true)
	assert.equal(Object.is(t[1][0], +0), true)
	assert.equal(Object.is(t[1][1], Number.MAX_VALUE), true)
	assert.equal(Number.isNaN(t[2][0]), true)
	assert.equal(Object.is(t[2][1], Number.MIN_VALUE), true)
	assert.equal(Object.is(t[3][0], Number.POSITIVE_INFINITY), true)
	assert.equal(Object.is(t[3][1], Number.EPSILON), true)
})

test('validates non-array matrix and non-array rows', () => {
	for (const bad of [
		null,
		undefined,
		123,
		'matrix',
		{},
		new Float64Array([1, 2]),
	]) {
		assert.throws(() => transposeFloatIterative(bad), TypeError)
	}

	assert.throws(() => transposeFloatIterative([1, 2, 3]), TypeError)
	assert.throws(() => transposeFloatIterative([[1, 2], null]), TypeError)
	assert.throws(() => transposeFloatIterative([[1, 2], 'ab']), TypeError)
	assert.throws(
		() => transposeFloatIterative([[1, 2], new Float64Array([3, 4])]),
		TypeError,
	)
})

test('validates rectangular shape (rejects jagged matrices)', () => {
	assert.throws(() => transposeFloatIterative([[1, 2], [3]]), RangeError)
	assert.throws(() => transposeFloatIterative([[1], [2, 3]]), RangeError)
	assert.throws(() => transposeFloatIterative([[], [1]]), RangeError)
	assert.throws(() => transposeFloatIterative([[1], []]), RangeError)
})

test('validates element types and rejects sparse arrays', () => {
	const invalidEntries = [
		[['1']],
		[[1, null]],
		[[1, undefined]],
		[[1n]],
		[[true]],
		[[{}]],
		[[Symbol('x')]],
		// eslint-disable-next-line no-new-wrappers
		[[new Number(1)]],
	]
	for (const bad of invalidEntries) {
		assert.throws(() => transposeFloatIterative(bad), TypeError)
	}

	const sparseRow = new Array(3)
	sparseRow[0] = 1
	sparseRow[2] = 3
	assert.throws(() => transposeFloatIterative([sparseRow]), TypeError)
	assert.throws(() => transposeFloatIterative([new Array(2)]), TypeError)
})

test('cross-check: matches functional reference and involution (A^T)^T === A', () => {
	const rand = makePrng(0x5eed1234)
	const shapes = [
		[1, 1],
		[1, 7],
		[7, 1],
		[4, 4],
		[5, 9],
		[13, 6],
		[37, 29],
	]

	for (const [rows, cols] of shapes) {
		const matrix = Array.from({ length: rows }, () =>
			Array.from({ length: cols }, () => (rand() - 0.5) * 1e6),
		)

		const expected = Array.from({ length: cols }, (_, c) =>
			matrix.map((row) => row[c]),
		)
		const transposed = transposeFloatIterative(matrix)

		assert.deepStrictEqual(transposed, expected)
		assert.deepStrictEqual(transposeFloatIterative(transposed), matrix)
	}
})

test('cross-check: satisfies linearity (A+B)^T = A^T+B^T and product reversal (AB)^T = B^T A^T', () => {
	const rand = makePrng(0xc0ffee)
	// Use exact dyadic rationals (multiples of 0.25) so float64 arithmetic is exact
	const makeExactMatrix = (rows, cols) =>
		Array.from({ length: rows }, () =>
			Array.from({ length: cols }, () => (Math.floor(rand() * 17) - 8) * 0.25),
		)

	const A = makeExactMatrix(4, 5)
	const B = makeExactMatrix(4, 5)
	const C = makeExactMatrix(5, 3)

	// (A + B)^T === A^T + B^T
	const AplusB = A.map((row, i) => row.map((val, j) => val + B[i][j]))
	const At = transposeFloatIterative(A)
	const Bt = transposeFloatIterative(B)
	const AtPlusBt = At.map((row, i) => row.map((val, j) => val + Bt[i][j]))
	assert.deepStrictEqual(transposeFloatIterative(AplusB), AtPlusBt)

	// (A * C)^T === C^T * A^T
	const AC = matMul(A, C)
	const Ct = transposeFloatIterative(C)
	assert.deepStrictEqual(transposeFloatIterative(AC), matMul(Ct, At))
})
