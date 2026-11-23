import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { matMulFloatIterative } from './matMulFloatIterative.js'

/**
 * Deterministic PRNG (Mulberry32) for reproducible cross-check tests.
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
	let s = seed >>> 0
	return () => {
		s = (s + 0x6d2b79f5) >>> 0
		let t = Math.imul(s ^ (s >>> 15), 1 | s)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function randomMatrix(rows, cols, rng, scale = 10) {
	return Array.from({ length: rows }, () =>
		Array.from({ length: cols }, () => (rng() * 2 - 1) * scale)
	)
}

function transpose(m) {
	return Array.from({ length: m[0].length }, (_, j) =>
		Array.from({ length: m.length }, (_, i) => m[i][j])
	)
}

function addMatrices(a, b) {
	return a.map((row, i) => row.map((v, j) => v + b[i][j]))
}

function assertMatrixClose(actual, expected, eps = 1e-10) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < actual.length; i++) {
		assert.equal(actual[i].length, expected[i].length)
		for (let j = 0; j < actual[i].length; j++) {
			const diff = Math.abs(actual[i][j] - expected[i][j])
			assert.ok(
				diff <= eps,
				`Mismatch at [${i}][${j}]: actual=${actual[i][j]}, expected=${expected[i][j]}, diff=${diff}`
			)
		}
	}
}

describe('matMulFloatIterative', () => {
	test('multiplies 2x2 square matrices', () => {
		const a = [
			[1, 2],
			[3, 4],
		]
		const b = [
			[5, 6],
			[7, 8],
		]
		assert.deepEqual(matMulFloatIterative(a, b), [
			[19, 22],
			[43, 50],
		])
	})

	test('multiplies rectangular matrices (2x3 * 3x2 and 3x2 * 2x4)', () => {
		const a = [
			[1, 2, 3],
			[4, 5, 6],
		]
		const b = [
			[7, 8],
			[9, 10],
			[11, 12],
		]
		assert.deepEqual(matMulFloatIterative(a, b), [
			[58, 64],
			[139, 154],
		])

		const c = [
			[1, -2],
			[0, 3],
			[4, 5],
		]
		const d = [
			[2, 0, -1, 3],
			[1, 4, 2, -2],
		]
		assert.deepEqual(matMulFloatIterative(c, d), [
			[0, -8, -5, 7],
			[3, 12, 6, -6],
			[13, 20, 6, 2],
		])
	})

	test('multiplies matrices with floating-point and negative values', () => {
		const a = [
			[0.5, -1.25],
			[2.5, 0.25],
		]
		const b = [
			[4.0, -0.5],
			[-2.0, 8.0],
		]
		assertMatrixClose(
			matMulFloatIterative(a, b),
			[
				[4.5, -10.25],
				[9.5, 0.75],
			],
			1e-12
		)
	})

	test('handles inner product (1xN * Nx1) and outer product (Nx1 * 1xM)', () => {
		const rowVec = [[1.5, -2.0, 3.5]]
		const colVec = [[2.0], [4.0], [-1.0]]
		assert.deepEqual(matMulFloatIterative(rowVec, colVec), [[-8.5]])

		assert.deepEqual(matMulFloatIterative(colVec, rowVec), [
			[3.0, -4.0, 7.0],
			[6.0, -8.0, 14.0],
			[-1.5, 2.0, -3.5],
		])
	})

	test('handles 1x1 edge case', () => {
		assert.deepEqual(matMulFloatIterative([[6.25]], [[-4.0]]), [[-25]])
	})

	test('satisfies identity and zero matrix properties', () => {
		const a = [
			[1.25, -3.5, 7.0],
			[0.0, 2.5, -1.5],
			[4.0, -0.25, 9.125],
		]
		const identity = [
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1],
		]
		const zero = [
			[0, 0, 0],
			[0, 0, 0],
			[0, 0, 0],
		]

		assert.deepEqual(matMulFloatIterative(a, identity), a)
		assert.deepEqual(matMulFloatIterative(identity, a), a)
		assert.deepEqual(matMulFloatIterative(a, zero), zero)
		assert.deepEqual(matMulFloatIterative(zero, a), zero)
	})

	test('handles subnormal and high-magnitude finite float64 numbers', () => {
		const tiny = Number.MIN_VALUE
		const resTiny = matMulFloatIterative([[tiny, 0]], [[2], [1]])
		assert.equal(resTiny[0][0], tiny * 2)

		const resNegZero = matMulFloatIterative([[-0]], [[5]])
		assert.equal(resNegZero[0][0], 0)
	})

	test('does not mutate input matrices', () => {
		const a = [
			[1, 2],
			[3, 4],
		]
		const b = [
			[5, 6],
			[7, 8],
		]
		const aSnap = structuredClone(a)
		const bSnap = structuredClone(b)

		const out = matMulFloatIterative(a, b)
		out[0][0] = 999

		assert.deepEqual(a, aSnap)
		assert.deepEqual(b, bSnap)
	})

	test('rejects invalid input types and shapes', () => {
		assert.throws(() => matMulFloatIterative(null, [[1]]), TypeError)
		assert.throws(() => matMulFloatIterative([[1]], undefined), TypeError)
		assert.throws(() => matMulFloatIterative('not-a-matrix', [[1]]), TypeError)
		assert.throws(() => matMulFloatIterative([1, 2], [[1], [2]]), TypeError)

		assert.throws(() => matMulFloatIterative([], [[1]]), RangeError)
		assert.throws(() => matMulFloatIterative([[1]], []), RangeError)
		assert.throws(() => matMulFloatIterative([[]], [[1]]), RangeError)
		assert.throws(() => matMulFloatIterative([[1]], [[]]), RangeError)

		// Ragged matrices
		assert.throws(
			() =>
				matMulFloatIterative(
					[
						[1, 2],
						[3],
					],
					[[1], [2]]
				),
			RangeError
		)
		assert.throws(
			() =>
				matMulFloatIterative(
					[[1, 2]],
					[
						[1, 2],
						[3],
					]
				),
			RangeError
		)

		// Incompatible inner dimensions (2x3 * 2x2)
		assert.throws(
			() =>
				matMulFloatIterative(
					[
						[1, 2, 3],
						[4, 5, 6],
					],
					[
						[1, 2],
						[3, 4],
					]
				),
			RangeError
		)
	})

	test('rejects non-number, sparse, and non-finite entries', () => {
		assert.throws(() => matMulFloatIterative([['1']], [[1]]), TypeError)
		assert.throws(() => matMulFloatIterative([[1]], [[null]]), TypeError)
		assert.throws(() => matMulFloatIterative([[1n]], [[1]]), TypeError)
		assert.throws(() => matMulFloatIterative([[true]], [[1]]), TypeError)

		const sparseRow = new Array(2)
		sparseRow[0] = 1
		assert.throws(() => matMulFloatIterative([sparseRow], [[1], [2]]), TypeError)

		const sparseMatrix = new Array(2)
		sparseMatrix[0] = [1, 2]
		assert.throws(() => matMulFloatIterative(sparseMatrix, [[1], [2]]), TypeError)

		assert.throws(() => matMulFloatIterative([[Number.NaN]], [[1]]), RangeError)
		assert.throws(() => matMulFloatIterative([[1]], [[Number.POSITIVE_INFINITY]]), RangeError)
		assert.throws(() => matMulFloatIterative([[Number.NEGATIVE_INFINITY]], [[1]]), RangeError)
	})

	test('cross-check: matches independent BigInt exact multiplication on integer matrices', () => {
		const rng = createRng(42)
		const randIntMatrix = (rows, cols) =>
			Array.from({ length: rows }, () =>
				Array.from({ length: cols }, () => Math.floor(rng() * 201) - 100)
			)

		const bigIntMatMul = (a, b) =>
			a.map((row) =>
				b[0].map((_, j) =>
					row.reduce((acc, v, p) => acc + BigInt(v) * BigInt(b[p][j]), 0n)
				)
			)

		const a = randIntMatrix(7, 5)
		const b = randIntMatrix(5, 6)

		const floatResult = matMulFloatIterative(a, b)
		const exactResult = bigIntMatMul(a, b).map((row) => row.map((v) => Number(v)))

		assert.deepEqual(floatResult, exactResult)
	})

	test('cross-check: satisfies transpose, associativity, and distributivity on random float64 matrices', () => {
		const rng = createRng(1337)
		const a = randomMatrix(5, 4, rng)
		const b = randomMatrix(4, 6, rng)
		const c = randomMatrix(6, 3, rng)
		const b2 = randomMatrix(4, 6, rng)

		// (A * B)^T === B^T * A^T
		assertMatrixClose(
			transpose(matMulFloatIterative(a, b)),
			matMulFloatIterative(transpose(b), transpose(a)),
			1e-10
		)

		// (A * B) * C === A * (B * C)
		assertMatrixClose(
			matMulFloatIterative(matMulFloatIterative(a, b), c),
			matMulFloatIterative(a, matMulFloatIterative(b, c)),
			1e-9
		)

		// A * (B + B2) === A * B + A * B2
		assertMatrixClose(
			matMulFloatIterative(a, addMatrices(b, b2)),
			addMatrices(matMulFloatIterative(a, b), matMulFloatIterative(a, b2)),
			1e-10
		)
	})

	test('cross-check: matches functional reduce-based reference bit-for-bit', () => {
		const rng = createRng(2026)
		const a = randomMatrix(6, 8, rng, 100)
		const b = randomMatrix(8, 5, rng, 100)

		const reference = a.map((row) =>
			b[0].map((_, j) => row.reduce((acc, val, p) => acc + val * b[p][j], 0))
		)

		assert.deepEqual(matMulFloatIterative(a, b), reference)
	})
})
