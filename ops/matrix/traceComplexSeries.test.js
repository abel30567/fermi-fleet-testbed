import { describe, it } from 'node:test'
import assert from 'node:assert'
import { traceComplexSeries } from './traceComplexSeries.js'

const c = (re, im = 0) => ({ re, im })

const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im })
const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im })
const cMul = (a, b) => ({
	re: a.re * b.re - a.im * b.im,
	im: a.re * b.im + a.im * b.re,
})
const cConj = (a) => ({ re: a.re, im: -a.im })

/**
 * Principal square root of a complex number z = x + iy.
 */
function cSqrt(z) {
	const r = Math.hypot(z.re, z.im)
	const re = Math.sqrt(Math.max(0, (r + z.re) / 2))
	const imMag = Math.sqrt(Math.max(0, (r - z.re) / 2))
	const im = z.im < 0 ? -imMag : imMag
	return { re, im }
}

/**
 * Independent dense complex matrix multiplication A * B.
 */
function matMul(A, B) {
	const n = A.length
	const out = Array.from({ length: n }, () => Array(n))
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let acc = c(0, 0)
			for (let k = 0; k < n; k++) {
				acc = cAdd(acc, cMul(A[i][k], B[k][j]))
			}
			out[i][j] = acc
		}
	}
	return out
}

/**
 * Independent linear combination a*A + b*B.
 */
function matLinearComb(a, A, b, B) {
	const n = A.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => cAdd(cMul(a, A[i][j]), cMul(b, B[i][j])))
	)
}

/**
 * Independent conjugate transpose A^H.
 */
function matConjTranspose(A) {
	const n = A.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => cConj(A[j][i]))
	)
}

