import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { orBitsetRecursive } from './orBitsetRecursive.js'

/**
 * Independent bit-array reference implementation of bitwise OR for cross-checking.
 * Converts BigInts to LSB-first arrays of 0/1 bits, performs element-wise OR,
 * and reconstructs the resulting BigInt.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function orViaBitArray(a, b) {
	const bitsA = toBitArray(a)
	const bitsB = toBitArray(b)
	const len = Math.max(bitsA.length, bitsB.length)
	const resultBits = new Array(len)

	for (let i = 0; i < len; i++) {
		const bitA = i < bitsA.length ? bitsA[i] : 0
		const bitB = i < bitsB.length ? bitsB[i] : 0
		resultBits[i] = bitA === 1 || bitB === 1 ? 1 : 0
	}

	return fromBitArray(resultBits)
}

/**
 * @param {bigint} n
 * @returns {number[]}
 */
function toBitArray(n) {
	if (n === 0n) return [0]
	const bits = []
	let cur = n
	while (cur > 0n) {
		bits.push(Number(cur & 1n))
		cur >>= 1n
	}
	return bits
}

/**
 * @param {number[]} bits
 * @returns {bigint}
 */
function fromBitArray(bits) {
	let result = 0n
	for (let i = bits.length - 1; i >= 0; i--) {
		result = (result << 1n) + BigInt(bits[i])
	}
	return result
}

/**
 * Deterministic xorshift64* PRNG for reproducible arbitrary-width bitset generation.
 *
 * @param {bigint} seed
 * @returns {() => bigint}
 */
function createRng(seed) {
	let state = seed & ((1n << 64n) - 1n)
	return () => {
		state ^= state >> 12n
		state ^= (state << 25n) & ((1n << 64n) - 1n)
		state ^= state >> 27n
		return (state * 0x2545f4914f6cdd1dn) & ((1n << 64n) - 1n)
	}
}

/**
 * Generates a deterministic pseudo-random non-negative BigInt with at most `bitWidth` bits.
 *
 * @param {() => bigint} next64
 * @param {number} bitWidth
 * @returns {bigint}
 */
function randomBigInt(next64, bitWidth) {
	if (bitWidth <= 0) return 0n
	let value = 0n
	let remaining = bitWidth
	while (remaining > 0) {
		const chunkBits = Math.min(remaining, 64)
		const mask = (1n << BigInt(chunkBits)) - 1n
		value = (value << BigInt(chunkBits)) + (next64() & mask)
		remaining -= chunkBits
	}
	return value
}

