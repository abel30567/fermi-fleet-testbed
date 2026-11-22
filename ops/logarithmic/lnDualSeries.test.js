import { describe, it } from 'node:test'
import assert from 'node:assert'
import { lnDualSeries } from './lnDualSeries.js'

/**
 * Helper for approximate floating-point equality checks.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol=1e-12]
 */
function assertClose(actual, expected, tol = 1e-12) {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		`Expected ${actual} to be within ${tol} of ${expected} (diff = ${diff})`,
	)
}

/**
 * Multiplies two dual numbers: (a.v + a.d*ε)(b.v + b.d*ε) = a.v*b.v + (a.v*b.d + a.d*b.v)*ε.
 */
function dualMul(a, b) {
	return { v: a.v * b.v, d: a.v * b.d + a.d * b.v }
}

/**
 * Divides two dual numbers: (a.v + a.d*ε) / (b.v + b.d*ε).
 */
function dualDiv(a, b) {
	return { v: a.v / b.v, d: (a.d * b.v - a.v * b.d) / (b.v * b.v) }
}

/**
 * Adds two dual numbers.
 */
function dualAdd(a, b) {
	return { v: a.v + b.v, d: a.d + b.d }
}

/**
 * Subtracts two dual numbers.
 */
function dualSub(a, b) {
	return { v: a.v - b.v, d: a.d - b.d }
}

/**
 * Computes exp of a dual number: exp(v + d*ε) = exp(v) + exp(v)*d*ε.
 */
function dualExp(x) {
	const ev = Math.exp(x.v)
	return { v: ev, d: ev * x.d }
}

