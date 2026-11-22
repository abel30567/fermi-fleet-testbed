import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { notMask32Iterative } from './notMask32Iterative.js'

/**
 * Independent reference: extracts the Set of set bit indices in [0, 32 * mask.length).
 *
 * @param {Uint32Array} mask
 * @returns {Set<number>}
 */
function maskToBitIndexSet(mask) {
	const bits = new Set()
	for (let wordIdx = 0; wordIdx < mask.length; wordIdx++) {
		const word = mask[wordIdx]
		for (let bitOffset = 0; bitOffset < 32; bitOffset++) {
			if (((word >>> bitOffset) & 1) === 1) {
				bits.add(wordIdx * 32 + bitOffset)
			}
		}
	}
	return bits
}

/**
 * Independent reference: builds a Uint32Array of `wordCount` words from a Set of bit indices.
 *
 * @param {Set<number>} bits
 * @param {number} wordCount
 * @returns {Uint32Array}
 */
function bitIndexSetToMask(bits, wordCount) {
	const mask = new Uint32Array(wordCount)
	for (const bitIdx of bits) {
		const wordIdx = Math.floor(bitIdx / 32)
		const bitOffset = bitIdx % 32
		mask[wordIdx] = (mask[wordIdx] | (1 << bitOffset)) >>> 0
	}
	return mask
}

/**
 * Deterministic xorshift32 PRNG for reproducible test vectors.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
	let state = seed >>> 0
	return () => {
		state ^= (state << 13) >>> 0
		state ^= state >>> 17
		state ^= (state << 5) >>> 0
		return state >>> 0
	}
}

describe('notMask32Iterative', () => {
	test('handles empty Uint32Array', () => {
		const input = new Uint32Array(0)
		const output = notMask32Iterative(input)

		assert.ok(output instanceof Uint32Array)
		assert.equal(output.length, 0)
		assert.notEqual(output, input)
		assert.deepEqual(output, new Uint32Array(0))
	})

	test('inverts single-word boundary patterns 0x00000000 <-> 0xFFFFFFFF', () => {
		const zeros = new Uint32Array([0x00000000])
		const ones = new Uint32Array([0xffffffff])

		assert.deepEqual(notMask32Iterative(zeros), ones)
		assert.deepEqual(notMask32Iterative(ones), zeros)
	})

	test('inverts high-bit and alternating bit patterns accurately', () => {
		assert.deepEqual(
			notMask32Iterative(new Uint32Array([0x80000000])),
			new Uint32Array([0x7fffffff])
		)
		assert.deepEqual(
			notMask32Iterative(new Uint32Array([0x7fffffff])),
			new Uint32Array([0x80000000])
		)
		assert.deepEqual(
			notMask32Iterative(new Uint32Array([0xaaaaaaaa])),
			new Uint32Array([0x55555555])
		)
		assert.deepEqual(
			notMask32Iterative(new Uint32Array([0x55555555])),
			new Uint32Array([0xaaaaaaaa])
		)
		assert.deepEqual(
			notMask32Iterative(new Uint32Array([0x80000001])),
			new Uint32Array([0x7ffffffe])
		)
		assert.deepEqual(
			notMask32Iterative(new Uint32Array([0x00000001])),
			new Uint32Array([0xfffffffe])
		)
	})

	test('inverts multi-word Uint32Array bitmasks', () => {
		const input = new Uint32Array([
			0x00000000,
			0xffffffff,
			0x80000000,
			0xaaaaaaaa,
			0x55555555,
			0x12345678,
			0xdeadbeef
		])
		const expected = new Uint32Array([
			0xffffffff,
			0x00000000,
			0x7fffffff,
			0x55555555,
			0xaaaaaaaa,
			0xedcba987,
			0x21524110
		])

		const actual = notMask32Iterative(input)
		assert.ok(actual instanceof Uint32Array)
		assert.deepEqual(actual, expected)
	})

	test('works properly on subarray views without mutating underlying buffer', () => {
		const backing = new Uint32Array([0x11111111, 0x80000000, 0xaaaaaaaa, 0x22222222])
		const view = backing.subarray(1, 3)

		const output = notMask32Iterative(view)
		assert.deepEqual(output, new Uint32Array([0x7fffffff, 0x55555555]))
		assert.deepEqual(
			backing,
			new Uint32Array([0x11111111, 0x80000000, 0xaaaaaaaa, 0x22222222])
		)
	})

	test('does not mutate input and returns an independent Uint32Array', () => {
		const input = new Uint32Array([0x0f0f0f0f, 0x80000001, 0x13579bdf])
		const snapshot = new Uint32Array(input)

		const output = notMask32Iterative(input)
		assert.notEqual(output, input)
		assert.notEqual(output.buffer, input.buffer)
		assert.deepEqual(input, snapshot)

		output[0] = 0x12345678
		assert.deepEqual(input, snapshot)
	})

	test('throws TypeError on invalid inputs', () => {
		const invalidInputs = [
			undefined,
			null,
			0,
			42,
			NaN,
			'0xffffffff',
			true,
			false,
			{},
			{ length: 1, 0: 0 },
			[],
			[0, 1, 2],
			new Int32Array([0, -1]),
			new Uint8Array([0, 255]),
			new Uint16Array([0, 65535]),
			new Float32Array([0, 1]),
			new BigUint64Array([0n]),
			new ArrayBuffer(8)
		]

		assert.throws(() => notMask32Iterative(), TypeError)

		for (const bad of invalidInputs) {
			assert.throws(
				() => notMask32Iterative(bad),
				TypeError,
				`Expected TypeError for input: ${String(bad)}`
			)
		}
	})

	test('satisfies involution identity not(not(a)) === a and complement laws', () => {
		const rng = createRng(0xcafebabe)
		const lengths = [0, 1, 2, 4, 9, 32]

		for (const len of lengths) {
			const a = new Uint32Array(len)
			for (let i = 0; i < len; i++) {
				a[i] = rng()
			}

			const notA = notMask32Iterative(a)
			const notNotA = notMask32Iterative(notA)

			assert.deepEqual(notNotA, a)

			for (let i = 0; i < len; i++) {
				assert.equal((a[i] & notA[i]) >>> 0, 0x00000000)
				assert.equal((a[i] | notA[i]) >>> 0, 0xffffffff)
				assert.equal((a[i] ^ notA[i]) >>> 0, 0xffffffff)
				assert.equal(a[i] + notA[i], 0xffffffff)
			}
		}
	})

	test('cross-checks against independent bit-by-bit complement over [0, 32 * a.length)', () => {
		const rng = createRng(0x13572468)
		const lengths = [0, 1, 2, 3, 5, 11]

		for (const len of lengths) {
			const a = new Uint32Array(len)
			for (let i = 0; i < len; i++) {
				a[i] = rng()
			}

			const actual = notMask32Iterative(a)
			const totalBits = 32 * len

			const inputBits = maskToBitIndexSet(a)
			const expectedComplementBits = new Set()
			for (let bitIdx = 0; bitIdx < totalBits; bitIdx++) {
				if (!inputBits.has(bitIdx)) {
					expectedComplementBits.add(bitIdx)
				}
			}

			const actualBits = maskToBitIndexSet(actual)
			assert.equal(actualBits.size, expectedComplementBits.size)
			assert.equal(actualBits.size + inputBits.size, totalBits)
			assert.deepEqual(actualBits, expectedComplementBits)

			const reconstructed = bitIndexSetToMask(expectedComplementBits, len)
			assert.deepEqual(actual, reconstructed)
		}
	})
})
