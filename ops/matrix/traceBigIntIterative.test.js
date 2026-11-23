import { describe, test } from 'node:test'
import assert from 'node:assert'
import { traceBigIntIterative } from './traceBigIntIterative.js'

/**
 * Helper: exact BigInt matrix addition A + B for independent cross-checks.
 */
function addMatrices(A, B) {
	return A.map((row, i) => row.map((val, j) => val + B[i][j]))
}

/**
 * Helper: exact BigInt scalar multiplication c * A for independent cross-checks.
 */
function scaleMatrix(c, A) {
	return A.map((row) => row.map((val) => c * val))
}

/**
 * Helper: matrix transpose A^T for independent cross-checks.
 */
function transposeMatrix(A) {
	const n = A.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => A[j][i])
	)
}

/**
 * Helper: exact BigInt matrix multiplication A * B for independent cross-checks.
 */
function multiplyMatrices(A, B) {
	const n = A.length
	const result = Array.from({ length: n }, () => new Array(n).fill(0n))
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let acc = 0n
			for (let k = 0; k < n; k++) {
				acc += A[i][k] * B[k][j]
			}
			result[i][j] = acc
		}
	}
	return result
}

describe('traceBigIntIterative', () => {
	describe('normal cases', () => {
		test('1x1 matrices (positive, negative, zero)', () => {
			assert.strictEqual(traceBigIntIterative([[7n]]), 7n)
			assert.strictEqual(traceBigIntIterative([[-42n]]), -42n)
			assert.strictEqual(traceBigIntIterative([[0n]]), 0n)
		})

		test('2x2 and 3x3 matrices', () => {
			assert.strictEqual(
				traceBigIntIterative([
					[1n, 2n],
					[3n, 4n]
				]),
				5n
			)

			assert.strictEqual(
				traceBigIntIterative([
					[10n, -5n, 3n],
					[7n, -4n, 8n],
					[9n, 1n, -6n]
				]),
				0n
			)

			assert.strictEqual(
				traceBigIntIterative([
					[1n, 0n, 0n],
					[0n, 1n, 0n],
					[0n, 0n, 1n]
				]),
				3n
			)
		})

		test('larger square matrix matches closed-form diagonal sum', () => {
			const n = 20
			const matrix = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => BigInt((i + 1) * 100 + j))
			)
			// Diagonal entries: (i + 1) * 100 + i = 101*i + 100 for i = 0..19
			// Sum = 101 * (19 * 20 / 2) + 20 * 100 = 101 * 190 + 2000 = 21190
			assert.strictEqual(traceBigIntIterative(matrix), 21190n)
		})

		test('arbitrary-precision BigInts beyond Number.MAX_SAFE_INTEGER', () => {
			const huge = 10n ** 50n
			const matrix = [
				[huge + 1n, huge * 99n, -(huge * 7n)],
				[123456789012345678901234567890n, -huge + 2n, 0n],
				[42n, -999n, huge + 3n]
			]
			assert.strictEqual(traceBigIntIterative(matrix), huge + 6n)
		})

		test('fixed-point BigInt entries scaled by 10^18', () => {
			const SCALE = 10n ** 18n
			// Diagonal: 1.5, 2.25, -0.75 -> sum = 3.0 * 10^18
			const matrix = [
				[15n * (SCALE / 10n), 9n * SCALE, -3n * SCALE],
				[4n * SCALE, 225n * (SCALE / 100n), 1n * SCALE],
				[0n, 2n * SCALE, -75n * (SCALE / 100n)]
			]
			assert.strictEqual(traceBigIntIterative(matrix), 3n * SCALE)
		})
	})

	describe('edge cases', () => {
		test('empty 0x0 matrix returns 0n', () => {
			assert.strictEqual(traceBigIntIterative([]), 0n)
		})

		test('all-zero matrix returns 0n', () => {
			assert.strictEqual(
				traceBigIntIterative([
					[0n, 0n, 0n],
					[0n, 0n, 0n],
					[0n, 0n, 0n]
				]),
				0n
			)
		})

		test('skew-symmetric matrix has zero trace regardless of off-diagonal magnitudes', () => {
			const big = 10n ** 40n
			assert.strictEqual(
				traceBigIntIterative([
					[0n, big, -big * 2n],
					[-big, 0n, big * 3n],
					[big * 2n, -big * 3n, 0n]
				]),
				0n
			)
		})

		test('does not mutate input matrix', () => {
			const matrix = [
				[2n, 4n],
				[6n, 8n]
			]
			const snapshot = matrix.map((row) => [...row])
			assert.strictEqual(traceBigIntIterative(matrix), 10n)
			assert.deepStrictEqual(matrix, snapshot)
		})
	})

	describe('invalid inputs', () => {
		test('throws TypeError when matrix is not an array', () => {
			for (const bad of [null, undefined, 42, 42n, '[[1n]]', {}, true]) {
				assert.throws(() => traceBigIntIterative(bad), TypeError)
			}
		})

		test('throws TypeError when any row is not an array (including sparse outer array)', () => {
			assert.throws(() => traceBigIntIterative([1n]), TypeError)
			assert.throws(() => traceBigIntIterative([[1n, 2n], null]), TypeError)
			assert.throws(
				() => traceBigIntIterative([[1n, 2n], { 0: 3n, 1: 4n, length: 2 }]),
				TypeError
			)
			const sparseOuter = new Array(2)
			sparseOuter[0] = [1n, 2n]
			assert.throws(() => traceBigIntIterative(sparseOuter), TypeError)
		})

		test('throws RangeError for non-square or ragged matrices', () => {
			assert.throws(() => traceBigIntIterative([[]]), RangeError)
			assert.throws(() => traceBigIntIterative([[1n, 2n]]), RangeError)
			assert.throws(() => traceBigIntIterative([[1n], [2n]]), RangeError)
			assert.throws(
				() =>
					traceBigIntIterative([
						[1n, 2n, 3n],
						[4n, 5n, 6n]
					]),
				RangeError
			)
			assert.throws(
				() =>
					traceBigIntIterative([
						[1n, 2n],
						[3n]
					]),
				RangeError
			)
		})

		test('throws TypeError for non-bigint entries on or off the diagonal', () => {
			// Number entries
			assert.throws(
				() =>
					traceBigIntIterative([
						[1, 2],
						[3, 4]
					]),
				TypeError
			)
			// Non-bigint off-diagonal entry must also be rejected
			assert.throws(
				() =>
					traceBigIntIterative([
						[1n, 2],
						[3n, 4n]
					]),
				TypeError
			)
			// String, null, undefined, NaN, boolean
			assert.throws(() => traceBigIntIterative([['1']]), TypeError)
			assert.throws(() => traceBigIntIterative([[null]]), TypeError)
			assert.throws(() => traceBigIntIterative([[undefined]]), TypeError)
			assert.throws(() => traceBigIntIterative([[Number.NaN]]), TypeError)
			assert.throws(() => traceBigIntIterative([[true]]), TypeError)
			// Sparse inner row hole
			const sparseRow = new Array(2)
			sparseRow[0] = 1n
			assert.throws(() => traceBigIntIterative([sparseRow, [3n, 4n]]), TypeError)
		})
	})

	describe('independent algebraic cross-checks', () => {
		const A = [
			[3n, -7n, 11n],
			[13n, 17n, -19n],
			[23n, -29n, 31n]
		]
		const B = [
			[-5n, 8n, 2n],
			[12n, -14n, 6n],
			[-9n, 4n, 15n]
		]
		const C = [
			[10n ** 20n, -3n, 7n],
			[2n, -(10n ** 20n) + 5n, 11n],
			[-4n, 9n, 13n]
		]

		test('linearity: tr(A + B) === tr(A) + tr(B) and tr(c * A) === c * tr(A)', () => {
			assert.strictEqual(
				traceBigIntIterative(addMatrices(A, B)),
				traceBigIntIterative(A) + traceBigIntIterative(B)
			)

			for (const c of [0n, 1n, -1n, 7n, -(10n ** 30n)]) {
				assert.strictEqual(
					traceBigIntIterative(scaleMatrix(c, A)),
					c * traceBigIntIterative(A)
				)
			}
		})

		test('transpose invariance: tr(A^T) === tr(A)', () => {
			assert.strictEqual(
				traceBigIntIterative(transposeMatrix(A)),
				traceBigIntIterative(A)
			)
			assert.strictEqual(
				traceBigIntIterative(transposeMatrix(C)),
				traceBigIntIterative(C)
			)
		})

		test('cyclic property: tr(AB) === tr(BA) and tr(ABC) === tr(BCA) === tr(CAB)', () => {
			assert.strictEqual(
				traceBigIntIterative(multiplyMatrices(A, B)),
				traceBigIntIterative(multiplyMatrices(B, A))
			)

			const trABC = traceBigIntIterative(
				multiplyMatrices(multiplyMatrices(A, B), C)
			)
			const trBCA = traceBigIntIterative(
				multiplyMatrices(multiplyMatrices(B, C), A)
			)
			const trCAB = traceBigIntIterative(
				multiplyMatrices(multiplyMatrices(C, A), B)
			)
			assert.strictEqual(trABC, trBCA)
			assert.strictEqual(trBCA, trCAB)
		})

		test('similarity invariance: tr(P * A * P^-1) === tr(A) for unimodular P', () => {
			// Upper unitriangular matrix P with det(P) = 1 and exact integer inverse PInv
			const P = [
				[1n, 2n, -3n],
				[0n, 1n, 4n],
				[0n, 0n, 1n]
			]
			const PInv = [
				[1n, -2n, 11n],
				[0n, 1n, -4n],
				[0n, 0n, 1n]
			]
			// Sanity check P * PInv = I
			assert.deepStrictEqual(multiplyMatrices(P, PInv), [
				[1n, 0n, 0n],
				[0n, 1n, 0n],
				[0n, 0n, 1n]
			])

			const similar = multiplyMatrices(multiplyMatrices(P, A), PInv)
			assert.strictEqual(
				traceBigIntIterative(similar),
				traceBigIntIterative(A)
			)
		})
	})
})
