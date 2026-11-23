import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { powerBigIntMemo, SCALE } from './powerBigIntMemo.js'

describe('powerBigIntMemo', () => {
	test('computes exact integer powers from precomputed small-base table', () => {
		assert.equal(powerBigIntMemo(2n, 0n), 1n)
		assert.equal(powerBigIntMemo(2n, 1n), 2n)
		assert.equal(powerBigIntMemo(2n, 10n), 1024n)
		assert.equal(powerBigIntMemo(2n, 64n), 18446744073709551616n)
		assert.equal(powerBigIntMemo(10n, 18n), SCALE)
		assert.equal(powerBigIntMemo(16n, 16n), 18446744073709551616n)
		assert.equal(powerBigIntMemo(3n, 5n), 243n)
	})

	test('computes exact integer powers outside precomputed table via memoized squaring', () => {
		assert.equal(powerBigIntMemo(17n, 20n), 17n ** 20n)
		assert.equal(powerBigIntMemo(2n, 100n), 2n ** 100n)
		assert.equal(powerBigIntMemo(2n, 200n), 2n ** 200n)
		assert.equal(powerBigIntMemo(123456789n, 12n), 123456789n ** 12n)
		// Repeated calls exercise memoized hits identically
		assert.equal(powerBigIntMemo(17n, 20n), 17n ** 20n)
		assert.equal(powerBigIntMemo(-17n, 20n), 17n ** 20n)
		assert.equal(powerBigIntMemo(-17n, 21n), -(17n ** 21n))
	})

	test('handles edge cases for bases 0n, 1n, -1n and exponent 0n', () => {
		assert.equal(powerBigIntMemo(0n, 0n), 1n)
		assert.equal(powerBigIntMemo(0n, 1n), 0n)
		assert.equal(powerBigIntMemo(0n, 10n ** 50n), 0n)

		assert.equal(powerBigIntMemo(1n, 0n), 1n)
		assert.equal(powerBigIntMemo(1n, 10n ** 50n), 1n)
		assert.equal(powerBigIntMemo(1n, -(10n ** 50n)), 1n)

		assert.equal(powerBigIntMemo(-1n, 0n), 1n)
		assert.equal(powerBigIntMemo(-1n, 1n), -1n)
		assert.equal(powerBigIntMemo(-1n, 2n), 1n)
		assert.equal(powerBigIntMemo(-1n, -1n), -1n)
		assert.equal(powerBigIntMemo(-1n, -2n), 1n)
		assert.equal(powerBigIntMemo(-1n, 10n ** 50n + 1n), -1n)
		assert.equal(powerBigIntMemo(-1n, -(10n ** 50n + 1n)), -1n)

		assert.equal(powerBigIntMemo(999999999999999999999n, 0n), 1n)
		assert.equal(powerBigIntMemo(-999999999999999999999n, 0n), 1n)
		assert.equal(powerBigIntMemo(-42n, 1n), -42n)
	})

	test('computes fixed-point scaled (10^18) results for negative exponents with |base| >= 2n', () => {
		// Exact decimal representations
		assert.equal(powerBigIntMemo(2n, -1n), 500_000_000_000_000_000n)
		assert.equal(powerBigIntMemo(2n, -2n), 250_000_000_000_000_000n)
		assert.equal(powerBigIntMemo(2n, -3n), 125_000_000_000_000_000n)
		assert.equal(powerBigIntMemo(5n, -3n), 8_000_000_000_000_000n)
		assert.equal(powerBigIntMemo(10n, -6n), 1_000_000_000_000n)
		assert.equal(powerBigIntMemo(10n, -18n), 1n)

		// Repeating decimals (rounded half away from zero)
		assert.equal(powerBigIntMemo(3n, -1n), 333_333_333_333_333_333n)
		assert.equal(powerBigIntMemo(6n, -1n), 166_666_666_666_666_667n)
		assert.equal(powerBigIntMemo(7n, -1n), 142_857_142_857_142_857n)

		// Larger base outside precomputed table (exercises memoized negative path)
		assert.equal(powerBigIntMemo(20n, -2n), 2_500_000_000_000_000n)
		assert.equal(powerBigIntMemo(20n, -2n), 2_500_000_000_000_000n)
		assert.equal(powerBigIntMemo(1000n, -3n), 1_000_000_000n)
		assert.equal(powerBigIntMemo(19n, -1n), 52_631_578_947_368_421n)
	})

	test('handles negative bases with positive and negative exponents', () => {
		assert.equal(powerBigIntMemo(-2n, 3n), -8n)
		assert.equal(powerBigIntMemo(-2n, 4n), 16n)
		assert.equal(powerBigIntMemo(-2n, -1n), -500_000_000_000_000_000n)
		assert.equal(powerBigIntMemo(-2n, -2n), 250_000_000_000_000_000n)
		assert.equal(powerBigIntMemo(-2n, -3n), -125_000_000_000_000_000n)
		assert.equal(powerBigIntMemo(-6n, -1n), -166_666_666_666_666_667n)
		assert.equal(powerBigIntMemo(-20n, -1n), -50_000_000_000_000_000n)
	})

	test('handles fixed-point rounding boundaries and underflow to 0n', () => {
		// 10^18 / 2^60 = 0.86736... -> rounds to 1n
		assert.equal(powerBigIntMemo(2n, -60n), 1n)
		assert.equal(powerBigIntMemo(-2n, -60n), 1n)
		// 10^18 / 2^61 = 0.43368... -> rounds to 0n
		assert.equal(powerBigIntMemo(2n, -61n), 0n)
		assert.equal(powerBigIntMemo(-2n, -61n), 0n)
		// Exact half boundary: 10^18 / (2 * 10^18) = 0.5 -> rounds half away from zero to 1n
		assert.equal(powerBigIntMemo(2n * SCALE, -1n), 1n)
		assert.equal(powerBigIntMemo(-(2n * SCALE), -1n), -1n)
		assert.equal(powerBigIntMemo(2n * SCALE + 1n, -1n), 0n)
		assert.equal(powerBigIntMemo(-(2n * SCALE + 1n), -1n), 0n)
		// Huge negative exponents short-circuit cleanly
		assert.equal(powerBigIntMemo(10n, -19n), 0n)
		assert.equal(powerBigIntMemo(2n, -(10n ** 50n)), 0n)
		assert.equal(powerBigIntMemo(10n ** 30n, -1n), 0n)
	})

	test('handles very large results exceeding per-entry memo bit cap', () => {
		// 2^70000 has > 65536 bits, exercising the iterative fallback path
		const expected = 2n ** 70000n
		assert.equal(powerBigIntMemo(2n, 70000n), expected)
	})

	test('remains exact under LRU memo cache eviction (> 4096 distinct keys)', () => {
		for (let i = 0; i < 4200; i++) {
			const b = 17n + BigInt(i)
			assert.equal(powerBigIntMemo(b, 2n), b * b)
		}
		// Re-query evicted and recent entries
		assert.equal(powerBigIntMemo(17n, 2n), 289n)
		assert.equal(powerBigIntMemo(4216n, 2n), 4216n * 4216n)
	})

	test('validates inputs and throws appropriate errors', () => {
		assert.throws(() => powerBigIntMemo(2, 3n), TypeError)
		assert.throws(() => powerBigIntMemo(2n, 3), TypeError)
		assert.throws(() => powerBigIntMemo('2', 3n), TypeError)
		assert.throws(() => powerBigIntMemo(2n, '3'), TypeError)
		assert.throws(() => powerBigIntMemo(null, 3n), TypeError)
		assert.throws(() => powerBigIntMemo(2n, undefined), TypeError)
		assert.throws(() => powerBigIntMemo(NaN, 1n), TypeError)
		assert.throws(() => powerBigIntMemo(), TypeError)

		assert.throws(() => powerBigIntMemo(0n, -1n), RangeError)
		assert.throws(() => powerBigIntMemo(0n, -100n), RangeError)
	})

	test('independent cross-check against native BigInt **, exponent laws, and exact rounding invariant', () => {
		const bases = [-25n, -17n, -10n, -3n, -2n, 2n, 3n, 7n, 10n, 16n, 17n, 31n, 101n]
		const posExps = [0n, 1n, 2n, 3n, 7n, 15n, 32n, 64n, 65n, 129n]

		// 1. Exact cross-check against native BigInt ** operator
		for (const b of bases) {
			for (const e of posExps) {
				assert.equal(powerBigIntMemo(b, e), b ** e, `mismatch for (${b}n, ${e}n)`)
			}
		}

		// 2. Algebraic exponent laws: b^(m+n) === b^m * b^n and (a*b)^n === a^n * b^n
		for (const b of [3n, -7n, 19n, 37n]) {
			assert.equal(
				powerBigIntMemo(b, 23n + 45n),
				powerBigIntMemo(b, 23n) * powerBigIntMemo(b, 45n),
			)
		}
		assert.equal(
			powerBigIntMemo(13n * 29n, 17n),
			powerBigIntMemo(13n, 17n) * powerBigIntMemo(29n, 17n),
		)

		// 3. Exact 0.5-ULP rounding invariant for negative exponents:
		//    |result * d - sign * SCALE| * 2n <= d, where d = |b|^|e|
		const negExps = [-1n, -2n, -3n, -5n, -10n, -20n, -40n, -60n, -65n]
		for (const b of bases) {
			const absB = b < 0n ? -b : b
			for (const e of negExps) {
				const actual = powerBigIntMemo(b, e)
				const d = absB ** -e
				const sign = b < 0n && ((-e) & 1n) === 1n ? -1n : 1n
				const signedActual = actual * sign
				const diff = signedActual * d - SCALE
				const absDiff = diff < 0n ? -diff : diff
				assert.ok(
					absDiff * 2n <= d,
					`rounding error > 0.5 ULP for (${b}n, ${e}n): got ${actual}`,
				)
			}
		}

		// 4. Floating-point sanity cross-check against Math.pow for moderate negative exponents
		for (const b of [2n, 3n, 5n, 7n, 17n, -3n, -19n]) {
			for (const e of [-1n, -2n, -3n, -5n]) {
				const actual = powerBigIntMemo(b, e)
				const approx = Number(actual) / 1e18
				const expectedFloat = Math.pow(Number(b), Number(e))
				assert.ok(
					Math.abs(approx - expectedFloat) <= 1e-12,
					`float cross-check failed for (${b}n, ${e}n): ${approx} vs ${expectedFloat}`,
				)
			}
		}
	})
})
