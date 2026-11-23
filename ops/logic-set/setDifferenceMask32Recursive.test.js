import test from 'node:test'
import assert from 'node:assert/strict'
import { setDifferenceMask32Recursive } from './setDifferenceMask32Recursive.js'

/**
 * Independent helper: decode a Uint32Array bitmask into a Set of bit indices.
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
 * Independent helper: deterministic xorshift32 PRNG for reproducible test vectors.
 *
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

test('single-word normal cases including MSB / unsigned 32-bit values', () => {
	assert.deepEqual(
		setDifferenceMask32Recursive(
			new Uint32Array([0b11001010]),
			new Uint32Array([0b10101000]),
		),
		new Uint32Array([0b01000010]),
	)

	// High bit (bit 31) preserved and cleared properly without signed overflow
	assert.deepEqual(
		setDifferenceMask32Recursive(
			new Uint32Array([0x80000001]),
			new Uint32Array([0x00000001]),
		),
		new Uint32Array([0x80000000]),
	)
	assert.deepEqual(
		setDifferenceMask32Recursive(
			new Uint32Array([0xffffffff]),
			new Uint32Array([0x80000000]),
		),
		new Uint32Array([0x7fffffff]),
	)
})

test('multi-word normal cases with even, odd, and non-power-of-two lengths', () => {
	const a = new Uint32Array([0xf0f0f0f0, 0xaaaaaaaa, 0x12345678, 0xffffffff, 0x0000ffff])
	const b = new Uint32Array([0x0f0f0f0f, 0x55555555, 0x0f0f0f0f, 0x00ff00ff, 0x000000ff])
	const expected = new Uint32Array([
		0xf0f0f0f0,
		0xaaaaaaaa,
		0x10305070,
		0xff00ff00,
		0x0000ff00,
	])

	assert.deepEqual(setDifferenceMask32Recursive(a, b), expected)
})

test('edge cases: empty masks, all-zeros, all-ones, and self-aliasing', () => {
	const empty = setDifferenceMask32Recursive(new Uint32Array(0), new Uint32Array(0))
	assert.ok(empty instanceof Uint32Array)
	assert.equal(empty.length, 0)

	const zeros = new Uint32Array([0, 0, 0])
	const ones = new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff])

	assert.deepEqual(setDifferenceMask32Recursive(ones, zeros), ones)
	assert.deepEqual(setDifferenceMask32Recursive(zeros, ones), zeros)
	assert.deepEqual(setDifferenceMask32Recursive(ones, ones), zeros)

	// Aliasing the exact same Uint32Array instance
	const aliased = new Uint32Array([0xdeadbeef, 0xcafebabe, 0x01234567])
	const aliasedSnapshot = aliased.slice()
	const selfDiff = setDifferenceMask32Recursive(aliased, aliased)
	assert.deepEqual(selfDiff, new Uint32Array([0, 0, 0]))
	assert.deepEqual(aliased, aliasedSnapshot)
	assert.notEqual(selfDiff, aliased)
})

test('does not mutate inputs and handles subarray views with non-zero byteOffset', () => {
	const backing = new Uint32Array([
		0x11111111,
		0xff00ff00,
		0x00ff00ff,
		0xf0f0f0f0,
		0x0f0f0f0f,
		0x22222222,
	])
	const backingSnapshot = backing.slice()

	// Overlapping views into the same ArrayBuffer
	const viewA = backing.subarray(1, 4) // [0xff00ff00, 0x00ff00ff, 0xf0f0f0f0]
	const viewB = backing.subarray(2, 5) // [0x00ff00ff, 0xf0f0f0f0, 0x0f0f0f0f]

	const result = setDifferenceMask32Recursive(viewA, viewB)
	assert.deepEqual(result, new Uint32Array([0xff00ff00, 0x000f000f, 0xf0f0f0f0]))
	assert.deepEqual(backing, backingSnapshot)
	assert.notEqual(result.buffer, backing.buffer)
})

test('handles large masks (4096 words / 131072 bits) via O(log n) recursion depth', () => {
	const n = 4096
	const rng = makeRng(0x1337c0de)
	const a = new Uint32Array(n)
	const b = new Uint32Array(n)
	const expected = new Uint32Array(n)
	for (let i = 0; i < n; i++) {
		a[i] = rng()
		b[i] = rng()
		expected[i] = (a[i] & ~b[i]) >>> 0
	}

	const actual = setDifferenceMask32Recursive(a, b)
	assert.deepEqual(actual, expected)
})

test('set-theoretic identities hold for set difference', () => {
	const rng = makeRng(0xabcdef01)
	const a = new Uint32Array(19)
	const b = new Uint32Array(19)
	for (let i = 0; i < a.length; i++) {
		a[i] = rng()
		b[i] = rng()
	}

	const diff = setDifferenceMask32Recursive(a, b)
	for (let i = 0; i < a.length; i++) {
		// (A \ B) ∩ B = ∅
		assert.equal((diff[i] & b[i]) >>> 0, 0)
		// (A \ B) ∪ (A ∩ B) = A
		assert.equal(((diff[i] | (a[i] & b[i])) >>> 0), a[i])
	}
})

test('invalid inputs throw TypeError or RangeError', () => {
	const valid = new Uint32Array([1, 2])
	const nonUint32 = [
		null,
		undefined,
		[1, 2],
		new Int32Array([1, 2]),
		new Uint8Array([1, 2]),
		new Uint16Array([1, 2]),
		new BigUint64Array([1n, 2n]),
		new ArrayBuffer(8),
		42,
		'12',
		{ length: 2, 0: 1, 1: 2 },
	]

	for (const bad of nonUint32) {
		assert.throws(() => setDifferenceMask32Recursive(bad, valid), TypeError)
		assert.throws(() => setDifferenceMask32Recursive(valid, bad), TypeError)
	}

	assert.throws(
		() => setDifferenceMask32Recursive(new Uint32Array(2), new Uint32Array(3)),
		RangeError,
	)
	assert.throws(
		() => setDifferenceMask32Recursive(new Uint32Array(0), new Uint32Array(1)),
		RangeError,
	)
})

test('independent cross-check against Set<number> bit-index set difference', () => {
	const rng = makeRng(0x9e3779b9)
	const lengths = [0, 1, 2, 3, 4, 5, 7, 8, 13, 17, 33, 64]

	for (const len of lengths) {
		const a = new Uint32Array(len)
		const b = new Uint32Array(len)
		for (let i = 0; i < len; i++) {
			a[i] = rng()
			b[i] = rng()
		}

		const actualMask = setDifferenceMask32Recursive(a, b)
		const actualBits = maskToBitSet(actualMask)

		const setA = maskToBitSet(a)
		const setB = maskToBitSet(b)
		const expectedBits = new Set()
		for (const bit of setA) {
			if (!setB.has(bit)) {
				expectedBits.add(bit)
			}
		}

		assert.deepEqual(
			actualBits,
			expectedBits,
			`bit-set mismatch for length ${len}`,
		)
	}
})