describe('orBitsetRecursive', () => {
	test('single-bit truth table', () => {
		assert.equal(orBitsetRecursive(0n, 0n), 0n)
		assert.equal(orBitsetRecursive(0n, 1n), 1n)
		assert.equal(orBitsetRecursive(1n, 0n), 1n)
		assert.equal(orBitsetRecursive(1n, 1n), 1n)
	})

	test('normal cases with overlapping and asymmetric bitsets', () => {
		assert.equal(orBitsetRecursive(0b1010n, 0b1100n), 0b1110n)
		assert.equal(orBitsetRecursive(0b10101010n, 0b01010101n), 0b11111111n)
		assert.equal(orBitsetRecursive(0xdeadbeefn, 0x0f0f0f0fn), 0xdfafbfefn)

		const small = 0b101n
		const large = (1n << 130n) + (1n << 65n) + 0b010n
		assert.equal(orBitsetRecursive(small, large), (1n << 130n) + (1n << 65n) + 0b111n)
		assert.equal(orBitsetRecursive(large, small), (1n << 130n) + (1n << 65n) + 0b111n)
	})

	test('edge cases: 0n identity, identical bitsets, and disjoint bitsets', () => {
		const samples = [
			0n,
			1n,
			2n,
			3n,
			7n,
			0xffn,
			(1n << 64n) - 1n,
			(1n << 127n) + 42n,
			(1n << 600n) + (1n << 300n) + 1n
		]

		for (const x of samples) {
			assert.equal(orBitsetRecursive(x, 0n), x)
			assert.equal(orBitsetRecursive(0n, x), x)
			assert.equal(orBitsetRecursive(x, x), x)
		}

		// Disjoint high and low halves
		const lowHalf = (1n << 64n) - 1n
		const highHalf = lowHalf << 64n
		assert.equal(orBitsetRecursive(lowHalf, highHalf), (1n << 128n) - 1n)
		assert.equal(orBitsetRecursive(lowHalf, highHalf), lowHalf + highHalf)

		// Disjoint alternating even/odd bit positions across 128 bits
		let evenMask = 0n
		let oddMask = 0n
		for (let i = 0n; i < 128n; i++) {
			if (i % 2n === 0n) {
				evenMask += 1n << i
			} else {
				oddMask += 1n << i
			}
		}
		assert.equal(orBitsetRecursive(evenMask, oddMask), (1n << 128n) - 1n)
	})

	test('odd, prime, and power-of-two bit-width boundaries', () => {
		const widths = [1, 2, 3, 5, 7, 8, 9, 15, 16, 17, 31, 32, 33, 63, 64, 65, 127, 128, 129, 257, 513]
		for (const w of widths) {
			const topBit = 1n << BigInt(w - 1)
			const allOnes = (1n << BigInt(w)) - 1n
			const lowerAll = topBit - 1n
			assert.equal(orBitsetRecursive(topBit, lowerAll), allOnes)
			assert.equal(orBitsetRecursive(topBit, 1n), topBit | 1n)
			assert.equal(orBitsetRecursive(allOnes, topBit), allOnes)
		}
	})

	test('very wide bitsets (> 512 bits: 513, 1024, 2048, 4096 bits)', () => {
		// 513-bit sparse and boundary bits
		const a513 = (1n << 512n) + (1n << 256n) + 1n
		const b513 = (1n << 511n) + (1n << 256n) + (1n << 1n)
		assert.equal(orBitsetRecursive(a513, b513), a513 | b513)

		// 1024-bit dense alternating masks (disjoint -> all ones)
		const patternEven64 = 0x5555555555555555n
		const patternOdd64 = 0xaaaaaaaaaaaaaaaan
		let denseEven1024 = 0n
		let denseOdd1024 = 0n
		for (let i = 0; i < 16; i++) {
			denseEven1024 = (denseEven1024 << 64n) + patternEven64
			denseOdd1024 = (denseOdd1024 << 64n) + patternOdd64
		}
		assert.equal(orBitsetRecursive(denseEven1024, denseOdd1024), (1n << 1024n) - 1n)

		// 2048-bit and 4096-bit pseudo-random dense bitsets
		const rng = createRng(0x123456789abcdef0n)
		for (const width of [600, 1024, 2048, 4096]) {
			const x = randomBigInt(rng, width)
			const y = randomBigInt(rng, width)
			assert.equal(orBitsetRecursive(x, y), x | y)
		}
	})

	test('algebraic properties: commutativity, associativity, idempotence', () => {
		const rng = createRng(0xfedcba9876543210n)
		const widths = [1, 7, 32, 129, 520]

		for (const width of widths) {
			const a = randomBigInt(rng, width)
			const b = randomBigInt(rng, width)
			const c = randomBigInt(rng, width)

			// Commutativity: a | b === b | a
			assert.equal(orBitsetRecursive(a, b), orBitsetRecursive(b, a))

			// Associativity: (a | b) | c === a | (b | c)
			assert.equal(
				orBitsetRecursive(orBitsetRecursive(a, b), c),
				orBitsetRecursive(a, orBitsetRecursive(b, c))
			)

			// Idempotence: a | a === a
			assert.equal(orBitsetRecursive(a, a), a)
		}
	})

	test('cross-check against native BigInt | operator across varied bit-widths', () => {
		const rng = createRng(0x9e3779b97f4a7c15n)
		const widths = [0, 1, 2, 3, 4, 7, 8, 15, 16, 31, 32, 63, 64, 65, 128, 255, 512, 513, 768, 1024]

		for (const widthA of widths) {
			for (let trial = 0; trial < 10; trial++) {
				const widthB = widths[(trial * 3 + widthA) % widths.length]
				const a = randomBigInt(rng, widthA)
				const b = randomBigInt(rng, widthB)
				assert.equal(
					orBitsetRecursive(a, b),
					a | b,
					`Mismatch for widths (${widthA}, ${widthB})`
				)
			}
		}
	})

	test('cross-check against independent bit-array OR implementation', () => {
		const rng = createRng(0x0123456789abcdefn)
		const pairs = [
			[0n, 0n],
			[0n, 1n],
			[1n, 0n],
			[0b101101n, 0b011011n],
			[(1n << 65n) + 13n, (1n << 33n) + 0xffn],
			[randomBigInt(rng, 257), randomBigInt(rng, 193)],
			[randomBigInt(rng, 600), randomBigInt(rng, 600)],
			[randomBigInt(rng, 1024), randomBigInt(rng, 777)]
		]

		for (const [a, b] of pairs) {
			const recursiveResult = orBitsetRecursive(a, b)
			const bitArrayResult = orViaBitArray(a, b)
			assert.equal(recursiveResult, bitArrayResult)
			assert.equal(recursiveResult, a | b)
		}
	})

	test('validation errors for negative BigInts', () => {
		assert.throws(() => orBitsetRecursive(-1n, 0n), RangeError)
		assert.throws(() => orBitsetRecursive(0n, -1n), RangeError)
		assert.throws(() => orBitsetRecursive(-1n, -1n), RangeError)
		assert.throws(() => orBitsetRecursive(-(1n << 600n), 1n), RangeError)
		assert.throws(() => orBitsetRecursive(1n, -(1n << 600n)), RangeError)
	})

	test('validation errors for non-BigInt arguments', () => {
		const invalidValues = [
			0,
			1,
			42,
			-1,
			NaN,
			Infinity,
			'0',
			'1n',
			true,
			false,
			null,
			undefined,
			{},
			[],
			Symbol('bit')
		]

		for (const bad of invalidValues) {
			assert.throws(() => orBitsetRecursive(bad, 0n), TypeError)
			assert.throws(() => orBitsetRecursive(0n, bad), TypeError)
		}

		assert.throws(() => orBitsetRecursive(), TypeError)
		assert.throws(() => orBitsetRecursive(1n), TypeError)
	})
})
