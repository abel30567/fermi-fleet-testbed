import { describe, test } from 'node:test'
import assert from 'node:assert'
import { setDifferenceBitsetRecursive } from './setDifferenceBitsetRecursive.js'

/**
 * Converts a non-negative BigInt bitset to a JS Set of active bit indices.
 * @param {bigint} bitset
 * @returns {Set<number>}
 */
function bitsetToSet(bitset) {
	const result = new Set()
	let remaining = bitset
	let index = 0
	while (remaining > 0n) {
		if ((remaining & 1n) === 1n) {
			result.add(index)
		}
		remaining >>= 1n
		index += 1
	}
	return result
}

/**
 * Converts a JS Set of non-negative integer indices to a BigInt bitset.
 * @param {Set<number>} set
 * @returns {bigint}
 */
function setToBitset(set) {
	let result = 0n
	for (const index of set) {
		result |= 1n << BigInt(index)
	}
	return result
}

/**
 * Deterministic xorshift64* PRNG for reproducible wide bitset generation.
 * @param {bigint} seed
 * @returns {() => bigint}
 */
function createPrng(seed) {
	let state = seed & ((1n << 64n) - 1n)
	return () => {
		state ^= state >> 12n
		state ^= (state << 25n) & ((1n << 64n) - 1n)
		state ^= state >> 27n
		return (state * 0x2545f4914f6cdd1dn) & ((1n << 64n) - 1n)
	}
}

/**
 * Builds a deterministic wide BigInt of approximately `bits` width.
 * @param {() => bigint} next64
 * @param {number} bits
 * @returns {bigint}
 */
function randomBigInt(next64, bits) {
	const chunks = Math.ceil(bits / 64)
	let value = 0n
	for (let i = 0; i < chunks; i += 1) {
		value = (value << 64n) | next64()
	}
	const mask = (1n << BigInt(bits)) - 1n
	return value & mask
}

describe('setDifferenceBitsetRecursive', () => {
	test('handles all four 1-bit base-case truth-table entries', () => {
		assert.strictEqual(setDifferenceBitsetRecursive(0n, 0n), 0n)
		assert.strictEqual(setDifferenceBitsetRecursive(0n, 1n), 0n)
		assert.strictEqual(setDifferenceBitsetRecursive(1n, 0n), 1n)
		assert.strictEqual(setDifferenceBitsetRecursive(1n, 1n), 0n)
	})

	test('computes normal overlapping and asymmetric-width bitset differences', () => {
		assert.strictEqual(setDifferenceBitsetRecursive(0b110101n, 0b011100n), 0b100001n)
		assert.strictEqual(setDifferenceBitsetRecursive(0b10101010n, 0b11001100n), 0b00100010n)
		// a wider than b
		assert.strictEqual(setDifferenceBitsetRecursive(0b111100001010n, 0b1010n), 0b111100000000n)
		// b wider than a
		assert.strictEqual(setDifferenceBitsetRecursive(0b10101n, 0b11111100100n), 0b10001n)
		// odd bit-widths
		assert.strictEqual(setDifferenceBitsetRecursive(0b1011011n, 0b0110101n), 0b1001010n)
	})

	test('satisfies identity and boundary edge cases (A \\ 0 = A, 0 \\ B = 0, A \\ A = 0)', () => {
		const samples = [0n, 1n, 2n, 0b101101n, (1n << 64n) - 1n, (1n << 600n) | 0xdeadbeefn]
		for (const x of samples) {
			assert.strictEqual(setDifferenceBitsetRecursive(x, 0n), x)
			assert.strictEqual(setDifferenceBitsetRecursive(0n, x), 0n)
			assert.strictEqual(setDifferenceBitsetRecursive(x, x), 0n)
		}
	})

	test('handles disjoint sets and subsets', () => {
		// Disjoint: even bits vs odd bits
		const evenBits = 0x5555555555555555n
		const oddBits = 0xaaaaaaaaaaaaaaaan
		assert.strictEqual(setDifferenceBitsetRecursive(evenBits, oddBits), evenBits)
		assert.strictEqual(setDifferenceBitsetRecursive(oddBits, evenBits), oddBits)

		// Subset: A ⊆ B => A \ B = 0n, while B \ A retains complement within B
		const superset = 0b1111111100111100n
		const subset = 0b0101101000010100n
		assert.strictEqual(setDifferenceBitsetRecursive(subset, superset), 0n)
		assert.strictEqual(setDifferenceBitsetRecursive(superset, subset), 0b1010010100101000n)
	})

	test('handles very wide bitsets (> 512 bits) including dense, sparse, and odd widths', () => {
		const next64 = createPrng(0x9e3779b97f4a7c15n)
		for (const width of [513, 640, 1024, 1537, 2048]) {
			const a = randomBigInt(next64, width) | (1n << BigInt(width - 1))
			const b = randomBigInt(next64, width) | (1n << BigInt(width - 1))
			const result = setDifferenceBitsetRecursive(a, b)
			assert.strictEqual(result, a & ~b)
		}

		// Sparse > 512-bit bitsets with high-order differences
		const sparseA = (1n << 1024n) | (1n << 777n) | (1n << 513n) | 1n
		const sparseB = (1n << 1024n) | (1n << 512n) | 1n
		assert.strictEqual(
			setDifferenceBitsetRecursive(sparseA, sparseB),
			(1n << 777n) | (1n << 513n)
		)
	})

	test('cross-checks against JS Set difference and native (a & ~b)', () => {
		// Exhaustive small-domain cross-check against native (a & ~b)
		for (let a = 0n; a < 64n; a += 1n) {
			for (let b = 0n; b < 64n; b += 1n) {
				assert.strictEqual(setDifferenceBitsetRecursive(a, b), a & ~b)
			}
		}

		// Cross-check against JS Set difference and algebraic invariants
		const next64 = createPrng(0x123456789abcdef1n)
		for (const width of [8, 33, 128, 600]) {
			const a = randomBigInt(next64, width)
			const b = randomBigInt(next64, width)

			const actual = setDifferenceBitsetRecursive(a, b)
			const setA = bitsetToSet(a)
			const setB = bitsetToSet(b)
			const expectedSet = new Set([...setA].filter((x) => !setB.has(x)))
			const expectedFromSet = setToBitset(expectedSet)

			assert.strictEqual(actual, expectedFromSet)
			assert.strictEqual(actual, a & ~b)
			// Algebraic invariants: (A \ B) ∩ B = ∅ and (A \ B) ∪ (A ∩ B) = A
			assert.strictEqual(actual & b, 0n)
			assert.strictEqual(actual | (a & b), a)
		}
	})

	test('rejects negative BigInts with RangeError and non-BigInts with TypeError', () => {
		assert.throws(() => setDifferenceBitsetRecursive(-1n, 0n), RangeError)
		assert.throws(() => setDifferenceBitsetRecursive(0n, -1n), RangeError)
		assert.throws(() => setDifferenceBitsetRecursive(-100n, -5n), RangeError)

		const invalidValues = [0, 42, NaN, Infinity, '1', null, undefined, true, false, {}, []]
		for (const bad of invalidValues) {
			assert.throws(() => setDifferenceBitsetRecursive(bad, 1n), TypeError)
			assert.throws(() => setDifferenceBitsetRecursive(1n, bad), TypeError)
		}
	})
})
