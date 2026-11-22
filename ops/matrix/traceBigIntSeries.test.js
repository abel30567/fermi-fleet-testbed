import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { traceBigIntSeries } from './traceBigIntSeries.js'

function matMul(a, b) {
	const rows = a.length
	const inner = a[0].length
	const cols = b[0].length
	const out = Array.from({ length: rows }, () => Array(cols).fill(0n))
	for (let i = 0; i < rows; i++) {
		for (let k = 0; k < inner; k++) {
			const aik = a[i][k]
			for (let j = 0; j < cols; j++) {
				out[i][j] += aik * b[k][j]
			}
		}
	}
	return out
}

function matAdd(a, b) {
	return a.map((row, i) => row.map((v, j) => v + b[i][j]))
}

function matScale(c, a) {
	return a.map((row) => row.map((v) => c * v))
}

function matTranspose(a) {
	const n = a.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => a[j][i])
	)
}

function identityMatrix(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? 1n : 0n))
	)
}

function zeroMatrix(n) {
	return Array.from({ length: n }, () => Array(n).fill(0n))
}

describe('traceBigIntSeries', () => {
	describe('normal cases', () => {
		it('computes trace of a 1x1 matrix', () => {
			assert.equal(traceBigIntSeries([[42n]]), 42n)
		})

		it('computes trace of a 2x2 matrix', () => {
			const m = [
				[1n, 2n],
				[3n, 4n],
			]
			assert.equal(traceBigIntSeries(m), 5n)
		})

		it('computes trace of a 3x3 matrix', () => {
			const m = [
				[2n, -1n, 5n],
				[0n, 7n, 3n],
				[4n, 9n, -3n],
			]
			assert.equal(traceBigIntSeries(m), 6n)
		})

		it('computes trace of a 4x4 matrix', () => {
			const m = [
				[10n, 1n, 2n, 3n],
				[4n, 20n, 5n, 6n],
				[7n, 8n, 30n, 9n],
				[11n, 12n, 13n, 40n],
			]
			assert.equal(traceBigIntSeries(m), 100n)
		})

		it('does not mutate the input matrix', () => {
			const m = [
				[3n, 5n],
				[7n, 11n],
			]
			const snapshot = m.map((r) => [...r])
			assert.equal(traceBigIntSeries(m), 14n)
			assert.deepEqual(m, snapshot)
		})
	})

	describe('edge cases', () => {
		it('returns 0n for zero matrices', () => {
			assert.equal(traceBigIntSeries(zeroMatrix(1)), 0n)
			assert.equal(traceBigIntSeries(zeroMatrix(4)), 0n)
		})

		it('returns n as BigInt for n×n identity matrices', () => {
			assert.equal(traceBigIntSeries(identityMatrix(1)), 1n)
			assert.equal(traceBigIntSeries(identityMatrix(3)), 3n)
			assert.equal(traceBigIntSeries(identityMatrix(6)), 6n)
		})

		it('handles negative values and exact cancellation', () => {
			const allNeg = [
				[-5n, 100n, -2n],
				[3n, -10n, 4n],
				[9n, -8n, -15n],
			]
			assert.equal(traceBigIntSeries(allNeg), -30n)

			const traceless = [
				[123456789n, 999n, -777n],
				[1n, -100000000n, 2n],
				[3n, 4n, -23456789n],
			]
			assert.equal(traceBigIntSeries(traceless), 0n)
		})

		it('handles huge BigInts (> 2^100) without precision loss', () => {
			const a = (1n << 128n) + 12345678901234567890123456789n
			const b = (1n << 140n) - 98765432109876543210987654321n
			const c = -(1n << 128n) + 7n
			const m = [
				[a, 1n << 200n, -(1n << 150n)],
				[1n << 110n, b, 0n],
				[42n, -(1n << 180n), c],
			]
			const expected =
				(1n << 140n) +
				12345678901234567890123456789n -
				98765432109876543210987654321n +
				7n
			assert.equal(traceBigIntSeries(m), expected)
		})
	})

	describe('invalid inputs', () => {
		it('rejects non-array inputs', () => {
			for (const bad of [null, undefined, 0, 1n, 'matrix', {}, () => {}]) {
				assert.throws(() => traceBigIntSeries(bad), TypeError)
			}
		})

		it('rejects empty matrices', () => {
			assert.throws(() => traceBigIntSeries([]), RangeError)
			assert.throws(() => traceBigIntSeries([[]]), RangeError)
		})

		it('rejects non-array rows', () => {
			assert.throws(() => traceBigIntSeries([1n, 2n]), TypeError)
			assert.throws(() => traceBigIntSeries([[1n, 2n], null]), TypeError)
			assert.throws(() => traceBigIntSeries([[1n, 2n], { 0: 3n, 1: 4n }]), TypeError)
		})

		it('rejects non-square matrices', () => {
			assert.throws(() => traceBigIntSeries([[1n, 2n]]), RangeError)
			assert.throws(() => traceBigIntSeries([[1n], [2n]]), RangeError)
			assert.throws(
				() =>
					traceBigIntSeries([
						[1n, 2n, 3n],
						[4n, 5n, 6n],
					]),
				RangeError
			)
			assert.throws(
				() =>
					traceBigIntSeries([
						[1n, 2n],
						[3n, 4n],
						[5n, 6n],
					]),
				RangeError
			)
		})

		it('rejects ragged matrices', () => {
			assert.throws(() => traceBigIntSeries([[1n, 2n], [3n]]), RangeError)
			assert.throws(
				() =>
					traceBigIntSeries([
						[1n, 2n, 3n],
						[4n, 5n],
						[6n, 7n, 8n],
					]),
				RangeError
			)
		})

		it('rejects non-BigInt entries on or off the diagonal', () => {
			assert.throws(() => traceBigIntSeries([[1]]), TypeError)
			assert.throws(
				() =>
					traceBigIntSeries([
						[1n, 2n],
						[3n, 4],
					]),
				TypeError
			)
			// Off-diagonal non-BigInt entries must also be rejected
			assert.throws(
				() =>
					traceBigIntSeries([
						[1n, 2],
						[3n, 4n],
					]),
				TypeError
			)
			assert.throws(
				() =>
					traceBigIntSeries([
						[1n, '2'],
						[3n, 4n],
					]),
				TypeError
			)
			assert.throws(
				() =>
					traceBigIntSeries([
						[1n, null],
						[3n, 4n],
					]),
				TypeError
			)
			assert.throws(
				() =>
					traceBigIntSeries([
						[1n, undefined],
						[3n, 4n],
					]),
				TypeError
			)
			// Sparse array entry
			const sparseRow = new Array(2)
			sparseRow[0] = 1n
			assert.throws(() => traceBigIntSeries([sparseRow, [2n, 3n]]), TypeError)
		})
	})

	describe('algebraic cross-checks', () => {
		const A = [
			[3n, -2n, 5n],
			[1n, 4n, -7n],
			[6n, 0n, 2n],
		]
		const B = [
			[-1n, 8n, 2n],
			[3n, -5n, 4n],
			[7n, 1n, -6n],
		]
		const C = [
			[2n, 1n, -3n],
			[4n, -2n, 5n],
			[-1n, 6n, 3n],
		]

		it('satisfies linearity: tr(αA + βB) === α·tr(A) + β·tr(B)', () => {
			assert.equal(
				traceBigIntSeries(matAdd(A, B)),
				traceBigIntSeries(A) + traceBigIntSeries(B)
			)

			const alpha = 17n
			const beta = -29n
			const combo = matAdd(matScale(alpha, A), matScale(beta, B))
			assert.equal(
				traceBigIntSeries(combo),
				alpha * traceBigIntSeries(A) + beta * traceBigIntSeries(B)
			)
		})

		it('satisfies transpose invariance: tr(A^T) === tr(A)', () => {
			assert.equal(traceBigIntSeries(matTranspose(A)), traceBigIntSeries(A))
			assert.equal(traceBigIntSeries(matTranspose(B)), traceBigIntSeries(B))
		})

		it('satisfies cyclic property: tr(AB) === tr(BA) and tr(ABC) === tr(BCA) === tr(CAB)', () => {
			assert.equal(
				traceBigIntSeries(matMul(A, B)),
				traceBigIntSeries(matMul(B, A))
			)

			// Also verify cyclic property for rectangular R (2x3) and S (3x2)
			const R = [
				[1n << 105n, -3n, 7n],
				[4n, 1n << 102n, -9n],
			]
			const S = [
				[5n, -2n],
				[6n, 1n << 101n],
				[-8n, 11n],
			]
			assert.equal(
				traceBigIntSeries(matMul(R, S)),
				traceBigIntSeries(matMul(S, R))
			)

			const trABC = traceBigIntSeries(matMul(matMul(A, B), C))
			const trBCA = traceBigIntSeries(matMul(matMul(B, C), A))
			const trCAB = traceBigIntSeries(matMul(matMul(C, A), B))
			assert.equal(trABC, trBCA)
			assert.equal(trBCA, trCAB)
		})

		it('satisfies similarity invariance: tr(P A P^-1) === tr(A) for unimodular P', () => {
			// Upper-triangular unimodular P with exact integer inverse PInv
			const P = [
				[1n, 2n, 3n],
				[0n, 1n, 4n],
				[0n, 0n, 1n],
			]
			const PInv = [
				[1n, -2n, 5n],
				[0n, 1n, -4n],
				[0n, 0n, 1n],
			]
			assert.deepEqual(matMul(P, PInv), identityMatrix(3))
			const similar = matMul(matMul(P, A), PInv)
			assert.equal(traceBigIntSeries(similar), traceBigIntSeries(A))
		})
	})
})
