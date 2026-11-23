import { describe, test } from 'node:test'
import assert from 'node:assert'
import { xorBitsetIterative } from './xorBitsetIterative.js'

/**
 * Converts a non-negative BigInt bitset to a Set of 0-based set bit indices.
 *
 * @param {bigint} bitset
 * @returns {Set<number>}
 */
function bitsetToIndexSet(bitset) {
	const indices = new Set()
	let remaining = bitset
	let index = 0
	while (remaining > 0n) {
		if ((remaining & 1n) === 1n) {
			indices.add(index)
		}
		remaining >>= 1n
		index += 1
	}
	return indices
}

/**
 * Converts a Set of non-negative integer bit indices to a BigInt bitset.
 *
 * @param {Set<number>} indices
 * @returns {bigint}
 */
function indexSetToBitset(indices) {
	let bitset = 0n
	for (const index of indices) {
		bitset |= 1n << BigInt(index)
	}
	return bitset
}

/**
 * Computes the symmetric difference of two index Sets: (A \ B) U (B \ A).
 *
 * @param {Set<number>} setA
 * @param {Set<number>} setB
 * @returns {Set<number>}
 */
function symmetricDifferenceSets(setA, setB) {
	const diff = new Set()
	for (const item of setA) {
		if (!setB.has(item)) {
			diff.add(item)
		}
	}
	for (const item of setB) {
		if (!setA.has(item)) {
			diff.add(item)
		}
	}
	return diff
}

/**
 * Deterministic xorshift64* generator for reproducible arbitrary-width BigInt test vectors.
 *
 * @param {bigint} seed
 * @returns {(bitWidth: number) => bigint}
 */
function createBigIntGenerator(seed) {
	let state = seed & ((1n << 64n) - 1n)
	const mask64 = (1n << 64n) - 1n

	function next64() {
		state ^= state >> 12n
		state = (state ^ (state << 25n)) & mask64
		state ^= state >> 27n
		return (state * 0x2545f4914f6cdd1dn) & mask64
	}

	return function nextBigInt(bitWidth) {
		if (bitWidth <= 0) return 0n
		let value = 0n
		let bitsRemaining = bitWidth
		while (bitsRemaining > 0) {
			const chunkBits = Math.min(64, bitsRemaining)
			const chunkMask = (1n << BigInt(chunkBits)) - 1n
			value = (value << BigInt(chunkBits)) | (next64() & chunkMask)
			bitsRemaining -= chunkBits
		}
		return value
	}
}

