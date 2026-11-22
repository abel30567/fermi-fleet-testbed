import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { xorMask32Iterative } from './xorMask32Iterative.js'

/**
 * Helper: convert a Uint32Array bitmask to a Set of set bit indices.
 * @param {Uint32Array} mask
 * @returns {Set<number>}
 */
function maskToBitSet(mask) {
	const bits = new Set()
	for (let wordIdx = 0; wordIdx < mask.length; wordIdx++) {
		const word = mask[wordIdx]
		for (let bit = 0; bit < 32; bit++) {
			if ((word & (1 << bit)) !== 0) {
				bits.add(wordIdx * 32 + bit)
			}
		}
	}
	return bits
}

/**
 * Helper: convert a Set of bit indices into a Uint32Array bitmask of given word length.
 * @param {Set<number>} bits
 * @param {number} wordCount
 * @returns {Uint32Array}
 */
function bitSetToMask(bits, wordCount) {
	const mask = new Uint32Array(wordCount)
	for (const index of bits) {
		const wordIdx = Math.floor(index / 32)
		const bit = index % 32
		mask[wordIdx] = (mask[wordIdx] | (1 << bit)) >>> 0
	}
	return mask
}

/**
 * Helper: symmetric difference of two Sets: (A \ B) U (B \ A).
 * @param {Set<number>} setA
 * @param {Set<number>} setB
 * @returns {Set<number>}
 */
function setSymmetricDifference(setA, setB) {
	const out = new Set()
	for (const x of setA) {
		if (!setB.has(x)) out.add(x)
	}
	for (const x of setB) {
		if (!setA.has(x)) out.add(x)
	}
	return out
}

/**
 * Deterministic xorshift32 PRNG for reproducible multi-word test vectors.
 * @param {number} seed
 * @returns {() => number}
 */
function createPrng(seed) {
	let state = seed >>> 0
	return () => {
		state ^= (state << 13) >>> 0
		state ^= state >>> 17
		state ^= (state << 5) >>> 0
		return state >>> 0
	}
}

