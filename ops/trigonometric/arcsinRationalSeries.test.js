import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { arcsinRationalSeries } from './arcsinRationalSeries.js'

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

function assertLowestTerms(r) {
	assert.equal(typeof r, 'object')
	assert.notEqual(r, null)
	assert.equal(typeof r.num, 'bigint', 'num must be a BigInt')
	assert.equal(typeof r.den, 'bigint', 'den must be a BigInt')
	assert.ok(r.den > 0n, `den must be > 0n, got ${r.den}`)
	if (r.num === 0n) {
		assert.equal(r.den, 1n, 'zero must be represented as { num: 0n, den: 1n }')
	} else {
		assert.equal(gcd(r.num, r.den), 1n, `not in lowest terms: ${r.num}/${r.den}`)
	}
}

/**
 * Converts a rational with |num / den| < 2 to an IEEE-754 double accurately,
 * even when num and den exceed Number.MAX_VALUE.
 */
function ratToNumber({ num, den }) {
	const sign = num < 0n ? -1 : 1
	const absNum = num < 0n ? -num : num
	const scaled = (absNum << 52n) / den
	return sign * (Number(scaled) / 2 ** 52)
}

function factorial(n) {
	let result = 1n
	for (let i = 2n; i <= n; i++) result *= i
	return result
}

/**
 * Independent brute-force Maclaurin series using explicit factorials:
 *   sum_{n=0}^{terms-1} ((2n)! / (4^n * (n!)^2 * (2n+1))) * (p/q)^(2n+1)
 */
function bruteForceMaclaurin(p, q, terms) {
	let sumNum = 0n
	let sumDen = 1n
	for (let n = 0; n < terms; n++) {
		const nb = BigInt(n)
		const twoN = 2n * nb
		const factN = factorial(nb)
		const termNum = factorial(twoN) * p ** (twoN + 1n)
		const termDen = (4n ** nb) * factN * factN * (twoN + 1n) * q ** (twoN + 1n)
		sumNum = sumNum * termDen + termNum * sumDen
		sumDen = sumDen * termDen
		const g = gcd(sumNum, sumDen)
		sumNum /= g
		sumDen /= g
	}
	if (sumDen < 0n) {
		sumNum = -sumNum
		sumDen = -sumDen
	}
	return sumNum === 0n ? { num: 0n, den: 1n } : { num: sumNum, den: sumDen }
}

