import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { determinantComplexIterative } from './determinantComplexIterative.js'

const c = (re, im = 0) => ({ re, im })

function assertComplexClose(actual, expected, eps = 1e-9, msg = '') {
	assert.equal(typeof actual, 'object', `${msg} expected object`)
	assert.ok(actual !== null, `${msg} expected non-null`)
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`${msg} real part mismatch: got ${actual.re}, expected ${expected.re} (eps=${eps})`,
	)
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`${msg} imag part mismatch: got ${actual.im}, expected ${expected.im} (eps=${eps})`,
	)
}

function cMul(a, b) {
	return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }
}

function cAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im }
}

function cSub(a, b) {
	return { re: a.re - b.re, im: a.im - b.im }
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

/**
 * Independent reference implementation via recursive Laplace cofactor expansion.
 * Used solely for cross-checking small matrices (n <= 5).
 */
function determinantCofactorReference(matrix) {
	const n = matrix.length
	if (n === 0) return c(1, 0)
	if (n === 1) return { re: matrix[0][0].re, im: matrix[0][0].im }
	if (n === 2) {
		return cSub(cMul(matrix[0][0], matrix[1][1]), cMul(matrix[0][1], matrix[1][0]))
	}
	let total = c(0, 0)
	for (let col = 0; col < n; col++) {
		const minor = []
		for (let r = 1; r < n; r++) {
			const row = []
			for (let k = 0; k < n; k++) {
				if (k !== col) row.push(matrix[r][k])
			}
			minor.push(row)
		}
		const subDet = determinantCofactorReference(minor)
		const term = cMul(matrix[0][col], subDet)
		total = col % 2 === 0 ? cAdd(total, term) : cSub(total, term)
	}
	return total
}

describe('determinantComplexIterative', () => {
	test('handles 0x0 and 1x1 matrices', () => {
		assert.deepStrictEqual(determinantComplexIterative([]), { re: 1, im: 0 })
		assert.deepStrictEqual(determinantComplexIterative([[c(3, -4)]]), { re: 3, im: -4 })
		assert.deepStrictEqual(determinantComplexIterative([[c(-0, -0)]]), { re: 0, im: 0 })
	})

	test('computes 2x2 complex determinants accurately', () => {
		// [[1+2i, 3-i], [4+i, 2+5i]]
		// (1+2i)(2+5i) = (2 - 10) + (5 + 4)i = -8 + 9i
		// (3-i)(4+i)   = (12 + 1) + (3 - 4)i = 13 - i
		// det = (-8 - 13) + (9 - (-1))i = -21 + 10i
		const m = [
			[c(1, 2), c(3, -1)],
			[c(4, 1), c(2, 5)],
		]
		assertComplexClose(determinantComplexIterative(m), c(-21, 10))
	})

	test('handles matrices requiring pivoting (zeroes on diagonal)', () => {
		// Anti-diagonal 3x3: det = -(i * (2+i) * (3-i))
		// (2+i)(3-i) = 7 + i; i*(7+i) = -1 + 7i; negated = 1 - 7i
		const antiDiag = [
			[c(0, 0), c(0, 0), c(0, 1)],
			[c(0, 0), c(2, 1), c(0, 0)],
			[c(3, -1), c(0, 0), c(0, 0)],
		]
		assertComplexClose(determinantComplexIterative(antiDiag), c(1, -7))

		// Permutation matrix with odd parity -> det = -1
		const swap2 = [
			[c(0, 0), c(1, 0)],
			[c(1, 0), c(0, 0)],
		]
		assertComplexClose(determinantComplexIterative(swap2), c(-1, 0))
	})

	test('handles singular matrices (zero row, duplicate rows, linearly dependent rows)', () => {
		const zeroRow = [
			[c(1, 2), c(3, 4)],
			[c(0, 0), c(0, 0)],
		]
		assert.deepStrictEqual(determinantComplexIterative(zeroRow), { re: 0, im: 0 })

		// Row 2 = (1+i)*Row 0 + (2-i)*Row 1
		const r0 = [c(1, -1), c(2, 3), c(-1, 4)]
		const r1 = [c(3, 1), c(-2, 0), c(5, -2)]
		const a = c(1, 1)
		const b = c(2, -1)
		const r2 = [0, 1, 2].map((j) => cAdd(cMul(a, r0[j]), cMul(b, r1[j])))
		assertComplexClose(determinantComplexIterative([r0, r1, r2]), c(0, 0), 1e-12)
	})

	test('computes triangular and diagonal matrices', () => {
		const upper = [
			[c(1, 1), c(5, -2), c(3, 7)],
			[c(0, 0), c(2, -1), c(-4, 1)],
			[c(0, 0), c(0, 0), c(0, 3)],
		]
		// Product of diagonal: (1+i)(2-i)(3i) = (3+i)(3i) = -3 + 9i
		assertComplexClose(determinantComplexIterative(upper), c(-3, 9))
	})

	test('does not mutate input matrix or entries', () => {
		const original = [
			[c(0, 1), c(2, -3)],
			[c(4, 5), c(-1, 2)],
		]
		const snapshot = structuredClone(original)
		determinantComplexIterative(original)
		assert.deepStrictEqual(original, snapshot)
	})

	test('handles very large and very small scaled matrices without overflow/underflow', () => {
		const scale = 1e100
		const large = [
			[c(scale, scale), c(0, scale)],
			[c(scale, 0), c(scale, -scale)],
		]
		// det = (1+i)(1-i)*s^2 - i*s^2 = (2 - i) * s^2
		const detLarge = determinantComplexIterative(large)
		assert.ok(Math.abs(detLarge.re / (scale * scale) - 2) < 1e-12)
		assert.ok(Math.abs(detLarge.im / (scale * scale) - -1) < 1e-12)

		const tiny = 1e-100
		const small = [
			[c(tiny, tiny), c(0, tiny)],
			[c(tiny, 0), c(tiny, -tiny)],
		]
		const detSmall = determinantComplexIterative(small)
		assert.ok(Math.abs(detSmall.re / (tiny * tiny) - 2) < 1e-12)
		assert.ok(Math.abs(detSmall.im / (tiny * tiny) - -1) < 1e-12)
	})

	test('cross-check: matches independent recursive cofactor expansion on 3x3, 4x4, 5x5 complex matrices', () => {
		// Deterministic PRNG (LCG)
		let seed = 42
		const nextVal = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0
			return ((seed % 19) - 9) / 2
		}

		for (const n of [3, 4, 5]) {
			const m = Array.from({ length: n }, () =>
				Array.from({ length: n }, () => c(nextVal(), nextVal())),
			)
			const actual = determinantComplexIterative(m)
			const expected = determinantCofactorReference(m)
			assertComplexClose(actual, expected, 1e-7, `n=${n} cofactor cross-check`)
		}
	})

	test('cross-check: satisfies Vandermonde closed-form formula over C for n=6', () => {
		const nodes = [c(1, 0), c(0, 1), c(-1, 1), c(2, -1), c(-0.5, -1.5), c(1.5, 0.5)]
		const n = nodes.length
		const V = Array.from({ length: n }, (_, i) => {
			const row = []
			let pow = c(1, 0)
			for (let j = 0; j < n; j++) {
				row.push(pow)
				pow = cMul(pow, nodes[i])
			}
			return row
		})

		let expected = c(1, 0)
		for (let i = 0; i < n; i++) {
			for (let j = i + 1; j < n; j++) {
				expected = cMul(expected, cSub(nodes[j], nodes[i]))
			}
		}

		const actual = determinantComplexIterative(V)
		assertComplexClose(actual, expected, 1e-7, 'Vandermonde n=6')
	})

	test('cross-check: satisfies algebraic identities det(AB)=det(A)det(B), det(A^T)=det(A), det(A^H)=conj(det(A)), and unitary |det|=1', () => {
		const A = [
			[c(1, 2), c(-1, 3), c(0, -2), c(2, 1)],
			[c(3, -1), c(2, 0), c(1, 4), c(-3, 2)],
			[c(-2, 1), c(0, -1), c(3, 1), c(1, -2)],
			[c(4, 2), c(1, -3), c(-1, 0), c(2, 3)],
		]
		const B = [
			[c(2, -1), c(1, 1), c(-2, 0), c(0, 3)],
			[c(-1, 2), c(3, -2), c(1, 1), c(2, -1)],
			[c(0, -3), c(2, 1), c(4, -1), c(-1, 2)],
			[c(1, 0), c(-2, 2), c(0, 1), c(3, 1)],
		]

		const detA = determinantComplexIterative(A)
		const detB = determinantComplexIterative(B)
		const detAB = determinantComplexIterative(matMul(A, B))
		assertComplexClose(detAB, cMul(detA, detB), 1e-6, 'det(AB) == det(A)*det(B)')

		// Transpose
		const AT = A[0].map((_, j) => A.map((row) => row[j]))
		assertComplexClose(determinantComplexIterative(AT), detA, 1e-9, 'det(A^T) == det(A)')

		// Conjugate transpose (Hermitian adjoint)
		const AH = A[0].map((_, j) => A.map((row) => c(row[j].re, -row[j].im)))
		assertComplexClose(
			determinantComplexIterative(AH),
			c(detA.re, -detA.im),
			1e-9,
			'det(A^H) == conj(det(A))',
		)

		// Normalized 8x8 DFT matrix is unitary => |det(F)| == 1
		const N = 8
		const invSqrtN = 1 / Math.sqrt(N)
		const F = Array.from({ length: N }, (_, j) =>
			Array.from({ length: N }, (_, k) => {
				const angle = (-2 * Math.PI * j * k) / N
				return c(Math.cos(angle) * invSqrtN, Math.sin(angle) * invSqrtN)
			}),
		)
		const detF = determinantComplexIterative(F)
		const modF = Math.hypot(detF.re, detF.im)
		assert.ok(Math.abs(modF - 1) < 1e-9, `expected |det(DFT_8)| == 1, got ${modF}`)
	})

	test('validates invalid inputs thoroughly', () => {
		// Non-array matrix
		assert.throws(() => determinantComplexIterative(null), TypeError)
		assert.throws(() => determinantComplexIterative(undefined), TypeError)
		assert.throws(() => determinantComplexIterative(42), TypeError)
		assert.throws(() => determinantComplexIterative('matrix'), TypeError)
		assert.throws(() => determinantComplexIterative({}), TypeError)

		// Non-array row
		assert.throws(() => determinantComplexIterative([null]), TypeError)
		assert.throws(() => determinantComplexIterative([123]), TypeError)

		// Non-square matrices
		assert.throws(() => determinantComplexIterative([[]]), RangeError)
		assert.throws(() => determinantComplexIterative([[c(1), c(2)]]), RangeError)
		assert.throws(
			() =>
				determinantComplexIterative([
					[c(1), c(2)],
					[c(3)],
				]),
			RangeError,
		)

		// Invalid complex entries
		assert.throws(() => determinantComplexIterative([[1]]), TypeError)
		assert.throws(() => determinantComplexIterative([[null]]), TypeError)
		assert.throws(() => determinantComplexIterative([[[1, 2]]]), TypeError)
		assert.throws(() => determinantComplexIterative([[{ re: 1 }]]), TypeError)
		assert.throws(() => determinantComplexIterative([[{ im: 2 }]]), TypeError)
		assert.throws(() => determinantComplexIterative([[{ re: '1', im: 0 }]]), TypeError)

		// Non-finite numbers
		assert.throws(() => determinantComplexIterative([[c(NaN, 0)]]), RangeError)
		assert.throws(() => determinantComplexIterative([[c(0, NaN)]]), RangeError)
		assert.throws(() => determinantComplexIterative([[c(Infinity, 0)]]), RangeError)
		assert.throws(() => determinantComplexIterative([[c(0, -Infinity)]]), RangeError)
	})
})
