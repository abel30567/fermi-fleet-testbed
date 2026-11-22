import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { lnBigIntIterative } from './lnBigIntIterative.js'

const SCALE = 10n ** 18n

// Known high-precision reference values rounded to 18 decimal places
const LN_2 = 693147180559945309n
const LN_3 = 1098612288668109691n
const LN_10 = 2302585092994045684n
const LN_100 = 4605170185988091368n

describe('lnBigIntIterative', () => {
	test('handles normal values with exact 18-digit precision', () => {
		assert.equal(lnBigIntIterative(1n), 0n)
		assert.equal(lnBigIntIterative(2n), LN_2)
		assert.equal(lnBigIntIterative(3n), LN_3)
		assert.equal(lnBigIntIterative(10n), LN_10)
		assert.equal(lnBigIntIterative(100n), LN_100)
		// ln(1000) = 3 * ln(10) = 6.907755278982137052053974...
		assert.equal(lnBigIntIterative(1000n), 6907755278982137052n)
	})

	test('handles huge BigInt inputs accurately', () => {
		// 200 * ln(2) = 138.629436111989061883446424...
		assert.equal(lnBigIntIterative(2n ** 200n), 138629436111989061883n)

		// 100 * ln(3) = 109.861228866810969139524523...
		assert.equal(lnBigIntIterative(3n ** 100n), 109861228866810969140n)

		// 1000 * ln(2) = 693.147180559945309417232121...
		assert.equal(lnBigIntIterative(2n ** 1000n), 693147180559945309417n)

		// 2^200 + 1 differs from 2^200 by ~6.22e-61 in ln, identical at 10^18 scale
		assert.equal(lnBigIntIterative(2n ** 200n + 1n), lnBigIntIterative(2n ** 200n))
	})

	test('throws RangeError for zero and negative BigInts', () => {
		assert.throws(() => lnBigIntIterative(0n), RangeError)
		assert.throws(() => lnBigIntIterative(-1n), RangeError)
		assert.throws(() => lnBigIntIterative(-100n), RangeError)
		assert.throws(() => lnBigIntIterative(-(2n ** 200n)), RangeError)
	})

	test('throws TypeError for non-BigInt inputs', () => {
		for (const invalid of [1, 0, -5, 2.5, Number.NaN, '10', null, undefined, true, {}, []]) {
			assert.throws(() => lnBigIntIterative(invalid), TypeError)
		}
	})

	test('cross-checks against Math.log across a range of integers', () => {
		const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 17, 42, 99, 100, 255, 256, 1023, 1024, 123456789]
		for (const n of samples) {
			const actual = Number(lnBigIntIterative(BigInt(n))) / Number(SCALE)
			const expected = Math.log(n)
			assert.ok(
				Math.abs(actual - expected) <= 1e-14,
				`Mismatch for n=${n}: actual=${actual}, expected=${expected}`,
			)
		}
	})

	test('cross-checks multiplicative identity ln(a * b) ≈ ln(a) + ln(b)', () => {
		const pairs = [
			[2n, 3n],
			[7n, 13n],
			[10n, 100n],
			[123456789n, 987654321n],
			[2n ** 100n + 37n, 3n ** 80n + 19n],
			[10n ** 50n + 7n, 10n ** 40n + 11n],
		]

		for (const [a, b] of pairs) {
			const lhs = lnBigIntIterative(a * b)
			const rhs = lnBigIntIterative(a) + lnBigIntIterative(b)
			const diff = lhs >= rhs ? lhs - rhs : rhs - lhs
			assert.ok(diff <= 1n, `Expected |ln(${a}*${b}) - (ln(${a}) + ln(${b}))| <= 1n, got ${diff}`)
		}
	})

	test('is strictly monotonic for small and large consecutive integers', () => {
		let prev = lnBigIntIterative(1n)
		for (let i = 2n; i <= 50n; i++) {
			const cur = lnBigIntIterative(i)
			assert.ok(cur > prev, `Expected ln(${i}) > ln(${i - 1n})`)
			prev = cur
		}
	})
})
