import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { unionBitsetIterative } from './unionBitsetIterative.js'

/**
 * Independent helper: convert a non-negative BigInt bitset to a JS Set of bit indices.
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
		index++
	}
	return indices
}

/**
 * Independent helper: convert a JS Set of non-negative integer bit indices to a BigInt bitset.
 */
function indexSetToBitset(indices) {
	let bitset = 0n
	for (const idx of indices) {
		bitset += 1n << BigInt(idx)
	}
	return bitset
}

/**
 * Independent helper: compute popcount (set cardinality) of a non-negative BigInt bitset.
 */
function popcount(bitset) {
	let count = 0
	let remaining = bitset
	while (remaining > 0n) {
		remaining &= remaining - 1n
		count++
	}
	return count
}

/**
 * Deterministic PRNG (xorshift64*) for generating arbitrary-width test bitsets.
 */
function createBitsetGenerator(seed) {
	let state = seed
	const mask64 = (1n << 64n) - 1n
	function next64() {
		state ^= state >> 12n
		state ^= (state << 25n) & mask64
		state ^= state >> 27n
		return (state * 0x2545f4914f6cdd1dn) & mask64
	}
	return function nextBitset(numBits) {
		let value = 0n
		let produced = 0
		while (produced < numBits) {
			const chunk = next64()
			value = (value << 64n) | chunk
			produced += 64
		}
		const mask = (1n << BigInt(numBits)) - 1n
		return value & mask
	}
}

