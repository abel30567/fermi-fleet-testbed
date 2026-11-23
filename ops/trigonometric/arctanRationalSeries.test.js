import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arctanRationalSeries } from './arctanRationalSeries.js'

function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function assertNormalized(r) {
	assert.equal(typeof r, 'object')
	assert.notEqual(r, null)
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	assert.equal(gcd(r.num, r.den), 1n, `expected gcd(|num|, den) === 1n for ${r.num}/${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	}
}

/**
 * Safely convert an arbitrarily large exact rational to a JS Number without
 * intermediate Infinity/Infinity overflow.
 */
function rationalToNumber({ num, den }) {
	const SCALE = 10n ** 18n
	const scaled = (num * SCALE) / den
	return Number(scaled) / 1e18
}

function addRational(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

function subRational(a, b) {
	return addRational(a, { num: -b.num, den: b.den })
}

test('arctanRationalSeries returns exact 0/1 for zero inputs', () => {
	for (const input of [
		{ num: 0n, den: 1n },
		{ num: 0n, den: 7n },
		{ num: 0n, den: -5n },
	]) {
		const res = arctanRationalSeries(input)
		assertNormalized(res)
		assert.deepEqual(res, { num: 0n, den: 1n })
	}
})

test('arctanRationalSeries matches exact Taylor partial sums for small |x| <= 1/5', () => {
	const x = { num: 1n, den: 10n }
	// 1 term: 1/10
	assert.deepEqual(arctanRationalSeries(x, 1), { num: 1n, den: 10n })
	// 2 terms: 1/10 - 1/3000 = 299/3000
	assert.deepEqual(arctanRationalSeries(x, 2), { num: 299n, den: 3000n })
	// 3 terms: 299/3000 + 1/500000 = (299*500 + 3) / 1500000 = 149503/1500000
	assert.deepEqual(arctanRationalSeries(x, 3), { num: 149503n, den: 1500000n })
})

test('arctanRationalSeries normalizes unreduced and negative-denominator inputs', () => {
	const a = arctanRationalSeries({ num: 1n, den: 2n })
	const b = arctanRationalSeries({ num: 6n, den: 12n })
	const c = arctanRationalSeries({ num: -3n, den: -6n })
	assertNormalized(a)
	assertNormalized(b)
	assertNormalized(c)
	assert.deepEqual(a, b)
	assert.deepEqual(a, c)

	const neg1 = arctanRationalSeries({ num: -1n, den: 2n })
	const neg2 = arctanRationalSeries({ num: 1n, den: -2n })
	assertNormalized(neg1)
	assertNormalized(neg2)
	assert.deepEqual(neg1, neg2)
	assert.deepEqual(neg1, { num: -a.num, den: a.den })
})

test('arctanRationalSeries preserves exact odd symmetry across all regimes', () => {
	const samples = [
		{ num: 1n, den: 239n },
		{ num: 1n, den: 5n },
		{ num: 1n, den: 3n },
		{ num: 1n, den: 2n },
		{ num: 3n, den: 4n },
		{ num: 1n, den: 1n },
		{ num: 3n, den: 2n },
		{ num: 7n, den: 1n },
		{ num: 1000n, den: 1n },
	]
	for (const x of samples) {
		const pos = arctanRationalSeries(x)
		const neg = arctanRationalSeries({ num: -x.num, den: x.den })
		assertNormalized(pos)
		assertNormalized(neg)
		assert.deepEqual(neg, { num: -pos.num, den: pos.den })
	}
})

test('arctanRationalSeries cross-check against Math.atan across small, medium, unit, and large rationals', () => {
	const samples = [
		{ num: 1n, den: 1000000n },
		{ num: 1n, den: 239n },
		{ num: 1n, den: 10n },
		{ num: 1n, den: 5n },
		{ num: 1n, den: 4n },
		{ num: 1n, den: 3n },
		{ num: 2n, den: 5n },
		{ num: 1n, den: 2n },
		{ num: 2n, den: 3n },
		{ num: 3n, den: 4n },
		{ num: 9n, den: 10n },
		{ num: 1n, den: 1n },
		{ num: 11n, den: 10n },
		{ num: 3n, den: 2n },
		{ num: 2n, den: 1n },
		{ num: 10n, den: 1n },
		{ num: 1000n, den: 1n },
		{ num: 1000000n, den: 1n },
		{ num: -5n, den: 3n },
		{ num: -355n, den: 113n },
	]
	for (const x of samples) {
		const res = arctanRationalSeries(x)
		assertNormalized(res)
		const got = rationalToNumber(res)
		const expected = Math.atan(Number(x.num) / Number(x.den))
		assert.ok(
			Math.abs(got - expected) < 1e-14,
			`arctan(${x.num}/${x.den}): got ${got}, expected ${expected}`
		)
	}
})

test('arctanRationalSeries cross-check: Machin formula 4*arctan(1/5) - arctan(1/239) ≈ pi/4', () => {
	const a = arctanRationalSeries({ num: 1n, den: 5n }, 16)
	const b = arctanRationalSeries({ num: 1n, den: 239n }, 16)
	assertNormalized(a)
	assertNormalized(b)

	const machin = subRational({ num: 4n * a.num, den: a.den }, b)
	assertNormalized(machin)

	// Compare against Math.PI / 4
	const machinFloat = rationalToNumber(machin)
	assert.ok(Math.abs(machinFloat - Math.PI / 4) < 1e-15)

	// Exact equality with arctan(1) at the same term count
	const atOne = arctanRationalSeries({ num: 1n, den: 1n }, 16)
	assert.deepEqual(machin, atOne)

	// Verify 20 exact decimal digits of pi (4 * machin):
	// pi = 3.14159265358979323846...
	const piScaled = (16n * machin.num * 10n ** 20n) / (4n * machin.den)
	assert.equal(piScaled, 314159265358979323846n)
})

test('arctanRationalSeries cross-check: Euler and tangent-addition identities', () => {
	// Euler's identity: arctan(1/2) + arctan(1/3) = arctan(1) = pi/4
	const a12 = arctanRationalSeries({ num: 1n, den: 2n })
	const a13 = arctanRationalSeries({ num: 1n, den: 3n })
	const sumEuler = addRational(a12, a13)
	assert.ok(Math.abs(rationalToNumber(sumEuler) - Math.PI / 4) < 1e-15)

	// Complementary identity: arctan(x) + arctan(1/x) = pi/2 for x > 0
	for (const x of [
		{ num: 3n, den: 7n },
		{ num: 5n, den: 2n },
		{ num: 17n, den: 13n },
	]) {
		const inv = { num: x.den, den: x.num }
		const sum = addRational(arctanRationalSeries(x), arctanRationalSeries(inv))
		assert.ok(Math.abs(rationalToNumber(sum) - Math.PI / 2) < 1e-15)
	}

	// General addition formula: arctan(1/7) + arctan(3/11) = arctan((1/7 + 3/11) / (1 - 3/77)) = arctan(16/37)
	const lhs = addRational(
		arctanRationalSeries({ num: 1n, den: 7n }),
		arctanRationalSeries({ num: 3n, den: 11n })
	)
	const rhs = arctanRationalSeries({ num: 16n, den: 37n })
	assert.ok(Math.abs(rationalToNumber(subRational(lhs, rhs))) < 1e-15)
})

test('arctanRationalSeries handles very large BigInt inputs without overflow', () => {
	const huge = { num: 10n ** 30n, den: 1n }
	const res = arctanRationalSeries(huge)
	assertNormalized(res)
	assert.ok(Math.abs(rationalToNumber(res) - Math.PI / 2) < 1e-15)

	const tiny = { num: 1n, den: 10n ** 30n }
	const resTiny = arctanRationalSeries(tiny, 3)
	assertNormalized(resTiny)
	// arctan(1e-30) ≈ 1e-30 - 1e-90/3
	assert.ok(resTiny.num > 0n && resTiny.num * 10n ** 30n < resTiny.den)
})

test('arctanRationalSeries validates invalid inputs', () => {
	for (const bad of [
		null,
		undefined,
		0,
		1.5,
		'1/2',
		true,
		[1n, 2n],
		{},
		{ num: 1, den: 2n },
		{ num: 1n, den: 2 },
		{ num: '1', den: '2' },
		{ num: 1n },
		{ den: 2n },
	]) {
		assert.throws(() => arctanRationalSeries(bad), TypeError)
	}

	assert.throws(() => arctanRationalSeries({ num: 1n, den: 0n }), RangeError)
	assert.throws(() => arctanRationalSeries({ num: 0n, den: 0n }), RangeError)

	for (const badTerms of ['10', 10n, null, {}, true]) {
		assert.throws(() => arctanRationalSeries({ num: 1n, den: 2n }, badTerms), TypeError)
	}

	for (const badTerms of [0, -1, -5, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
		assert.throws(() => arctanRationalSeries({ num: 1n, den: 2n }, badTerms), RangeError)
	}

	// Ensure terms validation still triggers even when x === 0
	assert.throws(() => arctanRationalSeries({ num: 0n, den: 1n }, 0), RangeError)
})
