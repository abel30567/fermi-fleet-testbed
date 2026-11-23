import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { notMask32Memo } from './notMask32Memo.js'

/**
 * Independent bit-by-bit reference implementation of logical NOT over Uint32Array bitmasks.
 * Extracts each bit individually, flips it, and packs bits back without lookup tables.
 *
 * @param {Uint32Array} mask
 * @param {number} [bitLength]
 * @returns {Uint32Array}
 */
function referenceBitByBitNot(mask, bitLength = mask.length * 32) {
	const out = new Uint32Array(mask.length)
	for (let bit = 0; bit < bitLength; bit++) {
		const wordIndex = Math.floor(bit / 32)
		const bitOffset = bit % 32
		const srcBit = (mask[wordIndex] >>> bitOffset) & 1
		const flippedBit = srcBit === 0 ? 1 : 0
		if (flippedBit === 1) {
			out[wordIndex] = (out[wordIndex] | (1 << bitOffset)) >>> 0
		}
	}
	return out
}

/**
 * Count set bits across a Uint32Array bitmask.
 *
 * @param {Uint32Array} mask
 * @returns {number}
 */
function popcountMask(mask) {
	let total = 0
	for (let i = 0; i < mask.length; i++) {
		let w = mask[i]
		while (w !== 0) {
			w = (w & (w - 1)) >>> 0
			total++
		}
	}
	return total
}