describe('unionBitsetIterative', () => {
	describe('normal cases', () => {
		it('computes the union of two disjoint bitsets', () => {
			assert.equal(unionBitsetIterative(0b1010n, 0b0101n), 0b1111n)
		})

		it('computes the union of two overlapping bitsets', () => {
			assert.equal(unionBitsetIterative(0b1100n, 0b1010n), 0b1110n)
		})

		it('computes the union of two identical bitsets', () => {
			assert.equal(unionBitsetIterative(0b101101n, 0b101101n), 0b101101n)
		})

		it('computes the union of multiple variadic bitsets', () => {
			assert.equal(
				unionBitsetIterative(0b10000n, 0b01000n, 0b00100n, 0b00010n, 0b00001n),
				0b11111n
			)
			assert.equal(
				unionBitsetIterative(0b101000n, 0b001100n, 0b000110n, 0b100001n),
				0b101111n
			)
		})

		it('computes the union when passed a single array of bitsets', () => {
			const inputs = [0b100001n, 0b010010n, 0b001100n]
			assert.equal(unionBitsetIterative(inputs), 0b111111n)
		})
	})

	describe('edge cases and arbitrary-width bitsets', () => {
		it('returns 0n for zero arguments or an empty array', () => {
			assert.equal(unionBitsetIterative(), 0n)
			assert.equal(unionBitsetIterative([]), 0n)
		})

		it('returns the bitset unchanged for a single argument', () => {
			assert.equal(unionBitsetIterative(0n), 0n)
			assert.equal(unionBitsetIterative(1n), 1n)
			const wide = (1n << 512n) | (1n << 17n) | 1n
			assert.equal(unionBitsetIterative(wide), wide)
			assert.equal(unionBitsetIterative([wide]), wide)
		})

		it('treats 0n as the identity element in any position', () => {
			const a = (1n << 100n) | 0b10101n
			assert.equal(unionBitsetIterative(0n, a), a)
			assert.equal(unionBitsetIterative(a, 0n), a)
			assert.equal(unionBitsetIterative(0n, 0n, a, 0n), a)
			assert.equal(unionBitsetIterative(0n, 0n), 0n)
		})

		it('handles bitsets wider than 32, 53, 64, and 10,000 bits without truncation', () => {
			const a = (1n << 31n) | (1n << 53n) | (1n << 64n) | (1n << 10000n)
			const b = (1n << 32n) | (1n << 54n) | (1n << 128n) | (1n << 10001n)
			const expected =
				(1n << 31n) |
				(1n << 32n) |
				(1n << 53n) |
				(1n << 54n) |
				(1n << 64n) |
				(1n << 128n) |
				(1n << 10000n) |
				(1n << 10001n)

			assert.equal(unionBitsetIterative(a, b), expected)
		})

		it('handles a large array of bitsets iteratively without call-stack issues', () => {
			const count = 10000
			const bitsets = new Array(count)
			for (let i = 0; i < count; i++) {
				bitsets[i] = 1n << BigInt(i)
			}
			const result = unionBitsetIterative(bitsets)
			assert.equal(result, (1n << BigInt(count)) - 1n)
		})
	})

	describe('input validation', () => {
		it('throws RangeError for negative BigInt bitsets', () => {
			assert.throws(() => unionBitsetIterative(-1n), RangeError)
			assert.throws(() => unionBitsetIterative(-1n, 0b101n), RangeError)
			assert.throws(() => unionBitsetIterative(0b101n, -2n), RangeError)
			assert.throws(
				() => unionBitsetIterative(1n, 2n, -(1n << 200n)),
				RangeError
			)
			assert.throws(() => unionBitsetIterative([1n, -1n, 4n]), RangeError)
		})

		it('throws TypeError for non-BigInt arguments', () => {
			const invalidValues = [
				0,
				5,
				NaN,
				Infinity,
				'1',
				'0b101',
				true,
				false,
				null,
				undefined,
				{},
				Symbol('bit'),
				new Set([1n]),
			]

			for (const bad of invalidValues) {
				assert.throws(() => unionBitsetIterative(bad), TypeError)
				assert.throws(() => unionBitsetIterative(1n, bad), TypeError)
				assert.throws(() => unionBitsetIterative([1n, bad]), TypeError)
			}
		})

		it('throws TypeError when mixing arrays with other arguments or nesting arrays', () => {
			assert.throws(() => unionBitsetIterative([1n], 2n), TypeError)
			assert.throws(() => unionBitsetIterative(1n, [2n]), TypeError)
			assert.throws(() => unionBitsetIterative([[1n]]), TypeError)
		})

		it('throws TypeError for sparse arrays with holes', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1n, , 2n]
			assert.throws(() => unionBitsetIterative(sparse), TypeError)
		})
	})

	describe('cross-checks and algebraic identities', () => {
		it('matches independent JS Set union over bit indices', () => {
			const nextBitset = createBitsetGenerator(0x123456789abcdef1n)
			for (const width of [8, 32, 64, 150, 300]) {
				const bitsets = [
					nextBitset(width),
					nextBitset(width),
					nextBitset(width),
					nextBitset(width),
				]

				const actual = unionBitsetIterative(...bitsets)
				const actualFromArray = unionBitsetIterative(bitsets)
				assert.equal(actualFromArray, actual)

				const expectedIndexSet = new Set()
				for (const bs of bitsets) {
					for (const idx of bitsetToIndexSet(bs)) {
						expectedIndexSet.add(idx)
					}
				}

				assert.deepEqual(bitsetToIndexSet(actual), expectedIndexSet)
				assert.equal(actual, indexSetToBitset(expectedIndexSet))
			}
		})

		it("satisfies De Morgan's Law over arbitrary-width universes", () => {
			const nextBitset = createBitsetGenerator(0xfedcba9876543211n)
			for (const width of [64, 256, 1024, 4096]) {
				const universe = (1n << BigInt(width)) - 1n
				const bitsets = [
					nextBitset(width),
					nextBitset(width),
					nextBitset(width),
					nextBitset(width),
					nextBitset(width),
				]

				let complementIntersection = universe
				for (const bs of bitsets) {
					complementIntersection &= universe ^ bs
				}
				const expectedByDeMorgan = universe ^ complementIntersection

				assert.equal(unionBitsetIterative(...bitsets), expectedByDeMorgan)
				assert.equal(unionBitsetIterative(bitsets), expectedByDeMorgan)
			}
		})

		it('satisfies the Inclusion-Exclusion Principle on cardinality (popcount)', () => {
			const nextBitset = createBitsetGenerator(0xdeadbeefcafebaben)
			const a = nextBitset(256)
			const b = nextBitset(256)
			const c = nextBitset(256)

			const ab = unionBitsetIterative(a, b)
			assert.equal(popcount(ab), popcount(a) + popcount(b) - popcount(a & b))

			const abc = unionBitsetIterative(a, b, c)
			assert.equal(
				popcount(abc),
				popcount(a) +
					popcount(b) +
					popcount(c) -
					popcount(a & b) -
					popcount(a & c) -
					popcount(b & c) +
					popcount(a & b & c)
			)
		})

		it('satisfies commutativity, associativity, idempotence, monotonicity, and absorption', () => {
			const nextBitset = createBitsetGenerator(0xabcdef0123456789n)
			const a = nextBitset(512)
			const b = nextBitset(512)
			const c = nextBitset(512)

			// Commutativity
			assert.equal(unionBitsetIterative(a, b), unionBitsetIterative(b, a))

			// Associativity
			assert.equal(
				unionBitsetIterative(unionBitsetIterative(a, b), c),
				unionBitsetIterative(a, unionBitsetIterative(b, c))
			)
			assert.equal(
				unionBitsetIterative(a, b, c),
				unionBitsetIterative(unionBitsetIterative(a, b), c)
			)

			// Idempotence
			assert.equal(unionBitsetIterative(a, a), a)
			assert.equal(unionBitsetIterative(a, a, a), a)

			// Monotonicity (each operand is a subset of the union)
			const ab = unionBitsetIterative(a, b)
			assert.equal(a & ab, a)
			assert.equal(b & ab, b)

			// Absorption: A ∪ (A ∩ B) === A
			assert.equal(unionBitsetIterative(a, a & b), a)
		})
	})
})
