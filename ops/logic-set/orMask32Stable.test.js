import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { orMask32Stable } from './orMask32Stable.js'

/**
 * Independent reference conversion: Uint32Array (little-endian words) -> BigInt.
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
 * Independent reference conversion: BigInt -> Uint32Array of exact wordCount.
 * @param {bigint} value
 * @param {number} wordCount
 * @returns {Uint32Array}
 */
function bigIntToWords(value, wordCount) {
	const out = new Uint32Array(wordCount)
	let cur = value
	for (let i = 0; i < wordCount; i++) {
		out[i] = Number(cur & 0xffffffffn) >>> 0
		cur >>= 32n
	}
	return out
}

/**
 * Independent BigInt-based bitwise OR reference with optional bitLength masking.
 * @param {Uint32Array} a
 * @param {Uint32Array} b
 * @param {number} [bitLength]
 * @returns {Uint32Array}
 */
function referenceOrBigInt(a, b, bitLength) {
	let combined = wordsToBigInt(a) | wordsToBigInt(b)
	if (bitLength !== undefined) {
		const mask = (1n << BigInt(bitLength)) - 1n
		combined &= mask
	}
	return bigIntToWords(combined, a.length)
}

/**
 * Deterministic xorshift32 PRNG for reproducible cross-check vectors.
 * @param {number} seed
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

describe('orMask32Stable', () => {
	it('computes bitwise OR for normal multi-word masks and satisfies algebraic laws', () => {
		const a = new Uint32Array([0x0f0f0f0f, 0x12345678, 0x00000000])
		const b = new Uint32Array([0xf0f0f0f0, 0x00ff00ff, 0xdeadbeef])
		const c = new Uint32Array([0x00ff00ff, 0x0f0f0f0f, 0x11111111])
		const zero = new Uint32Array([0, 0, 0])
		const allOnes = new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff])

		const res = orMask32Stable(a, b)
		assert.ok(res instanceof Uint32Array)
		assert.deepEqual(res, new Uint32Array([0xffffffff, 0x12ff56ff, 0xdeadbeef]))

		// Commutativity: a | b == b | a
		assert.deepEqual(orMask32Stable(a, b), orMask32Stable(b, a))
		// Identity: a | 0 == a
		assert.deepEqual(orMask32Stable(a, zero), a)
		// Idempotence: a | a == a
		assert.deepEqual(orMask32Stable(a, a), a)
		// Domination: a | ~0 == ~0
		assert.deepEqual(orMask32Stable(a, allOnes), allOnes)
		// Associativity: (a | b) | c == a | (b | c)
		assert.deepEqual(
			orMask32Stable(orMask32Stable(a, b), c),
			orMask32Stable(a, orMask32Stable(b, c))
		)
	})

	it('handles high bits 0x80000000 and 0xFFFFFFFF without signed 32-bit overflow', () => {
		const a = new Uint32Array([0x80000000, 0x7fffffff, 0xffffffff, 0x80000001])
		const b = new Uint32Array([0x00000000, 0x80000000, 0x00000000, 0x7ffffffe])
		const res = orMask32Stable(a, b)

		assert.equal(res[0], 0x80000000)
		assert.equal(res[1], 0xffffffff)
		assert.equal(res[2], 0xffffffff)
		assert.equal(res[3], 0xffffffff)
		for (const word of res) {
			assert.ok(word >= 0 && word <= 0xffffffff, `Expected unsigned uint32, got ${word}`)
		}
	})

	it('handles empty Uint32Array and single-word Uint32Array', () => {
		const emptyA = new Uint32Array(0)
		const emptyB = new Uint32Array(0)
		const emptyRes = orMask32Stable(emptyA, emptyB)
		assert.ok(emptyRes instanceof Uint32Array)
		assert.equal(emptyRes.length, 0)
		assert.notEqual(emptyRes, emptyA)
		assert.notEqual(emptyRes, emptyB)

		const emptyMasked = orMask32Stable(emptyA, emptyB, { bitLength: 0 })
		assert.equal(emptyMasked.length, 0)

		const singleA = new Uint32Array([0x80000005])
		const singleB = new Uint32Array([0x0000000a])
		assert.deepEqual(orMask32Stable(singleA, singleB), new Uint32Array([0x8000000f]))
	})

	it('preserves defensive immutability with identical and overlapping/aliased buffers', () => {
		const backing = new Uint32Array([0x80000001, 0x00ff00ff, 0xf0f0f0f0, 0x01020304])
		const snapshot = new Uint32Array(backing)

		// Identical reference
		const sameRes = orMask32Stable(backing, backing)
		assert.deepEqual(sameRes, snapshot)
		assert.notEqual(sameRes.buffer, backing.buffer)

		// Overlapping subarray views into the same ArrayBuffer
		const viewA = backing.subarray(0, 3)
		const viewB = backing.subarray(1, 4)
		const overlapRes = orMask32Stable(viewA, viewB)
		assert.deepEqual(
			overlapRes,
			new Uint32Array([
				(0x80000001 | 0x00ff00ff) >>> 0,
				(0x00ff00ff | 0xf0f0f0f0) >>> 0,
				(0xf0f0f0f0 | 0x01020304) >>> 0
			])
		)
		assert.notEqual(overlapRes.buffer, backing.buffer)

		// Mutating output must not affect inputs or backing buffer
		overlapRes.fill(0)
		assert.deepEqual(backing, snapshot)
	})

	it('applies optional bitLength trailing-bit masking accurately across word boundaries', () => {
		const a = new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff])
		const b = new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff])

		assert.deepEqual(orMask32Stable(a, b, { bitLength: 0 }), new Uint32Array([0, 0, 0]))
		assert.deepEqual(orMask32Stable(a, b, { bitLength: 1 }), new Uint32Array([0x00000001, 0, 0]))
		assert.deepEqual(orMask32Stable(a, b, { bitLength: 31 }), new Uint32Array([0x7fffffff, 0, 0]))
		assert.deepEqual(orMask32Stable(a, b, { bitLength: 32 }), new Uint32Array([0xffffffff, 0, 0]))
		assert.deepEqual(
			orMask32Stable(a, b, { bitLength: 33 }),
			new Uint32Array([0xffffffff, 0x00000001, 0])
		)
		assert.deepEqual(
			orMask32Stable(a, b, { bitLength: 63 }),
			new Uint32Array([0xffffffff, 0x7fffffff, 0])
		)
		assert.deepEqual(
			orMask32Stable(a, b, { bitLength: 64 }),
			new Uint32Array([0xffffffff, 0xffffffff, 0])
		)
		assert.deepEqual(
			orMask32Stable(a, b, { bitLength: 96 }),
			new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff])
		)
	})

	it('throws on invalid inputs, mismatched lengths, detached buffers, and bad options', () => {
		const valid = new Uint32Array([1, 2])

		// Non-Uint32Array operands
		for (const bad of [
			null,
			undefined,
			[1, 2],
			new Int32Array([1, 2]),
			new Uint8Array([1, 2]),
			new Uint16Array([1, 2]),
			new BigUint64Array([1n, 2n]),
			42,
			'12',
			{}
		]) {
			assert.throws(() => orMask32Stable(bad, valid), TypeError)
			assert.throws(() => orMask32Stable(valid, bad), TypeError)
		}

		// Mismatched lengths
		assert.throws(() => orMask32Stable(new Uint32Array([1]), new Uint32Array([1, 2])), RangeError)
		assert.throws(() => orMask32Stable(new Uint32Array(0), new Uint32Array(1)), RangeError)

		// Invalid options container
		for (const badOpts of [null, 32, '32', [], true]) {
			assert.throws(() => orMask32Stable(valid, valid, badOpts), TypeError)
		}

		// Invalid bitLength types
		for (const badLen of ['32', null, NaN, Infinity, -Infinity, {}]) {
			assert.throws(() => orMask32Stable(valid, valid, { bitLength: badLen }), TypeError)
		}

		// Invalid bitLength ranges / non-integers
		for (const badRange of [-1, 1.5, 65, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => orMask32Stable(valid, valid, { bitLength: badRange }), RangeError)
		}

		// Detached ArrayBuffer
		const detachable = new Uint32Array([1, 2])
		structuredClone(detachable.buffer, { transfer: [detachable.buffer] })
		assert.throws(() => orMask32Stable(detachable, valid), TypeError)
		assert.throws(() => orMask32Stable(valid, detachable), TypeError)
	})

	it('matches independent BigInt bitmask OR computation bit-for-bit across random vectors', () => {
		const rng = makeRng(0x5eed1234)
		const wordCounts = [0, 1, 2, 3, 5, 11]

		for (const wordCount of wordCounts) {
			for (let trial = 0; trial < 20; trial++) {
				const a = new Uint32Array(wordCount)
				const b = new Uint32Array(wordCount)
				for (let i = 0; i < wordCount; i++) {
					a[i] = rng()
					b[i] = rng()
				}
				// Force high-bit stress on first trial for each non-empty size
				if (trial === 0 && wordCount > 0) {
					a[0] |= 0x80000000
					b[wordCount - 1] |= 0x80000000
				}

				const actual = orMask32Stable(a, b)
				const expected = referenceOrBigInt(a, b)
				assert.deepEqual(actual, expected)
				assert.equal(wordsToBigInt(actual), wordsToBigInt(a) | wordsToBigInt(b))

				// Cross-check several bitLength cutoffs including boundary values
				const maxBits = wordCount * 32
				const cutoffs = new Set([
					0,
					Math.min(1, maxBits),
					Math.min(31, maxBits),
					Math.min(32, maxBits),
					Math.min(33, maxBits),
					Math.floor(maxBits / 2),
					Math.max(0, maxBits - 1),
					maxBits
				])
				for (const bitLength of cutoffs) {
					const actualMasked = orMask32Stable(a, b, { bitLength })
					const expectedMasked = referenceOrBigInt(a, b, bitLength)
					assert.deepEqual(actualMasked, expectedMasked)
				}
			}
		}
	})
})
