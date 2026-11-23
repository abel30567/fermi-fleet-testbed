import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { traceDualMemo } from './traceDualMemo.js'

/**
 * Helper to create a dual number `{ v, d }`.
 */
const dual = (v, d = 0) => ({ v, d })

/**
 * Independent dual arithmetic helpers for algebraic cross-checks.
 */
const dualAdd = (a, b) => ({ v: a.v + b.v, d: a.d + b.d })
const dualMul = (a, b) => ({
	v: a.v * b.v,
	d: a.v * b.d + a.d * b.v,
})

function dualMatMul(A, B) {
	const n = A.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => {
			let sum = dual(0, 0)
			for (let k = 0; k < n; k++) {
				sum = dualAdd(sum, dualMul(A[i][k], B[k][j]))
			}
			return sum
		}),
	)
}

function dualMatTranspose(A) {
	const n = A.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => A[j][i]),
	)
}

describe('traceDualMemo', () => {
	test('computes trace of a 1x1 dual matrix', () => {
		const result = traceDualMemo([[dual(7.5, -2.25)]])
		assert.deepStrictEqual(result, { v: 7.5, d: -2.25 })
	})

	test('computes trace of a 2x2 dual matrix ignoring off-diagonal entries', () => {
		const M = [
			[dual(3, 1), dual(100, -50)],
			[dual(-42, 99), dual(-1.5, 4.5)],
		]
		assert.deepStrictEqual(traceDualMemo(M), { v: 1.5, d: 5.5 })
	})

	test('computes trace of a 3x3 dual matrix with mixed signs and decimals', () => {
		const M = [
			[dual(1.25, 0.5), dual(2, 3), dual(4, 5)],
			[dual(6, 7), dual(-0.75, -1.25), dual(8, 9)],
			[dual(10, 11), dual(12, 13), dual(2.5, 3.75)],
		]
		assert.deepStrictEqual(traceDualMemo(M), { v: 3, d: 3 })
	})

	test('handles dimensions larger than precomputed diagonal table (> 32)', () => {
		const n = 40
		const M = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) =>
				i === j ? dual(i + 1, 2 * (i + 1)) : dual(i - j, j - i),
			),
		)
		const expectedV = (n * (n + 1)) / 2
		const expectedD = n * (n + 1)
		assert.deepStrictEqual(traceDualMemo(M), { v: expectedV, d: expectedD })
		// Second call exercises memoized dynamic table + result cache
		assert.deepStrictEqual(traceDualMemo(M), { v: expectedV, d: expectedD })
	})

	test('edge case: 0x0 empty matrix returns zero dual number', () => {
		assert.deepStrictEqual(traceDualMemo([]), { v: 0, d: 0 })
	})

	test('edge case: normalizes negative zero to positive zero', () => {
		const M = [
			[dual(-0, -0), dual(1, 2)],
			[dual(3, 4), dual(-0, 0)],
		]
		const res = traceDualMemo(M)
		assert.ok(Object.is(res.v, 0))
		assert.ok(Object.is(res.d, 0))
	})

	test('edge case: cancellation to zero in value and derivative', () => {
		const M = [
			[dual(5, -3), dual(1, 1)],
			[dual(2, 2), dual(-5, 3)],
		]
		assert.deepStrictEqual(traceDualMemo(M), { v: 0, d: 0 })
	})

	test('memoization safety: mutating returned object does not poison cache', () => {
		const M = [
			[dual(10, 20), dual(0, 0)],
			[dual(0, 0), dual(30, 40)],
		]
		const first = traceDualMemo(M)
		assert.deepStrictEqual(first, { v: 40, d: 60 })
		first.v = 999999
		first.d = -999999

		const second = traceDualMemo(M)
		assert.deepStrictEqual(second, { v: 40, d: 60 })
	})

	test('memoization safety: mutating input matrix in-place reflects new values', () => {
		const M = [
			[dual(2, 3), dual(0, 0)],
			[dual(0, 0), dual(4, 5)],
		]
		assert.deepStrictEqual(traceDualMemo(M), { v: 6, d: 8 })
		M[0][0].v = 12
		M[1][1].d = -5
		assert.deepStrictEqual(traceDualMemo(M), { v: 16, d: -2 })
	})

	test('bounded cache eviction remains accurate beyond 1024 distinct matrices', () => {
		for (let k = 1; k <= 1100; k++) {
			const res = traceDualMemo([[dual(k, -k)]])
			assert.deepStrictEqual(res, { v: k, d: -k })
		}
		// Re-query evicted early entry
		assert.deepStrictEqual(traceDualMemo([[dual(1, -1)]]), { v: 1, d: -1 })
	})

	test('input validation: rejects non-array and malformed matrices', () => {
		assert.throws(() => traceDualMemo(null), TypeError)
		assert.throws(() => traceDualMemo(undefined), TypeError)
		assert.throws(() => traceDualMemo(42), TypeError)
		assert.throws(() => traceDualMemo('matrix'), TypeError)
		assert.throws(() => traceDualMemo({}), TypeError)
		assert.throws(() => traceDualMemo([123]), TypeError)
	})

	test('input validation: rejects non-square and jagged matrices', () => {
		assert.throws(() => traceDualMemo([[]]), RangeError)
		assert.throws(
			() => traceDualMemo([[dual(1, 0), dual(2, 0)]]),
			RangeError,
		)
		assert.throws(
			() => traceDualMemo([[dual(1, 0)], [dual(2, 0)]]),
			RangeError,
		)
		assert.throws(
			() =>
				traceDualMemo([
					[dual(1, 0), dual(2, 0)],
					[dual(3, 0)],
				]),
			RangeError,
		)
	})

	test('input validation: rejects invalid or non-finite dual entries (diagonal and off-diagonal)', () => {
		assert.throws(() => traceDualMemo([[null]]), TypeError)
		assert.throws(() => traceDualMemo([[42]]), TypeError)
		assert.throws(() => traceDualMemo([[[1, 2]]]), TypeError)
		assert.throws(() => traceDualMemo([[{ v: 1 }]]), TypeError)
		assert.throws(() => traceDualMemo([[{ v: '1', d: 0 }]]), TypeError)
		assert.throws(
			() =>
				traceDualMemo([
					[dual(1, 0), { v: 2, d: 'bad' }],
					[dual(0, 0), dual(3, 0)],
				]),
			TypeError,
		)

		assert.throws(() => traceDualMemo([[dual(NaN, 0)]]), RangeError)
		assert.throws(() => traceDualMemo([[dual(0, Infinity)]]), RangeError)
		assert.throws(() => traceDualMemo([[dual(-Infinity, 0)]]), RangeError)
		assert.throws(
			() =>
				traceDualMemo([
					[dual(1, 0), dual(NaN, 0)],
					[dual(0, 0), dual(2, 0)],
				]),
			RangeError,
		)
	})

	test('independent cross-check: matches central finite-difference derivative of tr(A(t))', () => {
		// Smooth parameterized 3x3 matrix A(t)
		const scalarA = (t) => [
			[t ** 3 - 2 * t, Math.cos(t), t * t],
			[Math.exp(-t), Math.sin(2 * t), 1 / (1 + t * t)],
			[Math.log(t + 2), 3 * t, Math.exp(0.5 * t)],
		]

		const dualA = (t) => [
			[
				dual(t ** 3 - 2 * t, 3 * t * t - 2),
				dual(Math.cos(t), -Math.sin(t)),
				dual(t * t, 2 * t),
			],
			[
				dual(Math.exp(-t), -Math.exp(-t)),
				dual(Math.sin(2 * t), 2 * Math.cos(2 * t)),
				dual(1 / (1 + t * t), (-2 * t) / (1 + t * t) ** 2),
			],
			[
				dual(Math.log(t + 2), 1 / (t + 2)),
				dual(3 * t, 3),
				dual(Math.exp(0.5 * t), 0.5 * Math.exp(0.5 * t)),
			],
		]

		const scalarTrace = (M) => M.reduce((s, row, i) => s + row[i], 0)
		const h = 1e-6

		for (const t of [-1.2, 0, 0.7, 2.3]) {
			const { v, d } = traceDualMemo(dualA(t))
			const expectedV = scalarTrace(scalarA(t))
			const approxD =
				(scalarTrace(scalarA(t + h)) - scalarTrace(scalarA(t - h))) / (2 * h)

			assert.ok(
				Math.abs(v - expectedV) < 1e-12,
				`primal mismatch at t=${t}: ${v} vs ${expectedV}`,
			)
			assert.ok(
				Math.abs(d - approxD) < 1e-8,
				`derivative mismatch at t=${t}: ${d} vs ${approxD}`,
			)
		}
	})

	test('independent cross-check: algebraic identities (linearity, transpose, cyclic tr(AB) = tr(BA))', () => {
		const A = [
			[dual(2, 0.5), dual(-1, 1.5), dual(3, -0.25)],
			[dual(0.5, -2), dual(4, 1), dual(-2, 0.75)],
			[dual(1, 0), dual(2, -1), dual(-3, 2.5)],
		]
		const B = [
			[dual(-1, 2), dual(3, -0.5), dual(0.5, 1)],
			[dual(2, 1), dual(-2, 0.25), dual(1, -1.5)],
			[dual(4, -0.75), dual(-1, 2), dual(2, 0.5)],
		]

		// Transpose invariance: tr(A^T) = tr(A)
		assert.deepStrictEqual(
			traceDualMemo(dualMatTranspose(A)),
			traceDualMemo(A),
		)

		// Linearity over dual scalars: tr(αA + βB) = α*tr(A) + β*tr(B)
		const alpha = dual(1.5, -0.5)
		const beta = dual(-2, 3)
		const linComb = A.map((row, i) =>
			row.map((cell, j) =>
				dualAdd(dualMul(alpha, cell), dualMul(beta, B[i][j])),
			),
		)
		const lhsLin = traceDualMemo(linComb)
		const rhsLin = dualAdd(
			dualMul(alpha, traceDualMemo(A)),
			dualMul(beta, traceDualMemo(B)),
		)
		assert.ok(Math.abs(lhsLin.v - rhsLin.v) < 1e-12)
		assert.ok(Math.abs(lhsLin.d - rhsLin.d) < 1e-12)

		// Cyclic property: tr(AB) = tr(BA)
		const trAB = traceDualMemo(dualMatMul(A, B))
		const trBA = traceDualMemo(dualMatMul(B, A))
		assert.ok(Math.abs(trAB.v - trBA.v) < 1e-12)
		assert.ok(Math.abs(trAB.d - trBA.d) < 1e-12)
	})
})
