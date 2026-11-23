import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { subtractBigIntIterative } from './subtractBigIntIterative.js'

const SCALE = 10n ** 18n

describe('subtractBigIntIterative', () => {
	test('handles normal positive, negative, and mixed-sign subtractions', () => {
		assert.equal(subtractBigIntIterative(10n, 3n), 7n)
		assert.equal(subtractBigIntIterative(3n, 10n), -7n)
		assert.equal(subtractBigIntIterative(-10n, -3n), -7n)
		assert.equal(subtractBigIntIterative(-3n, -10n), 7n)
		assert.equal(subtractBigIntIterative(10n, -3n), 13n)
		assert.equal(subtractBigIntIterative(-10n, 3n), -13n)
	})

	test('handles fixed-point 10^18 scaled BigInt values', () => {
		const onePointFive = 15n * (SCALE / 10n)
		const twoPointSeventyFive = 275n * (SCALE / 100n)
		const expected = -125n * (SCALE / 100n)
		assert.equal(subtractBigIntIterative(onePointFive, twoPointSeventyFive), expected)
		assert.equal(subtractBigIntIterative(twoPointSeventyFive, onePointFive), -expected)
	})

	test('handles zeros and identical operands', () => {
		assert.equal(subtractBigIntIterative(0n, 0n), 0n)
		assert.equal(subtractBigIntIterative(42n, 0n), 42n)
		assert.equal(subtractBigIntIterative(-42n, 0n), -42n)
		assert.equal(subtractBigIntIterative(0n, 42n), -42n)
		assert.equal(subtractBigIntIterative(0n, -42n), 42n)
		assert.equal(subtractBigIntIterative(999999999999999999999n, 999999999999999999999n), 0n)
		assert.equal(subtractBigIntIterative(-999999999999999999999n, -999999999999999999999n), 0n)
	})

	test('handles multi-limb borrow and carry cascades across 32-bit boundaries', () => {
		const pow32 = 1n << 32n
		const pow64 = 1n << 64n
		const pow128 = 1n << 128n
		const pow256 = 1n << 256n

		// Full borrow cascade across 1, 2, 4, and 8 limbs
		assert.equal(subtractBigIntIterative(pow32, 1n), pow32 - 1n)
		assert.equal(subtractBigIntIterative(pow64, 1n), pow64 - 1n)
		assert.equal(subtractBigIntIterative(pow128, 1n), pow128 - 1n)
		assert.equal(subtractBigIntIterative(pow256, 1n), pow256 - 1n)
		assert.equal(subtractBigIntIterative(1n, pow256), -(pow256 - 1n))

		// Full carry cascade when signs differ (magnitude addition)
		assert.equal(subtractBigIntIterative(pow128 - 1n, -1n), pow128)
		assert.equal(subtractBigIntIterative(-(pow256 - 1n), 1n), -pow256)
	})

	test('handles very large arbitrary-precision BigInt operands', () => {
		const hugeA = (1n << 1024n) + 123456789012345678901234567890n
		const hugeB = (1n << 512n) + 987654321098765432109876543210n
		assert.equal(subtractBigIntIterative(hugeA, hugeB), hugeA - hugeB)
		assert.equal(subtractBigIntIterative(hugeB, hugeA), hugeB - hugeA)
		assert.equal(subtractBigIntIterative(hugeA, -hugeB), hugeA + hugeB)
		assert.equal(subtractBigIntIterative(-hugeA, hugeB), -hugeA - hugeB)
	})

	test('validates inputs and throws TypeError for non-BigInt arguments', () => {
		const invalidValues = [0, 1, -1, 1.5, NaN, Infinity, '10', null, undefined, true, {}, []]
		for (const bad of invalidValues) {
			assert.throws(() => subtractBigIntIterative(bad, 1n), TypeError)
			assert.throws(() => subtractBigIntIterative(1n, bad), TypeError)
		}
		assert.throws(() => subtractBigIntIterative(), TypeError)
		assert.throws(() => subtractBigIntIterative(1n), TypeError)
	})

	test('cross-checks against native subtraction and algebraic identities', () => {
		// Deterministic PRNG (LCG) producing signed multi-limb BigInt values
		let state = 0x123456789abcdef0n
		const mod = 1n << 64n
		const nextWord = () => {
			state = (state * 6364136223846793005n + 1442695040888963407n) % mod
			return state
		}
		const nextSignedBigInt = (words) => {
			let acc = 0n
			for (let i = 0; i < words; i++) {
				acc = (acc << 64n) | nextWord()
			}
			return (nextWord() & 1n) === 0n ? acc : -acc
		}

		for (let i = 0; i < 200; i++) {
			const wordsA = (i % 5) + 1
			const wordsB = ((i * 3) % 5) + 1
			const a = nextSignedBigInt(wordsA)
			const b = nextSignedBigInt(wordsB)
			const k = nextSignedBigInt(2)

			const diff = subtractBigIntIterative(a, b)

			// Independent check 1: native BigInt subtraction
			assert.equal(diff, a - b)

			// Independent check 2: additive inverse property (a - b) + b === a
			assert.equal(diff + b, a)

			// Independent check 3: antisymmetry (a - b) === -(b - a)
			assert.equal(diff, -subtractBigIntIterative(b, a))

			// Independent check 4: translation invariance (a + k) - (b + k) === a - b
			assert.equal(subtractBigIntIterative(a + k, b + k), diff)
		}
	})
})
