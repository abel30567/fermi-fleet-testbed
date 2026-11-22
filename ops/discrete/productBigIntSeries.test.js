import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { productBigIntSeries } from './productBigIntSeries.js'

function sequentialProduct(terms) {
	let acc = 1n
	for (const x of terms) {
		acc *= x
	}
	return acc
}

function sequentialFactorial(n) {
	let acc = 1n
	for (let k = 2n; k <= n; k++) {
		acc *= k
	}
	return acc
}

describe('productBigIntSeries', () => {
	describe('normal cases', () => {
		test('computes exact product of an array of BigInts', () => {
			assert.equal(productBigIntSeries([2n, 3n, 5n, 7n, 11n]), 2310n)
			assert.equal(productBigIntSeries([1n, 2n, 3n, 4n, 5n, 6n]), 720n)
			assert.equal(productBigIntSeries([10n, 10n, 10n, 10n]), 10000n)
		})

		test('computes exact product over an identity range [start, end]', () => {
			assert.equal(productBigIntSeries(1n, 5n), 120n)
			assert.equal(productBigIntSeries(3n, 7n), 2520n)
			assert.equal(productBigIntSeries(10n, 12n), 1320n)
		})

		test('computes exact product over a range with custom termFn', () => {
			// Odd double factorial: 1 * 3 * 5 * 7 * 9 = 945
			assert.equal(
				productBigIntSeries(0n, 4n, (k) => 2n * k + 1n),
				945n
			)
			// Product of squares: (1 * 2 * 3 * 4)^2 = 576
			assert.equal(
				productBigIntSeries(1n, 4n, (k) => k * k),
				576n
			)
			// Product of powers of 2: 2^(1+2+3+4+5) = 2^15 = 32768
			assert.equal(
				productBigIntSeries(1n, 5n, (k) => 1n << k),
				32768n
			)
		})
	})

	describe('edge cases', () => {
		test('empty array and empty range return 1n', () => {
			assert.equal(productBigIntSeries([]), 1n)
			assert.equal(productBigIntSeries(5n, 4n), 1n)
			assert.equal(productBigIntSeries(1n, -1n), 1n)
			assert.equal(productBigIntSeries(-2n, -5n), 1n)
			let called = false
			assert.equal(
				productBigIntSeries(10n, 9n, () => {
					called = true
					return 0n
				}),
				1n
			)
			assert.equal(called, false)
		})

		test('single element array and single-point range', () => {
			assert.equal(productBigIntSeries([42n]), 42n)
			assert.equal(productBigIntSeries([-99n]), -99n)
			assert.equal(productBigIntSeries([0n]), 0n)
			assert.equal(productBigIntSeries(7n, 7n), 7n)
			assert.equal(productBigIntSeries(-7n, -7n), -7n)
			assert.equal(productBigIntSeries(0n, 0n), 0n)
			assert.equal(
				productBigIntSeries(5n, 5n, (k) => k * k + 1n),
				26n
			)
		})

		test('zero factor returns 0n and identity range short-circuits in O(1)', () => {
			assert.equal(productBigIntSeries([0n, 2n, 3n]), 0n)
			assert.equal(productBigIntSeries([2n, 0n, 3n]), 0n)
			assert.equal(productBigIntSeries([2n, 3n, 0n]), 0n)
			assert.equal(productBigIntSeries(-5n, 5n), 0n)
			assert.equal(productBigIntSeries(0n, 100n), 0n)
			assert.equal(productBigIntSeries(-100n, 0n), 0n)
			// Huge span crossing 0n must short-circuit immediately
			assert.equal(productBigIntSeries(-(10n ** 100n), 10n ** 100n), 0n)
			// Custom termFn that hits 0n
			assert.equal(
				productBigIntSeries(1n, 10n, (k) => k - 4n),
				0n
			)
		})

		test('handles negative factors accurately', () => {
			assert.equal(productBigIntSeries([-2n, 3n, -4n]), 24n)
			assert.equal(productBigIntSeries([-2n, -3n, -4n]), -24n)
			// Even count of negative factors: (-5)(-4)(-3)(-2) = 120
			assert.equal(productBigIntSeries(-5n, -2n), 120n)
			// Odd count of negative factors: (-5)(-4)(-3)(-2)(-1) = -120
			assert.equal(productBigIntSeries(-5n, -1n), -120n)
			// Alternating signs: ∏_{k=1}^5 (-1)^k * k = (-1)(2)(-3)(4)(-5) = -120
			assert.equal(
				productBigIntSeries(1n, 5n, (k) => (k % 2n === 0n ? k : -k)),
				-120n
			)
		})

		test('handles huge BigInts without precision loss', () => {
			const base = 10n ** 40n
			const rangeProd = productBigIntSeries(base, base + 4n)
			const expected = base * (base + 1n) * (base + 2n) * (base + 3n) * (base + 4n)
			assert.equal(rangeProd, expected)

			const bigTerms = [
				(1n << 128n) + 1n,
				(1n << 128n) + 3n,
				-((1n << 128n) + 7n),
				(1n << 256n) + 13n,
			]
			assert.equal(productBigIntSeries(bigTerms), sequentialProduct(bigTerms))
		})
	})

	describe('invalid inputs', () => {
		test('rejects missing or wrong argument counts', () => {
			assert.throws(() => productBigIntSeries(), TypeError)
			assert.throws(() => productBigIntSeries([1n, 2n], 3n), TypeError)
			assert.throws(() => productBigIntSeries(1n), TypeError)
			assert.throws(() => productBigIntSeries(1n, 5n, (k) => k, 'extra'), TypeError)
		})

		test('rejects non-BigInt elements and sparse arrays', () => {
			assert.throws(() => productBigIntSeries([1n, 2]), TypeError)
			assert.throws(() => productBigIntSeries(['1']), TypeError)
			assert.throws(() => productBigIntSeries([1n, null]), TypeError)
			// Must validate all elements even when 0n precedes an invalid element
			assert.throws(() => productBigIntSeries([0n, 'bad']), TypeError)
			// Sparse array with hole
			const sparse = new Array(3)
			sparse[0] = 1n
			sparse[2] = 3n
			assert.throws(() => productBigIntSeries(sparse), TypeError)
		})

		test('rejects invalid range bounds or termFn', () => {
			assert.throws(() => productBigIntSeries(1, 5n), TypeError)
			assert.throws(() => productBigIntSeries(1n, 5), TypeError)
			assert.throws(() => productBigIntSeries('1', '5'), TypeError)
			assert.throws(() => productBigIntSeries(null, 5n), TypeError)
			assert.throws(() => productBigIntSeries(1n, 5n, 'not-a-fn'), TypeError)
			assert.throws(() => productBigIntSeries(1n, 5n, null), TypeError)
		})

		test('rejects termFn returning non-BigInt values', () => {
			assert.throws(
				() => productBigIntSeries(1n, 3n, (k) => Number(k)),
				TypeError
			)
			// Still validates remaining terms even if an earlier term returned 0n
			assert.throws(
				() => productBigIntSeries(1n, 3n, (k) => (k === 1n ? 0n : 'bad')),
				TypeError
			)
		})
	})

	describe('independent cross-checks and mathematical identities', () => {
		test('product of 1..n equals n! via independent sequential computation', () => {
			assert.equal(productBigIntSeries(1n, 20n), 2432902008176640000n)
			for (const n of [1n, 10n, 25n, 50n, 100n, 250n]) {
				assert.equal(productBigIntSeries(1n, n), sequentialFactorial(n))
			}
		})

		test('telescoping product ∏_{k=1}^n (k+1)/k === n+1 via numerator/denominator products', () => {
			const SCALE = 10n ** 18n
			for (const n of [1n, 7n, 32n, 120n]) {
				const numerator = productBigIntSeries(1n, n, (k) => k + 1n)
				const denominator = productBigIntSeries(1n, n)
				// Exact integer cross-check: numerator / denominator === n + 1
				assert.equal(numerator, (n + 1n) * denominator)
				// Fixed-point 10^18 scaled ratio check
				assert.equal((numerator * SCALE) / denominator, (n + 1n) * SCALE)
			}
		})

		test('even/odd factorial factorization: ∏(2k-1) * ∏(2k) === (2n)! and ∏(2k) === 2^n * n!', () => {
			const n = 40n
			const odds = productBigIntSeries(1n, n, (k) => 2n * k - 1n)
			const evens = productBigIntSeries(1n, n, (k) => 2n * k)
			const factN = productBigIntSeries(1n, n)
			const fact2N = productBigIntSeries(1n, 2n * n)

			assert.equal(evens, (1n << n) * factN)
			assert.equal(odds * evens, fact2N)
		})

		test('subrange product identity: ∏_{k=a}^b k === b! / (a-1)!', () => {
			const a = 37n
			const b = 89n
			const subrange = productBigIntSeries(a, b)
			const ratio = sequentialFactorial(b) / sequentialFactorial(a - 1n)
			assert.equal(subrange, ratio)
		})

		test('array product tree matches direct sequential multiplication and range form', () => {
			const terms = []
			for (let i = 1n; i <= 200n; i++) {
				const sign = i % 3n === 0n ? -1n : 1n
				terms.push(sign * (i * i + 17n))
			}
			const viaArray = productBigIntSeries(terms)
			const viaSequential = sequentialProduct(terms)
			const viaRange = productBigIntSeries(1n, 200n, (i) => {
				const sign = i % 3n === 0n ? -1n : 1n
				return sign * (i * i + 17n)
			})

			assert.equal(viaArray, viaSequential)
			assert.equal(viaRange, viaSequential)
		})
	})
})
