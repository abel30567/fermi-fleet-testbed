import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unionBitsetMemo } from './unionBitsetMemo.js'

/**
 * Independent reference: convert a non-negative BigInt bitset to a JS Set of bit indices.
 *
 * @param {bigint} bitset
 * @returns {Set<number>}
 */
function bitsetToSet(bitset) {
	const result = new Set()
	let value = bitset
	let index = 0
	while (value > 0n) {
		if ((value & 1n) === 1n) {
			result.add(index)
		}
		value >>= 1n
		index++
	}
	return result
}

/**
 * Independent reference: convert a JS Set of non-negative integer bit indices to a BigInt bitset.
 *
 * @param {Set<number>} set
 * @returns {bigint}
 */
function setToBitset(set) {
	let result = 0n
	for (const index of set) {
		result += 1n << BigInt(index)
	}
	return result
}

/**
 * Independent reference: set union via JS Set.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function referenceSetUnion(a, b) {
	const setA = bitsetToSet(a)
	const setB = bitsetToSet(b)
	const merged = new Set(setA)
	for (const item of setB) {
		merged.add(item)
	}
	return setToBitset(merged)
}

/**
 * Deterministic xorshift64* PRNG returning arbitrary-width non-negative BigInts.
 *
 * @param {bigint} seed
 */
function makePrng(seed) {
	let state = seed
	const mask64 = (1n << 64n) - 1n
	function next64() {
		state ^= state >> 12n
		state = (state ^ (state << 25n)) & mask64
		state ^= state >> 27n
		return (state * 0x2545f4914f6cdd1dn) & mask64
	}
	return function nextBigInt(bits) {
		if (bits <= 0) return 0n
		let out = 0n
		let remaining = bits
		while (remaining > 0) {
			const take = remaining >= 64 ? 64 : remaining
			const chunk = next64() & ((1n << BigInt(take)) - 1n)
			out = (out << BigInt(take)) + chunk
			remaining -= take
		}
		return out
	}
}

test('normal single-byte and multi-byte unions', () => {
	assert.equal(unionBitsetMemo(0b1010n, 0b0101n), 0b1111n)
	assert.equal(unionBitsetMemo(0b1100n, 0b1010n), 0b1110n)
	assert.equal(unionBitsetMemo(0x0fn, 0xf0n), 0xffn)
	assert.equal(unionBitsetMemo(0x0f0f0f0fn, 0xf0f0f0f0n), 0xffffffffn)
	assert.equal(
		unionBitsetMemo(0x123456789abcdef0n, 0x0fedcba987654321n),
		0x123456789abcdef0n | 0x0fedcba987654321n,
	)
})

test('edge cases: zero, identity, idempotence, byte boundaries, asymmetric widths', () => {
	assert.equal(unionBitsetMemo(0n, 0n), 0n)
	assert.equal(unionBitsetMemo(0n, 42n), 42n)
	assert.equal(unionBitsetMemo(42n, 0n), 42n)
	assert.equal(unionBitsetMemo(0n, 1n << 500n), 1n << 500n)
	assert.equal(unionBitsetMemo(1n << 500n, 0n), 1n << 500n)

	// Idempotence
	assert.equal(unionBitsetMemo(0xdeadbeefcafen, 0xdeadbeefcafen), 0xdeadbeefcafen)

	// Odd/even hex-length and byte boundaries
	assert.equal(unionBitsetMemo(0xfn, 0x100n), 0x10fn)
	assert.equal(unionBitsetMemo(0x100n, 0xfn), 0x10fn)
	assert.equal(unionBitsetMemo(0xffn, 0x100n), 0x1ffn)
	assert.equal(unionBitsetMemo(0xfffn, 0x1000n), 0x1fffn)
	assert.equal(unionBitsetMemo(0x1n, (1n << 255n) + 0x10n), (1n << 255n) + 0x11n)
})

test('arbitrary-width bitsets (4096-bit and 10000-bit)', () => {
	const sparseA = (1n << 4095n) + (1n << 1024n) + 1n
	const sparseB = (1n << 4096n) + (1n << 2048n) + (1n << 1024n) + 2n
	assert.equal(
		unionBitsetMemo(sparseA, sparseB),
		(1n << 4096n) + (1n << 4095n) + (1n << 2048n) + (1n << 1024n) + 3n,
	)

	const hugeA = (1n << 10000n) + (1n << 3333n) + 0xaa55n
	const hugeB = (1n << 9999n) + (1n << 3333n) + 0x55aan
	assert.equal(unionBitsetMemo(hugeA, hugeB), hugeA | hugeB)
})

