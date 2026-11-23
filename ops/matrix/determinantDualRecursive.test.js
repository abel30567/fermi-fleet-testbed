import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { determinantDualRecursive } from './determinantDualRecursive.js'

const dual = (v, d = 0) => ({ v, d })

function assertDualClose(actual, expected, tol = 1e-9, msg = '') {
	assert.ok(
		Math.abs(actual.v - expected.v) <= tol,
		`${msg} value mismatch: actual=${actual.v}, expected=${expected.v}, diff=${Math.abs(actual.v - expected.v)}`,
	)
	assert.ok(
		Math.abs(actual.d - expected.d) <= tol,
		`${msg} derivative mismatch: actual=${actual.d}, expected=${expected.d}, diff=${Math.abs(actual.d - expected.d)}`,
	)
}

/**
 * Independent real determinant and inverse via Gauss-Jordan elimination
 * (used solely as an independent cross-check for Jacobi's formula and finite differences).
 */
function realDetAndInv(A) {
	const n = A.length
	const aug = A.map((row, i) => [
		...row,
		...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
	])

	let det = 1
	for (let col = 0; col < n; col++) {
		let pivot = col
		for (let r = col + 1; r < n; r++) {
			if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) {
				pivot = r
			}
		}
		if (Math.abs(aug[pivot][col]) < 1e-14) {
			return { det: 0, inv: null }
		}
		if (pivot !== col) {
			;[aug[col], aug[pivot]] = [aug[pivot], aug[col]]
			det = -det
		}
		const diag = aug[col][col]
		det *= diag
		for (let c = 0; c < 2 * n; c++) {
			aug[col][c] /= diag
		}
		for (let r = 0; r < n; r++) {
			if (r === col) continue
			const factor = aug[r][col]
			for (let c = 0; c < 2 * n; c++) {
				aug[r][c] -= factor * aug[col][c]
			}
		}
	}

	const inv = aug.map((row) => row.slice(n))
	return { det, inv }
}

/**
 * Independent Jacobi's formula: d/dt det(A(t)) = det(A) * tr(A^{-1} * dA).
 */
function jacobiCheck(A, dA) {
	const { det, inv } = realDetAndInv(A)
	assert.ok(inv !== null, 'Matrix must be invertible for Jacobi check')
	const n = A.length
	let trace = 0
	for (let i = 0; i < n; i++) {
		for (let k = 0; k < n; k++) {
			trace += inv[i][k] * dA[k][i]
		}
	}
	return { v: det, d: det * trace }
}

