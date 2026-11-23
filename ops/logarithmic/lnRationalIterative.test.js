import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { lnRationalIterative } from './lnRationalIterative.js'

/**
 * Helper: GCD of two BigInts for verifying lowest-terms invariants.
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
 * Helper: Convert a rational `{ num, den }` to a JS Number accurately even when
 * `num` and `den` exceed Number.MAX_SAFE_INTEGER.
 */
function rationalToNumber({ num, den }) {
	if (num === 0n) return 0
	const neg = num < 0n
	const absNum = neg ? -num : num
	const scale = 10n ** 18n
	const scaled = (absNum * scale) / den
	const value = Number(scaled) / 1e18
	return neg ? -value : value
}

/**
 * Helper: Check `|a - b| < 1 / toleranceDen` using exact BigInt arithmetic.
 */
function assertRationalClose(a, b, toleranceDen) {
	const diffNum = a.num * b.den - b.num * a.den
	const absDiffNum = diffNum < 0n ? -diffNum : diffNum
	const commonDen = a.den * b.den
	assert.ok(
		absDiffNum * toleranceDen < commonDen,
		`Expected |${a.num}/${a.den} - ${b.num}/${b.den}| < 1/${toleranceDen}`
	)
}

/**
 * Helper: Verify lowest-terms rational invariants.
 */
function assertLowestTerms(r) {
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `Denominator must be positive, got ${r.den}`)
	assert.equal(gcd(r.num, r.den), 1n, `Rational ${r.num}/${r.den} is not in lowest terms`)
}

/**
 * Independent helper: Mercator series for ln(1 + t) = sum_{k=1}^M (-1)^(k-1) * t^k / k.
 */
function mercatorLnOnePlus(tNum, tDen, terms) {
	let sumNum = 0n
	let sumDen = 1n
	let powNum = tNum
	let powDen = tDen
	for (let k = 1; k <= terms; k++) {
		const termNum = k % 2 === 1 ? powNum : -powNum
		const termDen = powDen * BigInt(k)
		sumNum = sumNum * termDen + termNum * sumDen
		sumDen = sumDen * termDen
		const g = gcd(sumNum, sumDen)
		sumNum /= g
		sumDen /= g
		powNum *= tNum
		powDen *= tDen
	}
	return { num: sumNum, den: sumDen }
}

/**
 * Independent helper: Taylor series for exp(y) = sum_{k=0}^M y^k / k!.
 */
function expRationalTaylor({ num, den }, terms) {
	let sumNum = 1n
	let sumDen = 1n
	let termNum = 1n
	let termDen = 1n
	for (let k = 1; k <= terms; k++) {
		termNum *= num
		termDen *= den * BigInt(k)
		const gTerm = gcd(termNum, termDen)
		termNum /= gTerm
		termDen /= gTerm

		sumNum = sumNum * termDen + termNum * sumDen
		sumDen = sumDen * termDen
		const gSum = gcd(sumNum, sumDen)
		sumNum /= gSum
		sumDen /= gSum
	}
	return { num: sumNum, den: sumDen }
}

