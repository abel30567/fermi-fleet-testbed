import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { cbrtDualSeries } from './cbrtDualSeries.js'

function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-12, msg = '') {
	const diff = Math.abs(actual - expected)
	const limit = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= limit,
		`${msg ? msg + ': ' : ''}expected ${actual} to be within ${limit} of ${expected} (diff=${diff})`
	)
}

/**
 * Dual number multiplication helper for independent identity verification.
 */
function dualMul(a, b) {
	return { v: a.v * b.v, d: a.v * b.d + a.d * b.v }
}

function dualCube(a) {
	return dualMul(dualMul(a, a), a)
}

describe('cbrtDualSeries', () => {
	test('exact positive cubes and fractional inputs', () => {
		const r1 = cbrtDualSeries({ v: 8, d: 1 })
		assertClose(r1.v, 2)
		assertClose(r1.d, 1 / 12)

		const r2 = cbrtDualSeries({ v: 27, d: 6 })
		assertClose(r2.v, 3)
		assertClose(r2.d, 2 / 9)

		const r3 = cbrtDualSeries({ v: 1, d: 3 })
		assertClose(r3.v, 1)
		assertClose(r3.d, 1)

		const r4 = cbrtDualSeries({ v: 0.125, d: 1 })
		assertClose(r4.v, 0.5)
		assertClose(r4.d, 4 / 3)
	})

	test('negative values preserve real cube root and positive derivative sign', () => {
		const r1 = cbrtDualSeries({ v: -8, d: 1 })
		assertClose(r1.v, -2)
		assertClose(r1.d, 1 / 12)

		const r2 = cbrtDualSeries({ v: -27, d: -9 })
		assertClose(r2.v, -3)
		assertClose(r2.d, -1 / 3)

		const r3 = cbrtDualSeries({ v: -1, d: 1 })
		assertClose(r3.v, -1)
		assertClose(r3.d, 1 / 3)
	})

	test('constant dual numbers (d = 0) yield zero derivative without -0', () => {
		const r1 = cbrtDualSeries({ v: 8, d: 0 })
		assert.equal(r1.v, 2)
		assert.ok(Object.is(r1.d, 0))

		const r2 = cbrtDualSeries({ v: -27, d: -0 })
		assert.equal(r2.v, -3)
		assert.ok(Object.is(r2.d, 0))
	})

	test('does not mutate input object', () => {
		const input = Object.freeze({ v: 64, d: 5 })
		const res = cbrtDualSeries(input)
		assertClose(res.v, 4)
		assertClose(res.d, 5 / 48)
	})

	test('zero edge cases: constant zero succeeds, non-zero tangent throws RangeError', () => {
		const z1 = cbrtDualSeries({ v: 0, d: 0 })
		assert.ok(Object.is(z1.v, 0))
		assert.ok(Object.is(z1.d, 0))

		const z2 = cbrtDualSeries({ v: -0, d: -0 })
		assert.ok(Object.is(z2.v, 0))
		assert.ok(Object.is(z2.d, 0))

		assert.throws(() => cbrtDualSeries({ v: 0, d: 1 }), RangeError)
		assert.throws(() => cbrtDualSeries({ v: 0, d: -1e-12 }), RangeError)
	})

	test('extreme magnitudes avoid intermediate overflow/underflow and detect derivative overflow', () => {
		const large = cbrtDualSeries({ v: 1e300, d: 1 })
		assertClose(large.v, 1e100, 1e-12)
		assertClose(large.d, 1 / (3 * 1e200), 1e-12, 0)

		const small = cbrtDualSeries({ v: 1e-300, d: 1 })
		assertClose(small.v, 1e-100, 1e-12, 0)
		assertClose(small.d, 1 / (3 * 1e-200), 1e-12, 0)

		assert.throws(() => cbrtDualSeries({ v: 1e-300, d: 1e200 }), RangeError)
	})

	test('input validation rejects invalid types and non-finite components', () => {
		for (const bad of [null, undefined, 8, '8', true, [8, 1], {}, { v: 8 }, { d: 1 }, { v: '8', d: 1 }, { v: 8, d: '1' }]) {
			assert.throws(() => cbrtDualSeries(bad), TypeError, `expected TypeError for ${JSON.stringify(bad)}`)
		}

		for (const nonFinite of [
			{ v: NaN, d: 1 },
			{ v: 1, d: NaN },
			{ v: Infinity, d: 1 },
			{ v: -Infinity, d: 1 },
			{ v: 1, d: Infinity },
			{ v: 1, d: -Infinity }
		]) {
			assert.throws(() => cbrtDualSeries(nonFinite), RangeError)
		}
	})

	test('cross-check: algebraic dual-number cubing identity (cbrt(x))^3 === x', () => {
		const samples = [
			{ v: 0.001, d: 0.5 },
			{ v: 0.37, d: -2.1 },
			{ v: 2, d: 1 },
			{ v: 17.5, d: 3.25 },
			{ v: -0.04, d: 4.5 },
			{ v: -13.7, d: -1.8 },
			{ v: 1e12, d: -1e6 },
			{ v: -1e-9, d: 1e-6 }
		]

		for (const x of samples) {
			const y = cbrtDualSeries(x)
			const cubed = dualCube(y)
			assertClose(cubed.v, x.v, 1e-12, 1e-15, `value identity for v=${x.v}`)
			assertClose(cubed.d, x.d, 1e-12, 1e-15, `derivative identity for v=${x.v}, d=${x.d}`)
		}
	})

	test('cross-check: central finite-difference derivative verification', () => {
		const cases = [
			{ v: -100, d: 2.3 },
			{ v: -5.2, d: -1.7 },
			{ v: -0.3, d: 0.9 },
			{ v: 0.25, d: 1.5 },
			{ v: 2, d: 1 },
			{ v: 17.3, d: -4.2 },
			{ v: 1000, d: 12.5 }
		]

		for (const { v, d } of cases) {
			const res = cbrtDualSeries({ v, d })
			const h = 1e-6 * Math.max(1, Math.abs(v)) / Math.max(1, Math.abs(d))
			const fd = (Math.cbrt(v + h * d) - Math.cbrt(v - h * d)) / (2 * h)
			assertClose(res.d, fd, 1e-7, 1e-9, `finite-difference check at v=${v}, d=${d}`)
		}
	})

	test('cross-check: chain rule composition and odd symmetry', () => {
		// Compose with g(t) = t^2 + 3t + 1, g'(t) = 2t + 3
		for (const t of [-4, -1.5, 0, 2.5, 7]) {
			const g = t * t + 3 * t + 1
			const gp = 2 * t + 3
			const res = cbrtDualSeries({ v: g, d: gp })

			const h = 1e-6
			const fPlus = Math.cbrt((t + h) ** 2 + 3 * (t + h) + 1)
			const fMinus = Math.cbrt((t - h) ** 2 + 3 * (t - h) + 1)
			const fd = (fPlus - fMinus) / (2 * h)

			assertClose(res.v, Math.cbrt(g), 1e-12)
			assertClose(res.d, fd, 1e-7, 1e-9, `chain rule check at t=${t}`)
		}

		// Odd symmetry: cbrt(-v + d*eps) has negated value and identical derivative to cbrt(v + d*eps)
		const pos = cbrtDualSeries({ v: 5.5, d: 2.2 })
		const neg = cbrtDualSeries({ v: -5.5, d: 2.2 })
		assertClose(neg.v, -pos.v, 1e-15)
		assertClose(neg.d, pos.d, 1e-15)

		// Multiplicative identity in dual numbers: cbrt(a * x) = cbrt(a) * cbrt(x)
		const a = { v: 3.5, d: -0.7 }
		const b = { v: -2.4, d: 1.3 }
		const lhs = cbrtDualSeries(dualMul(a, b))
		const rhs = dualMul(cbrtDualSeries(a), cbrtDualSeries(b))
		assertClose(lhs.v, rhs.v, 1e-12)
		assertClose(lhs.d, rhs.d, 1e-12)
	})
})
