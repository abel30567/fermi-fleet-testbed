import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { determinantComplexIterative } from './determinantComplexIterative.js'

/** Helper to construct a complex number `{ re, im }`. */
const c = (re, im = 0) => ({ re, im })

/** Complex arithmetic helpers for independent test verification. */
function cAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function cMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	}
}

function cConj(a) {
	return { re: a.re, im: -a.im }
}

function cAbs(a) {
	return Math.hypot(a.re, a.im)
}

function assertComplexClose(actual, expected, eps = 1e-9, message = '') {
	assert.equal(typeof actual, 'object', `${message} expected object`)
	assert.notEqual(actual, null, `${message} expected non-null object`)
	const diffRe = Math.abs(actual.re - expected.re)
	const diffIm = Math.abs(actual.im - expected.im)
	assert.ok(
		diffRe <= eps && diffIm <= eps,
		`${message} expected (${expected.re} + ${expected.im}i), got (${actual.re} + ${actual.im}i) [diff: ${diffRe}, ${diffIm}]`,
	)
}

/**
 * Independent brute-force reference implementation using the Leibniz
 * permutation expansion: det(A) = sum_{sigma in S_n} sgn(sigma) * prod_i A[i][sigma(i)].
 */
function determinantLeibnizReference(matrix) {
	const n = matrix.length
	if (n === 0) return c(1, 0)

	const perm = Array.from({ length: n }, (_, i) => i)
	let total = c(0, 0)

	function permute(start, parity) {
		if (start === n) {
			let term = c(parity, 0)
			for (let i = 0; i < n; i++) {
				term = cMul(term, matrix[i][perm[i]])
			}
			total = cAdd(total, term)
			return
		}
		for (let i = start; i < n; i++) {
			;[perm[start], perm[i]] = [perm[i], perm[start]]
			permute(start + 1, i === start ? parity : -parity)
			;[perm[start], perm[i]] = [perm[i], perm[start]]
		}
	}

	permute(0, 1)
	return total
}

