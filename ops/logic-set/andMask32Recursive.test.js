import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { andMask32Recursive } from './andMask32Recursive.js'

/**
 * Independent BigInt reference for multi-word Uint32 bitmask AND.
 * Packs words as little-endian 32-bit limbs, applies BigInt `&`, and unpacks.
 *
 * @param {Uint32Array} a
 * @param {Uint32Array} b
 * @returns {Uint32Array}
 */
function referenceAndViaBigInt(a, b) {
	let bigA = 0n
	let bigB = 0n
	for (let i = 0; i < a.length; i++) {
		const shift = 32n * BigInt(i)
		bigA |= BigInt(a[i]) << shift
		bigB |= BigInt(b[i]) << shift
	}
	const bigResult = bigA & bigB
	const out = new Uint32Array(a.length)
	for (let i = 0; i < a.length; i++) {
		out[i] = Number((bigResult >> (32n * BigInt(i))) & 0xffffffffn)
	}
	return out
}

/**
 * Deterministic xorshift32 PRNG for reproducible test vectors.
 *
 * @param {number} seed
 * @returns {() => number}
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

describe('andMask32Recursive', () => {
	test('computes bitwise AND for standard multi-word bitmasks', () => {
		const a = new Uint32Array([0xf0f0f0f0, 0x12345678, 0xaaaa5555, 0x00ff00ff])
		const b = new Uint32Array([0x0ff00ff0, 0x87654321, 0x5555aaaa, 0x0f0f0f0f])
		const res = andMask32Recursive(a, b)

		assert.ok(res instanceof Uint32Array)
		assert.deepEqual(res, new Uint32Array([0x00f000f0, 0x02244220, 0x00000000, 0x000f000f]))
	})

	test('handles empty Uint32Array', () => {
		const a = new Uint32Array(0)
		const b = new Uint32Array(0)
		const res = andMask32Recursive(a, b)

		assert.ok(res instanceof Uint32Array)
		assert.equal(res.length, 0)
		assert.notEqual(res, a)
		assert.notEqual(res, b)
	})

	test('handles single-word Uint32Array', () => {
		const a = new Uint32Array([0b11001010])
		const b = new Uint32Array([0b10101100])
		const res = andMask32Recursive(a, b)

		assert.deepEqual(res, new Uint32Array([0b10001000]))
	})

	test('handles odd and even multi-word lengths', () => {
		for (const len of [2, 3, 4, 5, 7, 8, 9, 15, 16, 17, 31, 32, 33]) {
			const a = new Uint32Array(len)
			const b = new Uint32Array(len)
			const expected = new Uint32Array(len)
			for (let i = 0; i < len; i++) {
				a[i] = ((i * 0x9e3779b1) ^ 0x80000001) >>> 0
				b[i] = ((i * 0x85ebca6b) ^ 0xf0f0f0f0) >>> 0
				expected[i] = (a[i] & b[i]) >>> 0
			}
			assert.deepEqual(andMask32Recursive(a, b), expected)
		}
	})

	test('preserves unsigned 32-bit semantics for high bit 0x80000000 and 0xffffffff', () => {
		const a = new Uint32Array([0x80000000, 0xffffffff, 0x80000000, 0xffffffff, 0x7fffffff])
		const b = new Uint32Array([0x80000000, 0xffffffff, 0xffffffff, 0x00000000, 0x80000000])
		const res = andMask32Recursive(a, b)

		assert.deepEqual(res, new Uint32Array([0x80000000, 0xffffffff, 0x80000000, 0x00000000, 0x00000000]))
		assert.equal(res[0], 2147483648)
		assert.equal(res[1], 4294967295)
		assert.equal(res[2], 2147483648)
	})

	test('satisfies algebraic laws (identity, annihilator, idempotence, commutativity)', () => {
		const x = new Uint32Array([0xdeadbeef, 0x80000001, 0x00000000, 0xffffffff, 0x13579bdf])
		const y = new Uint32Array([0xfeedface, 0x7fffffff, 0x12345678, 0xa5a5a5a5, 0x2468ace0])
		const ones = new Uint32Array(x.length).fill(0xffffffff)
		const zeros = new Uint32Array(x.length).fill(0)

		assert.deepEqual(andMask32Recursive(x, ones), x)
		assert.deepEqual(andMask32Recursive(x, zeros), zeros)
		assert.deepEqual(andMask32Recursive(x, x), x)
		assert.deepEqual(andMask32Recursive(x, y), andMask32Recursive(y, x))
	})

	test('works with subarray views having non-zero byte offsets', () => {
		const bufA = new Uint32Array([0xffffffff, 0x800000ff, 0x0f0f0f0f, 0xaaaaaaaa, 0x11111111])
		const bufB = new Uint32Array([0x00000000, 0x8000ff00, 0x00ff00ff, 0xffff0000, 0x22222222])
		const viewA = bufA.subarray(1, 4)
		const viewB = bufB.subarray(1, 4)

		assert.deepEqual(andMask32Recursive(viewA, viewB), new Uint32Array([0x80000000, 0x000f000f, 0xaaaa0000]))
	})

	test('does not mutate input arrays and returns a fresh Uint32Array', () => {
		const a = new Uint32Array([0xffffffff, 0x80000000, 0x12345678])
		const b = new Uint32Array([0x0f0f0f0f, 0x80000001, 0xfedcba98])
		const snapshotA = new Uint32Array(a)
		const snapshotB = new Uint32Array(b)

		const res = andMask32Recursive(a, b)
		assert.notEqual(res, a)
		assert.notEqual(res, b)
		assert.deepEqual(a, snapshotA)
		assert.deepEqual(b, snapshotB)

		// Mutating result must not affect inputs
		res[0] = 0x11111111
		assert.deepEqual(a, snapshotA)
		assert.deepEqual(b, snapshotB)

		// Same reference passed twice must still return a distinct copy
		const selfRes = andMask32Recursive(a, a)
		assert.notEqual(selfRes, a)
		assert.deepEqual(selfRes, snapshotA)
	})

	test('throws TypeError for non-Uint32Array inputs', () => {
		const valid = new Uint32Array([1, 2])
		const invalidValues = [
			null,
			undefined,
			[1, 2],
			new Int32Array([1, 2]),
			new Uint16Array([1, 2]),
			new Uint8Array([1, 2]),
			new BigUint64Array([1n, 2n]),
			'12',
			42,
			{ length: 2, 0: 1, 1: 2 },
		]

		for (const bad of invalidValues) {
			assert.throws(() => andMask32Recursive(bad, valid), TypeError)
			assert.throws(() => andMask32Recursive(valid, bad), TypeError)
		}
	})

	test('throws RangeError for mismatched Uint32Array lengths', () => {
		assert.throws(
			() => andMask32Recursive(new Uint32Array([1]), new Uint32Array([1, 2])),
			RangeError,
		)
		assert.throws(
			() => andMask32Recursive(new Uint32Array(0), new Uint32Array([0])),
			RangeError,
		)
		assert.throws(
			() => andMask32Recursive(new Uint32Array(5), new Uint32Array(3)),
			RangeError,
		)
	})

	test('cross-checks against independent BigInt bitmask computation across varied lengths', () => {
		const nextUint32 = makeRng(0x20261122)
		const lengths = [0, 1, 2, 3, 5, 8, 13, 31, 32, 64, 129]

		for (const len of lengths) {
			const a = new Uint32Array(len)
			const b = new Uint32Array(len)
			for (let i = 0; i < len; i++) {
				a[i] = nextUint32()
				b[i] = nextUint32()
			}
			// Inject boundary words when non-empty
			if (len > 0) {
				a[0] = 0x80000000
				b[0] = 0xffffffff
				a[len - 1] = 0xffffffff
				b[len - 1] = 0x80000001
			}

			const actual = andMask32Recursive(a, b)
			const expected = referenceAndViaBigInt(a, b)
			assert.deepEqual(actual, expected)
		}
	})
})
