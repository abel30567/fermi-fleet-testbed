import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unionMask32Series } from './unionMask32Series.js'

/**
 * Independent reference implementation converting a Uint32Array bitmask to a
 * JS Set of active bit indices.
 * @param {Uint32Array} mask
 * @returns {Set<number>}
 */
function maskToBitSet(mask) {
	const bits = new Set()
	for (let w = 0; w < mask.length; w++) {
		let word = mask[w]
		for (let b = 0; b < 32; b++) {
			if ((word & (1 << b)) !== 0) {
				bits.add(w * 32 + b)
			}
		}
	}
	return bits
}

/**
 * Converts a Set of bit indices back to a Uint32Array of the given word length.
 * @param {Set<number>} bits
 * @param {number} wordCount
 * @returns {Uint32Array}
 */
function bitSetToMask(bits, wordCount) {
	const out = new Uint32Array(wordCount)
	for (const idx of bits) {
		const w = Math.floor(idx / 32)
		const b = idx % 32
		out[w] = (out[w] | (1 << b)) >>> 0
	}
	return out
}

/**
 * Deterministic xorshift32 PRNG for reproducible fuzz testing.
 * @param {number} seed
 * @returns {() => number}
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
 * Counts set bits across a Uint32Array (popcount).
 * @param {Uint32Array} mask
 * @returns {number}
 */
function popcountMask(mask) {
	let total = 0
	for (let i = 0; i < mask.length; i++) {
		let v = mask[i]
		while (v !== 0) {
			v = (v & (v - 1)) >>> 0
			total++
		}
	}
	return total
}

test('normal cases: disjoint, overlapping, and multi-word bitmasks', () => {
	const a = new Uint32Array([0b1010, 0x0f0f0f0f, 0x12345678])
	const b = new Uint32Array([0b0101, 0xf0f0f0f0, 0x87654321])
	const res = unionMask32Series(a, b)

	assert.ok(res instanceof Uint32Array)
	assert.deepEqual(res, new Uint32Array([0b1111, 0xffffffff, 0x97755779]))
})

test('edge cases: empty Uint32Array returns empty Uint32Array', () => {
	const a = new Uint32Array(0)
	const b = new Uint32Array(0)
	const res = unionMask32Series(a, b)

	assert.ok(res instanceof Uint32Array)
	assert.equal(res.length, 0)
	assert.notEqual(res, a)
	assert.notEqual(res, b)
})

test('edge cases: unsigned 32-bit boundary values and high sign bit', () => {
	const a = new Uint32Array([
		0x00000000,
		0x80000000,
		0x80000000,
		0xffffffff,
		0xffffffff,
		0x7fffffff,
		0xaaaaaaaa,
	])
	const b = new Uint32Array([
		0x00000000,
		0x00000000,
		0x80000000,
		0xffffffff,
		0x00000001,
		0x80000000,
		0x55555555,
	])
	const expected = new Uint32Array([
		0x00000000,
		0x80000000,
		0x80000000,
		0xffffffff,
		0xffffffff,
		0xffffffff,
		0xffffffff,
	])

	assert.deepEqual(unionMask32Series(a, b), expected)
})

test('edge cases: immutability and aliased inputs (a === b)', () => {
	const a = new Uint32Array([0xdeadbeef, 0x00ff00ff])
	const aCopy = new Uint32Array(a)
	const b = new Uint32Array([0x0f0f0f0f, 0xf0f0f0f0])
	const bCopy = new Uint32Array(b)

	const res = unionMask32Series(a, b)
	assert.deepEqual(a, aCopy)
	assert.deepEqual(b, bCopy)
	assert.notEqual(res, a)
	assert.notEqual(res, b)

	const selfUnion = unionMask32Series(a, a)
	assert.deepEqual(selfUnion, a)
	assert.notEqual(selfUnion, a)
})

test('edge cases: subarray views with non-zero byteOffset', () => {
	const buf = new Uint32Array([0xffffffff, 0x11111111, 0x22222222, 0x44444444, 0x88888888])
	const viewA = buf.subarray(1, 3)
	const viewB = buf.subarray(3, 5)

	assert.deepEqual(unionMask32Series(viewA, viewB), new Uint32Array([0x55555555, 0xaaaaaaaa]))
})

