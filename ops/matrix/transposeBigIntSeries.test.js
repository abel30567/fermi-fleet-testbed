import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { transposeBigIntSeries } from './transposeBigIntSeries.js'

function matVecMul(A, x) {
	return A.map((row) => row.reduce((acc, aij, j) => acc + aij * x[j], 0n))
}

function dot(u, v) {
	assert.equal(u.length, v.length)
	let sum = 0n
	for (let i = 0; i < u.length; i++) {
		sum += u[i] * v[i]
	}
	return sum
}

function matMul(A, B) {
	const m = A.length
	const k = A[0].length
	const n = B[0].length
	const out = Array.from({ length: m }, () => new Array(n).fill(0n))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = 0n
			for (let t = 0; t < k; t++) {
				sum += A[i][t] * B[t][j]
			}
			out[i][j] = sum
		}
	}
	return out
}

describe('transposeBigIntSeries', () => {
	test('transposes square matrices', () => {
		const m2 = [
			[1n, 2n],
			[3n, 4n],
		]
		assert.deepEqual(transposeBigIntSeries(m2), [
			[1n, 3n],
			[2n, 4n],
		])

		const m3 = [
			[1n, -2n, 0n],
			[4n, 5n, -6n],
			[7n, 8n, 9n],
		]
		assert.deepEqual(transposeBigIntSeries(m3), [
			[1n, 4n, 7n],
			[-2n, 5n, 8n],
			[0n, -6n, 9n],
		])
	})

	test('transposes rectangular matrices (m×n -> n×m)', () => {
		const rect2x3 = [
			[10n, 20n, 30n],
			[40n, 50n, 60n],
		]
		assert.deepEqual(transposeBigIntSeries(rect2x3), [
			[10n, 40n],
			[20n, 50n],
			[30n, 60n],
		])

		const rect3x2 = [
			[-1n, 2n],
			[3n, -4n],
			[5n, 6n],
		]
		assert.deepEqual(transposeBigIntSeries(rect3x2), [
			[-1n, 3n, 5n],
			[2n, -4n, 6n],
		])
	})

	test('handles edge cases: 1×1, row vector 1×n, column vector n×1', () => {
		assert.deepEqual(transposeBigIntSeries([[42n]]), [[42n]])

		const rowVec = [[1n, 2n, 3n, 4n, 5n]]
		assert.deepEqual(transposeBigIntSeries(rowVec), [[1n], [2n], [3n], [4n], [5n]])

		const colVec = [[-10n], [0n], [10n], [20n]]
		assert.deepEqual(transposeBigIntSeries(colVec), [[-10n, 0n, 10n, 20n]])
	})

	test('preserves huge arbitrary-precision and 10^18 fixed-point BigInts exactly', () => {
		const scale = 10n ** 18n
		const hugePos = (1n << 256n) - 1n
		const hugeNeg = -(10n ** 60n) - 9876543210123456789n
		const fpA = 3141592653589793238n // ~pi * 10^18
		const fpB = -2718281828459045235n // ~-e * 10^18

		const A = [
			[hugePos, fpA, scale],
			[hugeNeg, fpB, 0n],
		]
		assert.deepEqual(transposeBigIntSeries(A), [
			[hugePos, hugeNeg],
			[fpA, fpB],
			[scale, 0n],
		])
	})

	test('does not mutate input matrix and returns an independent copy', () => {
		const original = [
			[1n, 2n, 3n],
			[4n, 5n, 6n],
		]
		const snapshot = original.map((row) => [...row])

		const transposed = transposeBigIntSeries(original)
		assert.deepEqual(original, snapshot)

		transposed[0][0] = 999n
		transposed.push([7n, 8n])
		assert.deepEqual(original, snapshot)
	})

	test('rejects invalid inputs (non-arrays, empty, ragged, non-BigInt entries)', () => {
		for (const bad of [null, undefined, 123, 123n, '[[1]]', { 0: [1n] }]) {
			assert.throws(() => transposeBigIntSeries(bad), TypeError)
		}

		assert.throws(() => transposeBigIntSeries([]), RangeError)
		assert.throws(() => transposeBigIntSeries([[]]), RangeError)
		assert.throws(() => transposeBigIntSeries([[], []]), RangeError)

		assert.throws(() => transposeBigIntSeries([1n, 2n]), TypeError)
		assert.throws(() => transposeBigIntSeries([[1n], 'not-a-row']), TypeError)

		assert.throws(
			() =>
				transposeBigIntSeries([
					[1n, 2n],
					[3n],
				]),
			RangeError
		)
		assert.throws(
			() =>
				transposeBigIntSeries([
					[1n],
					[2n, 3n],
				]),
			RangeError
		)

		assert.throws(() => transposeBigIntSeries([[1, 2n]]), TypeError)
		assert.throws(() => transposeBigIntSeries([[1n, '2']]), TypeError)
		assert.throws(() => transposeBigIntSeries([[1n, null]]), TypeError)
		assert.throws(() => transposeBigIntSeries([[1n, undefined]]), TypeError)
		assert.throws(() => transposeBigIntSeries([[true]]), TypeError)

		const sparseRow = new Array(2)
		sparseRow[1] = 1n
		assert.throws(() => transposeBigIntSeries([sparseRow]), TypeError)
	})

	test('cross-check: involution identity (A^T)^T == A', () => {
		const matrices = [
			[[7n]],
			[[1n, -2n, 3n, -4n]],
			[[10n], [20n], [30n]],
			[
				[1n, 2n, 3n, 4n],
				[5n, 6n, 7n, 8n],
				[9n, 10n, 11n, 12n],
			],
			[
				[-(10n ** 30n), 10n ** 18n + 7n],
				[0n, 10n ** 40n - 3n],
			],
		]

		for (const A of matrices) {
			assert.deepEqual(transposeBigIntSeries(transposeBigIntSeries(A)), A)
		}
	})

	test('cross-check: adjoint inner-product identity (Ax)·y == x·(A^T y) and (AB)^T == B^T A^T', () => {
		const A = [
			[3n, -1n, 4n, 10n ** 18n],
			[-5n, 9n, -2n, -(10n ** 18n) + 7n],
			[6n, 5n, -3n, 2n],
		]
		const x = [11n, -13n, 17n, 19n]
		const y = [-23n, 29n, -31n]

		const AT = transposeBigIntSeries(A)
		const lhs = dot(matVecMul(A, x), y)
		const rhs = dot(x, matVecMul(AT, y))
		assert.equal(lhs, rhs)

		const B = [
			[2n, -7n],
			[4n, 1n],
			[-6n, 8n],
			[3n, -5n],
		]
		const ABT = transposeBigIntSeries(matMul(A, B))
		const BTAT = matMul(transposeBigIntSeries(B), AT)
		assert.deepEqual(ABT, BTAT)
	})
})
