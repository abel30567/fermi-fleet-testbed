import { describe, test } from 'node:test'
import assert from 'node:assert'
import { intersectionBitsetIterative } from './intersectionBitsetIterative.js'

/**
 * Independent reference helper: convert a non-negative BigInt bitset
 * into a JS Set of active bit indices.
 *
 * @param {bigint} bitset
 * @returns {Set<number>}
 */
function bitsetToIndexSet(bitset) {
	const indices = new Set()
	const binary = bitset.toString(2)
	if (bitset === 0n) return indices
	const len = binary.length
	for (let i = 0; i < len; i += 1) {
		if (binary[len - 1 - i] === '1') {
			indices.add(i)
		}
	}
	return indices
}

/**
 * Independent reference helper: convert a JS Set of bit indices back to a BigInt bitset.
 *
 * @param {Set<number>} indices
 * @returns {bigint}
 */
function indexSetToBitset(indices) {
	let bitset = 0n
	for (const idx of indices) {
		bitset += 2n ** BigInt(idx)
	}
	return bitset
}

/**
 * Independent reference intersection via JS Set over bit indices.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function referenceSetIntersection(a, b) {
	const setA = bitsetToIndexSet(a)
	const setB = bitsetToIndexSet(b)
	const common = new Set()
	for (const idx of setA) {
		if (setB.has(idx)) {
			common.add(idx)
		}
	}
	return indexSetToBitset(common)
}

/**
 * Deterministic PRNG (xorshift32) for reproducible property cross-checks.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state ^= state << 13
		state ^= state >>> 17
		state ^= state << 5
		return state >>> 0
	}
}

/**
 * Generate a deterministic pseudo-random BigInt of up to `bitWidth` bits.
 *
 * @param {() => number} nextU32
 * @param {number} bitWidth
 * @returns {bigint}
 */
function randomBigInt(nextU32, bitWidth) {
	let value = 0n
	let remaining = bitWidth
	while (remaining > 0) {
		const chunkBits = Math.min(32, remaining)
		const mask = chunkBits === 32 ? 0xffffffffn : (1n << BigInt(chunkBits)) - 1n
		value = (value << BigInt(chunkBits)) | (BigInt(nextU32()) & mask)
		remaining -= chunkBits
	}
	return value
}

