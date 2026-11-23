import { test } from 'node:test'
import assert from 'node:assert/strict'
import { orBitsetMemo } from './orBitsetMemo.js'

/**
 * Independent reference implementation converting BigInt bitsets to JS Sets of
 * active bit indices, computing the set union, and reconstructing the BigInt.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function referenceSetUnion(a, b) {
	const bits = new Set()
	for (let x = a, idx = 0n; x > 0n; x >>= 1n, idx++) {
		if ((x & 1n) === 1n) bits.add(idx)
	}
	for (let y = b, idx = 0n; y > 0n; y >>= 1n, idx++) {
		if ((y & 1n) === 1n) bits.add(idx)
	}
	let result = 0n
	for (const idx of bits) {
		result += 1n << idx
	}
	return result
}

/**
 * Deterministic xorshift32 PRNG for reproducible fuzz/property tests.
 * @param {number} seed
 */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state ^= state << 13
		state ^= state >>> 17
		state ^= state << 5
		return state >>> 0
	}
}

/**
 * Generates a deterministic BigInt of up to `bitWidth` bits.
 * @param {() => number} nextU32
 * @param {number} bitWidth
 * @returns {bigint}
 */
function randomBigInt(nextU32, bitWidth) {
	if (bitWidth <= 0) return 0n
	let value = 0n
	let remaining = bitWidth
	while (remaining > 0) {
		const chunkBits = Math.min(32, remaining)
		const mask = chunkBits === 32 ? 0xffffffff : (1 << chunkBits) - 1
		const chunk = BigInt((nextU32() & mask) >>> 0)
		value = (value << BigInt(chunkBits)) + chunk
		remaining -= chunkBits
	}
	return value
}

test('basic small and multi-byte bitset OR', () => {
	assert.equal(orBitsetMemo(0b1010n, 0b1100n), 0b1110n)
	assert.equal(orBitsetMemo(0b0101n, 0b1010n), 0b1111n)
	assert.equal(orBitsetMemo(0xffn, 0x00n), 0xffn)
	assert.equal(orBitsetMemo(0x1234n, 0x0f0fn), 0x1f3fn)
	assert.equal(orBitsetMemo(0xdeadbeefn, 0x00ff00ffn), 0xdeffbeffn)
	assert.equal(
		orBitsetMemo(0x0123456789abcdef0123456789abcdefn, 0xfedcba9876543210fedcba9876543210n),
		0xffffffffffffffffffffffffffffffffn,
	)
})

test('identity, zero, and idempotence edge cases', () => {
	assert.equal(orBitsetMemo(0n, 0n), 0n)
	const samples = [
		1n,
		2n,
		127n,
		255n,
		256n,
		65535n,
		(1n << 64n) - 1n,
		(1n << 521n) + 0xabn,
	]
	for (const x of samples) {
		assert.equal(orBitsetMemo(0n, x), x)
		assert.equal(orBitsetMemo(x, 0n), x)
		assert.equal(orBitsetMemo(x, x), x)
	}
})

test('asymmetric widths and odd/even hex length alignment', () => {
	const pairs = [
		[0x1n, 0x100n],
		[0x100n, 0x1n],
		[0xfn, 0x10fn],
		[0x10fn, 0x5n],
		[0xabcde123456n, 0x1234n],
		[0x1234n, 0xabcde123456n],
		[0xffn, 0x100n],
		[0x100n, 0xffn],
		[1n << 333n, 0b101101n],
		[0b101101n, 1n << 333n],
	]
	for (const [a, b] of pairs) {
		const expected = a | b
		assert.equal(orBitsetMemo(a, b), expected)
		assert.equal(orBitsetMemo(b, a), expected)
	}
})

