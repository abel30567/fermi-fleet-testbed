import { describe, test } from 'node:test'
import assert from 'node:assert'
import { xorBitsetMemo } from './xorBitsetMemo.js'

/**
 * Independent reference implementation: converts finite sets of bit indices
 * to BigInt bitsets and computes their set symmetric difference directly.
 *
 * @param {Iterable<number>} setA
 * @param {Iterable<number>} setB
 * @returns {{ bitsetA: bigint, bitsetB: bigint, expected: bigint }}
 */
function symmetricDiffReference(setA, setB) {
	const a = new Set(setA)
	const b = new Set(setB)
	const symDiff = new Set()
	for (const x of a) {
		if (!b.has(x)) symDiff.add(x)
	}
	for (const x of b) {
		if (!a.has(x)) symDiff.add(x)
	}
	const toBitset = (s) => {
		let acc = 0n
		for (const idx of s) acc += 1n << BigInt(idx)
		return acc
	}
	return {
		bitsetA: toBitset(a),
		bitsetB: toBitset(b),
		expected: toBitset(symDiff),
	}
}

/**
 * Independent bit-by-bit reference XOR using only arithmetic division/modulo.
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function arithmeticBitwiseXor(a, b) {
	let x = a
	let y = b
	let result = 0n
	let place = 1n
	while (x > 0n || y > 0n) {
		const bx = x % 2n
		const by = y % 2n
		if (bx !== by) {
			result += place
		}
		x /= 2n
		y /= 2n
		place *= 2n
	}
	return result
}

/**
 * Deterministic xorshift64* PRNG for reproducible fuzz testing.
 *
 * @param {bigint} seed
 * @returns {() => bigint}
 */
function makePrng(seed) {
	let state = seed & ((1n << 64n) - 1n)
	return () => {
		state ^= state >> 12n
		state ^= (state << 25n) & ((1n << 64n) - 1n)
		state ^= state >> 27n
		return (state * 0x2545f4914f6cdd1dn) & ((1n << 64n) - 1n)
	}
}

/**
 * Generates a deterministic BigInt of up to `bitWidth` bits using `next64`.
 *
 * @param {() => bigint} next64
 * @param {number} bitWidth
 * @returns {bigint}
 */
function randomBigInt(next64, bitWidth) {
	if (bitWidth <= 0) return 0n
	let val = 0n
	let remaining = bitWidth
	while (remaining > 0) {
		const chunkBits = Math.min(64, remaining)
		const mask = (1n << BigInt(chunkBits)) - 1n
		val = (val << BigInt(chunkBits)) | (next64() & mask)
		remaining -= chunkBits
	}
	return val
}

