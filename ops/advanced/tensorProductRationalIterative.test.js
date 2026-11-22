import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { tensorProductRationalIterative } from './tensorProductRationalIterative.js'

/** Helper to construct a rational `{ num: BigInt, den: BigInt }`. */
function rat(num, den = 1n) {
	return { num: BigInt(num), den: BigInt(den) }
}

/** Independent Euclidean GCD for test verification helpers. */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

/** Independent rational normalization for test cross-checks. */
function norm(r) {
	if (r.num === 0n) return { num: 0n, den: 1n }
	const s = r.den < 0n ? -1n : 1n
	const n = r.num * s
	const d = r.den * s
	const g = gcd(n, d)
	return { num: n / g, den: d / g }
}

/** Independent exact rational addition. */
function ratAdd(a, b) {
	return norm({ num: a.num * b.den + b.num * a.den, den: a.den * b.den })
}

/** Independent exact rational multiplication. */
function ratMul(a, b) {
	return norm({ num: a.num * b.num, den: a.den * b.den })
}

/** Independent exact matrix multiplication over rationals. */
function matMul(A, B) {
	const m = A.length
	const n = A[0].length
	const p = B[0].length
	const out = Array.from({ length: m }, () => new Array(p))
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < p; j++) {
			let sum = rat(0n, 1n)
			for (let k = 0; k < n; k++) {
				sum = ratAdd(sum, ratMul(A[i][k], B[k][j]))
			}
			out[i][j] = sum
		}
	}
	return out
}

/** Independent exact matrix addition over rationals. */
function matAdd(A, B) {
	return A.map((row, i) => row.map((val, j) => ratAdd(val, B[i][j])))
}

/** Independent exact matrix transpose. */
function matTranspose(A) {
	return A[0].map((_, j) => A.map((row) => row[j]))
}

/** Independent exact matrix trace over rationals. */
function matTrace(A) {
	let sum = rat(0n, 1n)
	for (let i = 0; i < A.length; i++) {
		sum = ratAdd(sum, A[i][i])
	}
	return sum
}

/** Independent exact determinant of a 2x2 matrix. */
function det2(A) {
	return ratAdd(ratMul(A[0][0], A[1][1]), { num: -ratMul(A[0][1], A[1][0]).num, den: ratMul(A[0][1], A[1][0]).den })
}

/** Asserts every entry in a 1D or 2D rational tensor is reduced with positive denominator. */
function assertCanonicalRationals(tensor) {
	const rows = Array.isArray(tensor[0]) ? tensor : [tensor]
	for (const row of rows) {
		for (const entry of row) {
			assert.equal(typeof entry.num, 'bigint')
			assert.equal(typeof entry.den, 'bigint')
			assert.ok(entry.den > 0n, `Expected positive denominator, got ${entry.den}`)
			if (entry.num === 0n) {
				assert.equal(entry.den, 1n, 'Zero must have denominator 1n')
			} else {
				assert.equal(gcd(entry.num, entry.den), 1n, `Expected lowest terms for ${entry.num}/${entry.den}`)
			}
		}
	}
}

