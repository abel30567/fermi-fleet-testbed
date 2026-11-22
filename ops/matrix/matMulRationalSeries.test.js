import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { matMulRationalSeries } from './matMulRationalSeries.js'

const R = (num, den = 1n) => ({ num: BigInt(num), den: BigInt(den) })

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

function assertCanonicalMatrix(M) {
	assert.ok(Array.isArray(M) && M.length > 0, 'result must be a non-empty 2D array')
	const cols = M[0].length
	for (let i = 0; i < M.length; i++) {
		assert.equal(M[i].length, cols, `row ${i} length mismatch`)
		for (let j = 0; j < cols; j++) {
			const q = M[i][j]
			assert.equal(typeof q.num, 'bigint', `[${i}][${j}].num must be bigint`)
			assert.equal(typeof q.den, 'bigint', `[${i}][${j}].den must be bigint`)
			assert.ok(q.den > 0n, `[${i}][${j}].den must be > 0n, got ${q.den}`)
			if (q.num === 0n) {
				assert.equal(q.den, 1n, `[${i}][${j}] zero must have den === 1n`)
			} else {
				assert.equal(gcd(q.num, q.den), 1n, `[${i}][${j}] must be in lowest terms`)
			}
		}
	}
}

function identityMatrix(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? R(1, 1) : R(0, 1)))
	)
}

function zeroMatrix(m, n) {
	return Array.from({ length: m }, () =>
		Array.from({ length: n }, () => R(0, 1))
	)
}

function transpose(M) {
	const m = M.length
	const n = M[0].length
	return Array.from({ length: n }, (_, j) =>
		Array.from({ length: m }, (_, i) => M[i][j])
	)
}

function addRational(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	const g = gcd(num, den)
	const sign = den < 0n ? -1n : 1n
	return { num: (sign * num) / g, den: (sign * den) / g }
}

function mulRational(a, b) {
	const num = a.num * b.num
	const den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	const g = gcd(num, den)
	const sign = den < 0n ? -1n : 1n
	return { num: (sign * num) / g, den: (sign * den) / g }
}

function matAdd(A, B) {
	return A.map((row, i) => row.map((val, j) => addRational(val, B[i][j])))
}

function naiveMatMul(A, B) {
	const m = A.length
	const k = A[0].length
	const n = B[0].length
	return Array.from({ length: m }, (_, i) =>
		Array.from({ length: n }, (_, j) => {
			let acc = { num: 0n, den: 1n }
			for (let p = 0; p < k; p++) {
				acc = addRational(acc, mulRational(A[i][p], B[p][j]))
			}
			return acc
		})
	)
}

function floatMatMul(A, B) {
	const m = A.length
	const k = A[0].length
	const n = B[0].length
	return Array.from({ length: m }, (_, i) =>
		Array.from({ length: n }, (_, j) => {
			let acc = 0
			for (let p = 0; p < k; p++) {
				const a = Number(A[i][p].num) / Number(A[i][p].den)
				const b = Number(B[p][j].num) / Number(B[p][j].den)
				acc += a * b
			}
			return acc
		})
	)
}