describe('lnDualSeries', () => {
	describe('normal cases', () => {
		it('computes ln(v + d*ε) for positive integers and unit derivative', () => {
			const res = lnDualSeries({ v: 2, d: 1 })
			assertClose(res.v, Math.LN2, 1e-15)
			assert.strictEqual(res.d, 0.5)
		})

		it('scales the derivative component linearly by d / v', () => {
			const res = lnDualSeries({ v: 10, d: 5 })
			assertClose(res.v, Math.LN10, 1e-15)
			assert.strictEqual(res.d, 0.5)
		})

		it('handles negative derivative components', () => {
			const res = lnDualSeries({ v: 4, d: -3 })
			assertClose(res.v, Math.log(4), 1e-15)
			assert.strictEqual(res.d, -0.75)
		})

		it('handles zero derivative components (constant values)', () => {
			const res = lnDualSeries({ v: 7.5, d: 0 })
			assertClose(res.v, Math.log(7.5), 1e-15)
			assert.strictEqual(res.d, 0)
		})

		it('handles fractional primal values in (0, 1)', () => {
			const res = lnDualSeries({ v: 0.25, d: 0.5 })
			assertClose(res.v, Math.log(0.25), 1e-15)
			assert.strictEqual(res.d, 2)
		})

		it('propagates the chain rule for composite expressions', () => {
			// f(x) = ln(x^2 + 1) at x = 3 => inner = { v: 10, d: 6 }, f'(3) = 6 / 10 = 0.6
			const x = 3
			const inner = { v: x * x + 1, d: 2 * x }
			const res = lnDualSeries(inner)
			assertClose(res.v, Math.log(10), 1e-15)
			assertClose(res.d, 0.6, 1e-15)
		})

		it('does not mutate the input object and returns a fresh dual object', () => {
			const input = { v: 5, d: 2 }
			const res = lnDualSeries(input)
			assert.notStrictEqual(res, input)
			assert.deepStrictEqual(input, { v: 5, d: 2 })
		})
	})

	describe('edge cases', () => {
		it('handles v = 1 with exact primal value 0', () => {
			const r1 = lnDualSeries({ v: 1, d: 1 })
			assert.strictEqual(r1.v, 0)
			assert.strictEqual(r1.d, 1)

			const r0 = lnDualSeries({ v: 1, d: 0 })
			assert.strictEqual(r0.v, 0)
			assert.strictEqual(r0.d, 0)

			const rNegZero = lnDualSeries({ v: 1, d: -0 })
			assert.strictEqual(rNegZero.v, 0)
			assert.strictEqual(Object.is(rNegZero.d, 0), true)
		})

		it('handles v = Math.E', () => {
			const r1 = lnDualSeries({ v: Math.E, d: Math.E })
			assertClose(r1.v, 1, 1e-15)
			assertClose(r1.d, 1, 1e-15)

			const r2 = lnDualSeries({ v: Math.E, d: 1 })
			assertClose(r2.v, 1, 1e-15)
			assertClose(r2.d, 1 / Math.E, 1e-15)
		})

		it('preserves high accuracy for v very close to 1 via log1p', () => {
			// Use an exact dyadic power of 2 so 1 + delta is represented without rounding.
			const delta = 2 ** -40
			const res = lnDualSeries({ v: 1 + delta, d: 1 })
			// Exact Mercator expansion: ln(1 + delta) = delta - delta^2 / 2 + O(delta^3)
			const expectedV = delta - (delta * delta) / 2
			assertClose(res.v, expectedV, 1e-26)
			assertClose(res.d, 1 / (1 + delta), 1e-15)
		})

		it('handles very small and very large positive primal values', () => {
			const small = lnDualSeries({ v: 1e-100, d: 1e-100 })
			assertClose(small.v, Math.log(1e-100), 1e-12)
			assertClose(small.d, 1, 1e-15)

			const large = lnDualSeries({ v: 1e100, d: 1e100 })
			assertClose(large.v, Math.log(1e100), 1e-12)
			assertClose(large.d, 1, 1e-15)
		})

		it('throws RangeError for v <= 0', () => {
			for (const badV of [0, -0, -1, -1e-300, -1e100]) {
				assert.throws(
					() => lnDualSeries({ v: badV, d: 1 }),
					{ name: 'RangeError' },
					`Expected RangeError for v = ${badV}`,
				)
			}
		})

		it('throws RangeError when d / v overflows to Infinity', () => {
			assert.throws(
				() => lnDualSeries({ v: 1e-308, d: 1e308 }),
				{ name: 'RangeError' },
			)
		})

		it('throws RangeError for non-finite v or d values', () => {
			const nonFiniteCases = [
				{ v: Number.NaN, d: 1 },
				{ v: Number.POSITIVE_INFINITY, d: 1 },
				{ v: Number.NEGATIVE_INFINITY, d: 1 },
				{ v: 2, d: Number.NaN },
				{ v: 2, d: Number.POSITIVE_INFINITY },
				{ v: 2, d: Number.NEGATIVE_INFINITY },
			]
			for (const input of nonFiniteCases) {
				assert.throws(
					() => lnDualSeries(input),
					{ name: 'RangeError' },
					`Expected RangeError for ${JSON.stringify(input)}`,
				)
			}
		})

		it('throws TypeError for invalid non-dual inputs', () => {
			const invalidInputs = [
				null,
				undefined,
				42,
				'1',
				true,
				[1, 2],
				{},
				{ v: 2 },
				{ d: 1 },
				{ v: '2', d: 1 },
				{ v: 2, d: '1' },
				{ v: null, d: 1 },
				{ v: 2, d: undefined },
			]
			for (const input of invalidInputs) {
				assert.throws(
					() => lnDualSeries(input),
					{ name: 'TypeError' },
					`Expected TypeError for ${String(input)}`,
				)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('matches central finite-difference derivatives across points and composite functions', () => {
			const h = 1e-6

			// Direct f(x) = ln(x)
			for (const x of [0.1, 0.5, 1, 2.5, Math.E, 10, 42.7]) {
				const dual = lnDualSeries({ v: x, d: 1 })
				const centralDiff = (Math.log(x + h) - Math.log(x - h)) / (2 * h)
				assertClose(dual.d, centralDiff, 1e-8)
			}

			// Composite g(x) = ln(3*x^2 + 2*x + 1)
			const innerVal = (x) => 3 * x * x + 2 * x + 1
			const innerDeriv = (x) => 6 * x + 2
			for (const x of [-2, 0, 0.75, 3.2]) {
				const dual = lnDualSeries({ v: innerVal(x), d: innerDeriv(x) })
				const centralDiff =
					(Math.log(innerVal(x + h)) - Math.log(innerVal(x - h))) / (2 * h)
				assertClose(dual.v, Math.log(innerVal(x)), 1e-15)
				assertClose(dual.d, centralDiff, 1e-8)
			}
		})

		it('satisfies the dual logarithm product identity ln(a * b) = ln(a) + ln(b)', () => {
			const pairs = [
				[{ v: 2, d: 3 }, { v: 5, d: -1 }],
				[{ v: 0.4, d: 0.25 }, { v: 7.2, d: 1.8 }],
				[{ v: Math.E, d: 1 }, { v: Math.PI, d: -0.5 }],
			]

			for (const [a, b] of pairs) {
				const lhs = lnDualSeries(dualMul(a, b))
				const rhs = dualAdd(lnDualSeries(a), lnDualSeries(b))
				assertClose(lhs.v, rhs.v, 1e-14)
				assertClose(lhs.d, rhs.d, 1e-14)
			}
		})

		it('satisfies the dual logarithm quotient identity ln(a / b) = ln(a) - ln(b)', () => {
			const a = { v: 6.4, d: -2.1 }
			const b = { v: 1.6, d: 0.9 }
			const lhs = lnDualSeries(dualDiv(a, b))
			const rhs = dualSub(lnDualSeries(a), lnDualSeries(b))
			assertClose(lhs.v, rhs.v, 1e-14)
			assertClose(lhs.d, rhs.d, 1e-14)
		})

		it('acts as the inverse of the dual exponential: exp(ln(x)) = x', () => {
			const samples = [
				{ v: 0.2, d: -0.7 },
				{ v: 1, d: 3.5 },
				{ v: 4.2, d: 1.3 },
			]

			for (const x of samples) {
				const roundTrip = dualExp(lnDualSeries(x))
				assertClose(roundTrip.v, x.v, 1e-14)
				assertClose(roundTrip.d, x.d, 1e-14)
			}
		})
	})
})
