import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { traceComplexIterative } from './traceComplexIterative.js'

const c = (re, im = 0) => ({ re, im })

function assertComplexClose(actual, expected, eps = 1e-12) {
	assert.equal(typeof actual, 'object')
	assert.ok(actual !== null)
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`real part mismatch: expected ${expected.re}, got ${actual.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`imag part mismatch: expected ${expected.im}, got ${actual.im}`
	)
}

function complexAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function complexConj(a) {
	return { re: a.re, im: -a.im }
}

function matMulComplex(A, B) {
	const n = A.length
	const out = Array.from({ length: n }, () =>
		Array.from({ length: n }, () => c(0, 0))
	)
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let sum = c(0, 0)
			for (let k = 0; k < n; k++) {
				sum = complexAdd(sum, complexMul(A[i][k], B[k][j]))
			}
			out[i][j] = sum
		}
	}
	return out
}

function matScaleAddComplex(alpha, A, beta, B) {
	const n = A.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) =>
			complexAdd(complexMul(alpha, A[i][j]), complexMul(beta, B[i][j]))
		)
	)
}

function conjugateTranspose(A) {
	const n = A.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => complexConj(A[j][i]))
	)
}

describe('traceComplexIterative', () => {
	test('computes trace of a 2x2 complex matrix', () => {
		const m = [
			[c(1, 2), c(3, -4)],
			[c(5, 6), c(-7, 8)],
		]
		assert.deepStrictEqual(traceComplexIterative(m), { re: -6, im: 10 })
	})

	test('computes trace of a 3x3 complex matrix', () => {
		const m = [
			[c(2, -1), c(9, 9), c(0, 4)],
			[c(-3, 2), c(4, 5), c(1, -1)],
			[c(7, 0), c(-2, 3), c(-6, -4)],
		]
		assert.deepStrictEqual(traceComplexIterative(m), { re: 0, im: 0 })
	})

	test('handles 1x1 matrix and returns a fresh object without aliasing input', () => {
		const entry = c(3.5, -2.25)
		const m = [[entry]]
		const result = traceComplexIterative(m)
		assert.deepStrictEqual(result, { re: 3.5, im: -2.25 })
		assert.notStrictEqual(result, entry)
		result.re = 999
		assert.equal(entry.re, 3.5)
	})

	test('handles empty 0x0 matrix', () => {
		assert.deepStrictEqual(traceComplexIterative([]), { re: 0, im: 0 })
	})

	test('handles purely real and purely imaginary matrices', () => {
		const realMat = [
			[c(1.5, 0), c(2, 0)],
			[c(3, 0), c(4.5, 0)],
		]
		assert.deepStrictEqual(traceComplexIterative(realMat), { re: 6, im: 0 })

		const imagMat = [
			[c(0, -3), c(0, 10)],
			[c(0, -7), c(0, 8)],
		]
		assert.deepStrictEqual(traceComplexIterative(imagMat), { re: 0, im: 5 })
	})

	test('normalizes negative zero results to +0', () => {
		const m = [
			[c(-0, -0), c(1, 1)],
			[c(2, 2), c(-0, -0)],
		]
		const result = traceComplexIterative(m)
		assert.ok(Object.is(result.re, 0))
		assert.ok(Object.is(result.im, 0))
	})

	test('computes trace of larger diagonal matrix accurately', () => {
		const n = 50
		const m = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) =>
				i === j ? c(i + 1, -(2 * i + 1)) : c(i * j, i - j)
			)
		)
		// sum_{k=1..50} k = 1275; sum_{i=0..49} -(2i+1) = -50^2 = -2500
		assert.deepStrictEqual(traceComplexIterative(m), { re: 1275, im: -2500 })
	})

	test('rejects invalid matrix containers and non-square matrices', () => {
		for (const bad of [null, undefined, 42, 'matrix', {}, true]) {
			assert.throws(() => traceComplexIterative(bad), TypeError)
		}
		assert.throws(() => traceComplexIterative([null]), TypeError)
		assert.throws(() => traceComplexIterative(['not-a-row']), TypeError)
		assert.throws(() => traceComplexIterative([[]]), RangeError)
		assert.throws(
			() => traceComplexIterative([[c(1, 0), c(2, 0)]]),
			RangeError
		)
		assert.throws(
			() => traceComplexIterative([[c(1, 0)], [c(2, 0)]]),
			RangeError
		)
		// Ragged matrix
		assert.throws(
			() =>
				traceComplexIterative([
					[c(1, 0), c(2, 0)],
					[c(3, 0)],
				]),
			RangeError
		)
	})

	test('rejects invalid complex entries (on and off the main diagonal)', () => {
		// Non-object entry
		assert.throws(() => traceComplexIterative([[1]]), TypeError)
		assert.throws(() => traceComplexIterative([[null]]), TypeError)
		assert.throws(() => traceComplexIterative([[[]]]), TypeError)

		// Missing or non-numeric re/im
		assert.throws(() => traceComplexIterative([[{ re: 1 }]]), TypeError)
		assert.throws(() => traceComplexIterative([[{ im: 2 }]]), TypeError)
		assert.throws(
			() => traceComplexIterative([[{ re: '1', im: 0 }]]),
			TypeError
		)
		assert.throws(
			() => traceComplexIterative([[{ re: 1, im: null }]]),
			TypeError
		)

		// Sparse array hole
		const sparseRow = new Array(1)
		assert.throws(() => traceComplexIterative([sparseRow]), TypeError)

		// Non-finite numbers on diagonal
		assert.throws(
			() => traceComplexIterative([[c(NaN, 0)]]),
			RangeError
		)
		assert.throws(
			() => traceComplexIterative([[c(0, Infinity)]]),
			RangeError
		)
		assert.throws(
			() => traceComplexIterative([[c(-Infinity, 1)]]),
			RangeError
		)

		// Invalid off-diagonal entry must still be caught
		assert.throws(
			() =>
				traceComplexIterative([
					[c(1, 2), { re: 0, im: NaN }],
					[c(3, 4), c(5, 6)],
				]),
			RangeError
		)
		assert.throws(
			() =>
				traceComplexIterative([
					[c(1, 2), c(3, 4)],
					['bad', c(5, 6)],
				]),
			TypeError
		)
	})

	test('independent cross-check: algebraic trace identities (linearity, cyclic invariance, adjoint)', () => {
		const A = [
			[c(1.2, -0.5), c(2.5, 1.3), c(-0.7, 3.1)],
			[c(0.4, 2.2), c(-1.8, 0.9), c(4.0, -1.5)],
			[c(3.3, -2.1), c(-0.6, -0.8), c(2.7, 1.4)],
		]
		const B = [
			[c(-2.0, 1.1), c(0.5, -3.2), c(1.9, 0.4)],
			[c(3.1, -0.9), c(1.4, 2.6), c(-2.3, 1.7)],
			[c(-0.8, 1.5), c(2.2, -1.1), c(0.3, -2.9)],
		]
		const alpha = c(2.5, -1.5)
		const beta = c(-0.75, 3.25)

		// Linearity: tr(alpha*A + beta*B) = alpha*tr(A) + beta*tr(B)
		const lhsLin = traceComplexIterative(matScaleAddComplex(alpha, A, beta, B))
		const rhsLin = complexAdd(
			complexMul(alpha, traceComplexIterative(A)),
			complexMul(beta, traceComplexIterative(B))
		)
		assertComplexClose(lhsLin, rhsLin)

		// Cyclic invariance: tr(A*B) = tr(B*A)
		const trAB = traceComplexIterative(matMulComplex(A, B))
		const trBA = traceComplexIterative(matMulComplex(B, A))
		assertComplexClose(trAB, trBA)

		// Adjoint: tr(A^H) = conj(tr(A))
		const trAH = traceComplexIterative(conjugateTranspose(A))
		const conjTrA = complexConj(traceComplexIterative(A))
		assertComplexClose(trAH, conjTrA)
	})

	test('independent cross-check: real 2n x 2n block-matrix isomorphism', () => {
		// Embed C^{n x n} -> R^{2n x 2n} via a+bi |-> [[a, -b], [b, a]].
		// Then tr_R(Phi(A)) = 2 * Re(tr_C(A)) and tr_R(Phi(-i*A)) = 2 * Im(tr_C(A)).
		const A = [
			[c(3.25, -4.5), c(1.1, 2.2), c(-0.5, 0.75)],
			[c(2.0, -1.0), c(-1.75, 6.25), c(3.4, -2.1)],
			[c(-4.2, 1.8), c(0.9, -3.3), c(5.5, 1.25)],
		]

		function realBlockTrace(M) {
			const n = M.length
			const realMat = Array.from({ length: 2 * n }, () =>
				new Array(2 * n).fill(0)
			)
			for (let i = 0; i < n; i++) {
				for (let j = 0; j < n; j++) {
					const { re, im } = M[i][j]
					realMat[2 * i][2 * j] = re
					realMat[2 * i][2 * j + 1] = -im
					realMat[2 * i + 1][2 * j] = im
					realMat[2 * i + 1][2 * j + 1] = re
				}
			}
			let sum = 0
			for (let k = 0; k < 2 * n; k++) {
				sum += realMat[k][k]
			}
			return sum
		}

		const minusIA = A.map((row) =>
			row.map((z) => complexMul(c(0, -1), z))
		)
		const tr = traceComplexIterative(A)
		const expectedFromRealEmbedding = {
			re: realBlockTrace(A) / 2,
			im: realBlockTrace(minusIA) / 2,
		}
		assertComplexClose(tr, expectedFromRealEmbedding)
	})
})
