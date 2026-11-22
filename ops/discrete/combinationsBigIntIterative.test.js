import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { combinationsBigIntIterative } from './combinationsBigIntIterative.js'

/**
 * Independent factorial reference helper for cross-checking exact values.
 * @param {bigint} m
 * @returns {bigint}
 */
function factorialBigInt(m) {
	let acc = 1n
	for (let i = 2n; i <= m; i += 1n) {
		acc *= i
	}
	return acc
}

describe('combinationsBigIntIterative', () => {
	describe('normal cases', () => {
		it('computes small and medium known binomial coefficients', () => {
			assert.equal(combinationsBigIntIterative(5n, 2n), 10n)
			assert.equal(combinationsBigIntIterative(5n, 3n), 10n)
			assert.equal(combinationsBigIntIterative(10n, 3n), 120n)
			assert.equal(combinationsBigIntIterative(10n, 5n), 252n)
			assert.equal(combinationsBigIntIterative(20n, 10n), 184756n)
			assert.equal(combinationsBigIntIterative(52n, 5n), 2598960n)
		})

		it('computes exact values exceeding Number.MAX_SAFE_INTEGER', () => {
			assert.equal(combinationsBigIntIterative(60n, 30n), 118264581564861424n)
			assert.equal(
				combinationsBigIntIterative(100n, 50n),
				100891344545564193334812497256n,
			)
		})
	})

	describe('edge and boundary cases', () => {
		it('handles zero and identity boundaries', () => {
			assert.equal(combinationsBigIntIterative(0n, 0n), 1n)
			assert.equal(combinationsBigIntIterative(1n, 0n), 1n)
			assert.equal(combinationsBigIntIterative(1n, 1n), 1n)
			assert.equal(combinationsBigIntIterative(42n, 0n), 1n)
			assert.equal(combinationsBigIntIterative(42n, 42n), 1n)
			assert.equal(combinationsBigIntIterative(42n, 1n), 42n)
			assert.equal(combinationsBigIntIterative(42n, 41n), 42n)
		})

		it('returns 0n when k > n', () => {
			assert.equal(combinationsBigIntIterative(0n, 1n), 0n)
			assert.equal(combinationsBigIntIterative(5n, 6n), 0n)
			assert.equal(combinationsBigIntIterative(10n, 100n), 0n)
			assert.equal(combinationsBigIntIterative(10n ** 20n, 10n ** 20n + 1n), 0n)
		})

		it('exploits symmetry efficiently for huge n when k is near 0 or n', () => {
			const hugeN = 10n ** 30n
			assert.equal(combinationsBigIntIterative(hugeN, 0n), 1n)
			assert.equal(combinationsBigIntIterative(hugeN, hugeN), 1n)
			assert.equal(combinationsBigIntIterative(hugeN, 1n), hugeN)
			assert.equal(combinationsBigIntIterative(hugeN, hugeN - 1n), hugeN)
			assert.equal(
				combinationsBigIntIterative(hugeN, hugeN - 2n),
				(hugeN * (hugeN - 1n)) / 2n,
			)
			assert.equal(
				combinationsBigIntIterative(hugeN, 3n),
				combinationsBigIntIterative(hugeN, hugeN - 3n),
			)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when n or k is not a BigInt', () => {
			const invalidInputs = [0, 5, 3.14, NaN, '5', null, undefined, true, {}, []]
			for (const bad of invalidInputs) {
				assert.throws(() => combinationsBigIntIterative(bad, 1n), TypeError)
				assert.throws(() => combinationsBigIntIterative(5n, bad), TypeError)
			}
		})

		it('throws RangeError when n or k is negative', () => {
			assert.throws(() => combinationsBigIntIterative(-1n, 0n), RangeError)
			assert.throws(() => combinationsBigIntIterative(5n, -1n), RangeError)
			assert.throws(() => combinationsBigIntIterative(-5n, -2n), RangeError)
			assert.throws(() => combinationsBigIntIterative(-(10n ** 20n), 3n), RangeError)
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		it('matches direct factorial formula n! / (k! * (n - k)!) exactly', () => {
			for (let n = 0n; n <= 20n; n += 1n) {
				const nFact = factorialBigInt(n)
				for (let k = 0n; k <= n; k += 1n) {
					const expected = nFact / (factorialBigInt(k) * factorialBigInt(n - k))
					assert.equal(combinationsBigIntIterative(n, k), expected)
				}
			}

			// Large cross-check beyond floating-point precision
			const expected100_37 =
				factorialBigInt(100n) / (factorialBigInt(37n) * factorialBigInt(63n))
			assert.equal(combinationsBigIntIterative(100n, 37n), expected100_37)
		})

		it('satisfies Pascal identity, symmetry, and row sum 2^n', () => {
			for (let n = 0n; n <= 25n; n += 1n) {
				let rowSum = 0n
				for (let k = 0n; k <= n; k += 1n) {
					const val = combinationsBigIntIterative(n, k)
					rowSum += val

					// Symmetry: C(n, k) === C(n, n - k)
					assert.equal(val, combinationsBigIntIterative(n, n - k))

					// Pascal's identity: C(n, k) === C(n - 1, k - 1) + C(n - 1, k)
					if (n > 0n && k > 0n && k < n) {
						const pascal =
							combinationsBigIntIterative(n - 1n, k - 1n) +
							combinationsBigIntIterative(n - 1n, k)
						assert.equal(val, pascal)
					}
				}
				assert.equal(rowSum, 2n ** n)
			}
		})

		it('satisfies Vandermonde identity', () => {
			const m = 17n
			const n = 23n
			for (let r = 0n; r <= 15n; r += 1n) {
				let sum = 0n
				for (let j = 0n; j <= r; j += 1n) {
					sum +=
						combinationsBigIntIterative(m, j) *
						combinationsBigIntIterative(n, r - j)
				}
				assert.equal(sum, combinationsBigIntIterative(m + n, r))
			}
		})
	})
})
