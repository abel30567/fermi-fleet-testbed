import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { determinantDualSeries } from './determinantDualSeries.js'

/**
 * Helper: assert two numbers are close within absolute + relative tolerance.
 */
function assertClose(actual, expected, tol = 1e-9, label = '') {
	const scale = Math.max(1, Math.abs(expected))
	assert.ok(
		Math.abs(actual - expected) <= tol * scale,
		`${label ? `${label}: ` : ''}expected ${actual} to be close to ${expected} (tol=${tol})`
	)
}

/**
 * Helper: assert two dual numbers are close.
 */
function assertDualClose(actual, expected, tol = 1e-9, label = '') {
	assertClose(actual.v, expected.v, tol, `${label} .v`)
	assertClose(actual.d, expected.d, tol, `${label} .d`)
}

/**
 * Independent real determinant via Gaussian elimination with full pivoting
 * for cross-checking against finite differences.
 */
function independentRealDet(M) {
	const n = M.length
	if (n === 0) return 1
	const A = M.map((row) => row.slice())
	let sign = 1
	for (let k = 0; k < n; k++) {
		let maxVal = 0
		let pr = k
		let pc = k
		for (let i = k; i < n; i++) {
			for (let j = k; j < n; j++) {
				const v = Math.abs(A[i][j])
				if (v > maxVal) {
					maxVal = v
					pr = i
					pc = j
				}
			}
		}
		if (maxVal === 0) return 0
		if (pr !== k) {
			;[A[k], A[pr]] = [A[pr], A[k]]
			sign = -sign
		}
		if (pc !== k) {
			for (let i = 0; i < n; i++) {
				;[A[i][k], A[i][pc]] = [A[i][pc], A[i][k]]
			}
			sign = -sign
		}
		const piv = A[k][k]
		for (let i = k + 1; i < n; i++) {
			const f = A[i][k] / piv
			for (let j = k + 1; j < n; j++) {
				A[i][j] -= f * A[k][j]
			}
		}
	}
	let prod = sign
	for (let i = 0; i < n; i++) prod *= A[i][i]
	return prod
}

/**
 * Dual matrix multiplication helper for algebraic identity cross-checks.
 */
function dualMatMul(A, B) {
	const n = A.length
	const C = Array.from({ length: n }, () =>
		Array.from({ length: n }, () => ({ v: 0, d: 0 }))
	)
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

/**
 * Dual matrix transpose helper.
 */
function dualTranspose(A) {
	const n = A.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => ({ v: A[j][i].v, d: A[j][i].d }))
	)
}

