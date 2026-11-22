import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { andMask32Stable } from './andMask32Stable.js'

/**
 * Independent reference implementation via BigInt bitmasks.
 * Converts a Uint32Array (little-endian 32-bit words) into a non-negative BigInt.
 */
function wordsToBigInt(words) {
	let acc = 0n
	for (let i = words.length - 1; i >= 0; i -= 1) {
		acc = (acc << 32n) | BigInt(words[i] >>> 0)
	}
	return acc
}

/**
 * Converts a non-negative BigInt back into a fixed-length Uint32Array.
 */
function bigIntToWords(value, wordCount) {
	const out = new Uint32Array(wordCount)
	let cur = value
	for (let i = 0; i < wordCount; i += 1) {
		out[i] = Number(cur & 0xffffffffn) >>> 0
		cur >>= 32n
	}
	return out
}

/**
 * Deterministic PRNG (xorshift32) for reproducible property and cross-check tests.
 */
function createXorShift32(seed) {
	let state = seed >>> 0
	return () => {
		state ^= (state << 13) >>> 0
		state ^= state >>> 17
		state ^= (state << 5) >>> 0
		return state >>> 0
	}
}

describe('andMask32Stable', () => {
	it('computes bitwise AND for standard single-word and multi-word masks', () => {
		const singleA = new Uint32Array([0b11001010])
		const singleB = new Uint32Array([0b10101100])
		const singleRes = andMask32Stable(singleA, singleB)
		assert.ok(singleRes instanceof Uint32Array)
		assert.deepEqual(singleRes, new Uint32Array([0b10001000]))

		const a = new Uint32Array([0x0f0f0f0f, 0x12345678, 0xaaaaaaaa])
		const b = new Uint32Array([0x00ff00ff, 0xf0f0f0f0, 0x55555555])
		assert.deepEqual(
			andMask32Stable(a, b),
			new Uint32Array([0x000f000f, 0x10305070, 0x00000000]),
		)
	})

	it('preserves unsigned high-bit values (0x80000000 / 0xFFFFFFFF) without signed overflow', () => {
		const a = new Uint32Array([0x80000000, 0xffffffff, 0x80000001, 0xfedcba98])
		const b = new Uint32Array([0x80000000, 0xffffffff, 0x80000000, 0x80000001])
		const res = andMask32Stable(a, b)

		assert.equal(res[0], 0x80000000)
		assert.equal(res[1], 0xffffffff)
		assert.equal(res[2], 0x80000000)
		assert.equal(res[3], 0x80000000)
		for (let i = 0; i < res.length; i += 1) {
			assert.ok(res[i] >= 0, `word ${i} must be non-negative`)
		}
	})

	it('handles empty Uint32Array inputs', () => {
		const a = new Uint32Array(0)
		const b = new Uint32Array(0)
		const res = andMask32Stable(a, b)
		assert.ok(res instanceof Uint32Array)
		assert.equal(res.length, 0)
		assert.notEqual(res, a)
		assert.notEqual(res, b)

		const resZeroBits = andMask32Stable(a, b, 0)
		assert.equal(resZeroBits.length, 0)
	})

	it('enforces defensive immutability and handles identical or overlapping aliased buffers', () => {
		// Identical reference (a === b)
		const same = new Uint32Array([0x80000001, 0xdeadbeef])
		const sameCopy = new Uint32Array(same)
		const sameRes = andMask32Stable(same, same)
		assert.deepEqual(sameRes, sameCopy)
		assert.notEqual(sameRes, same)
		assert.notEqual(sameRes.buffer, same.buffer)

		// Mutating output must not affect inputs
		sameRes[0] = 0
		assert.deepEqual(same, sameCopy)

		// Overlapping subarrays sharing one underlying ArrayBuffer
		const backing = new Uint32Array([
			0xffffffff, 0x800000ff, 0x0f0f0f0f, 0xf0f0f0f0, 0xaaaaaaaa,
		])
		const snapshot = new Uint32Array(backing)
		const subA = backing.subarray(0, 4)
		const subB = backing.subarray(1, 5)
		const res = andMask32Stable(subA, subB)

		assert.deepEqual(
			res,
			new Uint32Array([
				(0xffffffff & 0x800000ff) >>> 0,
				(0x800000ff & 0x0f0f0f0f) >>> 0,
				(0x0f0f0f0f & 0xf0f0f0f0) >>> 0,
				(0xf0f0f0f0 & 0xaaaaaaaa) >>> 0,
			]),
		)
		assert.notEqual(res.buffer, backing.buffer)
		assert.deepEqual(backing, snapshot)
	})

	it('clamps trailing bits beyond optional bitLength (numeric and options object)', () => {
		const a = new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff])
		const b = new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff])

		// bitLength = 0 zeroes everything
		assert.deepEqual(
			andMask32Stable(a, b, 0),
			new Uint32Array([0, 0, 0]),
		)

		// bitLength = 1 keeps only bit 0 of word 0
		assert.deepEqual(
			andMask32Stable(a, b, 1),
			new Uint32Array([0x00000001, 0, 0]),
		)

		// bitLength = 31 keeps bits 0..30 of word 0 (no signed shift overflow)
		assert.deepEqual(
			andMask32Stable(a, b, 31),
			new Uint32Array([0x7fffffff, 0, 0]),
		)

		// bitLength = 32 keeps full word 0, zeroes words 1..2
		assert.deepEqual(
			andMask32Stable(a, b, 32),
			new Uint32Array([0xffffffff, 0, 0]),
		)

		// bitLength = 33 keeps word 0 and bit 0 of word 1
		assert.deepEqual(
			andMask32Stable(a, b, 33),
			new Uint32Array([0xffffffff, 0x00000001, 0]),
		)

		// Options object form and full length
		assert.deepEqual(
			andMask32Stable(a, b, { bitLength: 63 }),
			new Uint32Array([0xffffffff, 0x7fffffff, 0]),
		)
		assert.deepEqual(
			andMask32Stable(a, b, { bitLength: 96 }),
			new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff]),
		)
		assert.deepEqual(
			andMask32Stable(a, b, {}),
			new Uint32Array([0xffffffff, 0xffffffff, 0xffffffff]),
		)
	})

	it('validates inputs and throws appropriate errors', () => {
		const valid = new Uint32Array([1, 2])

		// Non-Uint32Array inputs
		for (const bad of [
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
		]) {
			assert.throws(() => andMask32Stable(bad, valid), TypeError)
			assert.throws(() => andMask32Stable(valid, bad), TypeError)
		}

		// Mismatched lengths
		assert.throws(
			() => andMask32Stable(new Uint32Array([1, 2]), new Uint32Array([1])),
			RangeError,
		)
		assert.throws(
			() => andMask32Stable(new Uint32Array(0), new Uint32Array(1)),
			RangeError,
		)

		// Invalid bitLength types
		for (const badOpt of [
			null,
			'32',
			true,
			[32],
			NaN,
			Infinity,
			-Infinity,
			1.5,
			{ bitLength: '32' },
			{ bitLength: 2.5 },
			{ bitLength: NaN },
		]) {
			assert.throws(() => andMask32Stable(valid, valid, badOpt), TypeError)
		}

		// Out-of-range bitLength
		assert.throws(() => andMask32Stable(valid, valid, -1), RangeError)
		assert.throws(() => andMask32Stable(valid, valid, 65), RangeError)
		assert.throws(
			() => andMask32Stable(valid, valid, { bitLength: 65 }),
			RangeError,
		)
		assert.throws(
			() => andMask32Stable(new Uint32Array(0), new Uint32Array(0), 1),
			RangeError,
		)

		// Detached ArrayBuffer
		const detachedBuf = new ArrayBuffer(8)
		const detachedView = new Uint32Array(detachedBuf)
		detachedBuf.transfer()
		assert.throws(
			() => andMask32Stable(detachedView, new Uint32Array(0)),
			TypeError,
		)
	})

	it('satisfies Boolean algebra laws (commutativity, idempotence, identity, annihilation, associativity)', () => {
		const next = createXorShift32(0x13579bdf)
		const a = new Uint32Array(8).map(() => next())
		const b = new Uint32Array(8).map(() => next())
		const c = new Uint32Array(8).map(() => next())
		const allOnes = new Uint32Array(8).fill(0xffffffff)
		const allZeros = new Uint32Array(8).fill(0)

		assert.deepEqual(andMask32Stable(a, b), andMask32Stable(b, a))
		assert.deepEqual(andMask32Stable(a, a), a)
		assert.deepEqual(andMask32Stable(a, allOnes), a)
		assert.deepEqual(andMask32Stable(a, allZeros), allZeros)
		assert.deepEqual(
			andMask32Stable(andMask32Stable(a, b), c),
			andMask32Stable(a, andMask32Stable(b, c)),
		)
	})

	it('cross-checks exact bit-for-bit equality against independent BigInt bitwise AND', () => {
		const next = createXorShift32(0xcafebabe)
		const wordLengths = [0, 1, 2, 3, 5, 16]

		for (const wordCount of wordLengths) {
			for (let trial = 0; trial < 20; trial += 1) {
				const a = new Uint32Array(wordCount)
				const b = new Uint32Array(wordCount)
				for (let i = 0; i < wordCount; i += 1) {
					// Mix PRNG output with deliberate high-bit patterns
					a[i] = trial % 4 === 0 ? (next() | 0x80000000) >>> 0 : next()
					b[i] = trial % 3 === 0 ? (next() | 0x80000000) >>> 0 : next()
				}

				// Full-width BigInt cross-check
				const actual = andMask32Stable(a, b)
				const expectedBigInt = wordsToBigInt(a) & wordsToBigInt(b)
				const expected = bigIntToWords(expectedBigInt, wordCount)
				assert.deepEqual(actual, expected)
				assert.equal(wordsToBigInt(actual), expectedBigInt)

				// Clamped bitLength BigInt cross-check
				if (wordCount > 0) {
					const totalBits = wordCount * 32
					const candidateLengths = [
						0,
						1,
						15,
						31,
						32,
						totalBits - 1,
						totalBits,
						next() % (totalBits + 1),
					].filter((n) => n <= totalBits)

					for (const bitLength of candidateLengths) {
						const actualClamped = andMask32Stable(a, b, bitLength)
						const mask =
							bitLength === 0 ? 0n : (1n << BigInt(bitLength)) - 1n
						const expectedClampedBig =
							(wordsToBigInt(a) & wordsToBigInt(b)) & mask
						const expectedClamped = bigIntToWords(
							expectedClampedBig,
							wordCount,
						)
						assert.deepEqual(actualClamped, expectedClamped)
						assert.equal(wordsToBigInt(actualClamped), expectedClampedBig)
					}
				}
			}
		}
	})
})
