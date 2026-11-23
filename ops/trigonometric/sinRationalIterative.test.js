import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sinRationalIterative } from './sinRationalIterative.js'

/**
 * Helper: greatest common divisor of two BigInts.
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
 * Helper: asserts a value is a canonical lowest-terms rational { num: BigInt, den: BigInt }.
 */
function assertCanonicalRational(r) {
	assert.equal(typeof r, 'object')
	assert.notEqual(r, null)
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `expected positive denominator, got ${r.den}`)
	assert.equal(gcd(r.num, r.den), 1n, `expected lowest terms, got ${r.num}/${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n)
	}
}

/**
 * Helper: converts a rational { num, den } with arbitrarily large BigInts to a JS Number
 * without overflowing Number(num) or Number(den) individually.
 */
function rationalToNumber({ num, den }) {
	if (num === 0n) return 0
	const scale = 10n ** 18n
	const scaled = (num * scale) / den
	return Number(scaled) / 1e18
}

/**
 * Independent reference implementation of truncated sin Maclaurin polynomial:
 * computes each term (-1)^k * p^(2k+1) / (q^(2k+1) * (2k+1)!) directly via
 * explicit exponentiation and factorial over a common denominator.
 */
function independentMaclaurinSin({ num, den }, terms) {
	let p = num
	let q = den
	if (q < 0n) {
		p = -p
		q = -q
	}
	const maxExp = 2 * terms - 1
	let factMax = 1n
	for (let i = 2; i <= maxExp; i++) {
		factMax *= BigInt(i)
	}
	const commonDen = q ** BigInt(maxExp) * factMax

	let totalNum = 0n
	for (let k = 0; k < terms; k++) {
		const exp = 2 * k + 1
		let fact = 1n
		for (let i = 2; i <= exp; i++) {
			fact *= BigInt(i)
		}
		const sign = k % 2 === 0 ? 1n : -1n
		const termNum = sign * p ** BigInt(exp) * q ** BigInt(maxExp - exp) * (factMax / fact)
		totalNum += termNum
	}

	if (totalNum === 0n) {
		return { num: 0n, den: 1n }
	}
	const g = gcd(totalNum, commonDen)
	return { num: totalNum / g, den: commonDen / g }
}

/**
 * Independent truncated cos Maclaurin polynomial for Pythagorean identity cross-check.
 */
function independentMaclaurinCos({ num, den }, terms) {
	const maxExp = 2 * (terms - 1)
	let factMax = 1n
	for (let i = 2; i <= maxExp; i++) {
		factMax *= BigInt(i)
	}
	const commonDen = den ** BigInt(maxExp) * factMax

	let totalNum = 0n
	for (let k = 0; k < terms; k++) {
		const exp = 2 * k
		let fact = 1n
		for (let i = 2; i <= exp; i++) {
			fact *= BigInt(i)
		}
		const sign = k % 2 === 0 ? 1n : -1n
		const termNum = sign * num ** BigInt(exp) * den ** BigInt(maxExp - exp) * (factMax / fact)
		totalNum += termNum
	}

	const g = gcd(totalNum, commonDen)
	return { num: totalNum / g, den: commonDen / g }
}

describe('sinRationalIterative', () => {
	describe('normal cases', () => {
		it('matches exact hand-computed partial sums for x = 1/2', () => {
			// terms = 1: 1/2
			assert.deepStrictEqual(sinRationalIterative({ num: 1n, den: 2n }, 1), { num: 1n, den: 2n })
			// terms = 2: 1/2 - (1/8)/6 = 23/48
			assert.deepStrictEqual(sinRationalIterative({ num: 1n, den: 2n }, 2), { num: 23n, den: 48n })
			// terms = 3: 23/48 + (1/32)/120 = 1841/3840
			assert.deepStrictEqual(sinRationalIterative({ num: 1n, den: 2n }, 3), { num: 1841n, den: 3840n })
		})

		it('matches exact hand-computed partial sums for x = 1', () => {
			// terms = 1: 1
			assert.deepStrictEqual(sinRationalIterative({ num: 1n, den: 1n }, 1), { num: 1n, den: 1n })
			// terms = 2: 1 - 1/6 = 5/6
			assert.deepStrictEqual(sinRationalIterative({ num: 1n, den: 1n }, 2), { num: 5n, den: 6n })
			// terms = 3: 5/6 + 1/120 = 101/120
			assert.deepStrictEqual(sinRationalIterative({ num: 1n, den: 1n }, 3), { num: 101n, den: 120n })
			// terms = 4: 101/120 - 1/5040 = 4241/5040
			assert.deepStrictEqual(sinRationalIterative({ num: 1n, den: 1n }, 4), { num: 4241n, den: 5040n })
		})

		it('handles negative angles correctly', () => {
			// x = -1/3, terms = 2: -1/3 - (-1/27)/6 = -1/3 + 1/162 = -53/162
			const res = sinRationalIterative({ num: -1n, den: 3n }, 2)
			assertCanonicalRational(res)
			assert.deepStrictEqual(res, { num: -53n, den: 162n })
		})

		it('returns canonical lowest-terms rationals with default terms', () => {
			const samples = [
				{ num: 1n, den: 3n },
				{ num: -2n, den: 5n },
				{ num: 3n, den: 4n },
				{ num: 11n, den: 7n },
			]
			for (const sample of samples) {
				const res = sinRationalIterative(sample)
				assertCanonicalRational(res)
			}
		})
	})

	describe('edge cases', () => {
		it('returns exact 0/1 for zero with any valid denominator or term count', () => {
			assert.deepStrictEqual(sinRationalIterative({ num: 0n, den: 1n }), { num: 0n, den: 1n })
			assert.deepStrictEqual(sinRationalIterative({ num: 0n, den: 7n }, 5), { num: 0n, den: 1n })
			assert.deepStrictEqual(sinRationalIterative({ num: 0n, den: -99n }, 1), { num: 0n, den: 1n })
		})

		it('normalizes negative denominators and unreduced inputs', () => {
			const a = sinRationalIterative({ num: 1n, den: -2n }, 6)
			const b = sinRationalIterative({ num: -1n, den: 2n }, 6)
			const c = sinRationalIterative({ num: -6n, den: 12n }, 6)
			assertCanonicalRational(a)
			assert.deepStrictEqual(a, b)
			assert.deepStrictEqual(a, c)
		})

		it('preserves exact BigInt precision for very small rationals beyond float64 resolution', () => {
			// x = 10^-18; with 2 terms: x - x^3 / 6 = (6*10^36 - 1) / (6*10^54)
			const x = { num: 1n, den: 10n ** 18n }
			const res = sinRationalIterative(x, 2)
			assertCanonicalRational(res)
			assert.deepStrictEqual(res, {
				num: 6n * 10n ** 36n - 1n,
				den: 6n * 10n ** 54n,
			})
		})

		it('does not mutate the input rational object', () => {
			const input = { num: 4n, den: -6n }
			sinRationalIterative(input, 4)
			assert.deepStrictEqual(input, { num: 4n, den: -6n })
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError for non-object or malformed x', () => {
			for (const bad of [null, undefined, 0, 1n, '1/2', [], [1n, 2n], {}, { num: 1n }, { den: 2n }]) {
				assert.throws(() => sinRationalIterative(bad), TypeError)
			}
		})

		it('throws TypeError when num or den is not a BigInt', () => {
			for (const bad of [
				{ num: 1, den: 2n },
				{ num: 1n, den: 2 },
				{ num: '1', den: 2n },
				{ num: 1n, den: null },
				{ num: NaN, den: 1n },
			]) {
				assert.throws(() => sinRationalIterative(bad), TypeError)
			}
		})

		it('throws RangeError when denominator is zero', () => {
			assert.throws(() => sinRationalIterative({ num: 1n, den: 0n }), RangeError)
			assert.throws(() => sinRationalIterative({ num: 0n, den: 0n }), RangeError)
		})

		it('throws TypeError when terms is not a number', () => {
			for (const badTerms of ['5', 5n, null, true, {}, []]) {
				assert.throws(() => sinRationalIterative({ num: 1n, den: 2n }, badTerms), TypeError)
			}
		})

		it('throws RangeError when terms is not a positive safe integer', () => {
			for (const badTerms of [0, -1, -10, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => sinRationalIterative({ num: 1n, den: 2n }, badTerms), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('agrees with Math.sin to float64 precision across [-pi, pi]', () => {
			const angles = [
				{ num: 0n, den: 1n },
				{ num: 1n, den: 10n },
				{ num: 1n, den: 3n },
				{ num: 1n, den: 2n },
				{ num: 1n, den: 1n },
				{ num: -1n, den: 1n },
				{ num: 3n, den: 2n },
				{ num: -2n, den: 1n },
				{ num: 355n, den: 226n }, // ~ pi/2
				{ num: 355n, den: 113n }, // ~ pi
				{ num: -355n, den: 113n }, // ~ -pi
			]

			for (const x of angles) {
				const exact = sinRationalIterative(x)
				assertCanonicalRational(exact)
				const approx = rationalToNumber(exact)
				const expected = Math.sin(Number(x.num) / Number(x.den))
				assert.ok(
					Math.abs(approx - expected) < 1e-15,
					`mismatch for ${x.num}/${x.den}: got ${approx}, expected ${expected}`
				)
			}
		})

		it('matches an independent direct factorial-and-power reference implementation exactly', () => {
			const cases = [
				{ x: { num: 1n, den: 2n }, terms: 7 },
				{ x: { num: -3n, den: 5n }, terms: 6 },
				{ x: { num: 7n, den: 4n }, terms: 8 },
				{ x: { num: 2n, den: -9n }, terms: 5 },
			]
			for (const { x, terms } of cases) {
				const actual = sinRationalIterative(x, terms)
				const expected = independentMaclaurinSin(x, terms)
				assertCanonicalRational(actual)
				assert.deepStrictEqual(actual, expected)
			}
		})

		it('satisfies exact odd symmetry sin(-x) === -sin(x)', () => {
			const samples = [
				{ num: 1n, den: 7n },
				{ num: 5n, den: 3n },
				{ num: 22n, den: 7n },
			]
			for (const x of samples) {
				const pos = sinRationalIterative(x, 10)
				const neg = sinRationalIterative({ num: -x.num, den: x.den }, 10)
				assert.deepStrictEqual(neg, { num: -pos.num, den: pos.den })
			}
		})

		it('satisfies Pythagorean identity sin^2(x) + cos^2(x) ≈ 1 to high exact-rational accuracy', () => {
			const x = { num: 3n, den: 5n }
			const s = sinRationalIterative(x, 12)
			const c = independentMaclaurinCos(x, 12)

			// Compute |s^2 + c^2 - 1| = |s.num^2 * c.den^2 + c.num^2 * s.den^2 - (s.den * c.den)^2| / (s.den * c.den)^2
			const denSq = (s.den * c.den) ** 2n
			const sumSqNum = s.num * s.num * c.den * c.den + c.num * c.num * s.den * s.den
			const diffNum = sumSqNum > denSq ? sumSqNum - denSq : denSq - sumSqNum

			// Verify error < 10^-25 in exact integer arithmetic: diffNum * 10^25 < denSq
			assert.ok(diffNum * 10n ** 25n < denSq, 'expected sin^2(x) + cos^2(x) = 1 within 10^-25')
		})

		it('satisfies triple-angle identity sin(3x) ≈ 3*sin(x) - 4*sin^3(x) to high exact-rational accuracy', () => {
			const x = { num: 1n, den: 3n }
			const sx = sinRationalIterative(x, 12)
			const s3x = sinRationalIterative({ num: 1n, den: 1n }, 12)

			// rhs = 3*sx - 4*sx^3 = (3*sx.num*sx.den^2 - 4*sx.num^3) / sx.den^3
			const rhsNum = 3n * sx.num * sx.den * sx.den - 4n * sx.num ** 3n
			const rhsDen = sx.den ** 3n

			// |s3x - rhs| = |s3x.num * rhsDen - rhsNum * s3x.den| / (s3x.den * rhsDen)
			const left = s3x.num * rhsDen
			const right = rhsNum * s3x.den
			const diffNum = left > right ? left - right : right - left
			const commonDen = s3x.den * rhsDen

			// Verify error < 10^-20
			assert.ok(diffNum * 10n ** 20n < commonDen, 'expected triple-angle identity within 10^-20')
		})
	})
})
