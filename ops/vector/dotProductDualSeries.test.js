import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { dotProductDualSeries } from './dotProductDualSeries.js'

const dual = (v, d = 0) => ({ v, d })

const assertClose = (actual, expected, tol = 1e-9, msg = '') => {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${msg} expected ${expected} ± ${tol}, got ${actual}`
	)
}

describe('dotProductDualSeries', () => {
	test('computes primal value and forward derivative for basic vectors', () => {
		const a = [dual(1, 2), dual(3, 4), dual(5, 6)]
		const b = [dual(7, 8), dual(9, 10), dual(11, 12)]
		// v = 1*7 + 3*9 + 5*11 = 7 + 27 + 55 = 89
		// d = (1*8 + 2*7) + (3*10 + 4*9) + (5*12 + 6*11) = 22 + 66 + 126 = 214
		const res = dotProductDualSeries(a, b)
		assert.deepEqual(res, { v: 89, d: 214 })
	})

	test('handles empty vectors (empty sum identity)', () => {
		assert.deepEqual(dotProductDualSeries([], []), { v: 0, d: 0 })
	})

	test('handles single-element vectors (scalar dual multiplication)', () => {
		const res = dotProductDualSeries([dual(3, 5)], [dual(-2, 7)])
		// (3 + 5ε)(-2 + 7ε) = -6 + (21 - 10)ε = -6 + 11ε
		assert.deepEqual(res, { v: -6, d: 11 })
	})

	test('handles zero vectors and avoids negative zero', () => {
		const res = dotProductDualSeries([dual(0, -1), dual(-0, 0)], [dual(-5, 0), dual(3, -0)])
		assert.equal(Object.is(res.v, 0), true)
		assert.equal(res.d, 5)

		const zeroRes = dotProductDualSeries([dual(-0, 0)], [dual(1, -0)])
		assert.equal(Object.is(zeroRes.v, 0), true)
		assert.equal(Object.is(zeroRes.d, 0), true)
	})

	test('handles constant vectors (zero derivatives)', () => {
		const a = [dual(2, 0), dual(-3, 0), dual(4, 0)]
		const b = [dual(5, 0), dual(6, 0), dual(7, 0)]
		// 10 - 18 + 28 = 20
		assert.deepEqual(dotProductDualSeries(a, b), { v: 20, d: 0 })
	})

	test('handles orthogonal primal vectors with non-zero derivative', () => {
		// a(t) = [cos(t), sin(t)], b(t) = [-sin(t), cos(t)] at t = 0
		// a(0) = [1, 0], a'(0) = [0, 1]; b(0) = [0, 1], b'(0) = [-1, 0]
		// a(t) · b(t) = 0 identically => both v and d must be 0
		const a = [dual(1, 0), dual(0, 1)]
		const b = [dual(0, -1), dual(1, 0)]
		assert.deepEqual(dotProductDualSeries(a, b), { v: 0, d: 0 })

		// Orthogonal at t = 0 but non-orthogonal for t != 0:
		// a(t) = [1, t], b(t) = [0, 1] => a · b = t => v = 0, d = 1
		assert.deepEqual(dotProductDualSeries([dual(1, 0), dual(0, 1)], [dual(0, 0), dual(1, 0)]), {
			v: 0,
			d: 1,
		})
	})

	test('does not mutate input arrays or dual objects', () => {
		const a = [dual(1.5, -2.5), dual(3, 4)]
		const b = [dual(-1, 0.5), dual(2, -3)]
		const aCopy = structuredClone(a)
		const bCopy = structuredClone(b)
		dotProductDualSeries(a, b)
		assert.deepEqual(a, aCopy)
		assert.deepEqual(b, bCopy)
	})

	test('cross-check: commutativity, linearity, and polarization identity', () => {
		const a = [dual(1.2, -0.7), dual(-3.4, 2.1), dual(0.5, 1.3), dual(4.0, -1.5)]
		const b = [dual(-2.3, 1.1), dual(0.8, -0.9), dual(5.1, 0.4), dual(-1.2, 2.2)]
		const c = [dual(0.6, 0.2), dual(1.7, -1.4), dual(-0.9, 3.0), dual(2.5, -0.5)]

		// Commutativity: a · b === b · a
		const ab = dotProductDualSeries(a, b)
		const ba = dotProductDualSeries(b, a)
		assertClose(ab.v, ba.v, 1e-12, 'commutativity v')
		assertClose(ab.d, ba.d, 1e-12, 'commutativity d')

		// Bilinearity: (a + c) · b === a · b + c · b
		const aPlusC = a.map((ai, i) => dual(ai.v + c[i].v, ai.d + c[i].d))
		const lhs = dotProductDualSeries(aPlusC, b)
		const cb = dotProductDualSeries(c, b)
		assertClose(lhs.v, ab.v + cb.v, 1e-12, 'linearity v')
		assertClose(lhs.d, ab.d + cb.d, 1e-12, 'linearity d')

		// Polarization identity: a · b = (||a + b||² - ||a - b||²) / 4
		const sum = a.map((ai, i) => dual(ai.v + b[i].v, ai.d + b[i].d))
		const diff = a.map((ai, i) => dual(ai.v - b[i].v, ai.d - b[i].d))
		const normSumSq = dotProductDualSeries(sum, sum)
		const normDiffSq = dotProductDualSeries(diff, diff)
		assertClose(ab.v, (normSumSq.v - normDiffSq.v) / 4, 1e-12, 'polarization v')
		assertClose(ab.d, (normSumSq.d - normDiffSq.d) / 4, 1e-12, 'polarization d')
	})

	test('cross-check: central finite-difference derivative along nonlinear curve', () => {
		// Nonlinear parameterized vectors a(t), b(t)
		const evalA = (t) => [Math.sin(t), Math.exp(0.5 * t), t * t + 1, Math.cos(2 * t)]
		const evalADeriv = (t) => [Math.cos(t), 0.5 * Math.exp(0.5 * t), 2 * t, -2 * Math.sin(2 * t)]
		const evalB = (t) => [Math.log(t + 2), Math.sqrt(t + 1), Math.cos(t), t * t * t - t]
		const evalBDeriv = (t) => [1 / (t + 2), 0.5 / Math.sqrt(t + 1), -Math.sin(t), 3 * t * t - 1]

		const realDot = (u, v) => u.reduce((acc, ui, i) => acc + ui * v[i], 0)

		const t0 = 0.75
		const h = 1e-6

		const av = evalA(t0)
		const ad = evalADeriv(t0)
		const bv = evalB(t0)
		const bd = evalBDeriv(t0)

		const aDual = av.map((v, i) => dual(v, ad[i]))
		const bDual = bv.map((v, i) => dual(v, bd[i]))

		const res = dotProductDualSeries(aDual, bDual)
		const expectedV = realDot(av, bv)
		const fdDeriv = (realDot(evalA(t0 + h), evalB(t0 + h)) - realDot(evalA(t0 - h), evalB(t0 - h))) / (2 * h)

		assertClose(res.v, expectedV, 1e-12, 'primal value')
		assertClose(res.d, fdDeriv, 1e-7, 'finite-difference derivative')
	})

	test('preserves accuracy on long and ill-conditioned series with compensated summation', () => {
		// Classic Neumaier cancellation test: 1 + 1e16 + 1 - 1e16 = 2
		const ill = dotProductDualSeries(
			[dual(1, 1), dual(1e16, 1e16), dual(1, 1), dual(-1e16, -1e16)],
			[dual(1, 0), dual(1, 0), dual(1, 0), dual(1, 0)]
		)
		assert.deepEqual(ill, { v: 2, d: 2 })

		// Long series: 1e16 + 1 + 1 + ... - 1e16
		const n = 10000
		const a = [dual(1e16, 1e16)]
		const b = [dual(1, 0)]
		for (let i = 0; i < n; i++) {
			a.push(dual(1, 1))
			b.push(dual(1, 0))
		}
		a.push(dual(-1e16, -1e16))
		b.push(dual(1, 0))

		const res = dotProductDualSeries(a, b)
		assert.equal(res.v, n)
		assert.equal(res.d, n)
	})

	test('validates input types, lengths, and finiteness', () => {
		assert.throws(() => dotProductDualSeries(null, []), TypeError)
		assert.throws(() => dotProductDualSeries([], 'not-an-array'), TypeError)
		assert.throws(() => dotProductDualSeries([dual(1, 0)], []), RangeError)
		assert.throws(() => dotProductDualSeries([null], [dual(1, 0)]), TypeError)
		assert.throws(() => dotProductDualSeries([dual(1, 0)], [42]), TypeError)
		assert.throws(() => dotProductDualSeries([{ v: '1', d: 0 }], [dual(1, 0)]), TypeError)
		assert.throws(() => dotProductDualSeries([{ v: 1 }], [dual(1, 0)]), TypeError)
		assert.throws(() => dotProductDualSeries([dual(NaN, 0)], [dual(1, 0)]), RangeError)
		assert.throws(() => dotProductDualSeries([dual(1, Infinity)], [dual(1, 0)]), RangeError)
		assert.throws(() => dotProductDualSeries([dual(1, 0)], [dual(-Infinity, 0)]), RangeError)
	})
})
