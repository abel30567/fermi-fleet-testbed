import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matMulDualSeries } from './matMulDualSeries.js'

const dual = (v, d = 0) => ({ v, d })

function assertDualMatrixClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, expected.length, 'row count mismatch')
	for (let i = 0; i < expected.length; i++) {
		assert.equal(actual[i].length, expected[i].length, `col count mismatch at row ${i}`)
		for (let j = 0; j < expected[i].length; j++) {
			assert.ok(
				Math.abs(actual[i][j].v - expected[i][j].v) <= tol,
				`v mismatch at [${i}][${j}]: got ${actual[i][j].v}, expected ${expected[i][j].v}`
			)
			assert.ok(
				Math.abs(actual[i][j].d - expected[i][j].d) <= tol,
				`d mismatch at [${i}][${j}]: got ${actual[i][j].d}, expected ${expected[i][j].d}`
			)
		}
	}
}

function addDualMatrices(A, B) {
	return A.map((row, i) =>
		row.map((cell, j) => ({ v: cell.v + B[i][j].v, d: cell.d + B[i][j].d }))
	)
}

function realMatMul(A, B) {
	const m = A.length
	const k = A[0].length
	const n = B[0].length
	const out = Array.from({ length: m }, () => new Array(n).fill(0))
	for (let i = 0; i < m; i++) {
		for (let p = 0; p < k; p++) {
			for (let j = 0; j < n; j++) {
				out[i][j] += A[i][p] * B[p][j]
			}
		}
	}
	return out
}

test('2x2 dual matrix multiplication matches exact analytical result', () => {
	const A = [
		[dual(1, 2), dual(3, 4)],
		[dual(5, -1), dual(2, 0.5)],
	]
	const B = [
		[dual(2, 1), dual(-1, 3)],
		[dual(0, 2), dual(4, -2)],
	]

	// A_v * B_v:
	// [1*2 + 3*0,  1*-1 + 3*4] = [2, 11]
	// [5*2 + 2*0,  5*-1 + 2*4] = [10, 3]
	// A_d * B_v + A_v * B_d:
	// [0,0]: (2*2 + 4*0) + (1*1 + 3*2) = 4 + 7 = 11
	// [0,1]: (2*-1 + 4*4) + (1*3 + 3*-2) = 14 + (-3) = 11
	// [1,0]: (-1*2 + 0.5*0) + (5*1 + 2*2) = -2 + 9 = 7
	// [1,1]: (-1*-1 + 0.5*4) + (5*3 + 2*-2) = 3 + 11 = 14
	const expected = [
		[dual(2, 11), dual(11, 11)],
		[dual(10, 7), dual(3, 14)],
	]

	assert.deepEqual(matMulDualSeries(A, B), expected)
})

test('rectangular matrices: 2x3 * 3x2, inner product 1x3 * 3x1, outer product 3x1 * 1x3', () => {
	const A = [
		[dual(1, 1), dual(2, 0), dual(3, -1)],
		[dual(0, 2), dual(-1, 1), dual(4, 3)],
	]
	const B = [
		[dual(2, -1), dual(1, 2)],
		[dual(3, 1), dual(0, -1)],
		[dual(-1, 2), dual(5, 0)],
	]

	const res = matMulDualSeries(A, B)
	assert.equal(res.length, 2)
	assert.equal(res[0].length, 2)
	assert.deepEqual(res, [
		[dual(5, 10), dual(16, -4)],
		[dual(-7, 11), dual(20, 18)],
	])

	// 1x3 * 3x1 -> 1x1
	const rowVec = [[dual(2, 3), dual(-1, 4), dual(5, -2)]]
	const colVec = [[dual(1, -1)], [dual(3, 2)], [dual(4, 0.5)]]
	// v: 2*1 + (-1)*3 + 5*4 = 19
	// d: (3*1 + 2*-1) + (4*3 + -1*2) + (-2*4 + 5*0.5) = 1 + 10 - 5.5 = 5.5
	assert.deepEqual(matMulDualSeries(rowVec, colVec), [[dual(19, 5.5)]])

	// 3x1 * 1x3 -> 3x3
	const outer = matMulDualSeries(colVec, rowVec)
	assert.equal(outer.length, 3)
	assert.equal(outer[0].length, 3)
	assert.deepEqual(outer[0], [dual(2, 1), dual(-1, 5), dual(5, -7)])
})

