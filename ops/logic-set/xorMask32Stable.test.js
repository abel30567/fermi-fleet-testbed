import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { xorMask32Stable } from './xorMask32Stable.js'

/**
 * Independent BigInt reference conversion: little-endian Uint32Array -> BigInt.
 * @param {Uint32Array} words
 * @returns {bigint}
 */
function wordsToBigInt(words) {
	let acc = 0n
	for (let i = words.length - 1; i >= 0; i--) {
		acc = (acc << 32n) | BigInt(words[i] >>> 0)
	}
	return acc
}

/**
 * Independent BigInt reference conversion: BigInt -> little-endian Uint32Array.
 * @param {bigint} value
 * @param {number} wordCount
 * @returns {Uint32Array}
 */
function bigIntToWords(value, wordCount) {
	const out = new Uint32Array(wordCount)
	let v = value
	for (let i = 0; i < wordCount; i++) {
		out[i] = Number(v & 0xffffffffn)
		v >>= 32n
	}
	return out
}

/**
 * Deterministic xorshift32 PRNG for repeatable pseudo-random test vectors.
 * @param {number} seed
 */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state ^= (state << 13) >>> 0
		state ^= state >>> 17
		state ^= (state << 5) >>> 0
		return state >>> 0
	}
}

describe('xorMask32Stable', () => {
	test('normal single-word and multi-word cases', () => {
		const a = new Uint32Array([0xaaaaaaaa, 0x12345678, 0x0f0f0f0f])
		const b = new Uint32Array([0x55555555, 0x87654321, 0xf0f0f0f0])
		const res = xorMask32Stable(a, b)

		assert.ok(res instanceof Uint32Array)
		assert.deepStrictEqual(res, new Uint32Array([0xffffffff, 0x95511559, 0xffffffff]))
	})

	test('identity with all-zero mask and algebraic laws (commutativity, associativity)', () => {
		const a = new Uint32Array([0x00000001, 0xdeadbeef, 0x80000001, 0xffffffff])
		const b = new Uint32Array([0x13579bdf, 0xcafebabe, 0x7fffffff, 0x01020304])
		const c = new Uint32Array([0x2468ace0, 0x00ff00ff, 0x80808080, 0x10203040])
		const zero = new Uint32Array(4)

		assert.deepStrictEqual(xorMask32Stable(a, zero), a)
		assert.deepStrictEqual(xorMask32Stable(zero, a), a)
		assert.deepStrictEqual(xorMask32Stable(a, b), xorMask32Stable(b, a))
		assert.deepStrictEqual(
			xorMask32Stable(xorMask32Stable(a, b), c),
			xorMask32Stable(a, xorMask32Stable(b, c))
		)
	})

	test('self-XOR yields all zeros', () => {
		const a = new Uint32Array([0x00000000, 0x80000000, 0xffffffff, 0xdeadbeef])
		const res = xorMask32Stable(a, a)
		assert.deepStrictEqual(res, new Uint32Array([0, 0, 0, 0]))
		// Original input must remain intact even when aliased to itself
		assert.deepStrictEqual(a, new Uint32Array([0x00000000, 0x80000000, 0xffffffff, 0xdeadbeef]))
		assert.notEqual(res.buffer, a.buffer)
	})

	test('high bit 0x80000000 and 0xFFFFFFFF without signed 32-bit overflow', () => {
		const a = new Uint32Array([0x80000000, 0xffffffff, 0x80000000, 0xffffffff, 0x7fffffff])
		const b = new Uint32Array([0x00000000, 0x00000000, 0xffffffff, 0xffffffff, 0x80000000])
		const res = xorMask32Stable(a, b)

		assert.deepStrictEqual(
			res,
			new Uint32Array([0x80000000, 0xffffffff, 0x7fffffff, 0x00000000, 0xffffffff])
		)
		for (let i = 0; i < res.length; i++) {
			assert.ok(res[i] >= 0 && res[i] <= 0xffffffff, `word ${i} must stay unsigned uint32`)
		}
		assert.strictEqual(res[0], 2147483648)
		assert.strictEqual(res[1], 4294967295)
	})

	test('empty Uint32Array', () => {
		const emptyA = new Uint32Array(0)
		const emptyB = new Uint32Array(0)
		const res = xorMask32Stable(emptyA, emptyB)
		assert.ok(res instanceof Uint32Array)
		assert.strictEqual(res.length, 0)
		assert.notEqual(res, emptyA)
		assert.notEqual(res, emptyB)

		assert.strictEqual(xorMask32Stable(emptyA, emptyB, 0).length, 0)
		assert.strictEqual(xorMask32Stable(emptyA, emptyB, { bitLength: 0 }).length, 0)
	})

	test('defensive immutability and aliased/overlapping buffer views', () => {
		const backing = new Uint32Array([0x11111111, 0x80000002, 0xffffffff, 0x0f0f0f0f, 0xdeadbeef])
		const snapshot = new Uint32Array(backing)

		// Overlapping subarrays with non-zero byteOffset
		const viewA = backing.subarray(0, 4)
		const viewB = backing.subarray(1, 5)
		const res = xorMask32Stable(viewA, viewB)

		const expected = new Uint32Array([
			(0x11111111 ^ 0x80000002) >>> 0,
			(0x80000002 ^ 0xffffffff) >>> 0,
			(0xffffffff ^ 0x0f0f0f0f) >>> 0,
			(0x0f0f0f0f ^ 0xdeadbeef) >>> 0,
		])
		assert.deepStrictEqual(res, expected)
		assert.deepStrictEqual(backing, snapshot)
		assert.notEqual(res.buffer, backing.buffer)

		// Mutating output must not mutate backing buffer
		res.fill(0)
		assert.deepStrictEqual(backing, snapshot)
	})

	test('optional bitLength trailing-bit masking (numeric and object forms)', () => {
		const a = new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff])
		const b = new Uint32Array([0x00000000, 0x00000000, 0x00000000])

		assert.deepStrictEqual(xorMask32Stable(a, b, 0), new Uint32Array([0, 0, 0]))
		assert.deepStrictEqual(xorMask32Stable(a, b, { bitLength: 1 }), new Uint32Array([1, 0, 0]))
		assert.deepStrictEqual(
			xorMask32Stable(a, b, 31),
			new Uint32Array([0x7fffffff, 0, 0])
		)
		assert.deepStrictEqual(
			xorMask32Stable(a, b, { bitLength: 32 }),
			new Uint32Array([0xffffffff, 0, 0])
		)
		assert.deepStrictEqual(
			xorMask32Stable(a, b, 33),
			new Uint32Array([0xffffffff, 0x00000001, 0])
		)
		assert.deepStrictEqual(
			xorMask32Stable(a, b, { bitLength: 63 }),
			new Uint32Array([0xffffffff, 0x7fffffff, 0])
		)
		assert.deepStrictEqual(
			xorMask32Stable(a, b, { bitLength: 96 }),
			new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff])
		)
		// Empty options object defaults to full bit length
		assert.deepStrictEqual(
			xorMask32Stable(a, b, {}),
			new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff])
		)
	})

	test('invalid inputs throw descriptive TypeError or RangeError', () => {
		const valid = new Uint32Array([1, 2])

		// Non-Uint32Array operands
		for (const bad of [
			null,
			undefined,
			42,
			'12',
			[1, 2],
			new Int32Array([1, 2]),
			new Uint8Array([1, 2]),
			new Uint16Array([1, 2]),
			new BigUint64Array([1n, 2n]),
			{},
		]) {
			assert.throws(() => xorMask32Stable(bad, valid), TypeError)
			assert.throws(() => xorMask32Stable(valid, bad), TypeError)
		}

		// Mismatched lengths
		assert.throws(
			() => xorMask32Stable(new Uint32Array([1, 2]), new Uint32Array([1])),
			RangeError
		)
		assert.throws(
			() => xorMask32Stable(new Uint32Array(0), new Uint32Array(1)),
			RangeError
		)

		// Detached ArrayBuffer
		const ab1 = new ArrayBuffer(8)
		const detachedA = new Uint32Array(ab1)
		ab1.transfer()
		assert.throws(() => xorMask32Stable(detachedA, valid), TypeError)

		const ab2 = new ArrayBuffer(8)
		const detachedB = new Uint32Array(ab2)
		ab2.transfer()
		assert.throws(() => xorMask32Stable(valid, detachedB), TypeError)

		// Invalid options type
		for (const badOpt of [null, '32', true, [32], 32n, () => {}]) {
			assert.throws(() => xorMask32Stable(valid, valid, badOpt), TypeError)
		}
		assert.throws(() => xorMask32Stable(valid, valid, { bitLength: '32' }), TypeError)
		assert.throws(() => xorMask32Stable(valid, valid, { bitLength: null }), TypeError)

		// Invalid bitLength range / non-integer
		for (const badLen of [-1, 65, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
			assert.throws(() => xorMask32Stable(valid, valid, badLen), RangeError)
			assert.throws(() => xorMask32Stable(valid, valid, { bitLength: badLen }), RangeError)
		}
	})

	test('cross-check against independent BigInt XOR and reversibility ((a ^ b) ^ b === a)', () => {
		const nextU32 = makeRng(0x5eed1234)
		const wordCounts = [1, 2, 3, 4, 7, 16]

		for (const wordCount of wordCounts) {
			const a = new Uint32Array(wordCount)
			const b = new Uint32Array(wordCount)
			for (let i = 0; i < wordCount; i++) {
				a[i] = nextU32()
				b[i] = nextU32()
			}
			// Ensure high bits are exercised
			a[0] |= 0x80000000
			b[wordCount - 1] |= 0x80000000

			const bigA = wordsToBigInt(a)
			const bigB = wordsToBigInt(b)

			// Full-width BigInt cross-check
			const fullRes = xorMask32Stable(a, b)
			const expectedFull = bigIntToWords(bigA ^ bigB, wordCount)
			assert.deepStrictEqual(fullRes, expectedFull)

			// Reversibility: (a ^ b) ^ b === a and (a ^ b) ^ a === b
			assert.deepStrictEqual(xorMask32Stable(fullRes, b), a)
			assert.deepStrictEqual(xorMask32Stable(fullRes, a), b)

			// Partial bitLength BigInt cross-checks
			const maxBits = wordCount * 32
			const sampleBitLengths = [
				0,
				1,
				7,
				31,
				32,
				Math.min(33, maxBits),
				Math.floor(maxBits / 2),
				maxBits - 1,
				maxBits,
			]

			for (const bitLength of sampleBitLengths) {
				const maskedRes = xorMask32Stable(a, b, { bitLength })
				const bigMask = bitLength === 0 ? 0n : (1n << BigInt(bitLength)) - 1n
				const expectedMasked = bigIntToWords((bigA ^ bigB) & bigMask, wordCount)
				assert.deepStrictEqual(maskedRes, expectedMasked)

				// Reversibility under bitLength masking: ((a ^ b)_mask ^ b)_mask === a_mask
				const recoveredA = xorMask32Stable(maskedRes, b, { bitLength })
				const expectedA = bigIntToWords(bigA & bigMask, wordCount)
				assert.deepStrictEqual(recoveredA, expectedA)
			}
		}
	})
})
