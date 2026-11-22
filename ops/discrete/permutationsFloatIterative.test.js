import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { permutationsFloatIterative } from './permutationsFloatIterative.js'

/**
 * Independent BigInt factorial helper for cross-checking.
 * @param {number} m
 * @returns {bigint}
 */
function bigintFactorial(m) {
	let acc = 1n
	for (let i = 2n; i <= BigInt(m); i++) {
		acc *= i
	}
	return acc
}

/**
 * Independent BigInt factorial ratio P(n, k) = n! / (n - k)!.
 * @param {number} n
 * @param {number} k
 * @returns {bigint}
 */
function bigintPermutationsRatio(n, k) {
	if (k > n) {
		return 0n
	}
	return bigintFactorial(n) / bigintFactorial(n - k)
}

describe('permutationsFloatIterative', () => {
	it('computes standard permutation values', () => {
		assert.equal(permutationsFloatIterative(5, 3), 60)
		assert.equal(permutationsFloatIterative(10, 4), 5040)
		assert.equal(permutationsFloatIterative(6, 1), 6)
		assert.equal(permutationsFloatIterative(1, 1), 1)
		assert.equal(permutationsFloatIterative(10, 5), 30240)
	})

	it('handles k = 0 and n = 0, k = 0 edge cases', () => {
		assert.equal(permutationsFloatIterative(0, 0), 1)
		assert.equal(permutationsFloatIterative(1, 0), 1)
		assert.equal(permutationsFloatIterative(42, 0), 1)
		assert.equal(permutationsFloatIterative(1000, 0), 1)
	})

	it('returns n! when k = n', () => {
		assert.equal(permutationsFloatIterative(0, 0), 1)
		assert.equal(permutationsFloatIterative(1, 1), 1)
		assert.equal(permutationsFloatIterative(5, 5), 120)
		assert.equal(permutationsFloatIterative(10, 10), 3628800)
		assert.equal(permutationsFloatIterative(18, 18), 6402373705728000)
	})

	it('returns 0 when k > n', () => {
		assert.equal(permutationsFloatIterative(0, 1), 0)
		assert.equal(permutationsFloatIterative(3, 4), 0)
		assert.equal(permutationsFloatIterative(5, 100), 0)
		assert.ok(Object.is(permutationsFloatIterative(-0, 1), 0))
	})

	it('avoids intermediate factorial overflow for large n and small k', () => {
		// 1000! overflows IEEE-754 float64 (171! is already Infinity),
		// so naive n! / (n - k)! would produce NaN.
		assert.equal(permutationsFloatIterative(1000, 2), 999000)
		assert.equal(permutationsFloatIterative(1000, 3), 997002000)
		assert.equal(permutationsFloatIterative(1000, 5), 990034950024000)
		assert.equal(permutationsFloatIterative(10000, 2), 99990000)
	})

	it('returns Infinity cleanly on true float64 overflow without hanging', () => {
		assert.ok(Number.isFinite(permutationsFloatIterative(170, 170)))
		assert.equal(permutationsFloatIterative(171, 171), Infinity)
		assert.equal(permutationsFloatIterative(1_000_000, 1_000_000), Infinity)
	})

	it('matches independent BigInt factorial ratio exactly across all safe-integer ranges', () => {
		// 18! = 6,402,373,705,728,000 <= Number.MAX_SAFE_INTEGER (9,007,199,254,740,991)
		for (let n = 0; n <= 18; n++) {
			for (let k = 0; k <= n + 2; k++) {
				const expected = Number(bigintPermutationsRatio(n, k))
				assert.equal(
					permutationsFloatIterative(n, k),
					expected,
					`Mismatch for P(${n}, ${k})`
				)
			}
		}

		// Large n with small k where naive float64 factorials overflow
		const largeCases = [
			[200, 5],
			[500, 4],
			[1000, 5]
		]
		for (const [n, k] of largeCases) {
			const expected = Number(bigintPermutationsRatio(n, k))
			assert.equal(
				permutationsFloatIterative(n, k),
				expected,
				`Mismatch for P(${n}, ${k})`
			)
		}

		// Beyond MAX_SAFE_INTEGER (still finite in float64): verify tight relative accuracy
		const approxCases = [
			[30, 20],
			[100, 50],
			[170, 170]
		]
		for (const [n, k] of approxCases) {
			const actual = permutationsFloatIterative(n, k)
			const expected = Number(bigintPermutationsRatio(n, k))
			const relError = Math.abs(actual - expected) / expected
			assert.ok(
				relError < 1e-12,
				`Relative error ${relError} too high for P(${n}, ${k})`
			)
		}
	})

	it('rejects non-number inputs with TypeError', () => {
		const invalidTypes = [undefined, null, '5', 5n, true, false, {}, []]
		for (const bad of invalidTypes) {
			assert.throws(() => permutationsFloatIterative(bad, 2), TypeError)
			assert.throws(() => permutationsFloatIterative(5, bad), TypeError)
		}
	})

	it('rejects negative, non-integer, non-finite, and unsafe integer inputs with RangeError', () => {
		const invalidValues = [
			-1,
			-100,
			0.5,
			2.75,
			NaN,
			Infinity,
			-Infinity,
			Number.MAX_SAFE_INTEGER + 1
		]
		for (const bad of invalidValues) {
			assert.throws(() => permutationsFloatIterative(bad, 2), RangeError)
			assert.throws(() => permutationsFloatIterative(5, bad), RangeError)
		}
	})
})
