import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { log10BigIntIterative } from './log10BigIntIterative.js'

const SCALE = 10n ** 18n

describe('log10BigIntIterative', () => {
	describe('exact powers of 10', () => {
		it('returns exact scaled integers for powers of 10', () => {
			assert.equal(log10BigIntIterative(1n), 0n)
			assert.equal(log10BigIntIterative(10n), 1n * SCALE)
			assert.equal(log10BigIntIterative(100n), 2n * SCALE)
			assert.equal(log10BigIntIterative(1000n), 3n * SCALE)
			assert.equal(log10BigIntIterative(10n ** 9n), 9n * SCALE)
			assert.equal(log10BigIntIterative(10n ** 18n), 18n * SCALE)
		})
	})

	describe('non-powers of 10 and known 18-digit values', () => {
		it('matches known 18-digit decimal values', () => {
			// log10(2) = 0.3010299956639811952137...
			assert.equal(log10BigIntIterative(2n), 301029995663981195n)
			// log10(3) = 0.4771212547196624372950...
			assert.equal(log10BigIntIterative(3n), 477121254719662437n)
			// log10(5) = 0.6989700043360188047862... -> rounds to ...805
			assert.equal(log10BigIntIterative(5n), 698970004336018805n)
			// log10(7) = 0.8450980400142568307122...
			assert.equal(log10BigIntIterative(7n), 845098040014256831n)
			// log10(50) = 1 + log10(5) = 1.6989700043360188047862...
			assert.equal(log10BigIntIterative(50n), 1698970004336018805n)
			// log10(200) = 2 + log10(2) = 2.3010299956639811952137...
			assert.equal(log10BigIntIterative(200n), 2301029995663981195n)
		})

		it('matches known values for composite and multi-digit inputs', () => {
			// log10(4) = 2 * log10(2) = 0.6020599913279623904274...
			assert.equal(log10BigIntIterative(4n), 602059991327962390n)
			// log10(8) = 3 * log10(2) = 0.9030899869919435856412...
			assert.equal(log10BigIntIterative(8n), 903089986991943586n)
			// log10(9) = 2 * log10(3) = 0.9542425094393248745900...
			assert.equal(log10BigIntIterative(9n), 954242509439324875n)
			// log10(50) = 1 + log10(5)
			assert.equal(log10BigIntIterative(50n), SCALE + log10BigIntIterative(5n))
		})
	})

	describe('very large BigInts and boundary values', () => {
		it('handles very large exact powers of 10', () => {
			assert.equal(log10BigIntIterative(10n ** 50n), 50n * SCALE)
			assert.equal(log10BigIntIterative(10n ** 100n), 100n * SCALE)
			assert.equal(log10BigIntIterative(10n ** 500n), 500n * SCALE)
		})

		it('handles very large non-powers of 10', () => {
			// log10(2 * 10^50) = 50 + log10(2)
			assert.equal(
				log10BigIntIterative(2n * 10n ** 50n),
				50n * SCALE + 301029995663981195n,
			)
			// log10(5 * 10^100) = 100 + log10(5)
			assert.equal(
				log10BigIntIterative(5n * 10n ** 100n),
				100n * SCALE + 698970004336018805n,
			)
			// log10(2^100) = 100 * log10(2) = 30.10299956639811952137...
			assert.equal(log10BigIntIterative(2n ** 100n), 30102999566398119521n)
		})

		it('handles values just below a power of 10 cleanly', () => {
			// 10^20 - 1 is within 10^-20 of 10^20, so at 10^-18 scale it rounds to 20.0
			assert.equal(log10BigIntIterative(10n ** 20n - 1n), 20n * SCALE)
			// 999999999n: log10(10^9 - 1) ≈ 9 - 4.342944819e-10
			const actual = log10BigIntIterative(999_999_999n)
			const expected = 9n * SCALE - 434294482n
			const diff = actual > expected ? actual - expected : expected - actual
			assert.ok(diff <= 1n, `expected diff <= 1n, got ${diff}`)
		})
	})

	describe('cross-checks against independent computations', () => {
		it('satisfies multiplicative identity log10(a * b) ≈ log10(a) + log10(b)', () => {
			const pairs = [
				[2n, 5n],
				[3n, 7n],
				[123456n, 7890123n],
				[10n ** 30n + 7n, 10n ** 25n + 99n],
				[2n ** 64n, 3n ** 40n],
			]

			for (const [a, b] of pairs) {
				const lhs = log10BigIntIterative(a * b)
				const rhs = log10BigIntIterative(a) + log10BigIntIterative(b)
				const diff = lhs > rhs ? lhs - rhs : rhs - lhs
				assert.ok(
					diff <= 1n,
					`log10(${a} * ${b}) differed from log10(${a}) + log10(${b}) by ${diff}`,
				)
			}
		})

		it('agrees with Math.log10 within floating-point precision', () => {
			const samples = [
				1n,
				2n,
				3n,
				5n,
				7n,
				10n,
				42n,
				50n,
				99n,
				100n,
				123456789n,
				9007199254740991n,
			]

			for (const x of samples) {
				const bigVal = Number(log10BigIntIterative(x)) / 1e18
				const floatVal = Math.log10(Number(x))
				assert.ok(
					Math.abs(bigVal - floatVal) <= 1e-14,
					`Mismatch for x=${x}: big=${bigVal}, Math.log10=${floatVal}`,
				)
			}
		})

		it('is strictly monotonically non-decreasing', () => {
			let prev = log10BigIntIterative(1n)
			for (let x = 2n; x <= 100n; x++) {
				const curr = log10BigIntIterative(x)
				assert.ok(curr > prev, `Expected log10(${x}) > log10(${x - 1n})`)
				prev = curr
			}
		})
	})

	describe('input validation', () => {
		it('throws RangeError for x <= 0n', () => {
			assert.throws(() => log10BigIntIterative(0n), RangeError)
			assert.throws(() => log10BigIntIterative(-1n), RangeError)
			assert.throws(() => log10BigIntIterative(-(10n ** 50n)), RangeError)
		})

		it('throws TypeError for non-BigInt inputs', () => {
			assert.throws(() => log10BigIntIterative(10), TypeError)
			assert.throws(() => log10BigIntIterative(10.5), TypeError)
			assert.throws(() => log10BigIntIterative('10'), TypeError)
			assert.throws(() => log10BigIntIterative(null), TypeError)
			assert.throws(() => log10BigIntIterative(undefined), TypeError)
			assert.throws(() => log10BigIntIterative({}), TypeError)
			assert.throws(() => log10BigIntIterative(true), TypeError)
		})
	})
})
