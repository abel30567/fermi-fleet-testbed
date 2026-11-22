import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { divideBigIntIterative } from './divideBigIntIterative.js'

const SCALE = 10n ** 18n
const absBigInt = (n) => (n < 0n ? -n : n)

describe('divideBigIntIterative', () => {
	test('exact integer multiples', () => {
		assert.equal(divideBigIntIterative(10n, 2n), 5n * SCALE)
		assert.equal(divideBigIntIterative(100n, 25n), 4n * SCALE)
		assert.equal(divideBigIntIterative(42n, 1n), 42n * SCALE)
		assert.equal(divideBigIntIterative(7n, 7n), 1n * SCALE)
	})

	test('non-integer fractions and terminating decimals', () => {
		assert.equal(divideBigIntIterative(1n, 2n), 500000000000000000n)
		assert.equal(divideBigIntIterative(1n, 4n), 250000000000000000n)
		assert.equal(divideBigIntIterative(1n, 3n), 333333333333333333n)
		assert.equal(divideBigIntIterative(2n, 3n), 666666666666666666n)
		assert.equal(divideBigIntIterative(1n, 7n), 142857142857142857n)
		assert.equal(divideBigIntIterative(355n, 113n), 3141592920353982300n)
	})

	test('zero numerator and sub-unit quotients that truncate to zero', () => {
		assert.equal(divideBigIntIterative(0n, 1n), 0n)
		assert.equal(divideBigIntIterative(0n, -999999999999999999999n), 0n)
		assert.equal(divideBigIntIterative(1n, SCALE + 1n), 0n)
		assert.equal(divideBigIntIterative(-1n, SCALE + 1n), 0n)
		assert.equal(divideBigIntIterative(1n, SCALE), 1n)
	})

	test('negative dividends, negative divisors, and truncation toward zero', () => {
		assert.equal(divideBigIntIterative(-10n, 2n), -5n * SCALE)
		assert.equal(divideBigIntIterative(10n, -2n), -5n * SCALE)
		assert.equal(divideBigIntIterative(-10n, -2n), 5n * SCALE)
		assert.equal(divideBigIntIterative(-1n, 3n), -333333333333333333n)
		assert.equal(divideBigIntIterative(1n, -3n), -333333333333333333n)
		assert.equal(divideBigIntIterative(-1n, -3n), 333333333333333333n)
	})

	test('large BigInts exceeding 2^100', () => {
		const bigA = (1n << 128n) + 123456789012345678901234567890n
		const bigB = (1n << 105n) + 98765432109876543210987654321n
		const result = divideBigIntIterative(bigA, bigB)
		const expected = (bigA * SCALE) / bigB
		assert.equal(result, expected)

		const hugeNegA = -(1n << 200n) - 777n
		const hugeB = (1n << 150n) + 13n
		assert.equal(divideBigIntIterative(hugeNegA, hugeB), (hugeNegA * SCALE) / hugeB)

		const exactLarge = (1n << 160n) * 37n
		assert.equal(divideBigIntIterative(exactLarge, 1n << 160n), 37n * SCALE)
	})

	test('throws RangeError on division by 0n', () => {
		assert.throws(() => divideBigIntIterative(1n, 0n), RangeError)
		assert.throws(() => divideBigIntIterative(0n, 0n), RangeError)
		assert.throws(() => divideBigIntIterative(-100n, 0n), RangeError)
	})

	test('throws TypeError on non-BigInt inputs', () => {
		const invalidInputs = [
			[10, 2n],
			[10n, 2],
			[10, 2],
			['10', 2n],
			[10n, '2'],
			[null, 2n],
			[10n, undefined],
			[NaN, 1n],
			[1n, {}],
			[true, 1n]
		]

		for (const [a, b] of invalidInputs) {
			assert.throws(() => divideBigIntIterative(a, b), TypeError)
		}
	})

	test('cross-check invariant |q * b - a * 10^18| < |b|, native BigInt division, and float64 division', () => {
		const pairs = [
			[0n, 17n],
			[1n, 3n],
			[-1n, 3n],
			[1n, -3n],
			[-1n, -3n],
			[22n, 7n],
			[-355n, 113n],
			[999999999999n, 1234567n],
			[-(1n << 110n) + 55n, (1n << 101n) - 19n],
			[(1n << 140n) + 3n, -(1n << 100n) - 7n],
			[123456789n, 987654321n]
		]

		for (const [a, b] of pairs) {
			const q = divideBigIntIterative(a, b)

			// 1. Exact Euclidean remainder bound: |q * b - a * 10^18| < |b|
			const diff = absBigInt(q * b - a * SCALE)
			assert.ok(diff < absBigInt(b), `Invariant failed for ${a} / ${b}: diff=${diff}, |b|=${absBigInt(b)}`)

			// 2. Agreement with native BigInt fixed-point division
			const nativeQ = (a * SCALE) / b
			assert.equal(q, nativeQ)

			// 3. Relative agreement with IEEE-754 float64 division for values representable in Number
			const floatExpected = Number(a) / Number(b)
			const floatActual = Number(q) / 1e18
			if (Number.isFinite(floatExpected)) {
				const scaleTol = Math.max(1e-12, Math.abs(floatExpected) * 1e-12)
				assert.ok(
					Math.abs(floatActual - floatExpected) <= scaleTol,
					`Float64 mismatch for ${a} / ${b}: actual=${floatActual}, expected=${floatExpected}`
				)
			}
		}
	})
})