describe('matMulRationalSeries', () => {
	describe('square matrices', () => {
		test('1x1 rational matrix multiplication', () => {
			const A = [[R(3, 4)]]
			const B = [[R(8, 9)]]
			const res = matMulRationalSeries(A, B)
			assertCanonicalMatrix(res)
			assert.deepEqual(res, [[R(2, 3)]])
		})

		test('2x2 rational matrix multiplication with reduction to lowest terms', () => {
			const A = [
				[R(1, 2), R(2, 3)],
				[R(3, 4), R(4, 5)],
			]
			const B = [
				[R(6, 5), R(1, 3)],
				[R(3, 2), R(5, 8)],
			]
			// [0][0] = (1/2)(6/5) + (2/3)(3/2) = 3/5 + 1 = 8/5
			// [0][1] = (1/2)(1/3) + (2/3)(5/8) = 1/6 + 5/12 = 7/12
			// [1][0] = (3/4)(6/5) + (4/5)(3/2) = 9/10 + 6/5 = 21/10
			// [1][1] = (3/4)(1/3) + (4/5)(5/8) = 1/4 + 1/2 = 3/4
			const res = matMulRationalSeries(A, B)
			assertCanonicalMatrix(res)
			assert.deepEqual(res, [
				[R(8, 5), R(7, 12)],
				[R(21, 10), R(3, 4)],
			])
		})

		test('3x3 rational matrix multiplication', () => {
			const A = [
				[R(1, 2), R(-1, 3), R(1, 4)],
				[R(2, 5), R(0, 1), R(-3, 7)],
				[R(-1, 6), R(5, 8), R(1, 1)],
			]
			const B = [
				[R(2, 3), R(1, 5), R(-1, 2)],
				[R(-3, 4), R(4, 9), R(1, 3)],
				[R(5, 6), R(-2, 7), R(3, 4)],
			]
			const res = matMulRationalSeries(A, B)
			assertCanonicalMatrix(res)
			assert.deepEqual(res, naiveMatMul(A, B))
		})
	})

	describe('rectangular matrices', () => {
		test('2x3 times 3x4 produces 2x4', () => {
			const A = [
				[R(1, 2), R(-2, 3), R(3, 4)],
				[R(5, 6), R(1, 7), R(-1, 8)],
			]
			const B = [
				[R(2, 1), R(1, 3), R(-1, 2), R(0, 1)],
				[R(3, 5), R(-4, 7), R(2, 9), R(1, 2)],
				[R(-1, 4), R(5, 6), R(3, 8), R(-2, 3)],
			]
			const res = matMulRationalSeries(A, B)
			assertCanonicalMatrix(res)
			assert.equal(res.length, 2)
			assert.equal(res[0].length, 4)
			assert.deepEqual(res, naiveMatMul(A, B))
		})

		test('1x4 times 4x1 (inner / dot product)', () => {
			const A = [[R(1, 2), R(1, 3), R(1, 6), R(-1, 1)]]
			const B = [[R(2, 1)], [R(3, 1)], [R(6, 1)], [R(3, 1)]]
			// 1 + 1 + 1 - 3 = 0
			const res = matMulRationalSeries(A, B)
			assertCanonicalMatrix(res)
			assert.deepEqual(res, [[R(0, 1)]])
		})

		test('3x1 times 1x3 (outer product)', () => {
			const A = [[R(2, 3)], [R(-3, 5)], [R(0, 1)]]
			const B = [[R(3, 4), R(-5, 6), R(7, 2)]]
			const res = matMulRationalSeries(A, B)
			assertCanonicalMatrix(res)
			assert.deepEqual(res, [
				[R(1, 2), R(-5, 9), R(7, 3)],
				[R(-9, 20), R(1, 2), R(-21, 10)],
				[R(0, 1), R(0, 1), R(0, 1)],
			])
		})
	})

	describe('identity, zero, negative, and normalization cases', () => {
		test('left and right multiplication by identity matrix', () => {
			const A = [
				[R(-3, 4), R(5, 6), R(0, 1)],
				[R(7, 11), R(-2, 9), R(13, 17)],
			]
			const left = matMulRationalSeries(identityMatrix(2), A)
			const right = matMulRationalSeries(A, identityMatrix(3))
			assertCanonicalMatrix(left)
			assertCanonicalMatrix(right)
			assert.deepEqual(left, A)
			assert.deepEqual(right, A)
		})

		test('left and right multiplication by zero matrix', () => {
			const A = [
				[R(3, 7), R(-5, 11)],
				[R(2, 13), R(9, 4)],
				[R(-1, 2), R(8, 3)],
			]
			const leftZero = matMulRationalSeries(zeroMatrix(2, 3), A)
			const rightZero = matMulRationalSeries(A, zeroMatrix(2, 4))
			assertCanonicalMatrix(leftZero)
			assertCanonicalMatrix(rightZero)
			assert.deepEqual(leftZero, zeroMatrix(2, 2))
			assert.deepEqual(rightZero, zeroMatrix(3, 4))
		})

		test('negative rationals and unreduced / negative-denominator inputs', () => {
			const A = [
				[{ num: 6n, den: -9n }, { num: -4n, den: -6n }], // [-2/3, 2/3]
				[{ num: 0n, den: -5n }, { num: 10n, den: 15n }], // [0, 2/3]
			]
			const B = [
				[{ num: -9n, den: 6n }, { num: 3n, den: -6n }], // [-3/2, -1/2]
				[{ num: 12n, den: -8n }, { num: -2n, den: -4n }], // [-3/2, 1/2]
			]
			// Row 0: (-2/3)(-3/2) + (2/3)(-3/2) = 1 - 1 = 0; (-2/3)(-1/2) + (2/3)(1/2) = 1/3 + 1/3 = 2/3
			// Row 1: 0 + (2/3)(-3/2) = -1; 0 + (2/3)(1/2) = 1/3
			const res = matMulRationalSeries(A, B)
			assertCanonicalMatrix(res)
			assert.deepEqual(res, [
				[R(0, 1), R(2, 3)],
				[R(-1, 1), R(1, 3)],
			])
		})

		test('exact arbitrary-precision BigInt entries beyond IEEE-754 safe integer range', () => {
			const big = 10n ** 40n
			const A = [
				[{ num: big + 1n, den: big }, { num: -1n, den: big }],
			]
			const B = [
				[{ num: 1n, den: 1n }],
				[{ num: 1n, den: 1n }],
			]
			// (big + 1)/big - 1/big = big/big = 1/1
			const res = matMulRationalSeries(A, B)
			assertCanonicalMatrix(res)
			assert.deepEqual(res, [[R(1, 1)]])
		})

		test('does not mutate input matrices or rational objects', () => {
			const A = [[{ num: 6n, den: -9n }, { num: 4n, den: 8n }]]
			const B = [[{ num: 3n, den: 6n }], [{ num: -2n, den: -4n }]]
			const snapshotA = [[{ ...A[0][0] }, { ...A[0][1] }]]
			const snapshotB = [[{ ...B[0][0] }], [{ ...B[1][0] }]]
			matMulRationalSeries(A, B)
			assert.deepEqual(A, snapshotA)
			assert.deepEqual(B, snapshotB)
		})
	})

	describe('input validation', () => {
		const valid1x1 = [[R(1, 1)]]

		test('throws TypeError for non-array matrix arguments', () => {
			for (const bad of [null, undefined, 42, 'matrix', {}, true]) {
				assert.throws(() => matMulRationalSeries(bad, valid1x1), TypeError)
				assert.throws(() => matMulRationalSeries(valid1x1, bad), TypeError)
			}
		})

		test('throws RangeError for empty matrices or empty rows', () => {
			assert.throws(() => matMulRationalSeries([], valid1x1), RangeError)
			assert.throws(() => matMulRationalSeries(valid1x1, []), RangeError)
			assert.throws(() => matMulRationalSeries([[]], valid1x1), RangeError)
			assert.throws(() => matMulRationalSeries(valid1x1, [[]]), RangeError)
		})

		test('throws TypeError for non-array rows', () => {
			assert.throws(() => matMulRationalSeries([R(1, 1)], valid1x1), TypeError)
			assert.throws(() => matMulRationalSeries(valid1x1, [null]), TypeError)
		})

		test('throws RangeError for jagged (non-rectangular) matrices', () => {
			const jagged = [[R(1, 1), R(2, 1)], [R(3, 1)]]
			assert.throws(() => matMulRationalSeries(jagged, [[R(1, 1)], [R(1, 1)]]), RangeError)
			assert.throws(() => matMulRationalSeries([[R(1, 1), R(2, 1)]], jagged), RangeError)
		})

		test('throws RangeError for mismatched inner dimensions', () => {
			const A = [
				[R(1, 1), R(2, 1), R(3, 1)],
				[R(4, 1), R(5, 1), R(6, 1)],
			] // 2x3
			const B = [
				[R(1, 1), R(2, 1)],
				[R(3, 1), R(4, 1)],
			] // 2x2
			assert.throws(() => matMulRationalSeries(A, B), RangeError)
		})

		test('throws TypeError for invalid rational elements', () => {
			const badEntries = [
				null,
				undefined,
				1,
				'1/2',
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: '1', den: '2' },
				{ num: 1n },
				{ den: 1n },
				{},
			]
			for (const entry of badEntries) {
				assert.throws(() => matMulRationalSeries([[entry]], valid1x1), TypeError)
				assert.throws(() => matMulRationalSeries(valid1x1, [[entry]]), TypeError)
			}
		})

		test('throws RangeError for zero denominators', () => {
			assert.throws(() => matMulRationalSeries([[{ num: 1n, den: 0n }]], valid1x1), RangeError)
			assert.throws(() => matMulRationalSeries(valid1x1, [[{ num: 0n, den: 0n }]]), RangeError)
		})
	})

	describe('algebraic and numerical cross-checks', () => {
		test('associativity: (A * B) * C === A * (B * C)', () => {
			const A = [
				[R(1, 2), R(-2, 3), R(5, 6)],
				[R(-3, 7), R(4, 5), R(1, 9)],
			] // 2x3
			const B = [
				[R(3, 4), R(-1, 5), R(2, 7), R(0, 1)],
				[R(-5, 6), R(7, 8), R(-3, 10), R(1, 3)],
				[R(2, 9), R(4, 11), R(-1, 2), R(5, 12)],
			] // 3x4
			const C = [
				[R(-1, 3), R(2, 5)],
				[R(4, 7), R(-3, 8)],
				[R(5, 9), R(1, 4)],
				[R(-6, 11), R(7, 13)],
			] // 4x2

			const left = matMulRationalSeries(matMulRationalSeries(A, B), C)
			const right = matMulRationalSeries(A, matMulRationalSeries(B, C))
			assertCanonicalMatrix(left)
			assertCanonicalMatrix(right)
			assert.deepEqual(left, right)
		})

		test('distributivity and transpose identity', () => {
			const A = [
				[R(2, 3), R(-1, 4)],
				[R(5, 6), R(3, 7)],
			]
			const B = [
				[R(1, 5), R(-2, 9), R(3, 2)],
				[R(-4, 7), R(1, 3), R(5, 8)],
			]
			const C = [
				[R(-3, 4), R(7, 10), R(-1, 6)],
				[R(2, 5), R(-5, 12), R(4, 9)],
			]

			// A * (B + C) === A * B + A * C
			const lhsDist = matMulRationalSeries(A, matAdd(B, C))
			const rhsDist = matAdd(matMulRationalSeries(A, B), matMulRationalSeries(A, C))
			assertCanonicalMatrix(lhsDist)
			assert.deepEqual(lhsDist, rhsDist)

			// (A * B)^T === B^T * A^T
			const lhsTrans = transpose(matMulRationalSeries(A, B))
			const rhsTrans = matMulRationalSeries(transpose(B), transpose(A))
			assertCanonicalMatrix(rhsTrans)
			assert.deepEqual(lhsTrans, rhsTrans)
		})

		test('exact Hilbert matrix H_3 times exact inverse H_3^-1 equals I_3', () => {
			const H3 = [
				[R(1, 1), R(1, 2), R(1, 3)],
				[R(1, 2), R(1, 3), R(1, 4)],
				[R(1, 3), R(1, 4), R(1, 5)],
			]
			const H3Inv = [
				[R(9, 1), R(-36, 1), R(30, 1)],
				[R(-36, 1), R(192, 1), R(-180, 1)],
				[R(30, 1), R(-180, 1), R(180, 1)],
			]
			const prod1 = matMulRationalSeries(H3, H3Inv)
			const prod2 = matMulRationalSeries(H3Inv, H3)
			assertCanonicalMatrix(prod1)
			assertCanonicalMatrix(prod2)
			assert.deepEqual(prod1, identityMatrix(3))
			assert.deepEqual(prod2, identityMatrix(3))
		})

		test('floating-point comparison within tolerance against JS Number matmul', () => {
			const A = [
				[R(7, 13), R(-11, 17), R(3, 19), R(5, 23)],
				[R(-2, 7), R(13, 29), R(-17, 31), R(1, 3)],
				[R(19, 37), R(4, 11), R(-5, 13), R(9, 41)],
			]
			const B = [
				[R(-3, 5), R(8, 17), R(-1, 29)],
				[R(11, 19), R(-6, 23), R(14, 31)],
				[R(2, 13), R(9, 11), R(-7, 37)],
				[R(-15, 41), R(3, 7), R(5, 19)],
			]

			const exact = matMulRationalSeries(A, B)
			const approx = floatMatMul(A, B)
			assertCanonicalMatrix(exact)

			for (let i = 0; i < exact.length; i++) {
				for (let j = 0; j < exact[0].length; j++) {
					const exactFloat = Number(exact[i][j].num) / Number(exact[i][j].den)
					assert.ok(
						Math.abs(exactFloat - approx[i][j]) < 1e-12,
						`mismatch at [${i}][${j}]: exact=${exactFloat}, approx=${approx[i][j]}`
					)
				}
			}
		})
	})
})
