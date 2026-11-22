import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { log2BigIntIterative } from './log2BigIntIterative.js'

const SCALE = 10n ** 18n

describe('log2BigIntIterative', () => {
	test('exact powers of 2', () => {
		assert.equal(log2BigIntIterative(1n), 0n)
		assert.equal(log2BigIntIterative(2n), 1n * SCALE)
		assert.equal(log2BigIntIterative(4n), 2n * SCALE)
		assert.equal(log2BigIntIterative(8n), 3n * SCALE)
		assert.equal(log2BigIntIterative(16n), 4n * SCALE)
		assert.equal(log2BigIntIterative(1024n), 10n * SCALE)
		assert.equal(log2BigIntIterative(2n ** 50n), 50n * SCALE)
	})

	test('known non-power-of-2 values to 18 decimal digits', () => {
		// log2(3) = 1.5849625007211561814537389439478...
		assert.equal(log2BigIntIterative(3n), 1_584_962_500_721_156_181n)
		// log2(5) = 2.3219280948873623478703194294893...
		assert.equal(log2BigIntIterative(5n), 2_321_928_094_887_362_348n)
		// log2(6) = 1 + log2(3)
		assert.equal(log2BigIntIterative(6n), 2_584_962_500_721_156_181n)
		// log2(7) = 2.8073549220576041074419693172318...
		assert.equal(log2BigIntIterative(7n), 2_807_354_922_057_604_107n)
		// log2(9) = 2 * log2(3) = 3.1699250014423123629074778878956...
		assert.equal(log2BigIntIterative(9n), 3_169_925_001_442_312_363n)
		// log2(10) = 3.32192809488736234787031942948939...
		assert.equal(log2BigIntIterative(10n), 3_321_928_094_887_362_348n)
		// log2(100) = 6.64385618977472469574063885897878...
		assert.equal(log2BigIntIterative(100n), 6_643_856_189_774_724_696n)
		// log2(1000) = 9.96578428466208704361095828846817...
		assert.equal(log2BigIntIterative(1000n), 9_965_784_284_662_087_044n)
	})

	test('huge BigInts and boundary values around powers of 2', () => {
		assert.equal(log2BigIntIterative((2n ** 50n) - 1n), 50n * SCALE - 1281n)
		assert.equal(log2BigIntIterative((2n ** 50n) + 1n), 50n * SCALE + 1281n)

		assert.equal(log2BigIntIterative(2n ** 64n), 64n * SCALE)
		// 1 / (2^64 * ln(2)) * 10^18 ≈ 0.078, so both round to 64 * 10^18
		assert.equal(log2BigIntIterative((2n ** 64n) - 1n), 64n * SCALE)
		assert.equal(log2BigIntIterative((2n ** 64n) + 1n), 64n * SCALE)

		assert.equal(log2BigIntIterative(2n ** 256n), 256n * SCALE)
		// 2^256 - 1 differs from 2^256 by ~10^-77, so it rounds to 256 * 10^18
		assert.equal(log2BigIntIterative((2n ** 256n) - 1n), 256n * SCALE)
		assert.equal(log2BigIntIterative((2n ** 256n) + 1n), 256n * SCALE)

		assert.equal(
			log2BigIntIterative(3n * (2n ** 256n)),
			256n * SCALE + log2BigIntIterative(3n),
		)

		// 100 * log2(10) = 332.192809488736234787031942948939...
		assert.equal(log2BigIntIterative(10n ** 100n), 332_192_809_488_736_234_787n)

		assert.equal(log2BigIntIterative(2n ** 1024n), 1024n * SCALE)
	})

	test('input validation errors', () => {
		// RangeError for x <= 0n
		assert.throws(() => log2BigIntIterative(0n), RangeError)
		assert.throws(() => log2BigIntIterative(-1n), RangeError)
		assert.throws(() => log2BigIntIterative(-(2n ** 128n)), RangeError)

		// TypeError for non-BigInt arguments
		const invalidInputs = [
			1,
			2.5,
			0,
			NaN,
			Infinity,
			'2',
			null,
			undefined,
			true,
			{},
			[],
			Symbol('x'),
		]
		for (const input of invalidInputs) {
			assert.throws(() => log2BigIntIterative(input), TypeError)
		}
	})

	test('cross-check against Math.log2', () => {
		const samples = [
			1n,
			2n,
			3n,
			5n,
			7n,
			10n,
			15n,
			17n,
			42n,
			99n,
			1000n,
			123456789n,
			10n ** 15n,
			(1n << 52n) - 1n,
		]
		// Allow small tolerance for IEEE-754 double rounding (~1e-13 * SCALE)
		const tolerance = 100_000n
		for (const x of samples) {
			const actual = log2BigIntIterative(x)
			const expected = BigInt(Math.round(Math.log2(Number(x)) * 1e18))
			const diff = actual >= expected ? actual - expected : expected - actual
			assert.ok(
				diff <= tolerance,
				`Mismatch for ${x}: actual=${actual}, expected=${expected}, diff=${diff}`,
			)
		}
	})

	test('cross-check logarithmic identities and monotonicity', () => {
		// Product rule: log2(a * b) ≈ log2(a) + log2(b) within 1 ULP
		const pairs = [
			[3n, 5n],
			[7n, 13n],
			[10n, 10n],
			[123456789n, 987654321n],
			[10n ** 30n + 7n, 3n ** 40n + 11n],
			[2n ** 200n + 12345n, 2n ** 150n + 67890n],
		]
		for (const [a, b] of pairs) {
			const lhs = log2BigIntIterative(a * b)
			const rhs = log2BigIntIterative(a) + log2BigIntIterative(b)
			const diff = lhs >= rhs ? lhs - rhs : rhs - lhs
			assert.ok(
				diff <= 1n,
				`Product identity failed for (${a}, ${b}): diff=${diff}`,
			)
		}

		// Shift rule: log2(x * 2^k) === log2(x) + k * SCALE exactly
		for (const x of [3n, 10n, 123456789n, 10n ** 25n + 3n]) {
			for (const k of [1n, 17n, 64n, 256n]) {
				assert.equal(
					log2BigIntIterative(x << k),
					log2BigIntIterative(x) + k * SCALE,
				)
			}
		}

		// Monotonicity on consecutive integers
		let prev = log2BigIntIterative(1n)
		for (let n = 2n; n <= 64n; n++) {
			const curr = log2BigIntIterative(n)
			assert.ok(curr > prev, `Expected log2(${n}) > log2(${n - 1n})`)
			prev = curr
		}
	})
})
