import { describe, test } from 'node:test'
import assert from 'node:assert'
import { sinDualSeries } from './sinDualSeries.js'

const EPS = 1e-12

function assertClose(actual, expected, tol = EPS, message = '') {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		`${message ? `${message}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`
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

function maclaurinSin(x, terms = 12) {
	let sum = 0
	let term = x
	for (let k = 0; k < terms; k++) {
		sum += term
		term *= (-x * x) / ((2 * k + 2) * (2 * k + 3))
	}
	return sum
}

function maclaurinCos(x, terms = 12) {
	let sum = 0
	let term = 1
	for (let k = 0; k < terms; k++) {
		sum += term
		term *= (-x * x) / ((2 * k + 1) * (2 * k + 2))
	}
	return sum
}

describe('sinDualSeries', () => {
	test('evaluates normal angles with unit and non-unit derivatives', () => {
		const cases = [
			{ v: Math.PI / 6, d: 1, expectedV: 0.5, expectedD: Math.sqrt(3) / 2 },
			{ v: Math.PI / 4, d: 1, expectedV: Math.SQRT1_2, expectedD: Math.SQRT1_2 },
			{ v: Math.PI / 3, d: 2, expectedV: Math.sqrt(3) / 2, expectedD: 1 },
			{ v: 1.234, d: -3.5, expectedV: Math.sin(1.234), expectedD: -3.5 * Math.cos(1.234) },
			{ v: -0.789, d: 4.2, expectedV: Math.sin(-0.789), expectedD: 4.2 * Math.cos(-0.789) },
		]

		for (const { v, d, expectedV, expectedD } of cases) {
			const res = sinDualSeries({ v, d })
			assertClose(res.v, expectedV, EPS, `primal at v=${v}`)
			assertClose(res.d, expectedD, EPS, `dual at v=${v}, d=${d}`)
		}
	})

	test('propagates derivatives according to the chain rule', () => {
		// f(t) = sin(3t^2 - 2t + 1), f'(t) = (6t - 2) * cos(3t^2 - 2t + 1)
		for (const t of [-2.1, 0, 0.5, 1.7]) {
			const g = 3 * t * t - 2 * t + 1
			const dg = 6 * t - 2
			const res = sinDualSeries({ v: g, d: dg })
			assertClose(res.v, Math.sin(g), EPS, `chain primal at t=${t}`)
			assertClose(res.d, dg * Math.cos(g), EPS, `chain dual at t=${t}`)
		}
	})

	test('does not mutate input and returns a fresh { v, d } object', () => {
		const input = Object.freeze({ v: 0.5, d: 2.0, extra: 'ignored' })
		const res = sinDualSeries(input)
		assert.notStrictEqual(res, input)
		assert.deepStrictEqual(Object.keys(res).sort(), ['d', 'v'])
		assertClose(res.v, Math.sin(0.5))
		assertClose(res.d, 2.0 * Math.cos(0.5))
	})

	test('handles key trigonometric edge cases: 0, ±π/2, ±π, and d = 0', () => {
		// v = 0
		const atZero = sinDualSeries({ v: 0, d: 3.25 })
		assert.strictEqual(atZero.v, 0)
		assert.strictEqual(atZero.d, 3.25)

		// v = +π/2 and -π/2
		const atHalfPi = sinDualSeries({ v: Math.PI / 2, d: 2.5 })
		assertClose(atHalfPi.v, 1, 1e-15)
		assertClose(atHalfPi.d, 0, 1e-15)

		const atNegHalfPi = sinDualSeries({ v: -Math.PI / 2, d: -2.5 })
		assertClose(atNegHalfPi.v, -1, 1e-15)
		assertClose(atNegHalfPi.d, 0, 1e-15)

		// v = +π and -π
		const atPi = sinDualSeries({ v: Math.PI, d: 1.5 })
		assertClose(atPi.v, 0, 1e-15)
		assertClose(atPi.d, -1.5, 1e-15)

		const atNegPi = sinDualSeries({ v: -Math.PI, d: 1.5 })
		assertClose(atNegPi.v, 0, 1e-15)
		assertClose(atNegPi.d, -1.5, 1e-15)

		// d = 0 should yield +0 (never -0) even when cos(v) < 0
		for (const v of [0, Math.PI / 4, Math.PI, -Math.PI, 2.5]) {
			const res = sinDualSeries({ v, d: 0 })
			assertClose(res.v, Math.sin(v), 1e-15)
			assert.ok(Object.is(res.d, 0), `expected +0 derivative for d=0 at v=${v}`)
		}
	})

	test('handles large angles, tiny angles, and extreme finite derivatives without overflow', () => {
		for (const v of [1e6, -1e6, 1e9, -1e9, 1e12]) {
			const d = 2.75
			const res = sinDualSeries({ v, d })
			assert.ok(Number.isFinite(res.v) && Math.abs(res.v) <= 1)
			assert.ok(Number.isFinite(res.d) && Math.abs(res.d) <= Math.abs(d))
			assert.strictEqual(res.v, Math.sin(v))
			assert.strictEqual(res.d, d * Math.cos(v))
		}

		// Tiny angles: sin(v) ≈ v, cos(v) ≈ 1
		const tiny = sinDualSeries({ v: 1e-12, d: -7 })
		assertClose(tiny.v, 1e-12, 1e-24)
		assertClose(tiny.d, -7, 1e-15)

		// Extreme finite d does not overflow since |cos(v)| <= 1
		const hugeD = sinDualSeries({ v: 1.0, d: Number.MAX_VALUE })
		assert.ok(Number.isFinite(hugeD.v))
		assert.ok(Number.isFinite(hugeD.d))
	})

	test('rejects invalid inputs with TypeError or RangeError', () => {
		const typeInvalid = [
			undefined,
			null,
			42,
			'0',
			true,
			[0, 1],
			{},
			{ v: 1 },
			{ d: 1 },
			{ v: '1', d: 1 },
			{ v: 1, d: '1' },
			{ v: null, d: 1 },
			{ v: 1, d: undefined },
		]

		for (const bad of typeInvalid) {
			assert.throws(() => sinDualSeries(bad), TypeError, `expected TypeError for ${JSON.stringify(bad)}`)
		}

		const rangeInvalid = [
			{ v: Number.NaN, d: 1 },
			{ v: 1, d: Number.NaN },
			{ v: Number.POSITIVE_INFINITY, d: 1 },
			{ v: Number.NEGATIVE_INFINITY, d: 1 },
			{ v: 1, d: Number.POSITIVE_INFINITY },
			{ v: 1, d: Number.NEGATIVE_INFINITY },
		]

		for (const bad of rangeInvalid) {
			assert.throws(() => sinDualSeries(bad), RangeError, `expected RangeError for ${JSON.stringify(bad)}`)
		}
	})

	test('cross-check: matches central finite-difference directional derivatives', () => {
		const h = 1e-6
		const points = [
			{ v: -2.3, d: 1.0 },
			{ v: -0.4, d: -2.5 },
			{ v: 0.0, d: 3.1 },
			{ v: 0.9, d: 0.7 },
			{ v: 2.7, d: -1.4 },
			{ v: 5.5, d: 4.0 },
		]

		for (const pt of points) {
			const res = sinDualSeries(pt)
			const fd = (Math.sin(pt.v + h * pt.d) - Math.sin(pt.v - h * pt.d)) / (2 * h)
			assertClose(res.d, fd, 1e-9, `central finite difference at v=${pt.v}, d=${pt.d}`)
		}
	})

	test('cross-check: satisfies sin(2x) = 2*sin(x)*cos(x) and sin²(x) + cos²(x) = 1 over dual numbers', () => {
		const samples = [
			{ v: -1.8, d: 0.9 },
			{ v: -0.25, d: -1.5 },
			{ v: 0.0, d: 2.0 },
			{ v: 0.73, d: 1.25 },
			{ v: 2.1, d: -0.6 },
		]

		for (const x of samples) {
			const sinX = sinDualSeries(x)
			// Independent phase-shifted cos(x) = sin(x + π/2) over dual numbers
			const cosX = sinDualSeries({ v: x.v + Math.PI / 2, d: x.d })

			// Double-angle identity: sin(2x) = 2 * sin(x) * cos(x)
			const lhs = sinDualSeries({ v: 2 * x.v, d: 2 * x.d })
			const prod = dualMul(sinX, cosX)
			const rhs = { v: 2 * prod.v, d: 2 * prod.d }
			assertClose(lhs.v, rhs.v, 1e-12, `double-angle primal at v=${x.v}`)
			assertClose(lhs.d, rhs.d, 1e-12, `double-angle dual at v=${x.v}`)

			// Pythagorean identity: sin²(x) + cos²(x) = 1 + 0·ε
			const pyth = dualAdd(dualMul(sinX, sinX), dualMul(cosX, cosX))
			assertClose(pyth.v, 1, 1e-12, `Pythagorean primal at v=${x.v}`)
			assertClose(pyth.d, 0, 1e-12, `Pythagorean dual at v=${x.v}`)

			// Odd symmetry: sin(-x) = -sin(x)
			const sinNegX = sinDualSeries({ v: -x.v, d: -x.d })
			assertClose(sinNegX.v, -sinX.v, 1e-15, `odd symmetry primal at v=${x.v}`)
			assertClose(sinNegX.d, -sinX.d, 1e-15, `odd symmetry dual at v=${x.v}`)
		}
	})

	test('cross-check: matches independent Maclaurin series evaluation for |v| <= 1', () => {
		for (const [v, d] of [
			[-0.95, 2.2],
			[-0.3, -1.7],
			[0.15, 0.5],
			[0.85, -3.1],
		]) {
			const res = sinDualSeries({ v, d })
			assertClose(res.v, maclaurinSin(v), 1e-14, `Maclaurin primal at v=${v}`)
			assertClose(res.d, d * maclaurinCos(v), 1e-14, `Maclaurin dual at v=${v}`)
		}
	})
})
