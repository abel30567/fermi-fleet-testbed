import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { multiplyBigIntRecursive } from './multiplyBigIntRecursive.js'

describe('multiplyBigIntRecursive', () => {
	test('multiplies small positive BigInts', () => {
		assert.equal(multiplyBigIntRecursive(2n, 3n), 6n)
		assert.equal(multiplyBigIntRecursive(12n, 34n), 408n)
		assert.equal(multiplyBigIntRecursive(999n, 999n), 998001n)
	})

	test('handles zero, one, and negative one edge cases', () => {
		const big = (1n << 256n) + 12345678901234567890n

		assert.equal(multiplyBigIntRecursive(0n, 0n), 0n)
		assert.equal(multiplyBigIntRecursive(0n, 42n), 0n)
		assert.equal(multiplyBigIntRecursive(42n, 0n), 0n)
		assert.equal(multiplyBigIntRecursive(0n, -big), 0n)
		assert.equal(multiplyBigIntRecursive(-big, 0n), 0n)

		assert.equal(multiplyBigIntRecursive(1n, 1n), 1n)
		assert.equal(multiplyBigIntRecursive(1n, big), big)
		assert.equal(multiplyBigIntRecursive(big, 1n), big)
		assert.equal(multiplyBigIntRecursive(1n, -big), -big)
		assert.equal(multiplyBigIntRecursive(-big, 1n), -big)

		assert.equal(multiplyBigIntRecursive(-1n, 1n), -1n)
		assert.equal(multiplyBigIntRecursive(1n, -1n), -1n)
		assert.equal(multiplyBigIntRecursive(-1n, -1n), 1n)
		assert.equal(multiplyBigIntRecursive(-1n, big), -big)
		assert.equal(multiplyBigIntRecursive(big, -1n), -big)
		assert.equal(multiplyBigIntRecursive(-1n, -big), big)
	})

	test('handles sign combinations (positive/negative)', () => {
		const a = 123456789012345678901234567890n
		const b = 987654321098765432109876543210n

		assert.equal(multiplyBigIntRecursive(a, b), a * b)
		assert.equal(multiplyBigIntRecursive(-a, b), -a * b)
		assert.equal(multiplyBigIntRecursive(a, -b), a * -b)
		assert.equal(multiplyBigIntRecursive(-a, -b), -a * -b)
	})

	test('handles exact base-case boundary (26-bit and 27-bit operands)', () => {
		const max26 = (1n << 26n) - 1n
		const min27 = 1n << 26n
		const max27 = (1n << 27n) - 1n

		for (const x of [max26, min27, max27, -max26, -min27, -max27]) {
			for (const y of [max26, min27, max27, -max26, -min27, -max27]) {
				assert.equal(multiplyBigIntRecursive(x, y), x * y)
			}
		}
	})

	test('handles asymmetric operand sizes', () => {
		const tiny = 7n
		const medium = (1n << 80n) - 13n
		const huge = (1n << 1024n) - 1n
		const hugeMixed = (1n << 1024n) + (1n << 777n) + (1n << 333n) + 123456789n

		const pairs = [
			[tiny, huge],
			[huge, tiny],
			[-tiny, huge],
			[huge, -tiny],
			[medium, hugeMixed],
			[hugeMixed, medium],
			[-medium, -hugeMixed],
			[2n, (1n << 512n) + 1n],
			[(1n << 512n) + 1n, 2n]
		]

		for (const [a, b] of pairs) {
			assert.equal(multiplyBigIntRecursive(a, b), a * b)
		}
	})

	test('handles very large 1024-bit and 2048-bit BigInts across multiple Karatsuba levels', () => {
		const a1024 = (1n << 1023n) + 0xfedcba9876543210fedcba9876543210n * (1n << 512n) + 0x123456789abcdef0123456789abcdef0n
		const b1024 = (1n << 1023n) + 0x0123456789abcdef0123456789abcdefn * (1n << 600n) + 0xffffffffffffffffffffffffffffffffn
		const allOnes1024 = (1n << 1024n) - 1n
		const pow1024 = 1n << 1024n
		const a2048 = (a1024 << 1024n) ^ b1024
		const b2048 = (b1024 << 1024n) ^ allOnes1024

		const cases = [
			[a1024, b1024],
			[-a1024, b1024],
			[a1024, -b1024],
			[-a1024, -b1024],
			[allOnes1024, allOnes1024],
			[pow1024, pow1024],
			[allOnes1024, pow1024],
			[a2048, b2048],
			[-a2048, b2048]
		]

		for (const [a, b] of cases) {
			assert.equal(multiplyBigIntRecursive(a, b), a * b)
		}
	})

	test('cross-checks deterministic pseudo-random BigInts of varying bit lengths against native *', () => {
		// Deterministic LCG to produce reproducible test vectors across bit sizes
		let seed = 0x5deece66dn
		const next64 = () => {
			seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
			return seed
		}
		const randomBigInt = (bits) => {
			let value = 0n
			let remaining = bits
			while (remaining > 0) {
				const chunk = Math.min(64, remaining)
				value = (value << BigInt(chunk)) | (next64() & ((1n << BigInt(chunk)) - 1n))
				remaining -= chunk
			}
			return value
		}

		const bitSizes = [1, 8, 25, 26, 27, 32, 63, 64, 128, 257, 512, 1024]
		for (const bitsA of bitSizes) {
			for (const bitsB of bitSizes) {
				const a = randomBigInt(bitsA)
				const b = randomBigInt(bitsB)
				assert.equal(multiplyBigIntRecursive(a, b), a * b)
				assert.equal(multiplyBigIntRecursive(-a, b), -a * b)
				assert.equal(multiplyBigIntRecursive(a, -b), a * -b)
				assert.equal(multiplyBigIntRecursive(-a, -b), -a * -b)
			}
		}
	})

	test('rejects non-BigInt inputs with TypeError', () => {
		const invalidValues = [
			0,
			1,
			-42,
			3.14,
			NaN,
			Infinity,
			-Infinity,
			'123',
			'0',
			'',
			true,
			false,
			null,
			undefined,
			{},
			[],
			[1n],
			Symbol('x'),
			() => 1n,
			Object(1n)
		]

		for (const invalid of invalidValues) {
			assert.throws(() => multiplyBigIntRecursive(invalid, 1n), TypeError)
			assert.throws(() => multiplyBigIntRecursive(1n, invalid), TypeError)
			assert.throws(() => multiplyBigIntRecursive(invalid, invalid), TypeError)
		}

		assert.throws(() => multiplyBigIntRecursive(), TypeError)
		assert.throws(() => multiplyBigIntRecursive(10n), TypeError)
	})
})
