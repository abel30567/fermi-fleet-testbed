import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { notMask32Series } from './notMask32Series.js'

/**
 * Independent bit-by-bit series reference: expands a Uint32 word into 32 bits,
 * inverts each bit `(1 - b_k)`, and sums `(1 - b_k) * 2^k` up to `width` bits.
 */
function referenceBitSeriesNot(word, width = 32) {
	let acc = 0
	let weight = 1
	let remaining = word
	for (let k = 0; k < width; k++) {
		const bit = remaining % 2
		remaining = (remaining - bit) / 2
		acc += (1 - bit) * weight
		weight *= 2
	}
	return acc
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property cross-checks.
 */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return (t ^ (t >>> 14)) >>> 0
	}
}

describe('notMask32Series', () => {
	test('complements standard multi-word Uint32Array masks', () => {
		const input = new Uint32Array([
			0x00000000,
			0xffffffff,
			0x55555555,
			0xaaaaaaaa,
			0x0f0f0f0f,
			0xf0f0f0f0,
			0x12345678,
		])
		const expected = new Uint32Array([
			0xffffffff,
			0x00000000,
			0xaaaaaaaa,
			0x55555555,
			0xf0f0f0f0,
			0x0f0f0f0f,
			0xedcba987,
		])

		const result = notMask32Series(input)
		assert.ok(result instanceof Uint32Array)
		assert.deepEqual(result, expected)
	})

	test('handles single-word boundary values accurately', () => {
		const boundaries = new Uint32Array([
			0x00000000,
			0x00000001,
			0x7fffffff,
			0x80000000,
			0xfffffffe,
			0xffffffff,
			0x0000ffff,
			0xffff0000,
		])
		const expected = new Uint32Array([
			0xffffffff,
			0xfffffffe,
			0x80000000,
			0x7fffffff,
			0x00000001,
			0x00000000,
			0xffff0000,
			0x0000ffff,
		])

		assert.deepEqual(notMask32Series(boundaries), expected)
	})

	test('handles empty Uint32Array', () => {
		const empty = new Uint32Array(0)
		const result = notMask32Series(empty)
		assert.ok(result instanceof Uint32Array)
		assert.equal(result.length, 0)
		assert.notEqual(result, empty)
		assert.deepEqual(notMask32Series(empty, 0), new Uint32Array(0))
	})

	test('does not mutate input and respects subarray views with non-zero byteOffset', () => {
		const backing = new Uint32Array([0x11111111, 0x22222222, 0x33333333, 0x44444444])
		const view = backing.subarray(1, 3)
		const snapshot = new Uint32Array(backing)

		const result = notMask32Series(view)
		assert.deepEqual(result, new Uint32Array([0xdddddddd, 0xcccccccc]))
		assert.deepEqual(backing, snapshot)

		result[0] = 0
		assert.equal(view[0], 0x22222222)
	})

	test('supports optional bitLength across word boundaries and partial words', () => {
		const input = new Uint32Array([0xffffffff, 0x00000000, 0xabcdef12])

		// bitLength = 0 zeroes all words
		assert.deepEqual(notMask32Series(input, 0), new Uint32Array([0, 0, 0]))

		// bitLength = 1 complements only bit 0
		assert.deepEqual(
			notMask32Series(new Uint32Array([0xfffffffe]), 1),
			new Uint32Array([0x00000001]),
		)
		assert.deepEqual(
			notMask32Series(new Uint32Array([0xffffffff]), 1),
			new Uint32Array([0x00000000]),
		)

		// bitLength = 31 masks bit 31 to 0
		assert.deepEqual(
			notMask32Series(new Uint32Array([0x80000000]), 31),
			new Uint32Array([0x7fffffff]),
		)

		// bitLength = 32 complements first word only, zeroes rest
		assert.deepEqual(notMask32Series(input, 32), new Uint32Array([0x00000000, 0, 0]))

		// bitLength = 37 complements word 0 and low 5 bits of word 1
		assert.deepEqual(
			notMask32Series(new Uint32Array([0x00000000, 0xffffffe5, 0xffffffff]), 37),
			new Uint32Array([0xffffffff, 0x0000001a, 0x00000000]),
		)

		// bitLength = full capacity equals omitted bitLength
		assert.deepEqual(notMask32Series(input, 96), notMask32Series(input))
	})

	test('cross-checks against bitwise operator (~w >>> 0) and explicit bit-series expansion', () => {
		const rng = makeRng(0xc0ffee42)
		const words = new Uint32Array(256)
		for (let i = 0; i < words.length; i++) {
			words[i] = rng()
		}

		const result = notMask32Series(words)
		for (let i = 0; i < words.length; i++) {
			const expectedBitwise = (~words[i]) >>> 0
			const expectedSeries = referenceBitSeriesNot(words[i], 32)
			assert.equal(result[i], expectedBitwise)
			assert.equal(result[i], expectedSeries)
		}

		// Partial bitLength cross-check for every remainder 0..31
		const sample = new Uint32Array([rng(), rng(), rng()])
		for (let bitLen = 0; bitLen <= 96; bitLen++) {
			const partial = notMask32Series(sample, bitLen)
			const fullWords = Math.floor(bitLen / 32)
			const rem = bitLen % 32
			for (let w = 0; w < sample.length; w++) {
				if (w < fullWords) {
					assert.equal(partial[w], referenceBitSeriesNot(sample[w], 32))
				} else if (w === fullWords && rem > 0) {
					assert.equal(partial[w], referenceBitSeriesNot(sample[w], rem))
				} else {
					assert.equal(partial[w], 0)
				}
			}
		}
	})

	test('satisfies Boolean algebra identities: involution, complementation, and De Morgan laws', () => {
		const rng = makeRng(0x1337beef)
		const n = 128
		const a = new Uint32Array(n)
		const b = new Uint32Array(n)
		for (let i = 0; i < n; i++) {
			a[i] = rng()
			b[i] = rng()
		}

		const notA = notMask32Series(a)
		const notB = notMask32Series(b)

		// Involution: NOT(NOT(a)) === a
		assert.deepEqual(notMask32Series(notA), a)

		// Complementation & De Morgan's laws
		const aOrB = new Uint32Array(n)
		const aAndB = new Uint32Array(n)
		for (let i = 0; i < n; i++) {
			assert.equal((a[i] | notA[i]) >>> 0, 0xffffffff)
			assert.equal((a[i] & notA[i]) >>> 0, 0)
			assert.equal(a[i] + notA[i], 0xffffffff)
			aOrB[i] = (a[i] | b[i]) >>> 0
			aAndB[i] = (a[i] & b[i]) >>> 0
		}

		const notOr = notMask32Series(aOrB)
		const notAnd = notMask32Series(aAndB)
		for (let i = 0; i < n; i++) {
			assert.equal(notOr[i], (notA[i] & notB[i]) >>> 0)
			assert.equal(notAnd[i], (notA[i] | notB[i]) >>> 0)
		}
	})

	test('rejects invalid words inputs with TypeError', () => {
		const invalidInputs = [
			undefined,
			null,
			42,
			'1010',
			{},
			[0, 1, 2],
			new Int32Array([1, 2]),
			new Uint8Array([1, 2, 3, 4]),
			new Uint16Array([1, 2]),
			new Float32Array([1, 2]),
			new BigUint64Array([1n]),
			{ length: 1, [Symbol.toStringTag]: 'Uint32Array' },
		]

		for (const bad of invalidInputs) {
			assert.throws(() => notMask32Series(bad), TypeError)
		}
	})

	test('rejects invalid bitLength arguments with TypeError or RangeError', () => {
		const words = new Uint32Array([1, 2]) // maxBits = 64

		for (const badType of [null, '32', true, 32n, {}, []]) {
			assert.throws(() => notMask32Series(words, badType), TypeError)
		}

		for (const badRange of [-1, 65, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => notMask32Series(words, badRange), RangeError)
		}
	})
})
