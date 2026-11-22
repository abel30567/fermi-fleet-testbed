import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { notBitsetRecursive } from './notBitsetRecursive.js'

function referenceNot(bitset, width) {
	const w = BigInt(width)
	const mask = (1n << w) - 1n
	return mask ^ (bitset & mask)
}

/**
 * Deterministic generator for pseudo-random BigInt bitsets of a given bit length.
 */
function deterministicBitset(bitLength, seed = 0x9e3779b97f4a7c15n) {
	let state = seed
	let result = 0n
	let remaining = bitLength
	const mask64 = (1n << 64n) - 1n

	while (remaining > 0) {
		// SplitMix64 step
		state = (state + 0x9e3779b97f4a7c15n) & mask64
		let z = state
		z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & mask64
		z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & mask64
		z = (z ^ (z >> 31n)) & mask64

		const chunkBits = remaining < 64 ? remaining : 64
		const chunkMask = (1n << BigInt(chunkBits)) - 1n
		result = (result << BigInt(chunkBits)) | (z & chunkMask)
		remaining -= chunkBits
	}

	return result
}

describe('notBitsetRecursive', () => {
	test('handles normal bitsets of various small widths', () => {
		assert.equal(notBitsetRecursive(0b0n, 1), 0b1n)
		assert.equal(notBitsetRecursive(0b1n, 1), 0b0n)
		assert.equal(notBitsetRecursive(0b1010n, 4), 0b0101n)
		assert.equal(notBitsetRecursive(0b10110n, 5), 0b01001n)
		assert.equal(notBitsetRecursive(0x0fn, 8), 0xf0n)
		assert.equal(notBitsetRecursive(0x55aan, 16), 0xaa55n)
		assert.equal(notBitsetRecursive(0x12345678n, 32), 0xedcba987n)
	})

	test('accepts BigInt width arguments equivalently to number widths', () => {
		assert.equal(notBitsetRecursive(0b10101100n, 8n), 0b01010011n)
		assert.equal(notBitsetRecursive(0n, 64n), (1n << 64n) - 1n)
		assert.equal(notBitsetRecursive(0xdeadbeefn, 32n), notBitsetRecursive(0xdeadbeefn, 32))
	})

	test('handles width 0 edge case', () => {
		assert.equal(notBitsetRecursive(0n, 0), 0n)
		assert.equal(notBitsetRecursive(0n, 0n), 0n)
		assert.equal(notBitsetRecursive(0b11111111n, 0), 0n)
	})

	test('handles all-zeros and all-ones edge cases', () => {
		for (const width of [1, 2, 3, 7, 8, 15, 16, 31, 32, 63, 64, 65, 128, 513]) {
			const allOnes = (1n << BigInt(width)) - 1n
			assert.equal(notBitsetRecursive(0n, width), allOnes, `all-zeros failed for width=${width}`)
			assert.equal(notBitsetRecursive(allOnes, width), 0n, `all-ones failed for width=${width}`)
		}
	})

	test('masks input bits beyond the specified width', () => {
		assert.equal(notBitsetRecursive(0b1111_0101n, 4), 0b1010n)
		assert.equal(notBitsetRecursive(1n << 100n, 8), 0xffn)
		assert.equal(notBitsetRecursive((1n << 100n) | 0b11n, 2), 0b00n)
		assert.equal(notBitsetRecursive(0b11011n, 3), 0b100n)
	})

	test('satisfies double-negation involution and Boolean complement laws', () => {
		const cases = [
			[0n, 0],
			[0n, 1],
			[1n, 1],
			[0b1010101n, 7],
			[0xabcdef0123456789n, 64],
			[deterministicBitset(257, 1n), 257],
			[deterministicBitset(1024, 2n), 1024],
			[deterministicBitset(600, 3n), 512], // wider input than width
		]

		for (const [bitset, width] of cases) {
			const mask = (1n << BigInt(width)) - 1n
			const masked = bitset & mask
			const once = notBitsetRecursive(bitset, width)
			const twice = notBitsetRecursive(once, width)

			assert.equal(twice, masked, `involution failed for width=${width}`)
			assert.equal(masked & once, 0n, `x & ~x !== 0 for width=${width}`)
			assert.equal(masked | once, mask, `x | ~x !== mask for width=${width}`)
			assert.equal(masked ^ once, mask, `x ^ ~x !== mask for width=${width}`)
		}
	})

	test('handles very wide bitsets (> 512 bits)', () => {
		const widths = [513, 600, 768, 1024, 1537, 2048, 4096]
		for (let i = 0; i < widths.length; i++) {
			const width = widths[i]
			const bitset = deterministicBitset(width, BigInt(i + 1) * 0x123456789abcdef1n)
			const expected = referenceNot(bitset, width)
			const actual = notBitsetRecursive(bitset, width)
			assert.equal(actual, expected, `mismatch for wide bitset width=${width}`)
		}
	})

	test('cross-checks against ((1n << width) - 1n) ^ (bitset & mask) across widths 0..128', () => {
		for (let width = 0; width <= 128; width++) {
			const w = BigInt(width)
			const mask = (1n << w) - 1n

			const samples = [
				0n,
				mask,
				deterministicBitset(width + 17, BigInt(width) + 42n),
				deterministicBitset(Math.max(1, width), BigInt(width) * 131n + 7n),
			]

			for (const bitset of samples) {
				const expected = ((1n << w) - 1n) ^ (bitset & mask)
				const actual = notBitsetRecursive(bitset, width)
				assert.equal(actual, expected, `cross-check failed for width=${width}`)
			}
		}
	})

	test('throws TypeError for invalid bitset types', () => {
		const invalidBitsets = [0, 42, -1, NaN, Infinity, '0', '101', null, undefined, true, false, {}, [], Symbol('x')]
		for (const bad of invalidBitsets) {
			assert.throws(() => notBitsetRecursive(bad, 8), { name: 'TypeError' })
		}
	})

	test('throws RangeError for negative bitset values', () => {
		for (const bad of [-1n, -2n, -255n, -(1n << 512n)]) {
			assert.throws(() => notBitsetRecursive(bad, 8), { name: 'RangeError' })
		}
	})

	test('throws TypeError for invalid width types', () => {
		const invalidWidths = [undefined, null, '8', true, false, {}, [], Symbol('w')]
		for (const bad of invalidWidths) {
			assert.throws(() => notBitsetRecursive(0n, bad), { name: 'TypeError' })
		}
	})

	test('throws RangeError for negative, non-integer, or unsafe widths', () => {
		const invalidWidths = [
			-1,
			-100,
			-1n,
			-(1n << 64n),
			1.5,
			-0.5,
			NaN,
			Infinity,
			-Infinity,
			Number.MAX_SAFE_INTEGER + 1,
		]
		for (const bad of invalidWidths) {
			assert.throws(() => notBitsetRecursive(0n, bad), { name: 'RangeError' })
		}
	})
})
