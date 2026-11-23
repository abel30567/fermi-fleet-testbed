import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { notBitsetSeries } from './notBitsetSeries.js'

/**
 * Independent reference implementation that evaluates the complement by
 * explicitly summing (1 - b_k) * 2^k term by term across all bit positions.
 */
function referenceBitByBitNot(bits, width) {
	let result = 0n
	const w = BigInt(width)
	for (let k = 0n; k < w; k++) {
		const bit = (bits >> k) & 1n
		if (bit === 0n) {
			result += 1n << k
		}
	}
	return result
}

describe('notBitsetSeries', () => {
	describe('normal cases', () => {
		it('inverts standard 8-bit bitsets', () => {
			assert.equal(notBitsetSeries(0b00000000n, 8), 0b11111111n)
			assert.equal(notBitsetSeries(0b11111111n, 8), 0b00000000n)
			assert.equal(notBitsetSeries(0b10101100n, 8), 0b01010011n)
			assert.equal(notBitsetSeries(0b00000001n, 8), 0b11111110n)
		})

		it('inverts non-power-of-two widths accurately', () => {
			assert.equal(notBitsetSeries(0b101n, 3), 0b010n)
			assert.equal(notBitsetSeries(0b10101n, 5), 0b01010n)
			assert.equal(notBitsetSeries(0b1100101n, 7), 0b0011010n)
			assert.equal(notBitsetSeries(0x123n, 13), 0x1edcn)
		})

		it('accepts bigint width values', () => {
			assert.equal(notBitsetSeries(0b1010n, 4n), 0b0101n)
			assert.equal(notBitsetSeries(0n, 64n), (1n << 64n) - 1n)
		})

		it('handles arbitrary wide bitsets beyond 64 bits (128, 256, 1024, 4096 bits)', () => {
			for (const width of [128, 256, 1024, 4096]) {
				const w = BigInt(width)
				const full = (1n << w) - 1n
				assert.equal(notBitsetSeries(0n, width), full)
				assert.equal(notBitsetSeries(full, width), 0n)

				// Alternating pattern 0x5555...55 -> 0xAAAA...AA
				let pattern = 0n
				for (let i = 0; i < width; i += 2) {
					pattern |= 1n << BigInt(i)
				}
				const expected = full ^ pattern
				assert.equal(notBitsetSeries(pattern, width), expected)
			}
		})
	})

	describe('edge cases', () => {
		it('handles width 0 with empty bitset 0n', () => {
			assert.equal(notBitsetSeries(0n, 0), 0n)
			assert.equal(notBitsetSeries(0n, 0n), 0n)
			assert.equal(notBitsetSeries(0n, -0), 0n)
		})

		it('handles width 1 boundary values', () => {
			assert.equal(notBitsetSeries(0n, 1), 1n)
			assert.equal(notBitsetSeries(1n, 1), 0n)
		})

		it('handles exact maximum value (2^width - 1) and MSB-only value (2^(width-1))', () => {
			const width = 200
			const max = (1n << 200n) - 1n
			const msbOnly = 1n << 199n
			assert.equal(notBitsetSeries(max, width), 0n)
			assert.equal(notBitsetSeries(msbOnly, width), (1n << 199n) - 1n)
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when bits is not a bigint', () => {
			for (const badBits of [0, 1, '0', null, undefined, false, true, {}, []]) {
				assert.throws(
					() => notBitsetSeries(badBits, 8),
					{ name: 'TypeError' },
				)
			}
		})

		it('throws RangeError when bits is negative', () => {
			assert.throws(() => notBitsetSeries(-1n, 8), { name: 'RangeError' })
			assert.throws(() => notBitsetSeries(-1n, 0), { name: 'RangeError' })
			assert.throws(() => notBitsetSeries(-(1n << 100n), 128), { name: 'RangeError' })
		})

		it('throws TypeError when width is neither number nor bigint', () => {
			for (const badWidth of ['8', null, undefined, true, false, {}, []]) {
				assert.throws(
					() => notBitsetSeries(0n, badWidth),
					{ name: 'TypeError' },
				)
			}
		})

		it('throws RangeError when width is negative, fractional, non-finite, or unsafe', () => {
			for (const badWidth of [
				-1,
				-1n,
				-100n,
				1.5,
				0.1,
				Number.NaN,
				Number.POSITIVE_INFINITY,
				Number.NEGATIVE_INFINITY,
				Number.MAX_SAFE_INTEGER + 1,
			]) {
				assert.throws(
					() => notBitsetSeries(0n, badWidth),
					{ name: 'RangeError' },
				)
			}
		})

		it('throws RangeError when bits exceeds the specified width', () => {
			assert.throws(() => notBitsetSeries(1n, 0), { name: 'RangeError' })
			assert.throws(() => notBitsetSeries(2n, 1), { name: 'RangeError' })
			assert.throws(() => notBitsetSeries(256n, 8), { name: 'RangeError' })
			assert.throws(() => notBitsetSeries(1n << 128n, 128), { name: 'RangeError' })
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		it('matches bit-by-bit series summation, masked bitwise NOT, and XOR across deterministic samples', () => {
			// Deterministic LCG PRNG for reproducible arbitrary-width testing.
			let state = 0x123456789abcdef0n
			const nextBits = (width) => {
				let acc = 0n
				for (let offset = 0; offset < width; offset += 32) {
					state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
					acc |= (state >> 32n) << BigInt(offset)
				}
				return acc & ((1n << BigInt(width)) - 1n)
			}

			for (const width of [0, 1, 2, 7, 16, 33, 64, 127, 257]) {
				const mask = (1n << BigInt(width)) - 1n
				for (let trial = 0; trial < 10; trial++) {
					const x = width === 0 ? 0n : nextBits(width)
					const actual = notBitsetSeries(x, width)

					// Cross-check 1: explicit bit-by-bit series evaluation
					assert.equal(actual, referenceBitByBitNot(x, width))
					// Cross-check 2: native bitwise NOT masked to width
					assert.equal(actual, ~x & mask)
					// Cross-check 3: XOR with all-ones mask
					assert.equal(actual, x ^ mask)
				}
			}
		})

		it('satisfies involution, complement partition, and De Morgan laws', () => {
			const width = 300
			const mask = (1n << BigInt(width)) - 1n
			const a = (1n << 299n) | (1n << 150n) | (1n << 42n) | 0xdeadbeefn
			const b = (1n << 298n) | (1n << 150n) | (1n << 7n) | 0xcafebaben

			const notA = notBitsetSeries(a, width)
			const notB = notBitsetSeries(b, width)

			// Involution: NOT(NOT(a)) === a
			assert.equal(notBitsetSeries(notA, width), a)
			// Disjointness & covering: (a & NOT(a)) === 0n, (a | NOT(a)) === U
			assert.equal(a & notA, 0n)
			assert.equal(a | notA, mask)
			assert.equal(a + notA, mask)
			// De Morgan's laws
			assert.equal(notBitsetSeries(a | b, width), notA & notB)
			assert.equal(notBitsetSeries(a & b, width), notA | notB)
		})
	})
})