describe('determinantDualSeries - normal cases', () => {
	test('0x0 empty matrix returns { v: 1, d: 0 }', () => {
		assert.deepStrictEqual(determinantDualSeries([]), { v: 1, d: 0 })
	})

	test('1x1 matrix returns its single dual entry', () => {
		assert.deepStrictEqual(determinantDualSeries([[{ v: 7, d: -3 }]]), {
			v: 7,
			d: -3,
		})
		assert.deepStrictEqual(determinantDualSeries([[{ v: 0, d: 4.5 }]]), {
			v: 0,
			d: 4.5,
		})
	})

	test('2x2 matrix matches analytical derivative', () => {
		// A(t) = [[t, 2t + 1], [3, t^2]] at t = 2:
		// A(2) = [[2, 5], [3, 4]], A'(2) = [[1, 2], [0, 4]]
		// det(A(t)) = t^3 - 6t - 3 => det(2) = 8 - 12 - 3 = -7
		// d/dt det = 3t^2 - 6 => at t=2: 12 - 6 = 6
		const M = [
			[
				{ v: 2, d: 1 },
				{ v: 5, d: 2 },
			],
			[
				{ v: 3, d: 0 },
				{ v: 4, d: 4 },
			],
		]
		assertDualClose(determinantDualSeries(M), { v: -7, d: 6 }, 1e-12)
	})

	test('3x3 matrix matches analytical derivative', () => {
		// A(t) = [[1+t, 2, 0], [0, 3+2t, 1], [1, 0, 2-t]] at t = 0
		// det(A(t)) = (1+t)(3+2t)(2-t) + 2*1*1 = (3 + 5t + 2t^2)(2 - t) + 2
		//           = 6 + 7t - t^2 - 2t^3 + 2 = 8 + 7t - t^2 - 2t^3
		// At t = 0: v = 8, d = 7
		const M = [
			[
				{ v: 1, d: 1 },
				{ v: 2, d: 0 },
				{ v: 0, d: 0 },
			],
			[
				{ v: 0, d: 0 },
				{ v: 3, d: 2 },
				{ v: 1, d: 0 },
			],
			[
				{ v: 1, d: 0 },
				{ v: 0, d: 0 },
				{ v: 2, d: -1 },
			],
		]
		assertDualClose(determinantDualSeries(M), { v: 8, d: 7 }, 1e-12)
	})

	test('4x4 dense matrix requiring pivoting matches analytical value and derivative', () => {
		// Upper-left entry is 0, forcing row pivoting in LU.
		// A(t) = [[0, 1+t, 2, 0],
		//         [2, 1, 0, 3],
		//         [0, 0, 1+2t, 1],
		//         [1, 0, 0, 2-t]] at t = 0
		// Expand along col 0: -2 * det([[1+t, 2, 0], [0, 1+2t, 1], [0, 0, 2-t]])
		//                     -1 * det([[1+t, 2, 0], [1, 0, 3], [0, 1+2t, 1]])
		// Term1 = -2 * (1+t)(1+2t)(2-t) = -2 * (2 + 5t + t^2 - 2t^3) = -4 - 10t + O(t^2)
		// Term2: det([[1+t, 2, 0], [1, 0, 3], [0, 1+2t, 1]])
		//      = (1+t)(0 - 3(1+2t)) - 2(1 - 0) = -3(1+t)(1+2t) - 2 = -5 - 9t + O(t^2)
		// Total = Term1 - Term2 = (-4 - 10t) - (-5 - 9t) = 1 - t + O(t^2)
		const M = [
			[
				{ v: 0, d: 0 },
				{ v: 1, d: 1 },
				{ v: 2, d: 0 },
				{ v: 0, d: 0 },
			],
			[
				{ v: 2, d: 0 },
				{ v: 1, d: 0 },
				{ v: 0, d: 0 },
				{ v: 3, d: 0 },
			],
			[
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 1, d: 2 },
				{ v: 1, d: 0 },
			],
			[
				{ v: 1, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 2, d: -1 },
			],
		]
		assertDualClose(determinantDualSeries(M), { v: 1, d: -1 }, 1e-12)
	})

	test('diagonal and upper-triangular 5x5 matrices obey product rule', () => {
		const diag = [
			{ v: 2, d: 1 },
			{ v: -3, d: 2 },
			{ v: 4, d: -1 },
			{ v: 5, d: 0.5 },
			{ v: -1, d: 3 },
		]
		// Upper triangular with arbitrary dual super-diagonal entries (which do not affect det)
		const M = Array.from({ length: 5 }, (_, i) =>
			Array.from({ length: 5 }, (_, j) => {
				if (i === j) return diag[i]
				if (j > i) return { v: (i + 1) * (j + 2), d: i - j }
				return { v: 0, d: 0 }
			})
		)
		// Expected via product rule
		const v = diag.reduce((acc, x) => acc * x.v, 1)
		const d = diag.reduce((acc, x, idx) => {
			let term = x.d
			for (let k = 0; k < diag.length; k++) {
				if (k !== idx) term *= diag[k].v
			}
			return acc + term
		}, 0)
		assertDualClose(determinantDualSeries(M), { v, d }, 1e-12)
	})

	test('constant matrix (all d = 0) yields exact d = 0 and normalizes -0', () => {
		const M = [
			[
				{ v: -0, d: -0 },
				{ v: 1, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			],
			[
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 1, d: 0 },
				{ v: 0, d: 0 },
			],
			[
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 1, d: 0 },
			],
			[
				{ v: 1, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			],
		]
		const res = determinantDualSeries(M)
		assert.deepStrictEqual(res, { v: -1, d: 0 })
		assert.ok(Object.is(res.d, 0))
	})

	test('does not mutate input matrix', () => {
		const M = [
			[
				{ v: 1, d: 2 },
				{ v: 3, d: 4 },
				{ v: 5, d: 6 },
				{ v: 7, d: 8 },
			],
			[
				{ v: 2, d: 1 },
				{ v: 0, d: 3 },
				{ v: 4, d: -1 },
				{ v: 1, d: 2 },
			],
			[
				{ v: -1, d: 0 },
				{ v: 2, d: 2 },
				{ v: 1, d: 1 },
				{ v: 3, d: -2 },
			],
			[
				{ v: 0, d: 1 },
				{ v: -2, d: 0 },
				{ v: 3, d: 1 },
				{ v: 2, d: 1 },
			],
		]
		const snapshot = structuredClone(M)
		determinantDualSeries(M)
		assert.deepStrictEqual(M, snapshot)
	})
})

