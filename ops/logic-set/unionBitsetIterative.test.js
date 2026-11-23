import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { unionBitsetIterative } from './unionBitsetIterative.js'

/**
 * Reference helper: convert a non-negative BigInt bitset to a JS Set of set bit indices.
 *
 * @param {bigint} bitset
 * @returns {Set<number>}
 */
function bitsetToIndexSet(bitset) {
	const indices = new Set()
	let value = bitset
	let index = 0
	while (value > 0n) {
		if ((value & 1n) === 1n) {
			indices.add(index)
		}
		value >>= 1n
		index += 1
	}
	return indices
}

/**
 * Reference helper: convert an iterable of bit indices back to a BigInt bitset.
 *
 * @param {Iterable<number>} indices
 * @returns {bigint}
 */
function indexSetToBitset(indices) {
	let result = 0n
	for (const index of indices) {
		result += 1n << BigInt(index)
	}
	return result
}

describe('unionBitsetIterative', () => {
	it('unions normal overlapping bitsets', () => {
		assert.equal(unionBitsetIterative(0b1010n, 0b1100n), 0b1110n)
		assert.equal(unionBitsetIterative(0b010101n, 0b001110n), 0b011111n)
	})

	it('handles empty bitsets (0n) as identity element', () => {
		assert.equal(unionBitsetIterative(0n, 0n), 0n)
		assert.equal(unionBitsetIterative(0n, 0b10110n), 0b10110n)
		assert.equal(unionBitsetIterative(0b10110n, 0n), 0b10110n)
		assert.equal(unionBitsetIterative(0n, 0n, 0n), 0n)
	})

	it('handles disjoint bitsets', () => {
		assert.equal(unionBitsetIterative(0b101010n, 0b010101n), 0b111111n)
		assert.equal(unionBitsetIterative(1n << 0n, 1n << 10n), (1n << 10n) + 1n)
	})

	it('is idempotent on identical bitsets', () => {
		const mask = 0b1101011001011n
		assert.equal(unionBitsetIterative(mask, mask), mask)
		assert.equal(unionBitsetIterative(mask, mask, mask), mask)
	})

	it('handles subset and superset pairs', () => {
		const superset = 0b11111111n
		const subset = 0b00101100n
		assert.equal(unionBitsetIterative(superset, subset), superset)
		assert.equal(unionBitsetIterative(subset, superset), superset)
	})

	it('supports variadic union of three or more bitsets', () => {
		assert.equal(
			unionBitsetIterative(0b0001n, 0b0010n, 0b0100n, 0b1000n),
			0b1111n
		)
		assert.equal(
			unionBitsetIterative(0b1001n, 0n, 0b0110n, 0b1010n, 1n << 20n),
			(1n << 20n) + 0b1111n
		)
	})

	it('handles arbitrary-width bitsets exceeding 256 and 1024 bits', () => {
		const a = (1n << 300n) + (1n << 128n) + (1n << 5n) + 1n
		const b = (1n << 512n) + (1n << 300n) + (1n << 64n)
		const expected = (1n << 512n) + (1n << 300n) + (1n << 128n) + (1n << 64n) + (1n << 5n) + 1n
		assert.equal(unionBitsetIterative(a, b), expected)

		// Dense >1024-bit bitsets with alternating patterns
		const denseA = ((1n << 1200n) - 1n) / 3n // alternating bits 010101...
		const denseB = denseA << 1n // complementary alternating bits 101010...
		assert.equal(unionBitsetIterative(denseA, denseB), (1n << 1200n) - 1n)

		// Sparse very high bit combined with small bitset (tests short-circuit tail)
		const high = 1n << 4096n
		assert.equal(unionBitsetIterative(0b101n, high), high + 0b101n)
		assert.equal(unionBitsetIterative(high, 0b101n), high + 0b101n)
	})

	it('satisfies algebraic laws (commutativity and associativity)', () => {
		const a = (1n << 260n) + 0xdeadbeefn
		const b = (1n << 260n) + (1n << 130n) + 0x12345678n
		const c = (1n << 400n) + 0xf0f0f0f0n

		assert.equal(unionBitsetIterative(a, b), unionBitsetIterative(b, a))
		assert.equal(
			unionBitsetIterative(unionBitsetIterative(a, b), c),
			unionBitsetIterative(a, unionBitsetIterative(b, c))
		)
		assert.equal(
			unionBitsetIterative(a, b, c),
			unionBitsetIterative(c, a, b)
		)
	})

	it('throws TypeError for missing or non-BigInt arguments', () => {
		assert.throws(() => unionBitsetIterative(), TypeError)
		assert.throws(() => unionBitsetIterative(1n), TypeError)
		assert.throws(() => unionBitsetIterative(1, 2n), TypeError)
		assert.throws(() => unionBitsetIterative(1n, 2), TypeError)
		assert.throws(() => unionBitsetIterative(1n, 2n, 3), TypeError)
		assert.throws(() => unionBitsetIterative('1', 2n), TypeError)
		assert.throws(() => unionBitsetIterative(null, 2n), TypeError)
		assert.throws(() => unionBitsetIterative(1n, undefined), TypeError)
		assert.throws(() => unionBitsetIterative(true, 1n), TypeError)
		assert.throws(() => unionBitsetIterative({}, 1n), TypeError)
		assert.throws(() => unionBitsetIterative([1n], 1n), TypeError)
		assert.throws(() => unionBitsetIterative(NaN, 1n), TypeError)
	})

	it('throws RangeError for negative BigInt bitsets', () => {
		assert.throws(() => unionBitsetIterative(-1n, 0n), RangeError)
		assert.throws(() => unionBitsetIterative(0n, -1n), RangeError)
		assert.throws(() => unionBitsetIterative(1n, 2n, -5n), RangeError)
		assert.throws(() => unionBitsetIterative(-(1n << 300n), 1n), RangeError)
	})

	it('matches independent JS Set union over bit indices and native bitwise OR', () => {
		// Deterministic pseudo-random generator for reproducible arbitrary-width bitsets
		let seed = 0x5eed1234n
		const nextBitset = (maxBits) => {
			let out = 0n
			const chunks = Math.ceil(maxBits / 32)
			for (let i = 0; i < chunks; i += 1) {
				seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
				const word = seed >> 32n
				out = (out << 32n) + word
			}
			return out & ((1n << BigInt(maxBits)) - 1n)
		}

		const bitWidths = [8, 32, 64, 128, 257, 384, 520]
		for (const width of bitWidths) {
			const a = nextBitset(width)
			const b = nextBitset(width)
			const c = nextBitset(width)

			const actualPair = unionBitsetIterative(a, b)
			const nativePair = a | b
			const setUnionPair = new Set([...bitsetToIndexSet(a), ...bitsetToIndexSet(b)])

			assert.equal(actualPair, nativePair)
			assert.deepEqual(bitsetToIndexSet(actualPair), setUnionPair)
			assert.equal(actualPair, indexSetToBitset(setUnionPair))

			const actualTriple = unionBitsetIterative(a, b, c)
			const nativeTriple = a | b | c
			const setUnionTriple = new Set([
				...bitsetToIndexSet(a),
				...bitsetToIndexSet(b),
				...bitsetToIndexSet(c),
			])

			assert.equal(actualTriple, nativeTriple)
			assert.deepEqual(bitsetToIndexSet(actualTriple), setUnionTriple)
			assert.equal(actualTriple, indexSetToBitset(setUnionTriple))
		}
	})
})
