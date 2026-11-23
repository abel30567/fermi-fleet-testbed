import { test } from 'node:test'
import assert from 'node:assert'
import { log10DualRecursive } from './log10DualRecursive.js'

const LN10 = Math.LN10

function assertClose(actual, expected, relTol = 1e-14, absTol = 1e-15, label = '') {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(Math.abs(expected), 1)
	const bound = Math.max(absTol, relTol * scale)
	assert.ok(
		diff <= bound,
		`${label}expected ${actual} to be close to ${expected} (diff=${diff}, bound=${bound})`,
	)
}

test('normal cases: positive integers and decimals', () => {
	const samples = [
		{ v: 2, d: 1 },
		{ v: 3.5, d: 2.25 },
		{ v: 7.123456789, d: -4.5 },
		{ v: 42, d: 0.75 },
		{ v: 0.25, d: 3 },
		{ v: 0.5, d: -1.5 },
		{ v: 9.99, d: 0.01 },
	]

	for (const x of samples) {
		const res = log10DualRecursive(x)
		assertClose(res.v, Math.log10(x.v), 1e-14, 1e-15, `v(${x.v}): `)
		assertClose(res.d, x.d / (x.v * LN10), 1e-14, 1e-15, `d(${x.v}, ${x.d}): `)
	}
})

test('edge case: x = { v: 1, d } gives exact zero primal and d / ln(10)', () => {
	const r1 = log10DualRecursive({ v: 1, d: 1 })
	assert.strictEqual(r1.v, 0)
	assertClose(r1.d, 1 / LN10, 1e-15, 1e-15)

	const r0 = log10DualRecursive({ v: 1, d: 0 })
	assert.strictEqual(r0.v, 0)
	assert.strictEqual(r0.d, 0)

	const rNeg = log10DualRecursive({ v: 1, d: -5 })
	assert.strictEqual(rNeg.v, 0)
	assertClose(rNeg.d, -5 / LN10, 1e-15, 1e-15)
})

test('edge cases: exact powers of 10 (positive and negative)', () => {
	const exponents = [-300, -100, -20, -6, -3, -2, -1, 0, 1, 2, 3, 6, 12, 50, 100, 300]
	for (const k of exponents) {
		const v = Number(`1e${k}`)
		const res = log10DualRecursive({ v, d: v })
		assertClose(res.v, k, 1e-15, 1e-15, `log10(1e${k}): `)
		// With d = v, derivative should be v / (v * ln(10)) = 1 / ln(10)
		assertClose(res.d, 1 / LN10, 1e-14, 1e-15, `d(1e${k}): `)
	}
})

test('edge cases: very small (including subnormals) and very large positives', () => {
	const extremes = [
		{ v: Number.MIN_VALUE, d: Number.MIN_VALUE },
		{ v: 1e-320, d: 1e-320 },
		{ v: 5e-309, d: 1 },
		{ v: 1e-308, d: 1e-308 },
		{ v: 1e308, d: 1e308 },
		{ v: 1e308, d: 1 },
		{ v: Number.MAX_VALUE, d: Number.MAX_VALUE },
	]

	for (const x of extremes) {
		const res = log10DualRecursive(x)
		assertClose(res.v, Math.log10(x.v), 1e-14, 1e-14, `extreme v(${x.v}): `)
		assert.ok(Number.isFinite(res.d), `expected finite derivative for v=${x.v}, d=${x.d}, got ${res.d}`)
	}

	// Verify specific exact scaled derivative values where naive v * LN10 overflows/underflows
	const huge = log10DualRecursive({ v: Number.MAX_VALUE, d: Number.MAX_VALUE })
	assertClose(huge.d, 1 / LN10, 1e-14, 1e-15, 'MAX_VALUE scaled d: ')

	const tiny = log10DualRecursive({ v: Number.MIN_VALUE, d: Number.MIN_VALUE })
	assertClose(tiny.d, 1 / LN10, 1e-14, 1e-15, 'MIN_VALUE scaled d: ')

	const boundary = log10DualRecursive({ v: 5e-309, d: 1 })
	assertClose(boundary.d, 1 / (5e-309 * LN10), 1e-14, 1e-15, '5e-309 d=1: ')
})

