import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { combinationsBigIntIterative } from './combinationsBigIntIterative.js'

function factorialBigInt(n) {
	let acc = 1n
	for (let i = 2n; i <= n; i += 1n) {
		acc *= i
	}
	return acc
}

describe('combinationsBigIntIterative', () => {
	test('computes known small and medium binomial coefficients', () => {
		assert.equal(combinationsBigIntIterative(5n, 2n), 10n)
		assert.equal(combinationsBigIntIterative(6n, 3n), 20n)
		assert.equal(combinationsBigIntIterative(10n, 4n), 210n)
		assert.equal(combinationsBigIntIterative(20n, 10n), 184756n)
		assert.equal(combinationsBigIntIterative(52n, 5n), 2598960n)
	})

	test('handles boundary edge cases (n=0n, k=0n, k=n, k>n)', () => {
		assert.equal(combinationsBigIntIterative(0n, 0n), 1n)
		assert.equal(combinationsBigIntIterative(0n, 1n), 0n)
		assert.equal(combinationsBigIntIterative(0n, 100n), 0n)

		assert.equal(combinationsBigIntIterative(1n, 0n), 1n)
		assert.equal(combinationsBigIntIterative(1n, 1n), 1n)
		assert.equal(combinationsBigIntIterative(1n, 2n), 0n)

		assert.equal(combinationsBigIntIterative(15n, 0n), 1n)
		assert.equal(combinationsBigIntIterative(15n, 15n), 1n)
		assert.equal(combinationsBigIntIterative(15n, 16n), 0n)
		assert.equal(combinationsBigIntIterative(15n, 1000n), 0n)
	})

	test('uses symmetry to handle huge n with small k or k close to n', () => {
		const huge = 10n ** 30n
		assert.equal(combinationsBigIntIterative(huge, 0n), 1n)
		assert.equal(combinationsBigIntIterative(huge, huge), 1n)
		assert.equal(combinationsBigIntIterative(huge, 1n), huge)
		assert.equal(combinationsBigIntIterative(huge, huge - 1n), huge)
		assert.equal(combinationsBigIntIterative(huge, 2n), (huge * (huge - 1n)) / 2n)
		assert.equal(combinationsBigIntIterative(huge, huge - 2n), (huge * (huge - 1n)) / 2n)
		assert.equal(combinationsBigIntIterative(huge, huge + 1n), 0n)
	})

	test('computes exact large BigInt values beyond Number.MAX_SAFE_INTEGER', () => {
		assert.equal(
			combinationsBigIntIterative(100n, 50n),
			100891344545564193334812497256n
		)
		assert.equal(
			combinationsBigIntIterative(100n, 30n),
			29372339821610944823963760n
		)
		const expected200Choose100 =
			factorialBigInt(200n) / (factorialBigInt(100n) * factorialBigInt(100n))
		assert.equal(combinationsBigIntIterative(200n, 100n), expected200Choose100)
	})

	test('satisfies symmetry C(n, k) === C(n, n - k)', () => {
		for (let n = 0n; n <= 25n; n += 1n) {
			for (let k = 0n; k <= n; k += 1n) {
				assert.equal(
					combinationsBigIntIterative(n, k),
					combinationsBigIntIterative(n, n - k)
				)
			}
		}
	})

	test('cross-checks against Pascal triangle recurrence and DP table', () => {
		const maxN = 30
		let row = [1n]
		for (let n = 0; n <= maxN; n += 1) {
			const bigN = BigInt(n)
			for (let k = 0; k <= n; k += 1) {
				const bigK = BigInt(k)
				const actual = combinationsBigIntIterative(bigN, bigK)
				assert.equal(actual, row[k], `Mismatch at C(${n}, ${k})`)
				if (k > 0 && k < n) {
					const pascalSum =
						combinationsBigIntIterative(bigN - 1n, bigK - 1n) +
						combinationsBigIntIterative(bigN - 1n, bigK)
					assert.equal(actual, pascalSum)
				}
			}
			const nextRow = [1n]
			for (let k = 1; k <= n; k += 1) {
				nextRow.push(row[k - 1] + row[k])
			}
			nextRow.push(1n)
			row = nextRow
		}
	})

	test('cross-checks row sum identity sum_{k=0..n} C(n, k) === 2^n', () => {
		for (let n = 0n; n <= 25n; n += 1n) {
			let sum = 0n
			for (let k = 0n; k <= n; k += 1n) {
				sum += combinationsBigIntIterative(n, k)
			}
			assert.equal(sum, 1n << n)
		}
	})

	test('cross-checks against factorial formula and Vandermonde identity', () => {
		const n = 50n
		const factN = factorialBigInt(n)
		for (let k = 0n; k <= n; k += 1n) {
			const expected = factN / (factorialBigInt(k) * factorialBigInt(n - k))
			assert.equal(combinationsBigIntIterative(n, k), expected)
		}

		// Vandermonde's identity: sum_{j=0..r} C(m, j) * C(p, r - j) === C(m + p, r)
		const m = 18n
		const p = 14n
		for (let r = 0n; r <= 12n; r += 1n) {
			let lhs = 0n
			for (let j = 0n; j <= r; j += 1n) {
				lhs +=
					combinationsBigIntIterative(m, j) *
					combinationsBigIntIterative(p, r - j)
			}
			assert.equal(lhs, combinationsBigIntIterative(m + p, r))
		}
	})

	test('rejects invalid input types with TypeError', () => {
		const invalidValues = [0, 5, 3.5, NaN, Infinity, '5', null, undefined, true, {}]
		for (const bad of invalidValues) {
			assert.throws(() => combinationsBigIntIterative(bad, 1n), TypeError)
			assert.throws(() => combinationsBigIntIterative(5n, bad), TypeError)
		}
		assert.throws(() => combinationsBigIntIterative(), TypeError)
		assert.throws(() => combinationsBigIntIterative(5n), TypeError)
	})

	test('rejects negative BigInt arguments with RangeError', () => {
		assert.throws(() => combinationsBigIntIterative(-1n, 0n), RangeError)
		assert.throws(() => combinationsBigIntIterative(-10n, 2n), RangeError)
		assert.throws(() => combinationsBigIntIterative(5n, -1n), RangeError)
		assert.throws(() => combinationsBigIntIterative(0n, -1n), RangeError)
		assert.throws(() => combinationsBigIntIterative(-5n, -2n), RangeError)
	})
})
