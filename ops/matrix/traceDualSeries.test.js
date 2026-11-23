import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { traceDualSeries } from './traceDualSeries.js'

const dual = (v, d) => ({ v, d })
const dualAdd = (a, b) => ({ v: a.v + b.v, d: a.d + b.d })
const dualSub = (a, b) => ({ v: a.v - b.v, d: a.d - b.d })
const dualMul = (a, b) => ({ v: a.v * b.v, d: a.v * b.d + a.d * b.v })
const dualDiv = (a, b) => ({
	v: a.v / b.v,
	d: (a.d * b.v - a.v * b.d) / (b.v * b.v),
})

function matMulDual(A, B) {
	const n = A.length
	const out = Array.from({ length: n }, () => Array(n))
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let acc = dual(0, 0)
			for (let k = 0; k < n; k++) {
				acc = dualAdd(acc, dualMul(A[i][k], B[k][j]))
			}
			out[i][j] = acc
		}
	}
	return out
}

function matTranspose(M) {
	const n = M.length
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => M[j][i])
	)
}

function assertDualClose(actual, expected, tol = 1e-12) {
	assert.ok(
		Math.abs(actual.v - expected.v) <= tol,
		`Expected v=${actual.v} to be within ${tol} of ${expected.v}`
	)
	assert.ok(
		Math.abs(actual.d - expected.d) <= tol,
		`Expected d=${actual.d} to be within ${tol} of ${expected.d}`
	)
}

