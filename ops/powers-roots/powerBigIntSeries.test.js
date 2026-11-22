import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { powerBigIntSeries } from './powerBigIntSeries.js'

const SCALE = 10n ** 18n

describe('powerBigIntSeries', () => {
	describe('normal cases (non-negative exponents)', () => {
		it('computes exact positive powers of positive bases', () => {
			assert.equal(powerBigIntSeries(2n, 1n), 2n)
			assert.equal(powerBigIntSeries(2n, 10n), 1024n)
			assert.equal(powerBigIntSeries(3n, 7n), 2187n)
			assert.equal(powerBigIntSeries(10n, 18n), 1_000_000_000_000_000_000n)
			assert.equal(powerBigIntSeries(12345n, 1n), 12345n)
		})

		it('computes exact powers of negative bases with even and odd exponents', () => {
			assert.equal(powerBigIntSeries(-2n, 1n), -2n)
			assert.equal(powerBigIntSeries(-2n, 2n), 4n)
			assert.equal(powerBigIntSeries(-2n, 3n), -8n)
			assert.equal(powerBigIntSeries(-2n, 4n), 16n)
			assert.equal(powerBigIntSeries(-3n, 5n), -243n)
			assert.equal(powerBigIntSeries(-10n, 6n), 1_000_000n)
		})

		it('computes large arbitrary-precision BigInt powers', () => {
			assert.equal(
				powerBigIntSeries(2n, 100n),
				1_267_650_600_228_229_401_496_703_205_376n,
			)
			assert.equal(
				powerBigIntSeries(12345678901234567890n, 3n),
				12345678901234567890n * 12345678901234567890n * 12345678901234567890n,
			)
		})
	})

	describe('normal cases (negative exponents, 10^18 fixed-point)', () => {
		it('computes exact scaled reciprocals for terminating decimal powers', () => {
			assert.equal(powerBigIntSeries(2n, -1n), 500_000_000_000_000_000n)
			assert.equal(powerBigIntSeries(2n, -3n), 125_000_000_000_000_000n)
			assert.equal(powerBigIntSeries(5n, -2n), 40_000_000_000_000_000n)
			assert.equal(powerBigIntSeries(10n, -6n), 1_000_000_000_000n)
			assert.equal(powerBigIntSeries(10n, -18n), 1n)
		})

		it('truncates repeating reciprocals toward zero in 10^18 fixed-point', () => {
			assert.equal(powerBigIntSeries(3n, -1n), 333_333_333_333_333_333n)
			assert.equal(powerBigIntSeries(3n, -2n), 111_111_111_111_111_111n)
			assert.equal(powerBigIntSeries(7n, -1n), 142_857_142_857_142_857n)
		})

		it('preserves sign correctly for negative bases with negative exponents', () => {
			assert.equal(powerBigIntSeries(-2n, -1n), -500_000_000_000_000_000n)
			assert.equal(powerBigIntSeries(-2n, -2n), 250_000_000_000_000_000n)
			assert.equal(powerBigIntSeries(-2n, -3n), -125_000_000_000_000_000n)
			assert.equal(powerBigIntSeries(-2n, -4n), 62_500_000_000_000_000n)
			assert.equal(powerBigIntSeries(-3n, -1n), -333_333_333_333_333_333n)
		})
	})

	describe('edge cases', () => {
		it('handles zero exponent including 0n^0n === 1n', () => {
			assert.equal(powerBigIntSeries(0n, 0n), 1n)
			assert.equal(powerBigIntSeries(1n, 0n), 1n)
			assert.equal(powerBigIntSeries(-1n, 0n), 1n)
			assert.equal(powerBigIntSeries(42n, 0n), 1n)
			assert.equal(powerBigIntSeries(-42n, 0n), 1n)
		})

		it('handles zero base with positive exponents', () => {
			assert.equal(powerBigIntSeries(0n, 1n), 0n)
			assert.equal(powerBigIntSeries(0n, 2n), 0n)
			assert.equal(powerBigIntSeries(0n, 1000n), 0n)
		})

		it('handles unit bases 1n and -1n for huge positive and negative exponents', () => {
			const hugeEven = 10n ** 50n
			const hugeOdd = hugeEven + 1n

			assert.equal(powerBigIntSeries(1n, hugeEven), 1n)
			assert.equal(powerBigIntSeries(1n, hugeOdd), 1n)
			assert.equal(powerBigIntSeries(-1n, hugeEven), 1n)
			assert.equal(powerBigIntSeries(-1n, hugeOdd), -1n)

			assert.equal(powerBigIntSeries(1n, -1n), SCALE)
			assert.equal(powerBigIntSeries(1n, -hugeOdd), SCALE)
			assert.equal(powerBigIntSeries(-1n, -2n), SCALE)
			assert.equal(powerBigIntSeries(-1n, -3n), -SCALE)
			assert.equal(powerBigIntSeries(-1n, -hugeEven), SCALE)
			assert.equal(powerBigIntSeries(-1n, -hugeOdd), -SCALE)
		})

		it('handles fixed-point underflow boundary at 10^18 for negative exponents', () => {
			// 2^59 < 10^18 < 2^60
			assert.equal(powerBigIntSeries(2n, -59n), 1n)
			assert.equal(powerBigIntSeries(2n, -60n), 0n)
			assert.equal(powerBigIntSeries(-2n, -59n), -1n)
			assert.equal(powerBigIntSeries(-2n, -60n), 0n)

			// Base right at and just above 10^18
			assert.equal(powerBigIntSeries(SCALE, -1n), 1n)
			assert.equal(powerBigIntSeries(-SCALE, -1n), -1n)
			assert.equal(powerBigIntSeries(SCALE + 1n, -1n), 0n)
			assert.equal(powerBigIntSeries(-(SCALE + 1n), -1n), 0n)

			// Very large negative exponent or very large base underflows cleanly to 0n
			assert.equal(powerBigIntSeries(2n, -(10n ** 30n)), 0n)
			assert.equal(powerBigIntSeries(10n ** 100n, -5n), 0n)
			assert.equal(powerBigIntSeries(10n, -19n), 0n)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when base is not a bigint', () => {
			const invalidValues = [2, 0, -1, 1.5, NaN, Infinity, '2', null, undefined, true, {}, []]
			for (const bad of invalidValues) {
				assert.throws(() => powerBigIntSeries(bad, 2n), TypeError)
			}
		})

		it('throws TypeError when exp is not a bigint', () => {
			const invalidValues = [2, 0, -1, 1.5, NaN, Infinity, '2', null, undefined, false, {}, []]
			for (const bad of invalidValues) {
				assert.throws(() => powerBigIntSeries(2n, bad), TypeError)
			}
		})

		it('throws TypeError when called with missing arguments', () => {
			assert.throws(() => powerBigIntSeries(), TypeError)
			assert.throws(() => powerBigIntSeries(2n), TypeError)
		})

		it('throws RangeError when base is 0n and exp is negative', () => {
			assert.throws(() => powerBigIntSeries(0n, -1n), RangeError)
			assert.throws(() => powerBigIntSeries(0n, -2n), RangeError)
			assert.throws(() => powerBigIntSeries(0n, -(10n ** 20n)), RangeError)
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		it('matches native BigInt exponentiation (base ** exp) across a broad grid', () => {
			const bases = [-13n, -7n, -2n, -1n, 0n, 1n, 2n, 5n, 11n, 999_999_999_999n]
			const exps = [0n, 1n, 2n, 3n, 7n, 15n, 16n, 31n, 32n, 63n, 64n]

			for (const base of bases) {
				for (const exp of exps) {
					assert.equal(
						powerBigIntSeries(base, exp),
						base ** exp,
						`Mismatch for (${base}n)^(${exp}n)`,
					)
				}
			}
		})

		it('satisfies the additive exponent law: a^(m + n) === a^m * a^n', () => {
			const bases = [-9n, -2n, 0n, 1n, 3n, 17n]
			const pairs = [
				[0n, 0n],
				[0n, 5n],
				[3n, 4n],
				[7n, 13n],
				[16n, 19n],
			]

			for (const a of bases) {
				for (const [m, n] of pairs) {
					assert.equal(
						powerBigIntSeries(a, m + n),
						powerBigIntSeries(a, m) * powerBigIntSeries(a, n),
						`Additive law failed for a=${a}, m=${m}, n=${n}`,
					)
				}
			}
		})

		it('satisfies the multiplicative exponent law: (a^m)^n === a^(m * n)', () => {
			const bases = [-7n, -2n, 0n, 1n, 2n, 11n]
			const pairs = [
				[0n, 3n],
				[3n, 0n],
				[2n, 5n],
				[4n, 6n],
				[5n, 7n],
			]

			for (const a of bases) {
				for (const [m, n] of pairs) {
					assert.equal(
						powerBigIntSeries(powerBigIntSeries(a, m), n),
						powerBigIntSeries(a, m * n),
						`Multiplicative law failed for a=${a}, m=${m}, n=${n}`,
					)
				}
			}
		})

		it('satisfies the product-of-bases law: (a * b)^n === a^n * b^n', () => {
			const pairs = [
				[2n, 3n],
				[-4n, 5n],
				[-7n, -11n],
				[123n, 456n],
			]
			const exps = [0n, 1n, 5n, 12n]

			for (const [a, b] of pairs) {
				for (const n of exps) {
					assert.equal(
						powerBigIntSeries(a * b, n),
						powerBigIntSeries(a, n) * powerBigIntSeries(b, n),
					)
				}
			}
		})

		it('satisfies reciprocal identities and division bounds for negative exponents', () => {
			// Exact divisors of 10^18: power(a, -k) * power(a, k) === 10^18
			const exactCases = [
				[1n, 5n],
				[-1n, 3n],
				[-1n, 4n],
				[2n, 1n],
				[2n, 6n],
				[-2n, 5n],
				[5n, 4n],
				[-5n, 3n],
				[10n, 9n],
				[-10n, 7n],
			]
			for (const [a, k] of exactCases) {
				const pos = powerBigIntSeries(a, k)
				const neg = powerBigIntSeries(a, -k)
				assert.equal(neg * pos, SCALE, `Exact reciprocal failed for ${a}^(-${k})`)
			}

			// General bases: cross-check against native 10^18 / (a ** k) and Euclidean remainder bound
			const generalBases = [-17n, -7n, -3n, -2n, 2n, 3n, 7n, 13n, 29n]
			const kValues = [1n, 2n, 3n, 5n, 10n]

			for (const a of generalBases) {
				for (const k of kValues) {
					const pos = powerBigIntSeries(a, k)
					const neg = powerBigIntSeries(a, -k)
					assert.equal(neg, SCALE / (a ** k))

					// Remainder check: 0 <= 10^18 - (neg * pos) < |pos|
					// Note: since neg and pos have the same sign (or neg === 0n), neg * pos >= 0n.
					const remainder = SCALE - neg * pos
					const absPos = pos < 0n ? -pos : pos
					assert.ok(
						remainder >= 0n && remainder < absPos,
						`Remainder out of bounds for ${a}^(-${k}): remainder=${remainder}, |pos|=${absPos}`,
					)
				}
			}
		})
	})
})
