import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { inverseComplexIterative } from './inverseComplexIterative.js'

const c = (re, im = 0) => ({ re, im })

function cAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function cSub(a, b) {
	return { re: a.re - b.re, im: a.im - b.im }
}

function cMul(a, b) {
	return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }
}

function cDiv(a, b) {
	const d = b.re * b.re + b.im * b.im
	return {
		re: (a.re * b.re + a.im * b.im) / d,
		im: (a.im * b.re - a.re * b.im) / d,
	}
}

function cConj(z) {
	return { re: z.re, im: -z.im }
}

function matMul(A, B) {
	const n = A.length
	const out = Array.from({ length: n }, () => Array.from({ length: n }, () => c(0, 0)))
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

function conjTranspose(A) {
	const n = A.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => cConj(A[j][i]))
	)
}

function identity(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? c(1, 0) : c(0, 0)))
	)
}

function assertComplexClose(actual, expected, eps = 1e-10, label = '') {
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`${label} re mismatch: got ${actual.re}, expected ${expected.re}`
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`${label} im mismatch: got ${actual.im}, expected ${expected.im}`
	)
}

function assertMatricesClose(actual, expected, eps = 1e-10) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < actual.length; i++) {
		assert.equal(actual[i].length, expected[i].length)
		for (let j = 0; j < actual[i].length; j++) {
			assertComplexClose(actual[i][j], expected[i][j], eps, `[${i}][${j}]`)
		}
	}
}

function makeSeededRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (1664525 * state + 1013904223) >>> 0
		return (state / 0x100000000) * 2 - 1
	}
}

/**
 * Independent 2x2 inverse via closed-form adjugate / determinant formula.
 */
function inverse2x2Adjugate(A) {
	const det = cSub(cMul(A[0][0], A[1][1]), cMul(A[0][1], A[1][0]))
	return [
		[cDiv(A[1][1], det), cDiv(c(-A[0][1].re, -A[0][1].im), det)],
		[cDiv(c(-A[1][0].re, -A[1][0].im), det), cDiv(A[0][0], det)],
	]
}

/**
 * Independent 3x3 inverse via cofactor expansion and adjugate / determinant formula.
 */
function inverse3x3Adjugate(A) {
	const minor = (r, col) => {
		const rows = [0, 1, 2].filter((x) => x !== r)
		const cols = [0, 1, 2].filter((x) => x !== col)
		return cSub(
			cMul(A[rows[0]][cols[0]], A[rows[1]][cols[1]]),
			cMul(A[rows[0]][cols[1]], A[rows[1]][cols[0]])
		)
	}
	const cofactor = (r, col) => {
		const m = minor(r, col)
		return (r + col) % 2 === 0 ? m : c(-m.re, -m.im)
	}
	const det = cAdd(
		cAdd(cMul(A[0][0], cofactor(0, 0)), cMul(A[0][1], cofactor(0, 1))),
		cMul(A[0][2], cofactor(0, 2))
	)
	const inv = Array.from({ length: 3 }, () => new Array(3))
	for (let i = 0; i < 3; i++) {
		for (let j = 0; j < 3; j++) {
			inv[i][j] = cDiv(cofactor(j, i), det)
		}
	}
	return inv
}

/**
 * Independent real-matrix inverse via LU / Gauss-Jordan over real numbers,
 * used to cross-check via the C^(n x n) -> R^(2n x 2n) block isomorphism.
 */
function invertRealMatrix(M) {
	const n = M.length
	const aug = M.map((row, i) => [
		...row,
		...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
	])
	for (let col = 0; col < n; col++) {
		let pivot = col
		for (let r = col + 1; r < n; r++) {
			if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) {
				pivot = r
			}
		}
		;[aug[col], aug[pivot]] = [aug[pivot], aug[col]]
		const p = aug[col][col]
		for (let j = 0; j < 2 * n; j++) {
			aug[col][j] /= p
		}
		for (let r = 0; r < n; r++) {
			if (r === col) continue
			const f = aug[r][col]
			for (let j = 0; j < 2 * n; j++) {
				aug[r][j] -= f * aug[col][j]
			}
		}
	}
	return aug.map((row) => row.slice(n))
}

