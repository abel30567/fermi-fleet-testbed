import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { traceFloatRecursive } from './traceFloatRecursive.js'

/**
 * Deterministic PRNG (Mulberry32) for reproducible test matrices.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createPrng(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * Independent iterative matrix trace computation for cross-checking.
 *
 * @param {number[][]} M
 * @returns {number}
 */
function traceIterative(M) {
	let sum = 0
	for (let i = 0; i < M.length; i++) {
		sum += M[i][i]
	}
	return sum
}

/**
 * Standard matrix multiplication `A * B` for `m × k` and `k × p` matrices.
 *
 * @param {number[][]} A
 * @param {number[][]} B
 * @returns {number[][]}
 */
function matMul(A, B) {
	const m = A.length
	const k = B.length
	const p = B[0].length
	const C = Array.from({ length: m }, () => new Array(p).fill(0))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < p; j++) {
			let acc = 0
			for (let r = 0; r < k; r++) {
				acc += A[i][r] * B[r][j]
			}
			C[i][j] = acc
		}
	}
	return C
}

/**
 * Generates a `rows × cols` matrix using the provided value generator.
 *
 * @param {number} rows
 * @param {number} cols
 * @param {(i: number, j: number) => number} fn
 * @returns {number[][]}
 */
function makeMatrix(rows, cols, fn) {
	return Array.from({ length: rows }, (_, i) =>
		Array.from({ length: cols }, (_, j) => fn(i, j))
	)
}

/**
 * Asserts two finite float64 numbers are within an absolute/relative tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [relTol=1e-12]
 * @param {number} [absTol=1e-12]
 */
function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-12) {
	const diff = Math.abs(actual - expected)
	const bound = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= bound,
		`Expected ${actual} to be close to ${expected} (diff=${diff}, bound=${bound})`
	)
}

