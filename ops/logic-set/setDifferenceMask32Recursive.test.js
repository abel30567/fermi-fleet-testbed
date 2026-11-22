import { describe, test } from 'node:test'
import assert from 'node:assert'
import { setDifferenceMask32Recursive } from './setDifferenceMask32Recursive.js'

/**
 * Independent reference conversion from a Uint32Array bitmask to a JS Set of
 * set bit indices (wordIndex * 32 + bitOffset).
 *
 * @param {Uint32Array} mask
 * @returns {Set<number>}
 */
function maskToIndexSet(mask) {
	const indices = new Set()
	for (let wordIdx = 0; wordIdx < mask.length; wordIdx++) {
		const word = mask[wordIdx]
		for (let bit = 0; bit < 32; bit++) {
			if (((word >>> bit) & 1) === 1) {
				indices.add(wordIdx * 32 + bit)
			}
		}
	}
	return indices
}

/**
 * Independent reference conversion from a JS Set of bit indices to a Uint32Array
 * of the requested word count.
 *
 * @param {Set<number>} indices
 * @param {number} wordCount
 * @returns {Uint32Array}
 */
function indexSetToMask(indices, wordCount) {
	const mask = new Uint32Array(wordCount)
	for (const idx of indices) {
		const wordIdx = Math.floor(idx / 32)
		const bit = idx % 32
		if (wordIdx >= 0 && wordIdx < wordCount) {
			mask[wordIdx] = (mask[wordIdx] | (1 << bit)) >>> 0
		}
	}
	return mask
}

