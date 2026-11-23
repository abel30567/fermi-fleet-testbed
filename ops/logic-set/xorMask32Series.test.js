import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { xorMask32Series } from './xorMask32Series.js'

/**
 * Independent reference implementation via explicit 32-term bit-series sum:
 *   x XOR y = sum_{k=0}^{31} (((x_k + y_k) mod 2) * 2^k)
 */
function bitSeriesXorWord(x, y) {
	let result = 0
	let weight = 1
	let a = x >>> 0
	let b = y >>> 0
	for (let k = 0; k < 32; k++) {
		const ak = a % 2
		const bk = b % 2
		if ((ak + bk) % 2 === 1) {
			result += weight
		}
		a = (a - ak) / 2
		b = (b - bk) / 2
		weight *= 2
	}
	return result >>> 0
}

/**
 * Independent reference implementation using Boolean symmetric difference:
 *   x XOR y = (x & ~y) | (~x & y)
 */
function symmetricDiffXor(a, b) {
	const out = new Uint32Array(a.length)
	for (let i = 0; i < a.length; i++) {
		out[i] = (((a[i] & ~b[i]) | (~a[i] & b[i])) >>> 0)
	}
	return out
}

describe('xorMask32Series', () => {
	it('computes word-wise XOR for typical Uint32Array bitmasks', () => {
		const a = new Uint32Array([0b1010, 0x0f0f0f0f, 0x12345678, 0xdeadbeef])
		const b = new Uint32Array([0b1100, 0x00ff00ff, 0x87654321, 0xcafebabe])
		const res = xorMask32Series(a, b)

		assert.ok(res instanceof Uint32Array)
		assert.deepEqual(
			res,
			new Uint32Array([0b0110, 0x0ff00ff0, 0x95511559, 0x14530451])
		)
	})

	it('handles empty Uint32Array inputs and returns a fresh instance', () => {
		const a = new Uint32Array(0)
		const b = new Uint32Array(0)
		const res = xorMask32Series(a, b)

		assert.ok(res instanceof Uint32Array)
		assert.equal(res.length, 0)
		assert.notEqual(res, a)
		assert.notEqual(res, b)
	})

	it('handles boundary 32-bit unsigned values including high bit (bit 31)', () => {
		const a = new Uint32Array([
			0x00000000,
			0xffffffff,
			0xffffffff,
			0x80000000,
			0x80000000,
			0x7fffffff,
			0xaaaaaaaa,
		])
		const b = new Uint32Array([
			0x00000000,
			0x00000000,
			0xffffffff,
			0x00000000,
			0x80000000,
			0x80000000,
			0x55555555,
		])
		const res = xorMask32Series(a, b)

		assert.deepEqual(
			res,
			new Uint32Array([
				0x00000000,
				0xffffffff,
				0x00000000,
				0x80000000,
				0x00000000,
				0xffffffff,
				0xffffffff,
			])
		)
	})

	it('does not mutate inputs and works with aliased or overlapping subarrays', () => {
		const shared = new Uint32Array([0x11111111, 0x22222222, 0x44444444, 0x88888888])
		const snapshot = shared.slice()
		const left = shared.subarray(0, 3)
		const right = shared.subarray(1, 4)

		const res = xorMask32Series(left, right)
		assert.deepEqual(
			res,
			new Uint32Array([0x33333333, 0x66666666, 0xcccccccc])
		)
		assert.deepEqual(shared, snapshot)

		const selfXor = xorMask32Series(shared, shared)
		assert.deepEqual(selfXor, new Uint32Array([0, 0, 0, 0]))
		assert.deepEqual(shared, snapshot)
	})

	it('satisfies Boolean ring / group algebraic identities', () => {
		const a = new Uint32Array([0x01234567, 0x89abcdef, 0xfedcba98, 0x76543210])
		const b = new Uint32Array([0x13579bdf, 0x2468ace0, 0x0f1e2d3c, 0x4b5a6978])
		const c = new Uint32Array([0x99887766, 0x55443322, 0x1100ffee, 0xddccbbaa])
		const zero = new Uint32Array(a.length)

		// Commutativity: a ^ b == b ^ a
		assert.deepEqual(xorMask32Series(a, b), xorMask32Series(b, a))
		// Associativity: (a ^ b) ^ c == a ^ (b ^ c)
		assert.deepEqual(
			xorMask32Series(xorMask32Series(a, b), c),
			xorMask32Series(a, xorMask32Series(b, c))
		)
		// Identity: a ^ 0 == a
		assert.deepEqual(xorMask32Series(a, zero), a)
		// Self-inverse: a ^ a == 0
		assert.deepEqual(xorMask32Series(a, a), zero)
		// Involution: (a ^ b) ^ b == a
		assert.deepEqual(xorMask32Series(xorMask32Series(a, b), b), a)
	})

	it('cross-checks against native ^, bit-series sum, and Boolean symmetric difference on deterministic pseudorandom vectors', () => {
		// Deterministic xorshift32 PRNG for reproducible fuzz coverage
		let state = 0x6d2b79f5
		const nextU32 = () => {
			state ^= state << 13
			state ^= state >>> 17
			state ^= state << 5
			return state >>> 0
		}

		const n = 256
		const a = new Uint32Array(n)
		const b = new Uint32Array(n)
		for (let i = 0; i < n; i++) {
			a[i] = nextU32()
			b[i] = nextU32()
		}

		const actual = xorMask32Series(a, b)
		const viaSymDiff = symmetricDiffXor(a, b)
		assert.deepEqual(actual, viaSymDiff)

		for (let i = 0; i < n; i++) {
			assert.equal(actual[i], (a[i] ^ b[i]) >>> 0)
			assert.equal(actual[i], bitSeriesXorWord(a[i], b[i]))
		}
	})

	it('throws TypeError for invalid input types or detached buffers', () => {
		const valid = new Uint32Array([1, 2])
		const invalidValues = [
			undefined,
			null,
			42,
			'123',
			[1, 2],
			new Int32Array([1, 2]),
			new Uint8Array([1, 2]),
			new Uint16Array([1, 2]),
			new BigUint64Array([1n, 2n]),
			new ArrayBuffer(8),
			new DataView(new ArrayBuffer(8)),
			{ length: 2, 0: 1, 1: 2, [Symbol.toStringTag]: 'Uint32Array' },
		]

		for (const bad of invalidValues) {
			assert.throws(() => xorMask32Series(bad, valid), TypeError)
			assert.throws(() => xorMask32Series(valid, bad), TypeError)
		}

		// Detached ArrayBuffer check
		const buf1 = new ArrayBuffer(8)
		const detachedA = new Uint32Array(buf1)
		structuredClone(buf1, { transfer: [buf1] })
		assert.throws(() => xorMask32Series(detachedA, valid), TypeError)

		const buf2 = new ArrayBuffer(8)
		const detachedB = new Uint32Array(buf2)
		structuredClone(buf2, { transfer: [buf2] })
		assert.throws(() => xorMask32Series(valid, detachedB), TypeError)
	})

	it('throws RangeError when input lengths do not match', () => {
		const a = new Uint32Array([1, 2, 3])
		const b = new Uint32Array([1, 2])
		assert.throws(() => xorMask32Series(a, b), RangeError)
		assert.throws(() => xorMask32Series(new Uint32Array(0), b), RangeError)
	})
})
