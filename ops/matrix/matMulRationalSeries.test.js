import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { matMulRationalSeries } from './matMulRationalSeries.js'

/** Helper to construct a rational concisely. */
const q = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

function assertNormalizedMatrix(mat) {
	assert.ok(Array.isArray(mat) && mat.length > 0)
	for (const row of mat) {
		assert.ok(Array.isArray(row) && row.length === mat[0].length)
		for (const entry of row) {
			assert.equal(typeof entry.num, 'bigint')
			assert.equal(typeof entry.den, 'bigint')
			assert.ok(entry.den > 0n, `expected den > 0n, got ${entry.den}`)
			assert.equal(gcd(entry.num, entry.den), 1n, `not in lowest terms: ${entry.num}/${entry.den}`)
			if (entry.num === 0n) {
				assert.equal(entry.den, 1n)
			}
		}
	}
}

function ratAdd(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	const g = gcd(num, den)
	const sign = den < 0n ? -1n : 1n
	return { num: (sign * num) / g, den: (sign * den) / g }
}

function ratSub(a, b) {
	return ratAdd(a, { num: -b.num, den: b.den })
}

function ratMul(a, b) {
	const num = a.num * b.num
	const den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	const g = gcd(num, den)
	const sign = den < 0n ? -1n : 1n
	return { num: (sign * num) / g, den: (sign * den) / g }
}

function det2x2(m) {
	return ratSub(ratMul(m[0][0], m[1][1]), ratMul(m[0][1], m[1][0]))
}

function transpose(m) {
	return m[0].map((_, j) => m.map((row) => row[j]))
}

function matAdd(a, b) {
	return a.map((row, i) => row.map((v, j) => ratAdd(v, b[i][j])))
}

