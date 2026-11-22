import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { combinationsFloatIterative } from './combinationsFloatIterative.js'

/**
 * Exact BigInt binomial coefficient for cross-checking.
 * @param {number} n
 * @param {number} k
 * @returns {bigint}
 */
function combinationsBigInt(n, k) {
	if (k > n) return 0n
	const r = Math.min(k, n - k)
	let result = 1n
	for (let i = 1; i <= r; i++) {
		result = (result * BigInt(n - i + 1)) / BigInt(i)
	}
	return result
}

describe('combinationsFloatIterative', () => {
	test('computes normal cases accurately', () => {
		assert.equal(combinationsFloatIterative(5, 2), 10)
		assert.equal(combinationsFloatIterative(6, 3), 20)
		assert.equal(combinationsFloatIterative(10, 3), 120)
		assert.equal(combinationsFloatIterative(10, 5), 252)
		assert.equal(combinationsFloatIterative(20, 10), 184756)
		assert.equal(combinationsFloatIterative(30, 15), 155117520)
		assert.equal(combinationsFloatIterative(52, 5), 2598960)
	})

	test('handles edge cases (k=0, k=n, n=0 k=0, k>n, -0)', () => {
		assert.equal(combinationsFloatIterative(0, 0), 1)
		assert.equal(combinationsFloatIterative(0, 1), 0)
		assert.equal(combinationsFloatIterative(5, 0), 1)
		assert.equal(combinationsFloatIterative(5, 5), 1)
		assert.equal(combinationsFloatIterative(5, 6), 0)
		assert.equal(combinationsFloatIterative(100, 0), 1)
		assert.equal(combinationsFloatIterative(100, 100), 1)
		assert.equal(combinationsFloatIterative(100, 101), 0)
		assert.equal(combinationsFloatIterative(1, 0), 1)
		assert.equal(combinationsFloatIterative(1, 1), 1)
		assert.equal(combinationsFloatIterative(-0, -0), 1)
	})

	test('satisfies symmetry C(n, k) === C(n, n - k)', () => {
		for (let n = 0; n <= 35; n++) {
			for (let k = 0; k <= n; k++) {
				assert.equal(
					combinationsFloatIterative(n, k),
					combinationsFloatIterative(n, n - k),
					`symmetry failed for n=${n}, k=${k}`
				)
			}
		}
	})

	test('handles large n with small k (and symmetric k near n)', () => {
		assert.equal(combinationsFloatIterative(1_000_000, 0), 1)
		assert.equal(combinationsFloatIterative(1_000_000, 1), 1_000_000)
		assert.equal(combinationsFloatIterative(1_000_000, 2), 499_999_500_000)
		assert.equal(combinationsFloatIterative(1_000_000, 999_998), 499_999_500_000)
		assert.equal(combinationsFloatIterative(1_000_000, 999_999), 1_000_000)
		assert.equal(combinationsFloatIterative(100_000, 3), 166_661_666_700_000)
		assert.equal(combinationsFloatIterative(100_000, 99_997), 166_661_666_700_000)
	})

	test('handles float64 overflow to Infinity for huge binomial coefficients', () => {
		assert.equal(combinationsFloatIterative(1030, 515), Infinity)
	})

	test('cross-checks against Pascal triangle recurrence C(n, k) = C(n-1, k-1) + C(n-1, k)', () => {
		const maxN = 30
		const pascal = []
		for (let n = 0; n <= maxN; n++) {
			pascal[n] = new Array(n + 1)
			pascal[n][0] = 1
			pascal[n][n] = 1
			for (let k = 1; k < n; k++) {
				pascal[n][k] = pascal[n - 1][k - 1] + pascal[n - 1][k]
			}
			for (let k = 0; k <= n; k++) {
				assert.equal(
					combinationsFloatIterative(n, k),
					pascal[n][k],
					`Pascal mismatch at C(${n}, ${k})`
				)
			}
		}
	})

	test('cross-checks against exact BigInt computation', () => {
		// Exact agreement for values whose intermediates fit in IEEE-754 safe integers
		for (let n = 0; n <= 45; n++) {
			for (let k = 0; k <= n; k++) {
				const exact = combinationsBigInt(n, k)
				assert.equal(
					combinationsFloatIterative(n, k),
					Number(exact),
					`BigInt exact mismatch at C(${n}, ${k})`
				)
			}
		}

		// Close relative accuracy for larger float64 values beyond MAX_SAFE_INTEGER
		for (const [n, k] of [
			[60, 30],
			[100, 50],
			[200, 100],
			[500, 200]
		]) {
			const expected = Number(combinationsBigInt(n, k))
			const actual = combinationsFloatIterative(n, k)
			const relErr = Math.abs(actual - expected) / expected
			assert.ok(relErr < 1e-12, `Relative error ${relErr} too large for C(${n}, ${k})`)
		}
	})

	test('satisfies row-sum identity sum_{k=0..n} C(n, k) = 2^n', () => {
		for (let n = 0; n <= 40; n++) {
			let sum = 0
			for (let k = 0; k <= n; k++) {
				sum += combinationsFloatIterative(n, k)
			}
			assert.equal(sum, 2 ** n, `Row sum failed for n=${n}`)
		}
	})

	test('rejects invalid inputs strictly', () => {
		// Non-number types -> TypeError
		const nonNumbers = ['5', null, undefined, true, false, 5n, {}, [], Symbol('x')]
		for (const bad of nonNumbers) {
			assert.throws(() => combinationsFloatIterative(bad, 2), TypeError)
			assert.throws(() => combinationsFloatIterative(5, bad), TypeError)
		}

		// Non-integer or non-finite numbers -> RangeError
		const nonIntegers = [NaN, Infinity, -Infinity, 1.5, -0.5, 0.1, Number.EPSILON]
		for (const bad of nonIntegers) {
			assert.throws(() => combinationsFloatIterative(bad, 2), RangeError)
			assert.throws(() => combinationsFloatIterative(5, bad), RangeError)
		}

		// Negative integers -> RangeError
		assert.throws(() => combinationsFloatIterative(-1, 0), RangeError)
		assert.throws(() => combinationsFloatIterative(5, -1), RangeError)
		assert.throws(() => combinationsFloatIterative(-3, -2), RangeError)
	})
})
