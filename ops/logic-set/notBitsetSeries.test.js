import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { notBitsetSeries } from './notBitsetSeries.js'

/**
 * Independent reference implementation computing the bit-plane complement series
 * directly term-by-term: sum_{k=0}^{width-1} (1 - a_k) * 2^k.
 */
function naiveBitPlaneComplementSeries(bitset, width) {
	let sum = 0n
	let remaining = bitset
	let weight = 1n
	for (let k = 0n; k < width; k++) {
		const bit = remaining % 2n
		sum += (1n - bit) * weight
		remaining = (remaining - bit) / 2n
		weight *= 2n
	}
	return sum
}

/**
 * Deterministic LCG-based generator for reproducible arbitrary-width BigInts.
 */
function deterministicBigInt(bitCount, seed) {
	let state = BigInt(seed)
	const mod = 1n << 64n
	const mult = 6364136223846793005n
	const inc = 1442695040888963407n
	let result = 0n
	let produced = 0
	while (produced < bitCount) {
		state = (state * mult + inc) % mod
		const take = Math.min(64, bitCount - produced)
		const chunk = state & ((1n << BigInt(take)) - 1n)
		result = (result << BigInt(take)) | chunk
		produced += take
	}
	return result
}

describe('notBitsetSeries', () => {
	describe('normal cases', () => {
		it('computes complements for explicit number and BigInt widths', () => {
			assert.equal(notBitsetSeries(0b10101010n, 8), 0b01010101n)
			assert.equal(notBitsetSeries(0b10101010n, 8n), 0b01010101n)
			assert.equal(notBitsetSeries(0b00001111n, 8), 0b11110000n)
			assert.equal(notBitsetSeries(0b101n, 3), 0b010n)
			assert.equal(notBitsetSeries(0b101n, 4), 0b1010n)
			assert.equal(notBitsetSeries(0b101n, 8), 0b11111010n)
			assert.equal(notBitsetSeries(0xdeadbeefn, 32), 0x21524110n)
			assert.equal(notBitsetSeries(0x0123456789abcdefn, 64), 0xfedcba9876543210n)
		})

		it('defaults width to minimal bit length when omitted', () => {
			assert.equal(notBitsetSeries(0n), 0n)
			assert.equal(notBitsetSeries(1n), 0n)
			assert.equal(notBitsetSeries(2n), 1n) // 10_2 -> 01_2
			assert.equal(notBitsetSeries(3n), 0n) // 11_2 -> 00_2
			assert.equal(notBitsetSeries(4n), 3n) // 100_2 -> 011_2
			assert.equal(notBitsetSeries(5n), 2n) // 101_2 -> 010_2
			assert.equal(notBitsetSeries(0b10110n), 0b01001n)
			assert.equal(notBitsetSeries(0b10000000n), 0b01111111n)
			assert.equal(notBitsetSeries(0xffn), 0n)
		})

		it('reduces inputs exceeding width modulo 2^width', () => {
			assert.equal(notBitsetSeries(0b1111_0101n, 4), 0b1010n)
			assert.equal(notBitsetSeries(1n << 8n, 8), 0xffn)
			assert.equal(notBitsetSeries((1n << 8n) + 0x5an, 8), 0xa5n)
			assert.equal(notBitsetSeries((1n << 512n) + 0b101n, 4), 0b1010n)
		})
	})

	describe('edge cases', () => {
		it('handles 0n across zero, small, and large widths', () => {
			assert.equal(notBitsetSeries(0n, 0), 0n)
			assert.equal(notBitsetSeries(0n, 0n), 0n)
			assert.equal(notBitsetSeries(0n, 1), 1n)
			assert.equal(notBitsetSeries(0n, 8), 255n)
			assert.equal(notBitsetSeries(0n, 64), (1n << 64n) - 1n)
			assert.equal(notBitsetSeries(0n, 256), (1n << 256n) - 1n)
			assert.equal(notBitsetSeries(0n, 512n), (1n << 512n) - 1n)
		})

		it('handles width 0 for any non-negative bitset', () => {
			assert.equal(notBitsetSeries(0n, 0), 0n)
			assert.equal(notBitsetSeries(1n, 0), 0n)
			assert.equal(notBitsetSeries(0xffffn, 0), 0n)
			assert.equal(notBitsetSeries((1n << 300n) + 12345n, 0n), 0n)
		})

		it('handles all-ones masks across arbitrary widths', () => {
			for (const w of [1, 7, 8, 32, 64, 128, 256, 257, 512, 1024]) {
				const allOnes = (1n << BigInt(w)) - 1n
				assert.equal(notBitsetSeries(allOnes, w), 0n)
				assert.equal(notBitsetSeries(allOnes), 0n)
				assert.equal(notBitsetSeries(0n, w), allOnes)
			}
		})

		it('handles >256-bit widths accurately', () => {
			for (const w of [257, 300, 384, 512, 1024, 2048]) {
				const bw = BigInt(w)
				const mask = (1n << bw) - 1n
				const sample = deterministicBigInt(w, w * 17 + 3)

				const expected = (~sample) & mask
				assert.equal(notBitsetSeries(sample, w), expected)
				assert.equal(notBitsetSeries(sample, bw), expected)

				// Highest single bit set -> all lower bits become 1
				const highBit = 1n << (bw - 1n)
				assert.equal(notBitsetSeries(highBit, w), highBit - 1n)
				assert.equal(notBitsetSeries(highBit), highBit - 1n)

				// Lowest single bit set -> all higher bits become 1
				assert.equal(notBitsetSeries(1n, w), mask - 1n)
			}
		})
	})

	describe('algebraic identities', () => {
		it('satisfies double negation involution not(not(a, w), w) === a for a < 2^w', () => {
			const cases = [
				[0n, 0],
				[0n, 1],
				[1n, 1],
				[0n, 8],
				[0b10110100n, 8],
				[0xffn, 8],
				[deterministicBigInt(64, 101), 64],
				[deterministicBigInt(256, 202), 256],
				[deterministicBigInt(384, 303), 384],
				[deterministicBigInt(1024, 404), 1024],
			]
			for (const [a, w] of cases) {
				assert.equal(notBitsetSeries(notBitsetSeries(a, w), w), a)
			}
		})

		it('satisfies double negation modulo 2^w when a >= 2^w', () => {
			const w = 300
			const modulus = 1n << BigInt(w)
			const a = deterministicBigInt(450, 999)
			assert.equal(notBitsetSeries(notBitsetSeries(a, w), w), a % modulus)
		})

		it('satisfies partition and De Morgan laws over fixed width', () => {
			for (const w of [8, 64, 300]) {
				const bw = BigInt(w)
				const mask = (1n << bw) - 1n
				const a = deterministicBigInt(w, w + 11)
				const b = deterministicBigInt(w, w + 29)

				const notA = notBitsetSeries(a, w)
				const notB = notBitsetSeries(b, w)

				// Partition of the universal mask
				assert.equal(notA + a, mask)
				assert.equal(notA & a, 0n)
				assert.equal(notA | a, mask)

				// De Morgan's laws
				assert.equal(notBitsetSeries(a | b, w), notA & notB)
				assert.equal(notBitsetSeries(a & b, w), notA | notB)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('matches ((1n << BigInt(w)) - 1n) ^ a, (~a) & mask, and naive series exhaustively for small widths', () => {
			for (let w = 0; w <= 7; w++) {
				const bw = BigInt(w)
				const mask = (1n << bw) - 1n
				const limit = 1n << bw
				for (let a = 0n; a < limit; a++) {
					const actual = notBitsetSeries(a, w)
					assert.equal(actual, mask ^ a)
					assert.equal(actual, (~a) & mask)
					assert.equal(actual, naiveBitPlaneComplementSeries(a, bw))
				}
			}
		})

		it('matches (~a) & mask and naive bit-plane series when a >= 2^w', () => {
			for (const w of [0, 1, 5, 16, 64, 257]) {
				const bw = BigInt(w)
				const mask = (1n << bw) - 1n
				const a = deterministicBigInt(w + 50, w * 31 + 7) + (1n << bw)

				const actual = notBitsetSeries(a, w)
				assert.equal(actual, (~a) & mask)
				assert.equal(actual, mask ^ (a & mask))
				assert.equal(actual, naiveBitPlaneComplementSeries(a, bw))
			}
		})

		it('matches bitwise identities and naive series for >256-bit widths', () => {
			for (const w of [257, 311, 512, 768]) {
				const bw = BigInt(w)
				const mask = (1n << bw) - 1n
				const a = deterministicBigInt(w, w * 13 + 5)

				const actual = notBitsetSeries(a, w)
				assert.equal(actual, mask ^ a)
				assert.equal(actual, (~a) & mask)
				assert.equal(actual, naiveBitPlaneComplementSeries(a, bw))
			}
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-BigInt bitset', () => {
			for (const invalid of [0, 1, 42, -5, '5', true, false, null, undefined, {}, []]) {
				assert.throws(() => notBitsetSeries(invalid, 8), TypeError)
				assert.throws(() => notBitsetSeries(invalid), TypeError)
			}
		})

		it('throws RangeError for negative BigInt bitset', () => {
			for (const neg of [-1n, -2n, -255n, -(1n << 300n)]) {
				assert.throws(() => notBitsetSeries(neg, 8), RangeError)
				assert.throws(() => notBitsetSeries(neg), RangeError)
			}
		})

		it('throws TypeError for invalid width type', () => {
			for (const badWidth of ['8', null, true, false, {}, [], Symbol('w')]) {
				assert.throws(() => notBitsetSeries(5n, badWidth), TypeError)
			}
		})

		it('throws RangeError for negative, non-integer, non-finite, or unsafe width', () => {
			const badWidths = [
				-1,
				-100,
				-1n,
				-(1n << 128n),
				1.5,
				0.1,
				NaN,
				Infinity,
				-Infinity,
				Number.MAX_SAFE_INTEGER + 1,
				-Number.MAX_SAFE_INTEGER - 1,
			]
			for (const badWidth of badWidths) {
				assert.throws(() => notBitsetSeries(5n, badWidth), RangeError)
			}
		})
	})
})
