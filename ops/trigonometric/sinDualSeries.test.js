import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sinDualSeries } from './sinDualSeries.js'

const TOL = 1e-14

function assertClose(actual, expected, tol = TOL, label = '') {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		`${label ? label + ': ' : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`,
	)
}

function dualMul(a, b) {
	return {
		v: a.v * b.v,
		d: a.v * b.d + a.d * b.v,
	}
}

function dualAdd(a, b) {
	return {
		v: a.v + b.v,
		d: a.d + b.d,
	}
}

describe('sinDualSeries', () => {
	test('evaluates known angles with unit derivative seed', () => {
		const cases = [
			{ v: 0, expV: 0, expD: 1 },
			{ v: Math.PI / 6, expV: 0.5, expD: Math.sqrt(3) / 2 },
			{ v: Math.PI / 4, expV: Math.SQRT1_2, expD: Math.SQRT1_2 },
			{ v: Math.PI / 3, expV: Math.sqrt(3) / 2, expD: 0.5 },
			{ v: Math.PI / 2, expV: 1, expD: 0 },
			{ v: Math.PI, expV: 0, expD: -1 },
			{ v: (3 * Math.PI) / 2, expV: -1, expD: 0 },
			{ v: 2 * Math.PI, expV: 0, expD: 1 },
		]

		for (const { v, expV, expD } of cases) {
			const res = sinDualSeries({ v, d: 1 })
			assertClose(res.v, expV, TOL, `v=${v} primal`)
			assertClose(res.d, expD, TOL, `v=${v} dual`)
		}
	})

	test('scales derivative linearly with arbitrary tangent seed d', () => {
		const seeds = [-4.25, -1, 0, 0.5, 3.7, 1e5]
		const v = 1.23456789

		for (const d of seeds) {
			const res = sinDualSeries({ v, d })
			assertClose(res.v, Math.sin(v), TOL, `d=${d} primal`)
			assertClose(res.d, d * Math.cos(v), Math.max(TOL, Math.abs(d) * 1e-14), `d=${d} dual`)
		}
	})

	test('handles negative angles across all four quadrants', () => {
		const angles = [-0.3, -Math.PI / 4, -Math.PI / 2, -2.1, -Math.PI, -4.9, -2 * Math.PI - 0.7]

		for (const v of angles) {
			const res = sinDualSeries({ v, d: 2.5 })
			assertClose(res.v, Math.sin(v), TOL, `v=${v} primal`)
			assertClose(res.d, 2.5 * Math.cos(v), TOL, `v=${v} dual`)
		}
	})

	test('handles edge cases: zero, -0, tiny values, and large angles', () => {
		const zero = sinDualSeries({ v: 0, d: 0 })
		assert.strictEqual(zero.v, 0)
		assert.strictEqual(zero.d, 0)

		const negZero = sinDualSeries({ v: -0, d: 0 })
		assert.strictEqual(negZero.v, 0)
		assert.strictEqual(negZero.d, 0)

		const piZeroSeed = sinDualSeries({ v: Math.PI, d: 0 })
		assert.strictEqual(piZeroSeed.d, 0)

		// Very small values: sin(v) ≈ v, cos(v) ≈ 1
		for (const v of [1e-12, -1e-15, Number.MIN_VALUE]) {
			const res = sinDualSeries({ v, d: 1 })
			assertClose(res.v, v, 1e-30, `tiny v=${v} primal`)
			assert.strictEqual(res.d, 1)
		}

		// Large values inside and beyond Cody-Waite range
		for (const v of [1e3, -5e5, 999_999.5, 1e9, -1e12]) {
			const res = sinDualSeries({ v, d: -1.5 })
			assertClose(res.v, Math.sin(v), 1e-13, `large v=${v} primal`)
			assertClose(res.d, -1.5 * Math.cos(v), 1e-13, `large v=${v} dual`)
		}
	})

	test('does not mutate input object', () => {
		const input = { v: 0.75, d: 1.5 }
		const res = sinDualSeries(input)
		assert.deepStrictEqual(input, { v: 0.75, d: 1.5 })
		assert.notStrictEqual(res, input)
	})

	test('validates input types and finiteness', () => {
		const invalidTypes = [
			null,
			undefined,
			42,
			'0',
			true,
			[0, 1],
			{},
			{ v: 1 },
			{ d: 1 },
			{ v: '1', d: 1 },
			{ v: 1, d: null },
		]

		for (const bad of invalidTypes) {
			assert.throws(() => sinDualSeries(bad), TypeError)
		}

		const nonFinite = [
			{ v: NaN, d: 1 },
			{ v: 1, d: NaN },
			{ v: Infinity, d: 1 },
			{ v: -Infinity, d: 1 },
			{ v: 1, d: Infinity },
			{ v: 1, d: -Infinity },
		]

		for (const bad of nonFinite) {
			assert.throws(() => sinDualSeries(bad), RangeError)
		}
	})

	test('cross-check: central finite-difference derivative verification', () => {
		const h = 1e-6
		const points = [-5.2, -1.7, -0.4, 0, 0.25, Math.PI / 4, 1.9, 4.1, 10.7]

		for (const v of points) {
			const d = 1.75
			const res = sinDualSeries({ v, d })
			const fPlus = sinDualSeries({ v: v + h, d: 0 }).v
			const fMinus = sinDualSeries({ v: v - h, d: 0 }).v
			const fdDeriv = d * ((fPlus - fMinus) / (2 * h))
			assertClose(res.d, fdDeriv, 1e-9, `finite-diff at v=${v}`)
		}
	})

	test('cross-check: dual Pythagorean, double-angle, periodicity, and chain-rule identities', () => {
		const points = [-2.7, -0.5, 0.3, 1.1, 2.4]

		for (const v of points) {
			const d = 2.3
			const sinX = sinDualSeries({ v, d })
			// cos(x) = sin(pi/2 - x); dual of (pi/2 - (v + d*eps)) is { v: pi/2 - v, d: -d }
			const cosX = sinDualSeries({ v: Math.PI / 2 - v, d: -d })

			// 1. Pythagorean identity in dual arithmetic: sin(x)^2 + cos(x)^2 = 1 + 0*eps
			const pythag = dualAdd(dualMul(sinX, sinX), dualMul(cosX, cosX))
			assertClose(pythag.v, 1, TOL, `Pythagorean primal at v=${v}`)
			assertClose(pythag.d, 0, TOL, `Pythagorean dual at v=${v}`)

			// 2. Double-angle identity: sin(2x) = 2 * sin(x) * cos(x) in both value and derivative
			const sin2X = sinDualSeries({ v: 2 * v, d: 2 * d })
			const prod = dualMul(sinX, cosX)
			assertClose(sin2X.v, 2 * prod.v, TOL, `double-angle primal at v=${v}`)
			assertClose(sin2X.d, 2 * prod.d, TOL, `double-angle dual at v=${v}`)

			// 3. Odd symmetry: sin(-v - d*eps) = -sin(v + d*eps)
			const sinNegX = sinDualSeries({ v: -v, d: -d })
			assertClose(sinNegX.v, -sinX.v, TOL, `odd symmetry primal at v=${v}`)
			assertClose(sinNegX.d, -sinX.d, TOL, `odd symmetry dual at v=${v}`)

			// 4. Periodicity: sin((v + 2*pi) + d*eps) = sin(v + d*eps)
			const sinShifted = sinDualSeries({ v: v + 2 * Math.PI, d })
			assertClose(sinShifted.v, sinX.v, TOL, `periodicity primal at v=${v}`)
			assertClose(sinShifted.d, sinX.d, TOL, `periodicity dual at v=${v}`)

			// 5. Chain rule: sin(sin(x))
			const composed = sinDualSeries(sinDualSeries({ v, d: 1 }))
			assertClose(composed.v, Math.sin(Math.sin(v)), TOL, `chain-rule primal at v=${v}`)
			assertClose(composed.d, Math.cos(Math.sin(v)) * Math.cos(v), TOL, `chain-rule dual at v=${v}`)
		}
	})
})