describe('xorMask32Iterative', () => {
	it('handles empty Uint32Arrays', () => {
		const a = new Uint32Array(0)
		const b = new Uint32Array(0)
		const result = xorMask32Iterative(a, b)

		assert.ok(result instanceof Uint32Array)
		assert.equal(result.length, 0)
		assert.notEqual(result, a)
		assert.notEqual(result, b)
	})

	it('computes single-word XOR correctly', () => {
		const a = new Uint32Array([0b11001010])
		const b = new Uint32Array([0b10101100])
		const result = xorMask32Iterative(a, b)

		assert.deepEqual(result, new Uint32Array([0b01100110]))

		const alt1 = new Uint32Array([0x55555555])
		const alt2 = new Uint32Array([0xaaaaaaaa])
		assert.deepEqual(xorMask32Iterative(alt1, alt2), new Uint32Array([0xffffffff]))
	})

	it('computes multi-word XOR correctly', () => {
		const a = new Uint32Array([0x12345678, 0x0000ffff, 0xf0f0f0f0, 0xdeadbeef])
		const b = new Uint32Array([0x87654321, 0xffff0000, 0x0f0f0f0f, 0xcafebabe])
		const expected = new Uint32Array([
			(0x12345678 ^ 0x87654321) >>> 0,
			0xffffffff,
			0xffffffff,
			(0xdeadbeef ^ 0xcafebabe) >>> 0
		])

		assert.deepEqual(xorMask32Iterative(a, b), expected)
	})

	it('handles high-bit patterns (0x80000000 and 0xFFFFFFFF) without signedness issues', () => {
		const a = new Uint32Array([0x80000000, 0x80000000, 0xffffffff, 0xffffffff, 0x7fffffff])
		const b = new Uint32Array([0x00000000, 0x80000000, 0x80000000, 0x00000000, 0x80000000])
		const result = xorMask32Iterative(a, b)

		assert.deepEqual(
			result,
			new Uint32Array([0x80000000, 0x00000000, 0x7fffffff, 0xffffffff, 0xffffffff])
		)
		for (let i = 0; i < result.length; i++) {
			assert.ok(result[i] >= 0 && result[i] <= 0xffffffff)
		}
	})

	it('satisfies algebraic identities: self-cancellation, zero identity, commutativity, associativity, involution', () => {
		const a = new Uint32Array([0x80000001, 0x13579bdf, 0xffffffff, 0x00000000])
		const b = new Uint32Array([0x2468ace0, 0xfedcba98, 0x80000000, 0x01020304])
		const c = new Uint32Array([0x99999999, 0x0f0f0f0f, 0x55555555, 0xaaaaaaaa])
		const zero = new Uint32Array(4)

		// Self-cancellation: xor(a, a) === 0 (same reference and equal copy)
		assert.deepEqual(xorMask32Iterative(a, a), zero)
		assert.deepEqual(xorMask32Iterative(a, new Uint32Array(a)), zero)

		// Identity: xor(a, 0) === a and xor(0, a) === a
		assert.deepEqual(xorMask32Iterative(a, zero), a)
		assert.deepEqual(xorMask32Iterative(zero, a), a)

		// Commutativity: xor(a, b) === xor(b, a)
		assert.deepEqual(xorMask32Iterative(a, b), xorMask32Iterative(b, a))

		// Associativity: xor(xor(a, b), c) === xor(a, xor(b, c))
		assert.deepEqual(
			xorMask32Iterative(xorMask32Iterative(a, b), c),
			xorMask32Iterative(a, xorMask32Iterative(b, c))
		)

		// Involution: xor(xor(a, b), b) === a
		assert.deepEqual(xorMask32Iterative(xorMask32Iterative(a, b), b), a)
	})

	it('does not mutate inputs and returns a fresh Uint32Array (including for subarray views)', () => {
		const a = new Uint32Array([0x11223344, 0x55667788, 0x99aabbcc])
		const b = new Uint32Array([0xffeeddcc, 0xbbaa9988, 0x77665544])
		const aCopy = new Uint32Array(a)
		const bCopy = new Uint32Array(b)

		const result = xorMask32Iterative(a, b)

		assert.notEqual(result, a)
		assert.notEqual(result, b)
		assert.notEqual(result.buffer, a.buffer)
		assert.notEqual(result.buffer, b.buffer)
		assert.deepEqual(a, aCopy)
		assert.deepEqual(b, bCopy)

		// Mutating result does not affect inputs
		result[0] = 0
		assert.deepEqual(a, aCopy)
		assert.deepEqual(b, bCopy)

		// Subarray views
		const backing = new Uint32Array([0xffffffff, 0x80000001, 0x0f0f0f0f, 0xaaaaaaaa])
		const viewA = backing.subarray(0, 2)
		const viewB = backing.subarray(2, 4)
		const subRes = xorMask32Iterative(viewA, viewB)
		assert.deepEqual(
			subRes,
			new Uint32Array([(0xffffffff ^ 0x0f0f0f0f) >>> 0, (0x80000001 ^ 0xaaaaaaaa) >>> 0])
		)
		assert.deepEqual(
			backing,
			new Uint32Array([0xffffffff, 0x80000001, 0x0f0f0f0f, 0xaaaaaaaa])
		)
	})

	it('throws TypeError for non-Uint32Array inputs', () => {
		const valid = new Uint32Array([1, 2])
		const invalidInputs = [
			null,
			undefined,
			[1, 2],
			new Int32Array([1, 2]),
			new Uint16Array([1, 2]),
			new Uint8Array([1, 2]),
			new BigUint64Array([1n, 2n]),
			42,
			'12',
			{ length: 2, 0: 1, 1: 2 }
		]

		for (const bad of invalidInputs) {
			assert.throws(() => xorMask32Iterative(bad, valid), TypeError)
			assert.throws(() => xorMask32Iterative(valid, bad), TypeError)
		}
	})

	it('throws RangeError for mismatched Uint32Array lengths', () => {
		assert.throws(
			() => xorMask32Iterative(new Uint32Array(0), new Uint32Array(1)),
			RangeError
		)
		assert.throws(
			() => xorMask32Iterative(new Uint32Array([1, 2]), new Uint32Array([1, 2, 3])),
			RangeError
		)
		assert.throws(
			() => xorMask32Iterative(new Uint32Array(5), new Uint32Array(2)),
			RangeError
		)
	})

	it('cross-checks against independent bit-index Set symmetric difference and (a | b) & ~(a & b)', () => {
		const nextRand = createPrng(0x20261122)

		for (const wordCount of [1, 2, 5, 16]) {
			for (let trial = 0; trial < 10; trial++) {
				const a = new Uint32Array(wordCount)
				const b = new Uint32Array(wordCount)
				for (let i = 0; i < wordCount; i++) {
					a[i] = nextRand()
					b[i] = nextRand()
				}

				// Ensure boundary bits (0, 31, word transitions) get exercised on trial 0
				if (trial === 0) {
					a[0] = (a[0] | 0x80000001) >>> 0
					b[0] = (b[0] | 0x80000000) >>> 0
					a[wordCount - 1] = 0xffffffff
					b[wordCount - 1] = 0x80000001
				}

				const actual = xorMask32Iterative(a, b)

				// Reference 1: Set symmetric difference of bit indices
				const setA = maskToBitSet(a)
				const setB = maskToBitSet(b)
				const expectedFromSet = bitSetToMask(setSymmetricDifference(setA, setB), wordCount)
				assert.deepEqual(actual, expectedFromSet)

				// Reference 2: Boolean identity (a | b) & ~(a & b)
				const expectedFromIdentity = new Uint32Array(wordCount)
				for (let i = 0; i < wordCount; i++) {
					expectedFromIdentity[i] = ((a[i] | b[i]) & ~(a[i] & b[i])) >>> 0
				}
				assert.deepEqual(actual, expectedFromIdentity)
			}
		}
	})
})
