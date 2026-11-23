import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { lnRationalMemo } from './lnRationalMemo.js'

/**
 * Helper: greatest common divisor for BigInts.
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
 * Helper: verifies canonical lowest-terms invariants on a returned rational.
 */
function assertLowestTerms(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`)
	assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms for ${r.num}/${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	}
}

/**
 * Helper: converts `{ num, den }` to a JS Number for float cross-checks.
 */
function toNumber(r) {
	return Number(r.num) / Number(r.den)
}

/**
 * Helper: computes exact |a - b| <= tolNum / tolDen for rationals `a` and `b`.
 */
function assertRationalClose(a, b, tolNum, tolDen) {
	// |a.num/a.den - b.num/b.den| <= tolNum/tolDen
	const diffNum = a.num * b.den - b.num * a.den
	const absDiff = diffNum < 0n ? -diffNum : diffNum
	const denom = a.den * b.den
	assert.ok(
		absDiff * tolDen <= tolNum * denom,
		`expected ${a.num}/${a.den} to be within ${tolNum}/${tolDen} of ${b.num}/${b.den}`,
	)
}

/**
 * Helper: exact rational addition a + b.
 */
function addRational(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

/**
 * Independent BigInt evaluation of artanh(1 / m) scaled by `scale`
 * (used for Machin-like independent cross-checks).
 */
function independentArtanhReciprocal(m, scale) {
	const m2 = m * m
	let power = scale / m
	let sum = power
	for (let k = 3n; ; k += 2n) {
		power /= m2
		const term = power / k
		if (term === 0n) break
		sum += term
	}
	return sum
}

/**
 * Independent BigInt Mercator series for ln(1 + yNum / yDen) scaled by `scale`.
 * Converges for |yNum / yDen| < 1 without using any lookup table or artanh.
 */
function independentMercator(yNum, yDen, scale) {
	let power = (scale * yNum) / yDen
	let sum = power
	for (let k = 2n; ; k += 1n) {
		power = (power * yNum) / yDen
		const term = power / k
		if (term === 0n) break
		sum += k % 2n === 0n ? -term : term
	}
	return sum
}

describe('lnRationalMemo', () => {
	test('exact identity ln(1) = 0 across equivalent representations', () => {
		for (const input of [
			{ num: 1n, den: 1n },
			{ num: 5n, den: 5n },
			{ num: -7n, den: -7n },
			{ num: 10n ** 40n, den: 10n ** 40n },
		]) {
			const res = lnRationalMemo(input)
			assertLowestTerms(res)
			assert.deepEqual(res, { num: 0n, den: 1n })
		}
	})

	test('normal cases match Math.log to full double precision and stay in lowest terms', () => {
		const samples = [
			{ num: 2n, den: 1n },
			{ num: 3n, den: 1n },
			{ num: 10n, den: 1n },
			{ num: 1n, den: 2n },
			{ num: 1n, den: 10n },
			{ num: 3n, den: 2n },
			{ num: 2n, den: 3n },
			{ num: 5n, den: 4n },
			{ num: 101n, den: 100n },
			{ num: 99n, den: 100n },
			{ num: 355n, den: 113n },
			{ num: 1000000n, den: 1n },
			{ num: 1n, den: 1000000n },
			{ num: -6n, den: -4n }, // negative/negative -> 3/2
		]

		for (const x of samples) {
			const res = lnRationalMemo(x)
			assertLowestTerms(res)
			const expected = Math.log(Number(x.num) / Number(x.den))
			const actual = toNumber(res)
			assert.ok(
				Math.abs(actual - expected) < 1e-14,
				`ln(${x.num}/${x.den}): got ${actual}, expected ${expected}`,
			)
		}
	})

	test('exact reciprocal symmetry ln(p/q) = -ln(q/p)', () => {
		const pairs = [
			[2n, 1n],
			[7n, 3n],
			[129n, 64n],
			[997n, 503n],
			[10n ** 12n + 7n, 3n ** 20n],
		]
		for (const [p, q] of pairs) {
			const fwd = lnRationalMemo({ num: p, den: q }, 25)
			const inv = lnRationalMemo({ num: q, den: p }, 25)
			assertLowestTerms(fwd)
			assertLowestTerms(inv)
			assert.equal(inv.num, -fwd.num)
			assert.equal(inv.den, fwd.den)
		}
	})

	test('memoization consistency and defensive copy against caller mutation', () => {
		const r1 = lnRationalMemo({ num: 7n, den: 3n }, 20)
		const savedNum = r1.num
		const savedDen = r1.den

		// Mutate returned object to verify cache integrity
		r1.num = 999999n
		r1.den = 1n

		// Equivalent unreduced and double-negative inputs must return uncorrupted cached result
		const r2 = lnRationalMemo({ num: 14n, den: 6n }, 20)
		const r3 = lnRationalMemo({ num: -21n, den: -9n }, 20)
		assert.deepEqual(r2, { num: savedNum, den: savedDen })
		assert.deepEqual(r3, { num: savedNum, den: savedDen })
	})

	test('edge cases: values very close to 1, huge powers of 2, and extreme precision', () => {
		// Very close to 1: ln(1 + 10^-25) ~ 10^-25 - 0.5*10^-50
		const tinyEps = { num: 10n ** 25n + 1n, den: 10n ** 25n }
		const resLow = lnRationalMemo(tinyEps, 18)
		assert.deepEqual(resLow, { num: 0n, den: 1n })

		const resHigh = lnRationalMemo(tinyEps, 35)
		assertLowestTerms(resHigh)
		assertRationalClose(resHigh, { num: 1n, den: 10n ** 25n }, 1n, 10n ** 34n)

		// Very large rational: 2^1000 -> ln(2^1000) = 1000 * ln(2)
		const ln2 = lnRationalMemo({ num: 2n, den: 1n }, 30)
		const ln2Pow1000 = lnRationalMemo({ num: 1n << 1000n, den: 1n }, 25)
		assertLowestTerms(ln2Pow1000)
		assertRationalClose(
			ln2Pow1000,
			{ num: ln2.num * 1000n, den: ln2.den },
			1n,
			10n ** 24n,
		)

		// Very small rational: 2^-1000 -> -1000 * ln(2)
		const ln2PowNeg1000 = lnRationalMemo({ num: 1n, den: 1n << 1000n }, 25)
		assert.equal(ln2PowNeg1000.num, -ln2Pow1000.num)
		assert.equal(ln2PowNeg1000.den, ln2Pow1000.den)

		// Table boundary points (64 + i)/64 for all i = 0..64
		for (let i = 0; i <= 64; i++) {
			const res = lnRationalMemo({ num: BigInt(64 + i), den: 64n }, 18)
			assertLowestTerms(res)
			const expected = Math.log((64 + i) / 64)
			assert.ok(Math.abs(toNumber(res) - expected) < 1e-15)
		}

		// Precision = 1 minimum valid precision
		const coarse = lnRationalMemo({ num: 2n, den: 1n }, 1)
		assertLowestTerms(coarse)
		assert.deepEqual(coarse, { num: 7n, den: 10n })
	})

	test('independent cross-check: Machin-like identity for ln(2) to 50 digits', () => {
		// Exact identity: 2 = (27/25)^9 * (4800/4802) * (8750/8748)^4
		// => ln(2) = 18*artanh(1/26) - 2*artanh(1/4801) + 8*artanh(1/8749)
		const digits = 50
		const guard = 10
		const scale = 10n ** BigInt(digits + guard)
		const independentLn2Scaled =
			18n * independentArtanhReciprocal(26n, scale) -
			2n * independentArtanhReciprocal(4801n, scale) +
			8n * independentArtanhReciprocal(8749n, scale)
		const drop = 10n ** BigInt(guard)
		const expectedNum = (independentLn2Scaled + drop / 2n) / drop
		const expected = { num: expectedNum, den: 10n ** BigInt(digits) }

		const actual = lnRationalMemo({ num: 2n, den: 1n }, digits)
		assertLowestTerms(actual)
		assertRationalClose(actual, expected, 1n, 10n ** BigInt(digits))
	})

	test('independent cross-check: Mercator series for ln(11/10) and ln(9/10) to 40 digits', () => {
		const digits = 40
		const guard = 10
		const scale = 10n ** BigInt(digits + guard)
		const drop = 10n ** BigInt(guard)

		// ln(11/10) = ln(1 + 1/10)
		const mercPos = independentMercator(1n, 10n, scale)
		const expPos = { num: (mercPos + drop / 2n) / drop, den: 10n ** BigInt(digits) }
		const actPos = lnRationalMemo({ num: 11n, den: 10n }, digits)
		assertLowestTerms(actPos)
		assertRationalClose(actPos, expPos, 1n, 10n ** BigInt(digits))

		// ln(9/10) = ln(1 - 1/10)
		const mercNeg = independentMercator(-1n, 10n, scale)
		const expNeg = { num: -((-mercNeg + drop / 2n) / drop), den: 10n ** BigInt(digits) }
		const actNeg = lnRationalMemo({ num: 9n, den: 10n }, digits)
		assertLowestTerms(actNeg)
		assertRationalClose(actNeg, expNeg, 1n, 10n ** BigInt(digits))
	})

	test('independent cross-check: ln(e) = 1 via rational factorial series for e', () => {
		// e = sum_{k=0}^{32} 1 / k! is accurate to > 35 decimal digits
		let fact = 1n
		let eNum = 1n
		for (let k = 1n; k <= 32n; k++) {
			fact *= k
			eNum = eNum * k + 1n
		}
		// eNum / fact approximates e to > 35 digits
		const res = lnRationalMemo({ num: eNum, den: fact }, 30)
		assertLowestTerms(res)
		assert.deepEqual(res, { num: 1n, den: 1n })
	})

	test('algebraic cross-check: product and power laws in exact rational arithmetic', () => {
		const a = { num: 7n, den: 5n }
		const b = { num: 13n, den: 11n }
		const ab = { num: a.num * b.num, den: a.den * b.den }

		const lnA = lnRationalMemo(a, 24)
		const lnB = lnRationalMemo(b, 24)
		const lnAB = lnRationalMemo(ab, 24)
		assertRationalClose(lnAB, addRational(lnA, lnB), 2n, 10n ** 24n)

		// Power law: ln((3/5)^7) = 7 * ln(3/5)
		const base = { num: 3n, den: 5n }
		const pow7 = { num: 3n ** 7n, den: 5n ** 7n }
		const lnBase = lnRationalMemo(base, 24)
		const lnPow7 = lnRationalMemo(pow7, 24)
		assertRationalClose(
			lnPow7,
			{ num: lnBase.num * 7n, den: lnBase.den },
			8n,
			10n ** 24n,
		)
	})

	test('input validation rejects invalid rationals, non-positive values, and invalid precision', () => {
		// Non-object / wrong shape
		assert.throws(() => lnRationalMemo(null), TypeError)
		assert.throws(() => lnRationalMemo(undefined), TypeError)
		assert.throws(() => lnRationalMemo(2), TypeError)
		assert.throws(() => lnRationalMemo('1/2'), TypeError)
		assert.throws(() => lnRationalMemo([1n, 2n]), TypeError)
		assert.throws(() => lnRationalMemo({}), TypeError)
		assert.throws(() => lnRationalMemo({ num: 1, den: 2n }), TypeError)
		assert.throws(() => lnRationalMemo({ num: 1n, den: 2 }), TypeError)

		// Zero denominator
		assert.throws(() => lnRationalMemo({ num: 1n, den: 0n }), RangeError)
		assert.throws(() => lnRationalMemo({ num: 0n, den: 0n }), RangeError)

		// Non-positive rationals
		assert.throws(() => lnRationalMemo({ num: 0n, den: 1n }), RangeError)
		assert.throws(() => lnRationalMemo({ num: -1n, den: 2n }), RangeError)
		assert.throws(() => lnRationalMemo({ num: 1n, den: -2n }), RangeError)

		// Invalid precision
		assert.throws(() => lnRationalMemo({ num: 2n, den: 1n }, '18'), TypeError)
		assert.throws(() => lnRationalMemo({ num: 2n, den: 1n }, 18n), TypeError)
		assert.throws(() => lnRationalMemo({ num: 2n, den: 1n }, 0), RangeError)
		assert.throws(() => lnRationalMemo({ num: 2n, den: 1n }, -5), RangeError)
		assert.throws(() => lnRationalMemo({ num: 2n, den: 1n }, 1.5), RangeError)
		assert.throws(() => lnRationalMemo({ num: 2n, den: 1n }, Number.NaN), RangeError)
		assert.throws(() => lnRationalMemo({ num: 2n, den: 1n }, Number.POSITIVE_INFINITY), RangeError)
	})
})
