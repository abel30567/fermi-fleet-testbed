import { test } from 'node:test'
import assert from 'node:assert/strict'
import { transposeFloatRecursive } from './transposeFloatRecursive.js'

/**
 * Deterministic linear congruential generator for reproducible float64 test matrices.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let s = seed >>> 0
	return () => {
		s = (Math.imul(1664525, s) + 1013904223) >>> 0
		return (s / 0x100000000) * 200 - 100
	}
}

/**
 * Independent naive iterative reference transpose for cross-checking.
 *
 * @param {number[][]} m
 * @returns {number[][]}
 */
function naiveTranspose(m) {
	if (m.length === 0 || m[0].length === 0) return []
	const rows = m.length
	const cols = m[0].length
	const res = Array.from({ length: cols }, () => new Array(rows))
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			res[c][r] = m[r][c]
		}
	}
	return res
}

/**
 * Naive matrix multiplication for algebraic cross-checking.
 *
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

test('transposes standard square float64 matrices', () => {
	const m2 = [
		[1.5, -2.25],
		[3.75, 4.125],
	]
	assert.deepEqual(transposeFloatRecursive(m2), [
		[1.5, 3.75],
		[-2.25, 4.125],
	])

	const m3 = [
		[0.1, 0.2, 0.3],
		[1.1, 1.2, 1.3],
		[2.1, 2.2, 2.3],
	]
	assert.deepEqual(transposeFloatRecursive(m3), [
		[0.1, 1.1, 2.1],
		[0.2, 1.2, 2.2],
		[0.3, 1.3, 2.3],
	])
})

test('transposes rectangular and vector-shaped matrices', () => {
	// Wide 2x5
	const wide = [
		[1.1, 2.2, 3.3, 4.4, 5.5],
		[-1.1, -2.2, -3.3, -4.4, -5.5],
	]
	assert.deepEqual(transposeFloatRecursive(wide), [
		[1.1, -1.1],
		[2.2, -2.2],
		[3.3, -3.3],
		[4.4, -4.4],
		[5.5, -5.5],
	])

	// Tall 4x2
	const tall = [
		[10.5, 20.5],
		[30.5, 40.5],
		[50.5, 60.5],
		[70.5, 80.5],
	]
	assert.deepEqual(transposeFloatRecursive(tall), [
		[10.5, 30.5, 50.5, 70.5],
		[20.5, 40.5, 60.5, 80.5],
	])

	// 1x6 row vector -> 6x1 column vector
	const rowVec = [[1, 2, 3, 4, 5, 6]]
	assert.deepEqual(transposeFloatRecursive(rowVec), [[1], [2], [3], [4], [5], [6]])

	// 6x1 column vector -> 1x6 row vector
	const colVec = [[1], [2], [3], [4], [5], [6]]
	assert.deepEqual(transposeFloatRecursive(colVec), [[1, 2, 3, 4, 5, 6]])
})

test('handles edge cases: empty, zero-column, and 1x1 matrices', () => {
	assert.deepEqual(transposeFloatRecursive([]), [])
	assert.deepEqual(transposeFloatRecursive([[]]), [])
	assert.deepEqual(transposeFloatRecursive([[], [], []]), [])
	assert.deepEqual(transposeFloatRecursive([[42.5]]), [[42.5]])
})

test('preserves IEEE-754 special float64 values faithfully', () => {
	const input = [
		[NaN, Infinity, -Infinity],
		[-0, +0, Number.MIN_VALUE],
		[Number.MAX_VALUE, -Number.MAX_VALUE, Number.EPSILON],
	]
	const t = transposeFloatRecursive(input)

	assert.equal(t.length, 3)
	assert.equal(t[0].length, 3)
	assert.ok(Number.isNaN(t[0][0]))
	assert.ok(Object.is(t[0][1], -0))
	assert.equal(t[0][2], Number.MAX_VALUE)

	assert.equal(t[1][0], Infinity)
	assert.ok(Object.is(t[1][1], +0))
	assert.equal(t[1][2], -Number.MAX_VALUE)

	assert.equal(t[2][0], -Infinity)
	assert.equal(t[2][1], Number.MIN_VALUE)
	assert.equal(t[2][2], Number.EPSILON)
})

test('does not mutate input matrix or share row references', () => {
	const original = [
		[1.25, 2.5],
		[3.75, 5.0],
	]
	const snapshot = original.map((r) => [...r])
	const result = transposeFloatRecursive(original)

	assert.deepEqual(original, snapshot)
	result[0][0] = 999
	assert.deepEqual(original, snapshot)
})

test('cross-checks deep recursive splits against naive reference across varied sizes', () => {
	const rng = makeRng(123456789)
	const shapes = [
		[1, 35],
		[35, 1],
		[8, 8],
		[9, 9],
		[16, 16],
		[17, 29],
		[37, 19],
		[53, 41],
		[64, 48],
	]

	for (const [rows, cols] of shapes) {
		const m = Array.from({ length: rows }, () =>
			Array.from({ length: cols }, () => rng())
		)
		const actual = transposeFloatRecursive(m)
		const expected = naiveTranspose(m)
		assert.deepEqual(actual, expected, `mismatch for shape ${rows}x${cols}`)
	}
})

test('satisfies involution property: transpose(transpose(A)) == A', () => {
	const rng = makeRng(987654321)
	const shapes = [
		[1, 1],
		[3, 7],
		[23, 11],
		[45, 38],
	]

	for (const [rows, cols] of shapes) {
		const m = Array.from({ length: rows }, () =>
			Array.from({ length: cols }, () => rng())
		)
		const doubleTransposed = transposeFloatRecursive(transposeFloatRecursive(m))
		assert.deepEqual(doubleTransposed, m, `involution failed for ${rows}x${cols}`)
	}
})

test('satisfies matrix product reversal: transpose(A * B) == transpose(B) * transpose(A)', () => {
	const rng = makeRng(424242)
	const A = Array.from({ length: 19 }, () =>
		Array.from({ length: 13 }, () => Math.round(rng() * 4) / 4)
	)
	const B = Array.from({ length: 13 }, () =>
		Array.from({ length: 21 }, () => Math.round(rng() * 4) / 4)
	)

	const lhs = transposeFloatRecursive(matMul(A, B))
	const rhs = matMul(transposeFloatRecursive(B), transposeFloatRecursive(A))

	assert.equal(lhs.length, rhs.length)
	assert.equal(lhs[0].length, rhs[0].length)
	for (let r = 0; r < lhs.length; r++) {
		for (let c = 0; c < lhs[0].length; c++) {
			assert.ok(
				Math.abs(lhs[r][c] - rhs[r][c]) <= 1e-9,
				`product reversal mismatch at [${r}][${c}]: ${lhs[r][c]} vs ${rhs[r][c]}`
			)
		}
	}
})

test('validates inputs and throws appropriate errors', () => {
	// Non-array top-level inputs
	for (const bad of [null, undefined, 42, 'matrix', {}, new Float64Array([1, 2])]) {
		assert.throws(() => transposeFloatRecursive(bad), TypeError)
	}

	// Non-array rows
	assert.throws(() => transposeFloatRecursive([1, 2, 3]), TypeError)
	assert.throws(() => transposeFloatRecursive([[1, 2], 'not-a-row']), TypeError)
	assert.throws(() => transposeFloatRecursive([[1, 2], null]), TypeError)

	// Ragged matrices
	assert.throws(() => transposeFloatRecursive([[1, 2], [3]]), RangeError)
	assert.throws(() => transposeFloatRecursive([[], [1]]), RangeError)

	// Non-number elements and sparse arrays
	assert.throws(() => transposeFloatRecursive([['1.5']]), TypeError)
	assert.throws(() => transposeFloatRecursive([[1, null]]), TypeError)
	assert.throws(() => transposeFloatRecursive([[1, undefined]]), TypeError)
	assert.throws(() => transposeFloatRecursive([[1, true]]), TypeError)
	assert.throws(() => transposeFloatRecursive([[1n]]), TypeError)
	assert.throws(() => transposeFloatRecursive([new Array(3)]), TypeError)
})
