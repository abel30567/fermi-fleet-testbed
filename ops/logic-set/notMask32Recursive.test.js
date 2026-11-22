import { describe, test } from 'node:test'
import assert from 'node:assert'
import { notMask32Recursive } from './notMask32Recursive.js'

/**
 * Independent BigInt reference implementation for bitwise NOT over a Uint32Array bitmask.
 * Packs words into a single non-negative BigInt (word i occupies bits [32*i, 32*i + 31]),
 * computes the complement within the exact `32 * words.length` bit width, and unpacks.
 *
 * @param {Uint32Array} words
 * @returns {Uint32Array}
 */
function notMaskBigIntReference(words) {
	const len = words.length
	if (len === 0) {
		return new Uint32Array(0)
	}

	let packed = 0n
	for (let i = len - 1; i >= 0; i--) {
		packed = (packed << 32n) | BigInt(words[i])
	}

	const totalBits = 32n * BigInt(len)
	const fullMask = (1n << totalBits) - 1n
	const inverted = (~packed) & fullMask

	const out = new Uint32Array(len)
	let rem = inverted
	for (let i = 0; i < len; i++) {
		out[i] = Number(rem & 0xffffffffn)
		rem >>= 32n
	}
	return out
}

/**
 * Deterministic xorshift32 PRNG for reproducible bitmask generation.
 *
 * @param {number} seed
 * @param {number} length
 * @returns {Uint32Array}
 */
function deterministicWords(seed, length) {
	const out = new Uint32Array(length)
	let x = seed >>> 0 || 0x9e3779b9
	for (let i = 0; i < length; i++) {
		x ^= (x << 13) >>> 0
		x ^= x >>> 17
		x ^= (x << 5) >>> 0
		out[i] = x >>> 0
	}
	return out
}

describe('notMask32Recursive', () => {
	test('inverts standard multi-word bitmasks with unsigned 32-bit semantics', () => {
		const input = new Uint32Array([
			0x00000000,
			0xffffffff,
			0xaaaaaaaa,
			0x55555555,
			0x12345678,
			0xf0f00f0f,
		])
		const expected = new Uint32Array([
			0xffffffff,
			0x00000000,
			0x55555555,
			0xaaaaaaaa,
			0xedcba987,
			0x0f0ff0f0,
		])

		const actual = notMask32Recursive(input)
		assert.ok(actual instanceof Uint32Array)
		assert.deepStrictEqual(actual, expected)
	})

	test('handles empty Uint32Array', () => {
		const input = new Uint32Array(0)
		const actual = notMask32Recursive(input)
		assert.ok(actual instanceof Uint32Array)
		assert.strictEqual(actual.length, 0)
		assert.notStrictEqual(actual, input)
	})

	test('handles single-word edge cases including 0, 0xffffffff, and sign-bit boundaries', () => {
		const cases = [
			[0x00000000, 0xffffffff],
			[0xffffffff, 0x00000000],
			[0x80000000, 0x7fffffff],
			[0x7fffffff, 0x80000000],
			[0x00000001, 0xfffffffe],
			[0xfffffffe, 0x00000001],
		]

		for (const [word, expectedWord] of cases) {
			const actual = notMask32Recursive(new Uint32Array([word]))
			assert.strictEqual(actual.length, 1)
			assert.strictEqual(actual[0], expectedWord)
			assert.ok(actual[0] >= 0 && actual[0] <= 0xffffffff)
		}
	})

	test('handles odd, even, and power-of-two lengths', () => {
		const lengths = [1, 2, 3, 4, 5, 7, 8, 9, 15, 16, 17, 31, 32, 33, 64, 127]
		for (const len of lengths) {
			const input = deterministicWords(0x13579bdf + len, len)
			const actual = notMask32Recursive(input)
			assert.strictEqual(actual.length, len)
			for (let i = 0; i < len; i++) {
				assert.strictEqual(actual[i], (~input[i]) >>> 0)
			}
		}
	})

	test('satisfies double negation involution: NOT(NOT(x)) === x', () => {
		const lengths = [0, 1, 2, 3, 5, 8, 13, 64]
		for (const len of lengths) {
			const input = deterministicWords(0x2468ace1 + len, len)
			const once = notMask32Recursive(input)
			const twice = notMask32Recursive(once)
			assert.deepStrictEqual(twice, input)
		}
	})

	test('does not mutate input and returns a new Uint32Array with its own buffer', () => {
		const input = new Uint32Array([0x01234567, 0x89abcdef, 0xdeadbeef, 0xcafebabe])
		const snapshot = new Uint32Array(input)

		const actual = notMask32Recursive(input)
		assert.deepStrictEqual(input, snapshot)
		assert.notStrictEqual(actual, input)
		assert.notStrictEqual(actual.buffer, input.buffer)

		actual[0] = 0
		assert.deepStrictEqual(input, snapshot)
	})

	test('works correctly on Uint32Array subarrays with non-zero byteOffset', () => {
		const backing = new Uint32Array([0x11111111, 0x00000000, 0x0f0f0f0f, 0xffffffff, 0x22222222])
		const backingSnapshot = new Uint32Array(backing)
		const view = backing.subarray(1, 4)

		const actual = notMask32Recursive(view)
		assert.deepStrictEqual(actual, new Uint32Array([0xffffffff, 0xf0f0f0f0, 0x00000000]))
		assert.deepStrictEqual(backing, backingSnapshot)
	})

	test('throws TypeError for invalid non-Uint32Array inputs', () => {
		const invalidInputs = [
			undefined,
			null,
			0,
			42,
			'0xffffffff',
			true,
			{},
			{ length: 2, 0: 1, 1: 2 },
			[0, 1, 2],
			new ArrayBuffer(16),
			new Int32Array([1, 2, 3]),
			new Uint8Array([1, 2, 3, 4]),
			new Uint16Array([1, 2]),
			new Float32Array([1, 2]),
			new BigUint64Array([1n, 2n]),
		]

		for (const bad of invalidInputs) {
			assert.throws(() => notMask32Recursive(bad), {
				name: 'TypeError',
			})
		}
	})

	test('matches independent BigInt bitmask computation across varied lengths', () => {
		const lengths = [0, 1, 2, 3, 4, 7, 15, 16, 31, 64, 100]
		for (const len of lengths) {
			const input = deterministicWords(0xabcdef01 + len * 17, len)
			const actual = notMask32Recursive(input)
			const expected = notMaskBigIntReference(input)
			assert.deepStrictEqual(actual, expected)
		}
	})
})
