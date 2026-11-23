import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { dotProductDualIterative } from './dotProductDualIterative.js'

const dual = (v, d) => ({ v, d })
const approxEqual = (actual, expected, tol = 1e-9) => {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`Expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`
	)
}

describe('dotProductDualIterative', () => {
	describe('normal cases', () => {
		it('computes dot product and derivative for 2D dual vectors', () => {
			// a = [(2, 1), (3, -2)], b = [(4, 5), (-1, 6)]
			// v = 2*4 + 3*(-1) = 8 - 3 = 5
			// d = (2*5 + 1*4) + (3*6 + (-2)*(-1)) = 14 + 20 = 34
			const res = dotProductDualIterative(
				[dual(2, 1), dual(3, -2)],
				[dual(4, 5), dual(-1, 6)]
			)
			assert.deepEqual(res, { v: 5, d: 34 })
		})

		it('computes dot product and derivative for 3D dual vectors', () => {
			const a = [dual(1, 2), dual(-3, 4), dual(5, -6)]
			const b = [dual(7, -1), dual(2, 3), dual(-4, 5)]
			// v = 7 - 6 - 20 = -19
			// d = (1*(-1) + 2*7) + ((-3)*3 + 4*2) + (5*5 + (-6)*(-4))
			//   = 13 + (-1) + 49 = 61
			const res = dotProductDualIterative(a, b)
			assert.deepEqual(res, { v: -19, d: 61 })
		})

		it('returns zero derivative when both vectors are constant (d = 0)', () => {
			const a = [dual(3, 0), dual(-4, 0), dual(5, 0)]
			const b = [dual(2, 0), dual(1, 0), dual(-6, 0)]
			const res = dotProductDualIterative(a, b)
			assert.deepEqual(res, { v: -28, d: 0 })
		})

		it('handles one constant vector and one varying vector', () => {
			const c = [dual(2, 0), dual(-3, 0), dual(4, 0)]
			const x = [dual(1, 5), dual(2, -1), dual(3, 2)]
			// v = 2*1 + (-3)*2 + 4*3 = 8
			// d = 2*5 + (-3)*(-1) + 4*2 = 21
			assert.deepEqual(dotProductDualIterative(c, x), { v: 8, d: 21 })
			assert.deepEqual(dotProductDualIterative(x, c), { v: 8, d: 21 })
		})

		it('handles orthogonal primal vectors with non-zero derivative', () => {
			// u(t) = [cos(t), sin(t)], w(t) = [-sin(t), cos(t)] at t = 0
			// u(0) = [1, 0], u'(0) = [0, 1]; w(0) = [0, 1], w'(0) = [-1, 0]
			// But if w'(0) = [2, 0], v = 0 while d = 1*2 + 0*0 + 0*0 + 1*1 = 3
			const res = dotProductDualIterative(
				[dual(1, 0), dual(0, 1)],
				[dual(0, 2), dual(1, 0)]
			)
			assert.deepEqual(res, { v: 0, d: 3 })
		})

		it('handles floating-point components accurately', () => {
			const a = [dual(0.5, 0.25), dual(-1.5, 0.75)]
			const b = [dual(2.0, -0.5), dual(4.0, 1.5)]
			const res = dotProductDualIterative(a, b)
			// v = 1.0 - 6.0 = -5.0
			// d = (0.5*(-0.5) + 0.25*2.0) + ((-1.5)*1.5 + 0.75*4.0)
			//   = (-0.25 + 0.5) + (-2.25 + 3.0) = 0.25 + 0.75 = 1.0
			approxEqual(res.v, -5.0, 1e-12)
			approxEqual(res.d, 1.0, 1e-12)
		})

		it('handles larger vectors verified against closed-form sums', () => {
			const n = 100
			// a_i = (i, 1), b_i = (1, i) for i = 1..n
			// v = sum(i) = n(n+1)/2
			// d = sum(i*i + 1*1) = n(n+1)(2n+1)/6 + n
			const a = Array.from({ length: n }, (_, idx) => dual(idx + 1, 1))
			const b = Array.from({ length: n }, (_, idx) => dual(1, idx + 1))
			const res = dotProductDualIterative(a, b)
			const expectedV = (n * (n + 1)) / 2
			const expectedD = (n * (n + 1) * (2 * n + 1)) / 6 + n
			assert.deepEqual(res, { v: expectedV, d: expectedD })
		})
	})

	describe('edge cases', () => {
		it('returns { v: 0, d: 0 } for empty vectors', () => {
			const res = dotProductDualIterative([], [])
			assert.deepEqual(res, { v: 0, d: 0 })
		})

		it('computes scalar dual multiplication for length-1 vectors', () => {
			const res = dotProductDualIterative([dual(-7, 3)], [dual(4, -5)])
			// v = -28, d = (-7)*(-5) + 3*4 = 35 + 12 = 47
			assert.deepEqual(res, { v: -28, d: 47 })
		})

		it('handles all-zero dual vectors', () => {
			const z = [dual(0, 0), dual(0, 0), dual(0, 0)]
			assert.deepEqual(dotProductDualIterative(z, z), { v: 0, d: 0 })
		})

		it('does not mutate input arrays or dual objects', () => {
			const a = [Object.freeze(dual(2, 3)), Object.freeze(dual(-1, 4))]
			const b = [Object.freeze(dual(5, -2)), Object.freeze(dual(6, 1))]
			Object.freeze(a)
			Object.freeze(b)
			const res = dotProductDualIterative(a, b)
			assert.deepEqual(res, { v: 4, d: 34 })
		})

		it('accepts null-prototype dual objects', () => {
			const d1 = Object.assign(Object.create(null), { v: 3, d: 2 })
			const d2 = Object.assign(Object.create(null), { v: 5, d: -1 })
			assert.deepEqual(dotProductDualIterative([d1], [d2]), { v: 15, d: 7 })
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when a or b is not an array', () => {
			const valid = [dual(1, 0)]
			for (const bad of [null, undefined, 42, 'abc', { v: 1, d: 0 }, new Float64Array([1])]) {
				assert.throws(() => dotProductDualIterative(bad, valid), TypeError)
				assert.throws(() => dotProductDualIterative(valid, bad), TypeError)
			}
		})

		it('throws RangeError when vector lengths differ', () => {
			assert.throws(
				() => dotProductDualIterative([dual(1, 0)], [dual(1, 0), dual(2, 0)]),
				RangeError
			)
			assert.throws(() => dotProductDualIterative([], [dual(0, 0)]), RangeError)
		})

		it('throws TypeError when an element is not a valid dual object', () => {
			const valid = [dual(1, 1)]
			for (const badEl of [
				null,
				undefined,
				5,
				'1',
				[1, 2],
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 0 },
				{ v: 1, d: null }
			]) {
				assert.throws(() => dotProductDualIterative([badEl], valid), TypeError)
				assert.throws(() => dotProductDualIterative(valid, [badEl]), TypeError)
			}
		})

		it('throws TypeError for sparse arrays', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [dual(1, 0), , dual(2, 0)]
			const dense = [dual(1, 0), dual(1, 0), dual(1, 0)]
			assert.throws(() => dotProductDualIterative(sparse, dense), TypeError)
			assert.throws(() => dotProductDualIterative(dense, sparse), TypeError)
		})

		it('throws RangeError for non-finite v or d values', () => {
			const valid = [dual(1, 1)]
			for (const badNum of [NaN, Infinity, -Infinity]) {
				assert.throws(() => dotProductDualIterative([dual(badNum, 0)], valid), RangeError)
				assert.throws(() => dotProductDualIterative([dual(0, badNum)], valid), RangeError)
				assert.throws(() => dotProductDualIterative(valid, [dual(badNum, 0)]), RangeError)
				assert.throws(() => dotProductDualIterative(valid, [dual(0, badNum)]), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('matches central finite-difference derivative for nonlinear parametric vectors', () => {
			// u(t) = [t^2 + 1, sin(t), exp(0.5 * t)]
			// w(t) = [3*t - 2, cos(t), ln(t + 2)]
			const uDual = (t) => [
				dual(t * t + 1, 2 * t),
				dual(Math.sin(t), Math.cos(t)),
				dual(Math.exp(0.5 * t), 0.5 * Math.exp(0.5 * t))
			]
			const wDual = (t) => [
				dual(3 * t - 2, 3),
				dual(Math.cos(t), -Math.sin(t)),
				dual(Math.log(t + 2), 1 / (t + 2))
			]
			const primalDot = (t) => {
				const u = uDual(t)
				const w = wDual(t)
				return u.reduce((acc, ui, i) => acc + ui.v * w[i].v, 0)
			}

			const h = 1e-6
			for (const t of [-1.25, 0, 0.7, 2.3]) {
				const { v, d } = dotProductDualIterative(uDual(t), wDual(t))
				const fd = (primalDot(t + h) - primalDot(t - h)) / (2 * h)
				approxEqual(v, primalDot(t), 1e-12)
				approxEqual(d, fd, 1e-7)
			}
		})

		it('satisfies commutativity, bilinearity, and self-dot derivative identity', () => {
			const a = [dual(1.5, -0.5), dual(-2.2, 1.3), dual(3.1, 0.7)]
			const b = [dual(-0.8, 2.1), dual(4.0, -1.5), dual(0.9, 1.1)]
			const c = [dual(2.3, 0.4), dual(-1.1, -0.9), dual(1.7, 2.5)]

			// Commutativity: dot(a, b) == dot(b, a)
			const ab = dotProductDualIterative(a, b)
			const ba = dotProductDualIterative(b, a)
			approxEqual(ab.v, ba.v, 1e-12)
			approxEqual(ab.d, ba.d, 1e-12)

			// Distributivity: dot(a + b, c) == dot(a, c) + dot(b, c)
			const aPlusB = a.map((ai, i) => dual(ai.v + b[i].v, ai.d + b[i].d))
			const lhs = dotProductDualIterative(aPlusB, c)
			const ac = dotProductDualIterative(a, c)
			const bc = dotProductDualIterative(b, c)
			approxEqual(lhs.v, ac.v + bc.v, 1e-12)
			approxEqual(lhs.d, ac.d + bc.d, 1e-12)

			// Dual scalar homogeneity: dot(s * a, b) == s * dot(a, b)
			const s = dual(2.5, -1.2)
			const sa = a.map((ai) => dual(s.v * ai.v, s.v * ai.d + s.d * ai.v))
			const sDotAB = dotProductDualIterative(sa, b)
			const expectedV = s.v * ab.v
			const expectedD = s.v * ab.d + s.d * ab.v
			approxEqual(sDotAB.v, expectedV, 1e-12)
			approxEqual(sDotAB.d, expectedD, 1e-12)

			// Self-dot identity: d/dt (a . a) = 2 * (a . a')
			const aa = dotProductDualIterative(a, a)
			const primalDotADot = a.reduce((acc, ai) => acc + ai.v * ai.d, 0)
			approxEqual(aa.d, 2 * primalDotADot, 1e-12)
		})
	})
})