test('memoization consistency, commutativity reuse, and bounded cache eviction', () => {
	const a = (1n << 300n) + 0x123456789an
	const b = (1n << 250n) + 0x0fedcba987n
	const expected = a | b

	// First call populates cache; subsequent and commuted calls reuse cached value
	assert.equal(unionBitsetMemo(a, b), expected)
	assert.equal(unionBitsetMemo(a, b), expected)
	assert.equal(unionBitsetMemo(b, a), expected)

	// Exceed cache capacity (4096 entries) to verify FIFO eviction stays sound
	for (let i = 1; i <= 4500; i++) {
		const x = (BigInt(i) << 16n) + 0x00ffn
		const y = (BigInt(i) << 8n) + 0xff00n
		assert.equal(unionBitsetMemo(x, y), x | y)
	}

	// Re-query earlier entries after eviction
	assert.equal(unionBitsetMemo(a, b), expected)
	assert.equal(unionBitsetMemo(b, a), expected)
})

test('input validation rejects non-bigints and negative bigints', () => {
	const invalidTypes = [0, 1, NaN, Infinity, '1', true, false, null, undefined, {}, []]
	for (const bad of invalidTypes) {
		assert.throws(() => unionBitsetMemo(bad, 0n), TypeError)
		assert.throws(() => unionBitsetMemo(0n, bad), TypeError)
	}

	// Missing arguments
	assert.throws(() => unionBitsetMemo(), TypeError)
	assert.throws(() => unionBitsetMemo(1n), TypeError)

	// Negative BigInts
	const negatives = [-1n, -2n, -255n, -256n, -(1n << 256n)]
	for (const neg of negatives) {
		assert.throws(() => unionBitsetMemo(neg, 0n), RangeError)
		assert.throws(() => unionBitsetMemo(0n, neg), RangeError)
		assert.throws(() => unionBitsetMemo(neg, neg), RangeError)
	}
})

test('independent cross-check: JS Set union reference implementation', () => {
	const nextBigInt = makePrng(0x13579bdf2468acen)
	const widths = [0, 1, 4, 8, 9, 15, 16, 17, 32, 63, 64, 65, 128, 257]

	for (const widthA of widths) {
		for (const widthB of [0, 8, 17, 64, 130]) {
			const a = nextBigInt(widthA)
			const b = nextBigInt(widthB)
			assert.equal(unionBitsetMemo(a, b), referenceSetUnion(a, b))
		}
	}
})

test('independent cross-check: native BigInt OR, algebraic laws, and De Morgan law', () => {
	const nextBigInt = makePrng(0x9e3779b97f4a7c15n)
	const widths = [1, 7, 8, 16, 31, 64, 127, 256, 513, 1024]

	for (let i = 0; i < 150; i++) {
		const wA = widths[i % widths.length]
		const wB = widths[(i * 3 + 1) % widths.length]
		const wC = widths[(i * 7 + 2) % widths.length]
		const a = nextBigInt(wA)
		const b = nextBigInt(wB)
		const c = nextBigInt(wC)

		const ab = unionBitsetMemo(a, b)
		const ba = unionBitsetMemo(b, a)

		// Cross-check against native BigInt bitwise OR
		assert.equal(ab, a | b)

		// Commutativity
		assert.equal(ab, ba)

		// Associativity
		assert.equal(unionBitsetMemo(ab, c), unionBitsetMemo(a, unionBitsetMemo(b, c)))

		// Subset containment
		assert.equal(ab & a, a)
		assert.equal(ab & b, b)

		// De Morgan's law over universe mask U: a ∪ b = U \ ((U \ a) ∩ (U \ b))
		const maxW = Math.max(wA, wB)
		const universe = (1n << BigInt(maxW)) - 1n
		const deMorgan = universe ^ ((universe ^ a) & (universe ^ b))
		assert.equal(ab, deMorgan)
	}
})
