import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { convolutionBigIntRecursive } from './convolutionBigIntRecursive.js'

/**
 * Independent O(N * M) reference implementation of linear discrete convolution.
 *
 * @param {bigint[]} a
 * @param {bigint[]} b
 * @returns {bigint[]}
 */
function directConvolution(a, b) {
	if (a.length === 0 || b.length === 0) {
		return []
	}
	const out = new Array(a.length + b.length - 1).fill(0n)
	for (let i = 0; i < a.length; i++) {
		for (let j = 0; j < b.length; j++) {
			out[i + j] += a[i] * b[j]
		}
	}
	return out
}

describe('convolutionBigIntRecursive', () => {
	it('computes basic discrete convolution of small positive sequences', () => {
		assert.deepEqual(
			convolutionBigIntRecursive([1n, 2n, 3n], [4n, 5n, 6n]),
			[4n, 13n, 28n, 27n, 18n],
		)
	})

	it('handles empty arrays', () => {
		assert.deepEqual(convolutionBigIntRecursive([], []), [])
		assert.deepEqual(convolutionBigIntRecursive([], [1n, 2n, 3n]), [])
		assert.deepEqual(convolutionBigIntRecursive([1n, 2n, 3n], []), [])
	})

	it('handles single-element arrays and unit impulse identity', () => {
		assert.deepEqual(convolutionBigIntRecursive([7n], [9n]), [63n])
		assert.deepEqual(convolutionBigIntRecursive([1n], [5n, -3n, 8n, 0n]), [5n, -3n, 8n, 0n])
		assert.deepEqual(convolutionBigIntRecursive([5n, -3n, 8n, 0n], [1n]), [5n, -3n, 8n, 0n])
		assert.deepEqual(convolutionBigIntRecursive([-2n], [3n, 4n, -5n]), [-6n, -8n, 10n])
	})

	it('handles all-zero sequences', () => {
		assert.deepEqual(
			convolutionBigIntRecursive([0n, 0n, 0n], [1n, 2n, 3n, 4n]),
			[0n, 0n, 0n, 0n, 0n, 0n],
		)
		assert.deepEqual(
			convolutionBigIntRecursive([0n, 0n], [0n, 0n, 0n]),
			[0n, 0n, 0n, 0n],
		)
	})

	it('handles unequal lengths including highly unbalanced sizes', () => {
		const short = [2n, -1n, 3n]
		const long = [1n, 4n, -2n, 5n, 0n, 7n, -3n, 8n, 6n, -4n, 9n]
		assert.deepEqual(
			convolutionBigIntRecursive(short, long),
			directConvolution(short, long),
		)
		assert.deepEqual(
			convolutionBigIntRecursive(long, short),
			directConvolution(long, short),
		)
	})

	it('handles negative values and exact huge BigInts beyond Number.MAX_SAFE_INTEGER', () => {
		const big = 10n ** 50n
		const a = [big + 1n, -(big * 3n), 2n ** 128n - 1n, -(10n ** 30n)]
		const b = [-(big + 7n), 10n ** 40n, -(2n ** 100n), big * 2n + 5n, -9n]
		assert.deepEqual(
			convolutionBigIntRecursive(a, b),
			directConvolution(a, b),
		)
	})

	it('satisfies commutativity and does not mutate input arrays', () => {
		const a = [3n, -7n, 11n, 0n, 19n, -23n]
		const b = [-5n, 13n, -17n, 29n]
		const aCopy = [...a]
		const bCopy = [...b]

		const ab = convolutionBigIntRecursive(a, b)
		const ba = convolutionBigIntRecursive(b, a)

		assert.deepEqual(ab, ba)
		assert.deepEqual(a, aCopy)
		assert.deepEqual(b, bCopy)
	})

	it('matches direct O(N*M) convolution across a wide matrix of sizes and deterministic pseudo-random BigInts', () => {
		// Deterministic LCG for reproducible pseudo-random signed BigInts
		let seed = 0x123456789abcdef1n
		const mask = (1n << 64n) - 1n
		const nextBigInt = () => {
			seed = (seed * 6364136223846793005n + 1442695040888963407n) & mask
			return seed - (1n << 63n)
		}

		const lengths = [1, 2, 3, 4, 5, 7, 8, 9, 15, 16, 17, 31, 33]
		for (const n of lengths) {
			for (const m of lengths) {
				const a = Array.from({ length: n }, nextBigInt)
				const b = Array.from({ length: m }, nextBigInt)
				assert.deepEqual(
					convolutionBigIntRecursive(a, b),
					directConvolution(a, b),
					`mismatch for lengths (${n}, ${m})`,
				)
			}
		}
	})

	it('cross-checks large inputs (N=128, M=129) against direct O(N*M) convolution', () => {
		const a = Array.from({ length: 128 }, (_, i) => BigInt(i % 2 === 0 ? i + 1 : -(i + 1)) * 10n ** 18n)
		const b = Array.from({ length: 129 }, (_, i) => BigInt((i * 7) % 19 - 9) * 10n ** 18n)
		const actual = convolutionBigIntRecursive(a, b)
		const expected = directConvolution(a, b)
		assert.equal(actual.length, 256)
		assert.deepEqual(actual, expected)
	})

	it('throws TypeError on invalid inputs', () => {
		assert.throws(() => convolutionBigIntRecursive(null, [1n]), TypeError)
		assert.throws(() => convolutionBigIntRecursive([1n], undefined), TypeError)
		assert.throws(() => convolutionBigIntRecursive('123', [1n]), TypeError)
		assert.throws(() => convolutionBigIntRecursive([1n], 42n), TypeError)
		assert.throws(() => convolutionBigIntRecursive([1, 2], [1n]), TypeError)
		assert.throws(() => convolutionBigIntRecursive([1n], [1n, 2]), TypeError)
		assert.throws(() => convolutionBigIntRecursive([1n, '2'], [1n]), TypeError)
		assert.throws(() => convolutionBigIntRecursive([], [1]), TypeError)
		assert.throws(() => convolutionBigIntRecursive([1], []), TypeError)

		// Sparse array containing empty slot
		const sparse = new Array(3)
		sparse[0] = 1n
		sparse[2] = 3n
		assert.throws(() => convolutionBigIntRecursive(sparse, [1n]), TypeError)
	})
})
