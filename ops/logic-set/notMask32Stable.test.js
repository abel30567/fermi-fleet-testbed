import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { notMask32Stable } from './notMask32Stable.js'

/**
 * Independent reference conversion: pack little-endian Uint32Array words into BigInt,
 * optionally truncated to `bitLength` low bits.
 */
function wordsToBigInt(words, bitLength = words.length * 32) {
	let acc = 0n
	for (let i = words.length - 1; i >= 0; i--) {
		acc = (acc << 32n) | BigInt(words[i] >>> 0)
	}
	if (bitLength < words.length * 32) {
		const mask = (1n << BigInt(bitLength)) - 1n
		acc &= mask
	}
	return acc
}

/**
 * Independent reference conversion: unpack BigInt into fixed-length Uint32Array.
 */
function bigIntToWords(value, wordCount) {
	const out = new Uint32Array(wordCount)
	let cur = value
	for (let i = 0; i < wordCount; i++) {
		out[i] = Number(cur & 0xffffffffn)
		cur >>= 32n
	}
	return out
}

/**
 * Independent BigInt complement: ((1n << bits) - 1n) ^ val.
 */
function bigIntNotMask(words, bitLength = words.length * 32) {
	const bits = BigInt(bitLength)
	const fullMask = (1n << bits) - 1n
	const val = wordsToBigInt(words, bitLength)
	return bigIntToWords(fullMask ^ val, words.length)
}

