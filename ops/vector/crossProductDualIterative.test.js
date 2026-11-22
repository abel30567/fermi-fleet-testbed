import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { crossProductDualIterative } from './crossProductDualIterative.js'

function dual(v, d = 0) {
	return { v, d }
}

function assertClose(actual, expected, eps = 1e-12, label = '') {
	assert.ok(
		Math.abs(actual - expected) <= eps,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${eps} of ${expected}`,
	)
}

function assertDualVecClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i += 1) {
		assertClose(actual[i].v, expected[i].v, eps, `res[${i}].v`)
		assertClose(actual[i].d, expected[i].d, eps, `res[${i}].d`)
	}
}

function dualDot(u, v) {
	let sumV = 0
	let sumD = 0
	for (let i = 0; i < 3; i += 1) {
		sumV += u[i].v * v[i].v
		sumD += u[i].v * v[i].d + u[i].d * v[i].v
	}
	return { v: sumV, d: sumD }
}

function crossReal(a, b) {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	]
}

describe('crossProductDualIterative', () => {
	describe('normal cases', () => {
		test('standard right-handed basis vectors with zero derivatives', () => {
			const e1 = [dual(1), dual(0), dual(0)]
			const e2 = [dual(0), dual(1), dual(0)]
			const e3 = [dual(0), dual(0), dual(1)]

			assert.deepStrictEqual(crossProductDualIterative(e1, e2), e3)
			assert.deepStrictEqual(crossProductDualIterative(e2, e3), e1)
			assert.deepStrictEqual(crossProductDualIterative(e3, e1), e2)
		})

		test('general 3D dual vectors match hand-computed primal and derivative values', () => {
			// a(t) = [1 + 2t, 3 - t, -2 + 4t] at t = 0
			// b(t) = [4 + t, -1 + 3t, 2 - 2t] at t = 0
			const a = [dual(1, 2), dual(3, -1), dual(-2, 4)]
			const b = [dual(4, 1), dual(-1, 3), dual(2, -2)]

			// Primal a × b:
			// [3*2 - (-2)*(-1), (-2)*4 - 1*2, 1*(-1) - 3*4] = [4, -10, -13]
			// Derivative a' × b + a × b':
			// a' × b = [(-1)*2 - 4*(-1), 4*4 - 2*2, 2*(-1) - (-1)*4] = [2, 12, 2]
			// a × b' = [3*(-2) - (-2)*3, (-2)*1 - 1*(-2), 1*3 - 3*1] = [0, 0, 0]
			// Total derivative = [2, 12, 2]
			const res = crossProductDualIterative(a, b)
			assert.deepStrictEqual(res, [dual(4, 2), dual(-10, 12), dual(-13, 2)])
		})

		test('general 3D dual vectors with non-zero a × b\' contribution', () => {
			const a = [dual(2, -1), dual(0.5, 3), dual(-4, 1.5)]
			const b = [dual(-3, 2), dual(5, -0.5), dual(1, 4)]

			// Component 0: a1*b2 - a2*b1
			// v = 0.5*1 - (-4)*5 = 20.5
			// d = (0.5*4 + 3*1) - ((-4)*(-0.5) + 1.5*5) = 5 - 9.5 = -4.5
			// Component 1: a2*b0 - a0*b2
			// v = (-4)*(-3) - 2*1 = 10
			// d = ((-4)*2 + 1.5*(-3)) - (2*4 + (-1)*1) = -12.5 - 7 = -19.5
			// Component 2: a0*b1 - a1*b0
			// v = 2*5 - 0.5*(-3) = 11.5
			// d = (2*(-0.5) + (-1)*5) - (0.5*2 + 3*(-3)) = -6 - (-8) = 2
			const res = crossProductDualIterative(a, b)
			assertDualVecClose(res, [dual(20.5, -4.5), dual(10, -19.5), dual(11.5, 2)])
		})

		test('does not mutate input arrays or dual objects', () => {
			const a = [dual(1, 2), dual(3, 4), dual(5, 6)]
			const b = [dual(7, 8), dual(9, 10), dual(11, 12)]
			const aCopy = structuredClone(a)
			const bCopy = structuredClone(b)

			crossProductDualIterative(a, b)

			assert.deepStrictEqual(a, aCopy)
			assert.deepStrictEqual(b, bCopy)
		})
	})

	describe('edge cases', () => {
		test('parallel dual vectors (a × a and scaled constant multiple) yield zero primal and derivative', () => {
			const a = [dual(2, -3), dual(-5, 7), dual(11, 0.5)]
			const scaled = a.map(({ v, d }) => dual(-3 * v, -3 * d))

			assert.deepStrictEqual(crossProductDualIterative(a, a), [dual(0, 0), dual(0, 0), dual(0, 0)])
			assert.deepStrictEqual(crossProductDualIterative(a, scaled), [dual(0, 0), dual(0, 0), dual(0, 0)])
		})

		test('instantaneously parallel primals with non-parallel derivatives yield zero primal and non-zero derivative', () => {
			const a = [dual(1, 0), dual(2, 1), dual(3, 0)]
			const b = [dual(2, 0), dual(4, 0), dual(6, 1)]

			// Primal: [1,2,3] × [2,4,6] = [0,0,0]
			// Derivative: [0,1,0] × [2,4,6] + [1,2,3] × [0,0,1]
			//           = [6, 0, -2] + [2, -1, 0] = [8, -1, -2]
			const res = crossProductDualIterative(a, b)
			assert.deepStrictEqual(res, [dual(0, 8), dual(0, -1), dual(0, -2)])
		})

		test('zero vector produces exact zero dual vector without negative zeros', () => {
			const zero = [dual(0, 0), dual(0, 0), dual(0, 0)]
			const v = [dual(-1, 2), dual(3, -4), dual(-5, 6)]

			const r1 = crossProductDualIterative(zero, v)
			const r2 = crossProductDualIterative(v, zero)
			assert.deepStrictEqual(r1, zero)
			assert.deepStrictEqual(r2, zero)
			for (let i = 0; i < 3; i += 1) {
				assert.ok(Object.is(r1[i].v, 0))
				assert.ok(Object.is(r1[i].d, 0))
				assert.ok(Object.is(r2[i].v, 0))
				assert.ok(Object.is(r2[i].d, 0))
			}
		})

		test('anti-commutativity: a × b = -(b × a) for both v and d', () => {
			const a = [dual(1.5, -2.25), dual(-3.5, 4.75), dual(2.0, 0.5)]
			const b = [dual(-0.75, 1.25), dual(6.0, -3.5), dual(-4.25, 2.5)]

			const ab = crossProductDualIterative(a, b)
			const ba = crossProductDualIterative(b, a)
			const negBa = ba.map(({ v, d }) => dual(v === 0 ? 0 : -v, d === 0 ? 0 : -d))

			assertDualVecClose(ab, negBa)
		})

		test('throws TypeError for non-array inputs', () => {
			const valid = [dual(1, 0), dual(0, 1), dual(0, 0)]
			for (const bad of [null, undefined, 42, 'abc', { 0: dual(1), 1: dual(2), 2: dual(3) }]) {
				assert.throws(() => crossProductDualIterative(bad, valid), TypeError)
				assert.throws(() => crossProductDualIterative(valid, bad), TypeError)
			}
		})

		test('throws RangeError when vector length is not 3', () => {
			const valid = [dual(1, 0), dual(2, 0), dual(3, 0)]
			for (const bad of [[], [dual(1)], [dual(1), dual(2)], [dual(1), dual(2), dual(3), dual(4)]]) {
				assert.throws(() => crossProductDualIterative(bad, valid), RangeError)
				assert.throws(() => crossProductDualIterative(valid, bad), RangeError)
			}
		})

		test('throws TypeError for invalid dual elements', () => {
			const valid = [dual(1, 0), dual(2, 0), dual(3, 0)]
			const sparse = new Array(3)
			sparse[0] = dual(1, 0)
			sparse[2] = dual(3, 0)

			const badVectors = [
				[null, dual(2), dual(3)],
				[dual(1), undefined, dual(3)],
				[dual(1), dual(2), 5],
				[dual(1), [2, 0], dual(3)],
				[{ v: 1 }, dual(2), dual(3)],
				[{ d: 1 }, dual(2), dual(3)],
				[{ v: '1', d: 0 }, dual(2), dual(3)],
				[{ v: 1, d: '0' }, dual(2), dual(3)],
				sparse,
			]

			for (const bad of badVectors) {
				assert.throws(() => crossProductDualIterative(bad, valid), TypeError)
				assert.throws(() => crossProductDualIterative(valid, bad), TypeError)
			}
		})

		test('throws RangeError for non-finite dual values or derivatives', () => {
			const valid = [dual(1, 0), dual(2, 0), dual(3, 0)]
			const nonFinite = [NaN, Infinity, -Infinity]

			for (const badNum of nonFinite) {
				assert.throws(
					() => crossProductDualIterative([dual(badNum, 0), dual(2), dual(3)], valid),
					RangeError,
				)
				assert.throws(
					() => crossProductDualIterative([dual(1, badNum), dual(2), dual(3)], valid),
					RangeError,
				)
				assert.throws(
					() => crossProductDualIterative(valid, [dual(1), dual(badNum, 0), dual(3)]),
					RangeError,
				)
				assert.throws(
					() => crossProductDualIterative(valid, [dual(1), dual(2), dual(3, badNum)]),
					RangeError,
				)
			}
		})
	})

	describe('independent cross-checks', () => {
		test('orthogonality in dual arithmetic: (a × b) · a = 0 and (a × b) · b = 0 for both v and d', () => {
			const a = [dual(1.7, -0.9), dual(-2.3, 4.1), dual(0.8, 3.2)]
			const b = [dual(-3.4, 2.5), dual(1.2, -1.6), dual(5.5, 0.7)]

			const c = crossProductDualIterative(a, b)
			const dotA = dualDot(c, a)
			const dotB = dualDot(c, b)

			assertClose(dotA.v, 0, 1e-12, '(a×b)·a primal')
			assertClose(dotA.d, 0, 1e-12, '(a×b)·a derivative')
			assertClose(dotB.v, 0, 1e-12, '(a×b)·b primal')
			assertClose(dotB.d, 0, 1e-12, '(a×b)·b derivative')
		})

		test('matches product rule a\' × b + a × b\' via independent real cross product', () => {
			const a = [dual(3.1, -1.4), dual(-0.7, 2.8), dual(4.5, -0.6)]
			const b = [dual(-2.2, 0.9), dual(1.9, -3.3), dual(-1.1, 2.4)]

			const res = crossProductDualIterative(a, b)

			const aV = a.map((x) => x.v)
			const aD = a.map((x) => x.d)
			const bV = b.map((x) => x.v)
			const bD = b.map((x) => x.d)

			const expectedV = crossReal(aV, bV)
			const term1 = crossReal(aD, bV)
			const term2 = crossReal(aV, bD)
			const expected = [0, 1, 2].map((i) => dual(expectedV[i], term1[i] + term2[i]))

			assertDualVecClose(res, expected, 1e-12)
		})

		test('Jacobi identity holds for both primal and derivative: a×(b×c) + b×(c×a) + c×(a×b) = 0', () => {
			const a = [dual(1.2, -0.5), dual(2.4, 1.3), dual(-0.8, 0.7)]
			const b = [dual(-1.5, 2.1), dual(0.6, -1.1), dual(3.2, 0.4)]
			const c = [dual(0.9, 1.8), dual(-2.7, 0.3), dual(1.4, -2.2)]

			const t1 = crossProductDualIterative(a, crossProductDualIterative(b, c))
			const t2 = crossProductDualIterative(b, crossProductDualIterative(c, a))
			const t3 = crossProductDualIterative(c, crossProductDualIterative(a, b))

			for (let i = 0; i < 3; i += 1) {
				assertClose(t1[i].v + t2[i].v + t3[i].v, 0, 1e-11, `Jacobi[${i}].v`)
				assertClose(t1[i].d + t2[i].d + t3[i].d, 0, 1e-11, `Jacobi[${i}].d`)
			}
		})

		test('matches central finite-difference numerical derivative of a(t) × b(t)', () => {
			const aVal = (t) => [Math.sin(t) + 0.5 * t * t, Math.cos(2 * t), Math.exp(0.3 * t)]
			const aDer = (t) => [Math.cos(t) + t, -2 * Math.sin(2 * t), 0.3 * Math.exp(0.3 * t)]

			const bVal = (t) => [t * t * t - t, Math.sin(1.5 * t) + 1, Math.cos(t) - 0.4 * t]
			const bDer = (t) => [3 * t * t - 1, 1.5 * Math.cos(1.5 * t), -Math.sin(t) - 0.4]

			const h = 1e-6
			for (const t of [-1.2, 0.0, 0.75, 2.1]) {
				const av = aVal(t)
				const ad = aDer(t)
				const bv = bVal(t)
				const bd = bDer(t)

				const aDual = [0, 1, 2].map((i) => dual(av[i], ad[i]))
				const bDual = [0, 1, 2].map((i) => dual(bv[i], bd[i]))

				const dualRes = crossProductDualIterative(aDual, bDual)

				const primalExact = crossReal(av, bv)
				const fPlus = crossReal(aVal(t + h), bVal(t + h))
				const fMinus = crossReal(aVal(t - h), bVal(t - h))

				for (let i = 0; i < 3; i += 1) {
					const numDeriv = (fPlus[i] - fMinus[i]) / (2 * h)
					assertClose(dualRes[i].v, primalExact[i], 1e-12, `t=${t} comp=${i} primal`)
					assertClose(dualRes[i].d, numDeriv, 1e-7, `t=${t} comp=${i} finite-diff`)
				}
			}
		})
	})
})
