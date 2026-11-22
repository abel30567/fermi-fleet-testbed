import { describe, test } from 'node:test'
import assert from 'node:assert'
import { traceDualSeries } from './traceDualSeries.js'

const dual = (v, d) => ({ v, d })

function dualAdd(a, b) {
	return { v: a.v + b.v, d: a.d + b.d }
}

function dualMul(a, b) {
	return { v: a.v * b.v, d: a.v * b.d + a.d * b.v }
}

function matMulDual(A, B) {
	const n = A.length
	const C = Array.from({ length: n }, () => Array.from({ length: n }, () => dual(0, 0)))
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let acc = dual(0, 0)
			for (let k = 0; k < n; k++) {
				acc = dualAdd(acc, dualMul(A[i][k], B[k][j]))
			}
			C[i][j] = acc
		}
	}
	return C
}

function assertClose(actual, expected, tol = 1e-12, label = '') {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${label}: expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`,
	)
}

describe('traceDualSeries', () => {
	test('computes trace of a 2x2 dual matrix', () => {
		const M = [
			[dual(1.5, 0.5), dual(100, -50)],
			[dual(-42, 17), dual(2.25, -1.75)],
		]
		const res = traceDualSeries(M)
		assert.deepStrictEqual(res, { v: 3.75, d: -1.25 })
	})

	test('computes trace of a 3x3 dual matrix', () => {
		const M = [
			[dual(1, 2), dual(3, 4), dual(5, 6)],
			[dual(7, 8), dual(-4, 0.5), dual(9, 10)],
			[dual(11, 12), dual(13, 14), dual(10, -3.5)],
		]
		const res = traceDualSeries(M)
		assert.deepStrictEqual(res, { v: 7, d: -1 })
	})

	test('handles 1x1 matrix', () => {
		assert.deepStrictEqual(traceDualSeries([[dual(7.5, -2.5)]]), { v: 7.5, d: -2.5 })
	})

	test('handles zero matrix and cancelling negative entries', () => {
		const zeros = [
			[dual(0, 0), dual(0, 0)],
			[dual(0, 0), dual(0, 0)],
		]
		assert.deepStrictEqual(traceDualSeries(zeros), { v: 0, d: 0 })

		const cancelling = [
			[dual(-5, 3), dual(99, 88)],
			[dual(-77, -66), dual(5, -3)],
		]
		const res = traceDualSeries(cancelling)
		assert.deepStrictEqual(res, { v: 0, d: 0 })
		assert.strictEqual(Object.is(res.v, -0), false)
		assert.strictEqual(Object.is(res.d, -0), false)
	})

	test('handles negative zeros cleanly', () => {
		const M = [[dual(-0, -0)]]
		const res = traceDualSeries(M)
		assert.strictEqual(Object.is(res.v, 0), true)
		assert.strictEqual(Object.is(res.d, 0), true)
	})

	test('preserves precision under Neumaier compensated summation', () => {
		const M = [
			[dual(1e16, 1e16), dual(0, 0), dual(0, 0)],
			[dual(0, 0), dual(1, -2), dual(0, 0)],
			[dual(0, 0), dual(0, 0), dual(-1e16, -1e16)],
		]
		const res = traceDualSeries(M)
		assert.deepStrictEqual(res, { v: 1, d: -2 })
	})

	test('cross-check: matches central finite-difference derivative of real matrix trace', () => {
		// Smooth matrix-valued function M(t)
		const evalReal = (t) => [
			[Math.sin(t) + 2 * t * t, Math.cos(3 * t), t * t * t],
			[Math.exp(-t), Math.exp(0.5 * t) - t, Math.sin(2 * t)],
			[t + 1, -t * t, Math.cos(2 * t) + 0.25 * t * t * t],
		]

		// Exact analytical derivative M'(t)
		const evalDeriv = (t) => [
			[Math.cos(t) + 4 * t, -3 * Math.sin(3 * t), 3 * t * t],
			[-Math.exp(-t), 0.5 * Math.exp(0.5 * t) - 1, 2 * Math.cos(2 * t)],
			[1, -2 * t, -2 * Math.sin(2 * t) + 0.75 * t * t],
		]

		const realTrace = (A) => A.reduce((acc, row, i) => acc + row[i], 0)

		const t0 = 0.7
		const A0 = evalReal(t0)
		const dA0 = evalDeriv(t0)
		const Mdual = A0.map((row, i) => row.map((v, j) => dual(v, dA0[i][j])))

		const res = traceDualSeries(Mdual)

		const h = 1e-6
		const fdDeriv = (realTrace(evalReal(t0 + h)) - realTrace(evalReal(t0 - h))) / (2 * h)

		assertClose(res.v, realTrace(A0), 1e-14, 'primal trace')
		assertClose(res.d, fdDeriv, 1e-8, 'derivative trace vs central finite difference')
	})

	test('cross-check: satisfies cyclic identity tr(AB) = tr(BA) over dual matrices', () => {
		const A = [
			[dual(1.2, -0.4), dual(-2.5, 1.1), dual(0.7, 0.3)],
			[dual(3.1, 0.8), dual(0.5, -1.7), dual(-1.4, 2.2)],
			[dual(-0.9, 1.5), dual(2.0, -0.6), dual(1.8, 0.9)],
		]
		const B = [
			[dual(-0.6, 1.3), dual(1.9, -0.5), dual(2.4, 0.2)],
			[dual(0.8, -2.1), dual(-1.1, 0.4), dual(0.3, 1.6)],
			[dual(1.5, 0.7), dual(-0.4, 1.2), dual(-2.2, -0.8)],
		]

		const trAB = traceDualSeries(matMulDual(A, B))
		const trBA = traceDualSeries(matMulDual(B, A))

		assertClose(trAB.v, trBA.v, 1e-12, 'cyclic primal tr(AB) = tr(BA)')
		assertClose(trAB.d, trBA.d, 1e-12, 'cyclic derivative tr(AB) = tr(BA)')
	})

	test('cross-check: satisfies dual linearity tr(αA + βB) = α tr(A) + β tr(B)', () => {
		const alpha = dual(2.5, -0.75)
		const beta = dual(-1.25, 0.5)
		const A = [
			[dual(1, 2), dual(3, -1)],
			[dual(0, 4), dual(-2, 3)],
		]
		const B = [
			[dual(4, -3), dual(1, 1)],
			[dual(-5, 2), dual(6, -1)],
		]

		const combo = A.map((row, i) =>
			row.map((a, j) => dualAdd(dualMul(alpha, a), dualMul(beta, B[i][j]))),
		)

		const lhs = traceDualSeries(combo)
		const rhs = dualAdd(dualMul(alpha, traceDualSeries(A)), dualMul(beta, traceDualSeries(B)))

		assertClose(lhs.v, rhs.v, 1e-12, 'linearity primal')
		assertClose(lhs.d, rhs.d, 1e-12, 'linearity derivative')
	})

	test('validates non-array, empty, and non-square inputs', () => {
		assert.throws(() => traceDualSeries(null), TypeError)
		assert.throws(() => traceDualSeries(undefined), TypeError)
		assert.throws(() => traceDualSeries(42), TypeError)
		assert.throws(() => traceDualSeries({ v: 1, d: 2 }), TypeError)
		assert.throws(() => traceDualSeries([]), RangeError)
		assert.throws(() => traceDualSeries([dual(1, 0)]), TypeError)
		assert.throws(() => traceDualSeries([[dual(1, 0), dual(2, 0)]]), RangeError)
		assert.throws(() => traceDualSeries([[dual(1, 0)], [dual(2, 0)]]), RangeError)
		assert.throws(
			() => traceDualSeries([[dual(1, 0), dual(2, 0)], [dual(3, 0)]]),
			RangeError,
		)
	})

	test('validates malformed and non-finite dual entries (diagonal and off-diagonal)', () => {
		assert.throws(() => traceDualSeries([[null]]), TypeError)
		assert.throws(() => traceDualSeries([[1]]), TypeError)
		assert.throws(() => traceDualSeries([[[1, 2]]]), TypeError)
		assert.throws(() => traceDualSeries([[{ v: 1 }]]), TypeError)
		assert.throws(() => traceDualSeries([[{ d: 1 }]]), TypeError)
		assert.throws(() => traceDualSeries([[{ v: '1', d: 0 }]]), TypeError)
		assert.throws(() => traceDualSeries([[dual(NaN, 0)]]), RangeError)
		assert.throws(() => traceDualSeries([[dual(0, Infinity)]]), RangeError)
		assert.throws(() => traceDualSeries([[dual(-Infinity, 0)]]), RangeError)
		// Off-diagonal malformed entry must also be rejected
		assert.throws(
			() =>
				traceDualSeries([
					[dual(1, 0), { v: 2, d: NaN }],
					[dual(0, 0), dual(3, 1)],
				]),
			RangeError,
		)
		assert.throws(
			() =>
				traceDualSeries([
					[dual(1, 0), 'invalid'],
					[dual(0, 0), dual(3, 1)],
				]),
			TypeError,
		)
	})
})
