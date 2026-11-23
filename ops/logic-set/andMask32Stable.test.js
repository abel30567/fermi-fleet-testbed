import { describe, test } from 'node:test'
import assert from 'node:assert'
import { andMask32Stable } from './andMask32Stable.js'

/**
 * Deterministic xorshift32 PRNG for reproducible test vectors.
 * @param {number} seed
 * @returns {() => number}
 */
function makePrng(seed) {
	let state = seed >>> 0
	return () => {
		state ^= (state << 13) >>> 0
		state ^= state >>> 17
		state ^= (state << 5) >>> 0
		return state >>> 0
	}
}

/**
 * Independent BigInt packer (little-endian 32-bit words).
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
 * Independent BigInt unpacker (little-endian 32-bit words).
 * @param {bigint} value
 * @param {number} len
 * @returns {Uint32Array}
 */
function bigIntToWords(value, len) {
	const out = new Uint32Array(len)
	let cur = value
	for (let i = 0; i < len; i++) {
		out[i] = Number(cur & 0xffffffffn)
		cur >>= 32n
	}
	return out
}

/**
 * Independent bit-by-bit boolean array expansion (LSB first per word).
 * @param {Uint32Array} words
 * @returns {boolean[]}
 */
function wordsToBools(words) {
	const bits = new Array(words.length * 32)
	for (let i = 0; i < words.length; i++) {
		const w = words[i] >>> 0
		for (let bit = 0; bit < 32; bit++) {
			bits[i * 32 + bit] = ((w >>> bit) & 1) === 1
		}
	}
	return bits
}

/**
 * Independent boolean array repacking into Uint32Array.
 * @param {boolean[]} bits
 * @returns {Uint32Array}
 */
function boolsToWords(bits) {
	const len = bits.length / 32
	const out = new Uint32Array(len)
	for (let i = 0; i < len; i++) {
		let w = 0
		for (let bit = 0; bit < 32; bit++) {
			if (bits[i * 32 + bit]) {
				w = (w | (1 << bit)) >>> 0
			}
		}
		out[i] = w >>> 0
	}
	return out
}

