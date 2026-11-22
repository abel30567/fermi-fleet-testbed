import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { traceComplexRecursive } from './traceComplexRecursive.js'

const c = (re, im = 0) => ({ re, im })

function assertComplexClose(actual, expected, eps = 1e-12) {
	assert.equal(typeof actual, 'object')
	assert.notEqual(actual, null)
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`Expected re ${actual.re} to be within ${eps} of ${expected.re}`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`Expected im ${actual.im} to be within ${eps} of ${expected.im}`,
	)
	assert.ok(!Object.is(actual.re, -0), 'Expected re not to be -0')
	assert.ok(!Object.is(actual.im, -0), 'Expected im not to be -0')
}

function mulComplex(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function addComplex(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function iterativeTraceReference(matrix) {
	let re = 0
	let im = 0
	for (let i = 0; i < matrix.length; i++) {
		re += matrix[i][i].re
		im += matrix[i][i].im
	}
	return { re: re === 0 ? 0 : re, im: im === 0 ? 0 : im }
}

function matMulComplex(A, B) {
	const n = A.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => {
			let sum = c(0, 0)
			for (let k = 0; k < n; k++) {
				sum = addComplex(sum, mulComplex(A[i][k], B[k][j]))
			}
			return sum
		}),
	)
}

function linearCombComplex(alpha, A, beta, B) {
	const n = A.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) =>
			addComplex(mulComplex(alpha, A[i][j]), mulComplex(beta, B[i][j])),
		),
	)
}

function transposeComplex(A) {
	const n = A.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => ({ re: A[j][i].re, im: A[j][i].im })),
	)
}

function conjugateTransposeComplex(A) {
	const n = A.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => ({ re: A[j][i].re, im: -A[j][i].im })),
	)
}

function makeDeterministicMatrix(n, seed = 1) {
	let state = seed >>> 0
	const next = () => {
		state = (1664525 * state + 1013904223) >>> 0
		return (state / 0xffffffff) * 20 - 10
	}
	return Array.from({ length: n }, () =>
		Array.from({ length: n }, () => c(Math.round(next() * 4) / 4, Math.round(next() * 4) / 4)),
	)
}

