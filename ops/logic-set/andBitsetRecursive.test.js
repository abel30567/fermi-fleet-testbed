import { describe, test } from 'node:test'
import assert from 'node:assert'
import { andBitsetRecursive } from './andBitsetRecursive.js'

/**
 * Independent element-wise bit intersection oracle built from binary strings
 * (does not use BigInt `&`).
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function elementWiseBitAnd(a, b) {
	const binA = a.toString(2)
	const binB = b.toString(2)
	const len = Math.max(binA.length, binB.length)
	const padA = binA.padStart(len, '0')
	const padB = binB.padStart(len, '0')

	let bits = ''
	for (let i = 0; i < len; i++) {
		bits += padA[i] === '1' && padB[i] === '1' ? '1' : '0'
	}
	return BigInt(`0b${bits}`)
}

/**
 * Deterministic pseudo-random BigInt generator of a requested bit-width
 * using an LCG for reproducible cross-check tests.
 */
function createBitsetGenerator(seed = 0x123456789abcdef0n) {
	let state = seed
	const mask64 = (1n << 64n) - 1n
	const mult = 6364136223846793005n
	const inc = 1442695040888963407n

	function next64() {
		state = (state * mult + inc) & mask64
		return state
	}

	return function nextBigInt(bits) {
		if (bits <= 0) return 0n
		let value = 0n
		let remaining = bits
		while (remaining > 0) {
			const take = Math.min(64, remaining)
			const chunk = next64() >> BigInt(64 - take)
			value = (value << BigInt(take)) | chunk
			remaining -= take
		}
		return value
	}
}