describe('xorBitsetMemo', () => {
	test('handles normal small and multi-byte bitsets', () => {
		assert.strictEqual(xorBitsetMemo(0b1010n, 0b1100n), 0b0110n)
		assert.strictEqual(xorBitsetMemo(0xffn, 0x0fn), 0xf0n)
		assert.strictEqual(xorBitsetMemo(0x123456789abcdef0n, 0x0fedcba987654321n), 0x1dd99dd11dd99dd1n)
		assert.strictEqual(xorBitsetMemo(0xdeadbeefcafebaben, 0x1122334455667788n), 0xcf8f8dab9f98cd36n)
	})

	test('handles edge cases: zero, identity, self-cancellation, odd/even hex widths', () => {
		assert.strictEqual(xorBitsetMemo(0n, 0n), 0n)
		assert.strictEqual(xorBitsetMemo(0n, 1n), 1n)
		assert.strictEqual(xorBitsetMemo(1n, 0n), 1n)

		const wide = (1n << 513n) | (1n << 257n) | 0xabcdefn
		assert.strictEqual(xorBitsetMemo(0n, wide), wide)
		assert.strictEqual(xorBitsetMemo(wide, 0n), wide)
		assert.strictEqual(xorBitsetMemo(wide, wide), 0n)

		// Odd hex length operands and mixed odd/even hex lengths
		assert.strictEqual(xorBitsetMemo(0xan, 0x5n), 0xfn)
		assert.strictEqual(xorBitsetMemo(0xfffn, 0x1n), 0xffen)
		assert.strictEqual(xorBitsetMemo(0x1n, 0xfffn), 0xffen)
		assert.strictEqual(xorBitsetMemo(0x100n, 0xffn), 0x1ffn)
	})

	test('handles complete and partial high-bit cancellation', () => {
		const prefix = (1n << 1024n) - (1n << 16n)
		assert.strictEqual(xorBitsetMemo(prefix | 0x1234n, prefix | 0x1230n), 0x4n)
		assert.strictEqual(xorBitsetMemo(prefix | 0x8000n, prefix), 0x8000n)
		assert.strictEqual(xorBitsetMemo((1n << 2048n) - 1n, (1n << 1024n) - 1n), ((1n << 1024n) - 1n) << 1024n)
	})

	test('handles very wide arbitrary-width bitsets with asymmetric widths', () => {
		const huge = (1n << 10000n) | (1n << 5000n) | 0x5an
		const tiny = 0xa5n
		const expected = (1n << 10000n) | (1n << 5000n) | 0xffn
		assert.strictEqual(xorBitsetMemo(huge, tiny), expected)
		assert.strictEqual(xorBitsetMemo(tiny, huge), expected)
	})

	test('satisfies logic-set algebraic laws (commutativity, associativity, involution)', () => {
		const a = 0x13579bdf2468ace013579bdfn
		const b = 0xfedcba9876543210fedcba98n
		const c = (1n << 300n) | 0x42424242n

		// Commutativity
		assert.strictEqual(xorBitsetMemo(a, b), xorBitsetMemo(b, a))
		// Associativity
		assert.strictEqual(
			xorBitsetMemo(xorBitsetMemo(a, b), c),
			xorBitsetMemo(a, xorBitsetMemo(b, c)),
		)
		// Self-inverse / involution
		assert.strictEqual(xorBitsetMemo(xorBitsetMemo(a, b), b), a)
		assert.strictEqual(xorBitsetMemo(xorBitsetMemo(c, a), a), c)
	})

	test('validates inputs and rejects non-BigInts and negative BigInts', () => {
		const badTypes = [0, 1, NaN, Infinity, '1', true, false, null, undefined, {}, []]
		for (const bad of badTypes) {
			assert.throws(() => xorBitsetMemo(bad, 1n), TypeError)
			assert.throws(() => xorBitsetMemo(1n, bad), TypeError)
		}

		assert.throws(() => xorBitsetMemo(-1n, 0n), RangeError)
		assert.throws(() => xorBitsetMemo(0n, -1n), RangeError)
		assert.throws(() => xorBitsetMemo(-42n, -17n), RangeError)
		assert.throws(() => xorBitsetMemo(-(1n << 256n), 5n), RangeError)
	})

	test('memoization returns consistent results across hits, commuted hits, and cache eviction', () => {
		const a = 0xabcdef0123456789abcdef01n
		const b = 0x9876543210fedcba98765432n
		const first = xorBitsetMemo(a, b)
		assert.strictEqual(xorBitsetMemo(a, b), first)
		assert.strictEqual(xorBitsetMemo(b, a), first)

		// Exceed the 4096-entry cache bound to exercise LRU eviction
		for (let i = 1n; i <= 4200n; i++) {
			const x = (i << 64n) | (i * 3n)
			const y = (i << 32n) | (i * 5n)
			assert.strictEqual(xorBitsetMemo(x, y), x ^ y)
		}

		// Re-query evicted entries and verify exact results
		assert.strictEqual(xorBitsetMemo(a, b), a ^ b)
		assert.strictEqual(xorBitsetMemo(b, a), a ^ b)
	})

	test('cross-checks against set symmetric difference and arithmetic bit-by-bit XOR', () => {
		const cases = [
			[[], []],
			[[0, 1, 2], [2, 3, 4]],
			[[0, 7, 8, 15, 16, 63, 64, 127, 128, 511, 512], [1, 7, 15, 64, 255, 512, 1000]],
			[[3, 19, 100, 333], [3, 19, 100, 333]],
		]

		for (const [setA, setB] of cases) {
			const { bitsetA, bitsetB, expected } = symmetricDiffReference(setA, setB)
			assert.strictEqual(xorBitsetMemo(bitsetA, bitsetB), expected)
			assert.strictEqual(xorBitsetMemo(bitsetA, bitsetB), arithmeticBitwiseXor(bitsetA, bitsetB))
		}
	})

	test('cross-checks against native BigInt XOR across 500 deterministic random wide pairs', () => {
		const next64 = makePrng(0x7a3c9e1f5b2d4801n)
		const widths = [0, 1, 4, 7, 8, 9, 15, 16, 31, 32, 63, 64, 127, 128, 255, 512, 1024, 2048]

		for (let i = 0; i < 500; i++) {
			const wA = widths[Number(next64() % BigInt(widths.length))]
			const wB = widths[Number(next64() % BigInt(widths.length))]
			const a = randomBigInt(next64, wA)
			const b = randomBigInt(next64, wB)
			const actual = xorBitsetMemo(a, b)
			const expected = a ^ b
			assert.strictEqual(actual, expected, `Mismatch at i=${i}, wA=${wA}, wB=${wB}`)
			if (wA <= 256 && wB <= 256) {
				assert.strictEqual(actual, arithmeticBitwiseXor(a, b))
			}
		}
	})
})