/**
 * Deterministic PRNG (xorshift32) for reproducible property tests.
 *
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

describe('setDifferenceMask32Recursive', () => {
	test('computes set difference for single-word and multi-word masks', () => {
		const a1 = new Uint32Array([0b11010110])
		const b1 = new Uint32Array([0b01010011])
		assert.deepStrictEqual(
			setDifferenceMask32Recursive(a1, b1),
			new Uint32Array([0b10000100]),
		)

		const aMulti = new Uint32Array([0x0f0f0f0f, 0xff00ff00, 0x12345678, 0xdeadbeef, 0x0000ffff])
		const bMulti = new Uint32Array([0x00ff00ff, 0x0ff00ff0, 0x00ff00ff, 0x0f0f0f0f, 0x000000ff])
		const expected = new Uint32Array([
			(0x0f0f0f0f & ~0x00ff00ff) >>> 0,
			(0xff00ff00 & ~0x0ff00ff0) >>> 0,
			(0x12345678 & ~0x00ff00ff) >>> 0,
			(0xdeadbeef & ~0x0f0f0f0f) >>> 0,
			(0x0000ffff & ~0x000000ff) >>> 0,
		])
		assert.deepStrictEqual(setDifferenceMask32Recursive(aMulti, bMulti), expected)
	})

	test('handles empty masks cleanly', () => {
		const empty = new Uint32Array(0)
		const nonEmpty = new Uint32Array([0x12345678, 0x80000001])

		const emptyEmpty = setDifferenceMask32Recursive(empty, empty)
		assert.ok(emptyEmpty instanceof Uint32Array)
		assert.strictEqual(emptyEmpty.length, 0)
		assert.notStrictEqual(emptyEmpty, empty)

		const emptyMinusNonEmpty = setDifferenceMask32Recursive(empty, nonEmpty)
		assert.strictEqual(emptyMinusNonEmpty.length, 0)

		const nonEmptyMinusEmpty = setDifferenceMask32Recursive(nonEmpty, empty)
		assert.deepStrictEqual(nonEmptyMinusEmpty, nonEmpty)
		assert.notStrictEqual(nonEmptyMinusEmpty, nonEmpty)
	})

	test('satisfies set-difference identities: A \\ A = 0, A \\ 0 = A, 0 \\ B = 0', () => {
		const a = new Uint32Array([0x80000001, 0xffffffff, 0x00000000, 0x5a5a5a5a, 0x13579bdf])
		const zeros = new Uint32Array(a.length)

		assert.deepStrictEqual(setDifferenceMask32Recursive(a, new Uint32Array(a)), zeros)
		assert.deepStrictEqual(setDifferenceMask32Recursive(a, a), zeros)
		assert.deepStrictEqual(setDifferenceMask32Recursive(a, zeros), a)
		assert.deepStrictEqual(setDifferenceMask32Recursive(zeros, a), zeros)
	})

	test('handles differing lengths (b shorter zero-extended, b longer truncated to a.length)', () => {
		const aLong = new Uint32Array([0xffffffff, 0xaaaaaaaa, 0x80000001, 0x12345678, 0xfedcba98])
		const bShort = new Uint32Array([0x0000ffff, 0x0a0a0a0a])
		const resShortB = setDifferenceMask32Recursive(aLong, bShort)
		assert.strictEqual(resShortB.length, aLong.length)
		assert.deepStrictEqual(
			resShortB,
			new Uint32Array([0xffff0000, 0xa0a0a0a0, 0x80000001, 0x12345678, 0xfedcba98]),
		)

		const aShort = new Uint32Array([0x0f0f0f0f, 0x80000000])
		const bLong = new Uint32Array([0x00ff00ff, 0x00000001, 0xffffffff, 0xffffffff])
		const resLongB = setDifferenceMask32Recursive(aShort, bLong)
		assert.strictEqual(resLongB.length, aShort.length)
		assert.deepStrictEqual(resLongB, new Uint32Array([0x0f000f00, 0x80000000]))
	})

	test('preserves unsigned 32-bit high-bit semantics', () => {
		const a = new Uint32Array([0x80000000, 0xffffffff, 0x80000000, 0x7fffffff])
		const b = new Uint32Array([0x00000000, 0x7fffffff, 0x80000000, 0x80000000])
		const res = setDifferenceMask32Recursive(a, b)

		assert.deepStrictEqual(res, new Uint32Array([0x80000000, 0x80000000, 0x00000000, 0x7fffffff]))
		assert.strictEqual(res[0], 2147483648)
		assert.strictEqual(res[1], 2147483648)
	})

	test('does not mutate inputs and works with subarray views', () => {
		const backingA = new Uint32Array([0x11111111, 0xdeadbeef, 0xcafebabe, 0x80000001, 0x22222222])
		const backingB = new Uint32Array([0x33333333, 0x00ff00ff, 0xf0f0f0f0, 0x00000001, 0x44444444])
		const aView = backingA.subarray(1, 4)
		const bView = backingB.subarray(1, 4)

		const aSnapshot = new Uint32Array(backingA)
		const bSnapshot = new Uint32Array(backingB)

		const res = setDifferenceMask32Recursive(aView, bView)

		assert.notStrictEqual(res, aView)
		assert.notStrictEqual(res, bView)
		assert.deepStrictEqual(backingA, aSnapshot)
		assert.deepStrictEqual(backingB, bSnapshot)
		assert.deepStrictEqual(
			res,
			new Uint32Array([
				(0xdeadbeef & ~0x00ff00ff) >>> 0,
				(0xcafebabe & ~0xf0f0f0f0) >>> 0,
				(0x80000001 & ~0x00000001) >>> 0,
			]),
		)
	})

	test('throws TypeError for non-Uint32Array inputs', () => {
		const valid = new Uint32Array([1, 2, 3])
		const invalidValues = [
			null,
			undefined,
			[1, 2, 3],
			new Int32Array([1, 2, 3]),
			new Uint16Array([1, 2, 3]),
			new Uint8Array([1, 2, 3]),
			new Float32Array([1, 2, 3]),
			new ArrayBuffer(12),
			42,
			'123',
			{ 0: 1, length: 1 },
		]

		for (const invalid of invalidValues) {
			assert.throws(
				() => setDifferenceMask32Recursive(invalid, valid),
				{ name: 'TypeError' },
				`Expected TypeError for invalid first arg: ${String(invalid)}`,
			)
			assert.throws(
				() => setDifferenceMask32Recursive(valid, invalid),
				{ name: 'TypeError' },
				`Expected TypeError for invalid second arg: ${String(invalid)}`,
			)
		}
	})

	test('cross-checks against independent JS Set of element indices across varied lengths', () => {
		const nextUint32 = createPrng(0x5eed16)
		const lengthPairs = [
			[0, 0],
			[0, 5],
			[1, 1],
			[2, 2],
			[3, 3],
			[5, 2],
			[7, 11],
			[16, 16],
			[33, 19],
			[64, 64],
			[129, 77],
		]

		for (const [lenA, lenB] of lengthPairs) {
			const a = new Uint32Array(lenA)
			const b = new Uint32Array(lenB)
			for (let i = 0; i < lenA; i++) a[i] = nextUint32()
			for (let i = 0; i < lenB; i++) b[i] = nextUint32()

			const actual = setDifferenceMask32Recursive(a, b)

			const setA = maskToIndexSet(a)
			const setB = maskToIndexSet(b)
			const expectedSet = new Set()
			for (const elem of setA) {
				if (!setB.has(elem)) {
					expectedSet.add(elem)
				}
			}

			assert.strictEqual(actual.length, lenA)
			assert.deepStrictEqual(actual, indexSetToMask(expectedSet, lenA))
			assert.deepStrictEqual(maskToIndexSet(actual), expectedSet)
		}
	})
})
