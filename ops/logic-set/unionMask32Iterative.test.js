import { describe, test } from 'node:test'
import assert from 'node:assert'
import { unionMask32Iterative } from './unionMask32Iterative.js'

/**
 * Converts a Uint32Array bitmask into a JS Set of set bit indices.
 *
 * @param {Uint32Array} mask
 * @returns {Set<number>}
 */
function maskToBitSet(mask) {
	const bits = new Set()
	for (let wordIdx = 0; wordIdx < mask.length; wordIdx += 1) {
		const word = mask[wordIdx] >>> 0
		for (let bit = 0; bit < 32; bit += 1) {
			if (((word >>> bit) & 1) === 1) {
				bits.add(wordIdx * 32 + bit)
			}
		}
	}
	return bits
}

/**
 * Converts a JS Set of non-negative bit indices into a Uint32Array bitmask.
 *
 * @param {Set<number>} bits
 * @param {number} wordCount
 * @returns {Uint32Array}
 */
function bitSetToMask(bits, wordCount) {
	const mask = new Uint32Array(wordCount)
	for (const idx of bits) {
		const wordIdx = Math.floor(idx / 32)
		const bit = idx % 32
		mask[wordIdx] = (mask[wordIdx] | (1 << bit)) >>> 0
	}
	return mask
}