/** Multiply two n×n complex matrices. */
function matMulComplex(A, B) {
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

/** Deterministic PRNG (Mulberry32) for reproducible test matrices. */
function makeRng(seed) {
	let s = seed >>> 0
	return () => {
		s = (s + 0x6d2b79f5) >>> 0
		let t = Math.imul(s ^ (s >>> 15), 1 | s)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

function randomComplexMatrix(n, seed) {
	const rng = makeRng(seed)
	return Array.from({ length: n }, () =>
		Array.from({ length: n }, () =>
			c(Math.round((rng() * 10 - 5) * 4) / 4, Math.round((rng() * 10 - 5) * 4) / 4),
		),
	)
}

describe('determinantComplexIterative', () => {
	describe('normal cases', () => {
		it('computes 1x1 complex matrix determinant', () => {
			assert.deepEqual(determinantComplexIterative([[c(3, -4)]]), c(3, -4))
			assert.deepEqual(determinantComplexIterative([[c(0, 0)]]), c(0, 0))
		})

		it('computes 2x2 complex matrix determinant analytically', () => {
			// det = (1 + 2i)(4 - i) - (3i)(2 + i)
			//     = (4 - i + 8i + 2) - (6i - 3)
			//     = (6 + 7i) - (-3 + 6i) = 9 + i
			const M = [
				[c(1, 2), c(0, 3)],
				[c(2, 1), c(4, -1)],
			]
			assertComplexClose(determinantComplexIterative(M), c(9, 1))
		})

		it('computes 3x3 complex matrix determinant', () => {
			const M = [
				[c(1, 1), c(2, -1), c(0, 3)],
				[c(0, 2), c(1, 0), c(-1, 1)],
				[c(3, 0), c(0, -2), c(2, 2)],
			]
			const expected = determinantLeibnizReference(M)
			assertComplexClose(determinantComplexIterative(M), expected)
		})

		it('handles 4x4 matrix requiring row pivoting (zeros on main diagonal)', () => {
			const M = [
				[c(0, 0), c(1, 2), c(0, 0), c(0, 0)],
				[c(0, 0), c(0, 0), c(3, -1), c(0, 0)],
				[c(0, 0), c(0, 0), c(0, 0), c(0, 2)],
				[c(2, 1), c(0, 0), c(0, 0), c(0, 0)],
			]
			// Cyclic permutation of length 4 has sign -1:
			// det = -(1 + 2i)(3 - i)(2i)(2 + i) = -(5 + 5i)(-2 + 4i) = -(-30 + 10i) = 30 - 10i
			assertComplexClose(determinantComplexIterative(M), c(30, -10))
		})

		it('computes determinant of triangular and diagonal matrices', () => {
			const upper = [
				[c(2, 1), c(5, -3), c(1, 7)],
				[c(0, 0), c(0, 3), c(-4, 2)],
				[c(0, 0), c(0, 0), c(1, -2)],
			]
			// (2 + i)(3i)(1 - 2i) = (-3 + 6i)(1 - 2i) = 9 + 12i
			assertComplexClose(determinantComplexIterative(upper), c(9, 12))
		})

		it('computes determinant of purely real and purely imaginary matrices', () => {
			const realMat = [
				[c(6), c(1), c(1)],
				[c(4), c(-2), c(5)],
				[c(2), c(8), c(7)],
			]
			assertComplexClose(determinantComplexIterative(realMat), c(-306, 0))

			// det(i * I_3) = i^3 = -i
			const imagDiag = [
				[c(0, 1), c(0, 0), c(0, 0)],
				[c(0, 0), c(0, 1), c(0, 0)],
				[c(0, 0), c(0, 0), c(0, 1)],
			]
			assertComplexClose(determinantComplexIterative(imagDiag), c(0, -1))
		})

		it('returns zero for singular complex matrices', () => {
			// Zero row
			const zeroRow = [
				[c(1, 2), c(3, 4)],
				[c(0, 0), c(0, 0)],
			]
			assert.deepEqual(determinantComplexIterative(zeroRow), c(0, 0))

			// Linearly dependent rows: row 2 = (2 - 3i) * row 1
			const r1 = [c(1, 1), c(2, -1), c(-1, 3)]
			const scale = c(2, -3)
			const r2 = r1.map((z) => cMul(scale, z))
			const singular = [r1, r2, [c(4, 0), c(0, -5), c(1, 2)]]
			assertComplexClose(determinantComplexIterative(singular), c(0, 0), 1e-12)
		})

		it('computes unit-modulus determinant for unitary DFT matrix', () => {
			// Normalized 4x4 DFT matrix U[j][k] = (1/2) * exp(-2*pi*i*j*k/4)
			const n = 4
			const U = Array.from({ length: n }, (_, j) =>
				Array.from({ length: n }, (_, k) => {
					const angle = (-2 * Math.PI * j * k) / n
					return c(Math.cos(angle) / 2, Math.sin(angle) / 2)
				}),
			)
			const det = determinantComplexIterative(U)
			assert.ok(Math.abs(cAbs(det) - 1) < 1e-12, `expected |det(U)| = 1, got ${cAbs(det)}`)
		})
	})

	describe('edge cases', () => {
		it('returns { re: 1, im: 0 } for an empty 0x0 matrix', () => {
			assert.deepEqual(determinantComplexIterative([]), c(1, 0))
		})

		it('does not mutate the input matrix or its entry objects', () => {
			const M = [
				[c(0, 0), c(1, 2)],
				[c(3, -1), c(4, 5)],
			]
			const snapshot = structuredClone(M)
			determinantComplexIterative(M)
			assert.deepEqual(M, snapshot)
		})

		it('normalizes negative zero to positive zero in results', () => {
			const res1 = determinantComplexIterative([[c(-0, -0)]])
			assert.ok(Object.is(res1.re, 0))
			assert.ok(Object.is(res1.im, 0))

			const res2 = determinantComplexIterative([
				[c(-1, 0), c(0, 0)],
				[c(0, 0), c(0, 0)],
			])
			assert.ok(Object.is(res2.re, 0))
			assert.ok(Object.is(res2.im, 0))
		})

		it('handles very small and very large magnitudes without overflow/underflow in division', () => {
			const smallScale = 1e-100
			const smallM = [
				[c(3 * smallScale, 4 * smallScale), c(smallScale, 0)],
				[c(0, smallScale), c(2 * smallScale, -smallScale)],
			]
			// det = ((3+4i)(2-i) - i) * 1e-200 = (10 + 5i - i) * 1e-200 = (10 + 4i) * 1e-200
			assertComplexClose(
				determinantComplexIterative(smallM),
				c(10e-200, 4e-200),
				1e-212,
			)

			const largeScale = 1e100
			const largeM = [
				[c(1 * largeScale, 2 * largeScale), c(largeScale, 0)],
				[c(0, largeScale), c(3 * largeScale, -largeScale)],
			]
			// det = ((1+2i)(3-i) - i) * 1e200 = (5 + 5i - i) * 1e200 = (5 + 4i) * 1e200
			assertComplexClose(
				determinantComplexIterative(largeM),
				c(5e200, 4e200),
				1e188,
			)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-array matrix inputs', () => {
			for (const bad of [null, undefined, 42, 'matrix', { re: 1, im: 0 }]) {
				assert.throws(() => determinantComplexIterative(bad), TypeError)
			}
		})

		it('throws TypeError when any row is not an array', () => {
			assert.throws(() => determinantComplexIterative([null]), TypeError)
			assert.throws(() => determinantComplexIterative([123]), TypeError)
			assert.throws(() => determinantComplexIterative([[c(1, 0)], 'bad']), TypeError)
		})

		it('throws RangeError for non-square matrices', () => {
			assert.throws(() => determinantComplexIterative([[]]), RangeError)
			assert.throws(() => determinantComplexIterative([[c(1, 0), c(2, 0)]]), RangeError)
			assert.throws(
				() =>
					determinantComplexIterative([
						[c(1, 0), c(2, 0)],
						[c(3, 0)],
					]),
				RangeError,
			)
		})

		it('throws TypeError for invalid complex entry objects', () => {
			assert.throws(() => determinantComplexIterative([[1]]), TypeError)
			assert.throws(() => determinantComplexIterative([[null]]), TypeError)
			assert.throws(() => determinantComplexIterative([[{ re: 1 }]]), TypeError)
			assert.throws(() => determinantComplexIterative([[{ im: 1 }]]), TypeError)
			assert.throws(() => determinantComplexIterative([[{ re: '1', im: 0 }]]), TypeError)
			assert.throws(() => determinantComplexIterative([[{ re: 1, im: '0' }]]), TypeError)
		})

		it('throws RangeError for non-finite complex components', () => {
			assert.throws(() => determinantComplexIterative([[c(NaN, 0)]]), RangeError)
			assert.throws(() => determinantComplexIterative([[c(0, NaN)]]), RangeError)
			assert.throws(() => determinantComplexIterative([[c(Infinity, 0)]]), RangeError)
			assert.throws(() => determinantComplexIterative([[c(0, -Infinity)]]), RangeError)
		})
	})

	describe('independent cross-checks and mathematical identities', () => {
		it('matches brute-force Leibniz permutation expansion for sizes 1..5', () => {
			for (let n = 1; n <= 5; n++) {
				for (let trial = 0; trial < 3; trial++) {
					const M = randomComplexMatrix(n, n * 100 + trial + 1)
					const got = determinantComplexIterative(M)
					const ref = determinantLeibnizReference(M)
					const tol = 1e-8 * Math.max(1, cAbs(ref))
					assertComplexClose(got, ref, tol, `n=${n} trial=${trial}`)
				}
			}
		})

		it('satisfies multiplicativity: det(A * B) = det(A) * det(B)', () => {
			for (const n of [3, 4, 5]) {
				const A = randomComplexMatrix(n, 700 + n)
				const B = randomComplexMatrix(n, 900 + n)
				const detAB = determinantComplexIterative(matMulComplex(A, B))
				const detAdetB = cMul(
					determinantComplexIterative(A),
					determinantComplexIterative(B),
				)
				const tol = 1e-7 * Math.max(1, cAbs(detAdetB))
				assertComplexClose(detAB, detAdetB, tol, `multiplicativity n=${n}`)
			}
		})

		it('satisfies transpose and conjugate-transpose identities: det(A^T) = det(A), det(A^H) = conj(det(A))', () => {
			const A = randomComplexMatrix(5, 1337)
			const n = A.length
			const AT = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => A[j][i]),
			)
			const AH = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => cConj(A[j][i])),
			)

			const detA = determinantComplexIterative(A)
			const detAT = determinantComplexIterative(AT)
			const detAH = determinantComplexIterative(AH)
			const tol = 1e-8 * Math.max(1, cAbs(detA))

			assertComplexClose(detAT, detA, tol, 'transpose identity')
			assertComplexClose(detAH, cConj(detA), tol, 'conjugate-transpose identity')
		})

		it('satisfies scalar multiplication identity: det(s * A) = s^n * det(A)', () => {
			const n = 4
			const A = randomComplexMatrix(n, 2026)
			const s = c(1.5, -2.25)
			const sA = A.map((row) => row.map((z) => cMul(s, z)))

			let sPowN = c(1, 0)
			for (let i = 0; i < n; i++) sPowN = cMul(sPowN, s)

			const lhs = determinantComplexIterative(sA)
			const rhs = cMul(sPowN, determinantComplexIterative(A))
			const tol = 1e-7 * Math.max(1, cAbs(rhs))
			assertComplexClose(lhs, rhs, tol, 'scalar scaling identity')
		})

		it('satisfies real 2n x 2n block embedding identity: det_R([[X, -Y], [Y, X]]) = |det_C(X + iY)|^2', () => {
			const n = 4
			const A = randomComplexMatrix(n, 4242)
			// Build 2n x 2n real matrix represented as complex numbers with im = 0:
			// [[Re(A), -Im(A)], [Im(A), Re(A)]]
			const block = Array.from({ length: 2 * n }, () => new Array(2 * n))
			for (let i = 0; i < n; i++) {
				for (let j = 0; j < n; j++) {
					block[i][j] = c(A[i][j].re, 0)
					block[i][j + n] = c(-A[i][j].im, 0)
					block[i + n][j] = c(A[i][j].im, 0)
					block[i + n][j + n] = c(A[i][j].re, 0)
				}
			}

			const detC = determinantComplexIterative(A)
			const detBlock = determinantComplexIterative(block)
			const expectedMagSq = detC.re * detC.re + detC.im * detC.im
			const tol = 1e-6 * Math.max(1, expectedMagSq)

			assertComplexClose(detBlock, c(expectedMagSq, 0), tol, '2n x 2n real embedding identity')
		})
	})
})