describe('matMulRationalSeries', () => {
	test('multiplies 2x2 square rational matrices and reduces to lowest terms', () => {
		const A = [
			[q(1, 2), q(2, 3)],
			[q(-3, 4), q(5, 6)],
		]
		const B = [
			[q(2, 5), q(-1, 3)],
			[q(3, 4), q(4, 9)],
		]
		// C00 = 1/2*2/5 + 2/3*3/4 = 1/5 + 1/2 = 7/10
		// C01 = 1/2*(-1/3) + 2/3*4/9 = -1/6 + 8/27 = (-9 + 16)/54 = 7/54
		// C10 = -3/4*2/5 + 5/6*3/4 = -3/10 + 5/8 = (-12 + 25)/40 = 13/40
		// C11 = -3/4*(-1/3) + 5/6*4/9 = 1/4 + 10/27 = (27 + 40)/108 = 67/108
		const C = matMulRationalSeries(A, B)
		assertNormalizedMatrix(C)
		assert.deepEqual(C, [
			[q(7, 10), q(7, 54)],
			[q(13, 40), q(67, 108)],
		])
	})

	test('multiplies rectangular matrices (2x3 * 3x2 -> 2x2 and 3x1 * 1x3 -> 3x3)', () => {
		const A = [
			[q(1, 2), q(1, 3), q(1, 6)],
			[q(-2, 3), q(0, 5), q(4, 5)],
		]
		const B = [
			[q(6, 1), q(-2, 3)],
			[q(3, 2), q(9, 4)],
			[q(-12, 1), q(5, 2)],
		]
		// C00 = 3 + 1/2 - 2 = 3/2
		// C01 = -1/3 + 3/4 + 5/12 = (-4 + 9 + 5)/12 = 10/12 = 5/6
		// C10 = -4 + 0 - 48/5 = -68/5
		// C11 = 4/9 + 0 + 2 = 22/9
		const C = matMulRationalSeries(A, B)
		assertNormalizedMatrix(C)
		assert.deepEqual(C, [
			[q(3, 2), q(5, 6)],
			[q(-68, 5), q(22, 9)],
		])

		const col = [[q(2, 3)], [q(-3, 5)], [q(0, 7)]]
		const row = [[q(3, 4), q(-5, 6), q(7, 2)]]
		const outer = matMulRationalSeries(col, row)
		assertNormalizedMatrix(outer)
		assert.deepEqual(outer, [
			[q(1, 2), q(-5, 9), q(7, 3)],
			[q(-9, 20), q(1, 2), q(-21, 10)],
			[q(0, 1), q(0, 1), q(0, 1)],
		])
	})

	test('handles 1x1 matrices, unreduced inputs, and negative denominators', () => {
		const res1 = matMulRationalSeries([[q(6, -9)]], [[q(-15, 10)]])
		assertNormalizedMatrix(res1)
		assert.deepEqual(res1, [[q(1, 1)]])

		const resZero = matMulRationalSeries([[q(0, -7)]], [[q(42, -13)]])
		assertNormalizedMatrix(resZero)
		assert.deepEqual(resZero, [[q(0, 1)]])
	})

	test('satisfies identity and zero matrix properties', () => {
		const I3 = [
			[q(1), q(0), q(0)],
			[q(0), q(1), q(0)],
			[q(0), q(0), q(1)],
		]
		const Z3 = [
			[q(0), q(0), q(0)],
			[q(0), q(0), q(0)],
			[q(0), q(0), q(0)],
		]
		const M = [
			[q(7, 11), q(-4, 6), q(0, -3)],
			[q(12, -8), q(5, 13), q(9, 3)],
			[q(-1, 2), q(2, 7), q(-11, -22)],
		]
		const expectedM = [
			[q(7, 11), q(-2, 3), q(0, 1)],
			[q(-3, 2), q(5, 13), q(3, 1)],
			[q(-1, 2), q(2, 7), q(1, 2)],
		]

		assert.deepEqual(matMulRationalSeries(I3, M), expectedM)
		assert.deepEqual(matMulRationalSeries(M, I3), expectedM)
		assert.deepEqual(matMulRationalSeries(Z3, M), Z3)
		assert.deepEqual(matMulRationalSeries(M, Z3), Z3)
	})

	test('preserves exact precision with large BigInt rationals and Hilbert inverse', () => {
		// Exact 3x3 Hilbert matrix H[i][j] = 1/(i+j+1) and its exact integer inverse
		const H3 = [
			[q(1, 1), q(1, 2), q(1, 3)],
			[q(1, 2), q(1, 3), q(1, 4)],
			[q(1, 3), q(1, 4), q(1, 5)],
		]
		const H3Inv = [
			[q(9), q(-36), q(30)],
			[q(-36), q(192), q(-180)],
			[q(30), q(-180), q(180)],
		]
		const prod = matMulRationalSeries(H3, H3Inv)
		assertNormalizedMatrix(prod)
		assert.deepEqual(prod, [
			[q(1), q(0), q(0)],
			[q(0), q(1), q(0)],
			[q(0), q(0), q(1)],
		])

		// Catastrophic cancellation beyond IEEE-754 float precision
		const big = 10n ** 30n
		const A = [[{ num: big, den: 1n }, { num: 1n, den: big }]]
		const B = [[{ num: 1n, den: big }], [{ num: -big, den: 1n }]]
		const C = matMulRationalSeries(A, B)
		assertNormalizedMatrix(C)
		assert.deepEqual(C, [[{ num: 0n, den: 1n }]])
	})

	test('does not mutate input matrices or their entry objects', () => {
		const entry = { num: 4n, den: -8n }
		const A = [[entry]]
		const B = [[{ num: 2n, den: 1n }]]
		const C = matMulRationalSeries(A, B)
		assert.deepEqual(C, [[{ num: -1n, den: 1n }]])
		assert.deepEqual(entry, { num: 4n, den: -8n })
	})

	test('cross-check: associativity (AB)C = A(BC) and distributivity A(B+C) = AB+AC', () => {
		const A = [
			[q(1, 3), q(-2, 5), q(4, 7)],
			[q(5, 6), q(1, 2), q(-3, 4)],
		]
		const B = [
			[q(2, 9), q(-1, 4)],
			[q(3, 5), q(7, 8)],
			[q(-5, 6), q(1, 3)],
		]
		const C = [
			[q(4, 5), q(-3, 7), q(1, 2)],
			[q(-2, 3), q(5, 9), q(7, 11)],
		]

		const leftAssoc = matMulRationalSeries(matMulRationalSeries(A, B), C)
		const rightAssoc = matMulRationalSeries(A, matMulRationalSeries(B, C))
		assertNormalizedMatrix(leftAssoc)
		assert.deepEqual(leftAssoc, rightAssoc)

		const B2 = [
			[q(-1, 3), q(2, 5)],
			[q(4, 7), q(-3, 2)],
			[q(1, 4), q(5, 6)],
		]
		const lhsDist = matMulRationalSeries(A, matAdd(B, B2))
		const rhsDist = matAdd(matMulRationalSeries(A, B), matMulRationalSeries(A, B2))
		assertNormalizedMatrix(lhsDist)
		assert.deepEqual(lhsDist, rhsDist)
	})

	test('cross-check: det(AB) = det(A)det(B) for 2x2 and (AB)^T = B^T A^T', () => {
		const A = [
			[q(5, 7), q(-3, 11)],
			[q(2, 9), q(4, 5)],
		]
		const B = [
			[q(-7, 13), q(1, 6)],
			[q(8, 3), q(-5, 4)],
		]
		const AB = matMulRationalSeries(A, B)
		assertNormalizedMatrix(AB)
		assert.deepEqual(det2x2(AB), ratMul(det2x2(A), det2x2(B)))

		const lhsT = transpose(AB)
		const rhsT = matMulRationalSeries(transpose(B), transpose(A))
		assert.deepEqual(lhsT, rhsT)
	})

	test('throws on invalid matrix shapes and incompatible dimensions', () => {
		const valid = [[q(1)]]
		assert.throws(() => matMulRationalSeries(null, valid), TypeError)
		assert.throws(() => matMulRationalSeries(valid, undefined), TypeError)
		assert.throws(() => matMulRationalSeries('not a matrix', valid), TypeError)
		assert.throws(() => matMulRationalSeries([q(1)], valid), TypeError)
		assert.throws(() => matMulRationalSeries([], valid), RangeError)
		assert.throws(() => matMulRationalSeries([[]], valid), RangeError)
		assert.throws(() => matMulRationalSeries(valid, [[]]), RangeError)

		// Ragged matrix
		assert.throws(
			() =>
				matMulRationalSeries(
					[
						[q(1), q(2)],
						[q(3)],
					],
					[[q(1)], [q(2)]],
				),
			RangeError,
		)

		// Incompatible dimensions: 2x3 * 2x2
		assert.throws(
			() =>
				matMulRationalSeries(
					[
						[q(1), q(2), q(3)],
						[q(4), q(5), q(6)],
					],
					[
						[q(1), q(2)],
						[q(3), q(4)],
					],
				),
			RangeError,
		)
	})

	test('throws on invalid rational entries including zero denominator and non-BigInt fields', () => {
		const valid = [[q(1)]]
		assert.throws(() => matMulRationalSeries([[{ num: 1n, den: 0n }]], valid), RangeError)
		assert.throws(() => matMulRationalSeries(valid, [[{ num: 0n, den: 0n }]]), RangeError)
		assert.throws(() => matMulRationalSeries([[{ num: 1, den: 2n }]], valid), TypeError)
		assert.throws(() => matMulRationalSeries([[{ num: 1n, den: 2 }]], valid), TypeError)
		assert.throws(() => matMulRationalSeries([[null]], valid), TypeError)
		assert.throws(() => matMulRationalSeries([[{}]], valid), TypeError)
	})
})
