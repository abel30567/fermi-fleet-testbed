import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { crossProductDualSeries } from './crossProductDualSeries.js'

/**
 * Helper to build a dual number `{ v, d }`.
 * @param {number} v
 * @param {number} [d=0]
 */
function dual(v, d = 0) {
	return { v, d }
}

/**
 * Helper to assert two dual vectors are approximately equal within `tol`.
 */
function assertDualVecClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, 3)
	assert.equal(expected.length, 3)
	for (let i = 0; i < 3; i++) {
		assert.ok(
			Math.abs(actual[i].v - expected[i].v) <= tol,
			`component[${i}].v: expected ${expected[i].v}, got ${actual[i].v}`
		)
		assert.ok(
			Math.abs(actual[i].d - expected[i].d) <= tol,
			`component[${i}].d: expected ${expected[i].d}, got ${actual[i].d}`
		)
	}
}

/**
 * Independent dual dot product `(u_v·w_v) + ε(u_v·w_d + u_d·w_v)` for algebraic cross-checks.
 */
function dualDot(u, w) {
	let v = 0
	let d = 0
	for (let i = 0; i < 3; i++) {
		v += u[i].v * w[i].v
		d += u[i].v * w[i].d + u[i].d * w[i].v
	}
	return { v, d }
}

/**
 * Independent real 3D cross product for finite-difference cross-checks.
 */
function realCross(u, w) {
	return [
		u[1] * w[2] - u[2] * w[1],
		u[2] * w[0] - u[0] * w[2],
		u[0] * w[1] - u[1] * w[0],
	]
}

