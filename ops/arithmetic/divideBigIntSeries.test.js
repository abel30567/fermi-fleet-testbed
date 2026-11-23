import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { divideBigIntSeries, SCALE } from './divideBigIntSeries.js'

/**
 * Independent reference implementation using binary long division (shift-and-subtract)
 * to cross-check divideBigIntSeries without relying on either BigInt `/` or the series.
 */
function binaryLongDivide(a, b) {
	if (a === 0n) return 0n
	const negative = (a < 0n) !== (b < 0n)
	let dividend = (a < 0n ? -a : a) * SCALE
	const divisor = b < 0n ? -b : b

	if (dividend < divisor) return 0n

	let shift = 0n
	let shiftedDivisor = divisor
	while (shiftedDivisor <= dividend) {
		shiftedDivisor <<= 1n
		shift += 1n
	}

	let quotient = 0n
	while (shift > 0n) {
		shift -= 1n
		shiftedDivisor >>= 1n
		quotient <<= 1n
		if (dividend >= shiftedDivisor) {
			dividend -= shiftedDivisor
			quotient |= 1n
		}
	}

	return negative ? -quotient : quotient
}

describe('divideBigIntSeries', () => {
	test('exact integer quotients scaled by 10^18', () => {
		assert.equal(SCALE, 1000000000000000000n)
		assert.equal(divideBigIntSeries(6n, 2n), 3n * SCALE)
		assert.equal(divideBigIntSeries(100n, 10n), 10n * SCALE)
		assert.equal(divideBigIntSeries(1n, 1n), SCALE)
		assert.equal(divideBigIntSeries(42n, 1n), 42n * SCALE)
		assert.equal(divideBigIntSeries(0n, 7n), 0n)
		assert.equal(divideBigIntSeries(0n, -7n), 0n)
	})

	test('non-integer rational results truncated toward zero at 10^18 scale', () => {
		assert.equal(divideBigIntSeries(1n, 2n), 500000000000000000n)
		assert.equal(divideBigIntSeries(1n, 4n), 250000000000000000n)
		assert.equal(divideBigIntSeries(1n, 8n), 125000000000000000n)
		assert.equal(divideBigIntSeries(1n, 3n), 333333333333333333n)
		assert.equal(divideBigIntSeries(2n, 3n), 666666666666666666n)
		assert.equal(divideBigIntSeries(1n, 7n), 142857142857142857n)
		assert.equal(divideBigIntSeries(355n, 113n), 3141592920353982300n)
		assert.equal(divideBigIntSeries(22n, 7n), 3142857142857142857n)
	})

	test('all sign combinations truncate toward zero', () => {
		assert.equal(divideBigIntSeries(-1n, 2n), -500000000000000000n)
		assert.equal(divideBigIntSeries(1n, -2n), -500000000000000000n)
		assert.equal(divideBigIntSeries(-1n, -2n), 500000000000000000n)
		assert.equal(divideBigIntSeries(-7n, 3n), -2333333333333333333n)
		assert.equal(divideBigIntSeries(7n, -3n), -2333333333333333333n)
		assert.equal(divideBigIntSeries(-7n, -3n), 2333333333333333333n)
		assert.equal(divideBigIntSeries(-1n, 1n), -SCALE)
		assert.equal(divideBigIntSeries(1n, -1n), -SCALE)
		assert.equal(divideBigIntSeries(-1n, -1n), SCALE)
	})

	test('powers of two and near-power-of-two denominators', () => {
		const cases = [
			[1n, 1n << 10n],
			[123456789n, 1n << 32n],
			[1n, 1n << 60n],
			[1n, 1n << 64n], // underflows below 10^-18 -> 0n
			[(1n << 128n) - 1n, (1n << 128n) - 1n],
			[(1n << 128n) + 1n, (1n << 128n) - 1n],
			[(1n << 128n) - 1n, (1n << 128n) + 1n],
			[1n << 200n, (1n << 128n) + 1n],
			[1n << 200n, (1n << 128n) - 1n],
			[(1n << 300n) + 12345n, (1n << 256n) + 1n],
			[(1n << 300n) + 12345n, (1n << 256n) - 1n],
		]

		for (const [a, b] of cases) {
			const expected = (a * SCALE) / b
			assert.equal(divideBigIntSeries(a, b), expected)
		}
	})

	test('scale-threshold boundaries around 10^-18', () => {
		// Exact 1 unit at 10^-18 scale
		assert.equal(divideBigIntSeries(1n, SCALE), 1n)
		assert.equal(divideBigIntSeries(-1n, SCALE), -1n)
		// Strictly smaller than 1 unit -> truncates to 0n
		assert.equal(divideBigIntSeries(1n, SCALE + 1n), 0n)
		assert.equal(divideBigIntSeries(-1n, SCALE + 1n), 0n)
		// Just above 1 unit
		assert.equal(divideBigIntSeries(1n, SCALE - 1n), 1n)
		assert.equal(divideBigIntSeries(2n, SCALE), 2n)
	})

	test('large arbitrary-precision BigInts (hundreds to thousands of bits)', () => {
		const bigA = (1n << 512n) + 9876543210123456789n
		const bigB = (1n << 256n) + 1234567890987654321n
		assert.equal(divideBigIntSeries(bigA, bigB), (bigA * SCALE) / bigB)
		assert.equal(divideBigIntSeries(-bigA, bigB), (-bigA * SCALE) / bigB)

		const hugeA = 10n ** 300n + 7n
		const hugeB = 3n * 10n ** 120n + 11n
		assert.equal(divideBigIntSeries(hugeA, hugeB), (hugeA * SCALE) / hugeB)

		// Large denominator, small numerator -> 0n
		assert.equal(divideBigIntSeries(42n, 10n ** 100n), 0n)

		// Large numerator, small odd denominator (high output bit count)
		const giantA = (1n << 1024n) - 3n
		assert.equal(divideBigIntSeries(giantA, 3n), (giantA * SCALE) / 3n)
		assert.equal(divideBigIntSeries(giantA, 17n), (giantA * SCALE) / 17n)
	})

	test('input validation rejects non-bigint arguments and division by zero', () => {
		assert.throws(() => divideBigIntSeries(1, 2n), TypeError)
		assert.throws(() => divideBigIntSeries(1n, 2), TypeError)
		assert.throws(() => divideBigIntSeries('10', '2'), TypeError)
		assert.throws(() => divideBigIntSeries(null, 1n), TypeError)
		assert.throws(() => divideBigIntSeries(1n, undefined), TypeError)
		assert.throws(() => divideBigIntSeries(NaN, 1n), TypeError)
		assert.throws(() => divideBigIntSeries(1n, {}), TypeError)

		assert.throws(() => divideBigIntSeries(1n, 0n), RangeError)
		assert.throws(() => divideBigIntSeries(0n, 0n), RangeError)
		assert.throws(() => divideBigIntSeries(-5n, 0n), RangeError)
	})

	test('independent cross-checks: native BigInt `/`, binary long division, remainder invariant, and scale invariance', () => {
		// Deterministic LCG PRNG for reproducible stress testing
		let state = 0x123456789abcdef0n
		const mask = (1n << 64n) - 1n
		function nextBigInt(bits) {
			let out = 0n
			for (let i = 0; i < bits; i += 32) {
				state = (state * 6364136223846793005n + 1442695040888963407n) & mask
				out = (out << 32n) | (state >> 32n)
			}
			return out
		}

		const bitPairs = [
			[8, 8],
			[16, 12],
			[32, 32],
			[64, 32],
			[64, 64],
			[128, 64],
			[128, 128],
			[256, 128],
			[256, 256],
		]

		for (const [aBits, bBits] of bitPairs) {
			for (let trial = 0; trial < 10; trial++) {
				const rawA = nextBigInt(aBits)
				const rawB = nextBigInt(bBits) + 1n // ensure non-zero
				const signA = trial % 2 === 0 ? 1n : -1n
				const signB = trial % 3 === 0 ? -1n : 1n
				const a = signA * rawA
				const b = signB * rawB

				const actual = divideBigIntSeries(a, b)
				const expectedNative = (a * SCALE) / b
				const expectedLongDiv = binaryLongDivide(a, b)

				// Cross-check 1: exact match with native BigInt division
				assert.equal(actual, expectedNative)
				// Cross-check 2: exact match with independent binary long division
				assert.equal(actual, expectedLongDiv)

				// Cross-check 3: Euclidean remainder invariant for truncation toward zero
				const rem = a * SCALE - actual * b
				const absRem = rem < 0n ? -rem : rem
				const absB = b < 0n ? -b : b
				assert.ok(absRem < absB, `Remainder ${absRem} must be < |b| ${absB}`)
				if (rem !== 0n) {
					assert.equal(rem < 0n, a < 0n, 'Remainder must have the same sign as dividend')
				}

				// Cross-check 4: scale invariance (works identically on fixed-point 10^18 inputs)
				assert.equal(divideBigIntSeries(a * SCALE, b * SCALE), actual)
			}
		}

		// Cross-check 5: agreement with IEEE-754 floating-point for moderate values
		const floatPairs = [
			[1n, 3n],
			[355n, 113n],
			[-98765n, 4321n],
			[123456n, -789n],
		]
		for (const [a, b] of floatPairs) {
			const actualFloat = Number(divideBigIntSeries(a, b)) / 1e18
			const expectedFloat = Number(a) / Number(b)
			assert.ok(Math.abs(actualFloat - expectedFloat) < 1e-12)
		}
	})
})
