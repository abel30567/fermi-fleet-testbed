import { describe, test } from 'node:test'
import assert from 'node:assert'
import { arcsinDualSeries } from './arcsinDualSeries.js'

function assertClose(actual, expected, tol = 1e-12, label = '') {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`
	)
}

/**
 * Independent dual-number sine: sin(v + d*ε) = sin(v) + cos(v)*d*ε
 */
function sinDual({ v, d }) {
	return { v: Math.sin(v), d: Math.cos(v) * d }
}

/**
 * Independent Maclaurin series for arcsin(v) and its derivative for |v| < 1:
 *   arcsin(v)  = sum_{n=0}^N c_n * v^(2n+1) / (2n+1)
 *   arcsin'(v) = sum_{n=0}^N c_n * v^(2n)
 * where c_0 = 1 and c_{n} = c_{n-1} * (2n - 1) / (2n).
 */
function arcsinMaclaurinDual({ v, d }, terms = 60) {
	let coeff = 1
	let vPowEven = 1
	let valSum = 0
	let derivSum = 0

	for (let n = 0; n < terms; n++) {
		valSum += (coeff * vPowEven * v) / (2 * n + 1)
		derivSum += coeff * vPowEven
		coeff *= (2 * n + 1) / (2 * n + 2)
		vPowEven *= v * v
	}

	return { v: valSum, d: derivSum * d }
}

describe('arcsinDualSeries', () => {
	test('evaluates standard points accurately', () => {
		const atZero = arcsinDualSeries({ v: 0, d: 1 })
		assert.strictEqual(atZero.v, 0)
		assert.strictEqual(atZero.d, 1)

		const atZeroScaled = arcsinDualSeries({ v: 0, d: -3.5 })
		assert.strictEqual(atZeroScaled.v, 0)
		assert.strictEqual(atZeroScaled.d, -3.5)

		const atZeroConst = arcsinDualSeries({ v: 0, d: 0 })
		assert.strictEqual(atZeroConst.v, 0)
		assert.strictEqual(atZeroConst.d, 0)

		const atPosHalf = arcsinDualSeries({ v: 0.5, d: 1 })
		assertClose(atPosHalf.v, Math.PI / 6, 1e-15, 'asin(0.5)')
		assertClose(atPosHalf.d, 2 / Math.sqrt(3), 1e-15, "asin'(0.5)")

		const atNegHalf = arcsinDualSeries({ v: -0.5, d: 2.5 })
		assertClose(atNegHalf.v, -Math.PI / 6, 1e-15, 'asin(-0.5)')
		assertClose(atNegHalf.d, 2.5 * (2 / Math.sqrt(3)), 1e-15, "asin'(-0.5)*2.5")

		const atSqrtHalf = arcsinDualSeries({ v: Math.SQRT1_2, d: 1 })
		assertClose(atSqrtHalf.v, Math.PI / 4, 1e-15, 'asin(sqrt(2)/2)')
		assertClose(atSqrtHalf.d, Math.SQRT2, 1e-15, "asin'(sqrt(2)/2)")

		const atNegSqrt3Over2 = arcsinDualSeries({ v: -Math.sqrt(3) / 2, d: -0.5 })
		assertClose(atNegSqrt3Over2.v, -Math.PI / 3, 1e-15, 'asin(-sqrt(3)/2)')
		assertClose(atNegSqrt3Over2.d, -1, 1e-15, "asin'(-sqrt(3)/2)*(-0.5)")
	})

	test('satisfies odd value symmetry, even derivative symmetry, and tangent linearity', () => {
		const v = 0.63
		const d = 1.75
		const pos = arcsinDualSeries({ v, d })
		const negBoth = arcsinDualSeries({ v: -v, d: -d })
		const negVOnly = arcsinDualSeries({ v: -v, d })
		const scaled = arcsinDualSeries({ v, d: 4 * d })

		assertClose(negBoth.v, -pos.v, 1e-15, 'odd primal')
		assertClose(negBoth.d, -pos.d, 1e-15, 'odd full differential')
		assertClose(negVOnly.v, -pos.v, 1e-15, 'odd primal for -v')
		assertClose(negVOnly.d, pos.d, 1e-15, 'even derivative for -v')
		assertClose(scaled.v, pos.v, 1e-15, 'primal independent of d')
		assertClose(scaled.d, 4 * pos.d, 1e-14, 'linear in d')
	})

	test('handles near-boundary values without catastrophic cancellation', () => {
		// Use a dyadic eps (2^-40) so v = 1 - eps is exact in IEEE-754 float64
		const eps = 2 ** -40
		const v = 1 - eps
		const res = arcsinDualSeries({ v, d: 1 })
		// Exact identity: 1 - v^2 = (1 - v)(1 + v) = eps * (2 - eps)
		const expectedDeriv = 1 / Math.sqrt(eps * (2 - eps))
		assertClose(res.v, Math.asin(v), 1e-15, 'near +1 value')
		assert.ok(
			Math.abs(res.d - expectedDeriv) / expectedDeriv < 1e-15,
			`relative derivative error too large near +1: got ${res.d}, expected ${expectedDeriv}`
		)

		const negRes = arcsinDualSeries({ v: -v, d: -2 })
		assertClose(negRes.v, Math.asin(-v), 1e-15, 'near -1 value')
		assert.ok(
			Math.abs(negRes.d - -2 * expectedDeriv) / (2 * expectedDeriv) < 1e-15,
			`relative derivative error too large near -1: got ${negRes.d}, expected ${-2 * expectedDeriv}`
		)
	})

	test('handles boundary |v| === 1 correctly', () => {
		const posOne = arcsinDualSeries({ v: 1, d: 0 })
		assert.strictEqual(posOne.v, Math.PI / 2)
		assert.strictEqual(posOne.d, 0)
		assert.ok(Object.is(posOne.d, 0))

		const negOne = arcsinDualSeries({ v: -1, d: 0 })
		assert.strictEqual(negOne.v, -Math.PI / 2)
		assert.strictEqual(negOne.d, 0)
		assert.ok(Object.is(negOne.d, 0))

		const posOneNegZero = arcsinDualSeries({ v: 1, d: -0 })
		assert.strictEqual(posOneNegZero.v, Math.PI / 2)
		assert.ok(Object.is(posOneNegZero.d, 0))

		assert.throws(() => arcsinDualSeries({ v: 1, d: 1 }), RangeError)
		assert.throws(() => arcsinDualSeries({ v: 1, d: -1e-15 }), RangeError)
		assert.throws(() => arcsinDualSeries({ v: -1, d: 0.25 }), RangeError)
		assert.throws(() => arcsinDualSeries({ v: -1, d: -1 }), RangeError)
	})

	test('throws RangeError when |v| > 1', () => {
		assert.throws(() => arcsinDualSeries({ v: 1.0001, d: 0 }), RangeError)
		assert.throws(() => arcsinDualSeries({ v: 1.5, d: 1 }), RangeError)
		assert.throws(() => arcsinDualSeries({ v: -1.0001, d: 0 }), RangeError)
		assert.throws(() => arcsinDualSeries({ v: -2, d: 0.5 }), RangeError)
		assert.throws(() => arcsinDualSeries({ v: 1 + Number.EPSILON, d: 0 }), RangeError)
		assert.throws(() => arcsinDualSeries({ v: -(1 + Number.EPSILON), d: 1 }), RangeError)
	})

	test('validates invalid and non-finite inputs', () => {
		for (const bad of [null, undefined, 0.5, '0.5', true, [0.5, 1], () => {}]) {
			assert.throws(() => arcsinDualSeries(bad), TypeError)
		}

		for (const badObj of [
			{},
			{ v: 0.5 },
			{ d: 1 },
			{ v: '0.5', d: 1 },
			{ v: 0.5, d: '1' },
			{ v: null, d: 1 },
			{ v: 0.5, d: undefined },
		]) {
			assert.throws(() => arcsinDualSeries(badObj), TypeError)
		}

		for (const nonFinite of [
			{ v: NaN, d: 1 },
			{ v: 0.5, d: NaN },
			{ v: Infinity, d: 1 },
			{ v: -Infinity, d: 0 },
			{ v: 0.5, d: Infinity },
			{ v: 0.5, d: -Infinity },
		]) {
			assert.throws(() => arcsinDualSeries(nonFinite), RangeError)
		}
	})

	test('cross-check: sin(arcsin(x)) = x and arcsin(sin(θ)) = θ in dual arithmetic', () => {
		const samples = [
			{ v: -0.95, d: 1.2 },
			{ v: -0.5, d: -0.75 },
			{ v: 0, d: 3.14 },
			{ v: 0.37, d: 0 },
			{ v: 0.85, d: -2.5 },
		]

		for (const x of samples) {
			const roundTrip = sinDual(arcsinDualSeries(x))
			assertClose(roundTrip.v, x.v, 1e-14, `sin(arcsin(x)).v at v=${x.v}`)
			assertClose(roundTrip.d, x.d, 1e-13, `sin(arcsin(x)).d at v=${x.v}`)
		}

		const angles = [
			{ v: -1.2, d: 0.8 },
			{ v: -Math.PI / 4, d: -1.5 },
			{ v: 0, d: 2 },
			{ v: 0.7, d: 1.1 },
			{ v: 1.4, d: -0.4 },
		]

		for (const theta of angles) {
			const roundTrip = arcsinDualSeries(sinDual(theta))
			assertClose(roundTrip.v, theta.v, 1e-14, `arcsin(sin(θ)).v at θ=${theta.v}`)
			assertClose(roundTrip.d, theta.d, 1e-13, `arcsin(sin(θ)).d at θ=${theta.v}`)
		}
	})

	test('cross-check: central finite-difference derivative verification', () => {
		const h = 1e-6
		const cases = [
			{ v: -0.8, d: 1.5 },
			{ v: -0.35, d: -2.2 },
			{ v: 0, d: 1 },
			{ v: 0.42, d: 3.7 },
			{ v: 0.9, d: -0.6 },
		]

		for (const { v, d } of cases) {
			const { d: dualDeriv } = arcsinDualSeries({ v, d })
			const fdDeriv = ((Math.asin(v + h) - Math.asin(v - h)) / (2 * h)) * d
			assertClose(dualDeriv, fdDeriv, 1e-8, `finite-diff at v=${v}`)
		}
	})

	test('cross-check: independent Maclaurin power series for |v| <= 0.5', () => {
		const cases = [
			{ v: -0.5, d: 1.3 },
			{ v: -0.25, d: -0.9 },
			{ v: 0.1, d: 2.5 },
			{ v: 0.45, d: -1.1 },
		]

		for (const x of cases) {
			const actual = arcsinDualSeries(x)
			const series = arcsinMaclaurinDual(x, 60)
			assertClose(actual.v, series.v, 1e-14, `Maclaurin v at ${x.v}`)
			assertClose(actual.d, series.d, 1e-13, `Maclaurin d at ${x.v}`)
		}
	})
})
