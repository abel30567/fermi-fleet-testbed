import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arcsinRationalSeries } from './arcsinRationalSeries.js'

function absBigInt(n) {
	return n < 0n ? -n : n
}

function gcdBigInt(a, b) {
	let x = absBigInt(a)
	let y = absBigInt(b)
	while (y !== 0n) {
		const t = x % y
		x = y
		y = t
	}
	return x
}

function assertNormalizedRational(r) {
	assert.equal(typeof r, 'object')
	assert.notEqual(r, null)
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	assert.equal(gcdBigInt(r.num, r.den), 1n, `expected lowest terms for ${r.num}/${r.den}`)
}

function rationalToNumber({ num, den }) {
	const scale = 10n ** 18n
	return Number((num * scale) / den) / 1e18
}

function addRationals(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	const g = gcdBigInt(num, den)
	return { num: num / g, den: den / g }
}

test('zero input returns exact 0/1', () => {
	const res = arcsinRationalSeries({ num: 0n, den: 1n })
	assertNormalizedRational(res)
	assert.deepEqual(res, { num: 0n, den: 1n })

	const resUnreduced = arcsinRationalSeries({ num: 0n, den: -7n })
	assert.deepEqual(resUnreduced, { num: 0n, den: 1n })
})

test('exact low-order Maclaurin partial sums match closed-form coefficients', () => {
	// 1 term: arcsin(x) ≈ x
	assert.deepEqual(arcsinRationalSeries({ num: 1n, den: 2n }, 1), { num: 1n, den: 2n })

	// 2 terms: x + x^3 / 6 -> 1/2 + 1/48 = 25/48
	assert.deepEqual(arcsinRationalSeries({ num: 1n, den: 2n }, 2), { num: 25n, den: 48n })

	// 3 terms: x + x^3/6 + 3x^5/40 -> 25/48 + 3/1280 = (2000 + 9) / 3840 = 2009/3840
	assert.deepEqual(arcsinRationalSeries({ num: 1n, den: 2n }, 3), { num: 2009n, den: 3840n })

	// 4 terms at x = 1/3: 1/3 + 1/162 + 1/3240 + 5/244944
	const t4 = arcsinRationalSeries({ num: 1n, den: 3n }, 4)
	assertNormalizedRational(t4)
	const expected = 1 / 3 + 1 / (6 * 27) + 3 / (40 * 243) + 5 / (112 * 2187)
	assert.ok(Math.abs(rationalToNumber(t4) - expected) < 1e-15)
})

test('normalizes unreduced and negative-denominator inputs', () => {
	const a = arcsinRationalSeries({ num: 1n, den: 2n }, 10)
	const b = arcsinRationalSeries({ num: 6n, den: 12n }, 10)
	const c = arcsinRationalSeries({ num: -6n, den: -12n }, 10)
	assertNormalizedRational(a)
	assert.deepEqual(a, b)
	assert.deepEqual(a, c)

	const negA = arcsinRationalSeries({ num: -1n, den: 2n }, 10)
	const negB = arcsinRationalSeries({ num: 3n, den: -6n }, 10)
	assertNormalizedRational(negA)
	assert.deepEqual(negA, negB)
	assert.deepEqual(negA, { num: -a.num, den: a.den })
})

test('odd function symmetry: arcsin(-x) === -arcsin(x)', () => {
	const points = [
		{ num: 1n, den: 10n },
		{ num: 1n, den: 2n },
		{ num: 3n, den: 5n },
		{ num: 4n, den: 5n },
		{ num: 7n, den: 10n },
		{ num: 1n, den: 1n },
	]
	for (const x of points) {
		const pos = arcsinRationalSeries(x)
		const neg = arcsinRationalSeries({ num: -x.num, den: x.den })
		assertNormalizedRational(pos)
		assertNormalizedRational(neg)
		assert.deepEqual(neg, { num: -pos.num, den: pos.den })
	}
})

test('endpoints x = 1 and x = -1 converge accurately to ±pi/2', () => {
	const posOne = arcsinRationalSeries({ num: 1n, den: 1n })
	const negOne = arcsinRationalSeries({ num: -1n, den: 1n })
	assertNormalizedRational(posOne)
	assertNormalizedRational(negOne)
	assert.ok(Math.abs(rationalToNumber(posOne) - Math.PI / 2) < 1e-14)
	assert.ok(Math.abs(rationalToNumber(negOne) + Math.PI / 2) < 1e-14)
	assert.deepEqual(negOne, { num: -posOne.num, den: posOne.den })
})