describe('arcsinRationalSeries', () => {
	describe('exact Maclaurin values and normal cases', () => {
		it('matches hand-computed Maclaurin partial sums at x = 1/2', () => {
			const half = { num: 1n, den: 2n }

			const t1 = arcsinRationalSeries(half, 1)
			assertLowestTerms(t1)
			assert.deepEqual(t1, { num: 1n, den: 2n })

			// 1/2 + (1/6) * (1/8) = 25/48
			const t2 = arcsinRationalSeries(half, 2)
			assertLowestTerms(t2)
			assert.deepEqual(t2, { num: 25n, den: 48n })

			// 25/48 + (3/40) * (1/32) = 25/48 + 3/1280 = 2009/3840
			const t3 = arcsinRationalSeries(half, 3)
			assertLowestTerms(t3)
			assert.deepEqual(t3, { num: 2009n, den: 3840n })
		})

		it('handles unreduced rationals and negative denominators identically', () => {
			const base = arcsinRationalSeries({ num: 1n, den: 3n })
			assertLowestTerms(base)
			assert.deepEqual(arcsinRationalSeries({ num: 4n, den: 12n }), base)
			assert.deepEqual(arcsinRationalSeries({ num: -2n, den: -6n }), base)

			const negBase = arcsinRationalSeries({ num: -1n, den: 3n })
			assertLowestTerms(negBase)
			assert.deepEqual(arcsinRationalSeries({ num: 2n, den: -6n }), negBase)
		})

		it('computes accurate values in the reduced regime (1/2 < |x| < 1)', () => {
			// Includes x = 7/9 where (1 - 7/9)/2 = 1/9 has exact rational sqrt 1/3,
			// and x = 17/25 where (1 - 17/25)/2 = 4/25 has exact rational sqrt 2/5.
			const inputs = [
				{ num: 3n, den: 5n },
				{ num: 17n, den: 25n },
				{ num: 7n, den: 9n },
				{ num: 4n, den: 5n },
				{ num: 9n, den: 10n },
				{ num: 99n, den: 100n },
				{ num: 999n, den: 1000n },
			]
			for (const x of inputs) {
				const res = arcsinRationalSeries(x)
				assertLowestTerms(res)
				const expected = Math.asin(Number(x.num) / Number(x.den))
				const err = Math.abs(ratToNumber(res) - expected)
				assert.ok(err < 1e-10, `error too large for ${x.num}/${x.den}: ${err}`)
			}
		})
	})

	describe('edge cases', () => {
		it('returns canonical zero for x = 0 regardless of denominator or terms', () => {
			for (const x of [
				{ num: 0n, den: 1n },
				{ num: 0n, den: 5n },
				{ num: 0n, den: -9n },
			]) {
				const res = arcsinRationalSeries(x)
				assertLowestTerms(res)
				assert.deepEqual(res, { num: 0n, den: 1n })
			}
			assert.deepEqual(arcsinRationalSeries({ num: 0n, den: 1n }, 1), { num: 0n, den: 1n })
		})

		it('handles exact boundaries x = 1 and x = -1 accurately', () => {
			const posOne = arcsinRationalSeries({ num: 1n, den: 1n })
			const negOne = arcsinRationalSeries({ num: -1n, den: 1n })
			assertLowestTerms(posOne)
			assertLowestTerms(negOne)

			assert.ok(Math.abs(ratToNumber(posOne) - Math.PI / 2) < 1e-15)
			assert.ok(Math.abs(ratToNumber(negOne) + Math.PI / 2) < 1e-15)
			assert.deepEqual(negOne, { num: -posOne.num, den: posOne.den })
		})

		it('handles values right around the |x| = 1/2 transition and near |x| = 1', () => {
			const edgeInputs = [
				{ num: 4999n, den: 10000n },
				{ num: 5000n, den: 10000n },
				{ num: 5001n, den: 10000n },
				{ num: 9999n, den: 10000n },
				{ num: -9999n, den: 10000n },
			]
			for (const x of edgeInputs) {
				const res = arcsinRationalSeries(x)
				assertLowestTerms(res)
				const expected = Math.asin(Number(x.num) / Number(x.den))
				assert.ok(
					Math.abs(ratToNumber(res) - expected) < 1e-9,
					`failed near boundary for ${x.num}/${x.den}`,
				)
			}
		})

		it('converges monotonically as terms increases', () => {
			for (const x of [
				{ num: 1n, den: 2n },
				{ num: 4n, den: 5n },
				{ num: 1n, den: 1n },
			]) {
				const exact = Math.asin(Number(x.num) / Number(x.den))
				let prevErr = Infinity
				for (const terms of [2, 4, 8, 12]) {
					const res = arcsinRationalSeries(x, terms)
					assertLowestTerms(res)
					const err = Math.abs(ratToNumber(res) - exact)
					assert.ok(err < prevErr, `error did not decrease at terms=${terms} for ${x.num}/${x.den}`)
					prevErr = err
				}
			}
		})
	})

	describe('input validation', () => {
		it('throws TypeError for invalid x shapes or non-BigInt fields', () => {
			const invalidX = [
				null,
				undefined,
				0.5,
				'1/2',
				true,
				{},
				{ num: 1, den: 2 },
				{ num: 1n, den: 2 },
				{ num: 1, den: 2n },
				{ num: '1', den: 2n },
				{ num: 1n },
			]
			for (const bad of invalidX) {
				assert.throws(() => arcsinRationalSeries(bad), TypeError)
			}
		})

		it('throws RangeError when denominator is 0n', () => {
			assert.throws(() => arcsinRationalSeries({ num: 1n, den: 0n }), RangeError)
			assert.throws(() => arcsinRationalSeries({ num: 0n, den: 0n }), RangeError)
			assert.throws(() => arcsinRationalSeries({ num: -5n, den: 0n }), RangeError)
		})

		it('throws RangeError when |x| > 1', () => {
			const outOfDomain = [
				{ num: 2n, den: 1n },
				{ num: -2n, den: 1n },
				{ num: 3n, den: 2n },
				{ num: -5n, den: 4n },
				{ num: 1001n, den: 1000n },
				{ num: 1001n, den: -1000n },
			]
			for (const bad of outOfDomain) {
				assert.throws(() => arcsinRationalSeries(bad), RangeError)
			}
		})

		it('throws TypeError or RangeError for invalid terms', () => {
			const validX = { num: 1n, den: 2n }
			for (const badType of ['12', 12n, null, {}, []]) {
				assert.throws(() => arcsinRationalSeries(validX, badType), TypeError)
			}
			for (const badRange of [0, -1, -10, 1.5, NaN, Infinity, -Infinity]) {
				assert.throws(() => arcsinRationalSeries(validX, badRange), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('cross-checks against Math.asin across [-1, 1] at default and high terms', () => {
			const samples = [
				[-1n, 1n],
				[-99n, 100n],
				[-4n, 5n],
				[-7n, 10n],
				[-1n, 2n],
				[-1n, 3n],
				[-1n, 10n],
				[0n, 1n],
				[1n, 10n],
				[1n, 4n],
				[1n, 2n],
				[3n, 5n],
				[7n, 10n],
				[4n, 5n],
				[95n, 100n],
				[1n, 1n],
			]
			for (const [num, den] of samples) {
				const expected = Math.asin(Number(num) / Number(den))

				const r12 = arcsinRationalSeries({ num, den }, 12)
				assertLowestTerms(r12)
				assert.ok(
					Math.abs(ratToNumber(r12) - expected) < 1e-9,
					`terms=12 mismatch for ${num}/${den}`,
				)

				const r20 = arcsinRationalSeries({ num, den }, 20)
				assertLowestTerms(r20)
				assert.ok(
					Math.abs(ratToNumber(r20) - expected) < 1e-14,
					`terms=20 mismatch for ${num}/${den}`,
				)
			}
		})

		it('satisfies exact odd symmetry arcsin(-x) === -arcsin(x)', () => {
			const xs = [
				{ num: 0n, den: 1n },
				{ num: 1n, den: 7n },
				{ num: 1n, den: 2n },
				{ num: 3n, den: 5n },
				{ num: 7n, den: 9n },
				{ num: 19n, den: 20n },
				{ num: 1n, den: 1n },
			]
			for (const terms of [1, 5, 12]) {
				for (const x of xs) {
					const pos = arcsinRationalSeries(x, terms)
					const neg = arcsinRationalSeries({ num: -x.num, den: x.den }, terms)
					assertLowestTerms(pos)
					assertLowestTerms(neg)
					assert.deepEqual(neg, { num: -pos.num, den: pos.den })
				}
			}
		})

		it('matches independent brute-force factorial Maclaurin sum exactly for |x| <= 1/2', () => {
			const cases = [
				[1n, 4n, 6],
				[-1n, 3n, 7],
				[1n, 2n, 8],
				[2n, 5n, 5],
			]
			for (const [p, q, terms] of cases) {
				const actual = arcsinRationalSeries({ num: p, den: q }, terms)
				const expected = bruteForceMaclaurin(p, q, terms)
				assertLowestTerms(actual)
				assert.deepEqual(actual, expected)
			}
		})

		it('satisfies Pythagorean complementary angle identity arcsin(a/c) + arcsin(b/c) = pi/2', () => {
			const triples = [
				[3n, 4n, 5n],
				[5n, 12n, 13n],
				[8n, 15n, 17n],
			]
			const halfPi = ratToNumber(arcsinRationalSeries({ num: 1n, den: 1n }, 16))
			for (const [a, b, c] of triples) {
				const alpha = ratToNumber(arcsinRationalSeries({ num: a, den: c }, 16))
				const beta = ratToNumber(arcsinRationalSeries({ num: b, den: c }, 16))
				assert.ok(
					Math.abs(alpha + beta - halfPi) < 1e-12,
					`Pythagorean identity failed for (${a}, ${b}, ${c})`,
				)
			}
		})

		it('satisfies special-angle identity 3 * arcsin(1/2) = arcsin(1) = pi/2 and strict monotonicity', () => {
			const halfRes = arcsinRationalSeries({ num: 1n, den: 2n }, 20)
			const oneRes = arcsinRationalSeries({ num: 1n, den: 1n }, 20)
			assert.ok(Math.abs(3 * ratToNumber(halfRes) - ratToNumber(oneRes)) < 1e-14)

			const ordered = [
				{ num: -1n, den: 1n },
				{ num: -4n, den: 5n },
				{ num: -1n, den: 2n },
				{ num: 0n, den: 1n },
				{ num: 1n, den: 2n },
				{ num: 4n, den: 5n },
				{ num: 1n, den: 1n },
			].map((x) => arcsinRationalSeries(x, 12))

			for (let i = 0; i < ordered.length - 1; i++) {
				const left = ordered[i]
				const right = ordered[i + 1]
				assert.ok(
					left.num * right.den < right.num * left.den,
					`monotonicity violated at index ${i}`,
				)
			}
		})
	})
})
