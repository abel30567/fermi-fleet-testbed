import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { productBigIntRecursive } from './productBigIntRecursive.js'

/**
 * Independent iterative reference implementation for cross-checking.
 *
 * @param {readonly bigint[]} values
 * @returns {bigint}
 */
function iterativeProduct(values) {
	let acc = 1n
	for (let i = 0; i < values.length; i++) {
		acc *= values[i]
	}
	return acc
}

describe('productBigIntRecursive', () => {
	describe('normal cases', () => {
		test('multiplies small positive BigInts', () => {
			assert.equal(productBigIntRecursive([2n, 3n, 4n]), 24n)
			assert.equal(productBigIntRecursive([1n, 2n, 3n, 4n, 5n]), 120n)
			assert.equal(productBigIntRecursive([7n, 11n, 13n]), 1001n)
		})

		test('handles even, odd, power-of-two, and non-power-of-two lengths', () => {
			assert.equal(productBigIntRecursive([2n, 5n]), 10n)
			assert.equal(productBigIntRecursive([2n, 3n, 5n]), 30n)
			assert.equal(productBigIntRecursive([2n, 3n, 5n, 7n]), 210n)
			assert.equal(productBigIntRecursive([2n, 3n, 5n, 7n, 11n]), 2310n)
			assert.equal(
				productBigIntRecursive([2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n]),
				9699690n,
			)
			assert.equal(
				productBigIntRecursive([2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n]),
				223092870n,
			)
		})

		test('does not mutate the input array', () => {
			const input = [3n, -5n, 7n, 11n, 13n]
			const snapshot = [...input]
			const result = productBigIntRecursive(input)
			assert.equal(result, -15015n)
			assert.deepEqual(input, snapshot)
		})
	})

	describe('edge cases', () => {
		test('returns 1n for empty array (multiplicative identity)', () => {
			assert.equal(productBigIntRecursive([]), 1n)
		})

		test('returns the element itself for single-element arrays', () => {
			assert.equal(productBigIntRecursive([0n]), 0n)
			assert.equal(productBigIntRecursive([1n]), 1n)
			assert.equal(productBigIntRecursive([-1n]), -1n)
			assert.equal(productBigIntRecursive([42n]), 42n)
			assert.equal(productBigIntRecursive([-98765432109876543210n]), -98765432109876543210n)
		})

		test('returns 0n when array contains 0n in any position', () => {
			assert.equal(productBigIntRecursive([0n, 2n, 3n, 4n]), 0n)
			assert.equal(productBigIntRecursive([2n, 3n, 0n, 4n, 5n]), 0n)
			assert.equal(productBigIntRecursive([2n, 3n, 4n, 0n]), 0n)
			assert.equal(productBigIntRecursive([0n, 0n, 0n]), 0n)
			assert.equal(productBigIntRecursive([-5n, 0n, 10n ** 100n]), 0n)
		})

		test('handles negative values with odd and even counts', () => {
			assert.equal(productBigIntRecursive([-2n, 3n, 4n]), -24n)
			assert.equal(productBigIntRecursive([-2n, -3n, 4n]), 24n)
			assert.equal(productBigIntRecursive([-2n, -3n, -4n]), -24n)
			assert.equal(productBigIntRecursive([-1n, -1n, -1n, -1n]), 1n)
			assert.equal(productBigIntRecursive([-1n, -1n, -1n, -1n, -1n]), -1n)
		})

		test('handles huge BigInts far beyond Number.MAX_SAFE_INTEGER', () => {
			const a = 10n ** 100n + 7n
			const b = 10n ** 100n - 7n
			// Difference of squares: (10^100)^2 - 49
			assert.equal(productBigIntRecursive([a, b]), 10n ** 200n - 49n)

			const hugeFactors = Array.from({ length: 16 }, () => 10n ** 50n)
			assert.equal(productBigIntRecursive(hugeFactors), 10n ** 800n)

			const signedHuge = [-(2n ** 256n), 2n ** 256n, -(2n ** 512n)]
			assert.equal(productBigIntRecursive(signedHuge), 2n ** 1024n)
		})
	})

	describe('validation errors', () => {
		test('throws TypeError when input is not an Array', () => {
			const invalidInputs = [
				null,
				undefined,
				42,
				42n,
				'123',
				true,
				{},
				{ length: 1, 0: 2n },
				new Set([1n, 2n]),
				new BigInt64Array([1n, 2n]),
			]

			for (const bad of invalidInputs) {
				assert.throws(
					() => productBigIntRecursive(bad),
					{ name: 'TypeError' },
				)
			}
		})

		test('throws TypeError when any element is not a bigint', () => {
			const invalidArrays = [
				[1],
				[1n, 2, 3n],
				[1n, '2', 3n],
				[1n, null, 3n],
				[1n, undefined, 3n],
				[1n, NaN, 3n],
				[1n, Infinity, 3n],
				[1n, true, 3n],
				[1n, {}, 3n],
				[1n, [2n], 3n],
			]

			for (const bad of invalidArrays) {
				assert.throws(
					() => productBigIntRecursive(bad),
					{ name: 'TypeError' },
				)
			}
		})

		test('throws TypeError for sparse arrays with holes', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1n, , 3n]
			assert.throws(() => productBigIntRecursive(sparse), { name: 'TypeError' })
			assert.throws(() => productBigIntRecursive(new Array(3)), { name: 'TypeError' })
		})

		test('validates all elements even if an earlier element is 0n', () => {
			assert.throws(() => productBigIntRecursive([0n, 2]), { name: 'TypeError' })
			assert.throws(() => productBigIntRecursive([0n, 1n, 'bad']), { name: 'TypeError' })
		})
	})

	describe('mathematical identities and iterative cross-checks', () => {
		test('matches exact factorial values (20! and 100!)', () => {
			const seq20 = Array.from({ length: 20 }, (_, i) => BigInt(i + 1))
			assert.equal(productBigIntRecursive(seq20), 2432902008176640000n)

			const seq100 = Array.from({ length: 100 }, (_, i) => BigInt(i + 1))
			const expected100Factorial =
				93326215443944152681699238856266700490715968264381621468592963895217599993229915608941463976156518286253697920827223758251185210916864000000000000000000000000n
			assert.equal(productBigIntRecursive(seq100), expected100Factorial)
		})

		test('matches power-of-two identities', () => {
			const twos = Array.from({ length: 1000 }, () => 2n)
			assert.equal(productBigIntRecursive(twos), 2n ** 1000n)

			// Product of 2^1 * 2^2 * ... * 2^k = 2^(k*(k+1)/2)
			const k = 200
			const powers = Array.from({ length: k }, (_, i) => 2n ** BigInt(i + 1))
			const expectedExponent = BigInt((k * (k + 1)) / 2)
			assert.equal(productBigIntRecursive(powers), 2n ** expectedExponent)
		})

		test('cross-checks against independent iterative multiplication across sizes and signs', () => {
			// Deterministic LCG-generated BigInt values across multiple sizes
			let seed = 123456789n
			const nextVal = () => {
				seed = (seed * 6364136223846793005n + 1442695040888963407n) % (2n ** 64n)
				const magnitude = (seed % 1000003n) + 1n
				return (seed & 1n) === 0n ? magnitude : -magnitude
			}

			for (const size of [1, 2, 3, 4, 5, 7, 8, 15, 16, 31, 63, 127, 500]) {
				const values = Array.from({ length: size }, () => nextVal())
				const recursiveResult = productBigIntRecursive(values)
				const iterativeResult = iterativeProduct(values)
				assert.equal(recursiveResult, iterativeResult)

				// Commutativity check: reversed array must produce identical product
				const reversed = [...values].reverse()
				assert.equal(productBigIntRecursive(reversed), recursiveResult)
			}
		})
	})
})
