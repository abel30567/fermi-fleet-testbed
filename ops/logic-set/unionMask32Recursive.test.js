import { describe, test } from 'node:test'
import assert from 'node:assert'
import { unionMask32Recursive } from './unionMask32Recursive.js'

/**
 * Encodes a JS Set (or iterable) of non-negative integer bit indices into a
 * Uint32Array bitmask with at least `minWords` words.
 */
function indicesToMask(indices, minWords = 0) {
	let maxIdx = -1
	for (const idx of indices) {
		if (idx > maxIdx) maxIdx = idx
	}
	const wordCount = Math.max(minWords, maxIdx < 0 ? 0 : (maxIdx >>> 5) + 1)
	const mask = new Uint32Array(wordCount)
	for (const idx of indices) {
		mask[idx >>> 5] = (mask[idx >>> 5] | (1 << (idx & 31))) >>> 0
	}
	return mask
}

/**
 * Decodes a Uint32Array bitmask into a JS Set of element bit indices.
 */
function maskToIndices(mask) {
	const result = new Set()
	for (let w = 0; w < mask.length; w++) {
		const word = mask[w] >>> 0
		if (word === 0) continue
		for (let bit = 0; bit < 32; bit++) {
			if ((word >>> bit) & 1) {
				result.add(w * 32 + bit)
			}
		}
	}
	return result
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property / cross-check tests.
 */
function mulberry32(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0)
	}
}

