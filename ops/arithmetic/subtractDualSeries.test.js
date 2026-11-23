import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { subtractDualSeries } from './subtractDualSeries.js'

describe('subtractDualSeries', () => {
	describe('normal cases', () => {
		it('subtracts positive dual numbers', () => {
			const result = subtractDualSeries({ v: 10, d: 4 }, { v: 3, d: 1.5 })
			assert.deepStrictEqual(result, { v: 7, d: 2.5 })
		})

		it('subtracts negative and mixed-sign dual numbers', () => {
			const result = subtractDualSeries({ v: -5.5, d: 2 }, { v: -2.5, d: -3.5 })
			assert.deepStrictEqual(result, { v: -3, d: 5.5 })
		})

		it('handles fractional floating-point values accurately', () => {
			const result = subtractDualSeries({ v: 1.25, d: -0.75 }, { v: 0.5, d: 0.25 })
			assert.deepStrictEqual(result, { v: 0.75, d: -1 })
		})

		it('does not mutate input dual objects and returns a fresh object', () => {
			const a = { v: 4, d: 9 }
			const b = { v: 1, d: 2 }
			const result = subtractDualSeries(a, b)
			assert.deepStrictEqual(a, { v: 4, d: 9 })
			assert.deepStrictEqual(b, { v: 1, d: 2 })
			assert.notStrictEqual(result, a)
			assert.notStrictEqual(result, b)
		})
	})

	describe('edge cases', () => {
		it('subtracts zero dual number (additive identity)', () => {
			const a = { v: 42, d: -7 }
			const zero = { v: 0, d: 0 }
			assert.deepStrictEqual(subtractDualSeries(a, zero), { v: 42, d: -7 })
		})

		it('subtracts a dual number from zero (additive negation)', () => {
			const zero = { v: 0, d: 0 }
			const b = { v: 3.5, d: -2.25 }
			assert.deepStrictEqual(subtractDualSeries(zero, b), { v: -3.5, d: 2.25 })
		})

		it('returns zero when subtracting a dual number from itself', () => {
			const a = { v: Math.PI, d: -Math.E }
			assert.deepStrictEqual(subtractDualSeries(a, a), { v: 0, d: 0 })
		})

		it('canonicalizes negative zero to positive zero', () => {
			const result = subtractDualSeries({ v: -0, d: -0 }, { v: 0, d: 0 })
			assert.ok(Object.is(result.v, 0))
			assert.ok(Object.is(result.d, 0))
		})

		it('handles very small subnormal values without precision loss to NaN', () => {
			const tiny = Number.MIN_VALUE
			const result = subtractDualSeries({ v: tiny * 3, d: tiny * 2 }, { v: tiny, d: tiny * 2 })
			assert.strictEqual(result.v, tiny * 2)
			assert.ok(Object.is(result.d, 0))
		})

		it('handles large finite values that do not overflow', () => {
			const large = Number.MAX_VALUE
			const result = subtractDualSeries({ v: large, d: -large }, { v: large, d: -large })
			assert.deepStrictEqual(result, { v: 0, d: 0 })
		})

		it('throws RangeError when subtraction overflows to Infinity', () => {
			assert.throws(
				() => subtractDualSeries({ v: Number.MAX_VALUE, d: 0 }, { v: -Number.MAX_VALUE, d: 0 }),
				RangeError,
			)
			assert.throws(
				() => subtractDualSeries({ v: 0, d: -Number.MAX_VALUE }, { v: 0, d: Number.MAX_VALUE }),
				RangeError,
			)
		})
	})

	describe('input validation', () => {
		it('rejects null, undefined, primitives, and arrays', () => {
			const valid = { v: 1, d: 2 }
			const badInputs = [null, undefined, 0, 42, '1', true, [1, 2], () => {}]

			for (const bad of badInputs) {
				assert.throws(() => subtractDualSeries(bad, valid), TypeError)
				assert.throws(() => subtractDualSeries(valid, bad), TypeError)
			}
		})

		it('rejects objects with missing or non-numeric v or d', () => {
			const valid = { v: 1, d: 2 }
			const badDuals = [
				{},
				{ v: 1 },
				{ d: 2 },
				{ v: '1', d: 2 },
				{ v: 1, d: '2' },
				{ v: null, d: 2 },
				{ v: 1, d: undefined },
				{ v: 1n, d: 2 },
			]

			for (const bad of badDuals) {
				assert.throws(() => subtractDualSeries(bad, valid), TypeError)
				assert.throws(() => subtractDualSeries(valid, bad), TypeError)
			}
		})

		it('rejects non-finite components (NaN, Infinity, -Infinity)', () => {
			const valid = { v: 1, d: 2 }
			const nonFiniteDuals = [
				{ v: Number.NaN, d: 0 },
				{ v: 0, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 0 },
				{ v: 0, d: Number.NEGATIVE_INFINITY },
			]

			for (const bad of nonFiniteDuals) {
				assert.throws(() => subtractDualSeries(bad, valid), RangeError)
				assert.throws(() => subtractDualSeries(valid, bad), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('matches central finite-difference differentiation of h(t) = f(t) - g(t)', () => {
			const f = (t) => t ** 3 + 2 * Math.sin(t)
			const df = (t) => 3 * t ** 2 + 2 * Math.cos(t)
			const g = (t) => Math.exp(0.5 * t) - t ** 2
			const dg = (t) => 0.5 * Math.exp(0.5 * t) - 2 * t
			const h = (t) => f(t) - g(t)

			const eps = 1e-6
			for (const t of [-2.0, -0.5, 0.0, 0.75, 1.5]) {
				const dualResult = subtractDualSeries(
					{ v: f(t), d: df(t) },
					{ v: g(t), d: dg(t) },
				)
				const expectedValue = h(t)
				const finiteDiffDerivative = (h(t + eps) - h(t - eps)) / (2 * eps)

				assert.ok(
					Math.abs(dualResult.v - expectedValue) < 1e-12,
					`value mismatch at t=${t}: got ${dualResult.v}, expected ${expectedValue}`,
				)
				assert.ok(
					Math.abs(dualResult.d - finiteDiffDerivative) < 1e-7,
					`derivative mismatch at t=${t}: got ${dualResult.d}, finite-diff ${finiteDiffDerivative}`,
				)
			}
		})

		it('matches the 2x2 upper-triangular matrix ring isomorphism M(v, d) = [[v, d], [0, v]]', () => {
			const toMatrix = ({ v, d }) => [
				[v, d],
				[0, v],
			]
			const subMatrix = (A, B) => [
				[A[0][0] - B[0][0], A[0][1] - B[0][1]],
				[A[1][0] - B[1][0], A[1][1] - B[1][1]],
			]

			const pairs = [
				[{ v: 3, d: 5 }, { v: 1, d: 2 }],
				[{ v: -4.25, d: 0.5 }, { v: 7.5, d: -1.25 }],
				[{ v: 0, d: 11 }, { v: -3, d: 11 }],
			]

			for (const [a, b] of pairs) {
				const dualDiff = subtractDualSeries(a, b)
				const matDiff = subMatrix(toMatrix(a), toMatrix(b))
				assert.strictEqual(dualDiff.v, matDiff[0][0])
				assert.strictEqual(dualDiff.v, matDiff[1][1])
				assert.strictEqual(dualDiff.d, matDiff[0][1])
				assert.strictEqual(matDiff[1][0], 0)
			}
		})

		it('satisfies anticommutativity: subtract(a, b) === -subtract(b, a)', () => {
			const a = { v: 13.75, d: -4.5 }
			const b = { v: -6.25, d: 8.125 }
			const ab = subtractDualSeries(a, b)
			const ba = subtractDualSeries(b, a)
			assert.strictEqual(ab.v, -ba.v)
			assert.strictEqual(ab.d, -ba.d)
		})
	})
})
