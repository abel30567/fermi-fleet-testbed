import { test } from 'node:test'
import assert from 'node:assert/strict'
import { log2DualSeries } from './log2DualSeries.js'

function assertClose(actual, expected, tol = 1e-12, label = '') {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(1, Math.abs(expected))
	assert.ok(
		diff <= tol * scale,
		`${label ? label + ': ' : ''}expected ${actual} to be within ${tol * scale} of ${expected} (diff=${diff})`
	)
}

function dualMul(a, b) {
	return { v: a.v * b.v, d: a.d * b.v + a.v * b.d }
}

function dualDiv(a, b) {
	return { v: a.v / b.v, d: (a.d * b.v - a.v * b.d) / (b.v * b.v) }
}

function dualAdd(a, b) {
	return { v: a.v + b.v, d: a.d + b.d }
}

function dualSub(a, b) {
	return { v: a.v - b.v, d: a.d - b.d }
}

test('exact powers of two and canonical derivative values', () => {
	const r1 = log2DualSeries({ v: 1, d: 1 })
	assert.equal(r1.v, 0)
	assertClose(r1.d, Math.LOG2E, 1e-15, 'd/dx log2(1)')

	for (const k of [-50, -10, -1, 0, 1, 2, 8, 32, 100]) {
		const v = 2 ** k
		const res = log2DualSeries({ v, d: 1 })
		assert.equal(res.v, k, `log2(2^${k})`)
		assertClose(res.d, 1 / (v * Math.LN2), 1e-14, `d/dx log2(2^${k})`)
	}
})

test('normal positive values match closed-form Math.log2 and chain rule', () => {
	const cases = [
		{ v: 0.1, d: 2.5 },
		{ v: 0.75, d: -1.2 },
		{ v: Math.SQRT2, d: 3 },
		{ v: Math.E, d: 1 },
		{ v: 3, d: 4 },
		{ v: 10, d: -0.5 },
		{ v: 12345.6789, d: 0.25 },
	]

	for (const c of cases) {
		const res = log2DualSeries(c)
		assertClose(res.v, Math.log2(c.v), 1e-14, `primal v=${c.v}`)
		assertClose(res.d, c.d / (c.v * Math.LN2), 1e-14, `derivative v=${c.v}`)
	}
})

test('edge cases: zero derivative, negative zero, near unity, subnormals, and extreme magnitudes', () => {
	const zeroD = log2DualSeries({ v: 1, d: -0 })
	assert.ok(Object.is(zeroD.v, 0), 'v should be +0')
	assert.ok(Object.is(zeroD.d, 0), 'd should be +0')

	const nearOnePos = log2DualSeries({ v: 1 + 1e-12, d: 1 })
	assertClose(nearOnePos.v, Math.log2(1 + 1e-12), 1e-14, 'v near 1 (+)')
	assertClose(nearOnePos.d, Math.LOG2E / (1 + 1e-12), 1e-14, 'd near 1 (+)')

	const nearOneNeg = log2DualSeries({ v: 1 - 1e-12, d: -2 })
	assertClose(nearOneNeg.v, Math.log2(1 - 1e-12), 1e-14, 'v near 1 (-)')
	assertClose(nearOneNeg.d, (-2 * Math.LOG2E) / (1 - 1e-12), 1e-14, 'd near 1 (-)')

	// Subnormal value (Number.MIN_VALUE = 2^-1074)
	const subnormal = log2DualSeries({ v: Number.MIN_VALUE, d: Number.MIN_VALUE })
	assert.equal(subnormal.v, -1074)
	assertClose(subnormal.d, Math.LOG2E, 1e-14, 'subnormal matched derivative')

	// Another non-power-of-two subnormal
	const subnormalNonPow2 = log2DualSeries({ v: 1.5e-315, d: 3e-315 })
	assertClose(subnormalNonPow2.v, Math.log2(1.5e-315), 1e-14, 'subnormal primal')
	assertClose(subnormalNonPow2.d, 2 * Math.LOG2E, 1e-14, 'subnormal derivative')

	// Large value near Number.MAX_VALUE
	const maxRes = log2DualSeries({ v: Number.MAX_VALUE, d: Number.MAX_VALUE })
	assertClose(maxRes.v, Math.log2(Number.MAX_VALUE), 1e-14, 'MAX_VALUE primal')
	assertClose(maxRes.d, Math.LOG2E, 1e-14, 'MAX_VALUE matched derivative')
})

