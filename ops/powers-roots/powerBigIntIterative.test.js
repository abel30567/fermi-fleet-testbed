import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { powerBigIntIterative } from './powerBigIntIterative.js'

const SCALE = 10n ** 18n

/**
 * Independent reference implementation using naive repeated multiplication
 * (O(|exp|)) for cross-checking small exponents.
 */
function naiveRepeatedMultiplyPower(base, exponent) {
	if (exponent >= 0n) {
		let acc = 1n
		for (let i = 0n; i < exponent; i += 1n) {
			acc *= base
		}
		return acc
	}
	let denom = 1n
	const absExp = -exponent
	for (let i = 0n; i < absExp; i += 1n) {
		denom *= base
	}
	return SCALE / denom
}

describe('powerBigIntIterative', () => {
	test('handles normal non-negative exponents', () => {
		assert.equal(powerBigIntIterative(2n, 1n), 2n)
		assert.equal(powerBigIntIterative(2n, 10n), 1024n)
		assert.equal(powerBigIntIterative(3n, 5n), 243n)
		assert.equal(powerBigIntIterative(10n, 6n), 1_000_000n)
		assert.equal(powerBigIntIterative(7n, 7n), 823_543n)
	})

	test('handles exponent = 0n including 0n ** 0n', () => {
		assert.equal(powerBigIntIterative(0n, 0n), 1n)
		assert.equal(powerBigIntIterative(1n, 0n), 1n)
		assert.equal(powerBigIntIterative(-1n, 0n), 1n)
		assert.equal(powerBigIntIterative(42n, 0n), 1n)
		assert.equal(powerBigIntIterative(-999n, 0n), 1n)
	})

	test('handles base = 0n with positive exponents', () => {
		assert.equal(powerBigIntIterative(0n, 1n), 0n)
		assert.equal(powerBigIntIterative(0n, 2n), 0n)
		assert.equal(powerBigIntIterative(0n, 100n), 0n)
	})

	test('handles base = 1n and base = -1n for positive, zero, and negative exponents', () => {
		assert.equal(powerBigIntIterative(1n, 0n), 1n)
		assert.equal(powerBigIntIterative(1n, 999_999n), 1n)
		assert.equal(powerBigIntIterative(1n, -1n), SCALE)
		assert.equal(powerBigIntIterative(1n, -100_000n), SCALE)

		assert.equal(powerBigIntIterative(-1n, 0n), 1n)
		assert.equal(powerBigIntIterative(-1n, 1n), -1n)
		assert.equal(powerBigIntIterative(-1n, 2n), 1n)
		assert.equal(powerBigIntIterative(-1n, 101n), -1n)
		assert.equal(powerBigIntIterative(-1n, 102n), 1n)
		assert.equal(powerBigIntIterative(-1n, -1n), -SCALE)
		assert.equal(powerBigIntIterative(-1n, -2n), SCALE)
		assert.equal(powerBigIntIterative(-1n, -999_999n), -SCALE)
		assert.equal(powerBigIntIterative(-1n, -1_000_000n), SCALE)
	})

	test('handles negative bases with odd and even exponents', () => {
		assert.equal(powerBigIntIterative(-2n, 3n), -8n)
		assert.equal(powerBigIntIterative(-2n, 4n), 16n)
		assert.equal(powerBigIntIterative(-3n, 5n), -243n)
		assert.equal(powerBigIntIterative(-3n, 6n), 729n)
		assert.equal(powerBigIntIterative(-5n, 1n), -5n)
		assert.equal(powerBigIntIterative(-5n, 2n), 25n)
	})

	test('handles negative exponents as 10^18 fixed-point BigInt', () => {
		assert.equal(powerBigIntIterative(2n, -1n), 500_000_000_000_000_000n)
		assert.equal(powerBigIntIterative(2n, -2n), 250_000_000_000_000_000n)
		assert.equal(powerBigIntIterative(2n, -3n), 125_000_000_000_000_000n)
		assert.equal(powerBigIntIterative(-2n, -3n), -125_000_000_000_000_000n)
		assert.equal(powerBigIntIterative(-2n, -4n), 62_500_000_000_000_000n)
		assert.equal(powerBigIntIterative(3n, -1n), 333_333_333_333_333_333n)
		assert.equal(powerBigIntIterative(-3n, -1n), -333_333_333_333_333_333n)
		assert.equal(powerBigIntIterative(10n, -6n), 1_000_000_000_000n)
		assert.equal(powerBigIntIterative(10n, -18n), 1n)
		assert.equal(powerBigIntIterative(10n, -19n), 0n)
		assert.equal(powerBigIntIterative(-10n, -18n), 1n)
		assert.equal(powerBigIntIterative(-10n, -19n), 0n)
	})

	test('handles large exponents efficiently', () => {
		assert.equal(powerBigIntIterative(2n, 128n), 2n ** 128n)
		assert.equal(powerBigIntIterative(3n, 256n), 3n ** 256n)
		assert.equal(powerBigIntIterative(-7n, 201n), (-7n) ** 201n)
		assert.equal(powerBigIntIterative(10n, 500n), 10n ** 500n)
		// Very large negative exponents underflow cleanly to 0n without allocating huge intermediates
		assert.equal(powerBigIntIterative(2n, -1_000_000n), 0n)
		assert.equal(powerBigIntIterative(-3n, -10_000_000n), 0n)
	})

	test('rejects invalid inputs', () => {
		assert.throws(() => powerBigIntIterative(0n, -1n), RangeError)
		assert.throws(() => powerBigIntIterative(0n, -100n), RangeError)

		assert.throws(() => powerBigIntIterative(2, 3n), TypeError)
		assert.throws(() => powerBigIntIterative(2n, 3), TypeError)
		assert.throws(() => powerBigIntIterative('2', 3n), TypeError)
		assert.throws(() => powerBigIntIterative(2n, '3'), TypeError)
		assert.throws(() => powerBigIntIterative(null, 3n), TypeError)
		assert.throws(() => powerBigIntIterative(2n, undefined), TypeError)
		assert.throws(() => powerBigIntIterative(NaN, 2n), TypeError)
		assert.throws(() => powerBigIntIterative(2n, Infinity), TypeError)
	})

	test('cross-checks against native ** operator and naive repeated multiplication', () => {
		const bases = [-10n, -7n, -3n, -2n, -1n, 0n, 1n, 2n, 3n, 5n, 10n]
		const nonNegExps = [0n, 1n, 2n, 3n, 4n, 5n, 7n, 12n, 19n]

		for (const b of bases) {
			for (const e of nonNegExps) {
				const actual = powerBigIntIterative(b, e)
				assert.equal(actual, b ** e, `native ** mismatch for (${b}n, ${e}n)`)
				assert.equal(
					actual,
					naiveRepeatedMultiplyPower(b, e),
					`repeated multiplication mismatch for (${b}n, ${e}n)`
				)
			}
		}

		const nonZeroBases = bases.filter((b) => b !== 0n)
		const negExps = [-1n, -2n, -3n, -4n, -5n, -8n, -15n, -18n, -19n, -25n]

		for (const b of nonZeroBases) {
			for (const e of negExps) {
				const actual = powerBigIntIterative(b, e)
				const expectedNative = SCALE / b ** -e
				const expectedNaive = naiveRepeatedMultiplyPower(b, e)
				assert.equal(
					actual,
					expectedNative,
					`10^18 / (base ** |exp|) mismatch for (${b}n, ${e}n)`
				)
				assert.equal(
					actual,
					expectedNaive,
					`naive negative power mismatch for (${b}n, ${e}n)`
				)
			}
		}
	})
})
