import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { permutationsBigIntMemo } from './permutationsBigIntMemo.js'

/**
 * Independent reference implementation via direct iterative falling product.
 * @param {bigint} n
 * @param {bigint} k
 * @returns {bigint}
 */
function naivePermutations(n, k) {
	if (k > n) return 0n
	let result = 1n
	for (let i = 0n; i < k; i++) {
		result *= n - i
	}
	return result
}

/**
 * Independent reference factorial implementation.
 * @param {bigint} n
 * @returns {bigint}
 */
function naiveFactorial(n) {
	let result = 1n
	for (let i = 2n; i <= n; i++) {
		result *= i
	}
	return result
}

describe('permutationsBigIntMemo', () => {
	it('computes known small and medium permutation values accurately', () => {
		assert.equal(permutationsBigIntMemo(5n, 3n), 60n)
		assert.equal(permutationsBigIntMemo(6n, 2n), 30n)
		assert.equal(permutationsBigIntMemo(10n, 4n), 5040n)
		assert.equal(permutationsBigIntMemo(10n, 10n), 3628800n)
		assert.equal(permutationsBigIntMemo(20n, 20n), 2432902008176640000n)
		assert.equal(permutationsBigIntMemo(21n, 2n), 420n)
		assert.equal(permutationsBigIntMemo(25n, 5n), 6375600n)
		assert.equal(permutationsBigIntMemo(65n, 3n), 65n * 64n * 63n)
	})

	it('defaults k to n when k is omitted', () => {
		assert.equal(permutationsBigIntMemo(0n), 1n)
		assert.equal(permutationsBigIntMemo(1n), 1n)
		assert.equal(permutationsBigIntMemo(5n), 120n)
		assert.equal(permutationsBigIntMemo(20n), 2432902008176640000n)
		assert.equal(permutationsBigIntMemo(30n), naiveFactorial(30n))
	})

	it('handles edge cases: k = 0, k = 1, k > n, and n = 0', () => {
		assert.equal(permutationsBigIntMemo(0n, 0n), 1n)
		assert.equal(permutationsBigIntMemo(0n, 1n), 0n)
		assert.equal(permutationsBigIntMemo(1n, 0n), 1n)
		assert.equal(permutationsBigIntMemo(1n, 1n), 1n)
		assert.equal(permutationsBigIntMemo(5n, 0n), 1n)
		assert.equal(permutationsBigIntMemo(5n, 1n), 5n)
		assert.equal(permutationsBigIntMemo(5n, 6n), 0n)
		assert.equal(permutationsBigIntMemo(20n, 21n), 0n)
		assert.equal(permutationsBigIntMemo(100n, 0n), 1n)
		assert.equal(permutationsBigIntMemo(100n, 1n), 100n)
		assert.equal(permutationsBigIntMemo(100n, 101n), 0n)

		const huge = 10n ** 50n
		assert.equal(permutationsBigIntMemo(huge, 0n), 1n)
		assert.equal(permutationsBigIntMemo(huge, 1n), huge)
		assert.equal(permutationsBigIntMemo(huge, huge + 1n), 0n)
	})

	it('handles values across precomputed table and factorial cache boundaries', () => {
		const boundaries = [
			[19n, 10n],
			[20n, 10n],
			[21n, 10n],
			[64n, 40n],
			[65n, 40n],
			[120n, 60n],
			[2048n, 5n],
			[2048n, 2040n],
			[2049n, 5n],
			[2049n, 30n],
		]

		for (const [n, k] of boundaries) {
			assert.equal(
				permutationsBigIntMemo(n, k),
				naivePermutations(n, k),
				`mismatch at P(${n}, ${k})`
			)
		}
	})

	it('computes exact values for very large n with small k without computing n!', () => {
		const n = 10n ** 18n
		assert.equal(
			permutationsBigIntMemo(n, 3n),
			n * (n - 1n) * (n - 2n)
		)

		const n2 = 10n ** 30n
		assert.equal(
			permutationsBigIntMemo(n2, 4n),
			n2 * (n2 - 1n) * (n2 - 2n) * (n2 - 3n)
		)
	})

	it('returns consistent exact results on repeated memoized calls', () => {
		const first = permutationsBigIntMemo(150n, 75n)
		const second = permutationsBigIntMemo(150n, 75n)
		const expected = naivePermutations(150n, 75n)

		assert.equal(first, expected)
		assert.equal(second, expected)
		assert.equal(first, second)
	})

	it('validates input types and non-negativity', () => {
		assert.throws(() => permutationsBigIntMemo(5, 3n), TypeError)
		assert.throws(() => permutationsBigIntMemo(5n, 3), TypeError)
		assert.throws(() => permutationsBigIntMemo('5', 3n), TypeError)
		assert.throws(() => permutationsBigIntMemo(5n, '3'), TypeError)
		assert.throws(() => permutationsBigIntMemo(null, 1n), TypeError)
		assert.throws(() => permutationsBigIntMemo(5n, null), TypeError)
		assert.throws(() => permutationsBigIntMemo(undefined, 1n), TypeError)
		assert.throws(() => permutationsBigIntMemo(NaN, 1n), TypeError)

		assert.throws(() => permutationsBigIntMemo(-1n, 0n), RangeError)
		assert.throws(() => permutationsBigIntMemo(5n, -1n), RangeError)
		assert.throws(() => permutationsBigIntMemo(-10n, -2n), RangeError)
	})

	it('cross-checks all pairs 0 <= k <= n <= 35 against naive reference', () => {
		for (let n = 0n; n <= 35n; n++) {
			for (let k = 0n; k <= n; k++) {
				assert.equal(
					permutationsBigIntMemo(n, k),
					naivePermutations(n, k),
					`mismatch at P(${n}, ${k})`
				)
			}
		}
	})

	it('satisfies fundamental combinatorial identities (independent cross-check)', () => {
		// Build Pascal's triangle independently to verify P(n, k) = C(n, k) * k!
		const maxN = 25
		const pascal = [[1n]]
		for (let n = 1; n <= maxN; n++) {
			const row = [1n]
			for (let k = 1; k < n; k++) {
				row.push(pascal[n - 1][k - 1] + pascal[n - 1][k])
			}
			row.push(1n)
			pascal.push(row)
		}

		for (let n = 1; n <= maxN; n++) {
			const nBig = BigInt(n)
			const nFact = naiveFactorial(nBig)
			for (let k = 1; k <= n; k++) {
				const kBig = BigInt(k)
				const p = permutationsBigIntMemo(nBig, kBig)

				// P(n, k) = C(n, k) * k!
				assert.equal(p, pascal[n][k] * naiveFactorial(kBig))

				// P(n, k) * (n - k)! = n!
				assert.equal(p * naiveFactorial(nBig - kBig), nFact)

				// Recurrence: P(n, k) = n * P(n - 1, k - 1)
				assert.equal(p, nBig * permutationsBigIntMemo(nBig - 1n, kBig - 1n))

				// Additive recurrence: P(n, k) = P(n - 1, k) + k * P(n - 1, k - 1)
				assert.equal(
					p,
					permutationsBigIntMemo(nBig - 1n, kBig) +
						kBig * permutationsBigIntMemo(nBig - 1n, kBig - 1n)
				)
			}
		}

		// Multiplicative chain identity: P(n, a + b) = P(n, a) * P(n - a, b)
		assert.equal(
			permutationsBigIntMemo(80n, 45n),
			permutationsBigIntMemo(80n, 20n) * permutationsBigIntMemo(60n, 25n)
		)
	})
})