test('boolean algebra laws: commutativity, associativity, idempotence, identity, absorption, complement', () => {
	const a = new Uint32Array([0x13579bdf, 0x80000001, 0x00ff00ff])
	const b = new Uint32Array([0x2468ace0, 0x7ffffffe, 0x0f0f0f0f])
	const c = new Uint32Array([0xdeadbeef, 0xcafebabe, 0x12345678])
	const zero = new Uint32Array(3)
	const allOnes = new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff])
	const notA = new Uint32Array(a.map((w) => (~w) >>> 0))

	// Commutativity: A U B == B U A
	assert.deepEqual(unionMask32Series(a, b), unionMask32Series(b, a))
	// Associativity: (A U B) U C == A U (B U C)
	assert.deepEqual(
		unionMask32Series(unionMask32Series(a, b), c),
		unionMask32Series(a, unionMask32Series(b, c))
	)
	// Idempotence: A U A == A
	assert.deepEqual(unionMask32Series(a, a), a)
	// Identity: A U 0 == A
	assert.deepEqual(unionMask32Series(a, zero), a)
	// Absorbing element: A U U == U
	assert.deepEqual(unionMask32Series(a, allOnes), allOnes)
	// Complement: A U ~A == U
	assert.deepEqual(unionMask32Series(a, notA), allOnes)
})

test('independent cross-checks: Set-based bit union, De Morgan law, direct bitwise OR, and popcount inclusion-exclusion', () => {
	const rng = makeRng(0x9e3779b9)
	const lengths = [0, 1, 2, 5, 16, 65]

	for (const len of lengths) {
		const a = new Uint32Array(len)
		const b = new Uint32Array(len)
		for (let i = 0; i < len; i++) {
			a[i] = rng()
			b[i] = rng()
		}

		const actual = unionMask32Series(a, b)

		// 1. Direct bitwise OR reference
		const byOr = new Uint32Array(len)
		// 2. De Morgan's law reference: ~(~a & ~b)
		const byDeMorgan = new Uint32Array(len)
		// Intersection for popcount check
		const intersection = new Uint32Array(len)
		for (let i = 0; i < len; i++) {
			byOr[i] = (a[i] | b[i]) >>> 0
			byDeMorgan[i] = (~(~a[i] & ~b[i])) >>> 0
			intersection[i] = (a[i] & b[i]) >>> 0
		}

		assert.deepEqual(actual, byOr)
		assert.deepEqual(actual, byDeMorgan)

		// 3. Explicit JS Set of bit indices reference
		const setUnion = new Set([...maskToBitSet(a), ...maskToBitSet(b)])
		const bySet = bitSetToMask(setUnion, len)
		assert.deepEqual(actual, bySet)

		// 4. Cardinality inclusion-exclusion: |A U B| = |A| + |B| - |A n B|
		assert.equal(
			popcountMask(actual),
			popcountMask(a) + popcountMask(b) - popcountMask(intersection)
		)
	}
})

test('invalid inputs: throws TypeError for non-Uint32Array arguments', () => {
	const valid = new Uint32Array([1, 2])
	const invalidValues = [
		undefined,
		null,
		[1, 2],
		new Int32Array([1, 2]),
		new Uint16Array([1, 2]),
		new Uint8Array([1, 2]),
		new Float64Array([1, 2]),
		new ArrayBuffer(8),
		42,
		'0101',
		{ length: 2, 0: 1, 1: 2 },
	]

	assert.throws(() => unionMask32Series(), TypeError)
	assert.throws(() => unionMask32Series(valid), TypeError)

	for (const bad of invalidValues) {
		assert.throws(() => unionMask32Series(bad, valid), TypeError)
		assert.throws(() => unionMask32Series(valid, bad), TypeError)
	}
})

test('invalid inputs: throws RangeError for mismatched lengths', () => {
	assert.throws(
		() => unionMask32Series(new Uint32Array(0), new Uint32Array(1)),
		RangeError
	)
	assert.throws(
		() => unionMask32Series(new Uint32Array([1, 2, 3]), new Uint32Array([1, 2])),
		RangeError
	)
})
