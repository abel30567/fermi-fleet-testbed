import { test } from 'node:test'
import assert from 'node:assert/strict'
import { orMask32Series } from './orMask32Series.js'

/**
 * Independent bit-by-bit series reference:
 * sum_{k=0}^{31} (x_k + y_k - x_k * y_k) * 2^k using pure arithmetic (no bitwise ops).
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function orWordArithmeticSeries(x, y) {
	let result = 0
	let weight = 1
	let rx = x
	let ry = y
	for (let k = 0; k < 32; k++) {
		const xk = rx % 2
		const yk = ry % 2
		const bit = xk + yk - xk * yk
		result += bit * weight
		rx = (rx - xk) / 2
		ry = (ry - yk) / 2
		weight *= 2
	}
	return result
}

/**
 * Independent De Morgan reference: ~((~x) & (~y)) >>> 0.
 * @param {Uint32Array} a
 * @param {Uint32Array} b
 * @returns {Uint32Array}
 */
function orMaskDeMorgan(a, b) {
	const out = new Uint32Array(a.length)
	for (let i = 0; i < a.length; i++) {
		out[i] = (~((~a[i]) & (~b[i]))) >>> 0
	}
	return out
}

test('normal multi-word bitwise OR cases', () => {
	const a = new Uint32Array([0x00000000, 0x0f0f0f0f, 0x12345678, 0xaaaaaaaa])
	const b = new Uint32Array([0x00000000, 0xf0f0f0f0, 0x87654321, 0x55555555])
	const res = orMask32Series(a, b)

	assert.ok(res instanceof Uint32Array)
	assert.deepEqual(
		res,
		new Uint32Array([0x00000000, 0xffffffff, 0x97755779, 0xffffffff]),
	)
})

test('does not mutate inputs and returns a fresh Uint32Array', () => {
	const a = new Uint32Array([0x00ff00ff, 0x80000001])
	const b = new Uint32Array([0x0f0f0f0f, 0x0000ffff])
	const aCopy = new Uint32Array(a)
	const bCopy = new Uint32Array(b)

	const res = orMask32Series(a, b)
	assert.notEqual(res, a)
	assert.notEqual(res, b)
	assert.deepEqual(a, aCopy)
	assert.deepEqual(b, bCopy)
})

test('edge cases: empty arrays, all-zeros, all-ones, MSB (bit 31) boundaries', () => {
	const empty = orMask32Series(new Uint32Array(0), new Uint32Array(0))
	assert.ok(empty instanceof Uint32Array)
	assert.equal(empty.length, 0)

	const a = new Uint32Array([
		0x00000000,
		0xffffffff,
		0xffffffff,
		0x80000000,
		0x80000000,
		0x7fffffff,
		0x00000001,
		0x80000001,
	])
	const b = new Uint32Array([
		0xffffffff,
		0x00000000,
		0xffffffff,
		0x80000000,
		0x7fffffff,
		0x80000000,
		0x80000000,
		0x7ffffffe,
	])
	const expected = new Uint32Array([
		0xffffffff,
		0xffffffff,
		0xffffffff,
		0x80000000,
		0xffffffff,
		0xffffffff,
		0x80000001,
		0xffffffff,
	])
	assert.deepEqual(orMask32Series(a, b), expected)
})

test('aliased inputs and overlapping subarray views with non-zero byteOffset', () => {
	const buf = new Uint32Array([0x11111111, 0x22222222, 0x44444444, 0x88888888])
	// Self-aliasing: a === b (idempotence)
	const selfOr = orMask32Series(buf, buf)
	assert.notEqual(selfOr, buf)
	assert.deepEqual(selfOr, buf)

	// Overlapping subarrays with non-zero byteOffset
	const viewA = buf.subarray(1, 3) // [0x22222222, 0x44444444]
	const viewB = buf.subarray(2, 4) // [0x44444444, 0x88888888]
	const res = orMask32Series(viewA, viewB)
	assert.deepEqual(res, new Uint32Array([0x66666666, 0xcccccccc]))
	// Original buffer remains untouched
	assert.deepEqual(
		buf,
		new Uint32Array([0x11111111, 0x22222222, 0x44444444, 0x88888888]),
	)
})

test('Boolean algebra / set-union laws', () => {
	const a = new Uint32Array([0x13579bdf, 0xdeadbeef, 0x80000000, 0x00000000])
	const b = new Uint32Array([0x2468ace0, 0xcafebabe, 0x7fffffff, 0xffffffff])
	const c = new Uint32Array([0xf0e1d2c3, 0x01234567, 0xa5a5a5a5, 0x5a5a5a5a])
	const zero = new Uint32Array(4)
	const ones = new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff])

	// Commutativity: a | b === b | a
	assert.deepEqual(orMask32Series(a, b), orMask32Series(b, a))

	// Associativity: (a | b) | c === a | (b | c)
	assert.deepEqual(
		orMask32Series(orMask32Series(a, b), c),
		orMask32Series(a, orMask32Series(b, c)),
	)

	// Idempotence: a | a === a
	assert.deepEqual(orMask32Series(a, a), a)

	// Identity: a | 0 === a
	assert.deepEqual(orMask32Series(a, zero), a)

	// Dominance: a | ~0 === ~0
	assert.deepEqual(orMask32Series(a, ones), ones)
})

test('independent cross-checks against native OR, De Morgan, and pure arithmetic series', () => {
	// Deterministic PRNG (xorshift32) for reproducible coverage across 512 words
	let state = 0x9e3779b9
	const nextU32 = () => {
		state ^= state << 13
		state ^= state >>> 17
		state ^= state << 5
		return state >>> 0
	}

	const n = 512
	const a = new Uint32Array(n)
	const b = new Uint32Array(n)
	for (let i = 0; i < n; i++) {
		a[i] = nextU32()
		b[i] = nextU32()
	}

	const actual = orMask32Series(a, b)
	const deMorgan = orMaskDeMorgan(a, b)

	assert.deepEqual(actual, deMorgan)
	for (let i = 0; i < n; i++) {
		const nativeOr = (a[i] | b[i]) >>> 0
		const seriesOr = orWordArithmeticSeries(a[i], b[i])
		assert.equal(actual[i], nativeOr, `native mismatch at index ${i}`)
		assert.equal(actual[i], seriesOr, `series mismatch at index ${i}`)
	}
})

test('invalid inputs throw TypeError or RangeError', () => {
	const valid = new Uint32Array([1, 2, 3])

	// Non-Uint32Array inputs for first argument
	const badInputs = [
		null,
		undefined,
		42,
		'123',
		[1, 2, 3],
		{ length: 3 },
		new Int32Array([1, 2, 3]),
		new Uint16Array([1, 2, 3]),
		new Uint8Array([1, 2, 3]),
		new Float32Array([1, 2, 3]),
		new ArrayBuffer(12),
	]

	for (const bad of badInputs) {
		assert.throws(() => orMask32Series(bad, valid), TypeError)
		assert.throws(() => orMask32Series(valid, bad), TypeError)
	}

	// Length mismatch throws RangeError
	assert.throws(
		() => orMask32Series(new Uint32Array([1, 2]), new Uint32Array([1, 2, 3])),
		RangeError,
	)
	assert.throws(
		() => orMask32Series(new Uint32Array(0), new Uint32Array(1)),
		RangeError,
	)
})
