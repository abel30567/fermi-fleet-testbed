import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { projectionDualSeries } from './projectionDualSeries.js'

const dual = (v, d = 0) => ({ v, d })

function assertClose(actual, expected, tol = 1e-12, msg = '') {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${msg ? msg + ': ' : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`,
	)
}

function assertDualVectorClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < actual.length; i++) {
		assertClose(actual[i].v, expected[i].v, tol, `index ${i} value`)
		assertClose(actual[i].d, expected[i].d, tol, `index ${i} derivative`)
	}
}

function primalProjection(a, b) {
	let dotAB = 0
	let dotBB = 0
	for (let i = 0; i < a.length; i++) {
		dotAB += a[i] * b[i]
		dotBB += b[i] * b[i]
	}
	const s = dotAB / dotBB
	return b.map((bi) => s * bi)
}

function dualDot(u, w) {
	let v = 0
	let d = 0
	for (let i = 0; i < u.length; i++) {
		v += u[i].v * w[i].v
		d += u[i].d * w[i].v + u[i].v * w[i].d
	}
	return { v, d }
}

function dualScale(s, u) {
	return u.map((el) => ({
		v: s.v * el.v,
		d: s.d * el.v + s.v * el.d,
	}))
}

function dualSub(u, w) {
	return u.map((el, i) => ({
		v: el.v - w[i].v,
		d: el.d - w[i].d,
	}))
}

function dualAdd(u, w) {
	return u.map((el, i) => ({
		v: el.v + w[i].v,
		d: el.d + w[i].d,
	}))
}

describe('projectionDualSeries', () => {
	test('projects onto standard basis vector with constant target', () => {
		const a = [dual(3, 2), dual(4, -5), dual(-1, 7)]
		const b = [dual(1, 0), dual(0, 0), dual(0, 0)]
		const res = projectionDualSeries(a, b)
		assert.deepEqual(res, [dual(3, 2), dual(0, 0), dual(0, 0)])
	})

	test('computes exact value and derivative for 2D dual vectors', () => {
		// a(t) = [1 + 2t, 3 - t], b(t) = [2 + t, 0 + 3t]
		// At t = 0: a = [1, 3], a' = [2, -1], b = [2, 0], b' = [1, 3]
		// p = a·b: p_v = 2, p_d = (2*2 + 1*1) + (-1*0 + 3*3) = 5 + 9 = 14
		// q = b·b: q_v = 4, q_d = 2*(2*1 + 0*3) = 4
		// s = p/q: s_v = 2/4 = 0.5, s_d = (14 - 0.5*4)/4 = 3
		// proj = s*b:
		//   [0]: v = 0.5*2 = 1, d = 3*2 + 0.5*1 = 6.5
		//   [1]: v = 0.5*0 = 0, d = 3*0 + 0.5*3 = 1.5
		const a = [dual(1, 2), dual(3, -1)]
		const b = [dual(2, 1), dual(0, 3)]
		const res = projectionDualSeries(a, b)
		assertDualVectorClose(res, [dual(1, 6.5), dual(0, 1.5)], 1e-14)
	})

	test('projects zero vector a onto moving non-zero b', () => {
		const a = [dual(0, 0), dual(0, 0), dual(0, 0)]
		const b = [dual(1, 5), dual(-2, 3), dual(4, -1)]
		const res = projectionDualSeries(a, b)
		assert.deepEqual(res, [dual(0, 0), dual(0, 0), dual(0, 0)])
	})

	test('projects orthogonal vectors (zero primal, non-zero derivative)', () => {
		// a(t) = [0, 1], b(t) = [1, t] => proj = [t, t^2]/(1 + t^2) => at t=0: v=[0,0], d=[1,0]
		const a = [dual(0, 0), dual(1, 0)]
		const b = [dual(1, 0), dual(0, 1)]
		const res = projectionDualSeries(a, b)
		assertDualVectorClose(res, [dual(0, 1), dual(0, 0)], 1e-14)
	})

	test('1D projection returns a identically regardless of non-zero b and its derivative', () => {
		const a = [dual(-7.5, 4.25)]
		const b = [dual(3.2, -9.8)]
		const res = projectionDualSeries(a, b)
		assertDualVectorClose(res, a, 1e-13)
	})

	test('self-projection returns b unchanged in both value and derivative', () => {
		const b = [dual(1.5, -2.3), dual(-4.1, 0.7), dual(2.8, 3.9), dual(-0.6, 1.1)]
		const res = projectionDualSeries(b, b)
		assertDualVectorClose(res, b, 1e-13)
	})

	test('handles very large and very small target vector magnitudes without overflow/underflow', () => {
		const a = [dual(3, 1), dual(4, -2)]
		const largeB = [dual(1e200, 2e200), dual(0, -1e200)]
		const smallB = [dual(1e-200, 2e-200), dual(0, -1e-200)]
		const refB = [dual(1, 2), dual(0, -1)]

		const ref = projectionDualSeries(a, refB)
		assertDualVectorClose(projectionDualSeries(a, largeB), ref, 1e-12)
		assertDualVectorClose(projectionDualSeries(a, smallB), ref, 1e-12)
	})

	test('does not produce -0 in output components', () => {
		const a = [dual(0, 0), dual(1, 0)]
		const b = [dual(-2, 0), dual(0, 0)]
		const res = projectionDualSeries(a, b)
		for (const el of res) {
			assert.ok(!Object.is(el.v, -0), 'v must not be -0')
			assert.ok(!Object.is(el.d, -0), 'd must not be -0')
		}
	})

	test('independent cross-check: central finite-difference derivative matches dual derivative', () => {
		const cases = [
			{
				a: [dual(1.2, -0.7), dual(-3.4, 2.1), dual(0.8, 1.5)],
				b: [dual(-2.3, 0.9), dual(1.7, -1.3), dual(4.1, 0.4)],
			},
			{
				a: [dual(-5, 3), dual(2, -4), dual(7, 1), dual(-1, 6), dual(0.5, -0.2)],
				b: [dual(0.3, -1.1), dual(-2.2, 0.8), dual(1.4, 2.5), dual(3.1, -0.7), dual(-0.9, 1.6)],
			},
		]

		const h = 1e-6
		for (const { a, b } of cases) {
			const res = projectionDualSeries(a, b)
			const aPlus = a.map((el) => el.v + h * el.d)
			const aMinus = a.map((el) => el.v - h * el.d)
			const bPlus = b.map((el) => el.v + h * el.d)
			const bMinus = b.map((el) => el.v - h * el.d)

			const pPlus = primalProjection(aPlus, bPlus)
			const pMinus = primalProjection(aMinus, bMinus)
			const pZero = primalProjection(
				a.map((el) => el.v),
				b.map((el) => el.v),
			)

			for (let i = 0; i < a.length; i++) {
				const fd = (pPlus[i] - pMinus[i]) / (2 * h)
				assertClose(res[i].v, pZero[i], 1e-13, `primal mismatch at ${i}`)
				assertClose(res[i].d, fd, 1e-8, `finite-difference mismatch at ${i}`)
			}
		}
	})

	test('independent cross-check: dual algebraic identities (idempotence, orthogonality, scale invariance, linearity, Pythagorean)', () => {
		const a1 = [dual(2.5, -1.2), dual(-0.8, 3.4), dual(1.9, 0.5)]
		const a2 = [dual(-1.3, 0.6), dual(4.2, -2.1), dual(-3.0, 1.7)]
		const b = [dual(1.1, 0.4), dual(-2.7, 1.8), dual(0.9, -0.6)]

		const p1 = projectionDualSeries(a1, b)

		// 1. Idempotence: proj_b(proj_b(a)) === proj_b(a)
		const p1Twice = projectionDualSeries(p1, b)
		assertDualVectorClose(p1Twice, p1, 1e-12)

		// 2. Orthogonality of residual: (a - proj_b(a)) · b === { v: 0, d: 0 }
		const residual = dualSub(a1, p1)
		const ortho = dualDot(residual, b)
		assertClose(ortho.v, 0, 1e-12, 'residual orthogonality v')
		assertClose(ortho.d, 0, 1e-12, 'residual orthogonality d')

		// 3. Scale invariance in b under a time-varying non-zero dual scalar c(t)
		const c = dual(-3.7, 2.4)
		const cb = dualScale(c, b)
		const pScaled = projectionDualSeries(a1, cb)
		assertDualVectorClose(pScaled, p1, 1e-12)

		// 4. Linearity in a over dual scalars: proj_b(alpha*a1 + beta*a2) === alpha*proj_b(a1) + beta*proj_b(a2)
		const alpha = dual(1.5, -0.8)
		const beta = dual(-2.2, 1.3)
		const p2 = projectionDualSeries(a2, b)
		const lhs = projectionDualSeries(dualAdd(dualScale(alpha, a1), dualScale(beta, a2)), b)
		const rhs = dualAdd(dualScale(alpha, p1), dualScale(beta, p2))
		assertDualVectorClose(lhs, rhs, 1e-12)

		// 5. Dual Pythagorean theorem: ||a||^2 === ||proj_b(a)||^2 + ||a - proj_b(a)||^2
		const normA2 = dualDot(a1, a1)
		const normP2 = dualDot(p1, p1)
		const normR2 = dualDot(residual, residual)
		assertClose(normP2.v + normR2.v, normA2.v, 1e-12, 'Pythagorean v')
		assertClose(normP2.d + normR2.d, normA2.d, 1e-12, 'Pythagorean d')
	})

	test('validates inputs and throws appropriate errors', () => {
		const valid = [dual(1, 0), dual(2, 1)]

		// Non-array inputs
		assert.throws(() => projectionDualSeries(null, valid), TypeError)
		assert.throws(() => projectionDualSeries(valid, 'not-array'), TypeError)

		// Empty vectors
		assert.throws(() => projectionDualSeries([], []), RangeError)

		// Dimension mismatch
		assert.throws(() => projectionDualSeries([dual(1, 0)], valid), RangeError)

		// Invalid dual element shapes
		assert.throws(() => projectionDualSeries([1, 2], valid), TypeError)
		assert.throws(() => projectionDualSeries([null, dual(1, 0)], valid), TypeError)
		assert.throws(() => projectionDualSeries([{ v: 1 }, dual(1, 0)], valid), TypeError)
		assert.throws(() => projectionDualSeries([{ v: '1', d: 0 }, dual(1, 0)], valid), TypeError)

		// Non-finite numbers
		assert.throws(() => projectionDualSeries([dual(NaN, 0), dual(1, 0)], valid), RangeError)
		assert.throws(() => projectionDualSeries([dual(1, Infinity), dual(1, 0)], valid), RangeError)
		assert.throws(() => projectionDualSeries(valid, [dual(-Infinity, 0), dual(1, 0)]), RangeError)

		// Zero primal target vector (even if derivatives are non-zero)
		assert.throws(() => projectionDualSeries(valid, [dual(0, 1), dual(0, -2)]), RangeError)
	})
})