/**
 * Dual matrix multiplication C = A * B.
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
	describe('normal cases', () => {
		test('2x2 matrix with analytical derivative', () => {
			// A(t) = [[2t + 1, 3t], [t - 2, t + 4]] at t = 2:
			// A(2) = [[5, 6], [0, 6]], dA = [[2, 3], [1, 1]]
			// det(A(t)) = (2t + 1)(t + 4) - 3t(t - 2) = 2t^2 + 9t + 4 - 3t^2 + 6t = -t^2 + 15t + 4
			// det(2) = 30, d/dt det(2) = -2(2) + 15 = 11
			const M = [
				[dual(5, 2), dual(6, 3)],
				[dual(0, 1), dual(6, 1)],
			]
			assert.deepStrictEqual(determinantDualRecursive(M), { v: 30, d: 11 })
		})

		test('3x3 matrix with exact known determinant and derivative', () => {
			// A(t) = [[1+t, 2, 3], [0, 4+2t, 5], [1, 0, 6-t]] at t = 0
			// det(A(t)) = (1+t)(4+2t)(6-t) + 2*5*1 - 3*(4+2t)*1
			//           = (1+t)(24 + 8t - 2t^2) + 10 - 12 - 6t
			// At t=0: v = 24 + 10 - 12 = 22
			// d/dt at t=0: (24) + (8) - 6 = 26
			const M = [
				[dual(1, 1), dual(2, 0), dual(3, 0)],
				[dual(0, 0), dual(4, 2), dual(5, 0)],
				[dual(1, 0), dual(0, 0), dual(6, -1)],
			]
			assert.deepStrictEqual(determinantDualRecursive(M), { v: 22, d: 26 })
		})

		test('4x4 upper triangular matrix equals dual product of diagonal', () => {
			// Diagonal: (2 + 1e)(3 - 2e)(-1 + 4e)(5 + 0.5e)
			// v = 2 * 3 * (-1) * 5 = -30
			// d = -30 * (1/2 + (-2)/3 + 4/(-1) + 0.5/5) = -30 * (0.5 - 2/3 - 4 + 0.1) = 122
			const M = [
				[dual(2, 1), dual(7, 3), dual(-2, 5), dual(4, -1)],
				[dual(0, 0), dual(3, -2), dual(9, 1), dual(-3, 2)],
				[dual(0, 0), dual(0, 0), dual(-1, 4), dual(6, -3)],
				[dual(0, 0), dual(0, 0), dual(0, 0), dual(5, 0.5)],
			]
			assertDualClose(determinantDualRecursive(M), { v: -30, d: 122 }, 1e-12)
		})

		test('8x8 matrix exercises bitmask memoization quickly and accurately', () => {
			// Lower-triangular matrix with non-trivial dual entries
			const n = 8
			const M = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => {
					if (j > i) return dual(0, 0)
					if (i === j) return dual(i + 1, (i % 2 === 0 ? 1 : -1) * 0.25)
					return dual((i - j) * 0.5, (i + j) * 0.1)
				}),
			)
			// Expected: product of diagonal dual numbers
			let expected = dual(1, 0)
			for (let i = 0; i < n; i++) {
				const a = M[i][i]
				expected = {
					v: expected.v * a.v,
					d: expected.v * a.d + expected.d * a.v,
				}
			}
			assertDualClose(determinantDualRecursive(M), expected, 1e-9)
		})
	})

	describe('edge cases', () => {
		test('0x0 empty matrix returns { v: 1, d: 0 }', () => {
			assert.deepStrictEqual(determinantDualRecursive([]), { v: 1, d: 0 })
		})

		test('1x1 matrix returns its single entry', () => {
			assert.deepStrictEqual(determinantDualRecursive([[dual(-7.5, 2.25)]]), {
				v: -7.5,
				d: 2.25,
			})
		})

		test('zero matrix returns { v: 0, d: 0 } with positive zero', () => {
			const M = [
				[dual(0, 0), dual(0, 0), dual(0, 0)],
				[dual(0, 0), dual(0, 0), dual(0, 0)],
				[dual(0, 0), dual(0, 0), dual(0, 0)],
			]
			const res = determinantDualRecursive(M)
			assert.ok(Object.is(res.v, 0))
			assert.ok(Object.is(res.d, 0))
		})

		test('singular primal matrix with non-zero tangent yields exact non-zero derivative', () => {
			// A(t) = [[t, 1, 0], [0, 2, 1], [0, 0, 3]] at t = 0 => det(A(t)) = 6t => { v: 0, d: 6 }
			const M = [
				[dual(0, 1), dual(1, 0), dual(0, 0)],
				[dual(0, 0), dual(2, 0), dual(1, 0)],
				[dual(0, 0), dual(0, 0), dual(3, 0)],
			]
			assert.deepStrictEqual(determinantDualRecursive(M), { v: 0, d: 6 })
		})

		test('identical primal rows with distinct tangent rows yields non-zero derivative', () => {
			// [[1+e, 2], [1, 2+e]] => (1+e)(2+e) - 2 = 2 + 3e - 2 = 3e
			const M = [
				[dual(1, 1), dual(2, 0)],
				[dual(1, 0), dual(2, 1)],
			]
			assert.deepStrictEqual(determinantDualRecursive(M), { v: 0, d: 3 })
		})

		test('doubly singular matrix at t = 0 has v = 0 and d = 0', () => {
			// diag(t, t, 5) at t = 0 => det = 5t^2 => v = 0, d = 0
			const M = [
				[dual(0, 1), dual(0, 0), dual(0, 0)],
				[dual(0, 0), dual(0, 1), dual(0, 0)],
				[dual(0, 0), dual(0, 0), dual(5, 0)],
			]
			const res = determinantDualRecursive(M)
			assert.deepStrictEqual(res, { v: 0, d: 0 })
			assert.ok(Object.is(res.v, 0))
			assert.ok(Object.is(res.d, 0))
		})

		test('does not mutate input matrix or entries', () => {
			const M = [
				[dual(1, 2), dual(3, 4), dual(5, 6)],
				[dual(7, 8), dual(9, 10), dual(11, 12)],
				[dual(13, 14), dual(15, 16), dual(18, 19)],
			]
			const snapshot = structuredClone(M)
			determinantDualRecursive(M)
			assert.deepStrictEqual(M, snapshot)
		})
	})

	describe('algebraic identities and independent cross-checks', () => {
		test("cross-check against Jacobi's formula on 3x3, 4x4, and 5x5 matrices", () => {
			const cases = [
				{
					A: [
						[2, -1, 3],
						[0, 4, 1],
						[-2, 5, 2],
					],
					dA: [
						[1, 2, -1],
						[3, 0, 2],
						[-1, 1, 4],
					],
				},
				{
					A: [
						[3, 1, -2, 4],
						[2, -5, 1, 0],
						[-1, 3, 2, -2],
						[4, 0, -3, 5],
					],
					dA: [
						[0.5, -1.2, 0.3, 2.1],
						[-0.7, 1.4, -0.9, 0.2],
						[1.1, 0.8, -1.5, 0.6],
						[-0.4, 2.0, 0.7, -1.3],
					],
				},
				{
					A: [
						[4, -1, 2, 0, 3],
						[1, 5, -2, 1, -1],
						[0, 2, 6, -3, 2],
						[-2, 1, 0, 4, 1],
						[3, -2, 1, 2, 5],
					],
					dA: [
						[1, 0, -1, 2, 0.5],
						[-0.5, 1.5, 0.2, -1, 0.3],
						[0.7, -0.4, 1.1, 0.6, -0.8],
						[0.2, 0.9, -0.3, 1.2, -0.5],
						[-1.1, 0.3, 0.8, -0.7, 1.4],
					],
				},
			]

			for (const { A, dA } of cases) {
				const M = A.map((row, i) => row.map((v, j) => dual(v, dA[i][j])))
				const actual = determinantDualRecursive(M)
				const expected = jacobiCheck(A, dA)
				assertDualClose(actual, expected, 1e-8, `${A.length}x${A.length} Jacobi`)
			}
		})

		test('cross-check against central finite differences for nonlinear A(t) including singular point', () => {
			// Smooth nonlinear 4x4 matrix A(t)
			const buildReal = (t) => [
				[Math.sin(t), Math.cos(t), t * t + 1, Math.exp(0.3 * t)],
				[t, 2 * Math.cos(2 * t), -Math.sin(t), t + 2],
				[Math.exp(-0.2 * t), t * t, Math.cos(t) + 2, -t],
				[1 - t, Math.sin(2 * t), t, 3 + Math.cos(t)],
			]
			const buildDual = (t) => [
				[
					dual(Math.sin(t), Math.cos(t)),
					dual(Math.cos(t), -Math.sin(t)),
					dual(t * t + 1, 2 * t),
					dual(Math.exp(0.3 * t), 0.3 * Math.exp(0.3 * t)),
				],
				[
					dual(t, 1),
					dual(2 * Math.cos(2 * t), -4 * Math.sin(2 * t)),
					dual(-Math.sin(t), -Math.cos(t)),
					dual(t + 2, 1),
				],
				[
					dual(Math.exp(-0.2 * t), -0.2 * Math.exp(-0.2 * t)),
					dual(t * t, 2 * t),
					dual(Math.cos(t) + 2, -Math.sin(t)),
					dual(-t, -1),
				],
				[
					dual(1 - t, -1),
					dual(Math.sin(2 * t), 2 * Math.cos(2 * t)),
					dual(t, 1),
					dual(3 + Math.cos(t), -Math.sin(t)),
				],
			]

			const h = 1e-6
			for (const t0 of [0, 0.75, -1.2]) {
				const actual = determinantDualRecursive(buildDual(t0))
				const det0 = realDetAndInv(buildReal(t0)).det
				const detPlus = realDetAndInv(buildReal(t0 + h)).det
				const detMinus = realDetAndInv(buildReal(t0 - h)).det
				const fdDeriv = (detPlus - detMinus) / (2 * h)
				assertDualClose(actual, { v: det0, d: fdDeriv }, 1e-6, `FD at t=${t0}`)
			}
		})

		test('multiplicativity: det(A * B) = det(A) * det(B) in dual arithmetic', () => {
			const A = [
				[dual(2, 1), dual(-1, 0.5), dual(3, -2)],
				[dual(0, 2), dual(4, -1), dual(1, 0.3)],
				[dual(-2, 0.7), dual(5, 1.2), dual(2, -0.4)],
			]
			const B = [
				[dual(1, -0.5), dual(2, 0.8), dual(-1, 1.1)],
				[dual(3, 0.2), dual(-2, 1.5), dual(4, -0.6)],
				[dual(0, 1.3), dual(1, -0.9), dual(5, 0.4)],
			]
			const detA = determinantDualRecursive(A)
			const detB = determinantDualRecursive(B)
			const detAB = determinantDualRecursive(dualMatMul(A, B))
			const prod = {
				v: detA.v * detB.v,
				d: detA.v * detB.d + detA.d * detB.v,
			}
			assertDualClose(detAB, prod, 1e-9)
		})

		test('transpose invariance and row-swap antisymmetry', () => {
			const M = [
				[dual(1, 0.5), dual(-2, 1.2), dual(3, -0.7), dual(4, 0.1)],
				[dual(5, -0.3), dual(0, 2.0), dual(-1, 0.4), dual(2, -1.1)],
				[dual(-3, 0.8), dual(6, -0.5), dual(2, 1.3), dual(-4, 0.9)],
				[dual(2, -1.4), dual(1, 0.6), dual(-5, -0.2), dual(3, 1.5)],
			]
			const MT = M[0].map((_, j) => M.map((row) => row[j]))
			const swapped = [M[2], M[1], M[0], M[3]]

			const detM = determinantDualRecursive(M)
			const detMT = determinantDualRecursive(MT)
			const detSwapped = determinantDualRecursive(swapped)

			assertDualClose(detMT, detM, 1e-9, 'transpose')
			assertDualClose(detSwapped, { v: -detM.v, d: -detM.d }, 1e-9, 'row swap')
		})
	})

	describe('input validation', () => {
		test('rejects non-array matrix inputs', () => {
			for (const bad of [null, undefined, 42, 'matrix', {}, true]) {
				assert.throws(() => determinantDualRecursive(bad), TypeError)
			}
		})

		test('rejects non-array rows', () => {
			assert.throws(() => determinantDualRecursive([1, 2]), TypeError)
			assert.throws(() => determinantDualRecursive([[dual(1, 0)], null]), TypeError)
		})

		test('rejects non-square matrices', () => {
			assert.throws(() => determinantDualRecursive([[]]), RangeError)
			assert.throws(() => determinantDualRecursive([[dual(1, 0), dual(2, 0)]]), RangeError)
			assert.throws(
				() => determinantDualRecursive([[dual(1, 0)], [dual(2, 0)]]),
				RangeError,
			)
			assert.throws(
				() => determinantDualRecursive([[dual(1, 0), dual(2, 0)], [dual(3, 0)]]),
				RangeError,
			)
		})

		test('rejects malformed or non-finite dual entries', () => {
			const badEntries = [
				null,
				undefined,
				5,
				'1',
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: NaN, d: 0 },
				{ v: 0, d: NaN },
				{ v: Infinity, d: 0 },
				{ v: 0, d: -Infinity },
				{ v: '1', d: 0 },
				{ v: 1, d: '0' },
			]
			for (const bad of badEntries) {
				assert.throws(() => determinantDualRecursive([[bad]]), TypeError)
			}
		})
	})
})
