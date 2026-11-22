import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { unionMask32Iterative } from './unionMask32Iterative.js'

/**
 * Extracts the set of bit indices (0-based) set to 1 in a Uint32Array bitmask.
 * @param {Uint32Array} mask
 * @returns {Set<number>}
 */
function maskToBitSet(mask) {
	const bits = new Set()
	for (let w = 0; w < mask.length; w++) {
		const word = mask[w]
		for (let b = 0; b < 32; b++) {
			if (((word >>> b) & 1) === 1) {
				bits.add(w * 32 + b)
			}
		}
	}
	return bits
}

/**
 * Builds a Uint32Array bitmask of given wordLength from a Set of bit indices.
 * @param {Set<number>} bits
 * @param {number} wordLength
 * @returns {Uint32Array}
 */
function bitSetToMask(bits, wordLength) {
	const mask = new Uint32Array(wordLength)
	for (const bit of bits) {
		const w = Math.floor(bit / 32)
		const b = bit % 32
		mask[w] = (mask[w] | (1 << b)) >>> 0
	}
	return mask
}

/**
 * Deterministic xorshift32 PRNG for reproducible property tests.
 * @param {number} seed
 */
function createRng(seed) {
	let state = seed >>> 0
	return () => {
		state ^= state << 13
		state ^= state >>> 17
		state ^= state << 5
		return state >>> 0
	}
}

