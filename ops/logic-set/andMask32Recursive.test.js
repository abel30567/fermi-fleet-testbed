import test from 'node:test'
import assert from 'node:assert/strict'
import { andMask32Recursive } from './andMask32Recursive.js'

/**
 * Independent Set-based oracle: converts a Uint32Array mask to the set of
 * active bit indices.
 *
 * @param {Uint32Array} mask
 * @returns {Set<number>}
 */
function maskToBitSet(mask) {
	const bits = new Set()
	for (let w = 0; w < mask.length; w++) {
		const word = mask[w]
		for (let b = 0; b < 32; b++) {
			if ((word >>> b) & 1) {
				bits.add(w * 32 + b)
			}
		}
	}
	return bits
}

/**
 * Independent BigInt-based oracle: packs a Uint32Array into a BigInt
 * (little-endian by word).
 *
 * @param {Uint32Array} mask
 * @returns {bigint}
 */
function maskToBigInt(mask) {
	let acc = 0n
	for (let i = mask.length - 1; i >= 0; i--) {
		acc = (acc << 32n) | BigInt(mask[i])
	}
	return acc
}

/**
 * Unpacks a non-negative BigInt into a Uint32Array of the given word length.
 *
 * @param {bigint} value
 * @param {number} length
 * @returns {Uint32Array}
 */
function bigIntToMask(value, length) {
	const out = new Uint32Array(length)
	let cur = value
	for (let i = 0; i < length; i++) {
		out[i] = Number(cur & 0xffffffffn)
		cur >>= 32n
	}
	return out
}

