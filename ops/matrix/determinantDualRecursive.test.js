import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { determinantDualRecursive } from './determinantDualRecursive.js'

/**
 * Helper to create a dual number `{ v, d }`.
 */
const D = (v, d = 0) => ({ v, d })

/**
 * Helper to assert two dual numbers are close within tolerance.
 */
function assertDualClose(actual, expected, tol = 1e-9, label = '') {
	assert.ok(
		Math.abs(actual.v - expected.v) <= tol,
		`${label} value mismatch: got ${actual.v}, expected ${expected.v} (tol ${tol})`,
	)
	assert.ok(
		Math.abs(actual.d - expected.d) <= tol,
		`${label} derivative mismatch: got ${actual.d}, expected ${expected.d} (tol ${tol})`,
	)
}

/**
 * Independent scalar determinant via Gaussian elimination with partial pivoting
 * for cross-checking primal values and finite-difference derivatives.
 */
function scalarDetLU(mat) {
	const n = mat.length
	const a = mat.map((row) => row.slice())
	let sign = 1
	for (let k = 0; k < n; k++) {
		let pivotRow = k
		let maxAbs = Math.abs(a[k][k])
		for (let i = k + 1; i < n; i++) {
			const val = Math.abs(a[i][k])
			if (val > maxAbs) {
				maxAbs = val
				pivotRow = i
			}
		}
		if (maxAbs === 0) return 0
		if (pivotRow !== k) {
			;[a[k], a[pivotRow]] = [a[pivotRow], a[k]]
			sign = -sign
		}
		for (let i = k + 1; i < n; i++) {
			const factor = a[i][k] / a[k][k]
			for (let j = k + 1; j < n; j++) {
				a[i][j] -= factor * a[k][j]
			}
		}
	}
	let prod = sign
	for (let i = 0; i < n; i++) prod *= a[i][i]
	return prod
}

/**
 * Independent adjugate matrix `adj(V)` computed from scalar cofactors for Jacobi's formula:
 * `d/dt det(V + t*dV)|_{t=0} = tr(adj(V) * dV)`.
 */
function scalarAdjugate(V) {
	const n = V.length
	if (n === 1) return [[1]]
	const adj = Array.from({ length: n }, () => new Array(n).fill(0))
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			const minor = []
			for (let r = 0; r < n; r++) {
				if (r === i) continue
				const row = []
				for (let c = 0; c < n; c++) {
					if (c === j) continue
					row.push(V[r][c])
				}
				minor.push(row)
			}
			const sign = (i + j) % 2 === 0 ? 1 : -1
			// Adjugate is transpose of cofactor matrix
			adj[j][i] = sign * scalarDetLU(minor)
		}
	}
	return adj
}

/**
 * Multiplies two n×n dual matrices.
 */
function dualMatMul(A, B) {
	const n = A.length
	const C = Array.from({ length: n }, () => new Array(n))
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let v = 0
			let d = 0
			for (let k = 0; k < n; k++) {
				v += A[i][k].v * B[k][j].v
				d += A[i][k].v * B[k][j].d + A[i][k].d * B[k][j].v
			}
			C[i][j] = { v, d }
		}
	}
	return C
}

