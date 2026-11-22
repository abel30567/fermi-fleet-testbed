import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { addDualSeries } from './addDualSeries.js'

/**
 * Helper to represent a dual number `{ v, d }` as its isomorphic 2x2 matrix `[[v, d], [0, v]]`.
 * @param {{ v: number, d: number }} z
 * @returns {[[number, number], [number, number]]}
 */
function dualToMatrix({ v, d }) {
	return [
		[v, d],
		[0, v]
	]
}

/**
 * Independent 2x2 matrix addition for cross-checking dual algebra isomorphism.
 * @param {number[][]} m1
 * @param {number[][]} m2
 * @returns {number[][]}
 */
function addMatrices2x2(m1, m2) {
	return [
		[m1[0][0] + m2[0][0], m1[0][1] + m2[0][1]],
		[m1[1][0] + m2[1][0], m1[1][1] + m2[1][1]]
	]
}

describe('addDualSeries', () => {
	describe('normal pairwise and multi-term cases', () => {
		it('adds two dual numbers component-wise', () => {
			assert.deepStrictEqual(
				addDualSeries({ v: 2, d: 3 }, { v: 5, d: 7 }),
				{ v: 7, d: 10 }
			)
		})

		it('handles fractional floating-point dual numbers', () => {
			const res = addDualSeries({ v: 1.25, d: -0.5 }, { v: 2.75, d: 1.25 })
			assert.deepStrictEqual(res, { v: 4, d: 0.75 })
		})

		it('supports variadic multi-term sums (3, 4, and many terms)', () => {
			const res3 = addDualSeries(
				{ v: 1, d: 10 },
				{ v: 2, d: 20 },
				{ v: 3, d: 30 }
			)
			assert.deepStrictEqual(res3, { v: 6, d: 60 })

			const terms = Array.from({ length: 100 }, (_, i) => ({
				v: i + 1,
				d: (i + 1) * 2
			}))
			assert.deepStrictEqual(addDualSeries(...terms), { v: 5050, d: 10100 })
		})

		it('satisfies commutativity and associativity', () => {
			const a = { v: 3.5, d: -1.25 }
			const b = { v: -7.25, d: 4.5 }
			const c = { v: 2.75, d: 0.75 }

			assert.deepStrictEqual(addDualSeries(a, b), addDualSeries(b, a))
			assert.deepStrictEqual(
				addDualSeries(addDualSeries(a, b), c),
				addDualSeries(a, addDualSeries(b, c))
			)
			assert.deepStrictEqual(
				addDualSeries(a, b, c),
				addDualSeries(addDualSeries(a, b), c)
			)
		})

		it('does not mutate input dual number objects', () => {
			const a = Object.freeze({ v: 4, d: -2 })
			const b = Object.freeze({ v: 6, d: 9 })
			const out = addDualSeries(a, b)
			assert.deepStrictEqual(out, { v: 10, d: 7 })
			assert.notEqual(out, a)
			assert.notEqual(out, b)
		})
	})

	describe('edge cases', () => {
		it('handles zeros and additive identity { v: 0, d: 0 }', () => {
			const zero = { v: 0, d: 0 }
			const x = { v: 42.5, d: -3.125 }
			assert.deepStrictEqual(addDualSeries(x, zero), x)
			assert.deepStrictEqual(addDualSeries(zero, x), x)
			assert.deepStrictEqual(addDualSeries(zero, zero), zero)
		})

		it('normalizes -0 results to +0', () => {
			const res = addDualSeries({ v: -0, d: -0 }, { v: -0, d: -0 })
			assert.ok(Object.is(res.v, 0))
			assert.ok(Object.is(res.d, 0))
		})

		it('handles negative values and exact additive inverse cancellation', () => {
			const a = { v: 123.456, d: -789.012 }
			const negA = { v: -123.456, d: 789.012 }
			assert.deepStrictEqual(addDualSeries(a, negA), { v: 0, d: 0 })
		})

		it('preserves precision under multi-term catastrophic cancellation', () => {
			const res = addDualSeries(
				{ v: 1e16, d: 1 },
				{ v: 1, d: 1e16 },
				{ v: -1e16, d: -1e16 }
			)
			assert.deepStrictEqual(res, { v: 1, d: 1 })
		})

		it('handles very large and very small finite values', () => {
			const large = addDualSeries({ v: 1e150, d: -1e150 }, { v: 2e150, d: 3e150 })
			assert.strictEqual(large.v, 1e150 + 2e150)
			assert.strictEqual(large.d, -1e150 + 3e150)
			assert.ok(Math.abs(large.v - 3e150) / 3e150 < 1e-15)
			assert.ok(Math.abs(large.d - 2e150) / 2e150 < 1e-15)

			const small = addDualSeries({ v: 1e-150, d: 2e-150 }, { v: 3e-150, d: -1e-150 })
			assert.ok(Math.abs(small.v - 4e-150) <= 1e-165)
			assert.ok(Math.abs(small.d - 1e-150) <= 1e-165)

			const subnormal = addDualSeries(
				{ v: Number.MIN_VALUE, d: Number.MIN_VALUE },
				{ v: Number.MIN_VALUE, d: 0 }
			)
			assert.strictEqual(subnormal.v, 2 * Number.MIN_VALUE)
			assert.strictEqual(subnormal.d, Number.MIN_VALUE)
		})

		it('handles IEEE 754 overflow without producing NaN', () => {
			const overflow = addDualSeries(
				{ v: Number.MAX_VALUE, d: -Number.MAX_VALUE },
				{ v: Number.MAX_VALUE, d: -Number.MAX_VALUE }
			)
			assert.strictEqual(overflow.v, Infinity)
			assert.strictEqual(overflow.d, -Infinity)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when fewer than 2 arguments are provided', () => {
			assert.throws(() => addDualSeries(), TypeError)
			assert.throws(() => addDualSeries({ v: 1, d: 2 }), TypeError)
		})

		it('throws TypeError for non-object, null, or array operands', () => {
			const valid = { v: 1, d: 1 }
			for (const bad of [null, undefined, 42, '1', true, [1, 1], () => {}]) {
				assert.throws(() => addDualSeries(bad, valid), TypeError)
				assert.throws(() => addDualSeries(valid, bad), TypeError)
				assert.throws(() => addDualSeries(valid, valid, bad), TypeError)
			}
		})

		it('throws TypeError for missing or non-numeric v or d fields', () => {
			const valid = { v: 1, d: 2 }
			const invalidObjects = [
				{},
				{ v: 1 },
				{ d: 2 },
				{ v: '1', d: 2 },
				{ v: 1, d: '2' },
				{ v: null, d: 2 },
				{ v: 1, d: undefined },
				{ v: true, d: 0 }
			]
			for (const bad of invalidObjects) {
				assert.throws(() => addDualSeries(bad, valid), TypeError)
				assert.throws(() => addDualSeries(valid, bad), TypeError)
			}
		})

		it('throws TypeError for NaN, Infinity, and -Infinity components', () => {
			const valid = { v: 1, d: 2 }
			for (const badNum of [NaN, Infinity, -Infinity]) {
				assert.throws(() => addDualSeries({ v: badNum, d: 0 }, valid), TypeError)
				assert.throws(() => addDualSeries({ v: 0, d: badNum }, valid), TypeError)
				assert.throws(() => addDualSeries(valid, { v: badNum, d: 0 }), TypeError)
				assert.throws(() => addDualSeries(valid, { v: 0, d: badNum }), TypeError)
				assert.throws(() => addDualSeries(valid, valid, { v: 0, d: badNum }), TypeError)
			}
		})
	})

	describe('independent mathematical cross-checks', () => {
		it('matches central finite-difference derivative of f(x) + g(x) + k(x)', () => {
			// Independent smooth functions with known analytic derivatives
			const f = (x) => Math.sin(x) * x
			const df = (x) => Math.sin(x) + x * Math.cos(x)

			const g = (x) => Math.exp(0.5 * x)
			const dg = (x) => 0.5 * Math.exp(0.5 * x)

			const k = (x) => x ** 3 - 2 * x + 1
			const dk = (x) => 3 * x ** 2 - 2

			const h = 1e-6
			for (const x of [-2.3, -0.5, 0, 0.75, 1.8]) {
				const dualF = { v: f(x), d: df(x) }
				const dualG = { v: g(x), d: dg(x) }
				const dualK = { v: k(x), d: dk(x) }

				// Pairwise check: f(x) + g(x)
				const sumFG = addDualSeries(dualF, dualG)
				const fg = (t) => f(t) + g(t)
				const fdFG = (fg(x + h) - fg(x - h)) / (2 * h)
				assert.ok(Math.abs(sumFG.v - fg(x)) < 1e-12)
				assert.ok(Math.abs(sumFG.d - fdFG) < 1e-8)

				// 3-term check: f(x) + g(x) + k(x)
				const sumFGK = addDualSeries(dualF, dualG, dualK)
				const fgk = (t) => f(t) + g(t) + k(t)
				const fdFGK = (fgk(x + h) - fgk(x - h)) / (2 * h)
				assert.ok(Math.abs(sumFGK.v - fgk(x)) < 1e-12)
				assert.ok(Math.abs(sumFGK.d - fdFGK) < 1e-7)
			}
		})

		it('is isomorphic to 2x2 upper-triangular matrix [[v, d], [0, v]] addition', () => {
			const samples = [
				{ v: 1.5, d: -2.25 },
				{ v: -4.75, d: 3.125 },
				{ v: 0.25, d: 9.5 },
				{ v: 11.0, d: -0.375 }
			]

			// Pairwise matrix isomorphism check
			for (let i = 0; i < samples.length; i++) {
				for (let j = 0; j < samples.length; j++) {
					const dualSum = addDualSeries(samples[i], samples[j])
					const matSum = addMatrices2x2(
						dualToMatrix(samples[i]),
						dualToMatrix(samples[j])
					)
					assert.deepStrictEqual(dualToMatrix(dualSum), matSum)
				}
			}

			// Multi-term matrix isomorphism check
			const multiDualSum = addDualSeries(...samples)
			const multiMatSum = samples
				.map(dualToMatrix)
				.reduce((acc, m) => addMatrices2x2(acc, m))
			assert.deepStrictEqual(dualToMatrix(multiDualSum), multiMatSum)
		})
	})
})