test('input validation rejects invalid types and out-of-domain values', () => {
	for (const bad of [null, undefined, 42, '2', true, [], [2, 1]]) {
		assert.throws(() => log2DualSeries(bad), TypeError)
	}

	for (const bad of [{ v: '2', d: 1 }, { v: 2, d: '1' }, { v: 2 }, { d: 1 }, {}]) {
		assert.throws(() => log2DualSeries(bad), TypeError)
	}

	for (const bad of [
		{ v: 0, d: 1 },
		{ v: -0, d: 1 },
		{ v: -2, d: 1 },
		{ v: Number.NaN, d: 1 },
		{ v: Number.POSITIVE_INFINITY, d: 1 },
		{ v: Number.NEGATIVE_INFINITY, d: 1 },
		{ v: 2, d: Number.NaN },
		{ v: 2, d: Number.POSITIVE_INFINITY },
		{ v: 2, d: Number.NEGATIVE_INFINITY },
	]) {
		assert.throws(() => log2DualSeries(bad), RangeError)
	}
})

test('cross-check: central finite-difference derivative matches dual derivative', () => {
	const points = [0.25, 0.7, 1.0, 1.4142, 2.71828, 17.3, 250.5]
	for (const v of points) {
		const h = v * 1e-6
		const fd = (Math.log2(v + h) - Math.log2(v - h)) / (2 * h)
		const d = 1.75
		const res = log2DualSeries({ v, d })
		assertClose(res.d, fd * d, 1e-8, `finite-diff at v=${v}`)
	}
})

test('cross-check: algebraic logarithmic identities over dual numbers', () => {
	const x = { v: 3.5, d: 1.2 }
	const y = { v: 2.25, d: -0.7 }

	// Product rule: log2(x * y) === log2(x) + log2(y)
	const lhsProd = log2DualSeries(dualMul(x, y))
	const rhsProd = dualAdd(log2DualSeries(x), log2DualSeries(y))
	assertClose(lhsProd.v, rhsProd.v, 1e-14, 'product identity v')
	assertClose(lhsProd.d, rhsProd.d, 1e-14, 'product identity d')

	// Quotient rule: log2(x / y) === log2(x) - log2(y)
	const lhsQuot = log2DualSeries(dualDiv(x, y))
	const rhsQuot = dualSub(log2DualSeries(x), log2DualSeries(y))
	assertClose(lhsQuot.v, rhsQuot.v, 1e-14, 'quotient identity v')
	assertClose(lhsQuot.d, rhsQuot.d, 1e-14, 'quotient identity d')

	// Power rule: log2(x^3) === 3 * log2(x)
	const x3 = dualMul(dualMul(x, x), x)
	const lhsPow = log2DualSeries(x3)
	const lx = log2DualSeries(x)
	assertClose(lhsPow.v, 3 * lx.v, 1e-14, 'power identity v')
	assertClose(lhsPow.d, 3 * lx.d, 1e-14, 'power identity d')

	// Inverse with exp2: log2(2^u) === u for dual u = { v, d }
	const u = { v: -1.35, d: 2.4 }
	const exp2u = { v: 2 ** u.v, d: 2 ** u.v * Math.LN2 * u.d }
	const recovered = log2DualSeries(exp2u)
	assertClose(recovered.v, u.v, 1e-14, 'exp2 inverse v')
	assertClose(recovered.d, u.d, 1e-14, 'exp2 inverse d')
})
