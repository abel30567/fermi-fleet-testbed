import { describe, test } from 'node:test'
import assert from 'node:assert'
import { intersectionMask32Recursive } from './intersectionMask32Recursive.js'

/**
 * Independent reference helper: converts a Uint32Array bitmask to a JS Set of
 * active element indices (bit `k` in word `w` -> `w * 32 + k`).
 *
 * @param {Uint32Array} mask
 * @returns {Set<number>}
 */
function maskToElementSet(mask) {
	const elements = new Set()
	for (let w = 0; w < mask.length; w++) {
		const word = mask[w] >>> 0
		if (word === 0) continue
		for (let bit = 0; bit < 32; bit++) {
			if (((word >>> bit) & 1) === 1) {
				elements.add(w * 32 + bit)
			}
		}
	}
	return elements
}

/**
 * Independent reference helper: converts a JS Set of element indices to a
 * Uint32Array bitmask of the specified word length.
 *
 * @param {Set<number>} elements
 * @param {number} wordLength
 * @returns {Uint32Array}
 */
function elementSetToMask(elements, wordLength) {
	const mask = new Uint32Array(wordLength)
	for (const idx of elements) {
		const w = Math.floor(idx / 32)
		const bit = idx % 32
		mask[w] = (mask[w] | (1 << bit)) >>> 0
	}
	return mask
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property / cross-check tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0)
	}
}