test('1x1 scalar dual multiplication satisfies product rule', () => {
	const res = matMulDualSeries([[dual(3.5, -2)]], [[dual(-4, 1.5)]])
	assert.deepEqual(res, [[dual(-14, 13.25)]])
})

test('edge cases: identity, zero, constant, and purely dual matrices', () => {
	const I = [
		[dual(1, 0), dual(0, 0)],
		[dual(0, 0), dual(1, 0)],
	]
	const Z = [
		[dual(0, 0), dual(0, 0)],
		[dual(0, 0), dual(0, 0)],
	]
	const A = [
		[dual(3, -2), dual(7, 5)],
		[dual(-1, 4), dual(0, -6)],
	]

	assert.deepEqual(matMulDualSeries(I, A), A)
	assert.deepEqual(matMulDualSeries(A, I), A)
	assert.deepEqual(matMulDualSeries(Z, A), Z)
	assert.deepEqual(matMulDualSeries(A, Z), Z)

	// Purely constant matrices (d = 0) yield zero derivative
	const C1 = [
		[dual(2, 0), dual(-3, 0)],
		[dual(4, 0), dual(1, 0)],
	]
	const C2 = [
		[dual(-1, 0), dual(5, 0)],
		[dual(2, 0), dual(0, 0)],
	]
	assert.deepEqual(matMulDualSeries(C1, C2), [
		[dual(-8, 0), dual(10, 0)],
		[dual(-2, 0), dual(20, 0)],
	])

	// Purely dual matrices (v = 0): (e*A_d)(e*B_d) = e^2 * A_d * B_d = 0
	const P1 = [
		[dual(0, 3), dual(0, -4)],
		[dual(0, 1), dual(0, 2)],
	]
	const P2 = [
		[dual(0, 5), dual(0, 6)],
		[dual(0, -7), dual(0, 8)],
	]
	assert.deepEqual(matMulDualSeries(P1, P2), Z)
})

test('does not mutate input matrices or dual entries', () => {
	const A = [
		[dual(1, 2), dual(3, 4)],
		[dual(5, 6), dual(7, 8)],
	]
	const B = [
		[dual(9, 10), dual(11, 12)],
		[dual(13, 14), dual(15, 16)],
	]
	const snapA = structuredClone(A)
	const snapB = structuredClone(B)

	const out = matMulDualSeries(A, B)
	out[0][0].v = 999
	assert.deepEqual(A, snapA)
	assert.deepEqual(B, snapB)
})

test('cross-check: central finite-difference derivative of A(t) * B(t)', () => {
	const evalA = (t) => [
		[Math.sin(t), t * t + 1, Math.exp(0.5 * t)],
		[Math.cos(2 * t), Math.log(t + 2), -3 * t],
	]
	const derivA = (t) => [
		[Math.cos(t), 2 * t, 0.5 * Math.exp(0.5 * t)],
		[-2 * Math.sin(2 * t), 1 / (t + 2), -3],
	]

	const evalB = (t) => [
		[t * t * t, Math.cos(t)],
		[Math.exp(-t), 2 * t - 1],
		[Math.sin(t + 0.3), 1 / (t + 3)],
	]
	const derivB = (t) => [
		[3 * t * t, -Math.sin(t)],
		[-Math.exp(-t), 2],
		[Math.cos(t + 0.3), -1 / ((t + 3) * (t + 3))],
	]

	const t0 = 0.7
	const av = evalA(t0)
	const ad = derivA(t0)
	const bv = evalB(t0)
	const bd = derivB(t0)

	const A = av.map((row, i) => row.map((val, j) => dual(val, ad[i][j])))
	const B = bv.map((row, i) => row.map((val, j) => dual(val, bd[i][j])))

	const actual = matMulDualSeries(A, B)

	const h = 1e-6
	const prodPlus = realMatMul(evalA(t0 + h), evalB(t0 + h))
	const prodMinus = realMatMul(evalA(t0 - h), evalB(t0 - h))
	const prodExact = realMatMul(av, bv)

	const expected = prodExact.map((row, i) =>
		row.map((val, j) => dual(val, (prodPlus[i][j] - prodMinus[i][j]) / (2 * h)))
	)

	assertDualMatrixClose(actual, expected, 1e-8)
})