function assertComplexClose(actual, expected, eps = 1e-12) {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`real part mismatch: expected ${expected.re}, got ${actual.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`imag part mismatch: expected ${expected.im}, got ${actual.im}`
	)
}

describe('traceComplexSeries', () => {
	describe('normal cases', () => {
		it('computes trace of a 1x1 complex matrix', () => {
			const result = traceComplexSeries([[c(3.5, -2.25)]])
			assert.deepStrictEqual(result, { re: 3.5, im: -2.25 })
		})

		it('computes trace of a 2x2 complex matrix', () => {
			const A = [
				[c(1, 2), c(99, -50)],
				[c(-10, 7), c(4, -6)],
			]
			const result = traceComplexSeries(A)
			assert.deepStrictEqual(result, { re: 5, im: -4 })
		})

		it('computes trace of a 3x3 complex matrix', () => {
			const A = [
				[c(1.5, 0.5), c(2, -3), c(0, 4)],
				[c(-1, 2), c(-4.25, 3.75), c(5, 1)],
				[c(8, -2), c(0, 0), c(2.75, -1.25)],
			]
			const result = traceComplexSeries(A)
			assertComplexClose(result, { re: 0, im: 3 })
		})
	})

	describe('edge cases', () => {
		it('returns { re: 0, im: 0 } for zero matrices', () => {
			const zero1 = [[c(0, 0)]]
			const zero3 = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => c(0, 0)))
			assert.deepStrictEqual(traceComplexSeries(zero1), { re: 0, im: 0 })
			assert.deepStrictEqual(traceComplexSeries(zero3), { re: 0, im: 0 })
		})

		it('normalizes negative zero to positive zero', () => {
			const result = traceComplexSeries([[c(-0, -0)]])
			assert.ok(Object.is(result.re, 0))
			assert.ok(Object.is(result.im, 0))
		})

		it('returns { re: n, im: 0 } for n x n identity matrix', () => {
			const n = 4
			const I = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => (i === j ? c(1, 0) : c(0, 0)))
			)
			assert.deepStrictEqual(traceComplexSeries(I), { re: 4, im: 0 })
		})

		it('returns pure imaginary trace for anti-Hermitian matrix (A^H = -A)', () => {
			const antiHermitian = [
				[c(0, 3), c(2, 5), c(-1, 4)],
				[c(-2, 5), c(0, -7), c(6, -2)],
				[c(1, 4), c(-6, -2), c(0, 1.5)],
			]
			const result = traceComplexSeries(antiHermitian)
			assert.strictEqual(result.re, 0)
			assertComplexClose(result, { re: 0, im: -2.5 })
		})

		it('returns pure real trace for Hermitian matrix (A^H = A)', () => {
			const hermitian = [
				[c(2.5, 0), c(1, -4)],
				[c(1, 4), c(-1.25, 0)],
			]
			const result = traceComplexSeries(hermitian)
			assert.strictEqual(result.im, 0)
			assertComplexClose(result, { re: 1.25, im: 0 })
		})

		it('preserves precision under compensated summation with large cancellation', () => {
			const A = [
				[c(1, 1), c(0, 0), c(0, 0), c(0, 0)],
				[c(0, 0), c(1e16, -1e16), c(0, 0), c(0, 0)],
				[c(0, 0), c(0, 0), c(1, 2), c(0, 0)],
				[c(0, 0), c(0, 0), c(0, 0), c(-1e16, 1e16)],
			]
			const result = traceComplexSeries(A)
			assert.deepStrictEqual(result, { re: 2, im: 3 })
		})
	})

	describe('input validation', () => {
		it('throws on non-array or empty inputs', () => {
			assert.throws(() => traceComplexSeries(null), TypeError)
			assert.throws(() => traceComplexSeries(undefined), TypeError)
			assert.throws(() => traceComplexSeries(42), TypeError)
			assert.throws(() => traceComplexSeries({ re: 1, im: 0 }), TypeError)
			assert.throws(() => traceComplexSeries([]), RangeError)
			assert.throws(() => traceComplexSeries([[]]), RangeError)
		})

		it('throws on non-square and ragged matrices', () => {
			const rect2x3 = [
				[c(1, 0), c(2, 0), c(3, 0)],
				[c(4, 0), c(5, 0), c(6, 0)],
			]
			const rect3x2 = [
				[c(1, 0), c(2, 0)],
				[c(3, 0), c(4, 0)],
				[c(5, 0), c(6, 0)],
			]
			const ragged = [
				[c(1, 0), c(2, 0)],
				[c(3, 0)],
			]
			assert.throws(() => traceComplexSeries(rect2x3), RangeError)
			assert.throws(() => traceComplexSeries(rect3x2), RangeError)
			assert.throws(() => traceComplexSeries(ragged), RangeError)
			assert.throws(() => traceComplexSeries([c(1, 0)]), TypeError)
		})

		it('validates all elements including off-diagonal entries', () => {
			assert.throws(
				() =>
					traceComplexSeries([
						[c(1, 0), null],
						[c(0, 0), c(2, 0)],
					]),
				TypeError
			)
			assert.throws(
				() =>
					traceComplexSeries([
						[c(1, 0), { re: 1 }],
						[c(0, 0), c(2, 0)],
					]),
				TypeError
			)
			assert.throws(
				() =>
					traceComplexSeries([
						[c(1, 0), { re: '1', im: 0 }],
						[c(0, 0), c(2, 0)],
					]),
				TypeError
			)
			assert.throws(
				() =>
					traceComplexSeries([
						[c(1, 0), c(NaN, 0)],
						[c(0, 0), c(2, 0)],
					]),
				RangeError
			)
			assert.throws(
				() =>
					traceComplexSeries([
						[c(1, 0), c(0, Infinity)],
						[c(0, 0), c(2, 0)],
					]),
				RangeError
			)
			assert.throws(
				() =>
					traceComplexSeries([
						[c(-Infinity, 0), c(0, 0)],
						[c(0, 0), c(2, 0)],
					]),
				RangeError
			)
		})

		it('throws RangeError if trace sum overflows finite IEEE-754 bounds', () => {
			assert.throws(
				() =>
					traceComplexSeries([
						[c(Number.MAX_VALUE, 0), c(0, 0)],
						[c(0, 0), c(Number.MAX_VALUE, 0)],
					]),
				RangeError
			)
		})
	})

	describe('independent cross-checks', () => {
		const A = [
			[c(2, -1), c(0.5, 3), c(-4, 2)],
			[c(1, 1.5), c(-3, 2.5), c(0, -1)],
			[c(2.5, -0.5), c(-1, 4), c(1.25, -3.75)],
		]
		const B = [
			[c(-1, 2), c(3, -1), c(0.5, 0.5)],
			[c(4, 0), c(1.5, -2.5), c(-2, 3)],
			[c(0, -3), c(2, 1), c(-0.75, 4.25)],
		]

		it('satisfies cyclic invariance tr(AB) == tr(BA)', () => {
			const trAB = traceComplexSeries(matMul(A, B))
			const trBA = traceComplexSeries(matMul(B, A))
			assertComplexClose(trAB, trBA, 1e-11)
		})

		it('satisfies linearity tr(aA + bB) == a*tr(A) + b*tr(B)', () => {
			const alpha = c(2.5, -1.25)
			const beta = c(-0.75, 3.5)
			const lhs = traceComplexSeries(matLinearComb(alpha, A, beta, B))
			const rhs = cAdd(
				cMul(alpha, traceComplexSeries(A)),
				cMul(beta, traceComplexSeries(B))
			)
			assertComplexClose(lhs, rhs, 1e-11)
		})

		it('equals the sum of independently solved eigenvalues for a 2x2 complex matrix', () => {
			const M = [
				[c(3, -2), c(1, 4)],
				[c(-2, 0.5), c(-1.5, 5.25)],
			]
			// Characteristic polynomial: lambda^2 - s*lambda + det = 0
			// Solve via quadratic formula using independent off-diagonal determinant terms
			const a = M[0][0]
			const b = M[0][1]
			const d = M[1][0]
			const e = M[1][1]
			const s = cAdd(a, e)
			const det = cSub(cMul(a, e), cMul(b, d))
			// Discriminant = s^2 - 4*det
			const disc = cSub(cMul(s, s), cMul(c(4, 0), det))
			const root = cSqrt(disc)
			const half = c(0.5, 0)
			const lambda1 = cMul(cAdd(s, root), half)
			const lambda2 = cMul(cSub(s, root), half)

			// Verify both eigenvalues satisfy det(M - lambda*I) == 0 independently
			for (const lam of [lambda1, lambda2]) {
				const residual = cSub(
					cMul(cSub(a, lam), cSub(e, lam)),
					cMul(b, d)
				)
				assertComplexClose(residual, c(0, 0), 1e-11)
			}

			const eigSum = cAdd(lambda1, lambda2)
			const trM = traceComplexSeries(M)
			assertComplexClose(trM, eigSum, 1e-12)
		})

		it('satisfies conjugate transpose identity tr(A^H) == conj(tr(A))', () => {
			const trAH = traceComplexSeries(matConjTranspose(A))
			const conjTrA = cConj(traceComplexSeries(A))
			assertComplexClose(trAH, conjTrA, 1e-12)
		})
	})
})
