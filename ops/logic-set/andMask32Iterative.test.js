import { describe, it } from 'node:test'
import assert from 'node:assert'
import { andMask32Iterative } from './andMask32Iterative.js'

/**
 * Packs a Uint32Array into an unsigned BigInt (word 0 = least-significant 32 bits).
 * @param {Uint32Array} words
 * @returns {bigint}
 */
function wordsToBigInt(words) {
	let value = 0n
	for (let i = words.length - 1; i >= 0; i--) {
		value = (value << 32n) | BigInt(words[i])
	}
	return value
}

/**
 * Unpacks an unsigned BigInt into a Uint32Array of the given word length.
 * @param {bigint} value
 * @param {number} length
 * @returns {Uint32Array}
 */
function bigIntToWords(value, length) {
	const out = new Uint32Array(length)
	let remaining = value
	for (let i = 0; i < length; i++) {
		out[i] = Number(remaining & 0xffffffffn)
		remaining >>= 32n
	}
	return out
}

/**
 * Deterministic xorshift32 PRNG for reproducible test vectors.
 * @param {number} seed
 * @param {number} length
 * @returns {Uint32Array}
 */
function seededWords(seed, length) {
	const out = new Uint32Array(length)
	let state = seed >>> 0 || 1
	for (let i = 0; i < length; i++) {
		state ^= (state << 13) >>> 0
		state ^= state >>> 17
		state ^= (state << 5) >>> 0
		out[i] = state >>> 0
	}
	return out
}