describe('traceDualSeries', () => {
	describe('normal cases', () => {
		it('computes trace of a 1×1 dual matrix', () => {
			assert.deepStrictEqual(traceDualSeries([[dual(3.5, -1.25)]]), {
				v: 3.5,
				d: -1.25,
			})
		})

		it('computes trace of a 2×2 dual matrix', () => {
			const M = [
				[dual(1, 2), dual(3, 4)],
				[dual(5, 6), dual(7, 8)],
			]
			assert.deepStrictEqual(traceDualSeries(M), { v: 8, d: 10 })
		})

		it('computes trace of a 3×3 dual matrix ignoring off-diagonal entries', () => {
			const M = [
				[dual(2, -1), dual(100, 200), dual(-50, 75)],
				[dual(999, -999), dual(-4.5, 3.25), dual(12, 34)],
				[dual(0, 42), dual(-8, 16), dual(6.5, 0.75)],
			]
			assert.deepStrictEqual(traceDualSeries(M), { v: 4, d: 3 })
		})

		it('computes trace of a 5×5 dual matrix with mixed signs', () => {
			const M = Array.from({ length: 5 }, (_, i) =>
				Array.from({ length: 5 }, (_, j) =>
					dual((i + 1) * (j === i ? (i % 2 === 0 ? 2 : -1) : 10), i - j + 1)
				)
			)
			// diagonal v: +2, -2, +6, -4, +10 => 12
			// diagonal d: 1, 1, 1, 1, 1 => 5
			assert.deepStrictEqual(traceDualSeries(M), { v: 12, d: 5 })
		})
	})

	describe('edge cases', () => {
		it('returns { v: 0, d: 0 } for an empty 0×0 matrix', () => {
			const result = traceDualSeries([])
			assert.deepStrictEqual(result, { v: 0, d: 0 })
			assert.ok(Object.is(result.v, 0))
			assert.ok(Object.is(result.d, 0))
		})

		it('normalizes negative zero to positive zero', () => {
			const M = [
				[dual(-0, -0), dual(1, 1)],
				[dual(2, 2), dual(-0, -0)],
			]
			const result = traceDualSeries(M)
			assert.ok(Object.is(result.v, 0))
			assert.ok(Object.is(result.d, 0))
		})

		it('handles constant matrix (all dual derivatives zero) and pure dual matrix (all primal values zero)', () => {
			const constant = [
				[dual(4, 0), dual(9, 0)],
				[dual(-2, 0), dual(6, 0)],
			]
			assert.deepStrictEqual(traceDualSeries(constant), { v: 10, d: 0 })

			const pureDual = [
				[dual(0, 3), dual(0, 7)],
				[dual(0, -1), dual(0, -8)],
			]
			assert.deepStrictEqual(traceDualSeries(pureDual), { v: 0, d: -5 })
		})

		it('preserves precision under catastrophic cancellation via Neumaier summation', () => {
			const M = [
				[dual(1e16, 1e16), dual(0, 0), dual(0, 0)],
				[dual(0, 0), dual(1, -2.5), dual(0, 0)],
				[dual(0, 0), dual(0, 0), dual(-1e16, -1e16)],
			]
			assert.deepStrictEqual(traceDualSeries(M), { v: 1, d: -2.5 })
		})

		it('does not mutate the input matrix or its entries', () => {
			const entry00 = Object.freeze(dual(2, 5))
			const entry01 = Object.freeze(dual(1, -1))
			const entry10 = Object.freeze(dual(3, 0))
			const entry11 = Object.freeze(dual(-4, 7))
			const M = Object.freeze([
				Object.freeze([entry00, entry01]),
				Object.freeze([entry10, entry11]),
			])
			assert.deepStrictEqual(traceDualSeries(M), { v: -2, d: 12 })
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when matrix is not an array', () => {
			for (const bad of [null, undefined, 42, 'matrix', { v: 1, d: 2 }]) {
				assert.throws(() => traceDualSeries(bad), TypeError)
			}
		})

		it('throws TypeError when any row is not an array', () => {
			assert.throws(() => traceDualSeries([dual(1, 0)]), TypeError)
			assert.throws(() => traceDualSeries([[dual(1, 0)], null]), TypeError)
		})

		it('throws RangeError for non-square or ragged matrices', () => {
			assert.throws(() => traceDualSeries([[]]), RangeError)
			assert.throws(
				() =>
					traceDualSeries([
						[dual(1, 0), dual(2, 0), dual(3, 0)],
						[dual(4, 0), dual(5, 0), dual(6, 0)],
					]),
				RangeError
			)
			assert.throws(
				() =>
					traceDualSeries([
						[dual(1, 0), dual(2, 0)],
						[dual(3, 0)],
					]),
				RangeError
			)
		})

		it('throws TypeError for malformed dual entries on diagonal or off-diagonal', () => {
			assert.throws(() => traceDualSeries([[null]]), TypeError)
			assert.throws(() => traceDualSeries([[1]]), TypeError)
			assert.throws(() => traceDualSeries([[[1, 2]]]), TypeError)
			assert.throws(() => traceDualSeries([[{ v: 1 }]]), TypeError)
			assert.throws(() => traceDualSeries([[{ d: 1 }]]), TypeError)
			assert.throws(() => traceDualSeries([[{ v: '1', d: 0 }]]), TypeError)
			// Invalid off-diagonal entry must still be rejected
			assert.throws(
				() =>
					traceDualSeries([
						[dual(1, 0), { v: 2, d: 'bad' }],
						[dual(3, 0), dual(4, 0)],
					]),
				TypeError
			)
		})

		it('throws RangeError for non-finite dual components (NaN, Infinity, -Infinity)', () => {
			for (const bad of [NaN, Infinity, -Infinity]) {
				assert.throws(() => traceDualSeries([[dual(bad, 0)]]), RangeError)
				assert.throws(() => traceDualSeries([[dual(0, bad)]]), RangeError)
				// Non-finite off-diagonal entry
				assert.throws(
					() =>
						traceDualSeries([
							[dual(1, 0), dual(bad, 0)],
							[dual(0, 1), dual(2, 0)],
						]),
					RangeError
				)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('matches central finite differences on a nonlinear parametric matrix M(t)', () => {
			const evalPrimal = (t) => [
				[Math.sin(t), Math.exp(t), t * t],
				[Math.cos(t), Math.exp(-0.5 * t) * t, Math.log(t + 2)],
				[t ** 3, Math.sin(2 * t), Math.cos(3 * t) + 0.5 * t * t],
			]
			const evalDual = (t) => [
				[
					dual(Math.sin(t), Math.cos(t)),
					dual(Math.exp(t), Math.exp(t)),
					dual(t * t, 2 * t),
				],
				[
					dual(Math.cos(t), -Math.sin(t)),
					dual(
						Math.exp(-0.5 * t) * t,
						Math.exp(-0.5 * t) * (1 - 0.5 * t)
					),
					dual(Math.log(t + 2), 1 / (t + 2)),
				],
				[
					dual(t ** 3, 3 * t * t),
					dual(Math.sin(2 * t), 2 * Math.cos(2 * t)),
					dual(Math.cos(3 * t) + 0.5 * t * t, -3 * Math.sin(3 * t) + t),
				],
			]
			const primalTrace = (M) => M[0][0] + M[1][1] + M[2][2]

			const t0 = 0.73
			const h = 1e-6
			const res = traceDualSeries(evalDual(t0))

			const expectedV = primalTrace(evalPrimal(t0))
			const fdDeriv =
				(primalTrace(evalPrimal(t0 + h)) - primalTrace(evalPrimal(t0 - h))) /
				(2 * h)

			assertDualClose(res, { v: expectedV, d: fdDeriv }, 1e-8)
		})

		it('satisfies dual-scalar linearity: tr(αX + βY) = α·tr(X) + β·tr(Y)', () => {
			const alpha = dual(2.5, -0.75)
			const beta = dual(-1.25, 3.0)
			const X = [
				[dual(1.5, -2.0), dual(4.0, 1.0)],
				[dual(-3.0, 0.5), dual(2.25, 1.75)],
			]
			const Y = [
				[dual(-0.5, 3.5), dual(2.0, -4.0)],
				[dual(1.0, 2.0), dual(5.5, -1.25)],
			]

			const combined = X.map((row, i) =>
				row.map((xij, j) =>
					dualAdd(dualMul(alpha, xij), dualMul(beta, Y[i][j]))
				)
			)

			const lhs = traceDualSeries(combined)
			const rhs = dualAdd(
				dualMul(alpha, traceDualSeries(X)),
				dualMul(beta, traceDualSeries(Y))
			)

			assertDualClose(lhs, rhs, 1e-12)
		})

		it('satisfies cyclic invariance tr(XY) = tr(YX) and transpose invariance tr(M^T) = tr(M)', () => {
			const X = [
				[dual(1, 0.5), dual(-2, 1.5), dual(3, -1)],
				[dual(0.5, 2), dual(4, -0.5), dual(-1, 3)],
				[dual(-2, 1), dual(1, -2), dual(2.5, 0.25)],
			]
			const Y = [
				[dual(2, -1), dual(1, 0.5), dual(-0.5, 2)],
				[dual(-3, 0.25), dual(0.5, 1), dual(2, -1.5)],
				[dual(1.5, 3), dual(-1, 2), dual(4, -0.75)],
			]

			assertDualClose(
				traceDualSeries(matMulDual(X, Y)),
				traceDualSeries(matMulDual(Y, X)),
				1e-12
			)
			assert.deepStrictEqual(
				traceDualSeries(X),
				traceDualSeries(matTranspose(X))
			)
		})

		it('satisfies similarity invariance tr(P M P⁻¹) = tr(M) for invertible dual P', () => {
			const M = [
				[dual(3.2, -1.1), dual(0.8, 2.4)],
				[dual(-1.5, 0.7), dual(4.6, 1.9)],
			]
			const P = [
				[dual(2.0, 0.5), dual(1.0, -0.3)],
				[dual(1.0, 0.2), dual(3.0, 0.4)],
			]
			// Dual 2×2 inverse: P⁻¹ = (1/det(P)) * [[d, -b], [-c, a]]
			const detP = dualSub(dualMul(P[0][0], P[1][1]), dualMul(P[0][1], P[1][0]))
			const neg = (x) => dual(-x.v, -x.d)
			const Pinv = [
				[dualDiv(P[1][1], detP), dualDiv(neg(P[0][1]), detP)],
				[dualDiv(neg(P[1][0]), detP), dualDiv(P[0][0], detP)],
			]

			const similar = matMulDual(matMulDual(P, M), Pinv)
			assertDualClose(traceDualSeries(similar), traceDualSeries(M), 1e-12)
		})
	})
})