describe('intersectionBitsetIterative', () => {
	test('computes intersection for normal overlapping bitsets', () => {
		assert.strictEqual(intersectionBitsetIterative(0b1101n, 0b1011n), 0b1001n)
		assert.strictEqual(intersectionBitsetIterative(0b11110000n, 0b00111100n), 0b00110000n)
		assert.strictEqual(intersectionBitsetIterative(0xffn, 0x0fn), 0x0fn)
		assert.strictEqual(intersectionBitsetIterative(1n, 1n), 1n)
	})

	test('satisfies idempotence, commutativity, and associativity', () => {
		const a = 0xdeadbeef12345678n
		const b = 0x12345678deadbeefn
		const c = 0xff00ff00ff00ff00n

		// Idempotence
		assert.strictEqual(intersectionBitsetIterative(a, a), a)

		// Commutativity
		assert.strictEqual(
			intersectionBitsetIterative(a, b),
			intersectionBitsetIterative(b, a),
		)

		// Associativity
		assert.strictEqual(
			intersectionBitsetIterative(intersectionBitsetIterative(a, b), c),
			intersectionBitsetIterative(a, intersectionBitsetIterative(b, c)),
		)
	})

	test('handles empty set (0n) cases', () => {
		const large = (1n << 400n) | (1n << 200n) | 1n
		assert.strictEqual(intersectionBitsetIterative(0n, 0n), 0n)
		assert.strictEqual(intersectionBitsetIterative(0n, 0b10101n), 0n)
		assert.strictEqual(intersectionBitsetIterative(0b10101n, 0n), 0n)
		assert.strictEqual(intersectionBitsetIterative(0n, large), 0n)
		assert.strictEqual(intersectionBitsetIterative(large, 0n), 0n)
	})

	test('handles disjoint bitsets', () => {
		const evenBits = 0x5555555555555555n
		const oddBits = 0xaaaaaaaaaaaaaaaan
		assert.strictEqual(intersectionBitsetIterative(evenBits, oddBits), 0n)
		assert.strictEqual(intersectionBitsetIterative(0xffffn, 0xffffn << 64n), 0n)
		assert.strictEqual(intersectionBitsetIterative(1n << 300n, 1n << 301n), 0n)
	})

	test('handles subset and superset relationships', () => {
		const subset = (1n << 0n) | (1n << 64n) | (1n << 300n)
		const superset = subset | (1n << 12n) | (1n << 128n) | (1n << 512n)

		assert.strictEqual(intersectionBitsetIterative(subset, superset), subset)
		assert.strictEqual(intersectionBitsetIterative(superset, subset), subset)
	})

	test('handles asymmetric widths where one operand is much wider than the other', () => {
		const narrow = 0b101101n
		const wide = (1n << 600n) | (1n << 350n) | 0b100111n
		assert.strictEqual(intersectionBitsetIterative(narrow, wide), 0b100101n)
		assert.strictEqual(intersectionBitsetIterative(wide, narrow), 0b100101n)
	})

	test('handles arbitrary-width bitsets well beyond 256 bits', () => {
		// Sparse >256-bit sets with shared and unshared high bits
		const a = (1n << 0n) | (1n << 63n) | (1n << 64n) | (1n << 255n) | (1n << 256n) | (1n << 512n) | (1n << 1024n)
		const b = (1n << 1n) | (1n << 63n) | (1n << 128n) | (1n << 256n) | (1n << 511n) | (1n << 1024n)
		const expected = (1n << 63n) | (1n << 256n) | (1n << 1024n)

		assert.strictEqual(intersectionBitsetIterative(a, b), expected)

		// Dense 512-bit all-ones mask intersected with 300-bit all-ones mask
		const ones512 = (1n << 512n) - 1n
		const ones300 = (1n << 300n) - 1n
		assert.strictEqual(intersectionBitsetIterative(ones512, ones300), ones300)
		assert.strictEqual(intersectionBitsetIterative(ones512, ones512), ones512)
	})

	test('rejects non-BigInt inputs with TypeError', () => {
		const invalidValues = [
			0,
			1,
			42,
			-1,
			NaN,
			Infinity,
			-Infinity,
			'0',
			'1n',
			true,
			false,
			null,
			undefined,
			{},
			[],
			new Set([1]),
			Symbol('bit'),
		]

		for (const bad of invalidValues) {
			assert.throws(
				() => intersectionBitsetIterative(bad, 1n),
				{ name: 'TypeError' },
				`Expected TypeError for first arg: ${String(bad)}`,
			)
			assert.throws(
				() => intersectionBitsetIterative(1n, bad),
				{ name: 'TypeError' },
				`Expected TypeError for second arg: ${String(bad)}`,
			)
		}

		// Missing arguments
		assert.throws(() => intersectionBitsetIterative(), { name: 'TypeError' })
		assert.throws(() => intersectionBitsetIterative(1n), { name: 'TypeError' })
	})

	test('rejects negative BigInt inputs with RangeError', () => {
		const negatives = [-1n, -2n, -256n, -(1n << 300n)]

		for (const neg of negatives) {
			assert.throws(() => intersectionBitsetIterative(neg, 0n), { name: 'RangeError' })
			assert.throws(() => intersectionBitsetIterative(0n, neg), { name: 'RangeError' })
			assert.throws(() => intersectionBitsetIterative(neg, neg), { name: 'RangeError' })
		}
	})

	test('cross-checks against independent JS Set intersection over bit indices', () => {
		const pairs = [
			[0n, 0n],
			[0n, 0b101010n],
			[0b1101101n, 0b1011011n],
			[(1n << 300n) | (1n << 150n) | 7n, (1n << 300n) | (1n << 149n) | 5n],
			[(1n << 520n) - 1n, ((1n << 260n) - 1n) << 130n],
			[0x123456789abcdef0123456789abcdef0n << 200n, 0xfedcba9876543210fedcba9876543210n << 200n],
		]

		for (const [a, b] of pairs) {
			const actual = intersectionBitsetIterative(a, b)
			const expectedViaSet = referenceSetIntersection(a, b)
			assert.strictEqual(actual, expectedViaSet)
		}
	})

	test('cross-checks against native BigInt bitwise AND across pseudo-random arbitrary widths', () => {
		const nextU32 = makeRng(0x5eed1234)
		const widths = [0, 1, 8, 32, 64, 128, 257, 384, 512, 600]

		for (const widthA of widths) {
			for (const widthB of widths) {
				const a = widthA === 0 ? 0n : randomBigInt(nextU32, widthA)
				const b = widthB === 0 ? 0n : randomBigInt(nextU32, widthB)
				const actual = intersectionBitsetIterative(a, b)
				const nativeAnd = a & b

				assert.strictEqual(actual, nativeAnd)
			}
		}

		// Also cross-check a batch of >256-bit random pairs against BOTH Set reference and native &
		for (let i = 0; i < 20; i += 1) {
			const a = randomBigInt(nextU32, 320 + i * 13)
			const b = randomBigInt(nextU32, 320 + i * 11)
			const actual = intersectionBitsetIterative(a, b)
			assert.strictEqual(actual, a & b)
			assert.strictEqual(actual, referenceSetIntersection(a, b))
		}
	})
})
