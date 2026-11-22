import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { arccosDualSeries } from './arccosDualSeries.js'

function assertClose(actual, expected, tol = 1e-12, label = '') {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`,
	)
}

function cosDual({ v, d }) {
	return {
		v: Math.cos(v),
		d: -Math.sin(v) * d,
	}
}

function arccosDualMaclaurin(v, d, terms = 40) {
	// arccos(v) = pi/2 - sum_{n=0}^\infty c_n * v^(2n+1) / (2n+1)
	// d/dv arccos(v) = -sum_{n=0}^\infty c_n * v^(2n)
	// where c_0 = 1 and c_n = c_{n-1} * (2n - 1) / (2n)
	let coeff = 1
	let vPow = v
	const v2 = v * v
	let arcsinVal = 0
	let arcsinDeriv = 0

	for (let n = 0; n < terms; n++) {
		if (n > 0) {
			coeff *= (2 * n - 1) / (2 * n)
		}
		arcsinVal += (coeff * vPow) / (2 * n + 1)
		arcsinDeriv += coeff * (vPow / (v === 0 ? 1 : v))
		vPow *= v2
	}

	if (v === 0) {
		arcsinVal = 0
		arcsinDeriv = 1
	}

	return {
		v: Math.PI / 2 - arcsinVal,
		d: -d * arcsinDeriv,
	}
}

describe('arccosDualSeries', () => {
	test('evaluates canonical points accurately', () => {
		const atZero = arccosDualSeries({ v: 0, d: 1 })
		assertClose(atZero.v, Math.PI / 2, 1e-15, 'v=0 primal')
		assertClose(atZero.d, -1, 1e-15, 'v=0 deriv')

		const atPosHalf = arccosDualSeries({ v: 0.5, d: 1 })
		assertClose(atPosHalf.v, Math.PI / 3, 1e-15, 'v=0.5 primal')
		assertClose(atPosHalf.d, -2 / Math.sqrt(3), 1e-15, 'v=0.5 deriv')

		const atNegHalf = arccosDualSeries({ v: -0.5, d: 1 })
		assertClose(atNegHalf.v, (2 * Math.PI) / 3, 1e-15, 'v=-0.5 primal')
		assertClose(atNegHalf.d, -2 / Math.sqrt(3), 1e-15, 'v=-0.5 deriv')

		const atSqrtHalf = arccosDualSeries({ v: Math.SQRT1_2, d: -2.5 })
		assertClose(atSqrtHalf.v, Math.PI / 4, 1e-15, 'v=sqrt(1/2) primal')
		assertClose(atSqrtHalf.d, 2.5 * Math.SQRT2, 1e-14, 'v=sqrt(1/2) deriv')

		const atNegSqrtHalf = arccosDualSeries({ v: -Math.SQRT1_2, d: 3 })
		assertClose(atNegSqrtHalf.v, (3 * Math.PI) / 4, 1e-15, 'v=-sqrt(1/2) primal')
		assertClose(atNegSqrtHalf.d, -3 * Math.SQRT2, 1e-14, 'v=-sqrt(1/2) deriv')
	})

	test('scales derivative linearly with input d and normalizes zero derivative', () => {
		const resZeroD = arccosDualSeries({ v: 0.3, d: 0 })
		assertClose(resZeroD.v, Math.acos(0.3), 1e-15)
		assert.ok(Object.is(resZeroD.d, 0), 'expected positive 0 for d=0')

		const resNegZeroD = arccosDualSeries({ v: -0.3, d: -0 })
		assertClose(resNegZeroD.v, Math.acos(-0.3), 1e-15)
		assert.ok(Object.is(resNegZeroD.d, 0), 'expected positive 0 for d=-0')

		const base = arccosDualSeries({ v: 0.6, d: 1 })
		const scaled = arccosDualSeries({ v: 0.6, d: -4.25 })
		assert.equal(scaled.v, base.v)
		assertClose(scaled.d, -4.25 * base.d, 1e-14)
	})

	test('handles boundary endpoints |v| === 1 with d === 0', () => {
		const atPosOne = arccosDualSeries({ v: 1, d: 0 })
		assert.equal(atPosOne.v, 0)
		assert.ok(Object.is(atPosOne.d, 0))

		const atNegOne = arccosDualSeries({ v: -1, d: 0 })
		assert.equal(atNegOne.v, Math.PI)
		assert.ok(Object.is(atNegOne.d, 0))

		const atPosOneNegZero = arccosDualSeries({ v: 1, d: -0 })
		assert.equal(atPosOneNegZero.v, 0)
		assert.ok(Object.is(atPosOneNegZero.d, 0))
	})

	test('throws RangeError at |v| === 1 when d !== 0 (singular derivative)', () => {
		assert.throws(() => arccosDualSeries({ v: 1, d: 1 }), RangeError)
		assert.throws(() => arccosDualSeries({ v: 1, d: -1e-12 }), RangeError)
		assert.throws(() => arccosDualSeries({ v: -1, d: 1 }), RangeError)
		assert.throws(() => arccosDualSeries({ v: -1, d: -0.5 }), RangeError)
	})

	test('throws RangeError when |v| > 1', () => {
		assert.throws(() => arccosDualSeries({ v: 1.000001, d: 0 }), RangeError)
		assert.throws(() => arccosDualSeries({ v: -1.000001, d: 0 }), RangeError)
		assert.throws(() => arccosDualSeries({ v: 2, d: 1 }), RangeError)
		assert.throws(() => arccosDualSeries({ v: -10, d: -3 }), RangeError)
	})

	test('maintains accuracy very close to |v| = 1', () => {
		// Use an exact power-of-two offset so 1 - v === eps with zero input rounding
		const eps = 2 ** -40
		const v = 1 - eps
		const res = arccosDualSeries({ v, d: 1 })
		// sqrt((1 - v)(1 + v)) = sqrt(eps * (2 - eps))
		const expectedDeriv = -1 / Math.sqrt(eps * (2 - eps))
		assertClose(res.v, Math.acos(v), 1e-15, 'near +1 primal')
		assert.ok(
			Math.abs(res.d - expectedDeriv) / Math.abs(expectedDeriv) < 1e-14,
			`near +1 relative error too large: got ${res.d}, expected ${expectedDeriv}`,
		)

		const vNeg = -1 + eps
		const resNeg = arccosDualSeries({ v: vNeg, d: -2 })
		const expectedDerivNeg = 2 / Math.sqrt(eps * (2 - eps))
		assertClose(resNeg.v, Math.acos(vNeg), 1e-15, 'near -1 primal')
		assert.ok(
			Math.abs(resNeg.d - expectedDerivNeg) / Math.abs(expectedDerivNeg) < 1e-14,
			`near -1 relative error too large: got ${resNeg.d}, expected ${expectedDerivNeg}`,
		)
	})

	test('throws on invalid input types and non-finite components', () => {
		for (const bad of [null, undefined, 0.5, '0.5', true, [0, 1], () => {}]) {
			assert.throws(() => arccosDualSeries(bad), TypeError)
		}

		for (const bad of [{}, { v: 0 }, { d: 1 }, { v: '0', d: 1 }, { v: 0, d: null }]) {
			assert.throws(() => arccosDualSeries(bad), TypeError)
		}

		for (const bad of [
			{ v: Number.NaN, d: 1 },
			{ v: 0, d: Number.NaN },
			{ v: Number.POSITIVE_INFINITY, d: 0 },
			{ v: Number.NEGATIVE_INFINITY, d: 0 },
			{ v: 0, d: Number.POSITIVE_INFINITY },
			{ v: 0, d: Number.NEGATIVE_INFINITY },
		]) {
			assert.throws(() => arccosDualSeries(bad), RangeError)
		}
	})

	test('does not mutate input object', () => {
		const input = Object.freeze({ v: 0.25, d: -1.5 })
		const out = arccosDualSeries(input)
		assert.notEqual(out, input)
		assert.equal(input.v, 0.25)
		assert.equal(input.d, -1.5)
	})

	test('cross-check: cos(arccos(x)) = x in dual arithmetic', () => {
		const samples = [
			{ v: -0.95, d: 2.3 },
			{ v: -0.7, d: -1.1 },
			{ v: -0.5, d: 0.5 },
			{ v: 0, d: 1.75 },
			{ v: 0.2, d: -3.4 },
			{ v: 0.5, d: 1 },
			{ v: 0.85, d: -0.25 },
			{ v: 0.99, d: 0.4 },
		]

		for (const x of samples) {
			const roundTrip = cosDual(arccosDualSeries(x))
			assertClose(roundTrip.v, x.v, 1e-14, `cos(arccos(${x.v})).v`)
			assertClose(roundTrip.d, x.d, 1e-13, `cos(arccos(${x.v})).d`)
		}
	})

	test('cross-check: central finite-difference derivative approximation', () => {
		const h = 1e-6
		const samples = [
			{ v: -0.8, d: 1.5 },
			{ v: -0.35, d: -2.2 },
			{ v: 0, d: 0.7 },
			{ v: 0.4, d: 3.1 },
			{ v: 0.75, d: -0.9 },
		]

		for (const { v, d } of samples) {
			const result = arccosDualSeries({ v, d })
			const fd = (Math.acos(v + h * d) - Math.acos(v - h * d)) / (2 * h)
			assertClose(result.d, fd, 1e-8, `finite-diff at v=${v}, d=${d}`)
		}
	})

	test('cross-check: Maclaurin series and reflection identity arccos(x) + arccos(-x) = pi', () => {
		const samples = [
			{ v: -0.5, d: 1.3 },
			{ v: -0.2, d: -0.8 },
			{ v: 0, d: 2.1 },
			{ v: 0.15, d: 0.6 },
			{ v: 0.45, d: -1.7 },
		]

		for (const { v, d } of samples) {
			const result = arccosDualSeries({ v, d })
			const series = arccosDualMaclaurin(v, d, 50)
			assertClose(result.v, series.v, 1e-13, `series primal at v=${v}`)
			assertClose(result.d, series.d, 1e-13, `series deriv at v=${v}`)

			const neg = arccosDualSeries({ v: -v, d: -d })
			assertClose(result.v + neg.v, Math.PI, 1e-14, `reflection primal at v=${v}`)
			assertClose(result.d + neg.d, 0, 1e-14, `reflection deriv at v=${v}`)
		}
	})
})