describe('inverseComplexIterative', () => {
	describe('normal cases', () => {
		test('inverts a 1x1 complex matrix', () => {
			const result = inverseComplexIterative([[c(3, 4)]])
			assertMatricesClose(result, [[c(3 / 25, -4 / 25)]], 1e-15)
		})

		test('inverts the identity matrix to itself', () => {
			const I = identity(4)
			const inv = inverseComplexIterative(I)
			assert.deepStrictEqual(inv, I)
		})

		test('inverts a 2x2 complex matrix with known analytical inverse', () => {
			// A = [[1+i, 2], [0, 1-i]], det = 2, A^-1 = [[(1-i)/2, -1], [0, (1+i)/2]]
			const A = [
				[c(1, 1), c(2, 0)],
				[c(0, 0), c(1, -1)],
			]
			const expected = [
				[c(0.5, -0.5), c(-1, 0)],
				[c(0, 0), c(0.5, 0.5)],
			]
			assertMatricesClose(inverseComplexIterative(A), expected, 1e-12)
		})

		test('inverts a purely real matrix represented as complex numbers', () => {
			const A = [
				[c(4), c(7)],
				[c(2), c(6)],
			]
			const expected = [
				[c(0.6), c(-0.7)],
				[c(-0.2), c(0.4)],
			]
			assertMatricesClose(inverseComplexIterative(A), expected, 1e-12)
		})

		test('inverts a purely imaginary matrix', () => {
			const A = [
				[c(0, 2), c(0, 0)],
				[c(0, 0), c(0, -4)],
			]
			const expected = [
				[c(0, -0.5), c(0, 0)],
				[c(0, 0), c(0, 0.25)],
			]
			assertMatricesClose(inverseComplexIterative(A), expected, 1e-12)
		})

		test('handles zero diagonal entries via partial pivoting', () => {
			const A = [
				[c(0, 0), c(1, 2), c(0, 0)],
				[c(0, 0), c(0, 0), c(2, -1)],
				[c(3, 1), c(0, 0), c(0, 0)],
			]
			const inv = inverseComplexIterative(A)
			assertMatricesClose(matMul(A, inv), identity(3), 1e-12)
			assertMatricesClose(matMul(inv, A), identity(3), 1e-12)
		})

		test('does not mutate input matrix or its entry objects', () => {
			const A = [
				[c(2, 1), c(-1, 3)],
				[c(4, -2), c(1, 1)],
			]
			const snapshot = structuredClone(A)
			const inv = inverseComplexIterative(A)
			assert.deepStrictEqual(A, snapshot)
			assert.notEqual(inv, A)
			assert.notEqual(inv[0][0], A[0][0])
		})

		test('does not emit negative zero in output entries', () => {
			const A = [
				[c(0, 1), c(0, 0)],
				[c(0, 0), c(-1, 0)],
			]
			const inv = inverseComplexIterative(A)
			for (const row of inv) {
				for (const entry of row) {
					assert.ok(!Object.is(entry.re, -0), 're should not be -0')
					assert.ok(!Object.is(entry.im, -0), 'im should not be -0')
				}
			}
		})
	})

	describe('edge cases', () => {
		test('handles very small and very large uniform matrix scales without overflow/underflow', () => {
			const base = [
				[c(1, 2), c(3, -1)],
				[c(-2, 1), c(4, 2)],
			]
			const baseInv = inverseComplexIterative(base)

			for (const scale of [1e-100, 1e100]) {
				const scaled = base.map((row) =>
					row.map((z) => c(z.re * scale, z.im * scale))
				)
				const scaledInv = inverseComplexIterative(scaled)
				const expected = baseInv.map((row) =>
					row.map((z) => c(z.re / scale, z.im / scale))
				)
				assertMatricesClose(scaledInv, expected, 1e-10 / scale)
			}
		})

		test('respects custom tolerance for nearly singular matrices', () => {
			const nearSingular = [
				[c(1, 0), c(0, 0)],
				[c(0, 0), c(1e-10, 0)],
			]
			// Rejected with looser tolerance 1e-9
			assert.throws(
				() => inverseComplexIterative(nearSingular, 1e-9),
				RangeError
			)
			// Accepted with default tolerance 1e-12
			const inv = inverseComplexIterative(nearSingular, 1e-12)
			assertMatricesClose(inv, [
				[c(1, 0), c(0, 0)],
				[c(0, 0), c(1e10, 0)],
			], 1e-2)
		})

		test('throws RangeError for singular complex matrices', () => {
			// 1x1 zero
			assert.throws(() => inverseComplexIterative([[c(0, 0)]]), RangeError)
			// 2x2 zero matrix
			assert.throws(
				() => inverseComplexIterative([[c(0, 0), c(0, 0)], [c(0, 0), c(0, 0)]]),
				RangeError
			)
			// 2x2 complex linearly dependent rows: row 2 = (1 + 2i) * row 1
			assert.throws(
				() =>
					inverseComplexIterative([
						[c(1, 1), c(2, -1)],
						[c(-1, 3), c(4, 3)],
					]),
				RangeError
			)
			// 3x3 rank-deficient matrix: row 3 = row 1 + i * row 2
			assert.throws(
				() =>
					inverseComplexIterative([
						[c(1, 0), c(2, 1), c(-1, 2)],
						[c(0, 1), c(1, -1), c(3, 0)],
						[c(0, 0), c(3, 2), c(-1, 5)],
					]),
				RangeError
			)
		})
	})

	describe('input validation', () => {
		test('throws TypeError for non-array matrix', () => {
			for (const bad of [null, undefined, 42, 'matrix', {}, true]) {
				assert.throws(() => inverseComplexIterative(bad), TypeError)
			}
		})

		test('throws RangeError for empty matrix', () => {
			assert.throws(() => inverseComplexIterative([]), RangeError)
		})

		test('throws TypeError for non-array rows', () => {
			assert.throws(() => inverseComplexIterative([null]), TypeError)
			assert.throws(() => inverseComplexIterative([c(1, 0)]), TypeError)
		})

		test('throws RangeError for non-square or ragged matrices', () => {
			assert.throws(
				() => inverseComplexIterative([[c(1, 0), c(2, 0)]]),
				RangeError
			)
			assert.throws(
				() => inverseComplexIterative([[c(1, 0)], [c(2, 0)]]),
				RangeError
			)
			assert.throws(
				() =>
					inverseComplexIterative([
						[c(1, 0), c(2, 0)],
						[c(3, 0)],
					]),
				RangeError
			)
		})

		test('throws TypeError for invalid complex entry shapes or types', () => {
			for (const badEntry of [
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
			]) {
				assert.throws(() => inverseComplexIterative([[badEntry]]), TypeError)
			}
		})

		test('throws RangeError for non-finite complex entries', () => {
			for (const badEntry of [
				c(NaN, 0),
				c(0, NaN),
				c(Infinity, 1),
				c(1, -Infinity),
			]) {
				assert.throws(() => inverseComplexIterative([[badEntry]]), RangeError)
			}
		})

		test('validates tolerance parameter', () => {
			const I = identity(1)
			assert.throws(() => inverseComplexIterative(I, '1e-12'), TypeError)
			assert.throws(() => inverseComplexIterative(I, null), TypeError)
			assert.throws(() => inverseComplexIterative(I, -1e-12), RangeError)
			assert.throws(() => inverseComplexIterative(I, NaN), RangeError)
			assert.throws(() => inverseComplexIterative(I, Infinity), RangeError)
		})
	})

	describe('cross-checks against independent computations', () => {
		test('matches independent 2x2 and 3x3 adjugate/determinant formulas', () => {
			const A2 = [
				[c(2, -3), c(1, 4)],
				[c(-5, 2), c(3, 1)],
			]
			assertMatricesClose(inverseComplexIterative(A2), inverse2x2Adjugate(A2), 1e-12)

			const A3 = [
				[c(2, 1), c(-1, 3), c(0, -2)],
				[c(4, -2), c(1, 1), c(3, -1)],
				[c(-1, 5), c(2, 0), c(1, 4)],
			]
			assertMatricesClose(inverseComplexIterative(A3), inverse3x3Adjugate(A3), 1e-12)
		})

		test('matches independent 2n x 2n real block-matrix embedding isomorphism', () => {
			const n = 4
			const rng = makeSeededRng(20261122)
			const A = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) =>
					c(rng() + (i === j ? 3 : 0), rng())
				)
			)

			// Embed A = X + iY into [[X, -Y], [Y, X]] in R^(2n x 2n)
			const M = Array.from({ length: 2 * n }, () => new Array(2 * n).fill(0))
			for (let i = 0; i < n; i++) {
				for (let j = 0; j < n; j++) {
					M[i][j] = A[i][j].re
					M[i][j + n] = -A[i][j].im
					M[i + n][j] = A[i][j].im
					M[i + n][j + n] = A[i][j].re
				}
			}

			const Minv = invertRealMatrix(M)
			const expected = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => c(Minv[i][j], Minv[i + n][j]))
			)

			const actual = inverseComplexIterative(A)
			assertMatricesClose(actual, expected, 1e-11)
		})

		test('unitary DFT matrix satisfies F^-1 = F* (conjugate transpose)', () => {
			const n = 5
			const scale = 1 / Math.sqrt(n)
			const F = Array.from({ length: n }, (_, j) =>
				Array.from({ length: n }, (_, k) => {
					const angle = (-2 * Math.PI * j * k) / n
					return c(scale * Math.cos(angle), scale * Math.sin(angle))
				})
			)

			const Finv = inverseComplexIterative(F)
			const Fstar = conjTranspose(F)
			assertMatricesClose(Finv, Fstar, 1e-12)
		})

		test('satisfies algebraic inverse identities across multiple sizes', () => {
			const rng = makeSeededRng(424242)
			for (const n of [1, 2, 3, 4, 6, 8]) {
				const A = Array.from({ length: n }, (_, i) =>
					Array.from({ length: n }, (_, j) =>
						c(rng() * 2 + (i === j ? 4 : 0), rng() * 2)
					)
				)
				const B = Array.from({ length: n }, (_, i) =>
					Array.from({ length: n }, (_, j) =>
						c(rng() * 2 + (i === j ? 4 : 0), rng() * 2)
					)
				)

				const Ainv = inverseComplexIterative(A)
				const Binv = inverseComplexIterative(B)
				const I = identity(n)

				// A * A^-1 = I and A^-1 * A = I
				assertMatricesClose(matMul(A, Ainv), I, 1e-10)
				assertMatricesClose(matMul(Ainv, A), I, 1e-10)

				// (A^-1)^-1 = A
				assertMatricesClose(inverseComplexIterative(Ainv), A, 1e-10)

				// (A * B)^-1 = B^-1 * A^-1
				assertMatricesClose(
					inverseComplexIterative(matMul(A, B)),
					matMul(Binv, Ainv),
					1e-10
				)

				// (A*)^-1 = (A^-1)*
				assertMatricesClose(
					inverseComplexIterative(conjTranspose(A)),
					conjTranspose(Ainv),
					1e-10
				)
			}
		})
	})
})