describe('notMask32Stable', () => {
	test('inverts typical multi-word bitmasks accurately', () => {
		const input = new Uint32Array([0x0f0f0f0f, 0x12345678, 0xa5a5a5a5])
		const actual = notMask32Stable(input)
		assert.ok(actual instanceof Uint32Array)
		assert.deepEqual(actual, new Uint32Array([0xf0f0f0f0, 0xedcba987, 0x5a5a5a5a]))
	})

	test('edge cases: all zeros -> all 0xFFFFFFFF and all 0xFFFFFFFF -> all zeros', () => {
		const zeros = new Uint32Array([0x00000000, 0x00000000, 0x00000000])
		const ones = new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff])

		assert.deepEqual(notMask32Stable(zeros), ones)
		assert.deepEqual(notMask32Stable(ones), zeros)
	})

	test('edge case: high bit 0x80000000 and sign-bit transitions stay unsigned', () => {
		const input = new Uint32Array([0x80000000, 0x7fffffff, 0x00000001, 0xfffffffe])
		const actual = notMask32Stable(input)
		assert.deepEqual(
			actual,
			new Uint32Array([0x7fffffff, 0x80000000, 0xfffffffe, 0x00000001])
		)
		for (const word of actual) {
			assert.ok(word >= 0 && word <= 0xffffffff)
		}
	})

	test('edge case: empty Uint32Array', () => {
		const empty = new Uint32Array(0)
		const outDefault = notMask32Stable(empty)
		const outZero = notMask32Stable(empty, 0)

		assert.ok(outDefault instanceof Uint32Array)
		assert.equal(outDefault.length, 0)
		assert.notEqual(outDefault, empty)

		assert.ok(outZero instanceof Uint32Array)
		assert.equal(outZero.length, 0)
		assert.notEqual(outZero, empty)
	})

	test('defensive immutability: never mutates input or shares backing buffer', () => {
		const backing = new Uint32Array([0x11111111, 0x22222222, 0x33333333, 0x44444444])
		const view = backing.subarray(1, 3)
		const snapshot = new Uint32Array(view)

		const actual = notMask32Stable(view)
		assert.deepEqual(view, snapshot)
		assert.notEqual(actual.buffer, view.buffer)
		assert.deepEqual(actual, new Uint32Array([0xdddddddd, 0xcccccccc]))

		// Mutating output must not affect input
		actual[0] = 0
		assert.deepEqual(view, snapshot)
	})

	test('partial bitLength masks unused high bits and trailing words cleanly', () => {
		const words = new Uint32Array([0x12345678, 0xdeadbeef, 0xffffffff])

		// bitLength = 0 clears all words
		assert.deepEqual(notMask32Stable(words, 0), new Uint32Array([0, 0, 0]))

		// bitLength = 1 (rem = 1)
		assert.deepEqual(notMask32Stable(words, 1), new Uint32Array([0x00000001, 0, 0]))

		// bitLength = 31 (rem = 31, clears sign bit)
		assert.deepEqual(
			notMask32Stable(words, 31),
			new Uint32Array([(~0x12345678 >>> 0) & 0x7fffffff, 0, 0])
		)

		// bitLength = 32 (rem = 0, word boundary)
		assert.deepEqual(
			notMask32Stable(words, 32),
			new Uint32Array([0xedcba987, 0, 0])
		)

		// bitLength = 40 (1 full word + 8 trailing bits, 3rd word zeroed)
		assert.deepEqual(
			notMask32Stable(words, 40),
			new Uint32Array([0xedcba987, 0x00000010, 0])
		)

		// bitLength = 64 (exact 2 words, 3rd word zeroed)
		assert.deepEqual(
			notMask32Stable(words, 64),
			new Uint32Array([0xedcba987, 0x21524110, 0])
		)

		// bitLength = 95 (rem = 31 on last word)
		assert.deepEqual(
			notMask32Stable(words, 95),
			new Uint32Array([0xedcba987, 0x21524110, 0x00000000])
		)

		// bitLength = 96 (full length, rem = 0)
		assert.deepEqual(
			notMask32Stable(words, 96),
			new Uint32Array([0xedcba987, 0x21524110, 0x00000000])
		)
	})

	test('cross-check against independent BigInt complement across every bitLength 0..96', () => {
		const vectors = [
			new Uint32Array([0x00000000, 0x00000000, 0x00000000]),
			new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff]),
			new Uint32Array([0x80000000, 0x7fffffff, 0xdeadbeef]),
			new Uint32Array([0x13579bdf, 0x2468ace0, 0x80000001])
		]

		for (const words of vectors) {
			// Default full-width comparison
			assert.deepEqual(notMask32Stable(words), bigIntNotMask(words))

			// Every possible bitLength from 0 to 96 (exercises rem = 0, 1..31, full boundaries)
			for (let bitLength = 0; bitLength <= words.length * 32; bitLength++) {
				const actual = notMask32Stable(words, bitLength)
				const expected = bigIntNotMask(words, bitLength)
				assert.deepEqual(
					actual,
					expected,
					`BigInt mismatch for bitLength=${bitLength}`
				)
			}
		}
	})

	test('cross-check: double-negation involution not(not(x)) === x', () => {
		// Deterministic pseudo-random uint32 generator (xorshift32)
		let state = 0x6d2b79f5
		const nextU32 = () => {
			state ^= state << 13
			state ^= state >>> 17
			state ^= state << 5
			return state >>> 0
		}

		for (let len = 0; len <= 6; len++) {
			const words = new Uint32Array(len)
			for (let i = 0; i < len; i++) {
				words[i] = nextU32()
			}

			// Full-width involution
			const doubleFull = notMask32Stable(notMask32Stable(words))
			assert.deepEqual(doubleFull, words)

			// Partial bitLength involution (after canonicalizing input to bitLength bits)
			for (const bitLength of [0, 1, 7, 31, 32, 33, 63, 64, len * 32]) {
				if (bitLength > len * 32) continue
				const once = notMask32Stable(words, bitLength)
				const twice = notMask32Stable(once, bitLength)
				const thrice = notMask32Stable(twice, bitLength)

				// Canonical masked input equals twice; involution holds strictly on masked domain
				const expectedCanonical = bigIntToWords(wordsToBigInt(words, bitLength), len)
				assert.deepEqual(twice, expectedCanonical)
				assert.deepEqual(thrice, once)
			}
		}
	})

	test('invalid inputs throw descriptive TypeError or RangeError', () => {
		// Invalid `words` types
		for (const bad of [
			null,
			undefined,
			[0, 1],
			new Int32Array([0]),
			new Uint8Array([0]),
			new Uint16Array([0]),
			'0101',
			42,
			{}
		]) {
			assert.throws(() => notMask32Stable(bad), TypeError)
		}

		const twoWords = new Uint32Array([1, 2])

		// Invalid `bitLength` types
		for (const badType of ['32', null, 32n, true, {}, []]) {
			assert.throws(() => notMask32Stable(twoWords, badType), TypeError)
		}

		// Out-of-range or non-integer `bitLength`
		for (const badRange of [-1, 65, 1.5, NaN, Infinity, -Infinity]) {
			assert.throws(() => notMask32Stable(twoWords, badRange), RangeError)
		}

		// Empty array with positive bitLength
		assert.throws(() => notMask32Stable(new Uint32Array(0), 1), RangeError)
	})
})