describe('lnRationalIterative', () => {
	test('exact zero for rational equal to 1 (including unreduced and double-negative forms)', () => {
		assert.deepStrictEqual(lnRationalIterative({ num: 1n, den: 1n }), { num: 0n, den: 1n })
		assert.deepStrictEqual(lnRationalIterative({ num: 7n, den: 7n }), { num: 0n, den: 1n })
		assert.deepStrictEqual(lnRationalIterative({ num: -42n, den: -42n }), { num: 0n, den: 1n })
		assert.deepStrictEqual(lnRationalIterative({ num: 10n ** 30n, den: 10n ** 30n }), {
			num: 0n,
			den: 1n,
		})
	})

	test('normal cases match Math.log to machine precision and stay in lowest terms', () => {
		const samples = [
			{ num: 2n, den: 1n },
			{ num: 3n, den: 1n },
			{ num: 10n, den: 1n },
			{ num: 3n, den: 2n },
			{ num: 4n, den: 3n },
			{ num: 1n, den: 2n },
			{ num: 1n, den: 10n },
			{ num: 5n, den: 7n },
			{ num: 22n, den: 7n },
			{ num: 100n, den: 3n },
		]

		for (const x of samples) {
			const res = lnRationalIterative(x)
			assertLowestTerms(res)
			const expected = Math.log(Number(x.num) / Number(x.den))
			const actual = rationalToNumber(res)
			assert.ok(
				Math.abs(actual - expected) < 1e-14,
				`Mismatch for ${x.num}/${x.den}: got ${actual}, expected ${expected}`
			)
		}
	})

	test('normalizes unreduced and double-negative inputs identically and does not mutate input', () => {
		const input = { num: -6n, den: -4n }
		const r1 = lnRationalIterative(input)
		const r2 = lnRationalIterative({ num: 3n, den: 2n })
		const r3 = lnRationalIterative({ num: 30n, den: 20n })

		assert.deepStrictEqual(input, { num: -6n, den: -4n })
		assert.deepStrictEqual(r1, r2)
		assert.deepStrictEqual(r2, r3)
		assertLowestTerms(r1)
	})

	test('edge cases: values near 1, range-reduction boundaries, very large and very small rationals', () => {
		const edges = [
			{ x: { num: 3n, den: 4n }, expected: Math.log(0.75) },
			{ x: { num: 3n, den: 2n }, expected: Math.log(1.5) },
			{ x: { num: 7n, den: 4n }, expected: Math.log(1.75) },
			{ x: { num: 5n, den: 8n }, expected: Math.log(0.625) },
			{ x: { num: 1000001n, den: 1000000n }, expected: Math.log(1.000001) },
			{ x: { num: 999999n, den: 1000000n }, expected: Math.log(0.999999) },
			{ x: { num: 1n << 100n, den: 1n }, expected: 100 * Math.LN2 },
			{ x: { num: 1n, den: 1n << 100n }, expected: -100 * Math.LN2 },
			{ x: { num: 10n ** 30n, den: 1n }, expected: 30 * Math.LN10 },
			{ x: { num: 1n, den: 10n ** 30n }, expected: -30 * Math.LN10 },
		]

		for (const { x, expected } of edges) {
			const res = lnRationalIterative(x)
			assertLowestTerms(res)
			const actual = rationalToNumber(res)
			assert.ok(
				Math.abs(actual - expected) < 1e-12 * Math.max(1, Math.abs(expected)),
				`Edge mismatch for ${x.num}/${x.den}: got ${actual}, expected ${expected}`
			)
		}
	})

	test('custom terms parameter works and improves accuracy monotonically', () => {
		const x = { num: 5n, den: 4n }
		const exact = Math.log(1.25)
		let prevError = Infinity

		for (const terms of [1, 2, 3, 5, 10]) {
			const res = lnRationalIterative(x, terms)
			assertLowestTerms(res)
			const err = Math.abs(rationalToNumber(res) - exact)
			assert.ok(err < prevError, `Expected error to decrease at terms=${terms}: ${err} vs ${prevError}`)
			prevError = err
		}

		// terms = 1 for x = 5/4 gives u = 1/9 -> 2 * (1/9) = 2/9 exactly
		assert.deepStrictEqual(lnRationalIterative({ num: 5n, den: 4n }, 1), { num: 2n, den: 9n })
	})

	test('exact antisymmetry ln(1/x) === -ln(x) and algebraic logarithm identities', () => {
		const pairs = [
			{ num: 2n, den: 1n },
			{ num: 3n, den: 2n },
			{ num: 11n, den: 8n },
			{ num: 17n, den: 5n },
			{ num: 1000n, den: 7n },
		]

		for (const x of pairs) {
			const lnX = lnRationalIterative(x)
			const lnInv = lnRationalIterative({ num: x.den, den: x.num })
			assert.deepStrictEqual(lnInv, { num: -lnX.num, den: lnX.den })
		}

		// Product law: ln(a * b) ≈ ln(a) + ln(b) to > 24 decimal digits
		const ln3 = lnRationalIterative({ num: 3n, den: 1n })
		const ln5 = lnRationalIterative({ num: 5n, den: 1n })
		const ln15 = lnRationalIterative({ num: 15n, den: 1n })
		const sumNum = ln3.num * ln5.den + ln5.num * ln3.den
		const sumDen = ln3.den * ln5.den
		const g = gcd(sumNum, sumDen)
		assertRationalClose(ln15, { num: sumNum / g, den: sumDen / g }, 10n ** 24n)

		// Power law: ln((3/2)^4) = ln(81/16) ≈ 4 * ln(3/2) to > 24 decimal digits
		const lnThreeHalves = lnRationalIterative({ num: 3n, den: 2n })
		const ln81Over16 = lnRationalIterative({ num: 81n, den: 16n })
		const scaledNum = 4n * lnThreeHalves.num
		const scaledDen = lnThreeHalves.den
		const g2 = gcd(scaledNum, scaledDen)
		assertRationalClose(ln81Over16, { num: scaledNum / g2, den: scaledDen / g2 }, 10n ** 24n)
	})

	test('independent cross-checks: Mercator series and exp(ln(x)) == x in exact BigInt arithmetic', () => {
		// Cross-check 1: Independent Mercator series for ln(101/100) = ln(1 + 1/100)
		const lnFromOp = lnRationalIterative({ num: 101n, den: 100n }, 12)
		const lnFromMercator = mercatorLnOnePlus(1n, 100n, 15)
		assertRationalClose(lnFromOp, lnFromMercator, 10n ** 25n)

		// Cross-check 2: Independent Taylor exp(ln(x)) ≈ x for x = 3/2 and x = 4/5
		for (const x of [
			{ num: 3n, den: 2n },
			{ num: 4n, den: 5n },
			{ num: 7n, den: 5n },
		]) {
			const y = lnRationalIterative(x, 15)
			const roundTripped = expRationalTaylor(y, 28)
			assertRationalClose(roundTripped, x, 10n ** 20n)
		}
	})

	test('throws on invalid inputs', () => {
		// Non-object inputs
		for (const bad of [null, undefined, 2, '2/1', true, [1n, 2n]]) {
			assert.throws(() => lnRationalIterative(bad), TypeError)
		}

		// Non-BigInt num or den
		for (const bad of [
			{ num: 2, den: 1n },
			{ num: 2n, den: 1 },
			{ num: '2', den: '1' },
			{ num: 2n },
			{ den: 1n },
			{},
		]) {
			assert.throws(() => lnRationalIterative(bad), TypeError)
		}

		// Zero denominator
		assert.throws(() => lnRationalIterative({ num: 1n, den: 0n }), RangeError)
		assert.throws(() => lnRationalIterative({ num: 0n, den: 0n }), RangeError)

		// Non-positive rationals
		for (const nonPos of [
			{ num: 0n, den: 1n },
			{ num: 0n, den: -5n },
			{ num: -1n, den: 1n },
			{ num: 1n, den: -2n },
			{ num: -5n, den: 3n },
		]) {
			assert.throws(() => lnRationalIterative(nonPos), RangeError)
		}

		// Invalid terms
		for (const badTerms of ['10', 10n, null, {}, true]) {
			assert.throws(() => lnRationalIterative({ num: 2n, den: 1n }, badTerms), TypeError)
		}
		for (const badTerms of [0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => lnRationalIterative({ num: 2n, den: 1n }, badTerms), RangeError)
		}
	})
})