describe('intersectionMask32Recursive', () => {
	test('computes bitwise intersection for normal single-word and multi-word masks', () => {
		const single = intersectionMask32Recursive(
			new Uint32Array([0b11001010]),
			new Uint32Array([0b10101100])
		)
		assert.ok(single instanceof Uint32Array)
		assert.deepStrictEqual(single, new Uint32Array([0b10001000]))

		// Power-of-two length (4 words)
		const a4 = new Uint32Array([0x0f0f0f0f, 0x12345678, 0xffff0000, 0xdeadbeef])
		const b4 = new Uint32Array([0x00ff00ff, 0x87654321, 0x00ffff00, 0xfeedface])
		assert.deepStrictEqual(
			intersectionMask32Recursive(a4, b4),
			new Uint32Array([
				(0x0f0f0f0f & 0x00ff00ff) >>> 0,
				(0x12345678 & 0x87654321) >>> 0,
				(0xffff0000 & 0x00ffff00) >>> 0,
				(0xdeadbeef & 0xfeedface) >>> 0
			])
		)

		// Odd length (5 words) to test uneven recursive splits
		const a5 = new Uint32Array([0xffffffff, 0xaaaaaaaa, 0x55555555, 0x0f0f0f0f, 0x80000001])
		const b5 = new Uint32Array([0x0000ffff, 0x33333333, 0xcccccccc, 0xf0f0f0f0, 0x80000003])
		assert.deepStrictEqual(
			intersectionMask32Recursive(a5, b5),
			new Uint32Array([0x0000ffff, 0x22222222, 0x44444444, 0x00000000, 0x80000001])
		)
	})

	test('handles empty masks', () => {
		const emptyA = new Uint32Array(0)
		const emptyB = new Uint32Array(0)
		const resBothEmpty = intersectionMask32Recursive(emptyA, emptyB)
		assert.ok(resBothEmpty instanceof Uint32Array)
		assert.strictEqual(resBothEmpty.length, 0)
		assert.notStrictEqual(resBothEmpty, emptyA)
		assert.notStrictEqual(resBothEmpty, emptyB)

		const nonEmpty = new Uint32Array([0x12345678, 0x9abcdef0])
		assert.deepStrictEqual(
			intersectionMask32Recursive(nonEmpty, emptyA),
			new Uint32Array([0, 0])
		)
		assert.deepStrictEqual(
			intersectionMask32Recursive(emptyA, nonEmpty),
			new Uint32Array([0, 0])
		)
	})

	test('handles disjoint sets', () => {
		const a = new Uint32Array([0xaaaaaaaa, 0x00ff00ff, 0x0000ffff])
		const b = new Uint32Array([0x55555555, 0xff00ff00, 0xffff0000])
		assert.deepStrictEqual(
			intersectionMask32Recursive(a, b),
			new Uint32Array([0, 0, 0])
		)
	})

	test('handles identical sets and same-reference input', () => {
		const a = new Uint32Array([0x00000000, 0x80000000, 0xffffffff, 0x13579bdf])
		const aCopy = new Uint32Array(a)

		const resDistinct = intersectionMask32Recursive(a, aCopy)
		assert.deepStrictEqual(resDistinct, a)
		assert.notStrictEqual(resDistinct, a)
		assert.notStrictEqual(resDistinct, aCopy)

		const resSameRef = intersectionMask32Recursive(a, a)
		assert.deepStrictEqual(resSameRef, a)
		assert.notStrictEqual(resSameRef, a)
	})

	test('handles differing lengths by zero-extending the shorter mask to Math.max length', () => {
		const shorter = new Uint32Array([0x0f0f0f0f, 0xffffffff])
		const longer = new Uint32Array([0x00ff00ff, 0x80000001, 0xdeadbeef, 0xffffffff, 0x12345678])

		const expected = new Uint32Array([0x000f000f, 0x80000001, 0, 0, 0])
		const res1 = intersectionMask32Recursive(shorter, longer)
		const res2 = intersectionMask32Recursive(longer, shorter)

		assert.strictEqual(res1.length, longer.length)
		assert.strictEqual(res2.length, longer.length)
		assert.deepStrictEqual(res1, expected)
		assert.deepStrictEqual(res2, expected)
	})

	test('preserves unsigned 32-bit semantics for high bits (bit 31)', () => {
		const a = new Uint32Array([0x80000000, 0xffffffff, 0x80000001, 0x7fffffff])
		const b = new Uint32Array([0x80000000, 0x80000000, 0xffffffff, 0x80000000])
		const res = intersectionMask32Recursive(a, b)

		assert.deepStrictEqual(
			res,
			new Uint32Array([0x80000000, 0x80000000, 0x80000001, 0x00000000])
		)
		assert.strictEqual(res[0], 2147483648)
		assert.strictEqual(res[1], 2147483648)
		assert.strictEqual(res[2], 2147483649)
		assert.strictEqual(res[3], 0)
	})

	test('does not mutate inputs and returns an isolated Uint32Array', () => {
		const a = new Uint32Array([0x12345678, 0x9abcdef0, 0xffffffff])
		const b = new Uint32Array([0xf0f0f0f0, 0x0f0f0f0f, 0xaaaaaaaa])
		const aBefore = Array.from(a)
		const bBefore = Array.from(b)

		const out = intersectionMask32Recursive(a, b)
		assert.deepStrictEqual(Array.from(a), aBefore)
		assert.deepStrictEqual(Array.from(b), bBefore)

		// Mutating returned mask must not affect inputs
		out[0] = 0
		out[1] = 0
		out[2] = 0
		assert.deepStrictEqual(Array.from(a), aBefore)
		assert.deepStrictEqual(Array.from(b), bBefore)
	})

	test('works with subarray views having non-zero byteOffset', () => {
		const bufA = new Uint32Array([0xffffffff, 0x00ff00ff, 0x8000000f, 0xffffffff])
		const bufB = new Uint32Array([0x00000000, 0x0000ffff, 0x80000001, 0x11111111])
		const viewA = bufA.subarray(1, 3)
		const viewB = bufB.subarray(1, 3)

		assert.deepStrictEqual(
			intersectionMask32Recursive(viewA, viewB),
			new Uint32Array([0x000000ff, 0x80000001])
		)
	})

	test('handles larger arrays exercising deeper recursion trees', () => {
		const n = 1027
		const a = new Uint32Array(n)
		const b = new Uint32Array(n)
		const expected = new Uint32Array(n)
		const rng = makeRng(0xc0ffee)

		for (let i = 0; i < n; i++) {
			a[i] = rng()
			b[i] = rng()
			expected[i] = (a[i] & b[i]) >>> 0
		}

		assert.deepStrictEqual(intersectionMask32Recursive(a, b), expected)
	})

	test('satisfies set algebra laws (commutativity, associativity, idempotence)', () => {
		const a = new Uint32Array([0x12345678, 0x80000001, 0xdeadbeef])
		const b = new Uint32Array([0x9abcdef0, 0xffffffff, 0x0f0f0f0f, 0xfeedface])
		const c = new Uint32Array([0xffffffff, 0x80000000])

		// Commutativity: a ∩ b == b ∩ a
		assert.deepStrictEqual(
			intersectionMask32Recursive(a, b),
			intersectionMask32Recursive(b, a)
		)

		// Associativity: (a ∩ b) ∩ c == a ∩ (b ∩ c)
		assert.deepStrictEqual(
			intersectionMask32Recursive(intersectionMask32Recursive(a, b), c),
			intersectionMask32Recursive(a, intersectionMask32Recursive(b, c))
		)

		// Idempotence: a ∩ a == a
		assert.deepStrictEqual(intersectionMask32Recursive(a, a), a)
	})

	test('throws TypeError for invalid non-Uint32Array inputs', () => {
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
			new ArrayBuffer(12)
		]

		for (const invalid of invalidValues) {
			assert.throws(
				() => intersectionMask32Recursive(invalid, valid),
				{ name: 'TypeError' }
			)
			assert.throws(
				() => intersectionMask32Recursive(valid, invalid),
				{ name: 'TypeError' }
			)
		}

		assert.throws(() => intersectionMask32Recursive(), { name: 'TypeError' })
	})

	test('cross-checks against independent JS Set of element indices computation', () => {
		const rng = makeRng(20261122)
		const lengthPairs = [
			[0, 0],
			[0, 3],
			[3, 0],
			[1, 1],
			[1, 7],
			[7, 2],
			[4, 4],
			[9, 9],
			[13, 20],
			[32, 32]
		]

		for (const [lenA, lenB] of lengthPairs) {
			const a = new Uint32Array(lenA)
			const b = new Uint32Array(lenB)
			for (let i = 0; i < lenA; i++) a[i] = rng()
			for (let i = 0; i < lenB; i++) b[i] = rng()

			// Ensure bit 31 and bit 0 edge elements appear when non-empty
			if (lenA > 0) a[lenA - 1] = (a[lenA - 1] | 0x80000001) >>> 0
			if (lenB > 0) b[lenB - 1] = (b[lenB - 1] | 0x80000001) >>> 0

			const setA = maskToElementSet(a)
			const setB = maskToElementSet(b)
			const expectedSet = new Set([...setA].filter((x) => setB.has(x)))

			const actualMask = intersectionMask32Recursive(a, b)
			const actualSet = maskToElementSet(actualMask)

			assert.strictEqual(actualMask.length, Math.max(lenA, lenB))
			assert.deepStrictEqual(actualSet, expectedSet)
			assert.deepStrictEqual(
				actualMask,
				elementSetToMask(expectedSet, Math.max(lenA, lenB))
			)
		}
	})
})
