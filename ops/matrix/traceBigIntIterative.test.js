import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { traceBigIntIterative } from './traceBigIntIterative.js'

/**
 * Helper: multiply two BigInt matrices (m x k) and (k x p).
 */
function matMul(A, B) {
	const m = A.length
	const k = B.length
	const p = B[0].length
	const C = Array.from({ length: m }, () => Array(p).fill(0n))
	for (let i = 0; i < m; i += 1) {
		for (let j = 0; j < p; j += 1) {
			let sum = 0n
			for (let t = 0; t < k; t += 1) {
				sum += A[i][t] * B[t][j]
			}
			C[i][j] = sum
		}
	}
	return C
}

/**
 * Helper: transpose a BigInt matrix.
 */
function transpose(A) {
	const rows = A.length
	const cols = A[0].length
	return Array.from({ length: cols }, (_, j) =>
		Array.from({ length: rows }, (_, i) => A[i][j])
	)
}

describe('traceBigIntIterative', () => {
	describe('normal cases', () => {
		it('computes trace of 1x1 matrices', () => {
			assert.equal(traceBigIntIterative([[42n]]), 42n)
			assert.equal(traceBigIntIterative([[-7n]]), -7n)
			assert.equal(traceBigIntIterative([[0n]]), 0n)
		})

		it('computes trace of 2x2 and 3x3 matrices', () => {
			assert.equal(
				traceBigIntIterative([
					[1n, 2n],
					[3n, 4n],
				]),
				5n
			)

			assert.equal(
				traceBigIntIterative([
					[1n, 2n, 3n],
					[4n, 5n, 6n],
					[7n, 8n, 9n],
				]),
				15n
			)
		})

		it('computes trace of a 4x4 matrix with mixed signs and zeros', () => {
			const matrix = [
				[-10n, 99n, 1n, 2n],
				[3n, 0n, 4n, 5n],
				[6n, 7n, 25n, 8n],
				[9n, 10n, 11n, -12n],
			]
			assert.equal(traceBigIntIterative(matrix), 3n)
		})
	})

	describe('edge cases', () => {
		it('returns 0n for an empty 0x0 matrix', () => {
			assert.equal(traceBigIntIterative([]), 0n)
		})

		it('returns 0n for zero matrices', () => {
			const zero3 = [
				[0n, 0n, 0n],
				[0n, 0n, 0n],
				[0n, 0n, 0n],
			]
			assert.equal(traceBigIntIterative(zero3), 0n)
		})

		it('returns n as BigInt for n x n identity matrices', () => {
			for (const n of [1, 2, 5, 10]) {
				const identity = Array.from({ length: n }, (_, i) =>
					Array.from({ length: n }, (_, j) => (i === j ? 1n : 0n))
				)
				assert.equal(traceBigIntIterative(identity), BigInt(n))
			}
		})

		it('handles exact cancellation of very large BigInt values beyond Number.MAX_SAFE_INTEGER', () => {
			const huge = 10n ** 60n
			const matrix = [
				[huge + 123456789012345678901n, 7n, 8n],
				[9n, -huge, 10n],
				[11n, 12n, -123456789012345678900n],
			]
			assert.equal(traceBigIntIterative(matrix), 1n)
		})

		it('preserves fixed-point 10^18 scaling exactly', () => {
			const SCALE = 10n ** 18n
			// Diagonal values representing 1.5, -0.25, and 2.75 scaled by 10^18 -> sum = 4.0 * 10^18
			const matrix = [
				[(15n * SCALE) / 10n, 3n * SCALE, -SCALE],
				[2n * SCALE, -(25n * SCALE) / 100n, 4n * SCALE],
				[0n, 5n * SCALE, (275n * SCALE) / 100n],
			]
			assert.equal(traceBigIntIterative(matrix), 4n * SCALE)
		})

		it('does not mutate the input matrix', () => {
			const matrix = [
				[10n, 20n],
				[30n, 40n],
			]
			const snapshot = matrix.map((row) => [...row])
			assert.equal(traceBigIntIterative(matrix), 50n)
			assert.deepEqual(matrix, snapshot)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when matrix is not an array', () => {
			for (const invalid of [null, undefined, 42, 42n, '[[1]]', {}, true]) {
				assert.throws(() => traceBigIntIterative(invalid), TypeError)
			}
		})

		it('throws TypeError when any row is not an array', () => {
			assert.throws(() => traceBigIntIterative([1n, 2n]), TypeError)
			assert.throws(() => traceBigIntIterative([[1n, 2n], null]), TypeError)
			assert.throws(() => traceBigIntIterative([[1n, 2n], 'bad']), TypeError)
		})

		it('throws RangeError for non-square or jagged matrices', () => {
			assert.throws(() => traceBigIntIterative([[]]), RangeError)
			assert.throws(() => traceBigIntIterative([[1n, 2n]]), RangeError)
			assert.throws(() => traceBigIntIterative([[1n], [2n]]), RangeError)
			assert.throws(
				() =>
					traceBigIntIterative([
						[1n, 2n, 3n],
						[4n, 5n, 6n],
					]),
				RangeError
			)
			assert.throws(
				() =>
					traceBigIntIterative([
						[1n, 2n],
						[3n],
					]),
				RangeError
			)
		})

		it('throws TypeError when any diagonal or off-diagonal entry is not a BigInt', () => {
			assert.throws(
				() =>
					traceBigIntIterative([
						[1, 2n],
						[3n, 4n],
					]),
				TypeError
			)
			assert.throws(
				() =>
					traceBigIntIterative([
						[1n, 2],
						[3n, 4n],
					]),
				TypeError
			)
			assert.throws(
				() =>
					traceBigIntIterative([
						[1n, 2n],
						['3', 4n],
					]),
				TypeError
			)
			assert.throws(
				() =>
					traceBigIntIterative([
						[1n, null],
						[3n, 4n],
					]),
				TypeError
			)
			assert.throws(
				() =>
					traceBigIntIterative([
						[1n, NaN],
						[3n, 4n],
					]),
				TypeError
			)

			const sparseRow = new Array(2)
			sparseRow[0] = 1n
			assert.throws(
				() => traceBigIntIterative([sparseRow, [3n, 4n]]),
				TypeError
			)
		})
	})

	describe('algebraic cross-checks', () => {
		it('satisfies linearity: tr(c*A + d*B) === c*tr(A) + d*tr(B)', () => {
			const A = [
				[2n, -5n, 7n],
				[11n, 13n, -17n],
				[19n, -23n, 29n],
			]
			const B = [
				[-3n, 4n, 8n],
				[-12n, 6n, 14n],
				[15n, 18n, -21n],
			]
			const c = 7n
			const d = -11n

			const combined = A.map((row, i) =>
				row.map((val, j) => c * val + d * B[i][j])
			)
			assert.equal(
				traceBigIntIterative(combined),
				c * traceBigIntIterative(A) + d * traceBigIntIterative(B)
			)
		})

		it('satisfies transpose invariance: tr(A^T) === tr(A)', () => {
			const A = [
				[4n, -9n, 12n],
				[3n, 8n, -1n],
				[7n, 2n, -6n],
			]
			assert.equal(
				traceBigIntIterative(transpose(A)),
				traceBigIntIterative(A)
			)
		})

		it('satisfies cyclic property: tr(P*Q) === tr(Q*P) for rectangular matrices', () => {
			const P = [
				[1n, -2n],
				[3n, 4n],
				[-5n, 6n],
			] // 3x2
			const Q = [
				[7n, -8n, 9n],
				[10n, 11n, -12n],
			] // 2x3

			const PQ = matMul(P, Q) // 3x3
			const QP = matMul(Q, P) // 2x2
			assert.equal(traceBigIntIterative(PQ), traceBigIntIterative(QP))
		})

		it('satisfies similarity invariance and equals sum of eigenvalues for S * D * S^-1', () => {
			// Unimodular matrix S = L * U with det(S) = 1 and exact integer inverse S^-1 = U^-1 * L^-1
			const L = [
				[1n, 0n, 0n],
				[2n, 1n, 0n],
				[-3n, 4n, 1n],
			]
			const Linv = [
				[1n, 0n, 0n],
				[-2n, 1n, 0n],
				[11n, -4n, 1n],
			]
			const U = [
				[1n, -1n, 3n],
				[0n, 1n, 2n],
				[0n, 0n, 1n],
			]
			const Uinv = [
				[1n, 1n, -5n],
				[0n, 1n, -2n],
				[0n, 0n, 1n],
			]

			const S = matMul(L, U)
			const Sinv = matMul(Uinv, Linv)

			// Verify S * S^-1 = I
			const I = matMul(S, Sinv)
			assert.deepEqual(I, [
				[1n, 0n, 0n],
				[0n, 1n, 0n],
				[0n, 0n, 1n],
			])

			const eigenvalues = [17n, -42n, 100000000000000000000n]
			const D = [
				[eigenvalues[0], 0n, 0n],
				[0n, eigenvalues[1], 0n],
				[0n, 0n, eigenvalues[2]],
			]
			const similar = matMul(matMul(S, D), Sinv)
			const expectedSum = eigenvalues.reduce((acc, v) => acc + v, 0n)

			assert.equal(traceBigIntIterative(similar), traceBigIntIterative(D))
			assert.equal(traceBigIntIterative(similar), expectedSum)
		})

		it('matches independent floating-point diagonal sum on small integer matrices', () => {
			const A = [
				[13n, -7n, 2n, 9n],
				[4n, -25n, 8n, 1n],
				[-6n, 3n, 41n, -5n],
				[11n, 0n, -14n, 19n],
			]
			let floatRef = 0
			for (let i = 0; i < A.length; i += 1) {
				floatRef += Number(A[i][i])
			}
			assert.equal(Number(traceBigIntIterative(A)), floatRef)
		})
	})
})
