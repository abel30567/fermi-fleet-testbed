import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { vectorAddDualIterative } from './vectorAddDualIterative.js'

/**
 * Helper to assert two dual vectors are approximately equal within epsilon.
 */
function assertDualVectorClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i += 1) {
		assert.ok(
			Math.abs(actual[i].v - expected[i].v) <= eps,
			`v mismatch at index ${i}: got ${actual[i].v}, expected ${expected[i].v}`
		)
		assert.ok(
			Math.abs(actual[i].d - expected[i].d) <= eps,
			`d mismatch at index ${i}: got ${actual[i].d}, expected ${expected[i].d}`
		)
	}
}

describe('vectorAddDualIterative', () => {
	describe('normal cases', () => {
		test('adds two 3D dual vectors elementwise', () => {
			const a = [
				{ v: 1, d: 2 },
				{ v: 3, d: 4 },
				{ v: 5, d: 6 },
			]
			const b = [
				{ v: 10, d: 20 },
				{ v: 30, d: 40 },
				{ v: 50, d: 60 },
			]
			const res = vectorAddDualIterative(a, b)
			assert.deepEqual(res, [
				{ v: 11, d: 22 },
				{ v: 33, d: 44 },
				{ v: 55, d: 66 },
			])
		})

		test('handles floating-point dual values and derivatives accurately', () => {
			const a = [
				{ v: 0.25, d: -1.5 },
				{ v: Math.PI, d: 0.125 },
			]
			const b = [
				{ v: 0.75, d: 2.25 },
				{ v: Math.E, d: -0.625 },
			]
			const res = vectorAddDualIterative(a, b)
			assertDualVectorClose(res, [
				{ v: 1.0, d: 0.75 },
				{ v: Math.PI + Math.E, d: -0.5 },
			])
		})

		test('handles large vectors iteratively without stack issues', () => {
			const n = 10000
			const a = new Array(n)
			const b = new Array(n)
			for (let i = 0; i < n; i += 1) {
				a[i] = { v: i, d: 0.5 * i }
				b[i] = { v: 2 * i, d: -0.25 * i }
			}
			const res = vectorAddDualIterative(a, b)
			assert.equal(res.length, n)
			assert.deepEqual(res[0], { v: 0, d: 0 })
			assert.deepEqual(res[9999], { v: 29997, d: 2499.75 })
		})
	})

	describe('edge cases', () => {
		test('handles empty arrays', () => {
			const res = vectorAddDualIterative([], [])
			assert.deepEqual(res, [])
		})

		test('handles 1D vectors', () => {
			const res = vectorAddDualIterative([{ v: 7, d: -3 }], [{ v: -2, d: 8 }])
			assert.deepEqual(res, [{ v: 5, d: 5 }])
		})

		test('handles negative values and exact cancellation to zero', () => {
			const a = [
				{ v: -4.5, d: -1.25 },
				{ v: 12, d: -9 },
			]
			const b = [
				{ v: 4.5, d: 1.25 },
				{ v: -12, d: 9 },
			]
			const res = vectorAddDualIterative(a, b)
			assert.deepEqual(res, [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			])
		})

		test('handles zero derivatives and additive identity', () => {
			const a = [
				{ v: 4, d: 0 },
				{ v: -9.5, d: 0 },
			]
			const zero = [
				{ v: 0, d: 0 },
				{ v: 0, d: 0 },
			]
			assert.deepEqual(vectorAddDualIterative(a, zero), a)
			assert.deepEqual(vectorAddDualIterative(zero, a), a)
		})

		test('does not mutate inputs and returns fresh objects', () => {
			const a = [
				{ v: 1, d: 2 },
				{ v: 3, d: 4 },
			]
			const b = [
				{ v: 5, d: 6 },
				{ v: 7, d: 8 },
			]
			const aSnapshot = structuredClone(a)
			const bSnapshot = structuredClone(b)

			const res = vectorAddDualIterative(a, b)
			assert.notEqual(res, a)
			assert.notEqual(res, b)
			assert.notEqual(res[0], a[0])
			assert.notEqual(res[0], b[0])

			res[0].v = 999
			res[0].d = 999
			assert.deepEqual(a, aSnapshot)
			assert.deepEqual(b, bSnapshot)
		})
	})

	describe('input validation', () => {
		test('throws TypeError when a or b is not an array', () => {
			const valid = [{ v: 1, d: 0 }]
			for (const invalid of [null, undefined, 42, 'vec', { v: 1, d: 0 }, true]) {
				assert.throws(() => vectorAddDualIterative(invalid, valid), TypeError)
				assert.throws(() => vectorAddDualIterative(valid, invalid), TypeError)
			}
		})

		test('throws RangeError when vector lengths do not match', () => {
			assert.throws(
				() => vectorAddDualIterative([{ v: 1, d: 0 }], []),
				RangeError
			)
			assert.throws(
				() =>
					vectorAddDualIterative(
						[{ v: 1, d: 0 }],
						[
							{ v: 1, d: 0 },
							{ v: 2, d: 1 },
						]
					),
				RangeError
			)
		})

		test('throws TypeError for invalid dual elements or missing/non-numeric fields', () => {
			const valid = [{ v: 1, d: 1 }]
			const invalidElements = [
				null,
				undefined,
				5,
				'1',
				[1, 1],
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 0 },
				{ v: 0, d: '1' },
				{ v: null, d: 0 },
				{ v: 0, d: undefined },
			]
			for (const bad of invalidElements) {
				assert.throws(() => vectorAddDualIterative([bad], valid), TypeError)
				assert.throws(() => vectorAddDualIterative(valid, [bad]), TypeError)
			}

			// Sparse array hole
			const sparse = new Array(1)
			assert.throws(() => vectorAddDualIterative(sparse, valid), TypeError)
			assert.throws(() => vectorAddDualIterative(valid, sparse), TypeError)
		})

		test('throws RangeError for non-finite v or d values', () => {
			const valid = [{ v: 1, d: 1 }]
			const nonFinite = [NaN, Infinity, -Infinity]
			for (const nf of nonFinite) {
				assert.throws(
					() => vectorAddDualIterative([{ v: nf, d: 0 }], valid),
					RangeError
				)
				assert.throws(
					() => vectorAddDualIterative([{ v: 0, d: nf }], valid),
					RangeError
				)
				assert.throws(
					() => vectorAddDualIterative(valid, [{ v: nf, d: 0 }]),
					RangeError
				)
				assert.throws(
					() => vectorAddDualIterative(valid, [{ v: 0, d: nf }]),
					RangeError
				)
			}
		})
	})

	describe('cross-checks and algebraic identities', () => {
		test('satisfies commutativity: a + b === b + a', () => {
			const a = [
				{ v: 2.5, d: -1.3 },
				{ v: -7.1, d: 4.2 },
				{ v: 0.0, d: 9.8 },
			]
			const b = [
				{ v: -3.4, d: 5.6 },
				{ v: 1.9, d: -2.7 },
				{ v: 6.3, d: -0.4 },
			]
			assert.deepEqual(
				vectorAddDualIterative(a, b),
				vectorAddDualIterative(b, a)
			)
		})

		test('satisfies associativity: (a + b) + c ≈ a + (b + c)', () => {
			const a = [
				{ v: 1.2, d: -0.4 },
				{ v: 3.7, d: 2.1 },
				{ v: -5.5, d: 0.9 },
			]
			const b = [
				{ v: -2.8, d: 1.6 },
				{ v: 0.3, d: -4.2 },
				{ v: 8.1, d: 3.3 },
			]
			const c = [
				{ v: 4.9, d: -3.1 },
				{ v: -6.4, d: 5.5 },
				{ v: 2.2, d: -7.7 },
			]
			const left = vectorAddDualIterative(vectorAddDualIterative(a, b), c)
			const right = vectorAddDualIterative(a, vectorAddDualIterative(b, c))
			assertDualVectorClose(left, right, 1e-12)
		})

		test('matches central finite-difference derivative of a(t) + b(t)', () => {
			const evalA = (t) => [t * t, Math.sin(t), Math.exp(0.5 * t)]
			const evalADeriv = (t) => [2 * t, Math.cos(t), 0.5 * Math.exp(0.5 * t)]

			const evalB = (t) => [3 * t - 1, Math.cos(2 * t), Math.log(t + 2)]
			const evalBDeriv = (t) => [3, -2 * Math.sin(2 * t), 1 / (t + 2)]

			const t0 = 1.25
			const aVals = evalA(t0)
			const aDerivs = evalADeriv(t0)
			const bVals = evalB(t0)
			const bDerivs = evalBDeriv(t0)

			const aDual = aVals.map((v, i) => ({ v, d: aDerivs[i] }))
			const bDual = bVals.map((v, i) => ({ v, d: bDerivs[i] }))

			const res = vectorAddDualIterative(aDual, bDual)

			// Independent evaluation of s(t) = a(t) + b(t) and central finite difference
			const sumAt = (t) => {
				const av = evalA(t)
				const bv = evalB(t)
				return av.map((val, i) => val + bv[i])
			}

			const h = 1e-6
			const s0 = sumAt(t0)
			const sPlus = sumAt(t0 + h)
			const sMinus = sumAt(t0 - h)

			for (let i = 0; i < res.length; i += 1) {
				const fdDeriv = (sPlus[i] - sMinus[i]) / (2 * h)
				assert.ok(
					Math.abs(res[i].v - s0[i]) < 1e-12,
					`primal mismatch at index ${i}: got ${res[i].v}, expected ${s0[i]}`
				)
				assert.ok(
					Math.abs(res[i].d - fdDeriv) < 1e-8,
					`derivative mismatch at index ${i}: got ${res[i].d}, finite-diff ${fdDeriv}`
				)
			}
		})
	})
})