describe('andMask32Stable', () => {
	test('computes bitwise AND for normal multi-word masks', () => {
		const a = new Uint32Array([0xdeadbeef, 0xaaaaaaaa, 0x12345678, 0x00ff00ff])
		const b = new Uint32Array([0x0f0f0f0f, 0x55555555, 0xffff0000, 0x0ff00ff0])
		const result = andMask32Stable(a, b)

		assert.ok(result instanceof Uint32Array)
		assert.deepStrictEqual(
			result,
			new Uint32Array([0x0e0d0e0f, 0x00000000, 0x12340000, 0x00f000f0])
		)
	})

	test('handles empty Uint32Array inputs', () => {
		const a = new Uint32Array(0)
		const b = new Uint32Array(0)
		const result = andMask32Stable(a, b)

		assert.ok(result instanceof Uint32Array)
		assert.strictEqual(result.length, 0)
		assert.notStrictEqual(result, a)
		assert.notStrictEqual(result, b)
	})

	test('handles single-word edge cases', () => {
		assert.deepStrictEqual(
			andMask32Stable(new Uint32Array([0]), new Uint32Array([0])),
			new Uint32Array([0])
		)
		assert.deepStrictEqual(
			andMask32Stable(new Uint32Array([0xffffffff]), new Uint32Array([0])),
			new Uint32Array([0])
		)
		assert.deepStrictEqual(
			andMask32Stable(new Uint32Array([0xffffffff]), new Uint32Array([0xffffffff])),
			new Uint32Array([0xffffffff])
		)
		assert.deepStrictEqual(
			andMask32Stable(new Uint32Array([0x00000001]), new Uint32Array([0x00000001])),
			new Uint32Array([1])
		)
	})

	test('preserves unsigned 32-bit semantics for high-bit patterns (bit 31)', () => {
		const a = new Uint32Array([0x80000000, 0xffffffff, 0x80000001, 0xc0000000])
		const b = new Uint32Array([0x80000000, 0x80000000, 0xffffffff, 0xa0000000])
		const result = andMask32Stable(a, b)

		assert.strictEqual(result[0], 0x80000000)
		assert.strictEqual(result[0], 2147483648)
		assert.strictEqual(result[1], 0x80000000)
		assert.strictEqual(result[2], 0x80000001)
		assert.strictEqual(result[3], 0x80000000)
		for (let i = 0; i < result.length; i++) {
			assert.ok(result[i] >= 0 && result[i] <= 0xffffffff)
		}
	})

	test('does not mutate inputs and returns an independent buffer', () => {
		const a = new Uint32Array([0xf0f0f0f0, 0x80000001, 0x13579bdf])
		const b = new Uint32Array([0x0ff00ff0, 0xffffffff, 0x2468ace0])
		const aSnap = new Uint32Array(a)
		const bSnap = new Uint32Array(b)

		const result = andMask32Stable(a, b)
		assert.notStrictEqual(result, a)
		assert.notStrictEqual(result, b)
		assert.notStrictEqual(result.buffer, a.buffer)
		assert.notStrictEqual(result.buffer, b.buffer)
		assert.deepStrictEqual(a, aSnap)
		assert.deepStrictEqual(b, bSnap)

		// Mutating output must not affect inputs
		result[0] = 0x12345678
		assert.deepStrictEqual(a, aSnap)
		assert.deepStrictEqual(b, bSnap)
	})

	test('handles aliased inputs and overlapping subarray views safely', () => {
		const backing = new Uint32Array([0x11111111, 0xffffffff, 0x8000000f, 0x0f0f0f0f, 0xaaaaaaaa])
		const viewA = backing.subarray(0, 4)
		const viewB = backing.subarray(1, 5)
		const backingSnap = new Uint32Array(backing)

		const overlapResult = andMask32Stable(viewA, viewB)
		assert.deepStrictEqual(
			overlapResult,
			new Uint32Array([
				(0x11111111 & 0xffffffff) >>> 0,
				(0xffffffff & 0x8000000f) >>> 0,
				(0x8000000f & 0x0f0f0f0f) >>> 0,
				(0x0f0f0f0f & 0xaaaaaaaa) >>> 0,
			])
		)
		assert.deepStrictEqual(backing, backingSnap)

		const selfResult = andMask32Stable(viewA, viewA)
		assert.notStrictEqual(selfResult, viewA)
		assert.deepStrictEqual(selfResult, viewA)
	})

	test('satisfies boolean algebra laws (commutativity, associativity, idempotence, identity, annihilation)', () => {
		const rng = makePrng(0x20261123)
		const len = 16
		const a = Uint32Array.from({ length: len }, () => rng())
		const b = Uint32Array.from({ length: len }, () => rng())
		const c = Uint32Array.from({ length: len }, () => rng())
		const zeros = new Uint32Array(len)
		const ones = new Uint32Array(len).fill(0xffffffff)

		// Commutativity: a & b === b & a
		assert.deepStrictEqual(andMask32Stable(a, b), andMask32Stable(b, a))

		// Associativity: (a & b) & c === a & (b & c)
		assert.deepStrictEqual(
			andMask32Stable(andMask32Stable(a, b), c),
			andMask32Stable(a, andMask32Stable(b, c))
		)

		// Idempotence: a & a === a
		assert.deepStrictEqual(andMask32Stable(a, a), a)

		// Identity: a & 1s === a
		assert.deepStrictEqual(andMask32Stable(a, ones), a)

		// Annihilation: a & 0s === 0s
		assert.deepStrictEqual(andMask32Stable(a, zeros), zeros)
	})

	test('throws RangeError on mismatched lengths', () => {
		assert.throws(
			() => andMask32Stable(new Uint32Array([1, 2]), new Uint32Array([1])),
			RangeError
		)
		assert.throws(
			() => andMask32Stable(new Uint32Array(0), new Uint32Array(1)),
			RangeError
		)
		assert.throws(
			() => andMask32Stable(new Uint32Array(5), new Uint32Array(4)),
			RangeError
		)
	})

	test('throws TypeError on invalid input types', () => {
		const valid = new Uint32Array([1, 2])
		const invalidValues = [
			null,
			undefined,
			[1, 2],
			new Int32Array([1, 2]),
			new Uint16Array([1, 2]),
			new Uint8Array([1, 2]),
			new BigUint64Array([1n, 2n]),
			new Float64Array([1, 2]),
			new ArrayBuffer(8),
			42,
			'12',
			{ length: 2, 0: 1, 1: 2 },
		]

		for (const bad of invalidValues) {
			assert.throws(() => andMask32Stable(bad, valid), TypeError)
			assert.throws(() => andMask32Stable(valid, bad), TypeError)
		}
	})

	test('throws TypeError on detached ArrayBuffer', () => {
		if (typeof ArrayBuffer.prototype.transfer !== 'function') {
			return
		}
		const bufA = new ArrayBuffer(8)
		const a = new Uint32Array(bufA)
		const b = new Uint32Array(2)
		bufA.transfer()

		assert.throws(() => andMask32Stable(a, b), TypeError)
		assert.throws(() => andMask32Stable(b, a), TypeError)
	})

	test('cross-check: De Morgan law a & b === ~((~a) | (~b)) across multi-word masks', () => {
		const rng = makePrng(0xdeadcafe)
		for (const len of [0, 1, 2, 7, 32, 64]) {
			const a = Uint32Array.from({ length: len }, () => rng())
			const b = Uint32Array.from({ length: len }, () => rng())

			const actual = andMask32Stable(a, b)
			const deMorgan = new Uint32Array(len)
			for (let i = 0; i < len; i++) {
				const notA = (~a[i]) >>> 0
				const notB = (~b[i]) >>> 0
				deMorgan[i] = (~((notA | notB) >>> 0)) >>> 0
			}

			assert.deepStrictEqual(actual, deMorgan)
		}
	})

	test('cross-check: independent BigInt bitwise AND across random multi-word masks', () => {
		const rng = makePrng(0x1337c0de)
		for (const len of [0, 1, 3, 16, 65]) {
			const a = Uint32Array.from({ length: len }, () => rng())
			const b = Uint32Array.from({ length: len }, () => rng())

			const actual = andMask32Stable(a, b)
			const expected = bigIntToWords(wordsToBigInt(a) & wordsToBigInt(b), len)

			assert.deepStrictEqual(actual, expected)
		}
	})

	test('cross-check: independent bit-by-bit boolean array AND', () => {
		const rng = makePrng(0x9e3779b9)
		const a = Uint32Array.from({ length: 12 }, () => rng())
		const b = Uint32Array.from({ length: 12 }, () => rng())
		// Include boundary bitmasks explicitly
		a[0] = 0x80000000
		b[0] = 0xffffffff
		a[1] = 0x7fffffff
		b[1] = 0x80000001

		const bitsA = wordsToBools(a)
		const bitsB = wordsToBools(b)
		const bitsAnd = bitsA.map((bit, idx) => bit && bitsB[idx])
		const expected = boolsToWords(bitsAnd)

		assert.deepStrictEqual(andMask32Stable(a, b), expected)
	})
})
