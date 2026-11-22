import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { notMask32Series } from './notMask32Series.js'

/**
 * Independent bit-by-bit naive reference implementation for cross-checking.
 */
function naiveBitByBitNot(mask, bitLength = mask.length * 32) {
	const out = new Uint32Array(mask.length)
	for (let bit = 0; bit < bitLength; bit++) {
		const wordIdx = Math.floor(bit / 32)
		const bitOffset = bit % 32
		const isSet = ((mask[wordIdx] >>> bitOffset) & 1) === 1
		if (!isSet) {
			out[wordIdx] = (out[wordIdx] | (1 << bitOffset)) >>> 0
		}
	}
	return out
}

/**
 * Count set bits in a Uint32Array for complement cardinality checks.
 */
function popcount32Array(arr) {
	let count = 0
	for (let i = 0; i < arr.length; i++) {
		let w = arr[i]
		while (w !== 0) {
			w = (w & (w - 1)) >>> 0
			count++
		}
	}
	return count
}

describe('notMask32Series', () => {
	it('computes full 32-bit word complements for normal and boundary patterns', () => {
		const input = new Uint32Array([
			0x00000000,
			0xffffffff,
			0xaaaaaaaa,
			0x55555555,
			0x80000000,
			0x7fffffff,
			0x00000001,
			0xfffffffe,
			0x12345678,
			0xdeadbeef
		])
		const snapshot = new Uint32Array(input)
		const result = notMask32Series(input)

		assert.ok(result instanceof Uint32Array)
		assert.notEqual(result, input)
		assert.deepEqual(input, snapshot, 'input Uint32Array must not be mutated')
		assert.deepEqual(
			result,
			new Uint32Array([
				0xffffffff,
				0x00000000,
				0x55555555,
				0xaaaaaaaa,
				0x7fffffff,
				0x80000000,
				0xfffffffe,
				0x00000001,
				0xedcba987,
				0x21524110
			])
		)
	})

	it('handles empty Uint32Array and subarray views', () => {
		const empty = new Uint32Array(0)
		const emptyOut = notMask32Series(empty)
		assert.ok(emptyOut instanceof Uint32Array)
		assert.notEqual(emptyOut, empty)
		assert.equal(emptyOut.length, 0)
		assert.deepEqual(notMask32Series(empty, 0), new Uint32Array(0))

		const backing = new Uint32Array([0x11111111, 0x0f0f0f0f, 0xf0f0f0f0, 0x22222222])
		const view = backing.subarray(1, 3)
		const viewOut = notMask32Series(view)
		assert.deepEqual(viewOut, new Uint32Array([0xf0f0f0f0, 0x0f0f0f0f]))
		assert.deepEqual(
			backing,
			new Uint32Array([0x11111111, 0x0f0f0f0f, 0xf0f0f0f0, 0x22222222])
		)
	})

	it('supports optional bitLength across word boundaries and clears excess bits', () => {
		const input = new Uint32Array([0xffffffff, 0x00000000, 0xaaaaaaaa])

		assert.deepEqual(notMask32Series(input, 0), new Uint32Array([0, 0, 0]))
		assert.deepEqual(
			notMask32Series(new Uint32Array([0x00000000, 0xffffffff]), 1),
			new Uint32Array([0x00000001, 0x00000000])
		)
		assert.deepEqual(
			notMask32Series(new Uint32Array([0x80000000]), 31),
			new Uint32Array([0x7fffffff])
		)
		assert.deepEqual(
			notMask32Series(new Uint32Array([0x00000000, 0xffffffff]), 32),
			new Uint32Array([0xffffffff, 0x00000000])
		)
		assert.deepEqual(
			notMask32Series(new Uint32Array([0x00000000, 0xfffffffe]), 33),
			new Uint32Array([0xffffffff, 0x00000001])
		)
		assert.deepEqual(
			notMask32Series(input, 72),
			new Uint32Array([0x00000000, 0xffffffff, 0x00000055])
		)
		assert.deepEqual(notMask32Series(input, 96), notMask32Series(input))
	})

	it('cross-checks against direct (~a[i]) >>> 0, XOR identity, and bit-by-bit naive reference', () => {
		// Deterministic xorshift32 PRNG for reproducible coverage across 256 words
		let state = 0x9e3779b9
		const words = new Uint32Array(256)
		for (let i = 0; i < words.length; i++) {
			state ^= (state << 13) >>> 0
			state ^= state >>> 17
			state ^= (state << 5) >>> 0
			words[i] = state >>> 0
		}

		const result = notMask32Series(words)
		const directNot = new Uint32Array(words.length)
		const xorNot = new Uint32Array(words.length)
		for (let i = 0; i < words.length; i++) {
			directNot[i] = (~words[i]) >>> 0
			xorNot[i] = (words[i] ^ 0xffffffff) >>> 0
		}

		assert.deepEqual(result, directNot)
		assert.deepEqual(result, xorNot)

		// Cross-check partial bitLengths against independent bit-by-bit reference
		const sample = words.subarray(0, 4)
		for (const bitLength of [0, 1, 7, 16, 31, 32, 33, 47, 63, 64, 65, 95, 96, 127, 128]) {
			const actual = notMask32Series(sample, bitLength)
			const expected = naiveBitByBitNot(sample, bitLength)
			assert.deepEqual(actual, expected, `mismatch for bitLength=${bitLength}`)
		}
	})

	it('satisfies involution, complementation, cardinality, and De Morgan identities', () => {
		const a = new Uint32Array([0x01234567, 0x89abcdef, 0x00ff00ff, 0xf00f0ff0])
		const b = new Uint32Array([0x76543210, 0xfedcba98, 0x0f0f0f0f, 0x3333cccc])

		// Double-negation involution: not(not(a)) === a
		const notA = notMask32Series(a)
		const notNotA = notMask32Series(notA)
		assert.deepEqual(notNotA, a)

		// Involution on restricted universe bitLength
		for (const bitLength of [0, 1, 19, 31, 32, 50, 96, 127, 128]) {
			const maskedNot1 = notMask32Series(a, bitLength)
			const maskedNot2 = notMask32Series(maskedNot1, bitLength)
			const maskedNot3 = notMask32Series(maskedNot2, bitLength)
			assert.deepEqual(maskedNot3, maskedNot1)
			assert.equal(popcount32Array(maskedNot1) + popcount32Array(maskedNot2), bitLength)
		}

		// Complement partition: a & not(a) === 0 and a | not(a) === 0xFFFFFFFF
		for (let i = 0; i < a.length; i++) {
			assert.equal((a[i] & notA[i]) >>> 0, 0)
			assert.equal((a[i] | notA[i]) >>> 0, 0xffffffff)
		}

		// De Morgan's laws: not(a & b) === not(a) | not(b) and not(a | b) === not(a) & not(b)
		const notB = notMask32Series(b)
		const aAndB = new Uint32Array(a.length)
		const aOrB = new Uint32Array(a.length)
		const notAOrNotB = new Uint32Array(a.length)
		const notAAndNotB = new Uint32Array(a.length)
		for (let i = 0; i < a.length; i++) {
			aAndB[i] = (a[i] & b[i]) >>> 0
			aOrB[i] = (a[i] | b[i]) >>> 0
			notAOrNotB[i] = (notA[i] | notB[i]) >>> 0
			notAAndNotB[i] = (notA[i] & notB[i]) >>> 0
		}
		assert.deepEqual(notMask32Series(aAndB), notAOrNotB)
		assert.deepEqual(notMask32Series(aOrB), notAAndNotB)
	})

	it('throws TypeError or RangeError on invalid inputs', () => {
		const invalidMasks = [
			null,
			undefined,
			[0, 1],
			new Int32Array([0]),
			new Uint8Array([0]),
			new Uint16Array([0]),
			new BigUint64Array([0n]),
			42,
			'mask',
			{}
		]
		for (const bad of invalidMasks) {
			assert.throws(() => notMask32Series(bad), TypeError)
		}

		const valid = new Uint32Array([1, 2])
		for (const badType of [null, '32', 32n, true, {}]) {
			assert.throws(() => notMask32Series(valid, badType), TypeError)
		}

		for (const badRange of [-1, -32, 1.5, NaN, Infinity, -Infinity, 65, 100]) {
			assert.throws(() => notMask32Series(valid, badRange), RangeError)
		}

		assert.throws(() => notMask32Series(new Uint32Array(0), 1), RangeError)
	})
})
