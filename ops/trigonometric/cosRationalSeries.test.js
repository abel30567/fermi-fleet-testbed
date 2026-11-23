import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { cosRationalSeries } from './cosRationalSeries.js'

/**
 * Helper: GCD of two BigInts for verifying lowest-terms invariants.
 */
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

/**
 * Helper: asserts a rational is strictly normalized ({ num: bigint, den: bigint }, den > 0n, gcd === 1n).
 */
function assertNormalized(q) {
	assert.equal(typeof q.num, 'bigint')
	assert.equal(typeof q.den, 'bigint')
	assert.ok(q.den > 0n, `Expected den > 0n, got ${q.den}`)
	assert.equal(gcd(q.num, q.den), 1n, `Expected gcd(|${q.num}|, ${q.den}) === 1n`)
}

/**
 * Helper: converts an arbitrarily large exact rational to a JS Number without overflow.
 */
function rationalToNumber({ num, den }) {
	const scale = 10n ** 18n
	return Number((num * scale) / den) / 1e18
}

/**
 * Helper: exact rational arithmetic for identity cross-checks.
 */
function mulRational(a, b) {
	const num = a.num * b.num
	const den = a.den * b.den
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

function addRational(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	if (num === 0n) return { num: 0n, den: 1n }
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

function subRational(a, b) {
	return addRational(a, { num: -b.num, den: b.den })
}

/**
 * Independent Maclaurin series for sin(x) used solely to cross-check cos^2(x) + sin^2(x) = 1.
 */
function sinRationalSeriesRef(x, terms) {
	let sum = { num: 0n, den: 1n }
	let xPowNum = x.num
	let xPowDen = x.den
	let fact = 1n
	for (let k = 0; k < terms; k++) {
		if (k > 0) {
			xPowNum *= x.num * x.num
			xPowDen *= x.den * x.den
			fact *= BigInt(2 * k) * BigInt(2 * k + 1)
		}
		const sign = k % 2 === 0 ? 1n : -1n
		sum = addRational(sum, { num: sign * xPowNum, den: xPowDen * fact })
	}
	return sum
}

describe('cosRationalSeries', () => {
	test('exact partial sums for known Maclaurin terms', () => {
		const one = { num: 1n, den: 1n }
		assert.deepEqual(cosRationalSeries(one, 1), { num: 1n, den: 1n })
		assert.deepEqual(cosRationalSeries(one, 2), { num: 1n, den: 2n })
		assert.deepEqual(cosRationalSeries(one, 3), { num: 13n, den: 24n })
		assert.deepEqual(cosRationalSeries(one, 4), { num: 389n, den: 720n })

		// x = 1/2, terms = 3: 1 - (1/4)/2 + (1/16)/24 = 1 - 1/8 + 1/384 = 337/384
		assert.deepEqual(cosRationalSeries({ num: 1n, den: 2n }, 3), { num: 337n, den: 384n })

		// x = 2, terms = 2: 1 - 4/2 = -1 (verifies reduction from -2/2 to -1/1)
		assert.deepEqual(cosRationalSeries({ num: 2n, den: 1n }, 2), { num: -1n, den: 1n })
	})

	test('edge cases: zero, unnormalized inputs, negative denominators, tiny and large inputs', () => {
		// Zero in various representations
		for (const zero of [
			{ num: 0n, den: 1n },
			{ num: 0n, den: 42n },
			{ num: 0n, den: -7n },
		]) {
			const res = cosRationalSeries(zero)
			assertNormalized(res)
			assert.deepEqual(res, { num: 1n, den: 1n })
		}

		// Equivalent unnormalized inputs yield identical normalized outputs
		const base = cosRationalSeries({ num: 1n, den: 2n }, 8)
		assertNormalized(base)
		for (const equiv of [
			{ num: 2n, den: 4n },
			{ num: -3n, den: -6n },
			{ num: 1n, den: -2n },
			{ num: -5n, den: 10n },
		]) {
			const res = cosRationalSeries(equiv, 8)
			assertNormalized(res)
			assert.deepEqual(res, base)
		}

		// terms = 1 always returns 1/1 for any valid rational
		assert.deepEqual(cosRationalSeries({ num: 999n, den: 7n }, 1), { num: 1n, den: 1n })

		// Very small angle x = 10^-12: cos(x) = 1 - x^2/2 + ...
		const tiny = cosRationalSeries({ num: 1n, den: 10n ** 12n }, 2)
		assertNormalized(tiny)
		assert.deepEqual(tiny, { num: 2n * 10n ** 24n - 1n, den: 2n * 10n ** 24n })

		// Larger angle with sufficient terms (tests periodic reduction path k >= 16)
		const atTen = cosRationalSeries({ num: 10n, den: 1n }, 36)
		assertNormalized(atTen)
		assert.ok(Math.abs(rationalToNumber(atTen) - Math.cos(10)) < 1e-14)
	})

	test('input validation rejects invalid x and invalid terms', () => {
		// Invalid x types
		for (const badX of [
			null,
			undefined,
			0,
			1,
			'1/2',
			1n,
			[],
			{},
			{ num: 1, den: 2n },
			{ num: 1n, den: 2 },
			{ num: '1', den: '2' },
			{ num: 1n },
			{ den: 2n },
		]) {
			assert.throws(() => cosRationalSeries(badX), TypeError)
		}

		// Zero denominator
		assert.throws(() => cosRationalSeries({ num: 1n, den: 0n }), RangeError)
		assert.throws(() => cosRationalSeries({ num: 0n, den: 0n }), RangeError)

		// Invalid terms (non-number / NaN -> TypeError)
		for (const badTerms of [NaN, '10', 10n, null, {}, []]) {
			assert.throws(() => cosRationalSeries({ num: 1n, den: 2n }, badTerms), TypeError)
		}

		// Invalid terms (non-integer / out of range -> RangeError)
		for (const badTerms of [0, -1, -100, 1.5, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => cosRationalSeries({ num: 1n, den: 2n }, badTerms), RangeError)
		}
	})

	test('cross-check against Math.cos across [-2π, 2π]', () => {
		const samples = [
			{ num: 0n, den: 1n },
			{ num: 1n, den: 4n },
			{ num: 1n, den: 2n },
			{ num: 1n, den: 1n },
			{ num: 3n, den: 2n },
			{ num: 355n, den: 226n }, // ≈ π/2
			{ num: 2n, den: 1n },
			{ num: 355n, den: 113n }, // ≈ π
			{ num: -5n, den: 3n },
			{ num: -22n, den: 7n },
			{ num: 6n, den: 1n },
		]

		for (const x of samples) {
			const res = cosRationalSeries(x)
			assertNormalized(res)
			const actual = rationalToNumber(res)
			const expected = Math.cos(Number(x.num) / Number(x.den))
			assert.ok(
				Math.abs(actual - expected) < 1e-14,
				`Mismatch for x=${x.num}/${x.den}: got ${actual}, expected ${expected}`
			)
		}
	})

	test('trigonometric identities: evenness, double-angle, Pythagorean, and alternating bounds', () => {
		const x = { num: 3n, den: 5n }
		const negX = { num: -3n, den: 5n }
		const twoX = { num: 6n, den: 5n }

		// 1. Exact evenness: cos(-x) === cos(x)
		assert.deepEqual(cosRationalSeries(negX), cosRationalSeries(x))
		assert.deepEqual(cosRationalSeries(negX, 7), cosRationalSeries(x, 7))

		// 2. Double-angle identity in exact rational arithmetic: |cos(2x) - (2*cos^2(x) - 1)| < 10^-25
		const cosX = cosRationalSeries(x, 20)
		const cos2X = cosRationalSeries(twoX, 20)
		const rhsDouble = subRational(mulRational({ num: 2n, den: 1n }, mulRational(cosX, cosX)), {
			num: 1n,
			den: 1n,
		})
		const diffDouble = subRational(cos2X, rhsDouble)
		const absDiffDoubleNum = diffDouble.num < 0n ? -diffDouble.num : diffDouble.num
		assert.ok(absDiffDoubleNum * 10n ** 25n < diffDouble.den)

		// 3. Pythagorean identity: |cos^2(x) + sin^2(x) - 1| < 10^-25
		const sinX = sinRationalSeriesRef(x, 20)
		const pythag = addRational(mulRational(cosX, cosX), mulRational(sinX, sinX))
		const diffPythag = subRational(pythag, { num: 1n, den: 1n })
		const absDiffPythagNum = diffPythag.num < 0n ? -diffPythag.num : diffPythag.num
		assert.ok(absDiffPythagNum * 10n ** 25n < diffPythag.den)

		// 4. Alternating series bounds for |x| <= 1: S_{2m} < cos(x) < S_{2m+1}
		const lower = cosRationalSeries(x, 4) // ends on negative term -x^6/6!
		const upper = cosRationalSeries(x, 5) // ends on positive term +x^8/8!
		const ref = Math.cos(3 / 5)
		assert.ok(rationalToNumber(lower) < ref && ref < rationalToNumber(upper))
	})
})