describe('traceComplexRecursive', () => {
	describe('normal cases', () => {
		it('computes the trace of a 2x2 complex matrix', () => {
			const A = [
				[c(1, 2), c(3, -4)],
				[c(5, 6), c(-7, 8)],
			]
			assert.deepEqual(traceComplexRecursive(A), { re: -6, im: 10 })
		})

		it('computes the trace of an odd-sized 3x3 complex matrix', () => {
			const A = [
				[c(2, -1), c(9, 9), c(-3, 4)],
				[c(0, 5), c(-4, 3.5), c(1, 1)],
				[c(7, -2), c(8, 0), c(5.5, 2.5)],
			]
			assert.deepEqual(traceComplexRecursive(A), { re: 3.5, im: 5 })
		})

		it('computes the trace of a power-of-two 4x4 complex matrix', () => {
			const A = [
				[c(1, 1), c(0, 0), c(0, 0), c(0, 0)],
				[c(2, -3), c(2, -2), c(4, 5), c(-1, 0)],
				[c(0, 1), c(3, 3), c(3, 4), c(2, 2)],
				[c(5, 6), c(-2, 1), c(0, -1), c(-6, -3)],
			]
			assert.deepEqual(traceComplexRecursive(A), { re: 0, im: 0 })
		})

		it('handles pure real and pure imaginary matrices', () => {
			const pureReal = [
				[c(4, 0), c(-1, 0)],
				[c(2, 0), c(7, 0)],
			]
			assert.deepEqual(traceComplexRecursive(pureReal), { re: 11, im: 0 })

			const pureImag = [
				[c(0, 3), c(0, 9)],
				[c(0, -2), c(0, -8)],
			]
			assert.deepEqual(traceComplexRecursive(pureImag), { re: 0, im: -5 })
		})

		it('does not mutate the input matrix and returns a fresh object', () => {
			const entry = c(4, -5)
			const A = [[entry]]
			const result = traceComplexRecursive(A)
			assert.deepEqual(result, { re: 4, im: -5 })
			assert.notEqual(result, entry)
			result.re = 999
			assert.equal(A[0][0].re, 4)
		})
	})

	describe('edge cases', () => {
		it('returns { re: 0, im: 0 } for an empty 0x0 matrix', () => {
			const result = traceComplexRecursive([])
			assert.deepEqual(result, { re: 0, im: 0 })
			assert.ok(Object.is(result.re, 0))
			assert.ok(Object.is(result.im, 0))
		})

		it('handles a 1x1 matrix', () => {
			const result = traceComplexRecursive([[c(-3.5, 2.25)]])
			assert.deepEqual(result, { re: -3.5, im: 2.25 })
		})

		it('normalizes -0 to +0 in both single-element and summed results', () => {
			const single = traceComplexRecursive([[c(-0, -0)]])
			assert.ok(Object.is(single.re, 0))
			assert.ok(Object.is(single.im, 0))

			const summed = traceComplexRecursive([
				[c(-0, -0), c(1, 1)],
				[c(2, 2), c(-0, -0)],
			])
			assert.ok(Object.is(summed.re, 0))
			assert.ok(Object.is(summed.im, 0))
		})

		it('handles boundary subnormal and large finite values', () => {
			const tiny = [
				[c(Number.MIN_VALUE, -Number.MIN_VALUE), c(0, 0)],
				[c(0, 0), c(Number.MIN_VALUE, Number.MIN_VALUE)],
			]
			const tinyResult = traceComplexRecursive(tiny)
			assert.equal(tinyResult.re, 2 * Number.MIN_VALUE)
			assert.ok(Object.is(tinyResult.im, 0))

			const halfMax = Number.MAX_VALUE / 4
			const largeFinite = [
				[c(halfMax, -halfMax), c(0, 0)],
				[c(0, 0), c(halfMax, -halfMax)],
			]
			assert.deepEqual(traceComplexRecursive(largeFinite), {
				re: Number.MAX_VALUE / 2,
				im: -Number.MAX_VALUE / 2,
			})

			const pairwiseCancelling = [
				[c(1e300, -1e300), c(0, 0), c(0, 0), c(0, 0)],
				[c(0, 0), c(-1e300, 1e300), c(0, 0), c(0, 0)],
				[c(0, 0), c(0, 0), c(42, -17), c(0, 0)],
				[c(0, 0), c(0, 0), c(0, 0), c(0, 0)],
			]
			assert.deepEqual(traceComplexRecursive(pairwiseCancelling), { re: 42, im: -17 })
		})

		it('handles large odd and even square matrices without stack issues', () => {
			const n = 257
			const A = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => (i === j ? c(1, -2) : c(0, 0))),
			)
			assert.deepEqual(traceComplexRecursive(A), { re: 257, im: -514 })
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-array matrix inputs', () => {
			for (const bad of [null, undefined, 123, '[[1]]', {}, c(1, 2)]) {
				assert.throws(() => traceComplexRecursive(bad), TypeError)
			}
		})

		it('throws TypeError when any row is not an array or matrix is sparse', () => {
			assert.throws(() => traceComplexRecursive([null]), TypeError)
			assert.throws(() => traceComplexRecursive([c(1, 0)]), TypeError)
			assert.throws(() => traceComplexRecursive([[c(1, 0), c(0, 0)], 'bad']), TypeError)
			assert.throws(() => traceComplexRecursive(new Array(2)), TypeError)
		})

		it('throws RangeError for non-square or ragged matrices', () => {
			assert.throws(() => traceComplexRecursive([[]]), RangeError)
			assert.throws(
				() =>
					traceComplexRecursive([
						[c(1, 0), c(2, 0), c(3, 0)],
						[c(4, 0), c(5, 0), c(6, 0)],
					]),
				RangeError,
			)
			assert.throws(
				() => traceComplexRecursive([[c(1, 0)], [c(2, 0)]]),
				RangeError,
			)
			assert.throws(
				() => traceComplexRecursive([[c(1, 0), c(2, 0)], [c(3, 0)]]),
				RangeError,
			)
		})

		it('throws TypeError for invalid complex entry structures on or off diagonal', () => {
			const invalidEntries = [
				null,
				undefined,
				5,
				'1+2i',
				[1, 2],
				{},
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 0 },
				{ re: 1, im: null },
			]
			for (const bad of invalidEntries) {
				assert.throws(() => traceComplexRecursive([[bad]]), TypeError)
				assert.throws(
					() =>
						traceComplexRecursive([
							[c(1, 0), bad],
							[c(0, 0), c(2, 0)],
						]),
					TypeError,
				)
			}
		})

		it('throws RangeError for non-finite complex components on or off diagonal', () => {
			const nonFiniteEntries = [
				c(NaN, 0),
				c(0, NaN),
				c(Infinity, 0),
				c(0, -Infinity),
			]
			for (const bad of nonFiniteEntries) {
				assert.throws(() => traceComplexRecursive([[bad]]), RangeError)
				assert.throws(
					() =>
						traceComplexRecursive([
							[c(1, 0), c(0, 0)],
							[bad, c(2, 0)],
						]),
					RangeError,
				)
			}
		})
	})

	describe('cross-checks against independent computations and identities', () => {
		it('matches an independent iterative reference across various matrix dimensions', () => {
			for (const n of [0, 1, 2, 3, 4, 5, 7, 8, 15, 16, 31, 64]) {
				const A = makeDeterministicMatrix(n, 100 + n)
				const expected = iterativeTraceReference(A)
				const actual = traceComplexRecursive(A)
				assertComplexClose(actual, expected, 1e-12)
			}
		})

		it('matches closed-form analytical formula for arithmetic progression diagonals', () => {
			const n = 50
			const A = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) =>
					i === j ? c(i + 1, 2 * i - 1) : c(i - j, i + j),
				),
			)
			const expected = {
				re: (n * (n + 1)) / 2,
				im: n * (n - 2),
			}
			assert.deepEqual(traceComplexRecursive(A), expected)
		})

		it('satisfies linearity: tr(alpha*A + beta*B) = alpha*tr(A) + beta*tr(B)', () => {
			const A = makeDeterministicMatrix(9, 7)
			const B = makeDeterministicMatrix(9, 13)
			const alpha = c(2.5, -1.5)
			const beta = c(-0.75, 3.25)

			const lhs = traceComplexRecursive(linearCombComplex(alpha, A, beta, B))
			const rhs = addComplex(
				mulComplex(alpha, traceComplexRecursive(A)),
				mulComplex(beta, traceComplexRecursive(B)),
			)
			assertComplexClose(lhs, rhs, 1e-10)
		})

		it('satisfies product cyclicity: tr(A*B) = tr(B*A)', () => {
			const A = makeDeterministicMatrix(7, 42)
			const B = makeDeterministicMatrix(7, 99)

			const trAB = traceComplexRecursive(matMulComplex(A, B))
			const trBA = traceComplexRecursive(matMulComplex(B, A))
			assertComplexClose(trAB, trBA, 1e-9)
		})

		it('satisfies transpose and Hermitian adjoint identities: tr(A^T) = tr(A), tr(A*) = conj(tr(A))', () => {
			const A = makeDeterministicMatrix(11, 2026)
			const trA = traceComplexRecursive(A)
			const trAT = traceComplexRecursive(transposeComplex(A))
			const trAH = traceComplexRecursive(conjugateTransposeComplex(A))

			assertComplexClose(trAT, trA, 1e-12)
			assertComplexClose(trAH, { re: trA.re, im: -trA.im }, 1e-12)
		})
	})
})
