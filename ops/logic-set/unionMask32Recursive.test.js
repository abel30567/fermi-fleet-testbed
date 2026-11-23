import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { unionMask32Recursive } from './unionMask32Recursive.js'

/**
 * Independent reference: decode a Uint32Array bitmask into a Set of set bit indices.
 *
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
 * Independent reference: encode a Uint32Array bitmask as an unsigned BigInt.
 *
 * @param {Uint32Array} mask
 * @returns {bigint}
 */
function maskToBigInt(mask) {
	let value = 0n
	for (let w = mask.length - 1; w >= 0; w--) {
		value = (value << 32n) | BigInt(mask[w])
	}
	return value
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property and cross-check tests.
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

describe('unionMask32Recursive', () => {
	test('computes bitwise union for equal-length masks', () => {
		const a = new Uint32Array([0b1010, 0x0f0f0f0f, 0x80000000, 0x00000001])
		const b = new Uint32Array([0b0110, 0xf0f0f0f0, 0x7fffffff, 0x00000000])
		const result = unionMask32Recursive(a, b)

		assert.ok(result instanceof Uint32Array)
		assert.deepEqual(
			result,
			new Uint32Array([0b1110, 0xffffffff, 0xffffffff, 0x00000001]),
		)
	})

	test('preserves unsigned 32-bit high bit (bit 31) without sign corruption', () => {
		const a = new Uint32Array([0x80000000, 0xaaaaaaaa])
		const b = new Uint32Array([0x00000000, 0x55555555])
		const result = unionMask32Recursive(a, b)

		assert.equal(result[0], 0x80000000)
		assert.equal(result[1], 0xffffffff)
	})

	test('handles empty masks (both empty and one empty)', () => {
		const empty = new Uint32Array(0)
		const nonEmpty = new Uint32Array([0xdeadbeef, 0x12345678])

		const bothEmpty = unionMask32Recursive(empty, empty)
		assert.ok(bothEmpty instanceof Uint32Array)
		assert.equal(bothEmpty.length, 0)
		assert.notEqual(bothEmpty, empty)

		const leftEmpty = unionMask32Recursive(empty, nonEmpty)
		assert.deepEqual(leftEmpty, nonEmpty)
		assert.notEqual(leftEmpty, nonEmpty)

		const rightEmpty = unionMask32Recursive(nonEmpty, empty)
		assert.deepEqual(rightEmpty, nonEmpty)
		assert.notEqual(rightEmpty, nonEmpty)
	})

	test('handles single-word and odd-length masks across recursion splits', () => {
		const single = unionMask32Recursive(
			new Uint32Array([0x00ff00ff]),
			new Uint32Array([0xff00ff00]),
		)
		assert.deepEqual(single, new Uint32Array([0xffffffff]))

		const aOdd = new Uint32Array([1, 2, 4, 8, 16, 32, 64])
		const bOdd = new Uint32Array([64, 32, 16, 8, 4, 2, 1])
		assert.deepEqual(
			unionMask32Recursive(aOdd, bOdd),
			new Uint32Array([65, 34, 20, 8, 20, 34, 65]),
		)
	})

	test('zero-extends the shorter mask when lengths differ', () => {
		const shortMask = new Uint32Array([0x0000ffff, 0x00ff0000])
		const longMask = new Uint32Array([0xffff0000, 0x000000ff, 0x80000001, 0xfeedface])

		const expected = new Uint32Array([0xffffffff, 0x00ff00ff, 0x80000001, 0xfeedface])
		assert.deepEqual(unionMask32Recursive(shortMask, longMask), expected)
		assert.deepEqual(unionMask32Recursive(longMask, shortMask), expected)
	})

	test('does not mutate input arrays and returns a fresh Uint32Array even when aliased', () => {
		const a = new Uint32Array([0x11111111, 0x22222222, 0x33333333])
		const b = new Uint32Array([0x44444444, 0x88888888, 0xcccccccc])
		const aSnap = new Uint32Array(a)
		const bSnap = new Uint32Array(b)

		const res = unionMask32Recursive(a, b)
		assert.deepEqual(a, aSnap)
		assert.deepEqual(b, bSnap)
		assert.notEqual(res, a)
		assert.notEqual(res, b)

		const selfUnion = unionMask32Recursive(a, a)
		assert.deepEqual(selfUnion, a)
		assert.notEqual(selfUnion, a)
		selfUnion[0] = 0xffffffff
		assert.deepEqual(a, aSnap)
	})

	test('works correctly with Uint32Array subarrays sharing an ArrayBuffer', () => {
		const backing = new Uint32Array([0xffffffff, 0x0f0f0f0f, 0x00ff00ff, 0x12345678, 0xffffffff])
		const subA = backing.subarray(1, 4) // [0x0f0f0f0f, 0x00ff00ff, 0x12345678]
		const subB = backing.subarray(2, 4) // [0x00ff00ff, 0x12345678]

		const result = unionMask32Recursive(subA, subB)
		assert.deepEqual(
			result,
			new Uint32Array([
				(0x0f0f0f0f | 0x00ff00ff) >>> 0,
				(0x00ff00ff | 0x12345678) >>> 0,
				0x12345678,
			]),
		)
	})

	test('handles large bitmasks without stack overflow (O(log n) depth)', () => {
		const len = 16385 // > 524k bits, non-power-of-two
		const a = new Uint32Array(len)
		const b = new Uint32Array(len)
		for (let i = 0; i < len; i++) {
			a[i] = (i * 2654435761) >>> 0
			b[i] = ((~i) * 2246822519) >>> 0
		}

		const result = unionMask32Recursive(a, b)
		assert.equal(result.length, len)
		for (let i = 0; i < len; i++) {
			assert.equal(result[i], (a[i] | b[i]) >>> 0)
		}
	})

	test('throws TypeError on invalid inputs', () => {
		const valid = new Uint32Array([1, 2])
		const invalidValues = [
			null,
			undefined,
			[1, 2],
			new Int32Array([1, 2]),
			new Uint16Array([1, 2]),
			new Uint8Array([1, 2]),
			new BigUint64Array([1n]),
			new ArrayBuffer(8),
			42,
			'0xff',
			{ length: 2, 0: 1, 1: 2 },
		]

		for (const bad of invalidValues) {
			assert.throws(
				() => unionMask32Recursive(bad, valid),
				{ name: 'TypeError' },
				`Expected TypeError for first arg: ${String(bad)}`,
			)
			assert.throws(
				() => unionMask32Recursive(valid, bad),
				{ name: 'TypeError' },
				`Expected TypeError for second arg: ${String(bad)}`,
			)
		}

		assert.throws(() => unionMask32Recursive(), { name: 'TypeError' })
		assert.throws(() => unionMask32Recursive(valid), { name: 'TypeError' })
	})

	test('independent cross-check against Set<bitIndex> and BigInt bitwise OR + set-algebra laws', () => {
		const rng = makeRng(0x5eed1234)
		const lengths = [0, 1, 2, 3, 4, 5, 7, 8, 13, 16, 31, 32]

		for (let trial = 0; trial < 40; trial++) {
			const lenA = lengths[rng() % lengths.length]
			const lenB = lengths[rng() % lengths.length]
			const lenC = lengths[rng() % lengths.length]

			const a = new Uint32Array(lenA)
			const b = new Uint32Array(lenB)
			const c = new Uint32Array(lenC)
			for (let i = 0; i < lenA; i++) a[i] = rng()
			for (let i = 0; i < lenB; i++) b[i] = rng()
			for (let i = 0; i < lenC; i++) c[i] = rng()

			const ab = unionMask32Recursive(a, b)

			// Cross-check 1: Set of active bit positions
			const expectedBitSet = new Set([...maskToBitSet(a), ...maskToBitSet(b)])
			assert.deepEqual(maskToBitSet(ab), expectedBitSet)

			// Cross-check 2: BigInt bitwise OR
			assert.equal(maskToBigInt(ab), maskToBigInt(a) | maskToBigInt(b))

			// Algebraic laws: commutativity, idempotence, associativity
			assert.deepEqual(ab, unionMask32Recursive(b, a))
			assert.deepEqual(unionMask32Recursive(a, a), a)
			assert.deepEqual(
				unionMask32Recursive(ab, c),
				unionMask32Recursive(a, unionMask32Recursive(b, c)),
			)
		}
	})
})
