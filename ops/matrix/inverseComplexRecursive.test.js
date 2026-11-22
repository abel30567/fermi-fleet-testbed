import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { inverseComplexRecursive } from './inverseComplexRecursive.js'

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

function cDivRef(a, b) {
	const d = b.re * b.re + b.im * b.im
	return {
		re: (a.re * b.re + a.im * b.im) / d,
		im: (a.im * b.re - a.re * b.im) / d,
	}
}

function matMulDirect(A, B) {
	const n = A.length
	const m = B[0].length
	const kLen = B.length
	const out = Array.from({ length: n }, () => Array.from({ length: m }, () => c(0, 0)))
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < m; j++) {
			let sum = c(0, 0)
			for (let k = 0; k < kLen; k++) {
				sum = cAdd(sum, cMul(A[i][k], B[k][j]))
			}
			out[i][j] = sum
		}
	}
	return out
}

function identity(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => c(i === j ? 1 : 0, 0)),
	)
}

function assertMatricesClose(actual, expected, tol = 1e-11, label = '') {
	assert.equal(actual.length, expected.length, `${label} row count mismatch`)
	for (let i = 0; i < expected.length; i++) {
		assert.equal(actual[i].length, expected[i].length, `${label} col count mismatch at row ${i}`)
		for (let j = 0; j < expected[i].length; j++) {
			const errRe = Math.abs(actual[i][j].re - expected[i][j].re)
			const errIm = Math.abs(actual[i][j].im - expected[i][j].im)
			assert.ok(
				errRe <= tol && errIm <= tol,
				`${label} mismatch at [${i}][${j}]: got (${actual[i][j].re}, ${actual[i][j].im}), expected (${expected[i][j].re}, ${expected[i][j].im}), err=(${errRe}, ${errIm})`,
			)
		}
	}
}

/**
 * Independent reference implementation using iterative Gauss-Jordan elimination
 * with partial pivoting on an augmented `[A | I]` matrix.
 */
function gaussJordanInverseReference(A) {
	const n = A.length
	const aug = A.map((row, i) => [
		...row.map((z) => ({ re: z.re, im: z.im })),
		...Array.from({ length: n }, (_, j) => c(i === j ? 1 : 0, 0)),
	])

	for (let col = 0; col < n; col++) {
		let pivotRow = col
		let maxMag = Math.hypot(aug[col][col].re, aug[col][col].im)
		for (let r = col + 1; r < n; r++) {
			const mag = Math.hypot(aug[r][col].re, aug[r][col].im)
			if (mag > maxMag) {
				maxMag = mag
				pivotRow = r
			}
		}
		if (pivotRow !== col) {
			;[aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]]
		}
		const pivot = aug[col][col]
		for (let j = 0; j < 2 * n; j++) {
			aug[col][j] = cDivRef(aug[col][j], pivot)
		}
		for (let r = 0; r < n; r++) {
			if (r === col) continue
			const factor = aug[r][col]
			if (factor.re === 0 && factor.im === 0) continue
			for (let j = 0; j < 2 * n; j++) {
				aug[r][j] = cSub(aug[r][j], cMul(factor, aug[col][j]))
			}
		}
	}

	return aug.map((row) => row.slice(n))
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible matrix generation.
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

function randomComplexMatrix(n, seed) {
	const rand = createRng(seed)
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => {
			const re = (rand() - 0.5) * 10 + (i === j ? 2 : 0)
			const im = (rand() - 0.5) * 10
			return c(re, im)
		}),
	)
}

