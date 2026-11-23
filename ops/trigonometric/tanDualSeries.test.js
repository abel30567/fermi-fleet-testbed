import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { tanDualSeries } from './tanDualSeries.js'

function assertClose(actual, expected, tol = 1e-12, label = '') {
	const scale = Math.max(1, Math.abs(expected))
	assert.ok(
		Math.abs(actual - expected) <= tol * scale,
		`${label ? label + ': ' : ''}expected ${actual} to be within ${tol * scale} of ${expected}`
	)
}

describe('tanDualSeries', () => {
	test('evaluates standard angles and derivatives', () => {
		const zero = tanDualSeries({ v: 0, d: 1 })
		assert.equal(zero.v, 0)
		assert.equal(zero.d, 1)

		const zeroScaled = tanDualSeries({ v: 0, d: 5 })
		assert.equal(zeroScaled.v, 0)
		assert.equal(zeroScaled.d, 5)

		const pi4 = tanDualSeries({ v: Math.PI / 4, d: 1 })
		assertClose(pi4.v, 1, 1e-14, 'tan(pi/4)')
		assertClose(pi4.d, 2, 1e-14, 'd/dx tan(pi/4)')

		const negPi4 = tanDualSeries({ v: -Math.PI / 4, d: 1 })
		assertClose(negPi4.v, -1, 1e-14, 'tan(-pi/4)')
		assertClose(negPi4.d, 2, 1e-14, 'd/dx tan(-pi/4)')

		const pi3 = tanDualSeries({ v: Math.PI / 3, d: 2 })
		assertClose(pi3.v, Math.sqrt(3), 1e-14, 'tan(pi/3)')
		assertClose(pi3.d, 8, 1e-14, '2 * sec^2(pi/3)')

		const pi6 = tanDualSeries({ v: Math.PI / 6, d: 3 })
		assertClose(pi6.v, 1 / Math.sqrt(3), 1e-14, 'tan(pi/6)')
		assertClose(pi6.d, 4, 1e-14, '3 * sec^2(pi/6)')
	})

	test('respects odd symmetry, pi-periodicity, and linearity in d', () => {
		const v = 0.73
		const pos = tanDualSeries({ v, d: 1 })
		const neg = tanDualSeries({ v: -v, d: 1 })
		assertClose(neg.v, -pos.v, 1e-15, 'odd value')
		assertClose(neg.d, pos.d, 1e-15, 'even derivative')

		const shifted = tanDualSeries({ v: v + Math.PI, d: 1 })
		assertClose(shifted.v, pos.v, 1e-14, 'pi-periodic value')
		assertClose(shifted.d, pos.d, 1e-14, 'pi-periodic derivative')

		const scaled = tanDualSeries({ v, d: -2.5 })
		assertClose(scaled.v, pos.v, 1e-15)
		assertClose(scaled.d, -2.5 * pos.d, 1e-15)

		const zeroDeriv = tanDualSeries({ v, d: 0 })
		assertClose(zeroDeriv.v, pos.v, 1e-15)
		assert.equal(zeroDeriv.d, 0)
	})

	test('handles small angles, large periodic angles, and near-pole values', () => {
		const tiny = tanDualSeries({ v: 1e-9, d: 1 })
		assertClose(tiny.v, 1e-9, 1e-15, 'tiny v')
		assertClose(tiny.d, 1, 1e-15, 'tiny d')

		const nearPole = tanDualSeries({ v: Math.PI / 2 - 1e-4, d: 1 })
		assertClose(nearPole.v, 1e4, 1e-7, 'near pole v')
		assertClose(nearPole.d, 1e8, 1e-7, 'near pole d')

		const multiPeriod = tanDualSeries({ v: 10 * Math.PI + 0.5, d: 1.5 })
		const base = tanDualSeries({ v: 0.5, d: 1.5 })
		assertClose(multiPeriod.v, base.v, 1e-12, 'multi-period v')
		assertClose(multiPeriod.d, base.d, 1e-12, 'multi-period d')
	})

	test('validates inputs and rejects poles', () => {
		for (const bad of [null, undefined, 1, '0', true, {}, { v: 0 }, { d: 1 }, { v: '0', d: 1 }, { v: 0, d: '1' }]) {
			assert.throws(() => tanDualSeries(bad), TypeError)
		}

		for (const bad of [
			{ v: Number.NaN, d: 1 },
			{ v: 0, d: Number.NaN },
			{ v: Number.POSITIVE_INFINITY, d: 1 },
			{ v: Number.NEGATIVE_INFINITY, d: 1 },
			{ v: 0, d: Number.POSITIVE_INFINITY },
			{ v: 0, d: Number.NEGATIVE_INFINITY },
		]) {
			assert.throws(() => tanDualSeries(bad), RangeError)
		}

		for (const pole of [Math.PI / 2, -Math.PI / 2, (3 * Math.PI) / 2, (-5 * Math.PI) / 2]) {
			assert.throws(() => tanDualSeries({ v: pole, d: 1 }), RangeError)
		}
	})

	test('cross-check: central finite-difference directional derivative', () => {
		const h = 1e-6
		const cases = [
			{ v: -1.2, d: 1.3 },
			{ v: -0.5, d: -0.7 },
			{ v: 0, d: 2.0 },
			{ v: 0.35, d: 1.0 },
			{ v: 1.1, d: 0.8 },
			{ v: 2.4, d: -1.5 },
		]

		for (const x of cases) {
			const res = tanDualSeries(x)
			const fd = (Math.tan(x.v + h * x.d) - Math.tan(x.v - h * x.d)) / (2 * h)
			assertClose(res.d, fd, 1e-8, `finite diff at v=${x.v}, d=${x.d}`)
		}
	})

	test('cross-check: dual quotient sin(x) / cos(x) identity', () => {
		for (const v of [-2.1, -0.8, 0.0, 0.6, 1.3, 4.0]) {
			const d = 1.7
			const s = { v: Math.sin(v), d: d * Math.cos(v) }
			const c = { v: Math.cos(v), d: -d * Math.sin(v) }
			const quotient = {
				v: s.v / c.v,
				d: (s.d * c.v - s.v * c.d) / (c.v * c.v),
			}
			const res = tanDualSeries({ v, d })
			assertClose(res.v, quotient.v, 1e-14, `sin/cos v at ${v}`)
			assertClose(res.d, quotient.d, 1e-14, `sin/cos d at ${v}`)
		}
	})

	test('cross-check: Maclaurin series expansion for small angles', () => {
		// Independently generate Maclaurin coefficients of tan(v) from the ODE T'(v) = 1 + T(v)^2
		const N = 25
		const c = new Array(N + 1).fill(0)
		c[1] = 1
		for (let k = 1; k < N; k++) {
			let sum = 0
			for (let j = 0; j <= k; j++) {
				sum += c[j] * c[k - j]
			}
			c[k + 1] = sum / (k + 1)
		}

		for (const v of [-0.25, -0.1, 0.05, 0.2, 0.35]) {
			const d = 1.4
			let seriesVal = 0
			let seriesDeriv = 0
			let pow = 1
			for (let k = 1; k <= N; k++) {
				seriesDeriv += k * c[k] * pow
				pow *= v
				seriesVal += c[k] * pow
			}
			seriesDeriv *= d

			const res = tanDualSeries({ v, d })
			assertClose(res.v, seriesVal, 1e-14, `Maclaurin v at ${v}`)
			assertClose(res.d, seriesDeriv, 1e-14, `Maclaurin d at ${v}`)
		}
	})

	test('cross-check: dual tangent addition formula and atan inverse composition', () => {
		const a = { v: 0.4, d: 1.2 }
		const b = { v: 0.65, d: -0.9 }

		const ta = tanDualSeries(a)
		const tb = tanDualSeries(b)

		// Dual numerator: ta + tb
		const num = { v: ta.v + tb.v, d: ta.d + tb.d }
		// Dual denominator: 1 - ta * tb
		const prod = { v: ta.v * tb.v, d: ta.d * tb.v + ta.v * tb.d }
		const den = { v: 1 - prod.v, d: -prod.d }
		const rhs = {
			v: num.v / den.v,
			d: (num.d * den.v - num.v * den.d) / (den.v * den.v),
		}

		const lhs = tanDualSeries({ v: a.v + b.v, d: a.d + b.d })
		assertClose(lhs.v, rhs.v, 1e-14, 'tan(a+b) v')
		assertClose(lhs.d, rhs.d, 1e-14, 'tan(a+b) d')

		// Inverse composition: atan(tan(x)) = x on (-pi/2, pi/2)
		const recovered = {
			v: Math.atan(ta.v),
			d: ta.d / (1 + ta.v * ta.v),
		}
		assertClose(recovered.v, a.v, 1e-14, 'atan(tan(a)) v')
		assertClose(recovered.d, a.d, 1e-14, 'atan(tan(a)) d')
	})
})