describe('tensorProductRationalIterative', () => {
	describe('normal cases', () => {
		test('2x2 by 2x2 Kronecker product over exact rationals', () => {
			const A = [
				[rat(1, 2), rat(-2, 3)],
				[rat(3, 4), rat(0, 5)],
			]
			const B = [
				[rat(2, 5), rat(3, 2)],
				[rat(-4, 9), rat(6, 7)],
			]

			const result = tensorProductRationalIterative(A, B)
			assertCanonicalRationals(result)
			assert.deepEqual(result, [
				[rat(1, 5), rat(3, 4), rat(-4, 15), rat(-1, 1)],
				[rat(-2, 9), rat(3, 7), rat(8, 27), rat(-4, 7)],
				[rat(3, 10), rat(9, 8), rat(0, 1), rat(0, 1)],
				[rat(-1, 3), rat(9, 14), rat(0, 1), rat(0, 1)],
			])
		})

		test('rectangular matrices (2x3) ⊗ (3x2) produces (6x6)', () => {
			const A = [
				[rat(1, 2), rat(2, 3), rat(-1, 4)],
				[rat(5, 6), rat(0, 1), rat(3, 5)],
			]
			const B = [
				[rat(2, 1), rat(1, 3)],
				[rat(-3, 2), rat(4, 5)],
				[rat(1, 7), rat(-6, 11)],
			]

			const result = tensorProductRationalIterative(A, B)
			assert.equal(result.length, 6)
			for (const row of result) {
				assert.equal(row.length, 6)
			}
			assertCanonicalRationals(result)

			// Verify every single entry directly against definition
			for (let i = 0; i < A.length; i++) {
				for (let j = 0; j < A[0].length; j++) {
					for (let r = 0; r < B.length; r++) {
						for (let c = 0; c < B[0].length; c++) {
							assert.deepEqual(result[i * B.length + r][j * B[0].length + c], ratMul(A[i][j], B[r][c]))
						}
					}
				}
			}
		})

		test('1D vector ⊗ 1D vector returns 1D vector in lowest terms', () => {
			const u = [rat(2, 3), rat(-3, 4), rat(0, 7)]
			const v = [rat(3, 5), rat(-8, 9)]
			const result = tensorProductRationalIterative(u, v)

			assertCanonicalRationals(result)
			assert.deepEqual(result, [
				rat(2, 5),
				rat(-16, 27),
				rat(-9, 20),
				rat(2, 3),
				rat(0, 1),
				rat(0, 1),
			])
		})

		test('mixed 1D vector and 2D matrix operands', () => {
			const v = [rat(1, 2), rat(3, 4)]
			const M = [
				[rat(2, 3), rat(4, 5)],
				[rat(-6, 7), rat(8, 9)],
			]

			const vKronM = tensorProductRationalIterative(v, M)
			assertCanonicalRationals(vKronM)
			assert.deepEqual(vKronM, [
				[rat(1, 3), rat(2, 5), rat(1, 2), rat(3, 5)],
				[rat(-3, 7), rat(4, 9), rat(-9, 14), rat(2, 3)],
			])

			const mKronV = tensorProductRationalIterative(M, v)
			assertCanonicalRationals(mKronV)
			assert.deepEqual(mKronV, [
				[rat(1, 3), rat(1, 2), rat(2, 5), rat(3, 5)],
				[rat(-3, 7), rat(-9, 14), rat(4, 9), rat(2, 3)],
			])
		})
	})

	describe('edge cases', () => {
		test('normalizes unreduced inputs, negative denominators, and signed zeros', () => {
			const A = [
				[rat(6, -9), rat(-10, -15)],
				[rat(0, -13), rat(0, 42)],
			]
			const B = [[rat(-12, -16), rat(15, -25)]]

			const result = tensorProductRationalIterative(A, B)
			assertCanonicalRationals(result)
			assert.deepEqual(result, [
				[rat(-1, 2), rat(2, 5), rat(1, 2), rat(-2, 5)],
				[rat(0, 1), rat(0, 1), rat(0, 1), rat(0, 1)],
			])
		})

		test('1x1 identity matrix acts as left and right unit', () => {
			const I1 = [[rat(1, 1)]]
			const M = [
				[rat(-4, 6), rat(15, -25)],
				[rat(0, -3), rat(9, 12)],
			]
			const expected = [
				[rat(-2, 3), rat(-3, 5)],
				[rat(0, 1), rat(3, 4)],
			]
			assert.deepEqual(tensorProductRationalIterative(I1, M), expected)
			assert.deepEqual(tensorProductRationalIterative(M, I1), expected)
		})

		test('handles very large BigInt numerators and denominators without precision loss', () => {
			const bigA = 10n ** 40n + 7n
			const bigB = 10n ** 35n + 9n
			const common = 10n ** 30n + 3n

			const A = [[{ num: bigA * common, den: common * 3n }]]
			const B = [[{ num: 3n * common, den: bigB * common }]]

			const result = tensorProductRationalIterative(A, B)
			assertCanonicalRationals(result)
			const g = gcd(bigA, bigB)
			assert.deepEqual(result, [[{ num: bigA / g, den: bigB / g }]])
		})

		test('does not mutate inputs and returns fresh objects per cell', () => {
			const zero = rat(0, -5)
			const A = [[zero, zero]]
			const B = [[rat(4, 6)]]
			const result = tensorProductRationalIterative(A, B)

			assert.deepEqual(zero, { num: 0n, den: -5n })
			assert.deepEqual(B[0][0], { num: 4n, den: 6n })
			assert.notEqual(result[0][0], result[0][1], 'output cells must not share object references')
			assert.notEqual(result[0][0], zero)
		})
	})

	describe('input validation', () => {
		test('throws TypeError for non-array operands', () => {
			const valid = [[rat(1, 2)]]
			for (const bad of [null, undefined, 42, '1/2', { num: 1n, den: 2n }, true]) {
				assert.throws(() => tensorProductRationalIterative(bad, valid), TypeError)
				assert.throws(() => tensorProductRationalIterative(valid, bad), TypeError)
			}
		})

		test('throws RangeError for empty arrays, empty rows, or ragged matrices', () => {
			const valid = [[rat(1, 2)]]
			assert.throws(() => tensorProductRationalIterative([], valid), RangeError)
			assert.throws(() => tensorProductRationalIterative(valid, []), RangeError)
			assert.throws(() => tensorProductRationalIterative([[]], valid), RangeError)
			assert.throws(() => tensorProductRationalIterative(valid, [[], []]), RangeError)
			assert.throws(
				() => tensorProductRationalIterative([[rat(1), rat(2)], [rat(3)]], valid),
				RangeError
			)
			assert.throws(
				() => tensorProductRationalIterative(valid, [[rat(1)], [rat(2), rat(3)]]),
				RangeError
			)
		})

		test('throws TypeError for mixed row/scalar structures, 3D arrays, sparse arrays, or invalid rational entries', () => {
			const valid = [[rat(1, 2)]]
			assert.throws(() => tensorProductRationalIterative([[rat(1)], rat(2)], valid), TypeError)
			assert.throws(() => tensorProductRationalIterative([rat(1), [rat(2)]], valid), TypeError)
			assert.throws(() => tensorProductRationalIterative([[[rat(1)]]], valid), TypeError)
			assert.throws(() => tensorProductRationalIterative([[null]], valid), TypeError)
			assert.throws(() => tensorProductRationalIterative([[undefined]], valid), TypeError)
			assert.throws(() => tensorProductRationalIterative([[{ num: 1, den: 2 }]], valid), TypeError)
			assert.throws(() => tensorProductRationalIterative([[{ num: 1n, den: 2 }]], valid), TypeError)
			assert.throws(() => tensorProductRationalIterative([[{ num: 1, den: 2n }]], valid), TypeError)
			assert.throws(() => tensorProductRationalIterative([[{ num: NaN, den: 1n }]], valid), TypeError)
			assert.throws(() => tensorProductRationalIterative([[{ num: 1n }]], valid), TypeError)
			// Sparse array
			const sparse = new Array(2)
			sparse[0] = rat(1, 2)
			assert.throws(() => tensorProductRationalIterative(sparse, valid), TypeError)
		})

		test('throws RangeError for zero denominators', () => {
			const valid = [[rat(1, 2)]]
			assert.throws(() => tensorProductRationalIterative([[{ num: 1n, den: 0n }]], valid), RangeError)
			assert.throws(() => tensorProductRationalIterative(valid, [[{ num: 0n, den: 0n }]]), RangeError)
			assert.throws(() => tensorProductRationalIterative([rat(1, 2), { num: 3n, den: 0n }], valid), RangeError)
		})
	})

	describe('mathematical cross-checks', () => {
		test('trace property: tr(A ⊗ B) = tr(A) * tr(B)', () => {
			const A = [
				[rat(3, 5), rat(-1, 2), rat(4, 7)],
				[rat(2, 3), rat(-5, 6), rat(1, 4)],
				[rat(-7, 9), rat(8, 11), rat(2, 5)],
			]
			const B = [
				[rat(-4, 7), rat(5, 3)],
				[rat(9, 11), rat(13, 8)],
			]

			const kronAB = tensorProductRationalIterative(A, B)
			const lhs = matTrace(kronAB)
			const rhs = ratMul(matTrace(A), matTrace(B))
			assert.deepEqual(lhs, rhs)
		})

		test('mixed-product property: (A ⊗ B)(C ⊗ D) = (AC) ⊗ (BD)', () => {
			const A = [
				[rat(1, 2), rat(-2, 3), rat(5, 4)],
				[rat(3, 7), rat(4, 5), rat(-1, 6)],
			] // 2x3
			const C = [
				[rat(2, 5), rat(-3, 2)],
				[rat(7, 4), rat(1, 3)],
				[rat(-5, 8), rat(4, 9)],
			] // 3x2
			const B = [
				[rat(-3, 4), rat(2, 7)],
				[rat(5, 6), rat(-1, 3)],
				[rat(4, 9), rat(7, 2)],
			] // 3x2
			const D = [
				[rat(6, 5), rat(-1, 2), rat(3, 8)],
				[rat(-4, 3), rat(5, 7), rat(2, 9)],
			] // 2x3

			const kronAB = tensorProductRationalIterative(A, B)
			const kronCD = tensorProductRationalIterative(C, D)
			const lhs = matMul(kronAB, kronCD)

			const AC = matMul(A, C)
			const BD = matMul(B, D)
			const rhs = tensorProductRationalIterative(AC, BD)

			assert.deepEqual(lhs, rhs)
		})

		test('associativity, bilinearity, and transpose identities', () => {
			const A = [
				[rat(1, 3), rat(-2, 5)],
				[rat(4, 7), rat(1, 2)],
			]
			const B = [
				[rat(-3, 4), rat(5, 6)],
				[rat(2, 9), rat(-1, 5)],
			]
			const C = [
				[rat(7, 8), rat(-1, 3)],
				[rat(5, 2), rat(4, 11)],
			]

			// Associativity: (A ⊗ B) ⊗ C = A ⊗ (B ⊗ C)
			const assocLeft = tensorProductRationalIterative(tensorProductRationalIterative(A, B), C)
			const assocRight = tensorProductRationalIterative(A, tensorProductRationalIterative(B, C))
			assert.deepEqual(assocLeft, assocRight)

			// Bilinearity: (A + B) ⊗ C = (A ⊗ C) + (B ⊗ C)
			const bilinLeft = tensorProductRationalIterative(matAdd(A, B), C)
			const bilinRight = matAdd(
				tensorProductRationalIterative(A, C),
				tensorProductRationalIterative(B, C)
			)
			assert.deepEqual(bilinLeft, bilinRight)

			// Transpose: (A ⊗ B)^T = A^T ⊗ B^T
			const transLeft = matTranspose(tensorProductRationalIterative(A, B))
			const transRight = tensorProductRationalIterative(matTranspose(A), matTranspose(B))
			assert.deepEqual(transLeft, transRight)

			// Non-commutativity check on distinct matrices
			assert.notDeepEqual(tensorProductRationalIterative(A, B), tensorProductRationalIterative(B, A))
		})

		test('determinant identity on 2x2 block-diagonalized / general 2x2 matrices: det(A ⊗ B) = det(A)^2 * det(B)^2', () => {
			// Use upper-triangular A and B so det(A ⊗ B) is the product of diagonal entries (independent check)
			const A = [
				[rat(3, 4), rat(7, 2)],
				[rat(0, 1), rat(-5, 6)],
			]
			const B = [
				[rat(2, 3), rat(-9, 5)],
				[rat(0, 1), rat(11, 7)],
			]

			const kronAB = tensorProductRationalIterative(A, B)
			// Product of diagonal entries for upper-triangular A ⊗ B
			let detKron = rat(1, 1)
			for (let i = 0; i < kronAB.length; i++) {
				detKron = ratMul(detKron, kronAB[i][i])
			}

			const dA = det2(A)
			const dB = det2(B)
			const expected = ratMul(ratMul(dA, dA), ratMul(dB, dB))
			assert.deepEqual(detKron, expected)
		})
	})
})