test('edge cases: values near range-reduction boundaries (0.1, 1, 10, sqrt(2), 1/sqrt(2))', () => {
	const nearBoundaries = [
		0.1 - 1e-16,
		0.1,
		0.1 + 1e-16,
		Math.SQRT1_2 - 1e-15,
		Math.SQRT1_2,
		Math.SQRT1_2 + 1e-15,
		1 - 1e-15,
		1 + 1e-15,
		Math.SQRT2 - 1e-15,
		Math.SQRT2,
		Math.SQRT2 + 1e-15,
		10 - 1e-14,
		10,
		10 + 1e-14,
	]

	for (const v of nearBoundaries) {
		const res = log10DualRecursive({ v, d: 2.5 })
		assertClose(res.v, Math.log10(v), 1e-14, 1e-15, `boundary v(${v}): `)
		assertClose(res.d, 2.5 / (v * LN10), 1e-14, 1e-15, `boundary d(${v}): `)
	}
})

test('input validation: throws RangeError for v <= 0 and non-finite numbers', () => {
	const rangeInvalid = [
		{ v: 0, d: 1 },
		{ v: -0, d: 1 },
		{ v: -1, d: 1 },
		{ v: -1e-300, d: 0 },
		{ v: -1e100, d: 2 },
		{ v: Infinity, d: 1 },
		{ v: -Infinity, d: 1 },
		{ v: 10, d: Infinity },
		{ v: 10, d: -Infinity },
	]

	for (const bad of rangeInvalid) {
		assert.throws(
			() => log10DualRecursive(bad),
			RangeError,
			`Expected RangeError for ${JSON.stringify(bad)}`,
		)
	}
})

test('input validation: throws TypeError for malformed inputs and NaN', () => {
	const typeInvalid = [
		null,
		undefined,
		10,
		'10',
		true,
		[10, 1],
		{},
		{ v: 10 },
		{ d: 1 },
		{ v: '10', d: 1 },
		{ v: 10, d: '1' },
		{ v: NaN, d: 1 },
		{ v: 10, d: NaN },
	]

	for (const bad of typeInvalid) {
		assert.throws(
			() => log10DualRecursive(bad),
			TypeError,
			`Expected TypeError for ${String(bad)}`,
		)
	}
})

test('independent cross-check: Math.log10 and central finite-difference derivative', () => {
	// Verify chain rule on composite function f(t) = log10(g(t)) where g(t) = 3*t^2 + 2*t + 5
	const g = (t) => 3 * t * t + 2 * t + 5
	const dg = (t) => 6 * t + 2
	const points = [-2.5, -0.3, 0, 0.7, 3.14159, 15.2]
	const h = 1e-6

	for (const t of points) {
		const res = log10DualRecursive({ v: g(t), d: dg(t) })
		const refVal = Math.log10(g(t))
		const centralDiff = (Math.log10(g(t + h)) - Math.log10(g(t - h))) / (2 * h)

		assertClose(res.v, refVal, 1e-14, 1e-15, `cross-check value at t=${t}: `)
		assertClose(res.d, centralDiff, 1e-8, 1e-9, `finite-diff derivative at t=${t}: `)
	}
})

test('algebraic identity: log10(a * b) === log10(a) + log10(b) over dual numbers', () => {
	const pairs = [
		[{ v: 2.5, d: 0.7 }, { v: 4.2, d: -1.3 }],
		[{ v: 0.037, d: 0.002 }, { v: 812.5, d: 19.4 }],
		[{ v: 1e-50, d: 3e-51 }, { v: 1e75, d: -2e74 }],
	]

	for (const [a, b] of pairs) {
		const prod = { v: a.v * b.v, d: a.v * b.d + a.d * b.v }
		const lhs = log10DualRecursive(prod)
		const la = log10DualRecursive(a)
		const lb = log10DualRecursive(b)
		const rhs = { v: la.v + lb.v, d: la.d + lb.d }

		assertClose(lhs.v, rhs.v, 1e-13, 1e-14, 'product rule v: ')
		assertClose(lhs.d, rhs.d, 1e-13, 1e-14, 'product rule d: ')
	}
})
