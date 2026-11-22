import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { factorialRationalSeries } from './factorialRationalSeries.js'

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

function assertCanonicalRational(r, expectedNum, expectedDen = 1n) {
	assert.equal(typeof r, 'object')
	assert.notEqual(r, null)
	assert.equal(typeof r.num, 'bigint')
	assert.equal(typeof r.den, 'bigint')
	assert.ok(r.den > 0n, `Expected den > 0n, got ${r.den}`)
	assert.equal(
		gcd(r.num, r.den),
		1n,
		`Expected lowest terms, got ${r.num}/${r.den}`
	)
	assert.equal(r.num, expectedNum)
	assert.equal(r.den, expectedDen)
}

function r(num, den = 1n) {
	return { num, den }
}

describe('factorialRationalSeries', () => {
	it('computes exact factorials for 0!, 1!, 5!, 10!, 20!, and 25!', () => {
		assertCanonicalRational(factorialRationalSeries(r(0n)), 1n)
		assertCanonicalRational(factorialRationalSeries(r(1n)), 1n)
		assertCanonicalRational(factorialRationalSeries(r(2n)), 2n)
		assertCanonicalRational(factorialRationalSeries(r(3n)), 6n)
		assertCanonicalRational(factorialRationalSeries(r(4n)), 24n)
		assertCanonicalRational(factorialRationalSeries(r(5n)), 120n)
		assertCanonicalRational(factorialRationalSeries(r(10n)), 3628800n)
		assertCanonicalRational(
			factorialRationalSeries(r(20n)),
			2432902008176640000n
		)
		assertCanonicalRational(
			factorialRationalSeries(r(25n)),
			15511210043330985984000000n
		)
	})

	it('accepts unreduced and negative-denominator integer rationals', () => {
		assertCanonicalRational(factorialRationalSeries(r(0n, 5n)), 1n)
		assertCanonicalRational(factorialRationalSeries(r(0n, -9n)), 1n)
		assertCanonicalRational(factorialRationalSeries(r(6n, 2n)), 6n)
		assertCanonicalRational(factorialRationalSeries(r(10n, 2n)), 120n)
		assertCanonicalRational(factorialRationalSeries(r(-10n, -2n)), 120n)
		assertCanonicalRational(factorialRationalSeries(r(-6n, -3n)), 2n)
		assertCanonicalRational(
			factorialRationalSeries(r(100n, 5n)),
			2432902008176640000n
		)
	})

	it('does not mutate the input rational object', () => {
		const input = { num: -10n, den: -2n }
		const result = factorialRationalSeries(input)
		assertCanonicalRational(result, 120n)
		assert.deepEqual(input, { num: -10n, den: -2n })
	})

	it('throws TypeError on non-rational or non-BigInt inputs', () => {
		const invalidTypes = [
			null,
			undefined,
			5,
			5n,
			'5',
			true,
			[],
			[5n, 1n],
			{},
			{ num: 5, den: 1n },
			{ num: 5n, den: 1 },
			{ num: 5, den: 1 },
			{ num: '5', den: '1' },
			{ num: 5n },
			{ den: 1n },
		]

		for (const bad of invalidTypes) {
			assert.throws(() => factorialRationalSeries(bad), TypeError)
		}
	})

	it('throws RangeError on zero denominator, negative integers, and non-integer rationals', () => {
		const outOfDomain = [
			// Zero denominator
			r(0n, 0n),
			r(5n, 0n),
			r(-1n, 0n),
			// Negative integers (reduced and unreduced)
			r(-1n, 1n),
			r(-5n, 1n),
			r(5n, -1n),
			r(-6n, 2n),
			r(6n, -2n),
			// Non-integer rationals (positive and negative)
			r(1n, 2n),
			r(5n, 2n),
			r(7n, 3n),
			r(-1n, 2n),
			r(-7n, -3n),
			r(3n, -2n),
		]

		for (const bad of outOfDomain) {
			assert.throws(() => factorialRationalSeries(bad), RangeError)
		}
	})

	it('satisfies the recurrence / Gamma relation n! = n * (n - 1)! for n = 1..40', () => {
		let prev = factorialRationalSeries(r(0n))
		assertCanonicalRational(prev, 1n)

		for (let n = 1n; n <= 40n; n++) {
			const curr = factorialRationalSeries(r(n))
			assertCanonicalRational(curr, n * prev.num)
			prev = curr
		}
	})

	it('cross-checks against Pascal triangle via binomial identity C(n, k) = n! / (k!(n-k)!)', () => {
		const maxN = 15
		// Independently build Pascal's triangle via additive recurrence only
		const pascal = [[1n]]
		for (let n = 1; n <= maxN; n++) {
			const row = [1n]
			for (let k = 1; k < n; k++) {
				row.push(pascal[n - 1][k - 1] + pascal[n - 1][k])
			}
			row.push(1n)
			pascal.push(row)
		}

		for (let n = 0; n <= maxN; n++) {
			const nf = factorialRationalSeries(r(BigInt(n))).num
			let rowSum = 0n
			for (let k = 0; k <= n; k++) {
				const kf = factorialRationalSeries(r(BigInt(k))).num
				const nmkf = factorialRationalSeries(r(BigInt(n - k))).num
				const denom = kf * nmkf
				assert.equal(nf % denom, 0n)
				const binom = nf / denom
				assert.equal(binom, pascal[n][k])
				rowSum += binom
			}
			assert.equal(rowSum, 1n << BigInt(n))
		}
	})

	it('cross-checks via exact rational Taylor series for e = sum_{k=0}^{20} 1/k! against Math.E', () => {
		let sumNum = 0n
		let sumDen = 1n
		for (let k = 0n; k <= 20n; k++) {
			const kf = factorialRationalSeries(r(k))
			assert.equal(kf.den, 1n)
			// Add 1 / kf.num to sumNum / sumDen
			const nextNum = sumNum * kf.num + sumDen
			const nextDen = sumDen * kf.num
			const g = gcd(nextNum, nextDen)
			sumNum = nextNum / g
			sumDen = nextDen / g
		}

		const approxE = Number(sumNum) / Number(sumDen)
		assert.ok(
			Math.abs(approxE - Math.E) < 1e-15,
			`Expected ${approxE} to match Math.E (${Math.E}) within 1e-15`
		)
	})

	it('satisfies Wilson theorem (p - 1)! ≡ -1 (mod p) for primes and Legendre p-adic valuation for 100!', () => {
		const primes = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n]
		for (const p of primes) {
			const f = factorialRationalSeries(r(p - 1n)).num
			assert.equal((f + 1n) % p, 0n, `Wilson theorem failed for prime ${p}`)
		}

		const f100 = factorialRationalSeries(r(100n))
		assert.equal(f100.den, 1n)
		for (const p of [2n, 3n, 5n, 7n, 11n]) {
			// Independent Legendre formula: v_p(n!) = sum_{j>=1} floor(n / p^j)
			let expectedVal = 0n
			let power = p
			while (power <= 100n) {
				expectedVal += 100n / power
				power *= p
			}

			// Count factors of p in f100.num
			let actualVal = 0n
			let tmp = f100.num
			while (tmp % p === 0n) {
				tmp /= p
				actualVal++
			}
			assert.equal(actualVal, expectedVal)
		}
	})

	it('satisfies Robbins Stirling bounds for n = 1..50 via log comparison', () => {
		for (let n = 1; n <= 50; n++) {
			const f = factorialRationalSeries(r(BigInt(n))).num
			// Compute log(n!) from BigInt string digits to avoid Infinity overflow
			const s = f.toString()
			const leading = Number(s.slice(0, 15))
			const logFact = Math.log(leading) + (s.length - Math.min(s.length, 15)) * Math.LN10

			const stirlingLog =
				0.5 * Math.log(2 * Math.PI * n) + n * (Math.log(n) - 1)
			const lower = stirlingLog + 1 / (12 * n + 1)
			const upper = stirlingLog + 1 / (12 * n)

			assert.ok(
				logFact > lower - 1e-12 && logFact < upper + 1e-12,
				`Robbins bound failed for n=${n}: ${logFact} not in (${lower}, ${upper})`
			)
		}
	})
})
