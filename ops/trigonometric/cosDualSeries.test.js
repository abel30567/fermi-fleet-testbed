import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { cosDualSeries } from './cosDualSeries.js'

const assertClose = (actual, expected, tol = 1e-14, label = '') => {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`
	)
}

describe('cosDualSeries', () => {
	test('cardinal angles and standard values', () => {
		const at0 = cosDualSeries({ v: 0, d: 1 })
		assert.equal(at0.v, 1)
		assert.equal(at0.d, 0)
		assert.ok(Object.is(at0.d, 0), 'derivative at 0 should be +0, not -0')

		const atHalfPi = cosDualSeries({ v: Math.PI / 2, d: 1 })
		assertClose(atHalfPi.v, 0, 1e-15, 'cos(pi/2)')
		assertClose(atHalfPi.d, -1, 1e-15, 'd/dx cos(pi/2)')

		const atPi = cosDualSeries({ v: Math.PI, d: 1 })
		assertClose(atPi.v, -1, 1e-15, 'cos(pi)')
		assertClose(atPi.d, 0, 1e-15, 'd/dx cos(pi)')

		const atThreeHalfPi = cosDualSeries({ v: (3 * Math.PI) / 2, d: 1 })
		assertClose(atThreeHalfPi.v, 0, 1e-15, 'cos(3pi/2)')
		assertClose(atThreeHalfPi.d, 1, 1e-15, 'd/dx cos(3pi/2)')

		const atTwoPi = cosDualSeries({ v: 2 * Math.PI, d: 1 })
		assertClose(atTwoPi.v, 1, 1e-15, 'cos(2pi)')
		assertClose(atTwoPi.d, 0, 1e-15, 'd/dx cos(2pi)')
	})

	test('angles across all four quadrants with arbitrary derivative components', () => {
		const cases = [
			{ v: Math.PI / 6, d: 2.5 },
			{ v: Math.PI / 4, d: -3 },
			{ v: (2 * Math.PI) / 3, d: 0.75 },
			{ v: (5 * Math.PI) / 4, d: -1.25 },
			{ v: (7 * Math.PI) / 4, d: 4.2 },
			{ v: -Math.PI / 3, d: 1.5 },
			{ v: -2.7, d: -0.4 },
			{ v: 11.3, d: 3.1 },
		]

		for (const input of cases) {
			const res = cosDualSeries(input)
			assertClose(res.v, Math.cos(input.v), 1e-14, `v for ${input.v}`)
			assertClose(res.d, -Math.sin(input.v) * input.d, 1e-14, `d for ${input.v}`)
		}
	})

	test('edge cases: zero derivative, negative zero, tiny and large angles, immutability', () => {
		const input = Object.freeze({ v: 1.23, d: 0 })
		const resZeroD = cosDualSeries(input)
		assertClose(resZeroD.v, Math.cos(1.23), 1e-15)
		assert.ok(Object.is(resZeroD.d, 0), 'zero derivative must produce +0')

		const resNegZero = cosDualSeries({ v: -0, d: -0 })
		assert.equal(resNegZero.v, 1)
		assert.ok(Object.is(resNegZero.d, 0))

		const tiny = cosDualSeries({ v: 1e-12, d: 2 })
		assertClose(tiny.v, 1, 1e-15)
		assertClose(tiny.d, -2e-12, 1e-24)

		for (const largeV of [1e5, -1e5, 9.99e5, 1e9, -1e9]) {
			const res = cosDualSeries({ v: largeV, d: 1.5 })
			assertClose(res.v, Math.cos(largeV), 1e-12, `large v=${largeV}`)
			assertClose(res.d, -Math.sin(largeV) * 1.5, 1e-12, `large d at v=${largeV}`)
		}
	})

	test('input validation rejects invalid types and non-finite numbers', () => {
		for (const bad of [null, undefined, 0, '0', true, [], [0, 1], () => {}]) {
			assert.throws(() => cosDualSeries(bad), TypeError)
		}

		for (const badProps of [
			{},
			{ v: 0 },
			{ d: 1 },
			{ v: '0', d: 1 },
			{ v: 0, d: '1' },
			{ v: null, d: 1 },
		]) {
			assert.throws(() => cosDualSeries(badProps), TypeError)
		}

		for (const nonFinite of [
			{ v: Number.NaN, d: 1 },
			{ v: 0, d: Number.NaN },
			{ v: Number.POSITIVE_INFINITY, d: 1 },
			{ v: Number.NEGATIVE_INFINITY, d: 1 },
			{ v: 0, d: Number.POSITIVE_INFINITY },
			{ v: 0, d: Number.NEGATIVE_INFINITY },
		]) {
			assert.throws(() => cosDualSeries(nonFinite), RangeError)
		}
	})

	test('cross-check: central finite-difference derivative verification', () => {
		const h = 1e-6
		const points = [-5.2, -1.7, -0.3, 0, 0.45, 1.1, 2.8, 6.0]

		for (const v of points) {
			const dual = cosDualSeries({ v, d: 1 })
			const fd = (cosDualSeries({ v: v + h, d: 0 }).v - cosDualSeries({ v: v - h, d: 0 }).v) / (2 * h)
			assertClose(dual.d, fd, 1e-9, `finite-diff at v=${v}`)
		}

		// Chain rule composition: f(t) = cos(t^2 + 3t - 1)
		const g = (t) => t * t + 3 * t - 1
		const gPrime = (t) => 2 * t + 3
		for (const t of [-2.1, -0.5, 0.8, 1.9]) {
			const composed = cosDualSeries({ v: g(t), d: gPrime(t) })
			const fd = (Math.cos(g(t + h)) - Math.cos(g(t - h))) / (2 * h)
			assertClose(composed.d, fd, 1e-7, `chain-rule finite-diff at t=${t}`)
		}
	})

	test('cross-check: algebraic and trigonometric identities over dual numbers', () => {
		const samples = [
			{ v: -2.3, d: 1.7 },
			{ v: 0.4, d: -0.9 },
			{ v: 1.85, d: 2.2 },
			{ v: 4.6, d: -1.3 },
		]

		for (const x of samples) {
			const c = cosDualSeries(x)

			// Even symmetry: cos(-x) == cos(x)
			const cNeg = cosDualSeries({ v: -x.v, d: -x.d })
			assertClose(cNeg.v, c.v, 1e-14, 'even symmetry v')
			assertClose(cNeg.d, c.d, 1e-14, 'even symmetry d')

			// 2*pi periodicity: cos(x + 2*pi) == cos(x)
			const cShifted = cosDualSeries({ v: x.v + 2 * Math.PI, d: x.d })
			assertClose(cShifted.v, c.v, 1e-13, 'periodicity v')
			assertClose(cShifted.d, c.d, 1e-13, 'periodicity d')

			// Double-angle identity over duals: cos(2x) == 2*cos(x)^2 - 1
			// In dual arithmetic, (c.v, c.d)^2 = (c.v^2, 2*c.v*c.d)
			const c2 = cosDualSeries({ v: 2 * x.v, d: 2 * x.d })
			assertClose(c2.v, 2 * c.v * c.v - 1, 1e-13, 'double-angle v')
			assertClose(c2.d, 4 * c.v * c.d, 1e-13, 'double-angle d')

			// Pythagorean identity via phase shift: cos(x)^2 + cos(x - pi/2)^2 == (1, 0)
			const s = cosDualSeries({ v: x.v - Math.PI / 2, d: x.d })
			const sumV = c.v * c.v + s.v * s.v
			const sumD = 2 * c.v * c.d + 2 * s.v * s.d
			assertClose(sumV, 1, 1e-14, 'Pythagorean v')
			assertClose(sumD, 0, 1e-14, 'Pythagorean d')
		}
	})
})