test('arbitrary-width very large bitsets (including beyond memo hex threshold)', () => {
	const a = (1n << 10000n) + (1n << 4096n) + (1n << 123n) + 0x5an
	const b = (1n << 12345n) + (1n << 4096n) + (1n << 777n) + 0xa5n
	const expected = a | b
	assert.equal(orBitsetMemo(a, b), expected)
	assert.equal(orBitsetMemo(b, a), expected)

	// Dense 9000-bit operands (> 2048 hex chars each, exercises uncached large path)
	const denseA = ((1n << 9000n) - 1n) / 3n // alternating 0101...
	const denseB = denseA << 1n // alternating 1010...
	assert.equal(orBitsetMemo(denseA, denseB), denseA | denseB)
	assert.equal(orBitsetMemo(denseB, denseA), denseA | denseB)
})

test('algebraic laws: commutativity, associativity, absorption', () => {
	const nextU32 = makeRng(0x13579bdf)
	for (let i = 0; i < 60; i++) {
		const a = randomBigInt(nextU32, (i * 19) % 512)
		const b = randomBigInt(nextU32, (i * 31) % 512)
		const c = randomBigInt(nextU32, (i * 47) % 512)

		const ab = orBitsetMemo(a, b)
		const ba = orBitsetMemo(b, a)
		assert.equal(ab, ba, 'commutativity failed')

		assert.equal(
			orBitsetMemo(ab, c),
			orBitsetMemo(a, orBitsetMemo(b, c)),
			'associativity failed',
		)

		assert.equal(ab & a, a, 'union must contain all bits of a')
		assert.equal(ab & b, b, 'union must contain all bits of b')
	}
})

test('memoization repeated calls and bounded cache eviction', () => {
	// Repeated calls in both operand orders should agree identically
	const x = 0x123456789abcdef0123456n
	const y = 0x0fedcba9876543210fedcbn
	const first = orBitsetMemo(x, y)
	assert.equal(first, x | y)
	assert.equal(orBitsetMemo(x, y), first)
	assert.equal(orBitsetMemo(y, x), first)

	// Exceed MEMO_MAX_ENTRIES (4096) to verify cache eviction behaves cleanly
	for (let i = 0; i < 4500; i++) {
		const a = 0x100n + BigInt(i)
		const b = 0x10000n + BigInt(i * 3)
		assert.equal(orBitsetMemo(a, b), a | b)
	}
	// Re-query earlier pair after eviction
	assert.equal(orBitsetMemo(x, y), first)
})

test('exhaustive cross-check of all 256x256 single-byte pairs against native |', () => {
	for (let a = 0; a < 256; a++) {
		const ba = BigInt(a)
		for (let b = 0; b < 256; b++) {
			const bb = BigInt(b)
			assert.equal(orBitsetMemo(ba, bb), ba | bb)
		}
	}
})

test('independent cross-check against Set<bigint> bit-union and native |', () => {
	const nextU32 = makeRng(0xcafebabe)
	for (let i = 0; i < 200; i++) {
		const widthA = nextU32() % 600
		const widthB = nextU32() % 600
		const a = randomBigInt(nextU32, widthA)
		const b = randomBigInt(nextU32, widthB)

		const actual = orBitsetMemo(a, b)
		const expectedNative = a | b
		const expectedSet = referenceSetUnion(a, b)

		assert.equal(actual, expectedNative)
		assert.equal(actual, expectedSet)
	}
})

test('input validation rejects non-bigint and negative arguments', () => {
	const badTypes = [0, 1, NaN, Infinity, '0', '1', true, false, null, undefined, {}, [], Symbol('x')]
	for (const bad of badTypes) {
		assert.throws(() => orBitsetMemo(bad, 0n), TypeError)
		assert.throws(() => orBitsetMemo(0n, bad), TypeError)
	}

	assert.throws(() => orBitsetMemo(-1n, 0n), RangeError)
	assert.throws(() => orBitsetMemo(0n, -1n), RangeError)
	assert.throws(() => orBitsetMemo(-255n, -256n), RangeError)
	assert.throws(() => orBitsetMemo(-(1n << 200n), 1n), RangeError)
	assert.throws(() => orBitsetMemo(1n, -(1n << 200n)), RangeError)
})