test('exact complementary identity for Pythagorean triples: arcsin(a/c) + arcsin(b/c) === arcsin(1)', () => {
	const piOver2 = arcsinRationalSeries({ num: 1n, den: 1n }, 20)
	const triples = [
		[3n, 4n, 5n],
		[5n, 12n, 13n],
		[7n, 24n, 25n],
	]
	for (const [a, b, c] of triples) {
		const r1 = arcsinRationalSeries({ num: a, den: c }, 20)
		const r2 = arcsinRationalSeries({ num: b, den: c }, 20)
		assertNormalizedRational(r1)
		assertNormalizedRational(r2)
		assert.deepEqual(addRationals(r1, r2), piOver2)
	}
})

test('independent cross-check against Math.asin and sin(arcsin(x)) ≈ x', () => {
	const samples = [
		{ num: -9n, den: 10n, tol: 1e-4 },
		{ num: -4n, den: 5n, tol: 1e-12 },
		{ num: -3n, den: 5n, tol: 1e-12 },
		{ num: -1n, den: 2n, tol: 1e-14 },
		{ num: -1n, den: 7n, tol: 1e-15 },
		{ num: 0n, den: 1n, tol: 0 },
		{ num: 1n, den: 100n, tol: 1e-15 },
		{ num: 1n, den: 4n, tol: 1e-15 },
		{ num: 1n, den: 2n, tol: 1e-14 },
		{ num: 3n, den: 5n, tol: 1e-12 },
		{ num: 4n, den: 5n, tol: 1e-12 },
		{ num: 24n, den: 25n, tol: 1e-14 },
		{ num: 9n, den: 10n, tol: 1e-4 },
		{ num: 1n, den: 1n, tol: 1e-14 },
	]

	for (const { num, den, tol } of samples) {
		const res = arcsinRationalSeries({ num, den })
		assertNormalizedRational(res)
		const xFloat = Number(num) / Number(den)
		const approx = rationalToNumber(res)
		const expected = Math.asin(xFloat)
		assert.ok(
			Math.abs(approx - expected) <= tol,
			`x=${num}/${den}: got ${approx}, expected ${expected} (tol ${tol})`,
		)
		assert.ok(
			Math.abs(Math.sin(approx) - xFloat) <= tol,
			`sin(arcsin(${num}/${den})) = ${Math.sin(approx)}, expected ${xFloat}`,
		)
	}
})

test('monotonic convergence as terms increases', () => {
	const x = { num: 7n, den: 10n }
	const target = Math.asin(0.7)
	let prevErr = Infinity
	for (const n of [1, 3, 6, 12, 20]) {
		const res = arcsinRationalSeries(x, n)
		assertNormalizedRational(res)
		const err = Math.abs(rationalToNumber(res) - target)
		assert.ok(err < prevErr, `expected error to decrease at terms=${n}: ${err} vs ${prevErr}`)
		prevErr = err
	}
})

test('invalid inputs throw descriptive TypeError or RangeError', () => {
	// Non-object x
	assert.throws(() => arcsinRationalSeries(null), TypeError)
	assert.throws(() => arcsinRationalSeries(undefined), TypeError)
	assert.throws(() => arcsinRationalSeries(0.5), TypeError)
	assert.throws(() => arcsinRationalSeries('1/2'), TypeError)

	// Non-BigInt num or den
	assert.throws(() => arcsinRationalSeries({ num: 1, den: 2n }), TypeError)
	assert.throws(() => arcsinRationalSeries({ num: 1n, den: 2 }), TypeError)
	assert.throws(() => arcsinRationalSeries({ num: '1', den: '2' }), TypeError)
	assert.throws(() => arcsinRationalSeries({}), TypeError)

	// Zero denominator
	assert.throws(() => arcsinRationalSeries({ num: 1n, den: 0n }), RangeError)
	assert.throws(() => arcsinRationalSeries({ num: 0n, den: 0n }), RangeError)

	// Out of domain |x| > 1
	assert.throws(() => arcsinRationalSeries({ num: 2n, den: 1n }), RangeError)
	assert.throws(() => arcsinRationalSeries({ num: -3n, den: 2n }), RangeError)
	assert.throws(() => arcsinRationalSeries({ num: 101n, den: 100n }), RangeError)
	assert.throws(() => arcsinRationalSeries({ num: 101n, den: -100n }), RangeError)

	// Invalid terms
	assert.throws(() => arcsinRationalSeries({ num: 1n, den: 2n }, '5'), TypeError)
	assert.throws(() => arcsinRationalSeries({ num: 1n, den: 2n }, 5n), TypeError)
	assert.throws(() => arcsinRationalSeries({ num: 1n, den: 2n }, 0), RangeError)
	assert.throws(() => arcsinRationalSeries({ num: 1n, den: 2n }, -3), RangeError)
	assert.throws(() => arcsinRationalSeries({ num: 1n, den: 2n }, 2.5), RangeError)
	assert.throws(() => arcsinRationalSeries({ num: 1n, den: 2n }, NaN), RangeError)
	assert.throws(() => arcsinRationalSeries({ num: 1n, den: 2n }, Infinity), RangeError)
})