describe('traceFloatRecursive', () => {
	describe('normal cases', () => {
		test('computes trace for 1x1 matrices', () => {
			assert.equal(traceFloatRecursive([[42]]), 42)
			assert.equal(traceFloatRecursive([[-3.14159]]), -3.14159)
		})

		test('computes trace for 2x2 matrices', () => {
			const M = [
				[1, 2],
				[3, 4],
			]
			assert.equal(traceFloatRecursive(M), 5)
		})

		test('computes trace for 3x3 matrices', () => {
			const M = [
				[2, -1, 5],
				[0, 3.5, 8],
				[-4, 9, -0.5],
			]
			assert.equal(traceFloatRecursive(M), 5)
		})

		test('computes trace for larger matrices (even, odd, power-of-two, non-power-of-two)', () => {
			for (const n of [4, 5, 16, 33, 64, 129, 256]) {
				const M = makeMatrix(n, n, (i, j) => (i === j ? i + 1 : (i - j) * 0.25))
				const expected = (n * (n + 1)) / 2
				assert.equal(traceFloatRecursive(M), expected)
			}
		})
	})

	describe('edge cases', () => {
		test('zero matrices have trace 0', () => {
			for (const n of [1, 2, 5, 16]) {
				const Z = makeMatrix(n, n, () => 0)
				assert.equal(traceFloatRecursive(Z), 0)
			}
		})

		test('identity matrices have trace n', () => {
			for (const n of [1, 3, 8, 50]) {
				const I = makeMatrix(n, n, (i, j) => (i === j ? 1 : 0))
				assert.equal(traceFloatRecursive(I), n)
			}
		})

		test('handles negative, fractional, signed zero, and subnormal float64 values', () => {
			const M = [
				[-0.25, 100, -50],
				[999, 0.75, 0],
				[1, 2, -1.5],
			]
			assert.equal(traceFloatRecursive(M), -1)

			assert.ok(Object.is(traceFloatRecursive([[-0]]), -0))

			const sub = makeMatrix(4, 4, (i, j) => (i === j ? Number.MIN_VALUE : 0))
			assert.equal(traceFloatRecursive(sub), 4 * Number.MIN_VALUE)
		})

		test('off-diagonal values do not affect trace and input is not mutated', () => {
			const original = [
				[1.5, 1e10, -1e10],
				[42, -2.5, 3.14],
				[-7, 8, 4.0],
			]
			const snapshot = structuredClone(original)
			assert.equal(traceFloatRecursive(original), 3)
			assert.deepEqual(original, snapshot)
		})

		test('pairwise recursive summation maintains high accuracy on large constant diagonals', () => {
			const n = 1024
			const val = 0.1
			const M = makeMatrix(n, n, (i, j) => (i === j ? val : 0))
			assertClose(traceFloatRecursive(M), n * val, 1e-15, 1e-15)
		})
	})

	describe('input validation', () => {
		test('rejects non-array inputs', () => {
			for (const bad of [null, undefined, 0, 42, 'matrix', {}, () => {}]) {
				assert.throws(() => traceFloatRecursive(bad), TypeError)
			}
		})

		test('rejects empty matrices', () => {
			assert.throws(() => traceFloatRecursive([]), RangeError)
			assert.throws(() => traceFloatRecursive([[]]), RangeError)
		})

		test('rejects non-square rectangular matrices', () => {
			assert.throws(
				() =>
					traceFloatRecursive([
						[1, 2, 3],
						[4, 5, 6],
					]),
				RangeError
			)
			assert.throws(
				() =>
					traceFloatRecursive([
						[1, 2],
						[3, 4],
						[5, 6],
					]),
				RangeError
			)
		})

		test('rejects ragged arrays', () => {
			assert.throws(
				() =>
					traceFloatRecursive([
						[1, 2],
						[3],
					]),
				RangeError
			)
			assert.throws(
				() =>
					traceFloatRecursive([
						[1],
						[2, 3],
					]),
				RangeError
			)
		})

		test('rejects non-array rows and sparse outer arrays', () => {
			assert.throws(() => traceFloatRecursive([1, 2]), TypeError)
			assert.throws(() => traceFloatRecursive([[1, 2], null]), TypeError)

			const sparseOuter = new Array(2)
			sparseOuter[0] = [1, 2]
			assert.throws(() => traceFloatRecursive(sparseOuter), TypeError)
		})

		test('rejects non-numeric entries on or off the diagonal', () => {
			assert.throws(
				() =>
					traceFloatRecursive([
						['1', 2],
						[3, 4],
					]),
				TypeError
			)
			assert.throws(
				() =>
					traceFloatRecursive([
						[1, '2'],
						[3, 4],
					]),
				TypeError
			)
			assert.throws(
				() =>
					traceFloatRecursive([
						[1, null],
						[3, 4],
					]),
				TypeError
			)
			assert.throws(
				() =>
					traceFloatRecursive([
						[1, 2],
						[undefined, 4],
					]),
				TypeError
			)
			assert.throws(
				() =>
					traceFloatRecursive([
						[1, true],
						[3, 4],
					]),
				TypeError
			)
			assert.throws(
				() =>
					traceFloatRecursive([
						[1n, 0],
						[0, 1],
					]),
				TypeError
			)

			const sparseRow = new Array(2)
			sparseRow[0] = 1
			assert.throws(() => traceFloatRecursive([sparseRow, [3, 4]]), TypeError)
		})

		test('rejects NaN and ±Infinity on or off the diagonal', () => {
			assert.throws(() => traceFloatRecursive([[Number.NaN]]), RangeError)
			assert.throws(
				() =>
					traceFloatRecursive([
						[1, Number.NaN],
						[0, 2],
					]),
				RangeError
			)
			assert.throws(() => traceFloatRecursive([[Number.POSITIVE_INFINITY]]), RangeError)
			assert.throws(
				() =>
					traceFloatRecursive([
						[1, 2],
						[Number.NEGATIVE_INFINITY, 4],
					]),
				RangeError
			)
		})
	})

	describe('cross-checks against independent computations and algebraic identities', () => {
		test('matches independent iterative trace across pseudo-random matrices', () => {
			const rand = createPrng(20261122)
			for (const n of [1, 2, 3, 7, 15, 32, 63]) {
				const M = makeMatrix(n, n, () => (rand() - 0.5) * 200)
				const recursiveTrace = traceFloatRecursive(M)
				const iterativeTrace = traceIterative(M)
				assertClose(recursiveTrace, iterativeTrace, 1e-13, 1e-13)
			}
		})

		test('satisfies transpose invariance tr(A^T) === tr(A) and linearity', () => {
			const rand = createPrng(991133)
			const n = 9
			const A = makeMatrix(n, n, () => (rand() - 0.5) * 50)
			const B = makeMatrix(n, n, () => (rand() - 0.5) * 50)
			const AT = makeMatrix(n, n, (i, j) => A[j][i])
			const alpha = -3.75
			const beta = 2.25
			const combo = makeMatrix(n, n, (i, j) => alpha * A[i][j] + beta * B[i][j])

			assert.equal(traceFloatRecursive(AT), traceFloatRecursive(A))
			assertClose(
				traceFloatRecursive(combo),
				alpha * traceFloatRecursive(A) + beta * traceFloatRecursive(B)
			)
		})

		test('satisfies cyclic property tr(A * B) == tr(B * A) for square and rectangular factors', () => {
			const rand = createPrng(133742)

			// Square non-commuting matrices
			for (const n of [3, 6, 11]) {
				const A = makeMatrix(n, n, () => (rand() - 0.5) * 20)
				const B = makeMatrix(n, n, () => (rand() - 0.5) * 20)
				const trAB = traceFloatRecursive(matMul(A, B))
				const trBA = traceFloatRecursive(matMul(B, A))
				assertClose(trAB, trBA, 1e-12, 1e-12)
			}

			// Rectangular factors: P is 4x7, Q is 7x4 -> tr(P*Q) == tr(Q*P)
			const P = makeMatrix(4, 7, () => (rand() - 0.5) * 10)
			const Q = makeMatrix(7, 4, () => (rand() - 0.5) * 10)
			const trPQ = traceFloatRecursive(matMul(P, Q))
			const trQP = traceFloatRecursive(matMul(Q, P))
			assertClose(trPQ, trQP, 1e-12, 1e-12)
		})
	})
})
