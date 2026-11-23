import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { unionBitsetSeries } from './unionBitsetSeries.js'

/**
 * Independent oracle using pure arithmetic (division/modulo by 2n) and JS Set,
 * without any bitwise operators, to convert bitsets to sets of element indices
 * and reconstruct the union as Σ_{k ∈ S} 2^k.
 *
 * @param {bigint[]} bitsets
 * @returns {bigint}
 */
function unionViaIndexSetOracle(bitsets) {
	const indices = new Set()
	for (const bits of bitsets) {
		let remaining = bits
		let k = 0n
		while (remaining > 0n) {
			if (remaining % 2n === 1n) {
				indices.add(k)
			}
			remaining = (remaining - (remaining % 2n)) / 2n
			k += 1n
		}
	}
	let result = 0n
	for (const k of indices) {
		result += 2n ** k
	}
	return result
}

/**
 * Independent De Morgan's Law oracle: A ∪ B = ~((~A) & (~B)).
 *
 * @param {bigint[]} bitsets
 * @returns {bigint}
 */
function unionViaDeMorganOracle(bitsets) {
	let negatedIntersection = -1n
	for (const bits of bitsets) {
		negatedIntersection &= ~bits
	}
	return ~negatedIntersection
}

/**
 * Deterministic xorshift64* PRNG for reproducible arbitrary-width BigInt tests.
 *
 * @param {bigint} seed
 */
function createPrng(seed) {
	let state = seed
	const mask64 = (1n << 64n) - 1n
	return {
		next64() {
			state ^= state >> 12n
			state ^= (state << 25n) & mask64
			state ^= state >> 27n
			return (state * 0x2545f4914f6cdd1dn) & mask64
		},
		nextBigInt(words) {
			let out = 0n
			for (let i = 0; i < words; i += 1) {
				out = (out << 64n) | this.next64()
			}
			return out
		}
	}
}

describe('unionBitsetSeries', () => {
	it('computes union for basic overlapping and disjoint bitsets', () => {
		assert.equal(unionBitsetSeries(0b1010n, 0b1100n), 0b1110n)
		assert.equal(unionBitsetSeries(0b0101n, 0b1010n), 0b1111n)
		assert.equal(unionBitsetSeries(0b1111n, 0b0011n), 0b1111n)
		assert.equal(unionBitsetSeries(1n, 2n), 3n)
	})

	it('handles identity (0n), idempotence, and single-argument calls', () => {
		assert.equal(unionBitsetSeries(0n), 0n)
		assert.equal(unionBitsetSeries(0b101101n), 0b101101n)
		assert.equal(unionBitsetSeries(0n, 0n), 0n)
		assert.equal(unionBitsetSeries(0n, 0b10101n), 0b10101n)
		assert.equal(unionBitsetSeries(0b10101n, 0n), 0b10101n)
		assert.equal(unionBitsetSeries(0b110110n, 0b110110n), 0b110110n)
	})

	it('supports variadic n-ary union across many bitsets', () => {
		assert.equal(unionBitsetSeries(0b0001n, 0b0010n, 0b0100n, 0b1000n), 0b1111n)
		const powers = Array.from({ length: 65 }, (_, i) => 1n << BigInt(i))
		assert.equal(unionBitsetSeries(...powers), (1n << 65n) - 1n)
	})

	it('handles arbitrary-width bitsets well beyond 64 bits', () => {
		const lowMask = (1n << 128n) - 1n
		const highBit = 1n << 1024n
		const midMask = ((1n << 256n) - 1n) << 512n

		const expected = lowMask + midMask + highBit
		assert.equal(unionBitsetSeries(lowMask, midMask, highBit), expected)

		// Overlapping arbitrary-width dense bitsets (4096 bits)
		const a = ((1n << 4096n) - 1n) / 3n // alternating 0101... pattern
		const b = a << 1n // complementary 1010... pattern
		assert.equal(unionBitsetSeries(a, b), (1n << 4096n) - 1n)
	})

	it('satisfies Boolean algebra laws (commutativity, associativity, absorption, distributivity)', () => {
		const a = 0xdeadbeefcafebabe123456789abcdef0n
		const b = 0x0123456789abcdef0fedcba987654321n
		const c = 0xff00ff00ff00ff0000ff00ff00ff00ffn

		// Commutativity: A ∪ B = B ∪ A
		assert.equal(unionBitsetSeries(a, b), unionBitsetSeries(b, a))

		// Associativity: (A ∪ B) ∪ C = A ∪ (B ∪ C) = union(A, B, C)
		const left = unionBitsetSeries(unionBitsetSeries(a, b), c)
		const right = unionBitsetSeries(a, unionBitsetSeries(b, c))
		const flat = unionBitsetSeries(a, b, c)
		assert.equal(left, right)
		assert.equal(left, flat)

		// Absorption: A ∪ (A ∩ B) = A
		assert.equal(unionBitsetSeries(a, a & b), a)

		// Distributivity: A ∪ (B ∩ C) = (A ∪ B) ∩ (A ∪ C)
		assert.equal(
			unionBitsetSeries(a, b & c),
			unionBitsetSeries(a, b) & unionBitsetSeries(a, c)
		)
	})

	it('matches independent bitwise-free index-set oracle, De Morgan oracle, and native OR', () => {
		const rng = createPrng(0x9e3779b97f4a7c15n)

		// Cross-check binary cases up to 512 bits against all three oracles
		for (let i = 0; i < 40; i += 1) {
			const words = (i % 8) + 1
			const a = rng.nextBigInt(words)
			const b = rng.nextBigInt(words)
			const actual = unionBitsetSeries(a, b)

			assert.equal(actual, a | b)
			assert.equal(actual, unionViaDeMorganOracle([a, b]))
			assert.equal(actual, unionViaIndexSetOracle([a, b]))
		}

		// Cross-check n-ary cases (3 to 6 bitsets) against all three oracles
		for (let i = 0; i < 15; i += 1) {
			const count = (i % 4) + 3
			const inputs = Array.from({ length: count }, () => rng.nextBigInt(4))
			const actual = unionBitsetSeries(...inputs)

			assert.equal(actual, inputs.reduce((acc, x) => acc | x))
			assert.equal(actual, unionViaDeMorganOracle(inputs))
			assert.equal(actual, unionViaIndexSetOracle(inputs))
		}
	})

	it('throws TypeError when called with no arguments or non-BigInt inputs', () => {
		assert.throws(() => unionBitsetSeries(), TypeError)

		const invalidValues = [
			0,
			1,
			42,
			NaN,
			Infinity,
			-Infinity,
			'1',
			'0n',
			null,
			undefined,
			true,
			false,
			{},
			[],
			[1n],
			Symbol('bitset')
		]

		for (const bad of invalidValues) {
			assert.throws(() => unionBitsetSeries(bad), TypeError)
			assert.throws(() => unionBitsetSeries(bad, 1n), TypeError)
			assert.throws(() => unionBitsetSeries(1n, bad), TypeError)
			assert.throws(() => unionBitsetSeries(1n, 2n, bad), TypeError)
		}
	})

	it('throws RangeError for negative BigInt inputs', () => {
		const negativeValues = [-1n, -2n, -255n, -(1n << 128n), -(1n << 1024n)]

		for (const neg of negativeValues) {
			assert.throws(() => unionBitsetSeries(neg), RangeError)
			assert.throws(() => unionBitsetSeries(neg, 0n), RangeError)
			assert.throws(() => unionBitsetSeries(0n, neg), RangeError)
			assert.throws(() => unionBitsetSeries(0b101n, 0b010n, neg), RangeError)
		}
	})
})
