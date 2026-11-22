import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { determinantComplexRecursive } from './determinantComplexRecursive.js'

const c = (re, im = 0) => ({ re, im })

function cAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function cSub(a, b) {
	return { re: a.re - b.re, im: a.im - b.im }
}

function cMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function cPow(z, n) {
	let res = c(1, 0)
	for (let i = 0; i < n; i++) {
		res = cMul(res, z)
	}
	return res
}

function matMul(A, B) {
	const n = A.length
	const out = Array.from({ length: n }, () => new Array(n))
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let sum = c(0, 0)
			for (let k = 0; k < n; k++) {
				sum = cAdd(sum, cMul(A[i][k], B[k][j]))
			}
			out[i][j] = sum
		}
	}
	return out
}

function assertComplexClose(actual, expected, tol = 1e-10) {
	assert.equal(typeof actual, 'object')
	assert.notEqual(actual, null)
	assert.equal(typeof actual.re, 'number')
	assert.equal(typeof actual.im, 'number')
	const errRe = Math.abs(actual.re - expected.re)
	const errIm = Math.abs(actual.im - expected.im)
	assert.ok(
		errRe <= tol && errIm <= tol,
		`Expected (${expected.re} + ${expected.im}i), got (${actual.re} + ${actual.im}i) (errRe=${errRe}, errIm=${errIm}, tol=${tol})`
	)
}

/**
 * Independent reference implementation via direct Laplace cofactor expansion
 * along the first row (exact for small matrices, no pivoting or division).
 */
function referenceLaplaceDet(M) {
	const n = M.length
	if (n === 0) return c(1, 0)
	if (n === 1) return M[0][0]
	if (n === 2) {
		return cSub(cMul(M[0][0], M[1][1]), cMul(M[0][1], M[1][0]))
	}
	let total = c(0, 0)
	for (let col = 0; col < n; col++) {
		const minor = []
		for (let r = 1; r < n; r++) {
			const row = []
			for (let k = 0; k < n; k++) {
				if (k !== col) row.push(M[r][k])
			}
			minor.push(row)
		}
		const term = cMul(M[0][col], referenceLaplaceDet(minor))
		total = col % 2 === 0 ? cAdd(total, term) : cSub(total, term)
	}
	return total
}