describe('andMask32Iterative', () => {
	it('computes word-wise bitwise AND for normal single- and multi-word masks', () => {
		const a = new Uint32Array([0b11001010, 0x0f0f0f0f, 0x12345678, 0xdeadbeef])
		const b = new Uint32Array([0b10101100, 0x00ff00ff, 0x0f0f0f0f, 0x00ffff00])

		const res = andMask32Iterative(a, b)
		assert.ok(res instanceof Uint32Array)
		assert.deepStrictEqual(
			res,
			new Uint32Array([0b10001000, 0x000f000f, 0x02040608, 0x00adbe00])
		)
	})

	it('handles disjoint masks producing all zeros', () => {
		const a = new Uint32Array([0xaaaaaaaa, 0x55555555, 0x0000ffff])
		const b = new Uint32Array([0x55555555, 0xaaaaaaaa, 0xffff0000])

		const res = andMask32Iterative(a, b)
		assert.deepStrictEqual(res, new Uint32Array([0, 0, 0]))
	})

	it('handles empty Uint32Array inputs and returns a fresh instance', () => {
		const a = new Uint32Array(0)
		const b = new Uint32Array(0)

		const res = andMask32Iterative(a, b)
		assert.ok(res instanceof Uint32Array)
		assert.strictEqual(res.length, 0)
		assert.notStrictEqual(res, a)
		assert.notStrictEqual(res, b)
	})

	it('preserves unsigned high-bit values (0x80000000 and 0xffffffff)', () => {
		const a = new Uint32Array([0x80000000, 0xffffffff, 0x80000001, 0xffffffff, 0x7fffffff])
		const b = new Uint32Array([0xffffffff, 0xffffffff, 0x80000000, 0x80000000, 0x80000000])

		const res = andMask32Iterative(a, b)
		assert.deepStrictEqual(
			res,
			new Uint32Array([0x80000000, 0xffffffff, 0x80000000, 0x80000000, 0x00000000])
		)
		assert.strictEqual(res[0], 0x80000000)
		assert.strictEqual(res[1], 0xffffffff)
	})

	it('does not mutate inputs and returns a distinct Uint32Array even when aliased', () => {
		const a = new Uint32Array([0xf0f0f0f0, 0x12345678, 0xffffffff])
		const b = new Uint32Array([0x0ff00ff0, 0x87654321, 0x80000001])
		const aCopy = new Uint32Array(a)
		const bCopy = new Uint32Array(b)

		const res = andMask32Iterative(a, b)
		assert.notStrictEqual(res, a)
		assert.notStrictEqual(res, b)
		assert.deepStrictEqual(a, aCopy)
		assert.deepStrictEqual(b, bCopy)

		// Mutating the output must not affect inputs
		res[0] = 0
		assert.deepStrictEqual(a, aCopy)
		assert.deepStrictEqual(b, bCopy)

		// Self-aliasing still returns a new instance
		const selfRes = andMask32Iterative(a, a)
		assert.notStrictEqual(selfRes, a)
		assert.deepStrictEqual(selfRes, a)
	})

	it('supports Uint32Array subarray views with non-zero byteOffset', () => {
		const backing = new Uint32Array([0x11111111, 0xf0f0f0f0, 0x800000ff, 0x22222222])
		const subA = backing.subarray(1, 3)
		const subB = new Uint32Array([0x0f0fffff, 0xffffffff, 0x00ff00ff]).subarray(1, 3)

		const res = andMask32Iterative(subA, subB)
		assert.deepStrictEqual(res, new Uint32Array([0xf0f0f0f0, 0x000000ff]))
	})

	it('rejects invalid input types with TypeError', () => {
		const valid = new Uint32Array([1, 2])
		const invalidValues = [
			null,
			undefined,
			[1, 2],
			new Int32Array([1, 2]),
			new Uint16Array([1, 2]),
			new Uint8Array([1, 2]),
			new Float32Array([1, 2]),
			new BigUint64Array([1n, 2n]),
			42,
			'12',
			{ length: 2, 0: 1, 1: 2 },
		]

		for (const bad of invalidValues) {
			assert.throws(() => andMask32Iterative(bad, valid), TypeError)
			assert.throws(() => andMask32Iterative(valid, bad), TypeError)
		}
		assert.throws(() => andMask32Iterative(), TypeError)
		assert.throws(() => andMask32Iterative(valid), TypeError)
	})

	it('rejects mismatched lengths with RangeError', () => {
		assert.throws(
			() => andMask32Iterative(new Uint32Array(0), new Uint32Array(1)),
			RangeError
		)
		assert.throws(
			() => andMask32Iterative(new Uint32Array([1, 2, 3]), new Uint32Array([1, 2])),
			RangeError
		)
	})

	it('matches BigInt bitmask AND across lengths and deterministic random vectors', () => {
		const lengths = [0, 1, 2, 3, 7, 16, 64]
		for (let idx = 0; idx < lengths.length; idx++) {
			const len = lengths[idx]
			const a = seededWords(0x9e3779b9 + idx * 17, len)
			const b = seededWords(0x85ebca6b + idx * 31, len)

			const actual = andMask32Iterative(a, b)
			const expected = bigIntToWords(wordsToBigInt(a) & wordsToBigInt(b), len)

			assert.deepStrictEqual(actual, expected)
		}
	})

	it('satisfies Boolean algebra laws (commutativity, associativity, idempotence, identity, annihilation)', () => {
		const len = 32
		const a = seededWords(0x13579bdf, len)
		const b = seededWords(0x2468ace0, len)
		const c = seededWords(0xdeadbeef, len)
		const zeros = new Uint32Array(len)
		const ones = new Uint32Array(len).fill(0xffffffff)
		const notA = a.map((w) => (~w) >>> 0)

		// Commutativity: a & b === b & a
		assert.deepStrictEqual(andMask32Iterative(a, b), andMask32Iterative(b, a))

		// Associativity: (a & b) & c === a & (b & c)
		assert.deepStrictEqual(
			andMask32Iterative(andMask32Iterative(a, b), c),
			andMask32Iterative(a, andMask32Iterative(b, c))
		)

		// Idempotence: a & a === a
		assert.deepStrictEqual(andMask32Iterative(a, a), a)

		// Identity: a & 1...1 === a
		assert.deepStrictEqual(andMask32Iterative(a, ones), a)

		// Absorbing element: a & 0...0 === 0...0
		assert.deepStrictEqual(andMask32Iterative(a, zeros), zeros)

		// Complement annihilation: a & ~a === 0...0
		assert.deepStrictEqual(andMask32Iterative(a, notA), zeros)
	})
})