describe('unionMask32Recursive', () => {
	test('normal multi-word union with overlapping and distinct bits', () => {
		const a = new Uint32Array([0b1010, 0x0f0f0f0f, 0x12345678])
		const b = new Uint32Array([0b1100, 0xf0f000ff, 0x87654321])
		const res = unionMask32Recursive(a, b)

		assert.ok(res instanceof Uint32Array)
		assert.deepStrictEqual(res, new Uint32Array([0b1110, 0xffff0fff, 0x97755779]))
	})

	test('empty masks', () => {
		const emptyA = new Uint32Array(0)
		const emptyB = new Uint32Array(0)
		const nonEmpty = new Uint32Array([0xdeadbeef, 0x00000001])

		const resBothEmpty = unionMask32Recursive(emptyA, emptyB)
		assert.ok(resBothEmpty instanceof Uint32Array)
		assert.strictEqual(resBothEmpty.length, 0)
		assert.notStrictEqual(resBothEmpty, emptyA)
		assert.notStrictEqual(resBothEmpty, emptyB)

		const resFirstEmpty = unionMask32Recursive(emptyA, nonEmpty)
		assert.deepStrictEqual(resFirstEmpty, nonEmpty)
		assert.notStrictEqual(resFirstEmpty, nonEmpty)

		const resSecondEmpty = unionMask32Recursive(nonEmpty, emptyB)
		assert.deepStrictEqual(resSecondEmpty, nonEmpty)
		assert.notStrictEqual(resSecondEmpty, nonEmpty)
	})

	test('differing lengths zero-extend the shorter mask', () => {
		const shortMask = new Uint32Array([0x000000ff, 0x00ff0000])
		const longMask = new Uint32Array([0x0000ff00, 0x00000000, 0x80000001, 0x00000000, 0xabcdef01])

		const ab = unionMask32Recursive(shortMask, longMask)
		const ba = unionMask32Recursive(longMask, shortMask)

		const expected = new Uint32Array([0x0000ffff, 0x00ff0000, 0x80000001, 0x00000000, 0xabcdef01])
		assert.strictEqual(ab.length, 5)
		assert.strictEqual(ba.length, 5)
		assert.deepStrictEqual(ab, expected)
		assert.deepStrictEqual(ba, expected)
	})

	test('disjoint sets combine without interference', () => {
		const evenBits = new Uint32Array([0x55555555, 0x55555555, 0x55555555])
		const oddBits = new Uint32Array([0xaaaaaaaa, 0xaaaaaaaa, 0xaaaaaaaa])

		const res = unionMask32Recursive(evenBits, oddBits)
		assert.deepStrictEqual(res, new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff]))
	})

	test('identical sets and aliasing same Uint32Array reference', () => {
		const a = new Uint32Array([0x80000001, 0x13579bdf, 0x00000000, 0xffffffff])
		const b = new Uint32Array(a)

		const resDistinct = unionMask32Recursive(a, b)
		assert.deepStrictEqual(resDistinct, a)
		assert.notStrictEqual(resDistinct, a)
		assert.notStrictEqual(resDistinct, b)

		const resAliased = unionMask32Recursive(a, a)
		assert.deepStrictEqual(resAliased, a)
		assert.notStrictEqual(resAliased, a)
	})

	test('unsigned 32-bit semantics with high bit 31 set', () => {
		const a = new Uint32Array([0x80000000, 0x7fffffff, 0x80000000, 0x00000000])
		const b = new Uint32Array([0x00000001, 0x80000000, 0x80000000, 0xffffffff])

		const res = unionMask32Recursive(a, b)
		assert.strictEqual(res[0], 0x80000001)
		assert.strictEqual(res[1], 0xffffffff)
		assert.strictEqual(res[2], 0x80000000)
		assert.strictEqual(res[3], 0xffffffff)
		for (const word of res) {
			assert.ok(word >= 0 && word <= 0xffffffff)
		}
	})

	test('immutability of input arrays', () => {
		const a = new Uint32Array([0x11111111, 0x22222222, 0x80000000])
		const b = new Uint32Array([0x44444444, 0x88888888])
		const snapA = new Uint32Array(a)
		const snapB = new Uint32Array(b)

		const res = unionMask32Recursive(a, b)
		assert.deepStrictEqual(a, snapA)
		assert.deepStrictEqual(b, snapB)

		// Mutating output must not affect inputs
		res[0] = 0
		res[1] = 0
		res[2] = 0
		assert.deepStrictEqual(a, snapA)
		assert.deepStrictEqual(b, snapB)
	})

	test('divide-and-conquer range splits across odd, even, singleton, and large lengths', () => {
		const lengths = [1, 2, 3, 4, 5, 7, 8, 15, 16, 17, 63, 64, 65, 1025]
		const nextU32 = mulberry32(0xc0ffee)

		for (const len of lengths) {
			const a = new Uint32Array(len)
			const b = new Uint32Array(len)
			const expected = new Uint32Array(len)
			for (let i = 0; i < len; i++) {
				a[i] = nextU32()
				b[i] = nextU32()
				expected[i] = (a[i] | b[i]) >>> 0
			}
			const actual = unionMask32Recursive(a, b)
			assert.deepStrictEqual(actual, expected, `mismatch for length ${len}`)
		}
	})

	test('algebraic laws: commutativity, associativity, idempotence, zero identity', () => {
		const a = new Uint32Array([0x80000003, 0x0f0f0f0f, 0x12340000])
		const b = new Uint32Array([0x00ff00ff, 0x80000000])
		const c = new Uint32Array([0x00000001, 0x00000002, 0x00000004, 0x80000008])
		const zeros = new Uint32Array(a.length)

		assert.deepStrictEqual(unionMask32Recursive(a, b), unionMask32Recursive(b, a))
		assert.deepStrictEqual(
			unionMask32Recursive(unionMask32Recursive(a, b), c),
			unionMask32Recursive(a, unionMask32Recursive(b, c)),
		)
		assert.deepStrictEqual(unionMask32Recursive(a, a), a)
		assert.deepStrictEqual(unionMask32Recursive(a, zeros), a)
		assert.deepStrictEqual(unionMask32Recursive(zeros, a), a)
	})

	test('cross-check against independent JS Set of element indices', () => {
		const nextU32 = mulberry32(0x14141414)

		// Include explicit boundary indices (0, 31, 32, 63, 64, 95, 255) plus random cases
		const cases = [
			{
				setA: new Set([0, 1, 31, 32, 63, 95]),
				setB: new Set([1, 2, 31, 64, 127, 255]),
				minWordsA: 3,
				minWordsB: 8,
			},
			{
				setA: new Set([31, 63, 95, 127]),
				setB: new Set([0, 32, 64, 96]),
				minWordsA: 5,
				minWordsB: 4,
			},
			{
				setA: new Set(),
				setB: new Set([0, 31, 100]),
				minWordsA: 0,
				minWordsB: 4,
			},
		]

		for (let trial = 0; trial < 25; trial++) {
			const wordsA = nextU32() % 12
			const wordsB = nextU32() % 12
			const setA = new Set()
			const setB = new Set()

			const maxBitA = wordsA * 32
			const maxBitB = wordsB * 32
			const countA = maxBitA === 0 ? 0 : nextU32() % (maxBitA + 1)
			const countB = maxBitB === 0 ? 0 : nextU32() % (maxBitB + 1)

			for (let i = 0; i < countA; i++) setA.add(nextU32() % maxBitA)
			for (let i = 0; i < countB; i++) setB.add(nextU32() % maxBitB)

			cases.push({ setA, setB, minWordsA: wordsA, minWordsB: wordsB })
		}

		for (const { setA, setB, minWordsA, minWordsB } of cases) {
			const maskA = indicesToMask(setA, minWordsA)
			const maskB = indicesToMask(setB, minWordsB)

			const unionMask = unionMask32Recursive(maskA, maskB)
			assert.strictEqual(unionMask.length, Math.max(maskA.length, maskB.length))

			const expectedIndices = new Set([...setA, ...setB])
			const actualIndices = maskToIndices(unionMask)

			assert.deepStrictEqual(actualIndices, expectedIndices)
		}
	})

	test('throws TypeError for non-Uint32Array inputs', () => {
		const valid = new Uint32Array([1, 2, 3])
		const invalidValues = [
			undefined,
			null,
			42,
			'123',
			true,
			{},
			[1, 2, 3],
			new Int32Array([1, 2, 3]),
			new Uint16Array([1, 2, 3]),
			new Uint8Array([1, 2, 3]),
			new Float32Array([1, 2, 3]),
			new BigUint64Array([1n, 2n]),
			new ArrayBuffer(12),
		]

		for (const bad of invalidValues) {
			assert.throws(() => unionMask32Recursive(bad, valid), TypeError)
			assert.throws(() => unionMask32Recursive(valid, bad), TypeError)
		}

		assert.throws(() => unionMask32Recursive(), TypeError)
		assert.throws(() => unionMask32Recursive(valid), TypeError)
	})
})