describe('determinantComplexRecursive', () => {
	describe('basic and normal cases', () => {
		it('computes determinant of 1x1 complex matrix', () => {
			const det = determinantComplexRecursive([[c(3, -4)]])
			assert.deepEqual(det, c(3, -4))
		})

		it('computes determinant of 2x2 complex matrix', () => {
			// (1+2i)(5-i) - (3-i)(2+4i) = (7+9i) - (10+10i) = -3 - i
			const M = [
				[c(1, 2), c(3, -1)],
				[c(2, 4), c(5, -1)],
			]
			assert.deepEqual(determinantComplexRecursive(M), c(-3, -1))
		})

		it('computes determinant of 3x3 complex matrix', () => {
			const M = [
				[c(1, 1), c(2, -1), c(0, 3)],
				[c(-1, 2), c(3, 0), c(1, -2)],
				[c(2, 1), c(-2, 3), c(4, 1)],
			]
			const expected = referenceLaplaceDet(M)
			assertComplexClose(determinantComplexRecursive(M), expected, 1e-12)
		})

		it('computes determinant of diagonal and triangular complex matrices', () => {
			const upper = [
				[c(1, 1), c(5, -2), c(3, 4), c(-1, 7)],
				[c(0, 0), c(2, -3), c(8, 1), c(0, 2)],
				[c(0, 0), c(0, 0), c(-1, 2), c(4, -5)],
				[c(0, 0), c(0, 0), c(0, 0), c(3, 1)],
			]
			// Product of diagonal: (1+i)(2-3i)(-1+2i)(3+i) = (5-i)(-5+5i) = -20 + 30i
			assertComplexClose(determinantComplexRecursive(upper), c(-20, 30), 1e-12)
		})

		it('handles matrices requiring pivoting and with singular leading block A11', () => {
			// Top-left 2x2 block is identically zero, yet the 4x4 matrix is invertible.
			const M = [
				[c(0, 0), c(0, 0), c(1, 2), c(3, -1)],
				[c(0, 0), c(0, 0), c(-2, 1), c(4, 2)],
				[c(2, -1), c(1, 3), c(5, 0), c(0, -2)],
				[c(1, 1), c(-3, 2), c(2, 1), c(1, -1)],
			]
			const expected = referenceLaplaceDet(M)
			assertComplexClose(determinantComplexRecursive(M), expected, 1e-11)
		})

		it('computes determinant of permutation / anti-diagonal complex matrices', () => {
			// 5x5 anti-diagonal of 1s has 2 swaps => sign +1
			const n = 5
			const anti = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => (i + j === n - 1 ? c(0, 1) : c(0, 0)))
			)
			// det = (+1) * i^5 = i
			assertComplexClose(determinantComplexRecursive(anti), c(0, 1), 1e-12)
		})
	})

	describe('edge cases', () => {
		it('returns { re: 1, im: 0 } for empty 0x0 matrix', () => {
			const det = determinantComplexRecursive([])
			assert.deepEqual(det, c(1, 0))
			assert.ok(Object.is(det.re, 1))
			assert.ok(Object.is(det.im, 0))
		})

		it('returns { re: 0, im: 0 } for zero matrices', () => {
			for (const n of [1, 2, 3, 4]) {
				const Z = Array.from({ length: n }, () =>
					Array.from({ length: n }, () => c(0, 0))
				)
				const det = determinantComplexRecursive(Z)
				assert.deepEqual(det, c(0, 0))
				assert.ok(Object.is(det.re, 0))
				assert.ok(Object.is(det.im, 0))
			}
		})

		it('handles pure real matrices including negatives', () => {
			const M = [
				[c(-2, 0), c(3, 0), c(-1, 0)],
				[c(4, 0), c(-5, 0), c(2, 0)],
				[c(-3, 0), c(1, 0), c(-4, 0)],
			]
			// Direct calculation: -2(20-2) - 3(-16+6) - 1(4-15) = -36 + 30 + 11 = 5
			assertComplexClose(determinantComplexRecursive(M), c(5, 0), 1e-12)
		})

		it('handles pure imaginary matrices: det(i * I_n) = i^n', () => {
			const expected = [c(1, 0), c(0, 1), c(-1, 0), c(0, -1), c(1, 0), c(0, 1)]
			for (let n = 0; n < expected.length; n++) {
				const M = Array.from({ length: n }, (_, r) =>
					Array.from({ length: n }, (_, k) => (r === k ? c(0, 1) : c(0, 0)))
				)
				assertComplexClose(determinantComplexRecursive(M), expected[n], 1e-12)
			}
		})

		it('returns ~0 for singular complex matrices', () => {
			// Row 2 = (1 + 2i) * Row 0 + (-3 + i) * Row 1
			const r0 = [c(1, -1), c(2, 3), c(-1, 2), c(4, 0)]
			const r1 = [c(3, 1), c(-2, 0), c(1, -4), c(0, 5)]
			const r2 = r0.map((v, j) =>
				cAdd(cMul(c(1, 2), v), cMul(c(-3, 1), r1[j]))
			)
			const r3 = [c(2, 2), c(1, -1), c(3, 1), c(-2, 3)]
			const M = [r0, r1, r2, r3]
			assertComplexClose(determinantComplexRecursive(M), c(0, 0), 1e-10)
		})

		it('returns exact { re: 0, im: 0 } when a column is identically zero', () => {
			const M = [
				[c(1, 2), c(0, 0), c(3, 4)],
				[c(5, -1), c(0, 0), c(-2, 1)],
				[c(0, 3), c(0, 0), c(1, 1)],
			]
			assert.deepEqual(determinantComplexRecursive(M), c(0, 0))
		})

		it('normalizes -0 to +0 in output components', () => {
			const det1 = determinantComplexRecursive([[c(-0, -0)]])
			assert.ok(Object.is(det1.re, 0))
			assert.ok(Object.is(det1.im, 0))

			const det2 = determinantComplexRecursive([
				[c(-0, 0), c(1, 0)],
				[c(0, 0), c(1, 0)],
			])
			assert.ok(Object.is(det2.re, 0))
			assert.ok(Object.is(det2.im, 0))
		})

		it('does not mutate the input matrix or its complex entry objects', () => {
			const M = [
				[c(0, 0), c(1, 2), c(3, -1)],
				[c(4, -2), c(2, 1), c(-1, 3)],
				[c(2, 5), c(-3, 0), c(1, -2)],
			]
			const snapshot = structuredClone(M)
			determinantComplexRecursive(M)
			assert.deepEqual(M, snapshot)
		})

		it('avoids premature intermediate overflow/underflow in diagonal product and Smith division', () => {
			const M = [
				[c(1e200, 0), c(0, 0), c(0, 0), c(0, 0)],
				[c(0, 0), c(0, 1e200), c(0, 0), c(0, 0)],
				[c(0, 0), c(0, 0), c(1e-200, 0), c(0, 0)],
				[c(0, 0), c(0, 0), c(0, 0), c(0, -1e-200)],
			]
			// Product: 1e200 * (i*1e200) * 1e-200 * (-i*1e-200) = 1
			assertComplexClose(determinantComplexRecursive(M), c(1, 0), 1e-12)

			// Large entries requiring overflow-safe Smith complex division
			const S = [
				[c(1e150, 1e150), c(2e150, -1e150), c(0, 0)],
				[c(1e150, 1e150), c(3e150, 0), c(0, 0)],
				[c(0, 0), c(0, 0), c(1e-300, 0)],
			]
			// Top-left 2x2: (1+i)(3) - (2-i)(1+i) = (3+3i) - (3+i) = 2i, scaled by 1e300 * 1e-300 = 2i
			assertComplexClose(determinantComplexRecursive(S), c(0, 2), 1e-12)
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		it('matches Laplace cofactor expansion on 4x4 and 5x5 complex matrices', () => {
			const M4 = [
				[c(2, -1), c(0, 3), c(1, 1), c(-2, 4)],
				[c(3, 2), c(1, -2), c(-1, 0), c(2, 1)],
				[c(-1, 1), c(4, 1), c(2, -3), c(0, -1)],
				[c(1, 3), c(-2, 2), c(3, 1), c(1, 2)],
			]
			assertComplexClose(
				determinantComplexRecursive(M4),
				referenceLaplaceDet(M4),
				1e-10
			)

			const M5 = [
				[c(1, 2), c(-1, 0), c(2, -1), c(0, 1), c(3, -2)],
				[c(0, -1), c(2, 1), c(1, 3), c(-2, 0), c(1, 1)],
				[c(2, 0), c(1, -2), c(-1, 1), c(3, 2), c(0, -1)],
				[c(-1, 3), c(0, 2), c(2, 0), c(1, -1), c(-2, 1)],
				[c(1, -1), c(3, 1), c(0, -2), c(-1, 2), c(2, 0)],
			]
			assertComplexClose(
				determinantComplexRecursive(M5),
				referenceLaplaceDet(M5),
				1e-9
			)
		})

		it('matches closed-form Vandermonde determinant for 6x6 complex nodes', () => {
			const nodes = [
				c(1, 0),
				c(0, 1),
				c(-1, 1),
				c(2, -1),
				c(-0.5, -1.5),
				c(1.5, 0.5),
			]
			const n = nodes.length
			const V = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => cPow(nodes[i], j))
			)

			// Independent formula: prod_{0 <= i < j < n} (nodes[j] - nodes[i])
			let expected = c(1, 0)
			for (let i = 0; i < n; i++) {
				for (let j = i + 1; j < n; j++) {
					expected = cMul(expected, cSub(nodes[j], nodes[i]))
				}
			}

			assertComplexClose(determinantComplexRecursive(V), expected, 1e-8)
		})

		it('satisfies multiplicativity det(A * B) = det(A) * det(B) on 7x7 complex matrices', () => {
			const makeMatrix = (seed) => {
				let s = seed
				const next = () => {
					s = (s * 1103515245 + 12345) & 0x7fffffff
					return ((s % 9) - 4) / 2
				}
				return Array.from({ length: 7 }, () =>
					Array.from({ length: 7 }, () => c(next(), next()))
				)
			}

			const A = makeMatrix(42)
			const B = makeMatrix(1337)
			const AB = matMul(A, B)

			const detA = determinantComplexRecursive(A)
			const detB = determinantComplexRecursive(B)
			const detAB = determinantComplexRecursive(AB)
			const prod = cMul(detA, detB)

			const scale = Math.max(1, Math.hypot(prod.re, prod.im))
			assertComplexClose(detAB, prod, 1e-10 * scale)
		})

		it('satisfies transpose, conjugate transpose, scalar scaling, and row swap identities', () => {
			const A = [
				[c(2, 1), c(-1, 3), c(0, -2), c(1, 1)],
				[c(3, -1), c(2, 0), c(1, 2), c(-2, 1)],
				[c(-1, 2), c(0, 1), c(3, -1), c(2, -2)],
				[c(1, -3), c(2, 1), c(-1, 0), c(1, 2)],
			]
			const detA = determinantComplexRecursive(A)

			// Transpose: det(A^T) == det(A)
			const AT = A.map((_, i) => A.map((row) => row[i]))
			assertComplexClose(determinantComplexRecursive(AT), detA, 1e-10)

			// Hermitian adjoint: det(A^H) == conj(det(A))
			const AH = A.map((_, i) => A.map((row) => c(row[i].re, -row[i].im)))
			assertComplexClose(
				determinantComplexRecursive(AH),
				c(detA.re, -detA.im),
				1e-10
			)

			// Scalar multiple: det(alpha * A) == alpha^n * det(A)
			const alpha = c(1.5, -0.5)
			const scaled = A.map((row) => row.map((v) => cMul(alpha, v)))
			const expectedScaled = cMul(cPow(alpha, A.length), detA)
			assertComplexClose(
				determinantComplexRecursive(scaled),
				expectedScaled,
				1e-9
			)

			// Row swap negates determinant
			const swapped = [A[2], A[1], A[0], A[3]]
			assertComplexClose(
				determinantComplexRecursive(swapped),
				c(-detA.re, -detA.im),
				1e-10
			)
		})

		it('produces real determinant for Hermitian matrices and |det|=1 for unitary DFT matrix', () => {
			// 4x4 Hermitian matrix: A[i][j] = conj(A[j][i])
			const H = [
				[c(4, 0), c(1, -2), c(0, 3), c(-1, 1)],
				[c(1, 2), c(5, 0), c(2, -1), c(3, 2)],
				[c(0, -3), c(2, 1), c(6, 0), c(1, -1)],
				[c(-1, -1), c(3, -2), c(1, 1), c(7, 0)],
			]
			const detH = determinantComplexRecursive(H)
			assert.ok(Math.abs(detH.im) < 1e-11, `Expected real det, got im=${detH.im}`)
			assertComplexClose(detH, referenceLaplaceDet(H), 1e-10)

			// 16x16 unitary normalized DFT matrix: F[j][k] = exp(-2*pi*i*j*k/n) / sqrt(n)
			const n = 16
			const invSqrtN = 1 / Math.sqrt(n)
			const F = Array.from({ length: n }, (_, j) =>
				Array.from({ length: n }, (_, k) => {
					const angle = (-2 * Math.PI * j * k) / n
					return c(Math.cos(angle) * invSqrtN, Math.sin(angle) * invSqrtN)
				})
			)
			const detF = determinantComplexRecursive(F)
			const absDetF = Math.hypot(detF.re, detF.im)
			assert.ok(
				Math.abs(absDetF - 1) < 1e-10,
				`Expected |det(DFT_16)| = 1, got ${absDetF}`
			)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-array matrix', () => {
			for (const bad of [null, undefined, 42, 'matrix', { length: 1 }]) {
				assert.throws(() => determinantComplexRecursive(bad), TypeError)
			}
		})

		it('throws TypeError for non-array rows', () => {
			assert.throws(() => determinantComplexRecursive([c(1, 0)]), TypeError)
			assert.throws(() => determinantComplexRecursive([[c(1, 0)], null]), TypeError)
		})

		it('throws RangeError for non-square or ragged matrices', () => {
			// 1x0
			assert.throws(() => determinantComplexRecursive([[]]), RangeError)
			// 2x3
			assert.throws(
				() =>
					determinantComplexRecursive([
						[c(1), c(2), c(3)],
						[c(4), c(5), c(6)],
					]),
				RangeError
			)
			// 3x2
			assert.throws(
				() =>
					determinantComplexRecursive([
						[c(1), c(2)],
						[c(3), c(4)],
						[c(5), c(6)],
					]),
				RangeError
			)
			// Ragged
			assert.throws(
				() =>
					determinantComplexRecursive([
						[c(1), c(2)],
						[c(3)],
					]),
				RangeError
			)
		})

		it('throws TypeError for invalid complex number entries', () => {
			const badEntries = [
				null,
				undefined,
				5,
				'1+2i',
				[1, 2],
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 0 },
				{ re: 0, im: null },
				{ re: true, im: 0 },
			]
			for (const bad of badEntries) {
				assert.throws(() => determinantComplexRecursive([[bad]]), TypeError)
			}
		})

		it('throws RangeError for non-finite complex components', () => {
			const nonFinite = [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 1 },
				{ re: 1, im: Number.NEGATIVE_INFINITY },
			]
			for (const bad of nonFinite) {
				assert.throws(() => determinantComplexRecursive([[bad]]), RangeError)
			}
		})
	})
})
