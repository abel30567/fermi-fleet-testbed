import test from 'node:test'
import assert from 'node:assert/strict'
import { sqrtDualSeries } from './sqrtDualSeries.js'

function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-12) {
	const diff = Math.abs(actual - expected)
	const tol = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= tol,
		`Expected ${actual} to be close to ${expected} (diff=${diff}, tol=${tol})`
	)
}

function dualMul(a, b) {
	return {
		v: a.v * b.v,
		d: a.v * b.d + a.d * b.v
	}
}

test('sqrtDualSeries: normal cases with exact and irrational roots', () => {
	assert.deepEqual(sqrtDualSeries({ v: 4, d: 1 }), { v: 2, d: 0.25 })
	assert.deepEqual(sqrtDualSeries({ v: 9, d: 6 }), { v: 3, d: 1 })
	assert.deepEqual(sqrtDualSeries({ v: 1, d: 2 }), { v: 1, d: 1 })
	assert.deepEqual(sqrtDualSeries({ v: 16, d: 0 }), { v: 4, d: 0 })
	assert.deepEqual(sqrtDualSeries({ v: 0.25, d: -0.5 }), { v: 0.5, d: -0.5 })

	const r = sqrtDualSeries({ v: 2, d: -3 })
	assertClose(r.v, Math.SQRT2)
	assertClose(r.d, -3 / (2 * Math.SQRT2))
})

test('sqrtDualSeries: zero value and signed zero normalization', () => {
	const z1 = sqrtDualSeries({ v: 0, d: 0 })
	assert.equal(Object.is(z1.v, 0), true)
	assert.equal(Object.is(z1.d, 0), true)

	const z2 = sqrtDualSeries({ v: -0, d: -0 })
	assert.equal(Object.is(z2.v, 0), true)
	assert.equal(Object.is(z2.d, 0), true)

	const z3 = sqrtDualSeries({ v: 9, d: -0 })
	assert.equal(z3.v, 3)
	assert.equal(Object.is(z3.d, 0), true)
})

test('sqrtDualSeries: extreme magnitudes avoid spurious overflow or underflow', () => {
	const tiny = sqrtDualSeries({ v: 1e-300, d: 2e-150 })
	assertClose(tiny.v, 1e-150)
	assertClose(tiny.d, 1)

	const huge = sqrtDualSeries({ v: 1e300, d: 2e150 })
	assertClose(huge.v, 1e150)
	assertClose(huge.d, 1)
})

test('sqrtDualSeries: does not mutate input object', () => {
	const input = Object.freeze({ v: 25, d: 10 })
	const out = sqrtDualSeries(input)
	assert.deepEqual(out, { v: 5, d: 1 })
})

test('sqrtDualSeries: input validation throws TypeError for invalid shapes/types', () => {
	for (const bad of [null, undefined, 4, '4', true, [4, 1], () => {}]) {
		assert.throws(() => sqrtDualSeries(bad), TypeError)
	}
	for (const bad of [{}, { v: 4 }, { d: 1 }, { v: '4', d: 1 }, { v: 4, d: null }]) {
		assert.throws(() => sqrtDualSeries(bad), TypeError)
	}
})

test('sqrtDualSeries: domain and finiteness errors throw RangeError', () => {
	for (const bad of [
		{ v: NaN, d: 1 },
		{ v: 1, d: NaN },
		{ v: Infinity, d: 1 },
		{ v: 1, d: Infinity },
		{ v: 1, d: -Infinity },
		{ v: -1, d: 0 },
		{ v: -1e-12, d: 2 },
		{ v: 0, d: 1 },
		{ v: 0, d: -1e-9 }
	]) {
		assert.throws(() => sqrtDualSeries(bad), RangeError)
	}
})

test('sqrtDualSeries: algebraic inverse identity (sqrt(x))^2 === x in dual arithmetic', () => {
	const cases = [
		{ v: 0.01, d: 0.3 },
		{ v: 0.75, d: -1.25 },
		{ v: 2.5, d: 4.1 },
		{ v: 17.3, d: -9.8 },
		{ v: 12345.678, d: 89.1 },
		{ v: 1e-100, d: -3e-50 },
		{ v: 1e100, d: 7e50 }
	]

	for (const x of cases) {
		const r = sqrtDualSeries(x)
		const sq = dualMul(r, r)
		assertClose(sq.v, x.v, 1e-14, 1e-15)
		assertClose(sq.d, x.d, 1e-14, 1e-15)
	}
})

test('sqrtDualSeries: finite-difference derivative cross-check', () => {
	const h = 1e-7
	const cases = [
		{ v: 0.5, d: 1 },
		{ v: 2, d: 1.5 },
		{ v: 7.25, d: -2.4 },
		{ v: 50, d: 12.3 }
	]

	for (const x of cases) {
		const r = sqrtDualSeries(x)
		const fd = (Math.sqrt(x.v + x.d * h) - Math.sqrt(x.v - x.d * h)) / (2 * h)
		assertClose(r.d, fd, 1e-7, 1e-9)
	}
})

test('sqrtDualSeries: multiplicative and chain-rule composition identities', () => {
	const a = { v: 3.2, d: -1.4 }
	const b = { v: 5.7, d: 2.1 }

	const lhs = sqrtDualSeries(dualMul(a, b))
	const rhs = dualMul(sqrtDualSeries(a), sqrtDualSeries(b))
	assertClose(lhs.v, rhs.v, 1e-13, 1e-15)
	assertClose(lhs.d, rhs.d, 1e-13, 1e-15)

	// Double sqrt: d/dt (x^(1/4)) = d / (4 * x^(3/4))
	const x = { v: 16, d: 3.2 }
	const fourthRoot = sqrtDualSeries(sqrtDualSeries(x))
	assertClose(fourthRoot.v, 2, 1e-14)
	assertClose(fourthRoot.d, x.d / (4 * Math.pow(x.v, 0.75)), 1e-14)
})
