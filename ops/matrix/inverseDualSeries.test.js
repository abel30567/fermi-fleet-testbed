import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { inverseDualSeries } from './inverseDualSeries.js'

/**
 * Helper: creates a dual number { v, d }.
 */
function dual(v, d = 0) {
	return { v, d }
}

/**
 * Helper: multiplies two dual numbers (a.v + ε a.d)(b.v + ε b.d).
 */
function dualMul(a, b) {
	return {
		v: a.v * b.v,
		d: a.v * b.d + a.d * b.v,
	}
}

/**
 * Helper: adds two dual numbers.
 */
function dualAdd(a, b) {
	return {
		v: a.v + b.v,
		d: a.d + b.d,
	}
}

/**
 * Helper: multiplies two n x n dual matrices.
 */
function matMulDual(M1, M2) {
	const n = M1.length
	const out = Array.from({ length: n }, () =>
		Array.from({ length: n }, () => dual(0, 0)),
	)
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let acc = dual(0, 0)
			for (let k = 0; k < n; k++) {
				acc = dualAdd(acc, dualMul(M1[i][k], M2[k][j]))
			}
			out[i][j] = acc
		}
	}
	return out
}

/**
 * Helper: asserts two dual matrices are close entrywise.
 */
function assertDualMatrixClose(actual, expected, tol = 1e-10) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assert.equal(actual[i].length, expected[i].length)
		for (let j = 0; j < expected[i].length; j++) {
			assert.ok(
				Math.abs(actual[i][j].v - expected[i][j].v) <= tol,
				`v mismatch at [${i}][${j}]: got ${actual[i][j].v}, expected ${expected[i][j].v}`,
			)
			assert.ok(
				Math.abs(actual[i][j].d - expected[i][j].d) <= tol,
				`d mismatch at [${i}][${j}]: got ${actual[i][j].d}, expected ${expected[i][j].d}`,
			)
		}
	}
}

/**
 * Helper: dual identity matrix of size n.
 */
function dualIdentity(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => dual(i === j ? 1 : 0, 0)),
	)
}

/**
 * Independent real matrix inverse via Gauss-Jordan elimination (for finite-difference cross-checks).
 */
function invertRealGaussJordan(A) {
	const n = A.length
	const aug = A.map((row, i) => [
		...row,
		...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
	])
	for (let col = 0; col < n; col++) {
		let pivot = col
		for (let r = col + 1; r < n; r++) {
			if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) pivot = r
		}
		;[aug[col], aug[pivot]] = [aug[pivot], aug[col]]
		const div = aug[col][col]
		for (let c = 0; c < 2 * n; c++) aug[col][c] /= div
		for (let r = 0; r < n; r++) {
			if (r === col) continue
			const factor = aug[r][col]
			for (let c = 0; c < 2 * n; c++) aug[r][c] -= factor * aug[col][c]
		}
	}
	return aug.map((row) => row.slice(n))
}