describe('determinantDualRecursive', () => {
	describe('normal cases (1x1, 2x2, 3x3, 4x4)', () => {
		test('1x1 matrix returns the single entry without aliasing', () => {
			const input = [[D(7, -3.5)]]
			const res = determinantDualRecursive(input)
			assert.deepStrictEqual(res, { v: 7, d: -3.5 })
			assert.notStrictEqual(res, input[0][0])
		})

		test('2x2 matrix matches analytic det(ad - bc) and product rule derivative', () => {
			// A(t) = [[2 + t, 3 - 2t], [4 + 5t, 6 + 0t]] at t = 0
			// det(t) = (2 + t)*6 - (3 - 2t)*(4 + 5t)
			//        = (12 + 6t) - (12 + 7t - 10t^2) = -t + 10t^2
			// At t = 0: v = 0, d = -1
			const A = [
				[D(2, 1), D(3, -2)],
				[D(4, 5), D(6, 0)],
			]
			assert.deepStrictEqual(determinantDualRecursive(A), { v: 0, d: -1 })

			// B = [[1 + 2t, 4 - t], [-3 + 3t, 5 + 2t]]
			// v = 1*5 - 4*(-3) = 17
			// d = (1*2 + 2*5) - (4*3 + (-1)*(-3)) = 12 - 15 = -3
			const B = [
				[D(1, 2), D(4, -1)],
				[D(-3, 3), D(5, 2)],
			]
			assert.deepStrictEqual(determinantDualRecursive(B), { v: 17, d: -3 })
		})

		test('3x3 matrix matches analytic determinant and derivative', () => {
			// A(t) = [[1+t, 2, 3], [0, 4+2t, 5-t], [1, 0, 6+3t]]
			// det(t) = (1+t)*((4+2t)(6+3t) - 0) - 2*(0 - (5-t)) + 3*(0 - (4+2t))
			//        = (1+t)*(24 + 24t + 6t^2) + 2*(5-t) - 3*(4+2t)
			// At t = 0: v = 24 + 10 - 12 = 22
			// d/dt at t = 0: (1*24 + 1*24) - 2 - 6 = 48 - 8 = 40
			const A = [
				[D(1, 1), D(2, 0), D(3, 0)],
				[D(0, 0), D(4, 2), D(5, -1)],
				[D(1, 0), D(0, 0), D(6, 3)],
			]
			assert.deepStrictEqual(determinantDualRecursive(A), { v: 22, d: 40 })
		})

		test('4x4 dense matrix with non-zero derivatives in all entries', () => {
			// Exact polynomial check at t = 0:
			// V = [[2, -1, 0, 3], [1, 4, -2, 1], [3, 0, 5, -1], [-2, 2, 1, 3]]
			// dV = [[1, 2, -1, 0], [0, -1, 3, 2], [-2, 1, 0, 1], [3, 0, -2, -1]]
			const V = [
				[2, -1, 0, 3],
				[1, 4, -2, 1],
				[3, 0, 5, -1],
				[-2, 2, 1, 3],
			]
			const dV = [
				[1, 2, -1, 0],
				[0, -1, 3, 2],
				[-2, 1, 0, 1],
				[3, 0, -2, -1],
			]
			const A = V.map((row, i) => row.map((v, j) => D(v, dV[i][j])))
			const res = determinantDualRecursive(A)

			// Verify against adjugate trace (Jacobi's formula) and LU det
			const expectedV = scalarDetLU(V)
			const adj = scalarAdjugate(V)
			let expectedD = 0
			for (let i = 0; i < 4; i++) {
				for (let j = 0; j < 4; j++) {
					expectedD += adj[i][j] * dV[j][i]
				}
			}
			assertDualClose(res, { v: expectedV, d: expectedD }, 1e-9, '4x4 dense')
		})

		test('entry with zero primal value and non-zero derivative contributes to derivative', () => {
			// A(t) = [[t, 0, 0], [0, 3, 1], [0, 2, 5]]
			// det(t) = t * (3*5 - 1*2) = 13t => at t=0: v = 0, d = 13
			const A = [
				[D(0, 1), D(0, 0), D(0, 0)],
				[D(0, 0), D(3, 0), D(1, 0)],
				[D(0, 0), D(2, 0), D(5, 0)],
			]
			assert.deepStrictEqual(determinantDualRecursive(A), { v: 0, d: 13 })
		})

		test('does not mutate input matrix or dual entries', () => {
			const A = [
				[D(1, 2), D(3, 4)],
				[D(5, 6), D(7, 8)],
			]
			const snapshot = structuredClone(A)
			determinantDualRecursive(A)
			assert.deepStrictEqual(A, snapshot)
		})
	})

	describe('edge cases', () => {
		test('identity matrix with zero derivatives has det = { v: 1, d: 0 }', () => {
			for (const n of [1, 2, 3, 4, 5]) {
				const I = Array.from({ length: n }, (_, i) =>
					Array.from({ length: n }, (_, j) => D(i === j ? 1 : 0, 0)),
				)
				assert.deepStrictEqual(determinantDualRecursive(I), { v: 1, d: 0 })
			}
		})

		test('identity perturbed by t*B has det = { v: 1, d: tr(B) }', () => {
			// det(I + t*B) = 1 + t*tr(B) + O(t^2)
			const B = [
				[2, 5, -1, 4],
				[-3, -7, 2, 0],
				[1, 8, 9, -2],
				[6, -4, 3, 11],
			]
			const M = B.map((row, i) => row.map((b, j) => D(i === j ? 1 : 0, b)))
			const traceB = B[0][0] + B[1][1] + B[2][2] + B[3][3]
			assert.deepStrictEqual(determinantDualRecursive(M), { v: 1, d: traceB })
		})

		test('diagonal and upper/lower triangular matrices follow product rule on diagonal', () => {
			// Diagonal entries: (2 + t), (3 - 2t), (-4 + 5t)
			// v = 2 * 3 * (-4) = -24
			// d = 1*3*(-4) + 2*(-2)*(-4) + 2*3*5 = -12 + 16 + 30 = 34
			const diag = [
				[D(2, 1), D(0, 0), D(0, 0)],
				[D(0, 0), D(3, -2), D(0, 0)],
				[D(0, 0), D(0, 0), D(-4, 5)],
			]
			assert.deepStrictEqual(determinantDualRecursive(diag), { v: -24, d: 34 })

			// Upper triangular (arbitrary non-zero duals above diagonal should not affect det)
			const upper = [
				[D(2, 1), D(99, -17), D(-42, 13)],
				[D(0, 0), D(3, -2), D(7, 8)],
				[D(0, 0), D(0, 0), D(-4, 5)],
			]
			assert.deepStrictEqual(determinantDualRecursive(upper), { v: -24, d: 34 })

			// Lower triangular (arbitrary non-zero duals below diagonal should not affect det)
			const lower = [
				[D(2, 1), D(0, 0), D(0, 0)],
				[D(-11, 4), D(3, -2), D(0, 0)],
				[D(5, -6), D(13, 9), D(-4, 5)],
			]
			assert.deepStrictEqual(determinantDualRecursive(lower), { v: -24, d: 34 })
		})

		test('singular matrix with zero determinant and zero/non-zero derivative', () => {
			// Rank-1 matrix: duplicate rows with identical derivatives => det(t) === 0 for all t
			const alwaysSingular = [
				[D(1, 2), D(2, -1), D(3, 4)],
				[D(1, 2), D(2, -1), D(3, 4)],
				[D(4, 1), D(5, 3), D(6, -2)],
			]
			assert.deepStrictEqual(determinantDualRecursive(alwaysSingular), { v: 0, d: 0 })

			// Singular at t = 0 (rank n-1), non-zero derivative via Jacobi's formula:
			// Row 2 = 2 * Row 1 at t = 0, but derivative breaks linear dependence
			const V = [
				[1, 2, 3],
				[2, 4, 6],
				[1, 0, -1],
			]
			const dV = [
				[0, 0, 0],
				[1, 0, 0],
				[0, 0, 0],
			]
			// Cofactor(1, 0) = -(2*(-1) - 3*0) = 2, so d = 1 * 2 = 2
			const M = V.map((row, i) => row.map((v, j) => D(v, dV[i][j])))
			assert.deepStrictEqual(determinantDualRecursive(M), { v: 0, d: 2 })
		})

		test('normalizes negative zero to positive zero', () => {
			const A = [
				[D(-0, -0), D(1, 0)],
				[D(0, 0), D(2, 0)],
			]
			const res = determinantDualRecursive(A)
			assert.ok(Object.is(res.v, 0))
			assert.ok(Object.is(res.d, 0))
		})
	})

	describe('input validation', () => {
		test('throws TypeError for non-array matrix', () => {
			for (const bad of [null, undefined, 42, 'matrix', {}, () => {}]) {
				assert.throws(() => determinantDualRecursive(bad), TypeError)
			}
		})

		test('throws RangeError for empty matrix', () => {
			assert.throws(() => determinantDualRecursive([]), RangeError)
		})

		test('throws TypeError for non-array rows', () => {
			assert.throws(() => determinantDualRecursive([D(1, 0)]), TypeError)
			assert.throws(() => determinantDualRecursive([[D(1, 0), D(2, 0)], 'bad']), TypeError)
		})

		test('throws RangeError for non-square and ragged matrices', () => {
			// Rectangular 2x3
			assert.throws(
				() =>
					determinantDualRecursive([
						[D(1, 0), D(2, 0), D(3, 0)],
						[D(4, 0), D(5, 0), D(6, 0)],
					]),
				RangeError,
			)
			// Ragged rows
			assert.throws(
				() =>
					determinantDualRecursive([
						[D(1, 0), D(2, 0)],
						[D(3, 0)],
					]),
				RangeError,
			)
		})

		test('throws TypeError for malformed dual entries', () => {
			assert.throws(() => determinantDualRecursive([[1]]), TypeError)
			assert.throws(() => determinantDualRecursive([[null]]), TypeError)
			assert.throws(() => determinantDualRecursive([[{ v: 1 }]]), TypeError)
			assert.throws(() => determinantDualRecursive([[{ d: 1 }]]), TypeError)
			assert.throws(() => determinantDualRecursive([[{ v: '1', d: 0 }]]), TypeError)
			assert.throws(() => determinantDualRecursive([[[1, 0]]]), TypeError)
		})

		test('throws RangeError for non-finite dual components', () => {
			assert.throws(() => determinantDualRecursive([[D(NaN, 0)]]), RangeError)
			assert.throws(() => determinantDualRecursive([[D(0, NaN)]]), RangeError)
			assert.throws(() => determinantDualRecursive([[D(Infinity, 0)]]), RangeError)
			assert.throws(() => determinantDualRecursive([[D(0, -Infinity)]]), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		test('matches central finite-difference derivative of det(A(t)) and Jacobi formula', () => {
			// 5x5 matrix with mixed signs and fractional entries
			const V = [
				[1.5, -0.5, 2.0, 0.25, -1.0],
				[0.75, 3.0, -1.25, 1.5, 0.5],
				[-2.0, 1.0, 0.5, -0.75, 2.25],
				[0.5, -1.5, 2.5, 4.0, -0.25],
				[1.25, 0.25, -0.5, 1.0, 3.5],
			]
			const dV = [
				[-0.3, 1.1, 0.4, -0.7, 0.2],
				[0.8, -0.5, 0.9, 0.1, -1.2],
				[0.6, 0.3, -1.4, 0.5, 0.7],
				[-0.9, 0.2, 0.6, -0.4, 1.3],
				[0.5, -0.8, 0.3, 1.2, -0.6],
			]
			const A = V.map((row, i) => row.map((v, j) => D(v, dV[i][j])))
			const actual = determinantDualRecursive(A)

			// 1) Central finite-difference check
			const h = 1e-6
			const evalAt = (t) =>
				V.map((row, i) => row.map((v, j) => v + t * dV[i][j]))
			const fdValue = scalarDetLU(V)
			const fdDeriv = (scalarDetLU(evalAt(h)) - scalarDetLU(evalAt(-h))) / (2 * h)
			assertDualClose(actual, { v: fdValue, d: fdDeriv }, 1e-6, 'finite-difference 5x5')

			// 2) Exact Jacobi formula check: d/dt det(A) = tr(adj(V) * dV)
			const adj = scalarAdjugate(V)
			let jacobiDeriv = 0
			for (let i = 0; i < 5; i++) {
				for (let j = 0; j < 5; j++) {
					jacobiDeriv += adj[i][j] * dV[j][i]
				}
			}
			assertDualClose(actual, { v: fdValue, d: jacobiDeriv }, 1e-9, 'Jacobi formula 5x5')
		})

		test('satisfies multiplicativity det(A * B) = det(A) * det(B) in dual arithmetic', () => {
			const A = [
				[D(1, 0.5), D(-2, 1), D(3, -0.25), D(0, 0.75)],
				[D(2, -1), D(4, 0.5), D(-1, 2), D(1, -0.5)],
				[D(-1, 0.25), D(0, -1.5), D(2, 1), D(3, 0.5)],
				[D(3, 1), D(1, 0), D(-2, -0.5), D(5, 1.25)],
			]
			const B = [
				[D(2, -0.5), D(1, 1.5), D(0, -1), D(-1, 0.25)],
				[D(-3, 0.75), D(2, -1), D(1, 0.5), D(4, 1)],
				[D(1, 1), D(-1, 0.25), D(3, -0.75), D(2, -1.5)],
				[D(0, -0.25), D(3, 0.5), D(-2, 1.25), D(1, 0.75)],
			]

			const detA = determinantDualRecursive(A)
			const detB = determinantDualRecursive(B)
			const detAB = determinantDualRecursive(dualMatMul(A, B))

			const expected = {
				v: detA.v * detB.v,
				d: detA.v * detB.d + detA.d * detB.v,
			}
			assertDualClose(detAB, expected, 1e-8, 'multiplicativity det(AB) = det(A)*det(B)')
		})

		test('transpose invariance det(A^T) = det(A) over dual numbers', () => {
			const A = [
				[D(3, -1), D(1, 2), D(-2, 0.5), D(4, 1.5)],
				[D(0, 3), D(-1, 1), D(5, -2), D(2, 0)],
				[D(2, 0.5), D(4, -1.5), D(1, 3), D(-3, 2)],
				[D(-1, 2), D(3, 0), D(2, 1), D(6, -1)],
			]
			const AT = A[0].map((_, j) => A.map((row) => row[j]))
			assertDualClose(
				determinantDualRecursive(A),
				determinantDualRecursive(AT),
				1e-12,
				'transpose invariance',
			)
		})
	})
})