describe('andBitsetRecursive', () => {
	test('handles normal bitset intersections', () => {
		assert.strictEqual(andBitsetRecursive(0b110101n, 0b101101n), 0b100101n)
		assert.strictEqual(andBitsetRecursive(0b1n, 0b1n), 0b1n)
		assert.strictEqual(andBitsetRecursive(0b10n, 0b11n), 0b10n)
		assert.strictEqual(andBitsetRecursive(0xff00ff00n, 0x0ff0f0f0n), 0x0f00f000n)
		assert.strictEqual(
			andBitsetRecursive(0xdeadbeefcafebaben, 0xffff0000ffff0000n),
			0xdead0000cafe0000n,
		)
	})

	test('handles zero bitsets', () => {
		assert.strictEqual(andBitsetRecursive(0n, 0n), 0n)
		assert.strictEqual(andBitsetRecursive(0n, 1n), 0n)
		assert.strictEqual(andBitsetRecursive(1n, 0n), 0n)
		assert.strictEqual(andBitsetRecursive(0n, (1n << 700n) - 1n), 0n)
		assert.strictEqual(andBitsetRecursive((1n << 700n) - 1n, 0n), 0n)
	})

	test('handles identical bitsets (idempotence)', () => {
		const samples = [
			0n,
			1n,
			2n,
			3n,
			0b1010101010101n,
			(1n << 64n) - 1n,
			(1n << 512n) + (1n << 257n) + (1n << 13n) + 1n,
			(1n << 1024n) - 1n,
		]
		for (const x of samples) {
			assert.strictEqual(andBitsetRecursive(x, x), x)
		}
	})

	test('handles disjoint bitsets', () => {
		const evenBits = BigInt(`0x${'55'.repeat(80)}`)
		const oddBits = BigInt(`0x${'aa'.repeat(80)}`)
		assert.strictEqual(andBitsetRecursive(evenBits, oddBits), 0n)
		assert.strictEqual(andBitsetRecursive(1n << 600n, (1n << 600n) - 1n), 0n)
		assert.strictEqual(andBitsetRecursive(0b1010n, 0b0101n), 0n)
		assert.strictEqual(andBitsetRecursive(1n, 2n), 0n)
	})

	test('handles very wide bitsets (> 512 bits) with odd and even widths', () => {
		const widths = [513, 600, 769, 1024, 1537, 2048]
		for (const w of widths) {
			const fullMask = (1n << BigInt(w)) - 1n
			const highBit = 1n << BigInt(w - 1)
			const midBit = 1n << BigInt(Math.floor(w / 2))
			const sparseA = highBit | midBit | 0b10101n
			const sparseB = highBit | (1n << BigInt(Math.floor(w / 3))) | 0b11100n

			assert.strictEqual(andBitsetRecursive(fullMask, sparseA), sparseA)
			assert.strictEqual(andBitsetRecursive(sparseA, fullMask), sparseA)
			assert.strictEqual(andBitsetRecursive(sparseA, sparseB), highBit | 0b10100n)
			assert.strictEqual(andBitsetRecursive(sparseA, sparseB), sparseA & sparseB)
		}
	})

	test('handles strongly asymmetric bit-widths', () => {
		const wide = (1n << 1025n) | (1n << 512n) | 0b11011n
		const narrow = 0b10110n
		assert.strictEqual(andBitsetRecursive(wide, narrow), 0b10010n)
		assert.strictEqual(andBitsetRecursive(narrow, wide), 0b10010n)
	})

	test('satisfies commutativity and associativity', () => {
		const nextBigInt = createBitsetGenerator(42n)
		for (const width of [1, 7, 65, 520, 777]) {
			const a = nextBigInt(width)
			const b = nextBigInt(width)
			const c = nextBigInt(width)

			assert.strictEqual(andBitsetRecursive(a, b), andBitsetRecursive(b, a))
			assert.strictEqual(
				andBitsetRecursive(andBitsetRecursive(a, b), c),
				andBitsetRecursive(a, andBitsetRecursive(b, c)),
			)
		}
	})

	test('cross-checks against native BigInt & and element-wise bit comparison', () => {
		const nextBigInt = createBitsetGenerator(0x9e3779b97f4a7c15n)
		const testWidths = [1, 2, 3, 4, 5, 7, 8, 15, 16, 31, 32, 63, 64, 127, 256, 513, 640, 1025]

		for (const width of testWidths) {
			for (let trial = 0; trial < 3; trial++) {
				const a = nextBigInt(width)
				const b = nextBigInt(trial === 2 ? Math.max(1, Math.floor(width / 2)) : width)

				const actual = andBitsetRecursive(a, b)
				const expectedNative = a & b
				const expectedElementWise = elementWiseBitAnd(a, b)

				assert.strictEqual(actual, expectedNative)
				assert.strictEqual(actual, expectedElementWise)

				// Explicit per-bit verification across full width
				for (let bit = 0; bit < width; bit++) {
					const shift = BigInt(bit)
					const actualBit = (actual >> shift) & 1n
					const expectedBit = ((a >> shift) & 1n) === 1n && ((b >> shift) & 1n) === 1n ? 1n : 0n
					assert.strictEqual(actualBit, expectedBit)
				}
			}
		}
	})

	test('throws RangeError for negative BigInt inputs', () => {
		assert.throws(() => andBitsetRecursive(-1n, 0n), RangeError)
		assert.throws(() => andBitsetRecursive(0n, -1n), RangeError)
		assert.throws(() => andBitsetRecursive(-1n, 1n), RangeError)
		assert.throws(() => andBitsetRecursive(1n, -1n), RangeError)
		assert.throws(() => andBitsetRecursive(-42n, -7n), RangeError)
		assert.throws(() => andBitsetRecursive(-(1n << 600n), 1n << 600n), RangeError)
	})

	test('throws TypeError for non-BigInt inputs', () => {
		const invalidValues = [
			0,
			1,
			42,
			NaN,
			Infinity,
			-Infinity,
			'1',
			'0b101',
			true,
			false,
			null,
			undefined,
			{},
			[],
			Symbol('bit'),
		]

		for (const invalid of invalidValues) {
			assert.throws(() => andBitsetRecursive(invalid, 1n), TypeError)
			assert.throws(() => andBitsetRecursive(1n, invalid), TypeError)
		}
		assert.throws(() => andBitsetRecursive(1, 2), TypeError)
	})
})