test('cross-check: algebraic identities (associativity, distributivity, rotation orthogonality, block representation)', () => {
	const A = [
		[dual(1.2, -0.5), dual(-0.7, 1.3)],
		[dual(2.1, 0.4), dual(0.8, -1.1)],
	]
	const B = [
		[dual(-1.5, 0.9), dual(0.6, 2.2)],
		[dual(1.4, -0.3), dual(-2.0, 0.7)],
	]
	const C = [
		[dual(0.5, 1.5), dual(-1.1, -0.4)],
		[dual(2.3, -0.8), dual(0.9, 1.2)],
	]

	// Associativity: (A * B) * C === A * (B * C)
	assertDualMatrixClose(
		matMulDualSeries(matMulDualSeries(A, B), C),
		matMulDualSeries(A, matMulDualSeries(B, C)),
		1e-12
	)

	// Left and right distributivity
	assertDualMatrixClose(
		matMulDualSeries(A, addDualMatrices(B, C)),
		addDualMatrices(matMulDualSeries(A, B), matMulDualSeries(A, C)),
		1e-12
	)
	assertDualMatrixClose(
		matMulDualSeries(addDualMatrices(A, B), C),
		addDualMatrices(matMulDualSeries(A, C), matMulDualSeries(B, C)),
		1e-12
	)

	// Orthogonal rotation matrix: R(theta) * R(theta)^T = I, derivative = 0
	const theta = 1.23
	const c = Math.cos(theta)
	const s = Math.sin(theta)
	const R = [
		[dual(c, -s), dual(-s, -c)],
		[dual(s, c), dual(c, -s)],
	]
	const RT = [
		[dual(c, -s), dual(s, c)],
		[dual(-s, -c), dual(c, -s)],
	]
	assertDualMatrixClose(
		matMulDualSeries(R, RT),
		[
			[dual(1, 0), dual(0, 0)],
			[dual(0, 0), dual(1, 0)],
		],
		1e-12
	)

	// Block upper-triangular matrix isomorphism:
	// [A_v, A_d; 0, A_v] * [B_v, B_d; 0, B_v] = [C_v, C_d; 0, C_v]
	const toBlock = (M) => {
		const m = M.length
		const n = M[0].length
		const block = Array.from({ length: 2 * m }, () => new Array(2 * n).fill(0))
		for (let i = 0; i < m; i++) {
			for (let j = 0; j < n; j++) {
				block[i][j] = M[i][j].v
				block[i][j + n] = M[i][j].d
				block[i + m][j + n] = M[i][j].v
			}
		}
		return block
	}

	const blockProd = realMatMul(toBlock(A), toBlock(B))
	const fromBlock = Array.from({ length: 2 }, (_, i) =>
		Array.from({ length: 2 }, (_, j) => dual(blockProd[i][j], blockProd[i][j + 2]))
	)
	assertDualMatrixClose(matMulDualSeries(A, B), fromBlock, 1e-12)
})

test('input validation rejects malformed matrices, bad entries, and dimension mismatches', () => {
	const valid = [[dual(1, 0)]]

	assert.throws(() => matMulDualSeries(null, valid), TypeError)
	assert.throws(() => matMulDualSeries(valid, 'not-a-matrix'), TypeError)
	assert.throws(() => matMulDualSeries([], valid), RangeError)
	assert.throws(() => matMulDualSeries([[]], valid), RangeError)
	assert.throws(() => matMulDualSeries([123], valid), TypeError)

	// Ragged matrix
	assert.throws(
		() => matMulDualSeries([[dual(1, 0), dual(2, 0)], [dual(3, 0)]], [[dual(1, 0)], [dual(1, 0)]]),
		RangeError
	)

	// Incompatible dimensions (1x2 * 1x2)
	assert.throws(
		() => matMulDualSeries([[dual(1, 0), dual(2, 0)]], [[dual(1, 0), dual(2, 0)]]),
		RangeError
	)

	// Invalid dual entries
	assert.throws(() => matMulDualSeries([[null]], valid), TypeError)
	assert.throws(() => matMulDualSeries([[42]], valid), TypeError)
	assert.throws(() => matMulDualSeries([[{ v: 1 }]], valid), TypeError)
	assert.throws(() => matMulDualSeries([[{ d: 1 }]], valid), TypeError)
	assert.throws(() => matMulDualSeries([[{ v: NaN, d: 0 }]], valid), TypeError)
	assert.throws(() => matMulDualSeries([[{ v: 1, d: Infinity }]], valid), TypeError)
	assert.throws(() => matMulDualSeries(valid, [[{ v: -Infinity, d: 0 }]]), TypeError)
})
