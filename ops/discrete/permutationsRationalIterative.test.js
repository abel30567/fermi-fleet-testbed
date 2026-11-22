import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { permutationsRationalIterative } from './permutationsRationalIterative.js'

/**
 * Helper to construct a canonical integer rational `{ num, den: 1n }`.
 * @param {bigint} n
 */
const rat = (n, d = 1n) => ({ num: n, den: d })

/**
 * Independent factorial implementation for cross-checking `n! / (n - k)!`.
 * @param {bigint} n
 * @returns {bigint}
 */
function factorial(n) {
	let acc = 1n
	for (let i = 2n; i <= n; i += 1n) {
		acc *= i
	}
	return acc
}

describe('permutationsRationalIterative', () => {
	test('computes standard base and small cases', () => {
		assert.deepEqual(permutationsRationalIterative(rat(0n), rat(0n)), rat(1n))
		assert.deepEqual(permutationsRationalIterative(rat(1n), rat(0n)), rat(1n))
		assert.deepEqual(permutationsRationalIterative(rat(1n), rat(1n)), rat(1n))
		assert.deepEqual(permutationsRationalIterative(rat(5n), rat(0n)), rat(1n))
		assert.deepEqual(permutationsRationalIterative(rat(5n), rat(1n)), rat(5n))
		assert.deepEqual(permutationsRationalIterative(rat(5n), rat(3n)), rat(60n))
		assert.deepEqual(permutationsRationalIterative(rat(5n), rat(5n)), rat(120n))
	})

	test('returns 0/1 when k > n (combinatorial convention)', () => {
		assert.deepEqual(permutationsRationalIterative(rat(3n), rat(5n)), rat(0n))
		assert.deepEqual(permutationsRationalIterative(rat(0n), rat(1n)), rat(0n))
		assert.deepEqual(permutationsRationalIterative(rat(0n), rat(10n)), rat(0n))
		assert.deepEqual(permutationsRationalIterative(rat(7n), rat(8n)), rat(0n))
	})

	test('handles large values beyond Number.MAX_SAFE_INTEGER accurately', () => {
		// P(30, 10) = 30 * 29 * ... * 21 = 109027350432000
		assert.deepEqual(
			permutationsRationalIterative(rat(30n), rat(10n)),
			rat(109027350432000n),
		)

		// P(50, 20) compared against independent factorial ratio
		const p50_20 = permutationsRationalIterative(rat(50n), rat(20n))
		assert.equal(p50_20.den, 1n)
		assert.equal(p50_20.num, factorial(50n) / factorial(30n))

		// P(100, 100) = 100!
		const p100_100 = permutationsRationalIterative(rat(100n), rat(100n))
		assert.equal(p100_100.den, 1n)
		assert.equal(p100_100.num, factorial(100n))
	})

	test('accepts unreduced and double-negative integer rationals without mutating inputs', () => {
		const nUnreduced = { num: 15n, den: 3n }
		const kUnreduced = { num: 6n, den: 2n }
		assert.deepEqual(permutationsRationalIterative(nUnreduced, kUnreduced), rat(60n))
		assert.deepEqual(nUnreduced, { num: 15n, den: 3n })
		assert.deepEqual(kUnreduced, { num: 6n, den: 2n })

		// Both numerator and denominator negative -> positive integer after reduction
		assert.deepEqual(
			permutationsRationalIterative({ num: -10n, den: -2n }, { num: -9n, den: -3n }),
			rat(60n),
		)

		// Zero represented with non-unit or negative denominators
		assert.deepEqual(
			permutationsRationalIterative({ num: 0n, den: 7n }, { num: 0n, den: -4n }),
			rat(1n),
		)
		assert.deepEqual(
			permutationsRationalIterative({ num: 12n, den: 4n }, { num: 25n, den: 5n }),
			rat(0n),
		)
	})

	test('throws TypeError on invalid input shapes or non-BigInt fields', () => {
		const badInputs = [
			null,
			undefined,
			5,
			5n,
			'5/1',
			[5n, 1n],
			{},
			{ num: 5n },
			{ den: 1n },
			{ num: 5, den: 1n },
			{ num: 5n, den: 1 },
			{ num: '5', den: '1' },
		]

		for (const bad of badInputs) {
			assert.throws(
				() => permutationsRationalIterative(bad, rat(1n)),
				TypeError,
				`Expected TypeError for n=${String(bad)}`,
			)
			assert.throws(
				() => permutationsRationalIterative(rat(5n), bad),
				TypeError,
				`Expected TypeError for k=${String(bad)}`,
			)
		}
	})

	test('throws RangeError on zero denominators, non-integers, or negative values', () => {
		const outOfRange = [
			{ num: 5n, den: 0n },
			{ num: 0n, den: 0n },
			{ num: 5n, den: 2n },
			{ num: 7n, den: 3n },
			{ num: -5n, den: -2n },
			{ num: -1n, den: 1n },
			{ num: 5n, den: -1n },
			{ num: -10n, den: 2n },
			{ num: 10n, den: -2n },
		]

		for (const bad of outOfRange) {
			assert.throws(
				() => permutationsRationalIterative(bad, rat(0n)),
				RangeError,
				`Expected RangeError for n=${bad.num}/${bad.den}`,
			)
			assert.throws(
				() => permutationsRationalIterative(rat(5n), bad),
				RangeError,
				`Expected RangeError for k=${bad.num}/${bad.den}`,
			)
		}
	})

	test('cross-checks against independent factorial ratio n! / (n - k)! across a full grid', () => {
		for (let n = 0n; n <= 20n; n += 1n) {
			const nFact = factorial(n)
			for (let k = 0n; k <= 25n; k += 1n) {
				const actual = permutationsRationalIterative(rat(n), rat(k))
				assert.equal(actual.den, 1n)
				if (k > n) {
					assert.equal(actual.num, 0n)
				} else {
					const expected = nFact / factorial(n - k)
					assert.equal(actual.num, expected, `Mismatch for P(${n}, ${k})`)
				}
			}
		}

		// Additional larger cross-checks
		const largePairs = [
			[30n, 10n],
			[40n, 15n],
			[50n, 25n],
			[60n, 0n],
			[60n, 60n],
			[60n, 61n],
		]
		for (const [n, k] of largePairs) {
			const actual = permutationsRationalIterative(rat(n), rat(k))
			const expected = k > n ? 0n : factorial(n) / factorial(n - k)
			assert.deepEqual(actual, rat(expected))
		}
	})

	test('satisfies combinatorial identities for permutations', () => {
		for (let n = 1n; n <= 15n; n += 1n) {
			for (let k = 1n; k <= n; k += 1n) {
				const pnk = permutationsRationalIterative(rat(n), rat(k)).num
				const pn1k1 = permutationsRationalIterative(rat(n - 1n), rat(k - 1n)).num
				const pn1k = permutationsRationalIterative(rat(n - 1n), rat(k)).num

				// P(n, k) = n * P(n - 1, k - 1)
				assert.equal(pnk, n * pn1k1)

				// P(n, k) = P(n - 1, k) + k * P(n - 1, k - 1)
				assert.equal(pnk, pn1k + k * pn1k1)
			}
		}
	})
})