describe('inverseComplexRecursive', () => {
	describe('normal cases', () => {
		it('inverts a 1x1 complex matrix', () => {
			const A = [[c(3, 4)]]
			const inv = inverseComplexRecursive(A)
			assertMatricesClose(inv, [[c(3 / 25, -4 / 25)]], 1e-15, '1x1')
		})

		it('inverts a 2x2 complex matrix and matches closed-form adjugate formula', () => {
			const A = [
				[c(1, 2), c(3, -1)],
				[c(-2, 1), c(4, 3)],
			]
			const det = cSub(cMul(A[0][0], A[1][1]), cMul(A[0][1], A[1][0]))
			const expected = [
				[cDivRef(A[1][1], det), cDivRef(c(-A[0][1].re, -A[0][1].im), det)],
				[cDivRef(c(-A[1][0].re, -A[1][0].im), det), cDivRef(A[0][0], det)],
			]
			const inv = inverseComplexRecursive(A)
			assertMatricesClose(inv, expected, 1e-14, '2x2 closed-form')
			assertMatricesClose(matMulDirect(A, inv), identity(2), 1e-14, '2x2 A*A^-1')
			assertMatricesClose(matMulDirect(inv, A), identity(2), 1e-14, '2x2 A^-1*A')
		})

		it('inverts a 3x3 complex matrix (odd dimension)', () => {
			const A = [
				[c(2, 1), c(-1, 3), c(0, -2)],
				[c(1, -1), c(3, 2), c(4, 1)],
				[c(-3, 2), c(0, 1), c(2, -3)],
			]
			const inv = inverseComplexRecursive(A)
			assertMatricesClose(matMulDirect(A, inv), identity(3), 1e-13, '3x3 A*A^-1')
			assertMatricesClose(matMulDirect(inv, A), identity(3), 1e-13, '3x3 A^-1*A')
		})

		it('inverts unitary complex DFT matrices (U^-1 = U*)', () => {
			for (const n of [4, 5]) {
				const scale = 1 / Math.sqrt(n)
				const U = Array.from({ length: n }, (_, r) =>
					Array.from({ length: n }, (_, k) => {
						const angle = (-2 * Math.PI * r * k) / n
						return c(scale * Math.cos(angle), scale * Math.sin(angle))
					}),
				)
				const Ustar = Array.from({ length: n }, (_, r) =>
					Array.from({ length: n }, (_, k) => c(U[k][r].re, -U[k][r].im)),
				)
				const inv = inverseComplexRecursive(U)
				assertMatricesClose(inv, Ustar, 1e-13, `DFT-${n} U^-1 = U*`)
			}
		})

		it('inverts upper and lower triangular complex matrices', () => {
			const U = [
				[c(2, 1), c(1, -2), c(-3, 4)],
				[c(0, 0), c(-1, 3), c(2, 2)],
				[c(0, 0), c(0, 0), c(4, -1)],
			]
			const L = [
				[c(1, -1), c(0, 0), c(0, 0)],
				[c(2, 3), c(-2, 1), c(0, 0)],
				[c(-1, 2), c(3, -4), c(1, 2)],
			]
			const Uinv = inverseComplexRecursive(U)
			const Linv = inverseComplexRecursive(L)
			assertMatricesClose(matMulDirect(U, Uinv), identity(3), 1e-13, 'upper triangular')
			assertMatricesClose(matMulDirect(L, Linv), identity(3), 1e-13, 'lower triangular')
		})
	})

	describe('edge cases', () => {
		it('inverts the identity matrix exactly', () => {
			const I = identity(4)
			const inv = inverseComplexRecursive(I)
			assert.deepEqual(inv, I)
		})

		it('inverts purely real and purely imaginary matrices', () => {
			const R = [
				[c(-2, 0), c(5, 0), c(1, 0)],
				[c(3, 0), c(-1, 0), c(4, 0)],
				[c(0, 0), c(2, 0), c(-3, 0)],
			]
			const Rinv = inverseComplexRecursive(R)
			assertMatricesClose(matMulDirect(R, Rinv), identity(3), 1e-13, 'purely real')
			for (const row of Rinv) {
				for (const z of row) {
					assert.ok(Math.abs(z.im) <= 1e-15, 'real matrix inverse should have zero imaginary part')
				}
			}

			// Purely imaginary: (i * R)^-1 = -i * R^-1
			const iR = R.map((row) => row.map((z) => c(0, z.re)))
			const iRinv = inverseComplexRecursive(iR)
			const expected = Rinv.map((row) => row.map((z) => c(0, -z.re)))
			assertMatricesClose(iRinv, expected, 1e-13, 'purely imaginary')
		})

		it('handles zero leading principal minors (permutation & anti-diagonal matrices)', () => {
			// Permutation matrix requiring row swaps at every step
			const P = [
				[c(0, 0), c(0, 0), c(1, 0), c(0, 0)],
				[c(0, 0), c(0, 0), c(0, 0), c(0, 1)],
				[c(0, -1), c(0, 0), c(0, 0), c(0, 0)],
				[c(0, 0), c(2, 0), c(0, 0), c(0, 0)],
			]
			const Pinv = inverseComplexRecursive(P)
			assertMatricesClose(matMulDirect(P, Pinv), identity(4), 1e-14, 'permutation P*P^-1')
			assertMatricesClose(matMulDirect(Pinv, P), identity(4), 1e-14, 'permutation P^-1*P')

			// 2x2 anti-diagonal with zero top-left block
			const anti2 = [
				[c(0, 0), c(1, 1)],
				[c(1, -1), c(0, 0)],
			]
			const anti2Inv = inverseComplexRecursive(anti2)
			assertMatricesClose(matMulDirect(anti2, anti2Inv), identity(2), 1e-14, 'anti-diagonal 2x2')
		})

		it('normalizes -0 to +0 in output', () => {
			const A = [
				[c(-0, -0), c(1, -0)],
				[c(-1, 0), c(-0, 0)],
			]
			const inv = inverseComplexRecursive(A)
			for (let i = 0; i < inv.length; i++) {
				for (let j = 0; j < inv[i].length; j++) {
					assert.equal(Object.is(inv[i][j].re, -0), false, `re at [${i}][${j}] must not be -0`)
					assert.equal(Object.is(inv[i][j].im, -0), false, `im at [${i}][${j}] must not be -0`)
				}
			}
		})

		it('handles extreme uniform scaling without spurious underflow or overflow', () => {
			const base = [
				[c(3, 4), c(1, -2)],
				[c(-2, 1), c(2, 3)],
			]
			const baseInv = inverseComplexRecursive(base)

			const tiny = base.map((row) => row.map((z) => c(z.re * 1e-200, z.im * 1e-200)))
			const tinyInv = inverseComplexRecursive(tiny)
			const expectedTiny = baseInv.map((row) => row.map((z) => c(z.re * 1e200, z.im * 1e200)))
			for (let i = 0; i < 2; i++) {
				for (let j = 0; j < 2; j++) {
					const scale = Math.hypot(expectedTiny[i][j].re, expectedTiny[i][j].im)
					const err = Math.hypot(
						tinyInv[i][j].re - expectedTiny[i][j].re,
						tinyInv[i][j].im - expectedTiny[i][j].im,
					)
					assert.ok(err / scale < 1e-13, `tiny scaled inverse mismatch at [${i}][${j}]`)
				}
			}

			const huge = base.map((row) => row.map((z) => c(z.re * 1e200, z.im * 1e200)))
			const hugeInv = inverseComplexRecursive(huge)
			const expectedHuge = baseInv.map((row) => row.map((z) => c(z.re * 1e-200, z.im * 1e-200)))
			for (let i = 0; i < 2; i++) {
				for (let j = 0; j < 2; j++) {
					const scale = Math.hypot(expectedHuge[i][j].re, expectedHuge[i][j].im)
					const err = Math.hypot(
						hugeInv[i][j].re - expectedHuge[i][j].re,
						hugeInv[i][j].im - expectedHuge[i][j].im,
					)
					assert.ok(err / scale < 1e-13, `huge scaled inverse mismatch at [${i}][${j}]`)
				}
			}
		})

		it('does not mutate the input matrix or its complex entry objects', () => {
			const A = [
				[c(1, 2), c(3, 4)],
				[c(5, 6), c(7, -8)],
			]
			const snapshot = structuredClone(A)
			inverseComplexRecursive(A)
			assert.deepEqual(A, snapshot)
		})
	})

	describe('singular matrices and error handling', () => {
		it('throws RangeError on singular matrices', () => {
			// 1x1 zero
			assert.throws(() => inverseComplexRecursive([[c(0, 0)]]), RangeError)

			// 2x2 zero
			assert.throws(
				() =>
					inverseComplexRecursive([
						[c(0, 0), c(0, 0)],
						[c(0, 0), c(0, 0)],
					]),
				RangeError,
			)

			// 2x2 linearly dependent complex rows: row1 = (1 - 2i) * row0
			assert.throws(
				() =>
					inverseComplexRecursive([
						[c(1, 1), c(2, -1)],
						[c(3, -1), c(0, -5)],
					]),
				RangeError,
			)

			// 3x3 rank-deficient real matrix
			assert.throws(
				() =>
					inverseComplexRecursive([
						[c(1), c(2), c(3)],
						[c(4), c(5), c(6)],
						[c(7), c(8), c(9)],
					]),
				RangeError,
			)

			// 3x3 floating-point complex linear combination: row2 = (0.3+0.7i)*row0 + (1.1-0.4i)*row1
			const r0 = [c(1.2, -0.5), c(-2.3, 1.7), c(0.8, 2.1)]
			const r1 = [c(-0.9, 1.4), c(3.1, -0.6), c(-1.5, 0.3)]
			const alpha = c(0.3, 0.7)
			const beta = c(1.1, -0.4)
			const r2 = r0.map((z, idx) => cAdd(cMul(alpha, z), cMul(beta, r1[idx])))
			assert.throws(() => inverseComplexRecursive([r0, r1, r2]), RangeError)
		})

		it('throws RangeError when inverse overflows finite floating-point range', () => {
			assert.throws(() => inverseComplexRecursive([[c(1e-310, 0)]]), RangeError)
		})

		it('validates input types and dimensions', () => {
			// Invalid top-level types -> TypeError
			for (const bad of [null, undefined, 42, 'matrix', {}]) {
				assert.throws(() => inverseComplexRecursive(bad), TypeError)
			}

			// Empty matrix -> RangeError
			assert.throws(() => inverseComplexRecursive([]), RangeError)

			// Non-array row -> TypeError
			assert.throws(() => inverseComplexRecursive([123]), TypeError)

			// Non-square matrices -> RangeError
			assert.throws(() => inverseComplexRecursive([[c(1), c(2)]]), RangeError)
			assert.throws(() => inverseComplexRecursive([[c(1)], [c(2)]]), RangeError)
			assert.throws(() => inverseComplexRecursive([[c(1), c(2)], [c(3)]]), RangeError)

			// Invalid entry types -> TypeError
			assert.throws(() => inverseComplexRecursive([[null]]), TypeError)
			assert.throws(() => inverseComplexRecursive([[42]]), TypeError)
			assert.throws(() => inverseComplexRecursive([[[1, 2]]]), TypeError)
			assert.throws(() => inverseComplexRecursive([[{ re: 1 }]]), TypeError)
			assert.throws(() => inverseComplexRecursive([[{ im: 1 }]]), TypeError)
			assert.throws(() => inverseComplexRecursive([[{ re: '1', im: 0 }]]), TypeError)

			// Non-finite numbers -> RangeError
			assert.throws(() => inverseComplexRecursive([[c(NaN, 0)]]), RangeError)
			assert.throws(() => inverseComplexRecursive([[c(0, NaN)]]), RangeError)
			assert.throws(() => inverseComplexRecursive([[c(Infinity, 0)]]), RangeError)
			assert.throws(() => inverseComplexRecursive([[c(0, -Infinity)]]), RangeError)
		})
	})

	describe('independent cross-checks & algebraic identities', () => {
		it('matches independent Gauss-Jordan reference across sizes 1..8 and 12', () => {
			for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 12]) {
				const A = randomComplexMatrix(n, 1000 + n * 37)
				const invRec = inverseComplexRecursive(A)
				const invRef = gaussJordanInverseReference(A)

				assertMatricesClose(invRec, invRef, 1e-11, `n=${n} vs Gauss-Jordan`)
				assertMatricesClose(matMulDirect(A, invRec), identity(n), 1e-11, `n=${n} A*A^-1`)
				assertMatricesClose(matMulDirect(invRec, A), identity(n), 1e-11, `n=${n} A^-1*A`)
			}
		})

		it('satisfies involution (A^-1)^-1 = A and product rule (A*B)^-1 = B^-1 * A^-1', () => {
			const A = randomComplexMatrix(6, 4242)
			const B = randomComplexMatrix(6, 9876)

			const Ainv = inverseComplexRecursive(A)
			const AinvInv = inverseComplexRecursive(Ainv)
			assertMatricesClose(AinvInv, A, 1e-11, '(A^-1)^-1 = A')

			const Binv = inverseComplexRecursive(B)
			const AB = matMulDirect(A, B)
			const ABinv = inverseComplexRecursive(AB)
			const BinvAinv = matMulDirect(Binv, Ainv)
			assertMatricesClose(ABinv, BinvAinv, 1e-10, '(A*B)^-1 = B^-1 * A^-1')
		})
	})
})