describe('crossProductDualSeries', () => {
	describe('normal cases', () => {
		test('standard right-handed basis vectors with zero derivatives', () => {
			const ex = [dual(1, 0), dual(0, 0), dual(0, 0)]
			const ey = [dual(0, 0), dual(1, 0), dual(0, 0)]
			const ez = [dual(0, 0), dual(0, 0), dual(1, 0)]

			assert.deepEqual(crossProductDualSeries(ex, ey), ez)
			assert.deepEqual(crossProductDualSeries(ey, ez), ex)
			assert.deepEqual(crossProductDualSeries(ez, ex), ey)
		})

		test('basis vectors carrying non-zero derivatives', () => {
			// a(t) = [1 + 2t, -t, 3t], b(t) = [4t, 1 - 5t, 6t]
			// a_v = [1, 0, 0], a_d = [2, -1, 3]
			// b_v = [0, 1, 0], b_d = [4, -5, 6]
			// a_v × b_v = [0, 0, 1]
			// a_v × b_d = [0, -6, -5]
			// a_d × b_v = [-3, 0, 2]
			// derivative = [-3, -6, -3]
			const a = [dual(1, 2), dual(0, -1), dual(0, 3)]
			const b = [dual(0, 4), dual(1, -5), dual(0, 6)]

			assert.deepEqual(crossProductDualSeries(a, b), [
				dual(0, -3),
				dual(0, -6),
				dual(1, -3),
			])
		})

		test('arbitrary 3D dual vectors match hand-computed values', () => {
			// a_v = [2, -3, 4], a_d = [1, 0.5, -2]
			// b_v = [-1, 5, 2], b_d = [3, -1, 4]
			// a_v × b_v = [(-3)(2)-(4)(5), (4)(-1)-(2)(2), (2)(5)-(-3)(-1)] = [-26, -8, 7]
			// a_v × b_d = [(-3)(4)-(4)(-1), (4)(3)-(2)(4), (2)(-1)-(-3)(3)] = [-8, 4, 7]
			// a_d × b_v = [(0.5)(2)-(-2)(5), (-2)(-1)-(1)(2), (1)(5)-(0.5)(-1)] = [11, 0, 5.5]
			// d = [3, 4, 12.5]
			const a = [dual(2, 1), dual(-3, 0.5), dual(4, -2)]
			const b = [dual(-1, 3), dual(5, -1), dual(2, 4)]

			assert.deepEqual(crossProductDualSeries(a, b), [
				dual(-26, 3),
				dual(-8, 4),
				dual(7, 12.5),
			])
		})

		test('does not mutate input arrays or dual number objects', () => {
			const a = [dual(1, 2), dual(3, 4), dual(5, 6)]
			const b = [dual(7, 8), dual(9, 10), dual(11, 12)]
			const aCopy = structuredClone(a)
			const bCopy = structuredClone(b)

			const result = crossProductDualSeries(a, b)
			assert.notEqual(result, a)
			assert.notEqual(result, b)
			assert.deepEqual(a, aCopy)
			assert.deepEqual(b, bCopy)
		})
	})

	describe('edge cases', () => {
		test('parallel primal vectors with zero derivatives yield zero dual vector', () => {
			const a = [dual(2, 0), dual(-4, 0), dual(6, 0)]
			const b = [dual(-1, 0), dual(2, 0), dual(-3, 0)]

			const res = crossProductDualSeries(a, b)
			assert.deepEqual(res, [dual(0, 0), dual(0, 0), dual(0, 0)])
			// Ensure no -0 leaks
			for (const c of res) {
				assert.ok(Object.is(c.v, 0))
				assert.ok(Object.is(c.d, 0))
			}
		})

		test('parallel primal vectors with non-parallel derivatives have zero value and non-zero derivative', () => {
			// a_v = [1, 2, 3], b_v = [2, 4, 6] => a_v × b_v = [0, 0, 0]
			// a_d = [1, 0, 0], b_d = [0, 1, 0]
			// a_v × b_d = [-3, 0, 1]
			// a_d × b_v = [0, -6, 4]
			// d = [-3, -6, 5]
			const a = [dual(1, 1), dual(2, 0), dual(3, 0)]
			const b = [dual(2, 0), dual(4, 1), dual(6, 0)]

			assert.deepEqual(crossProductDualSeries(a, b), [
				dual(0, -3),
				dual(0, -6),
				dual(0, 5),
			])
		})

		test('zero vectors produce expected primal and derivative results', () => {
			const zero = [dual(0, 0), dual(0, 0), dual(0, 0)]
			const b = [dual(3, -1), dual(-2, 4), dual(5, 7)]

			assert.deepEqual(crossProductDualSeries(zero, b), zero)
			assert.deepEqual(crossProductDualSeries(b, zero), zero)

			// Zero primal with non-zero tangent still contributes a_d × b_v
			const zeroPrimal = [dual(0, 1), dual(0, 0), dual(0, 0)]
			// [1, 0, 0] × [3, -2, 5] = [0, -5, -2]
			assert.deepEqual(crossProductDualSeries(zeroPrimal, b), [
				dual(0, 0),
				dual(0, -5),
				dual(0, -2),
			])
		})

		test('rejects non-array inputs', () => {
			const valid = [dual(1, 0), dual(0, 0), dual(0, 0)]
			for (const bad of [null, undefined, 42, 'abc', { v: 1, d: 0 }]) {
				assert.throws(() => crossProductDualSeries(bad, valid), TypeError)
				assert.throws(() => crossProductDualSeries(valid, bad), TypeError)
			}
		})

		test('rejects non-3D arrays', () => {
			const valid = [dual(1, 0), dual(0, 0), dual(0, 0)]
			const empty = []
			const vec2 = [dual(1, 0), dual(2, 0)]
			const vec4 = [dual(1, 0), dual(2, 0), dual(3, 0), dual(4, 0)]

			for (const bad of [empty, vec2, vec4]) {
				assert.throws(() => crossProductDualSeries(bad, valid), RangeError)
				assert.throws(() => crossProductDualSeries(valid, bad), RangeError)
			}
		})

		test('rejects invalid dual number elements and non-finite components', () => {
			const valid = [dual(1, 0), dual(2, 0), dual(3, 0)]

			// Non-object or malformed element
			const badTypeVectors = [
				[null, dual(2, 0), dual(3, 0)],
				[1, dual(2, 0), dual(3, 0)],
				[[1, 0], dual(2, 0), dual(3, 0)],
				[{ v: 1 }, dual(2, 0), dual(3, 0)],
				[{ d: 1 }, dual(2, 0), dual(3, 0)],
				[{ v: '1', d: 0 }, dual(2, 0), dual(3, 0)],
				[{ v: 1, d: '0' }, dual(2, 0), dual(3, 0)],
			]
			for (const bad of badTypeVectors) {
				assert.throws(() => crossProductDualSeries(bad, valid), TypeError)
				assert.throws(() => crossProductDualSeries(valid, bad), TypeError)
			}

			// Non-finite numbers
			const badRangeVectors = [
				[dual(NaN, 0), dual(2, 0), dual(3, 0)],
				[dual(1, NaN), dual(2, 0), dual(3, 0)],
				[dual(Infinity, 0), dual(2, 0), dual(3, 0)],
				[dual(1, -Infinity), dual(2, 0), dual(3, 0)],
			]
			for (const bad of badRangeVectors) {
				assert.throws(() => crossProductDualSeries(bad, valid), RangeError)
				assert.throws(() => crossProductDualSeries(valid, bad), RangeError)
			}
		})
	})

	describe('independent mathematical cross-checks', () => {
		test('matches central finite differences on smooth nonlinear 3D parametric curves', () => {
			const aCurve = (t) => [Math.cos(t), Math.sin(2 * t), t * t - 1]
			const aDeriv = (t) => [-Math.sin(t), 2 * Math.cos(2 * t), 2 * t]

			const bCurve = (t) => [Math.exp(0.3 * t), t * t * t + 1, Math.cos(t + 0.5)]
			const bDeriv = (t) => [0.3 * Math.exp(0.3 * t), 3 * t * t, -Math.sin(t + 0.5)]

			const h = 1e-6
			for (const t0 of [-1.2, 0, 0.75, 2.1]) {
				const av = aCurve(t0)
				const ad = aDeriv(t0)
				const bv = bCurve(t0)
				const bd = bDeriv(t0)

				const aDual = [dual(av[0], ad[0]), dual(av[1], ad[1]), dual(av[2], ad[2])]
				const bDual = [dual(bv[0], bd[0]), dual(bv[1], bd[1]), dual(bv[2], bd[2])]

				const res = crossProductDualSeries(aDual, bDual)

				const valDirect = realCross(av, bv)
				const plus = realCross(aCurve(t0 + h), bCurve(t0 + h))
				const minus = realCross(aCurve(t0 - h), bCurve(t0 - h))
				const fd = plus.map((p, i) => (p - minus[i]) / (2 * h))

				for (let i = 0; i < 3; i++) {
					assert.ok(Math.abs(res[i].v - valDirect[i]) < 1e-13)
					const tol = 1e-8 * Math.max(1, Math.abs(res[i].d))
					assert.ok(
						Math.abs(res[i].d - fd[i]) < tol,
						`t0=${t0} comp=${i}: dual d=${res[i].d}, fd=${fd[i]}`
					)
				}
			}
		})

		test('satisfies dual orthogonality: (a × b) · a = {0, 0} and (a × b) · b = {0, 0}', () => {
			const a = [dual(1.7, -0.4), dual(-2.3, 3.1), dual(0.9, 1.5)]
			const b = [dual(-0.8, 2.2), dual(4.1, -1.3), dual(-3.5, 0.6)]

			const c = crossProductDualSeries(a, b)
			const dotA = dualDot(c, a)
			const dotB = dualDot(c, b)

			assert.ok(Math.abs(dotA.v) < 1e-12)
			assert.ok(Math.abs(dotA.d) < 1e-12)
			assert.ok(Math.abs(dotB.v) < 1e-12)
			assert.ok(Math.abs(dotB.d) < 1e-12)
		})

		test('satisfies anti-commutativity: a × b = -(b × a)', () => {
			const a = [dual(3.2, -1.1), dual(-0.7, 2.4), dual(5.5, 0.8)]
			const b = [dual(-2.1, 0.5), dual(1.9, -3.3), dual(4.0, 2.7)]

			const ab = crossProductDualSeries(a, b)
			const ba = crossProductDualSeries(b, a)
			const negBa = ba.map(({ v, d }) => ({ v: -v, d: -d }))

			assertDualVecClose(ab, negBa, 1e-12)
		})

		test('satisfies the Jacobi identity over dual vectors: a×(b×c) + b×(c×a) + c×(a×b) = 0', () => {
			const a = [dual(1.2, -0.5), dual(2.3, 1.1), dual(-0.8, 0.4)]
			const b = [dual(-1.5, 0.7), dual(0.6, -2.2), dual(3.1, 0.9)]
			const c = [dual(2.0, 1.4), dual(-1.9, 0.3), dual(0.5, -1.7)]

			const t1 = crossProductDualSeries(a, crossProductDualSeries(b, c))
			const t2 = crossProductDualSeries(b, crossProductDualSeries(c, a))
			const t3 = crossProductDualSeries(c, crossProductDualSeries(a, b))

			const sum = [0, 1, 2].map((i) => ({
				v: t1[i].v + t2[i].v + t3[i].v,
				d: t1[i].d + t2[i].d + t3[i].d,
			}))

			assertDualVecClose(sum, [dual(0, 0), dual(0, 0), dual(0, 0)], 1e-11)
		})
	})
})