describe('xorBitsetIterative', () => {
	test('computes XOR for basic overlapping, disjoint, and subset bitsets', () => {
		assert.strictEqual(xorBitsetIterative(0b1010n, 0b1100n), 0b0110n)
		assert.strictEqual(xorBitsetIterative(0b101010n, 0b010101n), 0b111111n)
		assert.strictEqual(xorBitsetIterative(0b1111n, 0b0101n), 0b1010n)
		assert.strictEqual(xorBitsetIterative(1n, 1n), 0n)
		assert.strictEqual(xorBitsetIterative(1n, 2n), 3n)
	})

	test('handles asymmetric bit widths cleanly', () => {
		const small = 0b101101n
		const large = (1n << 128n) | (1n << 64n) | 0b111100n
		const expected = (1n << 128n) | (1n << 64n) | 0b010001n

		assert.strictEqual(xorBitsetIterative(small, large), expected)
		assert.strictEqual(xorBitsetIterative(large, small), expected)
	})

	test('satisfies zero identity and self-XOR annihilation edge cases', () => {
		assert.strictEqual(xorBitsetIterative(0n, 0n), 0n)

		const samples = [
			0n,
			1n,
			0b10101100111n,
			(1n << 64n) - 1n,
			(1n << 300n) | (1n << 137n) | 1n,
		]

		for (const x of samples) {
			assert.strictEqual(xorBitsetIterative(x, 0n), x)
			assert.strictEqual(xorBitsetIterative(0n, x), x)
			assert.strictEqual(xorBitsetIterative(x, x), 0n)
		}
	})

	test('handles arbitrary widths greater than 256 bits', () => {
		const mask257 = (1n << 257n) - 1n
		const highBit512 = 1n << 512n
		const sparse1024 = (1n << 1024n) | (1n << 513n) | (1n << 256n) | 0b10101n
		const sparse1024B = (1n << 1024n) | (1n << 512n) | (1n << 256n) | 0b01100n

		assert.strictEqual(xorBitsetIterative(mask257, 1n << 256n), (1n << 256n) - 1n)
		assert.strictEqual(xorBitsetIterative(highBit512, mask257), highBit512 | mask257)
		assert.strictEqual(
			xorBitsetIterative(sparse1024, sparse1024B),
			(1n << 513n) | (1n << 512n) | 0b11001n,
		)
		assert.strictEqual(xorBitsetIterative(sparse1024, sparse1024), 0n)
	})

	test('satisfies commutativity, associativity, and involution laws', () => {
		const nextBigInt = createBigIntGenerator(0x123456789abcdef1n)
		const widths = [8, 32, 65, 257, 384]

		for (const width of widths) {
			const a = nextBigInt(width)
			const b = nextBigInt(width + 17)
			const c = nextBigInt(width + 31)

			// Commutativity: a ^ b === b ^ a
			assert.strictEqual(xorBitsetIterative(a, b), xorBitsetIterative(b, a))

			// Associativity: (a ^ b) ^ c === a ^ (b ^ c)
			assert.strictEqual(
				xorBitsetIterative(xorBitsetIterative(a, b), c),
				xorBitsetIterative(a, xorBitsetIterative(b, c)),
			)

			// Involution: (a ^ b) ^ b === a
			assert.strictEqual(xorBitsetIterative(xorBitsetIterative(a, b), b), a)
		}
	})

	test('rejects non-BigInt inputs with TypeError', () => {
		const invalidValues = [
			0,
			1,
			42,
			-1,
			NaN,
			Infinity,
			'0',
			'123',
			true,
			false,
			null,
			undefined,
			{},
			[],
			Symbol('bitset'),
		]

		for (const bad of invalidValues) {
			assert.throws(
				() => xorBitsetIterative(bad, 0n),
				{ name: 'TypeError' },
				`Expected TypeError for a=${String(bad)}`,
			)
			assert.throws(
				() => xorBitsetIterative(0n, bad),
				{ name: 'TypeError' },
				`Expected TypeError for b=${String(bad)}`,
			)
		}

		assert.throws(() => xorBitsetIterative(), { name: 'TypeError' })
		assert.throws(() => xorBitsetIterative(1n), { name: 'TypeError' })
	})

	test('rejects negative BigInt inputs with RangeError', () => {
		const negativeValues = [-1n, -2n, -(1n << 64n), -(1n << 300n)]

		for (const neg of negativeValues) {
			assert.throws(() => xorBitsetIterative(neg, 0n), { name: 'RangeError' })
			assert.throws(() => xorBitsetIterative(0n, neg), { name: 'RangeError' })
			assert.throws(() => xorBitsetIterative(neg, neg), { name: 'RangeError' })
		}
	})

	test('cross-checks against native BigInt XOR across deterministic arbitrary-width vectors', () => {
		const nextBigInt = createBigIntGenerator(0xfeedfacecafebeefn)
		const widthPairs = [
			[0, 0],
			[1, 1],
			[7, 13],
			[64, 64],
			[129, 256],
			[257, 513],
			[600, 1025],
		]

		for (const [wA, wB] of widthPairs) {
			for (let i = 0; i < 10; i++) {
				const a = nextBigInt(wA)
				const b = nextBigInt(wB)
				assert.strictEqual(xorBitsetIterative(a, b), a ^ b)
			}
		}
	})

	test('cross-checks against independent Set symmetric difference of bit indices', () => {
		const indexPairs = [
			[[], []],
			[[0, 2, 5], [1, 2, 4, 5]],
			[[0, 63, 64, 127], [63, 65, 127, 200]],
			[
				[0, 1, 7, 128, 255, 256, 300, 511, 512],
				[1, 3, 128, 256, 257, 400, 512, 600],
			],
		]

		for (const [indicesA, indicesB] of indexPairs) {
			const setA = new Set(indicesA)
			const setB = new Set(indicesB)
			const bitsetA = indexSetToBitset(setA)
			const bitsetB = indexSetToBitset(setB)

			const actual = xorBitsetIterative(bitsetA, bitsetB)
			const expectedSet = symmetricDifferenceSets(setA, setB)

			assert.deepStrictEqual(bitsetToIndexSet(actual), expectedSet)
			assert.strictEqual(actual, indexSetToBitset(expectedSet))
		}
	})
})