describe('determinantDualSeries - edge cases', () => {
	test('singular rank-(n-1) matrices have v = 0 and nonzero d', () => {
		// 2x2: [[1, 0], [0, ε]] => det = ε
		assert.deepStrictEqual(
			determinantDualSeries([
				[
					{ v: 1, d: 0 },
					{ v: 0, d: 0 },
				],
				[
					{ v: 0, d: 0 },
					{ v: 0, d: 1 },
				],
			]),
			{ v: 0, d: 1 }
		)

		// 4x4 with first column of V identically zero:
		// V = diag(0, 2, 3, 4), D has D[0][0] = 5 => det(V + ε D) = 5*2*3*4 ε = 120 ε
		const M4col0 = Array.from({ length: 4 }, (_, i) =>
			Array.from({ length: 4 }, (_, j) => ({
				v: i === j && i > 0 ? i + 1 : 0,
				d: i === 0 && j === 0 ? 5 : 0,
			}))
		)
		assertDualClose(determinantDualSeries(M4col0), { v: 0, d: 120 }, 1e-12)

		// 4x4 non-diagonal rank-3 matrix (row 0 = row 1 in V)
		// V = [[1, 2, 0, 0], [1, 2, 0, 0], [0, 0, 3, 1], [0, 0, 1, 2]]
		// D = [[1, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]
		// det(V + ε D) = det([[1+ε, 2], [1, 2]]) * det([[3, 1], [1, 2]])
		//              = (2ε) * (6 - 1) = 10ε
		const M4rank3 = [
			[
				{ v: 1, d: 1 },
				{ v: 2, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			],
			[
				{ v: 1, d: 0 },
				{ v: 2, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			],
			[
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 3, d: 0 },
				{ v: 1, d: 0 },
			],
			[
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 1, d: 0 },
				{ v: 2, d: 0 },
			],
		]
		assertDualClose(determinantDualSeries(M4rank3), { v: 0, d: 10 }, 1e-12)
	})

	test('singular rank-(n-2) and zero matrices have v = 0 and d = 0', () => {
		// 4x4 rank-2: det(diag(2, 3, ε, ε)) = 6 ε^2 = 0 in dual numbers
		const M4rank2 = Array.from({ length: 4 }, (_, i) =>
			Array.from({ length: 4 }, (_, j) => ({
				v: i === j && i < 2 ? i + 2 : 0,
				d: i === j && i >= 2 ? 1 : 0,
			}))
		)
		assert.deepStrictEqual(determinantDualSeries(M4rank2), { v: 0, d: 0 })

		// 4x4 all-zero V with dense nonzero D
		const M4zeroV = Array.from({ length: 4 }, (_, i) =>
			Array.from({ length: 4 }, (_, j) => ({ v: 0, d: i + j + 1 }))
		)
		assert.deepStrictEqual(determinantDualSeries(M4zeroV), { v: 0, d: 0 })
	})

	test('near-singular / ill-conditioned 4x4 matrix triggers stable multilinearity fallback', () => {
		// V = diag(1, 1, 1, 1e-12), D = diag(1, 1, 1, 1)
		// det(V) = 1e-12
		// d/dε det(V + ε D) = 1e-12 + 1e-12 + 1e-12 + 1 = 1 + 3e-12
		const eps = 1e-12
		const M = [
			[
				{ v: 1, d: 1 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			],
			[
				{ v: 0, d: 0 },
				{ v: 1, d: 1 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			],
			[
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 1, d: 1 },
				{ v: 0, d: 0 },
			],
			[
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
				{ v: eps, d: 1 },
			],
		]
		assertDualClose(
			determinantDualSeries(M),
			{ v: eps, d: 1 + 3 * eps },
			1e-12
		)
	})

	test('input validation rejects invalid shapes, types, and non-finite values', () => {
		assert.throws(() => determinantDualSeries(null), TypeError)
		assert.throws(() => determinantDualSeries(undefined), TypeError)
		assert.throws(() => determinantDualSeries('matrix'), TypeError)
		assert.throws(() => determinantDualSeries([1, 2]), TypeError)
		assert.throws(() => determinantDualSeries([[]]), RangeError)
		assert.throws(
			() => determinantDualSeries([[{ v: 1, d: 0 }, { v: 2, d: 0 }]]),
			RangeError
		)
		assert.throws(
			() =>
				determinantDualSeries([
					[{ v: 1, d: 0 }],
					[
						{ v: 2, d: 0 },
						{ v: 3, d: 0 },
					],
				]),
			RangeError
		)
		assert.throws(() => determinantDualSeries([[null]]), TypeError)
		assert.throws(() => determinantDualSeries([[5]]), TypeError)
		assert.throws(() => determinantDualSeries([[{ v: 1 }]]), TypeError)
		assert.throws(
			() => determinantDualSeries([[{ v: '1', d: 0 }]]),
			TypeError
		)
		assert.throws(
			() => determinantDualSeries([[{ v: NaN, d: 0 }]]),
			RangeError
		)
		assert.throws(
			() => determinantDualSeries([[{ v: 1, d: Infinity }]]),
			RangeError
		)
		assert.throws(
			() => determinantDualSeries([[{ v: -Infinity, d: 0 }]]),
			RangeError
		)
	})
})

describe('determinantDualSeries - independent cross-checks', () => {
	test('central finite-difference cross-check across sizes 2, 3, 4, 6 (including singular point)', () => {
		const h = 1e-6

		for (const n of [2, 3, 4, 6]) {
			const t0 = 0.37
			const buildReal = (t) =>
				Array.from({ length: n }, (_, i) =>
					Array.from(
						{ length: n },
						(_, j) =>
							Math.sin((i + 1) * t + 0.5 * (j + 1)) +
							(i === j ? 2.5 : 0.3 * Math.cos((i + j + 1) * t))
					)
				)
			const buildDual = (t) =>
				Array.from({ length: n }, (_, i) =>
					Array.from({ length: n }, (_, j) => ({
						v:
							Math.sin((i + 1) * t + 0.5 * (j + 1)) +
							(i === j ? 2.5 : 0.3 * Math.cos((i + j + 1) * t)),
						d:
							(i + 1) * Math.cos((i + 1) * t + 0.5 * (j + 1)) +
							(i === j
								? 0
								: -0.3 *
									(i + j + 1) *
									Math.sin((i + j + 1) * t)),
					}))
				)

			const dualRes = determinantDualSeries(buildDual(t0))
			const vExpected = independentRealDet(buildReal(t0))
			const dFiniteDiff =
				(independentRealDet(buildReal(t0 + h)) -
					independentRealDet(buildReal(t0 - h))) /
				(2 * h)

			assertClose(dualRes.v, vExpected, 1e-11, `n=${n} primal`)
			assertClose(dualRes.d, dFiniteDiff, 1e-7, `n=${n} finite-diff`)
		}

		// Singular point cross-check: 4x4 matrix A(t) with det(A(0)) = 0 but nonzero derivative
		const buildSingularReal = (t) => [
			[1 + t, 2, 3 - t, 1],
			[1, 2 + 2 * t, 3, 1 + t],
			[0, 1, 2 + t, 4],
			[2, 1, 0, 3 - 2 * t],
		]
		const buildSingularDual = () => [
			[
				{ v: 1, d: 1 },
				{ v: 2, d: 0 },
				{ v: 3, d: -1 },
				{ v: 1, d: 0 },
			],
			[
				{ v: 1, d: 0 },
				{ v: 2, d: 2 },
				{ v: 3, d: 0 },
				{ v: 1, d: 1 },
			],
			[
				{ v: 0, d: 0 },
				{ v: 1, d: 0 },
				{ v: 2, d: 1 },
				{ v: 4, d: 0 },
			],
			[
				{ v: 2, d: 0 },
				{ v: 1, d: 0 },
				{ v: 0, d: 0 },
				{ v: 3, d: -2 },
			],
		]
		const singRes = determinantDualSeries(buildSingularDual())
		const singFD =
			(independentRealDet(buildSingularReal(h)) -
				independentRealDet(buildSingularReal(-h))) /
			(2 * h)
		assertClose(singRes.v, 0, 1e-12, 'singular primal')
		assertClose(singRes.d, singFD, 1e-7, 'singular finite-diff')
		assert.ok(Math.abs(singRes.d) > 1, 'derivative at singular point is nonzero')
	})

	test('algebraic identity: det(A * B) = det(A) * det(B) over dual numbers', () => {
		for (const n of [2, 3, 4, 5]) {
			const A = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => ({
					v: Math.sin(i * 3 + j + 1) + (i === j ? 2 : 0),
					d: Math.cos(i + j * 2 + 0.5),
				}))
			)
			const B = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => ({
					v: Math.cos(i * 2 - j + 0.7) + (i === j ? 1.5 : 0),
					d: Math.sin(i * 1.3 + j * 0.9),
				}))
			)
			const detA = determinantDualSeries(A)
			const detB = determinantDualSeries(B)
			const detAB = determinantDualSeries(dualMatMul(A, B))
			const expected = {
				v: detA.v * detB.v,
				d: detA.v * detB.d + detA.d * detB.v,
			}
			assertDualClose(detAB, expected, 1e-10, `multiplicativity n=${n}`)
		}
	})

	test('algebraic identities: transpose invariance, row swap antisymmetry, and Jacobi trace identity', () => {
		const n = 5
		const A = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) => ({
				v: ((i + 1) * (j + 2)) % 7 - 2 + (i === j ? 3 : 0),
				d: ((i * 3 + j) % 5) - 2,
			}))
		)

		// Transpose invariance: det(A^T) = det(A)
		const detA = determinantDualSeries(A)
		const detAT = determinantDualSeries(dualTranspose(A))
		assertDualClose(detAT, detA, 1e-10, 'transpose invariance')

		// Row swap antisymmetry: swapping two rows negates v and d
		const swapped = A.slice()
		;[swapped[1], swapped[4]] = [swapped[4], swapped[1]]
		const detSwapped = determinantDualSeries(swapped)
		assertDualClose(
			detSwapped,
			{ v: -detA.v, d: -detA.d },
			1e-10,
			'row swap antisymmetry'
		)

		// Jacobi's identity at I: det(I + ε B) = { v: 1, d: tr(B) }
		let traceB = 0
		const IplusEpsB = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) => {
				const bij = Math.sin(i * 2.1 + j * 1.7) * 5
				if (i === j) traceB += bij
				return { v: i === j ? 1 : 0, d: bij }
			})
		)
		assertDualClose(
			determinantDualSeries(IplusEpsB),
			{ v: 1, d: traceB },
			1e-12,
			'Jacobi trace identity at I'
		)
	})
})