/**
 * Deterministic xorshift32 PRNG for reproducible fuzz/cross-check tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state ^= (state << 13) >>> 0
		state ^= state >>> 17
		state ^= (state << 5) >>> 0
		return state >>> 0
	}
}

describe('notMask32Memo', () => {
	describe('normal cases', () => {
		it('inverts all bits of single-word masks including MSB unsigned boundary', () => {
			assert.deepEqual(
				notMask32Memo(new Uint32Array([0x00000000])),
				new Uint32Array([0xffffffff]),
			)
			assert.deepEqual(
				notMask32Memo(new Uint32Array([0xffffffff])),
				new Uint32Array([0x00000000]),
			)
			assert.deepEqual(
				notMask32Memo(new Uint32Array([0x80000000])),
				new Uint32Array([0x7fffffff]),
			)
			assert.deepEqual(
				notMask32Memo(new Uint32Array([0x7fffffff])),
				new Uint32Array([0x80000000]),
			)
			assert.deepEqual(
				notMask32Memo(new Uint32Array([0xaaaaaaaa])),
				new Uint32Array([0x55555555]),
			)
			assert.deepEqual(
				notMask32Memo(new Uint32Array([0x12345678])),
				new Uint32Array([0xedcba987]),
			)
		})

		it('inverts multi-word Uint32Array bitmasks', () => {
			const input = new Uint32Array([0x00ff00ff, 0xf0f0f0f0, 0xdeadbeef, 0x00000001])
			const expected = new Uint32Array([0xff00ff00, 0x0f0f0f0f, 0x21524110, 0xfffffffe])
			assert.deepEqual(notMask32Memo(input), expected)
		})

		it('supports logical universe truncation via optional bitLength', () => {
			const input = new Uint32Array([0b01010101, 0xffffffff])
			// Only first 4 bits inverted: ~0101 = 1010 (0xa), second word cleared to 0
			assert.deepEqual(notMask32Memo(input, 4), new Uint32Array([0b1010, 0]))
			// First 35 bits inverted: word 0 fully inverted, word 1 low 3 bits of ~0xffffffff = 0
			assert.deepEqual(notMask32Memo(input, 35), new Uint32Array([0xffffffaa, 0]))
			// Another partial word case where tail bits become 1
			const input2 = new Uint32Array([0x00000000, 0xfffffff5])
			// Low 4 bits of word 1 are 0101 -> inverted to 1010 (0xa), high 28 bits cleared
			assert.deepEqual(notMask32Memo(input2, 36), new Uint32Array([0xffffffff, 0b1010]))
		})

		it('does not mutate the input array and returns a fresh Uint32Array instance', () => {
			const input = new Uint32Array([0x13579bdf, 0x2468ace0])
			const snapshot = new Uint32Array(input)
			const out1 = notMask32Memo(input)
			const out2 = notMask32Memo(input)

			assert.deepEqual(input, snapshot)
			assert.notEqual(out1, input)
			assert.notEqual(out1, out2)

			out1[0] = 0
			assert.deepEqual(out2, new Uint32Array([0xeca86420, 0xdb97531f]))
		})
	})

	describe('edge cases', () => {
		it('handles empty Uint32Array with omitted or zero bitLength', () => {
			const empty = new Uint32Array(0)
			const resDefault = notMask32Memo(empty)
			const resZero = notMask32Memo(empty, 0)

			assert.ok(resDefault instanceof Uint32Array)
			assert.equal(resDefault.length, 0)
			assert.notEqual(resDefault, empty)
			assert.deepEqual(resZero, new Uint32Array(0))
		})

		it('handles bitLength === 0 and -0 on non-empty masks', () => {
			const input = new Uint32Array([0xffffffff, 0x12345678])
			assert.deepEqual(notMask32Memo(input, 0), new Uint32Array([0, 0]))
			assert.deepEqual(notMask32Memo(input, -0), new Uint32Array([0, 0]))
		})

		it('handles exact word boundaries and single-bit tail boundaries', () => {
			const input = new Uint32Array([0x00000000, 0x00000000, 0x00000000])
			assert.deepEqual(notMask32Memo(input, 1), new Uint32Array([0x00000001, 0, 0]))
			assert.deepEqual(notMask32Memo(input, 31), new Uint32Array([0x7fffffff, 0, 0]))
			assert.deepEqual(notMask32Memo(input, 32), new Uint32Array([0xffffffff, 0, 0]))
			assert.deepEqual(notMask32Memo(input, 33), new Uint32Array([0xffffffff, 0x00000001, 0]))
			assert.deepEqual(notMask32Memo(input, 64), new Uint32Array([0xffffffff, 0xffffffff, 0]))
			assert.deepEqual(
				notMask32Memo(input, 96),
				new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff]),
			)
		})

		it('handles subarray views with non-zero byteOffset correctly', () => {
			const backing = new Uint32Array([0x11111111, 0x22222222, 0x33333333, 0x44444444])
			const view = backing.subarray(1, 3)
			const out = notMask32Memo(view)

			assert.equal(out.length, 2)
			assert.deepEqual(out, new Uint32Array([0xdddddddd, 0xcccccccc]))
			assert.deepEqual(backing, new Uint32Array([0x11111111, 0x22222222, 0x33333333, 0x44444444]))
		})

		it('remains accurate across memoization cache hits and cache overflow/eviction', () => {
			const count = 5000 // Exceeds MAX_WORD_CACHE_SIZE (4096)
			const input = new Uint32Array(count)
			for (let i = 0; i < count; i++) {
				input[i] = (i * 2654435761) >>> 0
			}
			const first = notMask32Memo(input)
			const second = notMask32Memo(input)

			assert.deepEqual(first, second)
			for (let i = 0; i < count; i++) {
				assert.equal(first[i], (~input[i]) >>> 0)
			}
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-Uint32Array mask inputs', () => {
			const invalidMasks = [
				undefined,
				null,
				[],
				[0, 1],
				new Int32Array([1]),
				new Uint8Array([1, 2, 3, 4]),
				new Uint16Array([1, 2]),
				new Float32Array([1]),
				new BigUint64Array([1n]),
				new ArrayBuffer(4),
				'1234',
				42,
				{ length: 1, 0: 0 },
			]

			for (const bad of invalidMasks) {
				assert.throws(() => notMask32Memo(bad), TypeError)
			}
		})

		it('throws TypeError when underlying ArrayBuffer is detached', () => {
			const buf = new ArrayBuffer(8)
			const view = new Uint32Array(buf)
			view[0] = 0x12345678
			// Detach the buffer via structuredClone transfer (Node 20+)
			structuredClone(buf, { transfer: [buf] })
			assert.throws(() => notMask32Memo(view), TypeError)
		})

		it('throws TypeError for non-number bitLength values', () => {
			const mask = new Uint32Array([0, 0])
			for (const badLen of [null, '32', 32n, true, false, {}, []]) {
				assert.throws(() => notMask32Memo(mask, badLen), TypeError)
			}
		})

		it('throws RangeError for out-of-range or non-integer bitLength values', () => {
			const mask = new Uint32Array([0, 0]) // max 64 bits
			for (const badLen of [-1, 65, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => notMask32Memo(mask, badLen), RangeError)
			}

			const empty = new Uint32Array(0)
			assert.throws(() => notMask32Memo(empty, 1), RangeError)
		})
	})

	describe('independent cross-checks and algebraic laws', () => {
		it('matches independent bit-by-bit reference across randomized masks and all bit lengths', () => {
			const rng = makeRng(0xc0ffee42)
			const mask = new Uint32Array(4)
			for (let i = 0; i < mask.length; i++) {
				mask[i] = rng()
			}

			// Exhaustively verify every bitLength from 0 to 128
			for (let bitLength = 0; bitLength <= 128; bitLength++) {
				const actual = notMask32Memo(mask, bitLength)
				const expected = referenceBitByBitNot(mask, bitLength)
				assert.deepEqual(actual, expected, `mismatch at bitLength=${bitLength}`)
			}
		})

		it('satisfies involution, disjointness, and complement popcount invariants', () => {
			const rng = makeRng(0x5eed1234)
			for (let trial = 0; trial < 25; trial++) {
				const wordCount = (trial % 6) + 1
				const mask = new Uint32Array(wordCount)
				for (let i = 0; i < wordCount; i++) {
					mask[i] = rng()
				}

				const inv = notMask32Memo(mask)
				const doubleInv = notMask32Memo(inv)

				// Double negation equals original
				assert.deepEqual(doubleInv, mask)

				// Disjoint union covers all 32*wordCount bits
				for (let i = 0; i < wordCount; i++) {
					assert.equal((mask[i] & inv[i]) >>> 0, 0)
					assert.equal((mask[i] | inv[i]) >>> 0, 0xffffffff)
				}
				assert.equal(popcountMask(mask) + popcountMask(inv), wordCount * 32)

				// Partial universe popcount check
				const bitLen = rng() % (wordCount * 32 + 1)
				const truncated = notMask32Memo(notMask32Memo(mask, bitLen), bitLen)
				const complement = notMask32Memo(truncated, bitLen)
				assert.equal(popcountMask(truncated) + popcountMask(complement), bitLen)
				assert.deepEqual(notMask32Memo(complement, bitLen), truncated)
			}
		})
	})
})
