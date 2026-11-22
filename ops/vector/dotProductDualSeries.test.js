import { describe, test } from 'node:test'
import assert from 'node:assert'
import { dotProductDualSeries } from './dotProductDualSeries.js'

/**
 * Helper to assert two numbers are within a given absolute tolerance.
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol=1e-12]
 */
function assertClose(actual, expected, tol = 1e-12) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`Expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`
	)
}

/**
 * Helper to assert two dual numbers are close in both `v` and `d`.
 * @param {{ v: number, d: number }} actual
 * @param {{ v: number, d: number }} expected
 * @param {number} [tol=1e-12]
 */
function assertDualClose(actual, expected, tol = 1e-12) {
	assertClose(actual.v, expected.v, tol)
	assertClose(actual.d, expected.d, tol)
}

describe('dotProductDualSeries', () => {
	describe('normal cases across dimensions', () => {
		test('1D dual vectors reduce to dual scalar multiplication', () => {
			const a = [{ v: 3, d: 2 }]
			const b = [{ v: 5, d: -4 }]
			// v = 3 * 5 = 15; d = 3 * (-4) + 2 * 5 = -12 + 10 = -2
			assert.deepStrictEqual(dotProductDualSeries(a, b), { v: 15, d: -2 })
		})

		test('2D dual vectors with positive, negative, and fractional values', () => {
			const a = [
				{ v: 1.5, d: -0.5 },
				{ v: -2, d: 3 }
			]
			const b = [
				{ v: 4, d: 1 },
				{ v: 0.25, d: -2 }
			]
			// v = 1.5*4 + (-2)*0.25 = 6 - 0.5 = 5.5
			// d = (1.5*1 + (-0.5)*4) + ((-2)*(-2) + 3*0.25) = (1.5 - 2) + (4 + 0.75) = 4.25
			assertDualClose(dotProductDualSeries(a, b), { v: 5.5, d: 4.25 })
		})

		test('3D dual vectors', () => {
			const a = [
				{ v: 1, d: 4 },
				{ v: 2, d: 5 },
				{ v: 3, d: 6 }
			]
			const b = [
				{ v: 7, d: 1 },
				{ v: 8, d: -2 },
				{ v: 9, d: 3 }
			]
			// v = 1*7 + 2*8 + 3*9 = 7 + 16 + 27 = 50
			// d = (1*1 + 4*7) + (2*(-2) + 5*8) + (3*3 + 6*9) = 29 + 36 + 63 = 128
			assert.deepStrictEqual(dotProductDualSeries(a, b), { v: 50, d: 128 })
		})

		test('nD dual vectors match closed-form polynomial sums', () => {
			const n = 20
			// a_k(t) = k + t, b_k(t) = k - 2t evaluated at t = 0
			// a_k = { v: k, d: 1 }, b_k = { v: k, d: -2 }
			const a = Array.from({ length: n }, (_, i) => ({ v: i + 1, d: 1 }))
			const b = Array.from({ length: n }, (_, i) => ({ v: i + 1, d: -2 }))

			// sum_{k=1}^n k^2 = n(n+1)(2n+1)/6
			const expectedV = (n * (n + 1) * (2 * n + 1)) / 6
			// sum_{k=1}^n (k*(-2) + 1*k) = -sum_{k=1}^n k = -n(n+1)/2
			const expectedD = -(n * (n + 1)) / 2

			assert.deepStrictEqual(dotProductDualSeries(a, b), {
				v: expectedV,
				d: expectedD
			})
		})

		test('constant vectors (all derivatives zero) yield zero derivative', () => {
			const a = [
				{ v: 2, d: 0 },
				{ v: -3, d: 0 },
				{ v: 5, d: 0 }
			]
			const b = [
				{ v: 4, d: 0 },
				{ v: 6, d: 0 },
				{ v: -1, d: 0 }
			]
			assert.deepStrictEqual(dotProductDualSeries(a, b), { v: -15, d: 0 })
		})
	})

	describe('edge cases and immutability', () => {
		test('orthogonal vectors have zero value but can have non-zero derivative', () => {
			const a = [
				{ v: 1, d: 0 },
				{ v: 0, d: 2 }
			]
			const b = [
				{ v: 0, d: 3 },
				{ v: 1, d: 0 }
			]
			// v = 1*0 + 0*1 = 0
			// d = (1*3 + 0*0) + (0*0 + 2*1) = 5
			assert.deepStrictEqual(dotProductDualSeries(a, b), { v: 0, d: 5 })
		})

		test('rotating orthogonal unit vectors keep both value and derivative zero', () => {
			const t = 0.73
			// u(t) = [cos t, sin t], v(t) = [-sin t, cos t]
			const u = [
				{ v: Math.cos(t), d: -Math.sin(t) },
				{ v: Math.sin(t), d: Math.cos(t) }
			]
			const v = [
				{ v: -Math.sin(t), d: -Math.cos(t) },
				{ v: Math.cos(t), d: -Math.sin(t) }
			]
			assertDualClose(dotProductDualSeries(u, v), { v: 0, d: 0 }, 1e-15)
			assertDualClose(dotProductDualSeries(u, u), { v: 1, d: 0 }, 1e-15)
		})

		test('zero vectors yield { v: 0, d: 0 } without negative zero', () => {
			const zero = [
				{ v: 0, d: 0 },
				{ v: -0, d: 0 },
				{ v: 0, d: -0 }
			]
			const other = [
				{ v: -5, d: 2 },
				{ v: 3, d: -1 },
				{ v: -7, d: 4 }
			]
			const res1 = dotProductDualSeries(zero, other)
			assert.deepStrictEqual(res1, { v: 0, d: 0 })
			assert.ok(!Object.is(res1.v, -0))
			assert.ok(!Object.is(res1.d, -0))

			const res2 = dotProductDualSeries(zero, zero)
			assert.deepStrictEqual(res2, { v: 0, d: 0 })
			assert.ok(!Object.is(res2.v, -0))
			assert.ok(!Object.is(res2.d, -0))
		})

		test('vectors with zero primal values and non-zero derivatives yield { v: 0, d: 0 }', () => {
			// (0 + ε*a_d) · (0 + ε*b_d) = ε² * (a_d · b_d) = 0 in dual numbers
			const a = [
				{ v: 0, d: 10 },
				{ v: 0, d: -3 }
			]
			const b = [
				{ v: 0, d: 7 },
				{ v: 0, d: 4 }
			]
			assert.deepStrictEqual(dotProductDualSeries(a, b), { v: 0, d: 0 })
		})

		test('does not mutate input vectors or dual elements', () => {
			const a = [
				{ v: 1, d: 2 },
				{ v: 3, d: 4 }
			]
			const b = [
				{ v: 5, d: 6 },
				{ v: 7, d: 8 }
			]
			const aCopy = structuredClone(a)
			const bCopy = structuredClone(b)

			dotProductDualSeries(a, b)

			assert.deepStrictEqual(a, aCopy)
			assert.deepStrictEqual(b, bCopy)
		})
	})

	describe('input validation', () => {
		test('throws TypeError when arguments are not arrays', () => {
			const valid = [{ v: 1, d: 0 }]
			for (const bad of [null, undefined, 42, 'abc', { v: 1, d: 0 }, true]) {
				assert.throws(() => dotProductDualSeries(bad, valid), TypeError)
				assert.throws(() => dotProductDualSeries(valid, bad), TypeError)
			}
		})

		test('throws RangeError for empty arrays', () => {
			const valid = [{ v: 1, d: 0 }]
			assert.throws(() => dotProductDualSeries([], []), RangeError)
			assert.throws(() => dotProductDualSeries([], valid), RangeError)
			assert.throws(() => dotProductDualSeries(valid, []), RangeError)
		})

		test('throws RangeError for mismatched vector lengths', () => {
			const a = [{ v: 1, d: 0 }]
			const b = [
				{ v: 1, d: 0 },
				{ v: 2, d: 1 }
			]
			assert.throws(() => dotProductDualSeries(a, b), RangeError)
			assert.throws(() => dotProductDualSeries(b, a), RangeError)
		})

		test('throws TypeError for invalid dual elements', () => {
			const valid = [{ v: 1, d: 0 }]
			const badElements = [
				null,
				undefined,
				5,
				'1',
				[1, 0],
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 0 },
				{ v: 1, d: null }
			]
			for (const el of badElements) {
				assert.throws(() => dotProductDualSeries([el], valid), TypeError)
				assert.throws(() => dotProductDualSeries(valid, [el]), TypeError)
			}
		})

		test('throws RangeError for non-finite dual components', () => {
			const valid = [{ v: 1, d: 0 }]
			const nonFiniteElements = [
				{ v: Number.NaN, d: 0 },
				{ v: 0, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 0 },
				{ v: 0, d: Number.NEGATIVE_INFINITY }
			]
			for (const el of nonFiniteElements) {
				assert.throws(() => dotProductDualSeries([el], valid), RangeError)
				assert.throws(() => dotProductDualSeries(valid, [el]), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		test('matches central finite-difference derivative of smooth nonlinear curves a(t) · b(t)', () => {
			const aFn = (t) => [
				Math.sin(t),
				Math.cos(2 * t),
				Math.exp(0.5 * t),
				t * t + 1
			]
			const aDeriv = (t) => [
				Math.cos(t),
				-2 * Math.sin(2 * t),
				0.5 * Math.exp(0.5 * t),
				2 * t
			]

			const bFn = (t) => [
				Math.exp(-t),
				t * t * t - t,
				Math.log(2 + t),
				Math.cos(t)
			]
			const bDeriv = (t) => [
				-Math.exp(-t),
				3 * t * t - 1,
				1 / (2 + t),
				-Math.sin(t)
			]

			const scalarDot = (u, w) => u.reduce((acc, ui, i) => acc + ui * w[i], 0)
			const h = 1e-6

			for (const t of [-0.8, 0, 0.45, 1.3]) {
				const aVals = aFn(t)
				const aDers = aDeriv(t)
				const bVals = bFn(t)
				const bDers = bDeriv(t)

				const aDual = aVals.map((v, i) => ({ v, d: aDers[i] }))
				const bDual = bVals.map((v, i) => ({ v, d: bDers[i] }))

				const actual = dotProductDualSeries(aDual, bDual)

				const expectedV = scalarDot(aVals, bVals)
				const fPlus = scalarDot(aFn(t + h), bFn(t + h))
				const fMinus = scalarDot(aFn(t - h), bFn(t - h))
				const fdDeriv = (fPlus - fMinus) / (2 * h)

				assertClose(actual.v, expectedV, 1e-12)
				assertClose(actual.d, fdDeriv, 1e-8)
			}
		})

		test('satisfies commutativity, bilinearity, and polarization identity over dual numbers', () => {
			const dualAdd = (x, y) => ({ v: x.v + y.v, d: x.d + y.d })
			const dualSub = (x, y) => ({ v: x.v - y.v, d: x.d - y.d })
			const dualMul = (x, y) => ({
				v: x.v * y.v,
				d: x.v * y.d + x.d * y.v
			})

			const a = [
				{ v: 1.2, d: -0.7 },
				{ v: -3.4, d: 2.1 },
				{ v: 0.5, d: 4.3 },
				{ v: 2.8, d: -1.6 }
			]
			const b = [
				{ v: -2.1, d: 0.9 },
				{ v: 1.7, d: -3.2 },
				{ v: 4.0, d: 1.1 },
				{ v: -0.6, d: 2.5 }
			]
			const c = [
				{ v: 0.3, d: 1.4 },
				{ v: -1.1, d: -0.8 },
				{ v: 2.2, d: -2.9 },
				{ v: 3.5, d: 0.4 }
			]
			const s = { v: -2.5, d: 1.75 }

			// Commutativity: a · b === b · a
			const ab = dotProductDualSeries(a, b)
			const ba = dotProductDualSeries(b, a)
			assertDualClose(ab, ba, 1e-12)

			// Additivity in first argument: (a + c) · b === a · b + c · b
			const aPlusC = a.map((ai, i) => dualAdd(ai, c[i]))
			const lhsAdd1 = dotProductDualSeries(aPlusC, b)
			const rhsAdd1 = dualAdd(ab, dotProductDualSeries(c, b))
			assertDualClose(lhsAdd1, rhsAdd1, 1e-12)

			// Additivity in second argument: a · (b + c) === a · b + a · c
			const bPlusC = b.map((bi, i) => dualAdd(bi, c[i]))
			const lhsAdd2 = dotProductDualSeries(a, bPlusC)
			const rhsAdd2 = dualAdd(ab, dotProductDualSeries(a, c))
			assertDualClose(lhsAdd2, rhsAdd2, 1e-12)

			// Dual scalar homogeneity: (s * a) · b === s * (a · b)
			const sTimesA = a.map((ai) => dualMul(s, ai))
			const lhsScale = dotProductDualSeries(sTimesA, b)
			const rhsScale = dualMul(s, ab)
			assertDualClose(lhsScale, rhsScale, 1e-12)

			// Polarization identity: a · b === (1/4) * ((a + b)·(a + b) - (a - b)·(a - b))
			const aPlusB = a.map((ai, i) => dualAdd(ai, b[i]))
			const aMinusB = a.map((ai, i) => dualSub(ai, b[i]))
			const normPlus = dotProductDualSeries(aPlusB, aPlusB)
			const normMinus = dotProductDualSeries(aMinusB, aMinusB)
			const diff = dualSub(normPlus, normMinus)
			const polarized = { v: 0.25 * diff.v, d: 0.25 * diff.d }
			assertDualClose(ab, polarized, 1e-12)
		})
	})
})
