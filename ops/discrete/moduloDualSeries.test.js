import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { moduloDualSeries } from './moduloDualSeries.js'

/**
 * Scalar floored modulo for independent finite-difference verification.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function flooredMod(a, b) {
	return a - b * Math.floor(a / b)
}

/**
 * Helper to assert two numbers are within an absolute tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol=1e-9]
 */
function assertClose(actual, expected, tol = 1e-9) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`Expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`,
	)
}

describe('moduloDualSeries', () => {
	it('computes floored modulo and derivative for positive dividend and divisor', () => {
		const res = moduloDualSeries({ v: 7.5, d: 1 }, { v: 3, d: 0 })
		assert.deepStrictEqual(res, { v: 1.5, d: 1 })

		const resVaryingDivisor = moduloDualSeries({ v: 10.25, d: 2 }, { v: 3, d: 0.5 })
		// q = floor(10.25 / 3) = 3 => v = 1.25, d = 2 - 3 * 0.5 = 0.5
		assert.deepStrictEqual(resVaryingDivisor, { v: 1.25, d: 0.5 })
	})

	it('handles negative dividends with positive divisors (floored convention)', () => {
		// q = floor(-7.5 / 3) = -3 => v = -7.5 - 3*(-3) = 1.5, d = 2 - (-3)*0.5 = 3.5
		const res = moduloDualSeries({ v: -7.5, d: 2 }, { v: 3, d: 0.5 })
		assert.deepStrictEqual(res, { v: 1.5, d: 3.5 })
		assert.ok(res.v >= 0 && res.v < 3)
	})

	it('handles positive dividends with negative divisors (floored convention)', () => {
		// q = floor(7.5 / -3) = -3 => v = 7.5 - (-3)*(-3) = -1.5, d = 1.2 - (-3)*0.4 = 2.4
		const res = moduloDualSeries({ v: 7.5, d: 1.2 }, { v: -3, d: 0.4 })
		assertClose(res.v, -1.5, 1e-12)
		assertClose(res.d, 2.4, 1e-12)
		assert.ok(res.v <= 0 && res.v > -3)
	})

	it('handles negative dividends with negative divisors', () => {
		// q = floor(-7.5 / -3) = 2 => v = -7.5 - (-3)*2 = -1.5, d = -1 - 2*2 = -5
		const res = moduloDualSeries({ v: -7.5, d: -1 }, { v: -3, d: 2 })
		assert.deepStrictEqual(res, { v: -1.5, d: -5 })
	})

	it('handles exact integer multiples consistently using the right-continuous branch and normalizes -0', () => {
		const res = moduloDualSeries({ v: 6, d: 1 }, { v: 3, d: 0.5 })
		assert.deepStrictEqual(res, { v: 0, d: 0 })
		assert.ok(!Object.is(res.v, -0))
		assert.ok(!Object.is(res.d, -0))

		const resZeroDividend = moduloDualSeries({ v: -0, d: -0 }, { v: 5, d: 2 })
		assert.deepStrictEqual(resZeroDividend, { v: 0, d: 0 })
		assert.ok(!Object.is(resZeroDividend.v, -0))
		assert.ok(!Object.is(resZeroDividend.d, -0))

		const resNegMultiple = moduloDualSeries({ v: -6, d: 3 }, { v: 3, d: 1 })
		// q = -2 => v = 0, d = 3 - (-2)*1 = 5
		assert.deepStrictEqual(resNegMultiple, { v: 0, d: 5 })
	})

	it('throws RangeError when divisor b.v is zero (including -0)', () => {
		assert.throws(() => moduloDualSeries({ v: 5, d: 1 }, { v: 0, d: 1 }), RangeError)
		assert.throws(() => moduloDualSeries({ v: 5, d: 1 }, { v: -0, d: 0 }), RangeError)
	})

	it('throws RangeError on non-finite inputs (NaN, Infinity, -Infinity)', () => {
		const nonFiniteValues = [NaN, Infinity, -Infinity]
		for (const bad of nonFiniteValues) {
			assert.throws(() => moduloDualSeries({ v: bad, d: 0 }, { v: 2, d: 0 }), RangeError)
			assert.throws(() => moduloDualSeries({ v: 2, d: bad }, { v: 2, d: 0 }), RangeError)
			assert.throws(() => moduloDualSeries({ v: 2, d: 0 }, { v: bad, d: 0 }), RangeError)
			assert.throws(() => moduloDualSeries({ v: 2, d: 0 }, { v: 2, d: bad }), RangeError)
		}
	})

	it('throws RangeError when quotient or derivative overflows to non-finite', () => {
		assert.throws(() => moduloDualSeries({ v: 1e308, d: 0 }, { v: 1e-308, d: 0 }), RangeError)
		assert.throws(() => moduloDualSeries({ v: 1e200, d: 0 }, { v: 1e-100, d: 1e100 }), RangeError)
	})

	it('throws TypeError on invalid dual number inputs', () => {
		assert.throws(() => moduloDualSeries(null, { v: 2, d: 0 }), TypeError)
		assert.throws(() => moduloDualSeries({ v: 2, d: 0 }, undefined), TypeError)
		assert.throws(() => moduloDualSeries(5, { v: 2, d: 0 }), TypeError)
		assert.throws(() => moduloDualSeries({ v: '5', d: 0 }, { v: 2, d: 0 }), TypeError)
		assert.throws(() => moduloDualSeries({ v: 5 }, { v: 2, d: 0 }), TypeError)
		assert.throws(() => moduloDualSeries({ v: 5, d: 1 }, { v: 2, d: null }), TypeError)
	})

	it('cross-checks derivative against central finite differences away from jump discontinuities', () => {
		const cases = [
			{ a: { v: 11.3, d: 1.7 }, b: { v: 2.5, d: -0.6 } },
			{ a: { v: -13.4, d: -0.9 }, b: { v: 4.1, d: 1.3 } },
			{ a: { v: 9.8, d: 0.4 }, b: { v: -3.7, d: 2.2 } },
			{ a: { v: -8.6, d: 3.1 }, b: { v: -2.9, d: -1.5 } },
			{ a: { v: 0.73, d: -2.5 }, b: { v: 1.9, d: 0.8 } },
		]

		const h = 1e-6
		for (const { a, b } of cases) {
			const res = moduloDualSeries(a, b)
			const fPlus = flooredMod(a.v + h * a.d, b.v + h * b.d)
			const fMinus = flooredMod(a.v - h * a.d, b.v - h * b.d)
			const numericDeriv = (fPlus - fMinus) / (2 * h)

			assertClose(res.v, flooredMod(a.v, b.v), 1e-12)
			assertClose(res.d, numericDeriv, 1e-7)
		}
	})

	it('satisfies the dual-arithmetic division identity (a mod b) + b * q === a', () => {
		const cases = [
			{ a: { v: 17.25, d: 2.5 }, b: { v: 4.5, d: -1.25 } },
			{ a: { v: -17.25, d: -0.75 }, b: { v: 4.5, d: 1.5 } },
			{ a: { v: 17.25, d: 3.1 }, b: { v: -4.5, d: 0.8 } },
			{ a: { v: -17.25, d: 1.2 }, b: { v: -4.5, d: -2.4 } },
			{ a: { v: 12, d: 5 }, b: { v: 4, d: 1.5 } },
			{ a: { v: 0, d: -3 }, b: { v: 7, d: 2 } },
		]

		for (const { a, b } of cases) {
			const r = moduloDualSeries(a, b)
			const q = { v: Math.floor(a.v / b.v), d: 0 }
			// Dual multiplication: b * q = { v: b.v * q.v, d: b.d * q.v + b.v * q.d }
			const bq = {
				v: b.v * q.v,
				d: b.d * q.v + b.v * q.d,
			}
			// Dual addition: r + b * q
			const reconstructed = {
				v: r.v + bq.v,
				d: r.d + bq.d,
			}

			assertClose(reconstructed.v, a.v, 1e-12)
			assertClose(reconstructed.d, a.d, 1e-12)
		}
	})
})
