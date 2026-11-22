import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { factorialBigIntIterative } from './factorialBigIntIterative.js'

/**
 * Independent reference implementation using Legendre's formula over primes:
 * n! = prod_{p <= n, p prime} p^{v_p(n!)} where v_p(n!) = sum_{k >= 1} floor(n / p^k).
 */
function factorialByPrimeFactorization(nNum) {
	if (nNum === 0 || nNum === 1) return 1n
	const isPrime = new Uint8Array(nNum + 1).fill(1)
	isPrime[0] = 0
	isPrime[1] = 0
	for (let p = 2; p * p <= nNum; p += 1) {
		if (isPrime[p]) {
			for (let m = p * p; m <= nNum; m += p) {
				isPrime[m] = 0
			}
		}
	}
	let product = 1n
	for (let p = 2; p <= nNum; p += 1) {
		if (!isPrime[p]) continue
		let exponent = 0n
		let power = p
		while (power <= nNum) {
			exponent += BigInt(Math.floor(nNum / power))
			power *= p
		}
		product *= BigInt(p) ** exponent
	}
	return product
}

describe('factorialBigIntIterative', () => {
	describe('normal cases', () => {
		it('computes exact factorials for small integers', () => {
			const expected = [
				[0n, 1n],
				[1n, 1n],
				[2n, 2n],
				[3n, 6n],
				[4n, 24n],
				[5n, 120n],
				[6n, 720n],
				[7n, 5040n],
				[10n, 3628800n],
				[12n, 479001600n],
				[20n, 2432902008176640000n],
			]
			for (const [input, want] of expected) {
				assert.equal(factorialBigIntIterative(input), want)
			}
		})

		it('computes exact factorials beyond Number.MAX_SAFE_INTEGER', () => {
			assert.equal(factorialBigIntIterative(21n), 51090942171709440000n)
			assert.equal(factorialBigIntIterative(25n), 15511210043330985984000000n)
			assert.equal(
				factorialBigIntIterative(30n),
				265252859812191058636308480000000n
			)
			assert.equal(
				factorialBigIntIterative(50n),
				30414093201713378043612608166064768844377641568960512000000000000n
			)
		})
	})

	describe('edge cases and large values', () => {
		it('handles identity / boundary cases 0n and 1n', () => {
			assert.equal(factorialBigIntIterative(0n), 1n)
			assert.equal(factorialBigIntIterative(1n), 1n)
			assert.equal(typeof factorialBigIntIterative(0n), 'bigint')
		})

		it('computes exact 100! (158-digit integer)', () => {
			const fact100 = factorialBigIntIterative(100n)
			const expected100 =
				93326215443944152681699238856266700490715968264381621468592963895217599993229915608941463976156518286253697920827223758251185210916864000000000000000000000000n
			assert.equal(fact100, expected100)
			assert.equal(fact100.toString().length, 158)
		})

		it('computes large factorials (500! and 1000!) accurately', () => {
			const fact500 = factorialBigIntIterative(500n)
			const str500 = fact500.toString()
			assert.equal(str500.length, 1135)
			assert.ok(str500.startsWith('12201368259911100687'))
			assert.equal(str500.length - str500.replace(/0+$/, '').length, 124)

			const fact1000 = factorialBigIntIterative(1000n)
			const str1000 = fact1000.toString()
			assert.equal(str1000.length, 2568)
			assert.ok(str1000.startsWith('40238726007709377354'))
			assert.equal(str1000.length - str1000.replace(/0+$/, '').length, 249)
		})
	})

	describe('input validation', () => {
		it('throws RangeError for negative BigInt inputs', () => {
			for (const bad of [-1n, -2n, -10n, -(10n ** 30n)]) {
				assert.throws(
					() => factorialBigIntIterative(bad),
					{ name: 'RangeError' }
				)
			}
		})

		it('throws TypeError for non-BigInt inputs', () => {
			const invalidInputs = [
				0,
				5,
				-1,
				1.5,
				Number.NaN,
				Number.POSITIVE_INFINITY,
				'5',
				'0',
				null,
				undefined,
				true,
				false,
				{},
				[5n],
				Symbol('5'),
			]
			for (const bad of invalidInputs) {
				assert.throws(
					() => factorialBigIntIterative(bad),
					{ name: 'TypeError' }
				)
			}
			assert.throws(() => factorialBigIntIterative(), { name: 'TypeError' })
		})
	})

	describe('independent cross-checks', () => {
		it('satisfies the recurrence n! === n * (n - 1)! for n = 1..100', () => {
			let prev = factorialBigIntIterative(0n)
			for (let n = 1n; n <= 100n; n += 1n) {
				const curr = factorialBigIntIterative(n)
				assert.equal(curr, n * prev)
				prev = curr
			}
		})

		it('matches independent prime-factorization (Legendre) computation', () => {
			for (const n of [0, 1, 2, 10, 25, 50, 100, 200]) {
				assert.equal(
					factorialBigIntIterative(BigInt(n)),
					factorialByPrimeFactorization(n)
				)
			}
		})

		it('satisfies Wilson theorem for primes and divisibility for composites > 4', () => {
			for (const p of [2n, 3n, 5n, 7n, 11n, 13n, 29n, 97n, 101n]) {
				assert.equal(factorialBigIntIterative(p - 1n) % p, p - 1n)
			}
			for (const m of [6n, 8n, 9n, 10n, 15n, 25n, 64n]) {
				assert.equal(factorialBigIntIterative(m - 1n) % m, 0n)
			}
		})

		it('matches Pascal triangle binomial coefficients and sum C(n, k) = 2^n', () => {
			let row = [1n]
			for (let n = 0; n <= 25; n += 1) {
				const factN = factorialBigIntIterative(BigInt(n))
				let rowSum = 0n
				for (let k = 0; k <= n; k += 1) {
					const denom =
						factorialBigIntIterative(BigInt(k)) *
						factorialBigIntIterative(BigInt(n - k))
					assert.equal(factN % denom, 0n)
					const binom = factN / denom
					assert.equal(binom, row[k])
					rowSum += binom
				}
				assert.equal(rowSum, 2n ** BigInt(n))
				const nextRow = [1n]
				for (let k = 1; k < row.length; k += 1) {
					nextRow.push(row[k - 1] + row[k])
				}
				nextRow.push(1n)
				row = nextRow
			}
		})

		it('agrees with floating-point log10 sum for digit counts and leading digits', () => {
			for (const n of [50, 100, 300]) {
				const factStr = factorialBigIntIterative(BigInt(n)).toString()
				let log10Sum = 0
				for (let k = 2; k <= n; k += 1) {
					log10Sum += Math.log10(k)
				}
				assert.equal(factStr.length, Math.floor(log10Sum) + 1)
				const frac = log10Sum - Math.floor(log10Sum)
				const approxLeading = Math.floor(10 ** (frac + 6)).toString()
				assert.equal(factStr.slice(0, 6), approxLeading.slice(0, 6))
			}
		})
	})
})
