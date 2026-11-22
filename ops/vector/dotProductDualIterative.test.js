import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { dotProductDualIterative } from './dotProductDualIterative.js'

/**
 * Helper to assert two numbers are approximately equal within an absolute tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol=1e-9]
 */
function assertClose(actual, expected, tol = 1e-9) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`Expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`
	)
}

describe('dotProductDualIterative', () => {
	describe('normal cases', () => {
		test('computes 2D dual vector dot product accurately', () => {
			const a = [
				{ v: 2, d: 3 },
				{ v: 4, d: -1 },
			]
			const b = [
				{ v: 5, d: 2 },
				{ v: -3, d: 7 },
			]
			// v = 2*5 + 4*(-3) = 10 - 12 = -2
			// d = (2*2 + 3*5) + (4*7 + (-1)*(-3)) = (4 + 15) + (28 + 3) = 19 + 31 = 50
			const result = dotProductDualIterative(a, b)
			assert.deepEqual(result, { v: -2, d: 50 })
		})

		test('computes 3D dual vector dot product accurately', () => {
			const a = [
				{ v: 1, d: 0.5 },
				{ v: -2, d: 1.5 },
				{ v: 3, d: -2 },
			]
			const b = [
				{ v: 4, d: -1 },
				{ v: 5, d: 2 },
				{ v: -6, d: 0.25 },
			]
			// v = 1*4 + (-2)*5 + 3*(-6) = 4 - 10 - 18 = -24
			// d = (1*(-1) + 0.5*4) + ((-2)*2 + 1.5*5) + (3*0.25 + (-2)*(-6))
			//   = 1 + 3.5 + 12.75 = 17.25
			const result = dotProductDualIterative(a, b)
			assertClose(result.v, -24, 1e-12)
			assertClose(result.d, 17.25, 1e-12)
		})

		test('computes high-dimensional (500D) dual vector dot product against closed-form sums', () => {
			const n = 500
			// Let a[k] = { v: k, d: 1 }, b[k] = { v: 1, d: k } for k = 1..n
			// v = sum(k) = n(n+1)/2
			// d = sum(k*k + 1*1) = n(n+1)(2n+1)/6 + n
			const a = []
			const b = []
			for (let k = 1; k <= n; k += 1) {
				a.push({ v: k, d: 1 })
				b.push({ v: 1, d: k })
			}

			const expectedV = (n * (n + 1)) / 2
			const expectedD = (n * (n + 1) * (2 * n + 1)) / 6 + n

			const result = dotProductDualIterative(a, b)
			assert.equal(result.v, expectedV)
			assert.equal(result.d, expectedD)
		})

		test('is commutative in both value and derivative', () => {
			const a = [
				{ v: 1.25, d: -0.75 },
				{ v: -3.5, d: 2.1 },
				{ v: 0.4, d: 4.8 },
				{ v: 7.2, d: -1.3 },
			]
			const b = [
				{ v: -2.6, d: 1.9 },
				{ v: 0.8, d: -5.4 },
				{ v: 3.3, d: 0.2 },
				{ v: -1.1, d: 6.7 },
			]

			const ab = dotProductDualIterative(a, b)
			const ba = dotProductDualIterative(b, a)
			assertClose(ab.v, ba.v, 1e-12)
			assertClose(ab.d, ba.d, 1e-12)
		})

		test('satisfies self-dot derivative identity d(a·a) = 2 * sum(a.v * a.d)', () => {
			const a = [
				{ v: 3, d: 2 },
				{ v: -4, d: 5 },
				{ v: 1.5, d: -0.5 },
			]
			const result = dotProductDualIterative(a, a)
			const expectedV = 3 * 3 + (-4) * (-4) + 1.5 * 1.5
			const expectedD = 2 * (3 * 2 + (-4) * 5 + 1.5 * -0.5)
			assertClose(result.v, expectedV, 1e-12)
			assertClose(result.d, expectedD, 1e-12)
		})

		test('does not mutate input arrays or elements', () => {
			const a = [
				{ v: 2, d: 1 },
				{ v: 3, d: 4 },
			]
			const b = [
				{ v: 5, d: 6 },
				{ v: 7, d: 8 },
			]
			const aSnapshot = structuredClone(a)
			const bSnapshot = structuredClone(b)

			dotProductDualIterative(a, b)

			assert.deepEqual(a, aSnapshot)
			assert.deepEqual(b, bSnapshot)
		})
	})

	describe('edge cases', () => {
		test('returns { v: 0, d: 0 } for empty vectors', () => {
			assert.deepEqual(dotProductDualIterative([], []), { v: 0, d: 0 })
		})

		test('handles 1D vectors (reduces to dual scalar multiplication)', () => {
			const result = dotProductDualIterative([{ v: -3.5, d: 2 }], [{ v: 4, d: -1.5 }])
			// v = -14, d = (-3.5)*(-1.5) + 2*4 = 5.25 + 8 = 13.25
			assert.deepEqual(result, { v: -14, d: 13.25 })
		})

		test('handles orthogonal primal vectors with non-zero derivative', () => {
			const a = [
				{ v: 1, d: 2 },
				{ v: 0, d: 3 },
			]
			const b = [
				{ v: 0, d: 5 },
				{ v: 1, d: 7 },
			]
			// v = 1*0 + 0*1 = 0
			// d = (1*5 + 2*0) + (0*7 + 3*1) = 5 + 3 = 8
			assert.deepEqual(dotProductDualIterative(a, b), { v: 0, d: 8 })
		})

		test('handles zero derivatives on both vectors', () => {
			const a = [
				{ v: 2, d: 0 },
				{ v: -5, d: 0 },
				{ v: 3, d: 0 },
			]
			const b = [
				{ v: 4, d: 0 },
				{ v: 1, d: 0 },
				{ v: -2, d: 0 },
			]
			assert.deepEqual(dotProductDualIterative(a, b), { v: -3, d: 0 })
		})

		test('handles constant vector (zero derivatives on one side)', () => {
			const a = [
				{ v: 1, d: 3 },
				{ v: 2, d: -4 },
			]
			const b = [
				{ v: 10, d: 0 },
				{ v: 20, d: 0 },
			]
			// v = 10 + 40 = 50, d = 3*10 + (-4)*20 = 30 - 80 = -50
			assert.deepEqual(dotProductDualIterative(a, b), { v: 50, d: -50 })
		})

		test('handles negative components with exact cancellation', () => {
			const a = [
				{ v: -3, d: -2 },
				{ v: 3, d: 2 },
			]
			const b = [
				{ v: 5, d: -4 },
				{ v: 5, d: -4 },
			]
			// Each pair cancels identically
			assert.deepEqual(dotProductDualIterative(a, b), { v: 0, d: 0 })
		})

		test('throws TypeError for non-array inputs', () => {
			const valid = [{ v: 1, d: 0 }]
			assert.throws(() => dotProductDualIterative(null, valid), TypeError)
			assert.throws(() => dotProductDualIterative(valid, undefined), TypeError)
			assert.throws(() => dotProductDualIterative(42, valid), TypeError)
			assert.throws(() => dotProductDualIterative('abc', valid), TypeError)
			assert.throws(() => dotProductDualIterative({ length: 1 }, valid), TypeError)
			assert.throws(() => dotProductDualIterative(valid, new Float64Array([1])), TypeError)
		})

		test('throws RangeError for mismatched vector lengths', () => {
			assert.throws(
				() => dotProductDualIterative([{ v: 1, d: 0 }], []),
				RangeError
			)
			assert.throws(
				() =>
					dotProductDualIterative(
						[{ v: 1, d: 0 }],
						[
							{ v: 1, d: 0 },
							{ v: 2, d: 1 },
						]
					),
				RangeError
			)
		})

		test('throws TypeError for malformed dual elements', () => {
			const valid = [{ v: 1, d: 2 }]
			assert.throws(() => dotProductDualIterative([null], valid), TypeError)
			assert.throws(() => dotProductDualIterative([undefined], valid), TypeError)
			assert.throws(() => dotProductDualIterative([5], valid), TypeError)
			assert.throws(() => dotProductDualIterative([[1, 2]], valid), TypeError)
			assert.throws(() => dotProductDualIterative([{ v: 1 }], valid), TypeError)
			assert.throws(() => dotProductDualIterative([{ d: 2 }], valid), TypeError)
			assert.throws(() => dotProductDualIterative([{ v: '1', d: 2 }], valid), TypeError)
			assert.throws(() => dotProductDualIterative(valid, [{ v: 1, d: '2' }]), TypeError)

			// Sparse array hole
			const sparse = new Array(1)
			assert.throws(() => dotProductDualIterative(sparse, valid), TypeError)
		})

		test('throws RangeError for non-finite dual components', () => {
			const valid = [{ v: 1, d: 2 }]
			assert.throws(() => dotProductDualIterative([{ v: NaN, d: 0 }], valid), RangeError)
			assert.throws(() => dotProductDualIterative([{ v: 0, d: NaN }], valid), RangeError)
			assert.throws(() => dotProductDualIterative([{ v: Infinity, d: 0 }], valid), RangeError)
			assert.throws(() => dotProductDualIterative([{ v: 0, d: -Infinity }], valid), RangeError)
			assert.throws(() => dotProductDualIterative(valid, [{ v: -Infinity, d: 1 }]), RangeError)
			assert.throws(() => dotProductDualIterative(valid, [{ v: 1, d: Infinity }]), RangeError)
		})
	})

	describe('cross-checks against independent computations', () => {
		test('matches central finite-difference derivative of linear parameterization a(t) · b(t)', () => {
			const a = [
				{ v: 1.7, d: -0.9 },
				{ v: -2.3, d: 3.1 },
				{ v: 0.45, d: 1.25 },
				{ v: 4.8, d: -2.7 },
				{ v: -1.1, d: 0.6 },
			]
			const b = [
				{ v: -0.8, d: 2.2 },
				{ v: 1.9, d: -0.4 },
				{ v: 3.6, d: 1.5 },
				{ v: -2.1, d: -1.8 },
				{ v: 0.75, d: 4.3 },
			]

			const evalDot = (t) => {
				let sum = 0
				for (let i = 0; i < a.length; i += 1) {
					const at = a[i].v + t * a[i].d
					const bt = b[i].v + t * b[i].d
					sum += at * bt
				}
				return sum
			}

			const h = 1e-6
			const numericalValue = evalDot(0)
			const numericalDerivative = (evalDot(h) - evalDot(-h)) / (2 * h)

			const dualResult = dotProductDualIterative(a, b)
			assertClose(dualResult.v, numericalValue, 1e-12)
			assertClose(dualResult.d, numericalDerivative, 1e-7)
		})

		test('matches central finite-difference derivative on nonlinear vector functions a(t) · b(t)', () => {
			const aFunc = (t) => [Math.sin(t), Math.cos(t), Math.exp(0.5 * t), t * t - 1]
			const aDeriv = (t) => [Math.cos(t), -Math.sin(t), 0.5 * Math.exp(0.5 * t), 2 * t]

			const bFunc = (t) => [t * t + 1, 1 / (1 + t * t), Math.log(2 + t), Math.sin(2 * t)]
			const bDeriv = (t) => [
				2 * t,
				(-2 * t) / (1 + t * t) ** 2,
				1 / (2 + t),
				2 * Math.cos(2 * t),
			]

			const scalarDot = (t) => {
				const av = aFunc(t)
				const bv = bFunc(t)
				return av.reduce((acc, val, idx) => acc + val * bv[idx], 0)
			}

			const h = 1e-6
			for (const t of [-0.75, 0, 0.5, 1.25]) {
				const av = aFunc(t)
				const ad = aDeriv(t)
				const bv = bFunc(t)
				const bd = bDeriv(t)

				const aDual = av.map((v, idx) => ({ v, d: ad[idx] }))
				const bDual = bv.map((v, idx) => ({ v, d: bd[idx] }))

				const dualResult = dotProductDualIterative(aDual, bDual)
				const expectedV = scalarDot(t)
				const expectedD = (scalarDot(t + h) - scalarDot(t - h)) / (2 * h)

				assertClose(dualResult.v, expectedV, 1e-12)
				assertClose(dualResult.d, expectedD, 1e-7)
			}
		})
	})
})