/**
 * Deterministic xorshift32 PRNG for reproducible tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0 || 1
	return () => {
		state ^= (state << 13) >>> 0
		state ^= state >>> 17
		state ^= (state << 5) >>> 0
		return state >>> 0
	}
}

test('single-word normal cases including MSB / unsigned 32-bit boundary', () => {
	assert.deepEqual(
		andMask32Recursive(new Uint32Array([0b11001010]), new Uint32Array([0b10101100])),
		new Uint32Array([0b10001000])
	)
	assert.deepEqual(
		andMask32Recursive(new Uint32Array([0xffffffff]), new Uint32Array([0x80000001])),
		new Uint32Array([0x80000001])
	)
	assert.deepEqual(
		andMask32Recursive(new Uint32Array([0x80000000]), new Uint32Array([0x80000000])),
		new Uint32Array([0x80000000])
	)
	assert.deepEqual(
		andMask32Recursive(new Uint32Array([0xaaaaaaaa]), new Uint32Array([0x55555555])),
		new Uint32Array([0x00000000])
	)
})

test('multi-word even and odd lengths', () => {
	const a = new Uint32Array([0xf0f0f0f0, 0xffffffff, 0x12345678, 0x80000000, 0x00ff00ff])
	const b = new Uint32Array([0x0ff00ff0, 0xdeadbeef, 0x0f0f0f0f, 0xffffffff, 0xffff0000])
	const expected = new Uint32Array([
		0x00f000f0,
		0xdeadbeef,
		0x02040608,
		0x80000000,
		0x00ff0000,
	])
	const res = andMask32Recursive(a, b)
	assert.ok(res instanceof Uint32Array)
	assert.deepEqual(res, expected)
})

test('identity, absorbing, idempotent, and disjoint mask properties', () => {
	const a = new Uint32Array([0x01234567, 0x89abcdef, 0x00000000, 0xffffffff])
	const allOnes = new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff])
	const allZeros = new Uint32Array(4)
	const complement = new Uint32Array(a.map((w) => (~w) >>> 0))

	assert.deepEqual(andMask32Recursive(a, allOnes), a)
	assert.deepEqual(andMask32Recursive(a, allZeros), allZeros)
	assert.deepEqual(andMask32Recursive(a, a), a)
	assert.deepEqual(andMask32Recursive(a, complement), allZeros)
})

test('edge case: empty Uint32Array returns a distinct empty Uint32Array', () => {
	const a = new Uint32Array(0)
	const b = new Uint32Array(0)
	const res = andMask32Recursive(a, b)
	assert.ok(res instanceof Uint32Array)
	assert.equal(res.length, 0)
	assert.notEqual(res, a)
	assert.notEqual(res, b)
})

test('edge case: does not mutate inputs and supports subarray views with non-zero byteOffset', () => {
	const backingA = new Uint32Array([0xffffffff, 0x12345678, 0xabcdef01, 0x80000001, 0x0])
	const backingB = new Uint32Array([0x0, 0x0f0f0f0f, 0xff00ff00, 0xc0000003, 0xffffffff])
	const viewA = backingA.subarray(1, 4)
	const viewB = backingB.subarray(1, 4)
	const snapA = new Uint32Array(viewA)
	const snapB = new Uint32Array(viewB)

	const res = andMask32Recursive(viewA, viewB)
	assert.deepEqual(res, new Uint32Array([0x02040608, 0xab00ef00, 0x80000001]))
	assert.deepEqual(viewA, snapA)
	assert.deepEqual(viewB, snapB)
	assert.notEqual(res, viewA)
	assert.notEqual(res, viewB)
})

test('edge case: large non-power-of-two array handles O(log n) recursion depth cleanly', () => {
	const rng = makeRng(0x1337c0de)
	const len = 65537
	const a = new Uint32Array(len)
	const b = new Uint32Array(len)
	for (let i = 0; i < len; i++) {
		a[i] = rng()
		b[i] = rng()
	}

	const res = andMask32Recursive(a, b)
	assert.equal(res.length, len)
	for (let i = 0; i < len; i++) {
		assert.equal(res[i], (a[i] & b[i]) >>> 0)
	}
})

test('invalid inputs: throws TypeError for non-Uint32Array arguments', () => {
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
		42,
		'12',
		{ length: 2, 0: 1, 1: 2 },
	]

	for (const bad of invalidValues) {
		assert.throws(() => andMask32Recursive(bad, valid), TypeError)
		assert.throws(() => andMask32Recursive(valid, bad), TypeError)
	}
})

test('invalid inputs: throws RangeError on mismatched lengths', () => {
	assert.throws(
		() => andMask32Recursive(new Uint32Array(2), new Uint32Array(3)),
		RangeError
	)
	assert.throws(
		() => andMask32Recursive(new Uint32Array(0), new Uint32Array(1)),
		RangeError
	)
	assert.throws(
		() => andMask32Recursive(new Uint32Array(5), new Uint32Array(4)),
		RangeError
	)
})

test('independent cross-check: matches Set-based bit intersection oracle', () => {
	const rng = makeRng(0xfeedface)
	for (const len of [0, 1, 2, 3, 4, 5, 7, 8, 13, 16]) {
		const a = new Uint32Array(len)
		const b = new Uint32Array(len)
		for (let i = 0; i < len; i++) {
			a[i] = rng()
			b[i] = rng()
		}

		const actualBits = maskToBitSet(andMask32Recursive(a, b))
		const bitsA = maskToBitSet(a)
		const bitsB = maskToBitSet(b)
		const expectedBits = new Set([...bitsA].filter((bit) => bitsB.has(bit)))

		assert.deepEqual(actualBits, expectedBits)
	}
})

test('independent cross-check: matches BigInt bitwise AND oracle and algebraic laws', () => {
	const rng = makeRng(0xcafebabe)
	for (let len = 0; len <= 33; len++) {
		const a = new Uint32Array(len)
		const b = new Uint32Array(len)
		const c = new Uint32Array(len)
		for (let i = 0; i < len; i++) {
			a[i] = rng()
			b[i] = rng()
			c[i] = rng()
		}

		const res = andMask32Recursive(a, b)
		const oracle = bigIntToMask(maskToBigInt(a) & maskToBigInt(b), len)
		assert.deepEqual(res, oracle)

		// Commutativity: a & b === b & a
		assert.deepEqual(res, andMask32Recursive(b, a))

		// Associativity: (a & b) & c === a & (b & c)
		assert.deepEqual(
			andMask32Recursive(res, c),
			andMask32Recursive(a, andMask32Recursive(b, c))
		)
	}
})
