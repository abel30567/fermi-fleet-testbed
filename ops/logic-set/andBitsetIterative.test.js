import { describe, test } from 'node:test'
import assert from 'node:assert'
import { andBitsetIterative } from './andBitsetIterative.js'

/**
 * Helper: convert a non-negative BigInt bitset to a Set of set bit indices.
 * @param {bigint} bitset
 * @returns {Set<number>}
 */
function bitsetToIndexSet(bitset) {
	const indices = new Set()
	let rem = bitset
	let idx = 0
	while (rem > 0n) {
		if ((rem & 1n) === 1n) {
			indices.add(idx)
		}
		rem >>= 1n
		idx += 1
	}
	return indices
}

/**
 * Helper: convert a Set of bit indices to a BigInt bitset.
 * @param {Set<number>} indices
 * @returns {bigint}
 */
function indexSetToBitset(indices) {
	let result = 0n
	for (const idx of indices) {
		result |= 1n << BigInt(idx)
	}
	return result
}

describe('andBitsetIterative', () => {
	test('computes bitwise AND for normal overlapping bitsets', () => {
		assert.strictEqual(andBitsetIterative(0b110101n, 0b101101n), 0b100101n)
		assert.strictEqual(andBitsetIterative(0b10101010n, 0b11001100n), 0b10001000n)
		assert.strictEqual(andBitsetIterative(0xffn, 0x0fn), 0x0fn)
		assert.strictEqual(andBitsetIterative(0xdeadbeefn, 0x00ff00ffn), 0x00ad00efn)
	})

	test('handles zero bitsets', () => {
		assert.strictEqual(andBitsetIterative(0n, 0n), 0n)
		assert.strictEqual(andBitsetIterative(0n, 0b11111111n), 0n)
		assert.strictEqual(andBitsetIterative(0b11111111n, 0n), 0n)
		assert.strictEqual(andBitsetIterative(0n, (1n << 512n) - 1n), 0n)
		assert.strictEqual(andBitsetIterative((1n << 512n) - 1n, 0n), 0n)
	})

	test('handles disjoint bitsets', () => {
		const evenBits = 0x55555555555555555555555555555555n
		const oddBits = 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaan
		assert.strictEqual(andBitsetIterative(evenBits, oddBits), 0n)
		assert.strictEqual(andBitsetIterative(0xffffn, 0xffffn << 64n), 0n)
		assert.strictEqual(andBitsetIterative(1n << 300n, (1n << 300n) - 1n), 0n)
	})

	test('handles identical bitsets (idempotence)', () => {
		const samples = [
			0n,
			1n,
			0x80000000n,
			0xffffffffn,
			0xffffffffffffffffn,
			(1n << 300n) - 1n,
			(1n << 511n) | (1n << 256n) | (1n << 31n) | 1n,
		]
		for (const x of samples) {
			assert.strictEqual(andBitsetIterative(x, x), x)
		}
	})

	test('handles 32-bit word boundaries and high sign bit correctly', () => {
		// Bit 31 (0x80000000) exercises unsigned handling of 32-bit chunks
		assert.strictEqual(andBitsetIterative(0x80000000n, 0x80000000n), 0x80000000n)
		assert.strictEqual(andBitsetIterative(0xffffffffn, 0xffffffffn), 0xffffffffn)
		assert.strictEqual(
			andBitsetIterative((1n << 31n) | (1n << 32n) | (1n << 63n) | (1n << 64n), (1n << 31n) | (1n << 63n)),
			(1n << 31n) | (1n << 63n)
		)
	})

	test('handles arbitrary-width bitsets exceeding 256 bits', () => {
		const a = (1n << 1024n) | (1n << 777n) | (1n << 300n) | (1n << 257n) | (1n << 31n) | 1n
		const b = (1n << 1024n) | (1n << 512n) | (1n << 300n) | (1n << 256n) | (1n << 31n)
		const expected = (1n << 1024n) | (1n << 300n) | (1n << 31n)

		assert.strictEqual(andBitsetIterative(a, b), expected)
		assert.strictEqual(andBitsetIterative(b, a), expected)

		// Asymmetric widths: very wide bitset AND narrow bitset
		const wide = (1n << 2048n) | (1n << 1000n) | 0b10110n
		const narrow = 0b11010n
		assert.strictEqual(andBitsetIterative(wide, narrow), 0b10010n)
		assert.strictEqual(andBitsetIterative(narrow, wide), 0b10010n)
	})

	test('throws RangeError for negative BigInt inputs', () => {
		assert.throws(() => andBitsetIterative(-1n, 0n), RangeError)
		assert.throws(() => andBitsetIterative(0n, -1n), RangeError)
		assert.throws(() => andBitsetIterative(-1n, -1n), RangeError)
		assert.throws(() => andBitsetIterative(-(1n << 300n), 1n << 300n), RangeError)
		assert.throws(() => andBitsetIterative(1n << 300n, -(1n << 300n)), RangeError)
	})

	test('throws TypeError for non-BigInt inputs', () => {
		const invalidValues = [0, 1, 42, -5, NaN, Infinity, '1', '0b101', true, false, null, undefined, {}, [], new Set()]
		for (const invalid of invalidValues) {
			assert.throws(() => andBitsetIterative(invalid, 1n), TypeError)
			assert.throws(() => andBitsetIterative(1n, invalid), TypeError)
		}
		assert.throws(() => andBitsetIterative(), TypeError)
		assert.throws(() => andBitsetIterative(1n), TypeError)
	})

	test('cross-checks against native BigInt bitwise AND across varied widths', () => {
		// Deterministic LCG for reproducible pseudo-random arbitrary-width bitsets
		let seed = 0x123456789abcdef0n
		const nextWord = () => {
			seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
			return seed
		}
		const randomBigInt = (words64) => {
			let val = 0n
			for (let i = 0; i < words64; i += 1) {
				val = (val << 64n) | nextWord()
			}
			return val
		}

		const wordCounts = [0, 1, 2, 4, 5, 8, 12, 16]
		for (const wa of wordCounts) {
			for (const wb of wordCounts) {
				const a = randomBigInt(wa)
				const b = randomBigInt(wb)
				const actual = andBitsetIterative(a, b)
				assert.strictEqual(actual, a & b)
				assert.strictEqual(andBitsetIterative(b, a), actual)
			}
		}
	})

	test('cross-checks against Set intersection of bit indices', () => {
		const pairs = [
			[[0, 1, 2, 5, 31, 32, 63, 64, 255, 256, 300, 511], [1, 3, 5, 31, 33, 64, 128, 256, 300, 400]],
			[[0, 10, 20, 30], [5, 15, 25, 35]],
			[[], [0, 1, 2, 100]],
			[[31, 32, 63, 64, 95, 96, 280, 350], [31, 32, 63, 64, 95, 96, 280, 350]],
		]

		for (const [indicesA, indicesB] of pairs) {
			const setA = new Set(indicesA)
			const setB = new Set(indicesB)
			const expectedSet = new Set([...setA].filter((x) => setB.has(x)))

			const bitsetA = indexSetToBitset(setA)
			const bitsetB = indexSetToBitset(setB)

			const actual = andBitsetIterative(bitsetA, bitsetB)
			const actualSet = bitsetToIndexSet(actual)

			assert.deepStrictEqual(actualSet, expectedSet)
			assert.strictEqual(actual, indexSetToBitset(expectedSet))
		}
	})
})
