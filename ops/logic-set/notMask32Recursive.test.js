import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { notMask32Recursive } from './notMask32Recursive.js'

/**
 * Independent bit-by-bit reference implementation: unpacks each bit into a
 * boolean array, applies logical negation, and repacks into a Uint32Array.
 *
 * @param {Uint32Array} mask
 * @param {number} [bitLength]
 * @returns {Uint32Array}
 */
function referenceBitwiseNot(mask, bitLength = mask.length * 32) {
	const totalBits = mask.length * 32
	const bits = new Array(totalBits).fill(false)

	for (let bit = 0; bit < bitLength; bit++) {
		const wordIndex = Math.floor(bit / 32)
		const bitOffset = bit % 32
		const isSet = ((mask[wordIndex] >>> bitOffset) & 1) === 1
		bits[bit] = !isSet
	}

	const out = new Uint32Array(mask.length)
	for (let bit = 0; bit < totalBits; bit++) {
		if (bits[bit]) {
			const wordIndex = Math.floor(bit / 32)
			const bitOffset = bit % 32
			out[wordIndex] = (out[wordIndex] | (1 << bitOffset)) >>> 0
		}
	}
	return out
}

/**
 * Deterministic xorshift32 PRNG for reproducible fuzzing / cross-checks.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makePrng(seed) {
	let state = seed >>> 0
	return () => {
		state ^= state << 13
		state ^= state >>> 17
		state ^= state << 5
		return state >>> 0
	}
}

describe('notMask32Recursive', () => {
	it('inverts single-word bitmasks accurately', () => {
		assert.deepEqual(
			notMask32Recursive(new Uint32Array([0x00000000])),
			new Uint32Array([0xffffffff])
		)
		assert.deepEqual(
			notMask32Recursive(new Uint32Array([0xffffffff])),
			new Uint32Array([0x00000000])
		)
		assert.deepEqual(
			notMask32Recursive(new Uint32Array([0xaaaaaaaa])),
			new Uint32Array([0x55555555])
		)
		assert.deepEqual(
			notMask32Recursive(new Uint32Array([0x12345678])),
			new Uint32Array([0xedcba987])
		)
	})

	it('inverts multi-word bitmasks of even, odd, and large lengths', () => {
		const even = new Uint32Array([0x00000000, 0xffffffff, 0x0f0f0f0f, 0xf0f0f0f0])
		assert.deepEqual(
			notMask32Recursive(even),
			new Uint32Array([0xffffffff, 0x00000000, 0xf0f0f0f0, 0x0f0f0f0f])
		)

		const odd = new Uint32Array([1, 2, 0x80000000, 0x7fffffff, 0xdeadbeef])
		assert.deepEqual(
			notMask32Recursive(odd),
			new Uint32Array([0xfffffffe, 0xfffffffd, 0x7fffffff, 0x80000000, 0x21524110])
		)

		const largeLen = 1025
		const large = new Uint32Array(largeLen)
		const expected = new Uint32Array(largeLen)
		for (let i = 0; i < largeLen; i++) {
			large[i] = (i * 2654435761) >>> 0
			expected[i] = (~large[i]) >>> 0
		}
		assert.deepEqual(notMask32Recursive(large), expected)
	})

	it('does not mutate the input Uint32Array and returns a distinct instance', () => {
		const input = new Uint32Array([0x00ff00ff, 0x13579bdf])
		const snapshot = new Uint32Array(input)
		const output = notMask32Recursive(input)

		assert.notEqual(output, input)
		assert.deepEqual(input, snapshot)
		assert.deepEqual(output, new Uint32Array([0xff00ff00, 0xeca86420]))
	})

	it('handles empty Uint32Array edge cases', () => {
		const empty = new Uint32Array(0)
		const resDefault = notMask32Recursive(empty)
		const resZeroBits = notMask32Recursive(empty, 0)

		assert.ok(resDefault instanceof Uint32Array)
		assert.equal(resDefault.length, 0)
		assert.notEqual(resDefault, empty)
		assert.deepEqual(resZeroBits, new Uint32Array(0))
	})

	it('respects optional bitLength across partial, full, and zero boundaries', () => {
		// bitLength = 0 clears all words
		assert.deepEqual(
			notMask32Recursive(new Uint32Array([0x00000000, 0x00000000]), 0),
			new Uint32Array([0x00000000, 0x00000000])
		)

		// bitLength = 1 only inverts bit 0
		assert.deepEqual(
			notMask32Recursive(new Uint32Array([0x00000000]), 1),
			new Uint32Array([0x00000001])
		)
		assert.deepEqual(
			notMask32Recursive(new Uint32Array([0xffffffff]), 1),
			new Uint32Array([0x00000000])
		)

		// bitLength = 31 exercises signed-shift edge case (0x7fffffff mask)
		assert.deepEqual(
			notMask32Recursive(new Uint32Array([0x00000000]), 31),
			new Uint32Array([0x7fffffff])
		)
		assert.deepEqual(
			notMask32Recursive(new Uint32Array([0x80000005]), 31),
			new Uint32Array([0x7ffffffa])
		)

		// bitLength = 32 on a 2-word array inverts first word and zeroes second
		assert.deepEqual(
			notMask32Recursive(new Uint32Array([0x00ff00ff, 0x00000000]), 32),
			new Uint32Array([0xff00ff00, 0x00000000])
		)

		// bitLength = 45 across 3 words: full word 0, low 13 bits of word 1, zero word 2
		assert.deepEqual(
			notMask32Recursive(new Uint32Array([0x00000000, 0x00000000, 0x00000000]), 45),
			new Uint32Array([0xffffffff, 0x00001fff, 0x00000000])
		)
	})

	it('supports Uint32Array subarrays with non-zero byteOffset', () => {
		const backing = new Uint32Array([0x11111111, 0x22222222, 0x33333333, 0x44444444])
		const view = backing.subarray(1, 3)

		assert.deepEqual(
			notMask32Recursive(view),
			new Uint32Array([0xdddddddd, 0xcccccccc])
		)
		// Backing array remains unchanged
		assert.deepEqual(
			backing,
			new Uint32Array([0x11111111, 0x22222222, 0x33333333, 0x44444444])
		)
	})

	it('throws TypeError or RangeError on invalid inputs', () => {
		const invalidMasks = [
			null,
			undefined,
			[],
			[0, 1],
			new Int32Array(2),
			new Uint16Array(2),
			new Uint8Array(4),
			'0101',
			42,
			{},
		]
		for (const bad of invalidMasks) {
			assert.throws(() => notMask32Recursive(bad), TypeError)
		}

		const valid = new Uint32Array([1, 2])
		for (const badBitLen of [1.5, NaN, Infinity, -Infinity, '32', null, 32n, {}]) {
			assert.throws(() => notMask32Recursive(valid, badBitLen), TypeError)
		}
		for (const outOfRange of [-1, -32, 65, 100]) {
			assert.throws(() => notMask32Recursive(valid, outOfRange), RangeError)
		}
		assert.throws(() => notMask32Recursive(new Uint32Array(0), 1), RangeError)
	})

	it('matches independent bit-by-bit reference across randomized masks and bitLengths', () => {
		const nextRand = makePrng(0xc0ffee42)
		const wordCounts = [0, 1, 2, 3, 4, 5, 7, 8, 9, 16, 33]

		for (const len of wordCounts) {
			const mask = new Uint32Array(len)
			for (let i = 0; i < len; i++) {
				mask[i] = nextRand()
			}

			// Full-word cross-check
			assert.deepEqual(notMask32Recursive(mask), referenceBitwiseNot(mask))

			// Partial bitLength cross-checks
			const maxBits = len * 32
			const sampleBitLengths = new Set([
				0,
				maxBits,
				Math.min(1, maxBits),
				Math.min(31, maxBits),
				Math.min(32, maxBits),
				Math.min(33, maxBits),
				Math.floor(maxBits / 2),
				Math.max(0, maxBits - 1),
			])

			for (const bitLen of sampleBitLengths) {
				assert.deepEqual(
					notMask32Recursive(mask, bitLen),
					referenceBitwiseNot(mask, bitLen)
				)
			}
		}
	})

	it('satisfies Boolean algebra laws (involution, complement, De Morgan)', () => {
		const nextRand = makePrng(0x9e3779b9)
		const len = 17
		const a = new Uint32Array(len)
		const b = new Uint32Array(len)
		for (let i = 0; i < len; i++) {
			a[i] = nextRand()
			b[i] = nextRand()
		}

		// Involution: NOT(NOT(A)) === A
		assert.deepEqual(notMask32Recursive(notMask32Recursive(a)), a)

		// Complement laws: A & NOT(A) === 0, A | NOT(A) === all-ones
		const notA = notMask32Recursive(a)
		const notB = notMask32Recursive(b)
		for (let i = 0; i < len; i++) {
			assert.equal((a[i] & notA[i]) >>> 0, 0)
			assert.equal((a[i] | notA[i]) >>> 0, 0xffffffff)
		}

		// De Morgan: NOT(A | B) === NOT(A) & NOT(B) and NOT(A & B) === NOT(A) | NOT(B)
		const aOrB = new Uint32Array(len)
		const aAndB = new Uint32Array(len)
		const notAAndNotB = new Uint32Array(len)
		const notAOrNotB = new Uint32Array(len)
		for (let i = 0; i < len; i++) {
			aOrB[i] = (a[i] | b[i]) >>> 0
			aAndB[i] = (a[i] & b[i]) >>> 0
			notAAndNotB[i] = (notA[i] & notB[i]) >>> 0
			notAOrNotB[i] = (notA[i] | notB[i]) >>> 0
		}

		assert.deepEqual(notMask32Recursive(aOrB), notAAndNotB)
		assert.deepEqual(notMask32Recursive(aAndB), notAOrNotB)

		// Involution within a partial bitLength universe
		const bitLen = len * 32 - 13
		const maskedA = notMask32Recursive(notMask32Recursive(a, bitLen), bitLen)
		assert.deepEqual(maskedA, referenceBitwiseNot(referenceBitwiseNot(a, bitLen), bitLen))
	})
})
