import { describe, test } from 'node:test'
import assert from 'node:assert'
import { orMask32Recursive } from './orMask32Recursive.js'

/**
 * Independent BigInt reference conversion: packs Uint32Array words (little-endian
 * word order) into a single non-negative BigInt bitmask.
 *
 * @param {Uint32Array} words
 * @returns {bigint}
 */
function uint32ArrayToBigInt(words) {
	let mask = 0n
	for (let i = words.length - 1; i >= 0; i--) {
		mask = (mask << 32n) | BigInt(words[i] >>> 0)
	}
	return mask
}

/**
 * Independent BigInt reference conversion: unpacks a non-negative BigInt bitmask
 * into a Uint32Array of `length` words (little-endian word order).
 *
 * @param {bigint} mask
 * @param {number} length
 * @returns {Uint32Array}
 */
function bigIntToUint32Array(mask, length) {
	const out = new Uint32Array(length)
	let remaining = mask
	for (let i = 0; i < length; i++) {
		out[i] = Number(remaining & 0xffffffffn) >>> 0
		remaining >>= 32n
	}
	return out
}

/**
 * Deterministic xorshift32 PRNG for reproducible test vectors.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
	let state = seed >>> 0
	return () => {
		state ^= (state << 13) >>> 0
		state ^= state >>> 17
		state ^= (state << 5) >>> 0
		return state >>> 0
	}
}

describe('orMask32Recursive', () => {
	test('computes bitwise OR for typical multi-word bitmasks', () => {
		const a = new Uint32Array([0x0f0f0f0f, 0x12345678, 0x00000001, 0xa5a5a5a5])
		const b = new Uint32Array([0xf0f0f0f0, 0x87654321, 0x00000002, 0x5a5a5a5a])

		const res = orMask32Recursive(a, b)

		assert.ok(res instanceof Uint32Array)
		assert.deepStrictEqual(
			res,
			new Uint32Array([0xffffffff, 0x97755779, 0x00000003, 0xffffffff])
		)
	})

	test('handles empty Uint32Array inputs', () => {
		const a = new Uint32Array(0)
		const b = new Uint32Array(0)

		const res = orMask32Recursive(a, b)

		assert.ok(res instanceof Uint32Array)
		assert.strictEqual(res.length, 0)
		assert.notStrictEqual(res, a)
		assert.notStrictEqual(res, b)
	})

	test('handles single-word Uint32Array inputs', () => {
		const a = new Uint32Array([0x00ff00ff])
		const b = new Uint32Array([0x0f0f0f0f])

		const res = orMask32Recursive(a, b)

		assert.deepStrictEqual(res, new Uint32Array([0x0fff0fff]))
	})

	test('handles both odd and even lengths across recursive splits', () => {
		const lengths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 15, 16, 17, 31, 32, 33, 127, 128, 257]
		const next = createRng(0x1337c0de)

		for (const len of lengths) {
			const a = new Uint32Array(len)
			const b = new Uint32Array(len)
			const expected = new Uint32Array(len)
			for (let i = 0; i < len; i++) {
				a[i] = next()
				b[i] = next()
				expected[i] = (a[i] | b[i]) >>> 0
			}
			assert.deepStrictEqual(orMask32Recursive(a, b), expected)
		}
	})

	test('preserves unsigned 32-bit semantics with high bit 0x80000000 and 0xffffffff', () => {
		const a = new Uint32Array([0x80000000, 0x00000000, 0x7fffffff, 0xffffffff, 0x80000001])
		const b = new Uint32Array([0x00000000, 0x80000000, 0x80000000, 0x00000000, 0x00000002])

		const res = orMask32Recursive(a, b)

		assert.deepStrictEqual(
			res,
			new Uint32Array([0x80000000, 0x80000000, 0xffffffff, 0xffffffff, 0x80000003])
		)
		for (let i = 0; i < res.length; i++) {
			assert.ok(res[i] >= 0 && res[i] <= 0xffffffff)
		}
	})

	test('satisfies algebraic laws (identity, absorbing element, idempotence, commutativity, associativity)', () => {
		const a = new Uint32Array([0xdeadbeef, 0x80000000, 0x00000001, 0x12345678, 0x00000000])
		const b = new Uint32Array([0xcafebabe, 0x7fffffff, 0x00000002, 0x87654321, 0xabcdef01])
		const c = new Uint32Array([0x01020304, 0x00000000, 0x80000000, 0xffffffff, 0x55555555])
		const zeros = new Uint32Array(a.length)
		const ones = new Uint32Array(a.length).fill(0xffffffff)

		// Identity: a | 0 === a
		assert.deepStrictEqual(orMask32Recursive(a, zeros), a)
		assert.deepStrictEqual(orMask32Recursive(zeros, a), a)

		// Absorbing element: a | ~0 === ~0
		assert.deepStrictEqual(orMask32Recursive(a, ones), ones)
		assert.deepStrictEqual(orMask32Recursive(ones, a), ones)

		// Idempotence: a | a === a
		assert.deepStrictEqual(orMask32Recursive(a, a), a)

		// Commutativity: a | b === b | a
		assert.deepStrictEqual(orMask32Recursive(a, b), orMask32Recursive(b, a))

		// Associativity: (a | b) | c === a | (b | c)
		assert.deepStrictEqual(
			orMask32Recursive(orMask32Recursive(a, b), c),
			orMask32Recursive(a, orMask32Recursive(b, c))
		)
	})

	test('does not mutate inputs and returns a newly allocated Uint32Array', () => {
		const a = new Uint32Array([0x80000001, 0x00ff00ff, 0x12345678])
		const b = new Uint32Array([0x00000002, 0xff00ff00, 0x87654321])
		const aCopy = new Uint32Array(a)
		const bCopy = new Uint32Array(b)

		const res = orMask32Recursive(a, b)

		assert.notStrictEqual(res, a)
		assert.notStrictEqual(res, b)
		assert.notStrictEqual(res.buffer, a.buffer)
		assert.notStrictEqual(res.buffer, b.buffer)
		assert.deepStrictEqual(a, aCopy)
		assert.deepStrictEqual(b, bCopy)

		// Mutating the output must not affect inputs
		res[0] = 0
		assert.deepStrictEqual(a, aCopy)
		assert.deepStrictEqual(b, bCopy)

		// Same reference passed for both operands returns a distinct copy
		const selfOr = orMask32Recursive(a, a)
		assert.notStrictEqual(selfOr, a)
		assert.notStrictEqual(selfOr.buffer, a.buffer)
		assert.deepStrictEqual(selfOr, aCopy)
	})

	test('handles subarray views with non-zero byteOffset', () => {
		const backing = new Uint32Array([0xffffffff, 0x80000000, 0x0f0f0f0f, 0x00000001, 0xaaaaaaaa])
		const a = backing.subarray(1, 4)
		const b = backing.subarray(2, 5)

		const res = orMask32Recursive(a, b)

		assert.deepStrictEqual(res, new Uint32Array([0x8f0f0f0f, 0x0f0f0f0f, 0xaaaaaaab]))
		// Backing buffer untouched
		assert.deepStrictEqual(
			backing,
			new Uint32Array([0xffffffff, 0x80000000, 0x0f0f0f0f, 0x00000001, 0xaaaaaaaa])
		)
	})

	test('throws TypeError for non-Uint32Array inputs', () => {
		const valid = new Uint32Array([1, 2])
		const invalidValues = [
			null,
			undefined,
			[1, 2],
			new Int32Array([1, 2]),
			new Uint8Array([1, 2]),
			new Uint16Array([1, 2]),
			new BigUint64Array([1n, 2n]),
			new Float32Array([1, 2]),
			{ 0: 1, 1: 2, length: 2 },
			42,
			'12'
		]

		for (const bad of invalidValues) {
			assert.throws(() => orMask32Recursive(bad, valid), TypeError)
			assert.throws(() => orMask32Recursive(valid, bad), TypeError)
		}
	})

	test('throws RangeError for mismatched lengths', () => {
		assert.throws(
			() => orMask32Recursive(new Uint32Array([1]), new Uint32Array([1, 2])),
			RangeError
		)
		assert.throws(
			() => orMask32Recursive(new Uint32Array(0), new Uint32Array(1)),
			RangeError
		)
		assert.throws(
			() => orMask32Recursive(new Uint32Array(5), new Uint32Array(3)),
			RangeError
		)
	})

	test('cross-checks against independent BigInt bitmask OR computation', () => {
		const next = createRng(0xfeedface)
		const testSizes = [0, 1, 2, 3, 7, 16, 33, 64, 129, 513]

		for (const size of testSizes) {
			const a = new Uint32Array(size)
			const b = new Uint32Array(size)

			for (let i = 0; i < size; i++) {
				// Mix random words with boundary patterns (0, 0x80000000, 0xffffffff)
				if (i % 11 === 0) {
					a[i] = 0x80000000
					b[i] = 0x7fffffff
				} else if (i % 13 === 0) {
					a[i] = 0xffffffff
					b[i] = 0x00000000
				} else {
					a[i] = next()
					b[i] = next()
				}
			}

			const actual = orMask32Recursive(a, b)
			const bigExpected = uint32ArrayToBigInt(a) | uint32ArrayToBigInt(b)
			const expected = bigIntToUint32Array(bigExpected, size)

			assert.deepStrictEqual(actual, expected)
			assert.strictEqual(uint32ArrayToBigInt(actual), bigExpected)
		}
	})
})
