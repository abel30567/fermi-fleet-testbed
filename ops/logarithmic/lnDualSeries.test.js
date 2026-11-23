import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { lnDualSeries } from './lnDualSeries.js'

function assertClose(actual, expected, tol = 1e-13, label = '') {
	const scale = Math.max(1, Math.abs(expected))
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol * scale,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`
	)
}

function dualMul(a, b) {
	return { v: a.v * b.v, d: a.v * b.d + a.d * b.v }
}

function dualDiv(a, b) {
	return { v: a.v / b.v, d: (a.d * b.v - a.v * b.d) / (b.v * b.v) }
}

function dualExp(a) {
	const ev = Math.exp(a.v)
	return { v: ev, d: ev * a.d }
}

describe('lnDualSeries', () => {
	test('evaluates known exact and standard values', () => {
		const atOne = lnDualSeries({ v: 1, d: 1 })
		assert.equal(atOne.v, 0)
		assert.equal(atOne.d, 1)

		const atOneZeroDeriv = lnDualSeries({ v: 1, d: 0 })
		assert.equal(Object.is(atOneZeroDeriv.v, 0), true)
		assert.equal(Object.is(atOneZeroDeriv.d, 0), true)

		const atE = lnDualSeries({ v: Math.E, d: 1 })
		assertClose(atE.v, 1, 1e-15, 'ln(e) primal')
		assertClose(atE.d, 1 / Math.E, 1e-15, 'ln(e) dual')

		const atTwo = lnDualSeries({ v: 2, d: 3 })
		assertClose(atTwo.v, Math.LN2, 1e-15, 'ln(2) primal')
		assertClose(atTwo.d, 1.5, 1e-15, 'ln(2) dual')

		const atTen = lnDualSeries({ v: 10, d: -5 })
		assertClose(atTen.v, Math.LN10, 1e-15, 'ln(10) primal')
		assertClose(atTen.d, -0.5, 1e-15, 'ln(10) dual')
	})

	test('handles fractional values, near-1 values, and range-reduction boundaries', () => {
		const samples = [
			{ v: 0.5, d: 2 },
			{ v: 0.25, d: -0.75 },
			{ v: 1 / Math.E, d: 1 },
			{ v: 1 + 1e-12, d: 1 },
			{ v: 1 - 1e-12, d: -1 },
			{ v: Math.SQRT2 - 1e-9, d: 1 },
			{ v: Math.SQRT2 + 1e-9, d: 1 },
			{ v: Math.SQRT1_2 - 1e-9, d: 1 },
			{ v: Math.SQRT1_2 + 1e-9, d: 1 },
		]

		for (const x of samples) {
			const res = lnDualSeries(x)
			assertClose(res.v, Math.log(x.v), 1e-14, `primal at v=${x.v}`)
			assertClose(res.d, x.d / x.v, 1e-14, `dual at v=${x.v}`)
		}
	})

	test('handles extreme magnitudes including subnormals and Number.MAX_VALUE', () => {
		const extremes = [
			{ v: Number.MIN_VALUE, d: Number.MIN_VALUE },
			{ v: 1e-315, d: 2e-315 },
			{ v: 1e-300, d: 3e-300 },
			{ v: 1e-100, d: -1e-100 },
			{ v: 1e100, d: 5e99 },
			{ v: 1e300, d: -2e300 },
			{ v: Number.MAX_VALUE, d: Number.MAX_VALUE },
		]

		for (const x of extremes) {
			const res = lnDualSeries(x)
			assertClose(res.v, Math.log(x.v), 1e-14, `extreme primal v=${x.v}`)
			assertClose(res.d, x.d / x.v, 1e-14, `extreme dual v=${x.v}`)
		}
	})

	test('normalizes -0 derivative to +0', () => {
		const res = lnDualSeries({ v: 2, d: -0 })
		assert.equal(Object.is(res.d, 0), true)
	})

	test('validates input types and domain constraints', () => {
		for (const bad of [null, undefined, 42, '2', true, [2, 1], {}, { v: 2 }, { d: 1 }, { v: '2', d: 1 }, { v: 2, d: '1' }]) {
			assert.throws(() => lnDualSeries(bad), TypeError)
		}

		for (const outOfRange of [
			{ v: 0, d: 1 },
			{ v: -0, d: 1 },
			{ v: -1, d: 1 },
			{ v: -1e-300, d: 1 },
			{ v: Number.NaN, d: 1 },
			{ v: 1, d: Number.NaN },
			{ v: Number.POSITIVE_INFINITY, d: 1 },
			{ v: Number.NEGATIVE_INFINITY, d: 1 },
			{ v: 1, d: Number.POSITIVE_INFINITY },
			{ v: 1, d: Number.NEGATIVE_INFINITY },
		]) {
			assert.throws(() => lnDualSeries(outOfRange), RangeError)
		}
	})

	test('cross-check: central finite-difference derivative agreement', () => {
		const cases = [
			{ v: 0.15, d: 0.8 },
			{ v: 0.73, d: -1.4 },
			{ v: 1.0, d: 2.5 },
			{ v: 3.14159265, d: 1.7 },
			{ v: 42.5, d: -11.3 },
			{ v: 1234.5, d: 0.4 },
		]

		for (const { v, d } of cases) {
			const res = lnDualSeries({ v, d })
			const h = 1e-6 * v
			// Directional derivative along d: (ln(v + h*d) - ln(v - h*d)) / (2*h)
			const fdMath = (Math.log(v + h * d) - Math.log(v - h * d)) / (2 * h)
			const fdSelf = (lnDualSeries({ v: v + h * d, d: 0 }).v - lnDualSeries({ v: v - h * d, d: 0 }).v) / (2 * h)
			assertClose(res.d, fdMath, 1e-8, `FD vs Math.log at v=${v}`)
			assertClose(res.d, fdSelf, 1e-8, `FD vs lnDualSeries at v=${v}`)
		}
	})

	test('cross-check: dual-number algebraic identities (product, quotient, power, inverse)', () => {
		const a = { v: 2.75, d: 1.3 }
		const b = { v: 4.2, d: -0.9 }

		const lnA = lnDualSeries(a)
		const lnB = lnDualSeries(b)

		// Product rule: ln(a * b) = ln(a) + ln(b)
		const lnProd = lnDualSeries(dualMul(a, b))
		assertClose(lnProd.v, lnA.v + lnB.v, 1e-14, 'product identity primal')
		assertClose(lnProd.d, lnA.d + lnB.d, 1e-14, 'product identity dual')

		// Quotient rule: ln(a / b) = ln(a) - ln(b)
		const lnQuot = lnDualSeries(dualDiv(a, b))
		assertClose(lnQuot.v, lnA.v - lnB.v, 1e-14, 'quotient identity primal')
		assertClose(lnQuot.d, lnA.d - lnB.d, 1e-14, 'quotient identity dual')

		// Power rule: ln(a^3) = 3 * ln(a)
		const a3 = dualMul(dualMul(a, a), a)
		const lnA3 = lnDualSeries(a3)
		assertClose(lnA3.v, 3 * lnA.v, 1e-14, 'power identity primal')
		assertClose(lnA3.d, 3 * lnA.d, 1e-14, 'power identity dual')

		// Inverse identity: exp(ln(a)) = a
		const roundTrip = dualExp(lnA)
		assertClose(roundTrip.v, a.v, 1e-14, 'exp(ln(a)) primal')
		assertClose(roundTrip.d, a.d, 1e-14, 'exp(ln(a)) dual')

		// Chain rule composition: f(t) = ln(t^2 + 1) at t = 3 -> f'(t) = 2t / (t^2 + 1)
		const t = 3
		const g = { v: t * t + 1, d: 2 * t }
		const fg = lnDualSeries(g)
		assertClose(fg.v, Math.log(10), 1e-14, 'chain rule primal')
		assertClose(fg.d, (2 * t) / (t * t + 1), 1e-14, 'chain rule dual')
	})
})
