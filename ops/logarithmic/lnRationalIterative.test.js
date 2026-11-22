import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { lnRationalIterative } from './lnRationalIterative.js'

/**
 * Helper: iterative GCD for verifying lowest-terms invariant.
 */
function gcd(a, b) {
	let x = a < 0n ? -a : a
	let y = b < 0n ? -b : b
	while (y !== 0n) {
		const r = x % y
		x = y
		y = r
	}
	return x
}

/**
 * Helper: convert a Rational { num, den } to a JS Number safely even when
 * num or den exceeds Number.MAX_VALUE.
 */
function rationalToNumber({ num, den }) {
	if (num === 0n) return 0
	const neg = num < 0n
	const absNum = neg ? -num : num
	const shift = BigInt(Math.max(0, Math.max(absNum.toString(2).length, den.toString(2).length) - 500))
	const val = Number(absNum >> shift) / Number(den >> shift)
	return neg ? -val : val
}

/**
 * Helper: assert the returned object is a valid reduced rational with den > 0n.
 */
function assertReducedRational(r) {
	assert.equal(typeof r, 'object')
	assert.notEqual(r, null)
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms, got ${r.num}/${r.den}`)
}

/**
 * Helper: exact rational addition a + b.
 */
function addRat(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Helper: exact rational subtraction a - b.
 */
function subRat(a, b) {
	return addRat(a, { num: -b.num, den: b.den })
}

/**
 * Helper: assert |a - b| < 1 / 10^digits using exact BigInt arithmetic.
 */
function assertRatClose(a, b, decimalDigits) {
	const diff = subRat(a, b)
	const absNum = diff.num < 0n ? -diff.num : diff.num
	const scale = 10n ** BigInt(decimalDigits)
	assert.ok(
		absNum * scale < diff.den,
		`expected |${a.num}/${a.den} - ${b.num}/${b.den}| < 10^-${decimalDigits}`
	)
}

describe('lnRationalIterative', () => {
	test('returns exact { num: 0n, den: 1n } for 1 and equivalent unreduced forms', () => {
		assert.deepEqual(lnRationalIterative({ num: 1n, den: 1n }), { num: 0n, den: 1n })
		assert.deepEqual(lnRationalIterative({ num: 7n, den: 7n }), { num: 0n, den: 1n })
		assert.deepEqual(lnRationalIterative({ num: -42n, den: -42n }), { num: 0n, den: 1n })
		assert.deepEqual(
			lnRationalIterative({ num: 10n ** 50n, den: 10n ** 50n }),
			{ num: 0n, den: 1n }
		)
	})

	test('normal cases > 1 match Math.log and reduced-rational invariants', () => {
		const cases = [
			{ num: 2n, den: 1n },
			{ num: 3n, den: 1n },
			{ num: 10n, den: 1n },
			{ num: 3n, den: 2n },
			{ num: 4n, den: 3n },
			{ num: 5n, den: 4n },
			{ num: 7n, den: 3n },
			{ num: 100n, den: 37n },
			// Unreduced & double-negative positive inputs
			{ num: 12n, den: 8n },
			{ num: -9n, den: -4n },
		]

		for (const x of cases) {
			const res = lnRationalIterative(x)
			assertReducedRational(res)
			assert.ok(res.num > 0n, `expected positive ln for ${x.num}/${x.den}`)
			const approx = rationalToNumber(res)
			const expected = Math.log(Number(x.num) / Number(x.den))
			assert.ok(
				Math.abs(approx - expected) < 1e-15,
				`ln(${x.num}/${x.den}): got ${approx}, expected ${expected}`
			)
		}
	})

	test('matches known high-precision constants for ln(2) and ln(10) to >35 decimal digits', () => {
		// ln(2) = 0.6931471805599453094172321214581765680755...
		const ln2Ref = {
			num: 69314718055994530941723212145817656808n,
			den: 10n ** 38n,
		}
		const ln2 = lnRationalIterative({ num: 2n, den: 1n })
		assertReducedRational(ln2)
		assertRatClose(ln2, ln2Ref, 36)

		// ln(10) = 2.3025850929940456840179914546843642076011...
		const ln10Ref = {
			num: 230258509299404568401799145468436420760n,
			den: 10n ** 38n,
		}
		const ln10 = lnRationalIterative({ num: 10n, den: 1n })
		assertReducedRational(ln10)
		assertRatClose(ln10, ln10Ref, 36)
	})

	test('fractions in (0, 1) produce negative reduced rationals matching Math.log', () => {
		const cases = [
			{ num: 1n, den: 2n },
			{ num: 1n, den: 3n },
			{ num: 2n, den: 3n },
			{ num: 3n, den: 4n },
			{ num: 1n, den: 10n },
			{ num: 37n, den: 100n },
		]

		for (const x of cases) {
			const res = lnRationalIterative(x)
			assertReducedRational(res)
			assert.ok(res.num < 0n, `expected negative ln for ${x.num}/${x.den}`)
			const approx = rationalToNumber(res)
			const expected = Math.log(Number(x.num) / Number(x.den))
			assert.ok(
				Math.abs(approx - expected) < 1e-15,
				`ln(${x.num}/${x.den}): got ${approx}, expected ${expected}`
			)
		}
	})

	test('cross-check: exact reciprocal symmetry ln(1/x) = -ln(x)', () => {
		const cases = [
			{ num: 2n, den: 1n },
			{ num: 3n, den: 2n },
			{ num: 7n, den: 5n },
			{ num: 1000n, den: 3n },
			{ num: 2n ** 50n, den: 3n ** 20n },
		]

		for (const x of cases) {
			const lnX = lnRationalIterative(x)
			const lnInv = lnRationalIterative({ num: x.den, den: x.num })
			assert.equal(lnInv.num, -lnX.num)
			assert.equal(lnInv.den, lnX.den)
		}
	})

	test('cross-check: logarithm algebraic identities ln(a*b)=ln(a)+ln(b), ln(a/b)=ln(a)-ln(b), ln(x^n)=n*ln(x)', () => {
		const pairs = [
			[
				{ num: 3n, den: 2n },
				{ num: 5n, den: 7n },
			],
			[
				{ num: 11n, den: 4n },
				{ num: 13n, den: 9n },
			],
			[
				{ num: 1000003n, den: 999983n },
				{ num: 17n, den: 3n },
			],
		]

		for (const [a, b] of pairs) {
			const lnA = lnRationalIterative(a)
			const lnB = lnRationalIterative(b)
			const lnProd = lnRationalIterative({ num: a.num * b.num, den: a.den * b.den })
			const lnQuot = lnRationalIterative({ num: a.num * b.den, den: a.den * b.num })
			assertRatClose(lnProd, addRat(lnA, lnB), 35)
			assertRatClose(lnQuot, subRat(lnA, lnB), 35)
		}

		// Power identity: ln((7/5)^13) = 13 * ln(7/5)
		const base = { num: 7n, den: 5n }
		const lnBase = lnRationalIterative(base)
		const lnPow = lnRationalIterative({ num: 7n ** 13n, den: 5n ** 13n })
		assertRatClose(lnPow, { num: 13n * lnBase.num, den: lnBase.den }, 34)

		// Cross-check ln(e) ~ 1 using a 35-digit rational approximation of e
		const eApprox = {
			num: 27182818284590452353602874713526625n,
			den: 10n ** 34n,
		}
		const lnE = lnRationalIterative(eApprox)
		assertRatClose(lnE, { num: 1n, den: 1n }, 33)
	})

	test('handles very large rationals, very small rationals, and rationals very close to 1', () => {
		// Exact powers of 2: ln(2^500) = 500 * ln(2)
		const ln2 = lnRationalIterative({ num: 2n, den: 1n })
		const ln2Pow500 = lnRationalIterative({ num: 1n << 500n, den: 1n })
		assertReducedRational(ln2Pow500)
		assertRatClose(ln2Pow500, { num: 500n * ln2.num, den: ln2.den }, 34)

		const ln2PowNeg500 = lnRationalIterative({ num: 1n, den: 1n << 500n })
		assert.equal(ln2PowNeg500.num, -ln2Pow500.num)
		assert.equal(ln2PowNeg500.den, ln2Pow500.den)

		// Large arbitrary rational: 10^100 / 3 = 100*ln(10) - ln(3)
		const lnBig = lnRationalIterative({ num: 10n ** 100n, den: 3n })
		const ln10 = lnRationalIterative({ num: 10n, den: 1n })
		const ln3 = lnRationalIterative({ num: 3n, den: 1n })
		assertReducedRational(lnBig)
		assertRatClose(lnBig, subRat({ num: 100n * ln10.num, den: ln10.den }, ln3), 34)

		// Very close to 1: ln(1 + 10^-50) ~ 10^-50 - 0.5 * 10^-100
		const epsDen = 10n ** 50n
		const nearOneAbove = lnRationalIterative({ num: epsDen + 1n, den: epsDen })
		assertReducedRational(nearOneAbove)
		assert.ok(nearOneAbove.num > 0n, 'should not underflow to 0 for 1 + 10^-50')
		const expectedNearOne = { num: 2n * epsDen - 1n, den: 2n * epsDen * epsDen }
		assertRatClose(nearOneAbove, expectedNearOne, 80)

		const nearOneBelow = lnRationalIterative({ num: epsDen - 1n, den: epsDen })
		assertReducedRational(nearOneBelow)
		assert.ok(nearOneBelow.num < 0n, 'should not underflow to 0 for 1 - 10^-50')
		const expectedNearOneBelow = { num: -(2n * epsDen + 1n), den: 2n * epsDen * epsDen }
		assertRatClose(nearOneBelow, expectedNearOneBelow, 80)
	})

	test('supports custom precisionBits parameter', () => {
		const ln2Ref60 = {
			num: 693147180559945309417232121458176568075500134360255254120680n,
			den: 10n ** 60n,
		}
		const ln2High = lnRationalIterative({ num: 2n, den: 1n }, 256)
		assertReducedRational(ln2High)
		assertRatClose(ln2High, ln2Ref60, 58)
	})

	test('throws on non-positive rationals and zero denominator', () => {
		const rangeErrorCases = [
			{ num: 0n, den: 1n },
			{ num: 0n, den: -5n },
			{ num: -1n, den: 1n },
			{ num: 1n, den: -1n },
			{ num: -3n, den: 7n },
			{ num: 3n, den: -7n },
			{ num: 1n, den: 0n },
			{ num: 0n, den: 0n },
			{ num: -1n, den: 0n },
		]

		for (const bad of rangeErrorCases) {
			assert.throws(() => lnRationalIterative(bad), RangeError)
		}
	})

	test('throws on invalid input types and invalid precisionBits', () => {
		const typeErrorCases = [
			null,
			undefined,
			2,
			'1/2',
			{},
			{ num: 1, den: 1n },
			{ num: 1n, den: 1 },
			{ num: 1n },
			{ den: 1n },
			[1n, 1n],
		]

		for (const bad of typeErrorCases) {
			assert.throws(() => lnRationalIterative(bad), TypeError)
		}

		assert.throws(() => lnRationalIterative({ num: 2n, den: 1n }, '128'), TypeError)
		assert.throws(() => lnRationalIterative({ num: 2n, den: 1n }, 128n), TypeError)
		assert.throws(() => lnRationalIterative({ num: 2n, den: 1n }, 0), RangeError)
		assert.throws(() => lnRationalIterative({ num: 2n, den: 1n }, -16), RangeError)
		assert.throws(() => lnRationalIterative({ num: 2n, den: 1n }, 1.5), RangeError)
		assert.throws(() => lnRationalIterative({ num: 2n, den: 1n }, Number.NaN), RangeError)
		assert.throws(() => lnRationalIterative({ num: 2n, den: 1n }, Number.POSITIVE_INFINITY), RangeError)
	})
})
