import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { log10RationalIterative } from './log10RationalIterative.js'

function gcd(a, b) {
	a = a < 0n ? -a : a
	b = b < 0n ? -b : b
	while (b !== 0n) {
		const t = a % b
		a = b
		b = t
	}
	return a
}

function assertReducedRational(r) {
	assert.equal(typeof r, 'object')
	assert.notEqual(r, null)
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`)
	assert.equal(gcd(r.num, r.den), 1n, `expected reduced rational, got ${r.num}/${r.den}`)
}

function rationalToNumber(r) {
	// Scale to 18 decimal digits before converting to Number to avoid BigInt overflow on large terms.
	const scale = 10n ** 18n
	const scaled = (r.num * scale) / r.den
	return Number(scaled) / 1e18
}

function rationalSub(a, b) {
	const num = a.num * b.den - b.num * a.den
	const den = a.den * b.den
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

function rationalAdd(a, b) {
	const num = a.num * b.den + b.num * a.den
	const den = a.den * b.den
	const g = gcd(num, den)
	return { num: num / g, den: den / g }
}

function assertRationalClose(a, b, toleranceNum, toleranceDen) {
	const diff = rationalSub(a, b)
	const absNum = diff.num < 0n ? -diff.num : diff.num
	assert.ok(
		absNum * toleranceDen <= toleranceNum * diff.den,
		`expected ${a.num}/${a.den} ≈ ${b.num}/${b.den} within ${toleranceNum}/${toleranceDen}, diff = ${diff.num}/${diff.den}`,
	)
}

describe('log10RationalIterative', () => {
	describe('exact powers of 10', () => {
		test('returns exact integer rationals for integer and reciprocal powers of 10', () => {
			assert.deepEqual(log10RationalIterative({ num: 1n, den: 1n }), { num: 0n, den: 1n })
			assert.deepEqual(log10RationalIterative({ num: 10n, den: 1n }), { num: 1n, den: 1n })
			assert.deepEqual(log10RationalIterative({ num: 100n, den: 1n }), { num: 2n, den: 1n })
			assert.deepEqual(log10RationalIterative({ num: 1000000n, den: 1n }), { num: 6n, den: 1n })
			assert.deepEqual(log10RationalIterative({ num: 10n ** 25n, den: 1n }), { num: 25n, den: 1n })

			assert.deepEqual(log10RationalIterative({ num: 1n, den: 10n }), { num: -1n, den: 1n })
			assert.deepEqual(log10RationalIterative({ num: 1n, den: 100n }), { num: -2n, den: 1n })
			assert.deepEqual(log10RationalIterative({ num: 1n, den: 10n ** 20n }), { num: -20n, den: 1n })
		})

		test('normalizes unreduced and double-negative powers of 10', () => {
			assert.deepEqual(log10RationalIterative({ num: 5n, den: 5n }), { num: 0n, den: 1n })
			assert.deepEqual(log10RationalIterative({ num: 200n, den: 2n }), { num: 2n, den: 1n })
			assert.deepEqual(log10RationalIterative({ num: 7n, den: 7000n }), { num: -3n, den: 1n })
			assert.deepEqual(log10RationalIterative({ num: -10n, den: -1n }), { num: 1n, den: 1n })
			assert.deepEqual(log10RationalIterative({ num: -3n, den: -300n }), { num: -2n, den: 1n })
		})
	})

	describe('normal cases, fractions < 1, and high-precision values', () => {
		test('computes high-precision log10(2) and log10(3) matching known digits', () => {
			// Known 50-digit reference for log10(2):
			// 0.30102999566398119521373889472449302676818988146210...
			const log2 = log10RationalIterative({ num: 2n, den: 1n }, 50)
			assertReducedRational(log2)
			const expectedLog2 = {
				num: 30102999566398119521373889472449302676818988146211n,
				den: 10n ** 50n,
			}
			assertRationalClose(log2, expectedLog2, 1n, 10n ** 49n)

			// Known 50-digit reference for log10(3):
			// 0.47712125471966243729502790325511530920012886419069...
			const log3 = log10RationalIterative({ num: 3n, den: 1n }, 50)
			assertReducedRational(log3)
			const expectedLog3 = {
				num: 47712125471966243729502790325511530920012886419070n,
				den: 10n ** 50n,
			}
			assertRationalClose(log3, expectedLog3, 1n, 10n ** 49n)
		})

		test('handles fractions < 1 and values near 1', () => {
			const cases = [
				{ num: 1n, den: 2n },
				{ num: 1n, den: 3n },
				{ num: 2n, den: 3n },
				{ num: 999n, den: 1000n },
				{ num: 1001n, den: 1000n },
				{ num: 7n, den: 13n },
				{ num: 1n, den: 999999n },
			]

			for (const c of cases) {
				const res = log10RationalIterative(c)
				assertReducedRational(res)
				if (c.num < c.den) {
					assert.ok(res.num < 0n, `expected negative log10 for ${c.num}/${c.den}`)
				} else {
					assert.ok(res.num > 0n, `expected positive log10 for ${c.num}/${c.den}`)
				}
			}
		})

		test('handles very large and very small rationals accurately', () => {
			const log2 = log10RationalIterative({ num: 2n, den: 1n }, 30)
			const big = log10RationalIterative({ num: 2n * 10n ** 100n, den: 1n }, 30)
			const small = log10RationalIterative({ num: 2n, den: 10n ** 100n }, 30)

			assertReducedRational(big)
			assertReducedRational(small)
			// log10(2 * 10^100) = 100 + log10(2) exactly
			assert.deepEqual(big, rationalAdd(log2, { num: 100n, den: 1n }))
			// log10(2 * 10^-100) = -100 + log10(2) exactly
			assert.deepEqual(small, rationalAdd(log2, { num: -100n, den: 1n }))
		})
	})

	describe('cross-checks against Math.log10 and logarithmic identities', () => {
		test('matches Math.log10 across diverse positive rationals', () => {
			const samples = [
				{ num: 2n, den: 1n },
				{ num: 5n, den: 1n },
				{ num: 7n, den: 1n },
				{ num: 123456n, den: 789n },
				{ num: 1n, den: 2n },
				{ num: 3n, den: 7n },
				{ num: 1n, den: 42n },
				{ num: 99999n, den: 100000n },
				{ num: 100001n, den: 100000n },
				{ num: 355n, den: 113n },
				{ num: -5n, den: -8n },
			]

			for (const s of samples) {
				const res = log10RationalIterative(s)
				assertReducedRational(res)
				const approx = rationalToNumber(res)
				const expected = Math.log10(Number(s.num) / Number(s.den))
				assert.ok(
					Math.abs(approx - expected) < 1e-14,
					`mismatch for ${s.num}/${s.den}: got ${approx}, expected ${expected}`,
				)
			}
		})

		test('satisfies product, quotient, reciprocal, and power identities to high precision', () => {
			const a = { num: 7n, den: 3n }
			const b = { num: 11n, den: 5n }
			const ab = { num: a.num * b.num, den: a.den * b.den }
			const aOverB = { num: a.num * b.den, den: a.den * b.num }
			const invA = { num: a.den, den: a.num }
			const aCubed = { num: a.num ** 3n, den: a.den ** 3n }

			const logA = log10RationalIterative(a, 35)
			const logB = log10RationalIterative(b, 35)
			const logAB = log10RationalIterative(ab, 35)
			const logAOverB = log10RationalIterative(aOverB, 35)
			const logInvA = log10RationalIterative(invA, 35)
			const logACubed = log10RationalIterative(aCubed, 35)

			// log10(a * b) = log10(a) + log10(b)
			assertRationalClose(logAB, rationalAdd(logA, logB), 1n, 10n ** 33n)
			// log10(a / b) = log10(a) - log10(b)
			assertRationalClose(logAOverB, rationalSub(logA, logB), 1n, 10n ** 33n)
			// log10(1 / a) = -log10(a)
			assertRationalClose(logInvA, { num: -logA.num, den: logA.den }, 1n, 10n ** 33n)
			// log10(a^3) = 3 * log10(a)
			assertRationalClose(logACubed, { num: 3n * logA.num, den: logA.den }, 1n, 10n ** 33n)
		})
	})

	describe('input validation', () => {
		test('throws RangeError for non-positive rationals and zero denominators', () => {
			const rangeInvalid = [
				{ num: 0n, den: 1n },
				{ num: 0n, den: -5n },
				{ num: -1n, den: 1n },
				{ num: -10n, den: 1n },
				{ num: 10n, den: -1n },
				{ num: -3n, den: 7n },
				{ num: 1n, den: 0n },
				{ num: 0n, den: 0n },
				{ num: -1n, den: 0n },
			]

			for (const bad of rangeInvalid) {
				assert.throws(() => log10RationalIterative(bad), RangeError)
			}
		})

		test('throws TypeError for non-rational or non-BigInt inputs', () => {
			const typeInvalid = [
				null,
				undefined,
				10,
				10n,
				'10',
				[10n, 1n],
				{},
				{ num: 10, den: 1n },
				{ num: 10n, den: 1 },
				{ num: 10, den: 1 },
				{ num: '10', den: '1' },
				{ num: 10n },
				{ den: 1n },
			]

			for (const bad of typeInvalid) {
				assert.throws(() => log10RationalIterative(bad), TypeError)
			}
		})

		test('validates optional precision argument', () => {
			assert.throws(() => log10RationalIterative({ num: 10n, den: 1n }, 0), RangeError)
			assert.throws(() => log10RationalIterative({ num: 10n, den: 1n }, -5), RangeError)
			assert.throws(() => log10RationalIterative({ num: 10n, den: 1n }, 1.5), RangeError)
			assert.throws(() => log10RationalIterative({ num: 10n, den: 1n }, NaN), RangeError)
			assert.throws(() => log10RationalIterative({ num: 10n, den: 1n }, Infinity), RangeError)
			assert.throws(() => log10RationalIterative({ num: 2n, den: 1n }, '30'), TypeError)
			assert.throws(() => log10RationalIterative({ num: 2n, den: 1n }, 30n), TypeError)
		})
	})
})
