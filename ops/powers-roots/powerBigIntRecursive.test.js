import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { powerBigIntRecursive } from './powerBigIntRecursive.js'

const SCALE = 10n ** 18n

describe('powerBigIntRecursive', () => {
	test('computes exact positive powers for positive bases', () => {
		assert.equal(powerBigIntRecursive(2n, 1n), 2n)
		assert.equal(powerBigIntRecursive(2n, 10n), 1024n)
		assert.equal(powerBigIntRecursive(3n, 5n), 243n)
		assert.equal(powerBigIntRecursive(10n, 18n), 1000000000000000000n)
		assert.equal(powerBigIntRecursive(7n, 13n), 96889010407n)
	})

	test('computes exact positive powers for negative bases (even and odd exponents)', () => {
		assert.equal(powerBigIntRecursive(-2n, 1n), -2n)
		assert.equal(powerBigIntRecursive(-2n, 2n), 4n)
		assert.equal(powerBigIntRecursive(-2n, 3n), -8n)
		assert.equal(powerBigIntRecursive(-2n, 4n), 16n)
		assert.equal(powerBigIntRecursive(-3n, 5n), -243n)
		assert.equal(powerBigIntRecursive(-5n, 6n), 15625n)
	})

	test('returns 10^18-scaled fixed-point BigInt for negative exponents', () => {
		assert.equal(powerBigIntRecursive(2n, -1n), 500000000000000000n)
		assert.equal(powerBigIntRecursive(2n, -2n), 250000000000000000n)
		assert.equal(powerBigIntRecursive(4n, -1n), 250000000000000000n)
		assert.equal(powerBigIntRecursive(10n, -3n), 1000000000000000n)
		assert.equal(powerBigIntRecursive(10n, -18n), 1n)
		assert.equal(powerBigIntRecursive(10n, -19n), 0n)
		assert.equal(powerBigIntRecursive(3n, -1n), 333333333333333333n)
		assert.equal(powerBigIntRecursive(-2n, -1n), -500000000000000000n)
		assert.equal(powerBigIntRecursive(-2n, -2n), 250000000000000000n)
		assert.equal(powerBigIntRecursive(-3n, -1n), -333333333333333333n)
		assert.equal(powerBigIntRecursive(2n, -59n), 1n)
		assert.equal(powerBigIntRecursive(-2n, -59n), -1n)
		assert.equal(powerBigIntRecursive(2n, -60n), 0n)
		assert.equal(powerBigIntRecursive(-2n, -60n), 0n)
		assert.equal(powerBigIntRecursive(2n, -(2n ** 256n)), 0n)
	})

	test('handles zero exponent edge cases including 0n ** 0n', () => {
		assert.equal(powerBigIntRecursive(0n, 0n), 1n)
		assert.equal(powerBigIntRecursive(1n, 0n), 1n)
		assert.equal(powerBigIntRecursive(-1n, 0n), 1n)
		assert.equal(powerBigIntRecursive(42n, 0n), 1n)
		assert.equal(powerBigIntRecursive(-42n, 0n), 1n)
	})

	test('handles base 0n, 1n, and -1n edge cases', () => {
		assert.equal(powerBigIntRecursive(0n, 1n), 0n)
		assert.equal(powerBigIntRecursive(0n, 2n), 0n)
		assert.equal(powerBigIntRecursive(0n, 100n), 0n)
		assert.equal(powerBigIntRecursive(0n, 2n ** 256n), 0n)

		assert.equal(powerBigIntRecursive(1n, 1n), 1n)
		assert.equal(powerBigIntRecursive(1n, 999n), 1n)
		assert.equal(powerBigIntRecursive(1n, 2n ** 256n), 1n)
		assert.equal(powerBigIntRecursive(1n, -1n), SCALE)
		assert.equal(powerBigIntRecursive(1n, -999n), SCALE)
		assert.equal(powerBigIntRecursive(1n, -(2n ** 256n)), SCALE)

		assert.equal(powerBigIntRecursive(-1n, 1n), -1n)
		assert.equal(powerBigIntRecursive(-1n, 2n), 1n)
		assert.equal(powerBigIntRecursive(-1n, 2n ** 256n), 1n)
		assert.equal(powerBigIntRecursive(-1n, (2n ** 256n) + 1n), -1n)
		assert.equal(powerBigIntRecursive(-1n, -1n), -SCALE)
		assert.equal(powerBigIntRecursive(-1n, -2n), SCALE)
		assert.equal(powerBigIntRecursive(-1n, -(2n ** 256n)), SCALE)
		assert.equal(powerBigIntRecursive(-1n, -((2n ** 256n) + 1n)), -SCALE)
	})

	test('handles large exponents and large results accurately', () => {
		assert.equal(powerBigIntRecursive(2n, 256n), 2n ** 256n)
		assert.equal(powerBigIntRecursive(2n, 1024n), 2n ** 1024n)
		assert.equal(powerBigIntRecursive(3n, 256n), 3n ** 256n)
		assert.equal(powerBigIntRecursive(-2n, 255n), (-2n) ** 255n)
		assert.equal(powerBigIntRecursive(-2n, 256n), (-2n) ** 256n)
		assert.equal(powerBigIntRecursive(12345678901234567890n, 17n), 12345678901234567890n ** 17n)
	})

	test('throws RangeError for 0n with negative exponent', () => {
		assert.throws(() => powerBigIntRecursive(0n, -1n), RangeError)
		assert.throws(() => powerBigIntRecursive(0n, -10n), RangeError)
		assert.throws(() => powerBigIntRecursive(0n, -(2n ** 256n)), RangeError)
	})

	test('throws TypeError for non-BigInt arguments', () => {
		const invalidValues = [2, 0, -1, 1.5, NaN, Infinity, '2', null, undefined, true, {}, []]
		for (const bad of invalidValues) {
			assert.throws(() => powerBigIntRecursive(bad, 2n), TypeError)
			assert.throws(() => powerBigIntRecursive(2n, bad), TypeError)
		}
		assert.throws(() => powerBigIntRecursive(2, 3), TypeError)
		assert.throws(() => powerBigIntRecursive(), TypeError)
	})

	test('cross-checks against native BigInt exponentiation and fixed-point division', () => {
		const bases = [-10n, -3n, -2n, -1n, 0n, 1n, 2n, 3n, 5n, 10n, 17n]
		for (const base of bases) {
			for (let exp = 0n; exp <= 20n; exp += 1n) {
				assert.equal(
					powerBigIntRecursive(base, exp),
					base ** exp,
					`Mismatch for (${base}n, ${exp}n)`
				)
			}
			if (base !== 0n) {
				for (let exp = -1n; exp >= -20n; exp -= 1n) {
					assert.equal(
						powerBigIntRecursive(base, exp),
						SCALE / (base ** (-exp)),
						`Mismatch for (${base}n, ${exp}n)`
					)
				}
			}
		}
	})
})