describe('unionMask32Iterative', () => {
	test('computes union for normal overlapping multi-word bitmasks', () => {
		const a = new Uint32Array([0b1010_0101, 0x0f0f0f0f, 0x12345678])
		const b = new Uint32Array([0b1100_0011, 0xf0f000ff, 0x00ff00ff])
		const out = unionMask32Iterative(a, b)

		assert.ok(out instanceof Uint32Array)
		assert.deepStrictEqual(
			out,
			new Uint32Array([0b1110_0111, 0xffff0fff, 0x12ff56ff]),
		)
	})

	test('handles empty sets (zero-length and all-zero masks)', () => {
		const empty = new Uint32Array(0)
		const nonEmpty = new Uint32Array([0x00000001, 0x00000010])
		const zeros = new Uint32Array([0, 0])

		assert.deepStrictEqual(unionMask32Iterative(empty, empty), new Uint32Array(0))
		assert.deepStrictEqual(unionMask32Iterative(empty, nonEmpty), nonEmpty)
		assert.deepStrictEqual(unionMask32Iterative(nonEmpty, empty), nonEmpty)
		assert.deepStrictEqual(unionMask32Iterative(zeros, nonEmpty), nonEmpty)
		assert.deepStrictEqual(unionMask32Iterative(zeros, zeros), zeros)
	})

	test('handles disjoint sets', () => {
		const a = new Uint32Array([0x55555555, 0x0000ffff, 0x00000000])
		const b = new Uint32Array([0xaaaaaaaa, 0xffff0000, 0x01020408])
		const out = unionMask32Iterative(a, b)

		assert.deepStrictEqual(
			out,
			new Uint32Array([0xffffffff, 0xffffffff, 0x01020408]),
		)
	})

	test('handles identical sets and satisfies idempotence, commutativity, and associativity', () => {
		const a = new Uint32Array([0xdeadbeef, 0x00c0ffee])
		const b = new Uint32Array([0x13579bdf, 0x2468ace0])
		const c = new Uint32Array([0x80000001, 0x7ffffffe, 0x00000004])

		assert.deepStrictEqual(unionMask32Iterative(a, a), a)
		assert.deepStrictEqual(
			unionMask32Iterative(a, b),
			unionMask32Iterative(b, a),
		)
		assert.deepStrictEqual(
			unionMask32Iterative(unionMask32Iterative(a, b), c),
			unionMask32Iterative(a, unionMask32Iterative(b, c)),
		)
	})

	test('preserves high bit 0x80000000 and full unsigned 32-bit range', () => {
		const highOnly = new Uint32Array([0x80000000, 0x80000000])
		const lowBits = new Uint32Array([0x00000001, 0x7fffffff])
		const out = unionMask32Iterative(highOnly, lowBits)

		assert.strictEqual(out[0], 0x80000001)
		assert.strictEqual(out[1], 0xffffffff)

		const highWithZero = unionMask32Iterative(
			new Uint32Array([0x80000000]),
			new Uint32Array([0x00000000]),
		)
		assert.strictEqual(highWithZero[0], 0x80000000)
	})

	test('handles masks of different lengths by zero-extending the shorter mask', () => {
		const shorter = new Uint32Array([0x0000000f])
		const longer = new Uint32Array([0x000000f0, 0x80000000, 0x00000001])

		const expected = new Uint32Array([0x000000ff, 0x80000000, 0x00000001])
		assert.deepStrictEqual(unionMask32Iterative(shorter, longer), expected)
		assert.deepStrictEqual(unionMask32Iterative(longer, shorter), expected)
	})

	test('works properly on Uint32Array subarray views with non-zero byteOffset', () => {
		const backing = new Uint32Array([0xffffffff, 0x00000003, 0x80000000, 0x0000000c, 0x00000001])
		const viewA = backing.subarray(1, 3)
		const viewB = backing.subarray(3, 5)

		assert.deepStrictEqual(
			unionMask32Iterative(viewA, viewB),
			new Uint32Array([0x0000000f, 0x80000001]),
		)
	})

	test('does not mutate inputs and returns a fresh Uint32Array', () => {
		const a = new Uint32Array([0x00000005, 0x80000000])
		const b = new Uint32Array([0x0000000a])
		const snapshotA = new Uint32Array(a)
		const snapshotB = new Uint32Array(b)

		const out = unionMask32Iterative(a, b)
		assert.notStrictEqual(out, a)
		assert.notStrictEqual(out, b)
		assert.deepStrictEqual(a, snapshotA)
		assert.deepStrictEqual(b, snapshotB)

		out[0] = 0
		out[1] = 0
		assert.deepStrictEqual(a, snapshotA)
		assert.deepStrictEqual(b, snapshotB)

		// Even when one side is empty, result must be a new copy
		const copy = unionMask32Iterative(a, new Uint32Array(0))
		assert.notStrictEqual(copy, a)
		copy[0] = 0xffffffff
		assert.deepStrictEqual(a, snapshotA)
	})

	test('throws TypeError for invalid inputs', () => {
		const valid = new Uint32Array([1, 2])
		const invalidValues = [
			null,
			undefined,
			[1, 2],
			new Int32Array([1, 2]),
			new Uint16Array([1, 2]),
			new Uint8Array([1, 2]),
			new Float32Array([1, 2]),
			42,
			'123',
			{ length: 2, 0: 1, 1: 2 },
		]

		for (const bad of invalidValues) {
			assert.throws(
				() => unionMask32Iterative(bad, valid),
				{ name: 'TypeError' },
			)
			assert.throws(
				() => unionMask32Iterative(valid, bad),
				{ name: 'TypeError' },
			)
		}
	})

	test('cross-checks against JS Set union across deterministic pseudo-random bitsets', () => {
		// Deterministic LCG for reproducible testing without external deps
		let state = 0x12345678
		const nextUint32 = () => {
			state = (Math.imul(state, 1664525) + 1013904223) >>> 0
			return state
		}

		for (let trial = 0; trial < 50; trial += 1) {
			const lenA = nextUint32() % 6
			const lenB = nextUint32() % 6
			const setA = new Set()
			const setB = new Set()

			for (let bit = 0; bit < lenA * 32; bit += 1) {
				if ((nextUint32() & 3) === 0) {
					setA.add(bit)
				}
			}
			for (let bit = 0; bit < lenB * 32; bit += 1) {
				if ((nextUint32() & 3) === 0) {
					setB.add(bit)
				}
			}
			// Explicitly inject high-bit positions (31, 63, ...) when in range
			if (lenA > 0 && trial % 2 === 0) setA.add(lenA * 32 - 1)
			if (lenB > 0 && trial % 3 === 0) setB.add(lenB * 32 - 1)

			const maskA = bitSetToMask(setA, lenA)
			const maskB = bitSetToMask(setB, lenB)
			const unionMask = unionMask32Iterative(maskA, maskB)

			const expectedUnion = new Set([...setA, ...setB])
			const actualUnion = maskToBitSet(unionMask)

			assert.strictEqual(unionMask.length, Math.max(lenA, lenB))
			assert.deepStrictEqual(actualUnion, expectedUnion)
		}
	})
})