describe('inverseDualSeries', () => {
	test('1x1 dual matrix matches scalar reciprocal derivative (1/v, -d/v^2)', () => {
		const res = inverseDualSeries([[dual(4, 3)]])
		assertDualMatrixClose(res, [[dual(0.25, -3 / 16)]], 1e-15)
	})

	test('2x2 dual matrix matches closed-form adjugate/determinant formula', () => {
		// M = [[a, b], [c, d]] over dual numbers
		// M^-1 = (1 / det) * [[d, -b], [-c, a]], det = ad - bc
		const M = [
			[dual(4, 1), dual(7, -2)],
			[dual(2, 0.5), dual(6, 3)],
		]

		const a = M[0][0]
		const b = M[0][1]
		const c = M[1][0]
		const d = M[1][1]
		const ad = dualMul(a, d)
		const bc = dualMul(b, c)
		const det = { v: ad.v - bc.v, d: ad.d - bc.d }
		const invDet = { v: 1 / det.v, d: -det.d / (det.v * det.v) }

		const expected = [
			[dualMul(d, invDet), dualMul({ v: -b.v, d: -b.d }, invDet)],
			[dualMul({ v: -c.v, d: -c.d }, invDet), dualMul(a, invDet)],
		]

		const actual = inverseDualSeries(M)
		assertDualMatrixClose(actual, expected, 1e-14)
	})

	test('identity plus dual perturbation (I + εB)^-1 = I - εB', () => {
		const M = [
			[dual(1, 2), dual(0, -3), dual(0, 5)],
			[dual(0, 4), dual(1, 0), dual(0, -1)],
			[dual(0, -2), dual(0, 7), dual(1, 3)],
		]
		const expected = [
			[dual(1, -2), dual(0, 3), dual(0, -5)],
			[dual(0, -4), dual(1, 0), dual(0, 1)],
			[dual(0, 2), dual(0, -7), dual(1, -3)],
		]
		assertDualMatrixClose(inverseDualSeries(M), expected, 1e-15)
	})

	test('diagonal dual matrix inverts each diagonal element independently', () => {
		const M = [
			[dual(2, 1), dual(0, 0), dual(0, 0)],
			[dual(0, 0), dual(-5, 2), dual(0, 0)],
			[dual(0, 0), dual(0, 0), dual(0.5, -0.25)],
		]
		const expected = [
			[dual(0.5, -0.25), dual(0, 0), dual(0, 0)],
			[dual(0, 0), dual(-0.2, -2 / 25), dual(0, 0)],
			[dual(0, 0), dual(0, 0), dual(2, 1)],
		]
		assertDualMatrixClose(inverseDualSeries(M), expected, 1e-14)
	})

	test('matrix requiring row pivoting (zero diagonal) inverts accurately', () => {
		const M = [
			[dual(0, 1), dual(2, -1), dual(0, 0.5)],
			[dual(0, -2), dual(0, 3), dual(4, 2)],
			[dual(5, 0.5), dual(0, 1), dual(0, -1)],
		]
		const inv = inverseDualSeries(M)
		const I = dualIdentity(3)
		assertDualMatrixClose(matMulDual(M, inv), I, 1e-13)
		assertDualMatrixClose(matMulDual(inv, M), I, 1e-13)
	})

	test('zero derivatives produce positive +0 (no -0)', () => {
		const M = [
			[dual(2, 0), dual(1, 0)],
			[dual(1, 0), dual(3, 0)],
		]
		const inv = inverseDualSeries(M)
		for (const row of inv) {
			for (const cell of row) {
				assert.equal(Object.is(cell.d, -0), false)
				assert.equal(cell.d, 0)
			}
		}
	})

	test('cross-check: algebraic identities M*M^-1 = I, M^-1*M = I, (M^-1)^-1 = M, and (MN)^-1 = N^-1 M^-1', () => {
		const M = [
			[dual(3, 0.4), dual(-1, 1.2), dual(2, -0.5), dual(0.5, 0.1)],
			[dual(1, -0.3), dual(4, 0.7), dual(-2, 0.9), dual(1, -0.6)],
			[dual(-2, 1.1), dual(0.5, -0.2), dual(5, 0.3), dual(-1, 0.8)],
			[dual(0.25, -0.5), dual(2, 0.4), dual(1, -1.0), dual(3, 0.2)],
		]
		const N = [
			[dual(2, -0.1), dual(1, 0.5), dual(0, -0.2), dual(-1, 0.3)],
			[dual(-0.5, 0.2), dual(3, -0.4), dual(1, 0.7), dual(0.5, -0.1)],
			[dual(1, 0.6), dual(-1, 0.1), dual(4, -0.3), dual(2, 0.5)],
			[dual(0, -0.8), dual(0.5, 0.3), dual(-1, 0.2), dual(2.5, -0.6)],
		]

		const invM = inverseDualSeries(M)
		const invN = inverseDualSeries(N)
		const I4 = dualIdentity(4)

		assertDualMatrixClose(matMulDual(M, invM), I4, 1e-12)
		assertDualMatrixClose(matMulDual(invM, M), I4, 1e-12)
		assertDualMatrixClose(inverseDualSeries(invM), M, 1e-12)

		// (M * N)^-1 == N^-1 * M^-1
		const invMN = inverseDualSeries(matMulDual(M, N))
		const invN_invM = matMulDual(invN, invM)
		assertDualMatrixClose(invMN, invN_invM, 1e-11)
	})

	test('cross-check: central finite-difference derivative of A(t)^-1 matches dual component', () => {
		// Nonlinear parameterized matrix A(t) evaluated at t0 = 0.7
		const t0 = 0.7
		const buildReal = (t) => [
			[Math.exp(t) + 2, Math.sin(t), t * t - 1],
			[Math.cos(t), 3 + 0.5 * t, Math.sin(2 * t)],
			[0.2 * t - 0.5, -Math.exp(-t), 4 + Math.cos(t)],
		]
		const buildDeriv = (t) => [
			[Math.exp(t), Math.cos(t), 2 * t],
			[-Math.sin(t), 0.5, 2 * Math.cos(2 * t)],
			[0.2, Math.exp(-t), -Math.sin(t)],
		]

		const A0 = buildReal(t0)
		const B0 = buildDeriv(t0)
		const dualMatrix = A0.map((row, i) =>
			row.map((v, j) => dual(v, B0[i][j])),
		)

		const invDual = inverseDualSeries(dualMatrix)

		const h = 1e-6
		const invPlus = invertRealGaussJordan(buildReal(t0 + h))
		const invMinus = invertRealGaussJordan(buildReal(t0 - h))
		const invAtT0 = invertRealGaussJordan(A0)

		for (let i = 0; i < 3; i++) {
			for (let j = 0; j < 3; j++) {
				const fdDeriv = (invPlus[i][j] - invMinus[i][j]) / (2 * h)
				assert.ok(
					Math.abs(invDual[i][j].v - invAtT0[i][j]) < 1e-13,
					`primal mismatch at [${i}][${j}]`,
				)
				assert.ok(
					Math.abs(invDual[i][j].d - fdDeriv) < 1e-8,
					`derivative mismatch at [${i}][${j}]: dual=${invDual[i][j].d}, fd=${fdDeriv}`,
				)
			}
		}
	})

	test('relative tolerance handles uniformly small and uniformly large well-conditioned matrices', () => {
		const small = [
			[dual(1e-10, 2e-10), dual(0, 0)],
			[dual(0, 0), dual(2e-10, -1e-10)],
		]
		const invSmall = inverseDualSeries(small)
		assertDualMatrixClose(
			invSmall,
			[
				[dual(1e10, -2e10), dual(0, 0)],
				[dual(0, 0), dual(5e9, 2.5e9)],
			],
			1e-3,
		)

		const large = [
			[dual(1e10, 2e10), dual(0, 0)],
			[dual(0, 0), dual(2e10, -1e10)],
		]
		const invLarge = inverseDualSeries(large)
		assertDualMatrixClose(
			invLarge,
			[
				[dual(1e-10, -2e-10), dual(0, 0)],
				[dual(0, 0), dual(5e-11, 2.5e-11)],
			],
			1e-22,
		)
	})

	test('does not mutate input matrix or dual entries', () => {
		const M = [
			[dual(2, 1), dual(3, -1)],
			[dual(1, 0.5), dual(4, 2)],
		]
		const snapshot = structuredClone(M)
		inverseDualSeries(M)
		assert.deepStrictEqual(M, snapshot)
	})

	test('throws RangeError on singular or nearly singular primal matrices', () => {
		// Zero primal matrix (even if dual part is invertible)
		assert.throws(
			() =>
				inverseDualSeries([
					[dual(0, 1), dual(0, 0)],
					[dual(0, 0), dual(0, 1)],
				]),
			RangeError,
		)

		// 1x1 zero primal
		assert.throws(() => inverseDualSeries([[dual(0, 5)]]), RangeError)

		// Rank-deficient 2x2
		assert.throws(
			() =>
				inverseDualSeries([
					[dual(1, 1), dual(2, 0)],
					[dual(2, 0), dual(4, 1)],
				]),
			RangeError,
		)

		// Rank-deficient 3x3 (row 2 = row 0 + row 1)
		assert.throws(
			() =>
				inverseDualSeries([
					[dual(1, 0), dual(2, 1), dual(3, 0)],
					[dual(4, 1), dual(5, 0), dual(6, 1)],
					[dual(5, 0), dual(7, 0), dual(9, 0)],
				]),
			RangeError,
		)

		// Nearly singular matrix rejected with default tolerance, allowed with smaller tolerance
		const nearlySingular = [
			[dual(1, 0), dual(0, 0)],
			[dual(0, 0), dual(1e-13, 0)],
		]
		assert.throws(() => inverseDualSeries(nearlySingular), RangeError)
		const allowed = inverseDualSeries(nearlySingular, { tolerance: 1e-15 })
		assertDualMatrixClose(
			allowed,
			[
				[dual(1, 0), dual(0, 0)],
				[dual(0, 0), dual(1e13, 0)],
			],
			1e-1,
		)
	})

	test('throws on overflow to non-finite inverse', () => {
		assert.throws(
			() => inverseDualSeries([[dual(1e-320, 1)]]),
			RangeError,
		)
	})

	test('validates input types, dimensions, dual entries, and options', () => {
		// Non-array matrix
		assert.throws(() => inverseDualSeries(null), TypeError)
		assert.throws(() => inverseDualSeries(undefined), TypeError)
		assert.throws(() => inverseDualSeries(42), TypeError)
		assert.throws(() => inverseDualSeries({}), TypeError)

		// Empty matrix
		assert.throws(() => inverseDualSeries([]), RangeError)

		// Non-array row
		assert.throws(() => inverseDualSeries([dual(1, 0)]), TypeError)

		// Non-square / ragged matrices
		assert.throws(
			() =>
				inverseDualSeries([
					[dual(1, 0), dual(0, 0), dual(0, 0)],
					[dual(0, 0), dual(1, 0), dual(0, 0)],
				]),
			RangeError,
		)
		assert.throws(
			() =>
				inverseDualSeries([
					[dual(1, 0), dual(0, 0)],
					[dual(0, 0)],
				]),
			RangeError,
		)

		// Malformed dual cells
		assert.throws(() => inverseDualSeries([[1]]), TypeError)
		assert.throws(() => inverseDualSeries([[null]]), TypeError)
		assert.throws(() => inverseDualSeries([[[1, 0]]]), TypeError)
		assert.throws(() => inverseDualSeries([[{ v: 1 }]]), TypeError)
		assert.throws(() => inverseDualSeries([[{ d: 1 }]]), TypeError)
		assert.throws(() => inverseDualSeries([[{ v: '1', d: 0 }]]), TypeError)
		assert.throws(() => inverseDualSeries([[{ v: NaN, d: 0 }]]), TypeError)
		assert.throws(
			() => inverseDualSeries([[{ v: 1, d: Infinity }]]),
			TypeError,
		)
		assert.throws(
			() => inverseDualSeries([[{ v: -Infinity, d: 0 }]]),
			TypeError,
		)

		// Invalid options
		assert.throws(() => inverseDualSeries([[dual(1, 0)]], null), TypeError)
		assert.throws(() => inverseDualSeries([[dual(1, 0)]], []), TypeError)
		assert.throws(
			() => inverseDualSeries([[dual(1, 0)]], { tolerance: -1 }),
			RangeError,
		)
		assert.throws(
			() => inverseDualSeries([[dual(1, 0)]], { tolerance: NaN }),
			RangeError,
		)
		assert.throws(
			() => inverseDualSeries([[dual(1, 0)]], { tolerance: '1e-12' }),
			RangeError,
		)
	})
})
