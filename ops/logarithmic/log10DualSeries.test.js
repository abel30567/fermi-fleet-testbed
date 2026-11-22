import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { log10DualSeries } from './log10DualSeries.js'

/**
 * Helper to assert two numbers are within a relative/absolute tolerance.
 */
function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-15) {
	const diff = Math.abs(actual - expected)
	const limit = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= limit,
		`Expected ${actual} to be close to ${expected} (diff=${diff}, limit=${limit})`,
	)
}

describe('log10DualSeries', () => {
	test('evaluates powers of 10 and standard positive dual numbers', () => {
		const res10 = log10DualSeries({ v: 10, d: 1 })
		assert.equal(res10.v, 1)
		assertClose(res10.d, 1 / (10 * Math.LN10))

		const res100 = log10DualSeries({ v: 100, d: 2 })
		assert.equal(res100.v, 2)
		assertClose(res100.d, 2 / (100 * Math.LN10))

		const resTenth = log10DualSeries({ v: 0.1, d: -3 })
		assertClose(resTenth.v, -1)
		assertClose(resTenth.d, -3 / (0.1 * Math.LN10))

		const resE = log10DualSeries({ v: Math.E, d: Math.E })
		assertClose(resE.v, Math.LOG10E)
		assertClose(resE.d, Math.LOG10E)
	})

	test('handles zero and negative derivative components', () => {
		const zeroDeriv = log10DualSeries({ v: 42, d: 0 })
		assert.equal(zeroDeriv.v, Math.log10(42))
		assert.equal(zeroDeriv.d, 0)

		const negDeriv = log10DualSeries({ v: 5.5, d: -1.25 })
		assertClose(negDeriv.v, Math.log10(5.5))
		assertClose(negDeriv.d, -1.25 / (5.5 * Math.LN10))
	})

	test('evaluates chain rule composition for f(x) = log10(x^2 + 1)', () => {
		const x = 3
		// Seed dual for u(x) = x^2 + 1 at x = 3: u = 10, u' = 2x = 6
		const res = log10DualSeries({ v: x * x + 1, d: 2 * x })
		assert.equal(res.v, 1)
		assertClose(res.d, (2 * x) / ((x * x + 1) * Math.LN10))
	})

	test('handles edge cases: v = 1, very small positive v, and very large positive v', () => {
		// v = 1
		const atOne = log10DualSeries({ v: 1, d: 1 })
		assert.equal(atOne.v, 0)
		assertClose(atOne.d, Math.LOG10E)

		const atOneZero = log10DualSeries({ v: 1, d: 0 })
		assert.equal(atOneZero.v, 0)
		assert.equal(atOneZero.d, 0)

		// Very small positive v
		const tiny = log10DualSeries({ v: 1e-300, d: 1e-300 })
		assertClose(tiny.v, -300)
		assertClose(tiny.d, Math.LOG10E)

		const subnormal = log10DualSeries({ v: Number.MIN_VALUE, d: Number.MIN_VALUE })
		assertClose(subnormal.v, Math.log10(Number.MIN_VALUE))
		assertClose(subnormal.d, Math.LOG10E)

		// Very large positive v (v * Math.LN10 would overflow Number.MAX_VALUE)
		const huge = log10DualSeries({ v: Number.MAX_VALUE, d: Number.MAX_VALUE })
		assertClose(huge.v, Math.log10(Number.MAX_VALUE))
		assertClose(huge.d, Math.LOG10E)

		const hugeUnit = log10DualSeries({ v: Number.MAX_VALUE, d: 1 })
		assertClose(hugeUnit.v, Math.log10(Number.MAX_VALUE))
		assert.ok(hugeUnit.d > 0 && Number.isFinite(hugeUnit.d))

		// Intermediate d / v overflows, but d / (v * Math.LN10) is finite
		const nearOverflow = log10DualSeries({ v: 1e-300, d: 2e8 })
		assertClose(nearOverflow.v, -300)
		assertClose(nearOverflow.d, (2e8 / Math.LN10) / 1e-300)
	})

	test('throws RangeError for non-positive v (v <= 0)', () => {
		for (const v of [0, -0, -1, -1e-300, -Number.MAX_VALUE]) {
			assert.throws(
				() => log10DualSeries({ v, d: 1 }),
				RangeError,
				`Expected RangeError for v=${v}`,
			)
		}
	})

	test('throws TypeError or RangeError for invalid inputs', () => {
		// Invalid container types
		for (const bad of [null, undefined, 10, '10', true, [10, 1], () => {}]) {
			assert.throws(() => log10DualSeries(bad), TypeError)
		}

		// Missing or non-number fields
		for (const bad of [{}, { v: 10 }, { d: 1 }, { v: '10', d: 1 }, { v: 10, d: null }]) {
			assert.throws(() => log10DualSeries(bad), TypeError)
		}

		// Non-finite numbers
		for (const bad of [
			{ v: Number.NaN, d: 1 },
			{ v: 1, d: Number.NaN },
			{ v: Number.POSITIVE_INFINITY, d: 1 },
			{ v: Number.NEGATIVE_INFINITY, d: 1 },
			{ v: 1, d: Number.POSITIVE_INFINITY },
			{ v: 1, d: Number.NEGATIVE_INFINITY },
		]) {
			assert.throws(() => log10DualSeries(bad), RangeError)
		}
	})

	test('cross-check: matches central finite-difference derivatives', () => {
		const cases = [
			{ v: 0.25, d: 1.5 },
			{ v: 1, d: -2.3 },
			{ v: 3.7, d: 0.8 },
			{ v: 125.4, d: -11.2 },
		]

		for (const { v, d } of cases) {
			const h = 1e-7 * Math.max(1, Math.abs(v))
			const numericDeriv = (Math.log10(v + h * d) - Math.log10(v - h * d)) / (2 * h)
			const dual = log10DualSeries({ v, d })
			assertClose(dual.v, Math.log10(v))
			assertClose(dual.d, numericDeriv, 1e-7, 1e-9)
		}
	})

	test('cross-check: satisfies log10 product, quotient, and inverse identities in dual arithmetic', () => {
		const a = { v: 3.5, d: 1.2 }
		const b = { v: 7.25, d: -0.9 }

		// Product rule: log10(a * b) = log10(a) + log10(b)
		const prod = { v: a.v * b.v, d: a.v * b.d + a.d * b.v }
		const logProd = log10DualSeries(prod)
		const logA = log10DualSeries(a)
		const logB = log10DualSeries(b)
		assertClose(logProd.v, logA.v + logB.v)
		assertClose(logProd.d, logA.d + logB.d)

		// Quotient rule: log10(a / b) = log10(a) - log10(b)
		const quot = { v: a.v / b.v, d: (a.d * b.v - a.v * b.d) / (b.v * b.v) }
		const logQuot = log10DualSeries(quot)
		assertClose(logQuot.v, logA.v - logB.v)
		assertClose(logQuot.d, logA.d - logB.d)

		// Inverse identity: 10^(log10(a)) = a in dual arithmetic
		const pow10Val = 10 ** logA.v
		const recovered = { v: pow10Val, d: pow10Val * Math.LN10 * logA.d }
		assertClose(recovered.v, a.v)
		assertClose(recovered.d, a.d)

		// Change-of-base identity: log10(a) = ln(a) / ln(10)
		const lnA = { v: Math.log(a.v), d: a.d / a.v }
		assertClose(logA.v, lnA.v / Math.LN10)
		assertClose(logA.d, lnA.d / Math.LN10)
	})
})