describe('unionMask32Iterative', () => {
	test('handles empty bitmasks', () => {
		const emptyA = new Uint32Array(0)
		const emptyB = new Uint32Array(0)
		const resBothEmpty = unionMask32Iterative(emptyA, emptyB)
		assert.ok(resBothEmpty instanceof Uint32Array)
		assert.equal(resBothEmpty.length, 0)
		assert.notEqual(resBothEmpty, emptyA)
		assert.notEqual(resBothEmpty, emptyB)

		const nonEmpty = new Uint32Array([0x12345678, 0x80000001])
		const resLeftEmpty = unionMask32Iterative(emptyA, nonEmpty)
		const resRightEmpty = unionMask32Iterative(nonEmpty, emptyB)
		assert.deepEqual(resLeftEmpty, nonEmpty)
		assert.deepEqual(resRightEmpty, nonEmpty)
		assert.notEqual(resLeftEmpty, nonEmpty)
		assert.notEqual(resRightEmpty, nonEmpty)
	})

	test('computes union of equal-length bitmasks (disjoint, overlapping, identical)', () => {
		// Disjoint
		const d1 = new Uint32Array([0x0f0f0f0f, 0x00ff00ff, 0x0000ffff])
		const d2 = new Uint32Array([0xf0f0f0f0, 0xff00ff00, 0xffff0000])
		assert.deepEqual(
			unionMask32Iterative(d1, d2),
			new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff])
		)

		// Overlapping
		const o1 = new Uint32Array([0b10110010, 0x12345678])
		const o2 = new Uint32Array([0b01101010, 0x0f0f0f0f])
		assert.deepEqual(
			unionMask32Iterative(o1, o2),
			new Uint32Array([0b11111010, 0x1f3f5f7f])
		)

		// Identical
		const same = new Uint32Array([0xdeadbeef, 0x00c0ffee])
		assert.deepEqual(unionMask32Iterative(same, new Uint32Array(same)), same)
	})

	test('supports variable-length bitmasks by treating missing trailing words as 0', () => {
		const shortMask = new Uint32Array([0x0000000f])
		const longMask = new Uint32Array([0x000000f0, 0x80000000, 0x00000000, 0x00000001])

		const res1 = unionMask32Iterative(shortMask, longMask)
		assert.equal(res1.length, 4)
		assert.deepEqual(res1, new Uint32Array([0x000000ff, 0x80000000, 0x00000000, 0x00000001]))

		const res2 = unionMask32Iterative(longMask, shortMask)
		assert.equal(res2.length, 4)
		assert.deepEqual(res2, new Uint32Array([0x000000ff, 0x80000000, 0x00000000, 0x00000001]))
	})

	test('handles high-bit unsigned 32-bit words without sign issues', () => {
		const a = new Uint32Array([0x80000000, 0x7fffffff, 0xffffffff, 0xaaaaaaaa])
		const b = new Uint32Array([0x00000001, 0x80000000, 0x00000000, 0x55555555])

		const res = unionMask32Iterative(a, b)
		assert.deepEqual(
			res,
			new Uint32Array([0x80000001, 0xffffffff, 0xffffffff, 0xffffffff])
		)
		assert.equal(res[0], 2147483649)
		assert.equal(res[1], 4294967295)
	})

	test('satisfies commutativity, associativity, idempotence, and identity/absorbing laws', () => {
		const a = new Uint32Array([0x80000011, 0x00ff0000])
		const b = new Uint32Array([0x00000110, 0x0000ff00, 0x80000000])
		const c = new Uint32Array([0x40000000, 0x12345678, 0x00000001, 0xffffffff])
		const zero = new Uint32Array([0, 0, 0])
		const allOnes = new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff])

		// Commutativity
		assert.deepEqual(unionMask32Iterative(a, b), unionMask32Iterative(b, a))
		assert.deepEqual(unionMask32Iterative(b, c), unionMask32Iterative(c, b))

		// Associativity
		assert.deepEqual(
			unionMask32Iterative(unionMask32Iterative(a, b), c),
			unionMask32Iterative(a, unionMask32Iterative(b, c))
		)

		// Idempotence
		assert.deepEqual(unionMask32Iterative(a, a), a)
		assert.deepEqual(unionMask32Iterative(c, c), c)

		// Identity with zero mask
		assert.deepEqual(unionMask32Iterative(b, zero), b)
		assert.deepEqual(unionMask32Iterative(zero, b), b)

		// Absorbing element (all-ones)
		assert.deepEqual(unionMask32Iterative(b, allOnes), allOnes)
		assert.deepEqual(unionMask32Iterative(allOnes, b), allOnes)
	})

	test('preserves immutability and handles shared ArrayBuffer subarray views', () => {
		const a = new Uint32Array([0x0000ffff, 0x0f0f0f0f])
		const b = new Uint32Array([0xffff0000, 0xf0f0f0f0])
		const aSnap = new Uint32Array(a)
		const bSnap = new Uint32Array(b)

		const res = unionMask32Iterative(a, b)
		assert.notEqual(res, a)
		assert.notEqual(res, b)
		assert.deepEqual(a, aSnap)
		assert.deepEqual(b, bSnap)

		// Mutating result does not mutate inputs
		res[0] = 0
		assert.deepEqual(a, aSnap)
		assert.deepEqual(b, bSnap)

		// Same reference passed twice still returns a fresh copy
		const selfRes = unionMask32Iterative(a, a)
		assert.notEqual(selfRes, a)
		assert.deepEqual(selfRes, a)

		// Overlapping subarray views of the same ArrayBuffer
		const backing = new Uint32Array([0x00000001, 0x00000010, 0x00000100, 0x00001000])
		const view1 = backing.subarray(0, 3)
		const view2 = backing.subarray(1, 4)
		const viewUnion = unionMask32Iterative(view1, view2)
		assert.deepEqual(viewUnion, new Uint32Array([0x00000011, 0x00000110, 0x00001100]))
		assert.deepEqual(backing, new Uint32Array([0x00000001, 0x00000010, 0x00000100, 0x00001000]))
	})

	test('throws TypeError on invalid inputs', () => {
		const valid = new Uint32Array([1, 2])
		const invalidValues = [
			undefined,
			null,
			42,
			'123',
			{},
			[1, 2],
			new Int32Array([1, 2]),
			new Uint8Array([1, 2]),
			new Uint16Array([1, 2]),
			new BigUint64Array([1n, 2n]),
			new ArrayBuffer(8)
		]

		for (const bad of invalidValues) {
			assert.throws(() => unionMask32Iterative(bad, valid), TypeError)
			assert.throws(() => unionMask32Iterative(valid, bad), TypeError)
		}

		assert.throws(() => unionMask32Iterative(), TypeError)
		assert.throws(() => unionMask32Iterative(valid), TypeError)
	})

	test('cross-checks against independent Set<number> bit-index union reference', () => {
		const nextRand = createRng(0x5eed1234)

		// Explicit boundary bit indices (word edges: 0, 31, 32, 63, 64, 95, 96, 127)
		const edgeSetA = new Set([0, 31, 32, 63, 95])
		const edgeSetB = new Set([0, 1, 32, 64, 96, 127])
		const edgeMaskA = bitSetToMask(edgeSetA, 3)
		const edgeMaskB = bitSetToMask(edgeSetB, 4)
		const edgeUnion = unionMask32Iterative(edgeMaskA, edgeMaskB)
		assert.equal(edgeUnion.length, 4)
		assert.deepEqual(maskToBitSet(edgeUnion), new Set([...edgeSetA, ...edgeSetB]))

		// Randomized trials across varying lengths (0..8 words) and word patterns
		for (let trial = 0; trial < 100; trial++) {
			const lenA = nextRand() % 9
			const lenB = nextRand() % 9
			const maskA = new Uint32Array(lenA)
			const maskB = new Uint32Array(lenB)

			for (let i = 0; i < lenA; i++) {
				maskA[i] = nextRand()
			}
			for (let i = 0; i < lenB; i++) {
				maskB[i] = nextRand()
			}

			const actual = unionMask32Iterative(maskA, maskB)
			assert.equal(actual.length, Math.max(lenA, lenB))

			const refUnion = new Set([...maskToBitSet(maskA), ...maskToBitSet(maskB)])
			const actualBits = maskToBitSet(actual)
			assert.deepEqual(actualBits, refUnion)
		}
	})
})
