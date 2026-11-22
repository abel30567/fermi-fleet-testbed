import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { subtractBigIntIterative } from './subtractBigIntIterative.js'

const SCALE_1E18 = 10n ** 18n

describe('subtractBigIntIterative', () => {
	test('handles normal positive and negative subtraction cases', () => {
		assert.equal(subtractBigIntIterative(10n, 3n), 7n)
		assert.equal(subtractBigIntIterative(3n, 10n), -7n)
		assert.equal(subtractBigIntIterative(1000n, 1n), 999n)
		assert.equal(subtractBigIntIterative(-10n, -3n), -7n)
		assert.equal(subtractBigIntIterative(-3n, -10n), 7n)
		assert.equal(subtractBigIntIterative(10n, -3n), 13n)
		assert.equal(subtractBigIntIterative(-10n, 3n), -13n)
	})

	test('handles zero operands and equal operands', () => {
		assert.equal(subtractBigIntIterative(0n, 0n), 0n)
		assert.equal(subtractBigIntIterative(42n, 0n), 42n)
		assert.equal(subtractBigIntIterative(-42n, 0n), -42n)
		assert.equal(subtractBigIntIterative(0n, 42n), -42n)
		assert.equal(subtractBigIntIterative(0n, -42n), 42n)
		assert.equal(subtractBigIntIterative(123456789n, 123456789n), 0n)
		assert.equal(subtractBigIntIterative(-123456789n, -123456789n), 0n)
	})

	test('handles multi-limb borrows, carries, and very large (> 2^128) BigInts', () => {
		const pow64 = 1n << 64n
		const pow128 = 1n << 128n
		const pow256 = 1n << 256n
		const pow512 = 1n << 512n

		// Cascading borrow across multiple 64-bit limbs
		assert.equal(subtractBigIntIterative(pow128, 1n), pow128 - 1n)
		assert.equal(subtractBigIntIterative(pow256, 1n), pow256 - 1n)
		assert.equal(subtractBigIntIterative(1n, pow256), 1n - pow256)
		assert.equal(subtractBigIntIterative(pow512, pow64), pow512 - pow64)

		// Cascading carry across multiple 64-bit limbs (opposite signs)
		assert.equal(subtractBigIntIterative(pow128 - 1n, -1n), pow128)
		assert.equal(subtractBigIntIterative(-(pow256 - 1n), 1n), -pow256)

		// Arbitrary large signed numbers > 2^128
		const largeA = 3402823669209384634633746074317682114569876543210123456789n
		const largeB = 1701411834604692317316873037158841057281234567890987654321n
		assert.equal(subtractBigIntIterative(largeA, largeB), largeA - largeB)
		assert.equal(subtractBigIntIterative(largeB, largeA), largeB - largeA)
		assert.equal(subtractBigIntIterative(-largeA, largeB), -largeA - largeB)
		assert.equal(subtractBigIntIterative(largeA, -largeB), largeA - -largeB)
		assert.equal(subtractBigIntIterative(-largeA, -largeB), -largeA - -largeB)
	})

	test('preserves exactness for 10^18-scaled fixed-point BigInt values', () => {
		// 1.5 - 0.75 = 0.75 (scaled by 10^18)
		const a = 15n * (SCALE_1E18 / 10n)
		const b = 75n * (SCALE_1E18 / 100n)
		const expected = 75n * (SCALE_1E18 / 100n)
		assert.equal(subtractBigIntIterative(a, b), expected)

		// 0.1 - 0.3 = -0.2 (exact, no IEEE-754 drift)
		const x = 1n * (SCALE_1E18 / 10n)
		const y = 3n * (SCALE_1E18 / 10n)
		assert.equal(subtractBigIntIterative(x, y), -2n * (SCALE_1E18 / 10n))
	})

	test('rejects invalid non-BigInt inputs with TypeError', () => {
		const invalidValues = [
			0,
			1,
			-1,
			1.5,
			NaN,
			Infinity,
			'10',
			'10n',
			null,
			undefined,
			true,
			false,
			{},
			[],
			Symbol('x'),
		]

		for (const bad of invalidValues) {
			assert.throws(
				() => subtractBigIntIterative(bad, 1n),
				{ name: 'TypeError' },
				`Expected TypeError for first arg: ${String(bad)}`
			)
			assert.throws(
				() => subtractBigIntIterative(1n, bad),
				{ name: 'TypeError' },
				`Expected TypeError for second arg: ${String(bad)}`
			)
		}
	})

	test('cross-checks against native `-` and additive inverse identity `subtract(a, b) + b === a`', () => {
		const samples = [
			0n,
			1n,
			-1n,
			2n,
			-2n,
			(1n << 64n) - 1n,
			1n << 64n,
			(1n << 64n) + 1n,
			-((1n << 64n) - 1n),
			-(1n << 64n),
			(1n << 128n) - 1n,
			1n << 128n,
			-((1n << 128n) + 123456789n),
			(1n << 256n) + (1n << 129n) + 9876543210123456789n,
			-((1n << 300n) - 1n),
			123456789012345678901234567890n * SCALE_1E18,
		]

		for (const a of samples) {
			for (const b of samples) {
				const diff = subtractBigIntIterative(a, b)
				// Independent cross-check 1: additive inverse identity
				assert.equal(diff + b, a)
				// Independent cross-check 2: native BigInt subtraction
				assert.equal(diff, a - b)
				// Independent cross-check 3: anti-commutativity
				assert.equal(subtractBigIntIterative(b, a), -diff)
			}
		}
	})
})
