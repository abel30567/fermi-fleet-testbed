import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { crossProductDualSeries } from './crossProductDualSeries.js'

const dual = (v, d = 0) => ({ v, d })

const dualAdd = (x, y) => ({ v: x.v + y.v, d: x.d + y.d })
const dualSub = (x, y) => ({ v: x.v - y.v, d: x.d - y.d })
const dualMul = (x, y) => ({ v: x.v * y.v, d: x.d * y.v + x.v * y.d })
const dualDot = (u, w) =>
	dualAdd(dualAdd(dualMul(u[0], w[0]), dualMul(u[1], w[1])), dualMul(u[2], w[2]))

function assertDualVecClose(actual, expected, tol = 1e-12) {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i++) {
		assert.ok(
			Math.abs(actual[i].v - expected[i].v) <= tol,
			`component ${i}.v: expected ${expected[i].v}, got ${actual[i].v}`,
		)
		assert.ok(
			Math.abs(actual[i].d - expected[i].d) <= tol,
			`component ${i}.d: expected ${expected[i].d}, got ${actual[i].d}`,
		)
	}
}

describe('crossProductDualSeries', () => {
	test('standard basis vectors with zero derivatives', () => {
		const ex = [dual(1), dual(0), dual(0)]
		const ey = [dual(0), dual(1), dual(0)]
		const ez = [dual(0), dual(0), dual(1)]

		assert.deepEqual(crossProductDualSeries(ex, ey), ez)
		assert.deepEqual(crossProductDualSeries(ey, ez), ex)
		assert.deepEqual(crossProductDualSeries(ez, ex), ey)
		assert.deepEqual(crossProductDualSeries(ey, ex), [dual(0), dual(0), dual(-1)])
	})

	test('general 3D dual vectors match closed-form Leibniz rule', () => {
		const a = [dual(2, 1), dual(-3, 4), dual(5, -2)]
		const b = [dual(-1, 3), dual(6, -1), dual(2, 5)]

		// a_v × b_v = (-3*2 - 5*6, 5*(-1) - 2*2, 2*6 - (-3)*(-1)) = (-36, -9, 9)
		// a_d × b_v = (4*2 - (-2)*6, (-2)*(-1) - 1*2, 1*6 - 4*(-1)) = (20, 0, 10)
		// a_v × b_d = (-3*5 - 5*(-1), 5*3 - 2*5, 2*(-1) - (-3)*3) = (-10, 5, 7)
		// total d = (10, 5, 17)
		const expected = [dual(-36, 10), dual(-9, 5), dual(9, 17)]
		assert.deepEqual(crossProductDualSeries(a, b), expected)
	})

	test('one constant vector and one varying vector', () => {
		const a = [dual(1, 0), dual(2, 0), dual(3, 0)]
		const b = [dual(4, -1), dual(5, 2), dual(6, -3)]
		// a_v × b_v = (-3, 6, -3)
		// a_v × b_d = (2*(-3) - 3*2, 3*(-1) - 1*(-3), 1*2 - 2*(-1)) = (-12, 0, 4)
		assert.deepEqual(crossProductDualSeries(a, b), [
			dual(-3, -12),
			dual(6, 0),
			dual(-3, 4),
		])
	})

	test('edge cases: zero vectors, collinear primals, self cross product, and -0 normalization', () => {
		const zero = [dual(0, 0), dual(0, 0), dual(0, 0)]
		const v = [dual(3, -2), dual(1.5, 4), dual(-7, 0.5)]

		assert.deepEqual(crossProductDualSeries(zero, v), zero)
		assert.deepEqual(crossProductDualSeries(v, zero), zero)
		assert.deepEqual(crossProductDualSeries(v, v), zero)

		// Zero primal with nonzero derivative still propagates tangent cross product
		const aZeroPrimal = [dual(0, 1), dual(0, 0), dual(0, 0)]
		const bUnitY = [dual(0, 0), dual(1, 0), dual(0, 0)]
		assert.deepEqual(crossProductDualSeries(aZeroPrimal, bUnitY), [
			dual(0, 0),
			dual(0, 0),
			dual(0, 1),
		])

		// Collinear primal vectors: primal vanishes while derivative remains nonzero
		const p = [dual(1, 0), dual(2, 1), dual(3, 0)]
		const q = [dual(2, 0), dual(4, 0), dual(6, 1)]
		// p_d × q_v = (0,1,0) × (2,4,6) = (6, 0, -2)
		// p_v × q_d = (1,2,3) × (0,0,1) = (2, -1, 0)
		assert.deepEqual(crossProductDualSeries(p, q), [
			dual(0, 8),
			dual(0, -1),
			dual(0, -2),
		])

		// Negative zero inputs normalize cleanly to +0
		const negZero = [dual(-0, -0), dual(-0, -0), dual(-0, -0)]
		const res = crossProductDualSeries(negZero, v)
		for (const comp of res) {
			assert.ok(Object.is(comp.v, 0))
			assert.ok(Object.is(comp.d, 0))
		}
	})

	test('does not mutate inputs', () => {
		const a = [dual(1, 2), dual(3, 4), dual(5, 6)]
		const b = [dual(7, 8), dual(9, 10), dual(11, 12)]
		const aSnap = structuredClone(a)
		const bSnap = structuredClone(b)

		crossProductDualSeries(a, b)

		assert.deepEqual(a, aSnap)
		assert.deepEqual(b, bSnap)
	})

	test('independent cross-check: central finite-difference derivative along parametric curves', () => {
		const aFn = (t) => [Math.sin(t), Math.cos(2 * t), t * t - 1]
		const aPrime = (t) => [Math.cos(t), -2 * Math.sin(2 * t), 2 * t]
		const bFn = (t) => [Math.exp(0.3 * t), Math.sin(t) + t, Math.cos(t)]
		const bPrime = (t) => [0.3 * Math.exp(0.3 * t), Math.cos(t) + 1, -Math.sin(t)]

		const crossReal = (u, w) => [
			u[1] * w[2] - u[2] * w[1],
			u[2] * w[0] - u[0] * w[2],
			u[0] * w[1] - u[1] * w[0],
		]

		const h = 1e-6
		for (const t of [-1.25, 0, 0.7, 2.1]) {
			const av = aFn(t)
			const ad = aPrime(t)
			const bv = bFn(t)
			const bd = bPrime(t)

			const dualRes = crossProductDualSeries(
				[dual(av[0], ad[0]), dual(av[1], ad[1]), dual(av[2], ad[2])],
				[dual(bv[0], bd[0]), dual(bv[1], bd[1]), dual(bv[2], bd[2])],
			)

			const primalExpected = crossReal(av, bv)
			const plus = crossReal(aFn(t + h), bFn(t + h))
			const minus = crossReal(aFn(t - h), bFn(t - h))
			const fdDeriv = [
				(plus[0] - minus[0]) / (2 * h),
				(plus[1] - minus[1]) / (2 * h),
				(plus[2] - minus[2]) / (2 * h),
			]

			for (let i = 0; i < 3; i++) {
				assert.ok(Math.abs(dualRes[i].v - primalExpected[i]) < 1e-12)
				assert.ok(
					Math.abs(dualRes[i].d - fdDeriv[i]) < 1e-7,
					`t=${t} i=${i}: dual d=${dualRes[i].d}, fd=${fdDeriv[i]}`,
				)
			}
		}
	})

	test('independent cross-check: algebraic identities over dual numbers', () => {
		const a = [dual(1.2, -0.4), dual(-2.5, 1.7), dual(0.8, 2.3)]
		const b = [dual(-0.9, 1.1), dual(3.1, -0.6), dual(1.4, -1.9)]
		const c = [dual(2.0, 0.5), dual(0.7, -1.3), dual(-1.6, 0.9)]
		const lambda = dual(2.5, -1.2)

		const ab = crossProductDualSeries(a, b)
		const ba = crossProductDualSeries(b, a)

		// Anticommutativity: a × b = -(b × a)
		assertDualVecClose(
			ab,
			ba.map((x) => ({ v: -x.v, d: -x.d })),
		)

		// Orthogonality in dual algebra: a · (a × b) = 0 and b · (a × b) = 0
		const aDotAb = dualDot(a, ab)
		const bDotAb = dualDot(b, ab)
		assert.ok(Math.abs(aDotAb.v) < 1e-12 && Math.abs(aDotAb.d) < 1e-12)
		assert.ok(Math.abs(bDotAb.v) < 1e-12 && Math.abs(bDotAb.d) < 1e-12)

		// Bilinearity: (a + c) × b = a × b + c × b and (λa) × b = λ(a × b)
		const aPlusC = a.map((x, i) => dualAdd(x, c[i]))
		const cb = crossProductDualSeries(c, b)
		assertDualVecClose(
			crossProductDualSeries(aPlusC, b),
			ab.map((x, i) => dualAdd(x, cb[i])),
		)
		assertDualVecClose(
			crossProductDualSeries(
				a.map((x) => dualMul(lambda, x)),
				b,
			),
			ab.map((x) => dualMul(lambda, x)),
		)

		// Jacobi identity: a × (b × c) + b × (c × a) + c × (a × b) = 0
		const t1 = crossProductDualSeries(a, crossProductDualSeries(b, c))
		const t2 = crossProductDualSeries(b, crossProductDualSeries(c, a))
		const t3 = crossProductDualSeries(c, ab)
		const jacobi = [0, 1, 2].map((i) => dualAdd(dualAdd(t1[i], t2[i]), t3[i]))
		assertDualVecClose(jacobi, [dual(0), dual(0), dual(0)])

		// BAC-CAB identity: a × (b × c) = b(a · c) - c(a · b)
		const acDot = dualDot(a, c)
		const abDot = dualDot(a, b)
		const bacCab = [0, 1, 2].map((i) =>
			dualSub(dualMul(b[i], acDot), dualMul(c[i], abDot)),
		)
		assertDualVecClose(t1, bacCab)

		// Lagrange's identity: ||a × b||² = ||a||² ||b||² - (a · b)²
		const lhs = dualDot(ab, ab)
		const rhs = dualSub(dualMul(dualDot(a, a), dualDot(b, b)), dualMul(abDot, abDot))
		assert.ok(Math.abs(lhs.v - rhs.v) < 1e-11)
		assert.ok(Math.abs(lhs.d - rhs.d) < 1e-11)
	})

	test('input validation throws on invalid arguments', () => {
		const valid = [dual(1, 0), dual(2, 0), dual(3, 0)]

		assert.throws(() => crossProductDualSeries(null, valid), TypeError)
		assert.throws(() => crossProductDualSeries(valid, 'not-array'), TypeError)
		assert.throws(() => crossProductDualSeries([dual(1), dual(2)], valid), RangeError)
		assert.throws(
			() => crossProductDualSeries(valid, [dual(1), dual(2), dual(3), dual(4)]),
			RangeError,
		)
		assert.throws(() => crossProductDualSeries([null, dual(0), dual(0)], valid), TypeError)
		assert.throws(() => crossProductDualSeries([1, 2, 3], valid), TypeError)
		assert.throws(
			() => crossProductDualSeries([{ v: 1 }, dual(0), dual(0)], valid),
			TypeError,
		)
		assert.throws(
			() => crossProductDualSeries([dual(NaN, 0), dual(0), dual(0)], valid),
			RangeError,
		)
		assert.throws(
			() => crossProductDualSeries(valid, [dual(0, Infinity), dual(0), dual(0)]),
			RangeError,
		)
		assert.throws(
			() => crossProductDualSeries(valid, [dual(-Infinity, 0), dual(0), dual(0)]),
			RangeError,
		)
	})
})
