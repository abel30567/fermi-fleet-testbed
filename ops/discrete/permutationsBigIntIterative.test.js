import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { permutationsBigIntIterative } from './permutationsBigIntIterative.js'

/**
 * Independent reference factorial for cross-checking P(n, k) = n! / (n - k)!.
 * @param {bigint} m
 * @returns {bigint}
 */
function referenceFactorial(m) {
	let acc = 1n
	for (let i = 2n; i <= m; i += 1n) {
		acc *= i
	}
	return acc
}

/**
 * Independent Pascal's triangle binomial table C(n, k) for cross-checking
 * P(n, k) = C(n, k) * k!.
 * @param {number} maxN
 * @returns {bigint[][]}
 */
function buildPascalTable(maxN) {
	const table = []
	for (let n = 0; n <= maxN; n++) {
		const row = new Array(n + 1).fill(1n)
		for (let k = 1; k < n; k++) {
			row[k] = table[n - 1][k - 1] + table[n - 1][k]
		}
		table.push(row)
	}
	return table
}

describe('permutationsBigIntIterative', () => {
	describe('normal cases', () => {
		it('computes standard small k-permutations accurately', () => {
			assert.equal(permutationsBigIntIterative(1n, 1n), 1n)
			assert.equal(permutationsBigIntIterative(5n, 2n), 20n)
			assert.equal(permutationsBigIntIterative(5n, 3n), 60n)
			assert.equal(permutationsBigIntIterative(6n, 6n), 720n)
			assert.equal(permutationsBigIntIterative(8n, 3n), 336n)
			assert.equal(permutationsBigIntIterative(10n, 4n), 5040n)
			assert.equal(permutationsBigIntIterative(12n, 5n), 95040n)
		})

		it('computes full permutations P(n, n) = n! beyond Number.MAX_SAFE_INTEGER', () => {
			assert.equal(
				permutationsBigIntIterative(20n, 20n),
				2432902008176640000n,
			)
			assert.equal(
				permutationsBigIntIterative(25n, 25n),
				15511210043330985984000000n,
			)
		})
	})

	describe('edge and boundary cases', () => {
		it('returns 1n when k === 0n, including P(0n, 0n)', () => {
			assert.equal(permutationsBigIntIterative(0n, 0n), 1n)
			assert.equal(permutationsBigIntIterative(1n, 0n), 1n)
			assert.equal(permutationsBigIntIterative(42n, 0n), 1n)
			assert.equal(permutationsBigIntIterative(10n ** 100n, 0n), 1n)
		})

		it('returns n when k === 1n for all n >= 1n', () => {
			assert.equal(permutationsBigIntIterative(1n, 1n), 1n)
			assert.equal(permutationsBigIntIterative(99n, 1n), 99n)
			const huge = 10n ** 100n + 7n
			assert.equal(permutationsBigIntIterative(huge, 1n), huge)
		})

		it('returns 0n whenever k > n', () => {
			assert.equal(permutationsBigIntIterative(0n, 1n), 0n)
			assert.equal(permutationsBigIntIterative(0n, 100n), 0n)
			assert.equal(permutationsBigIntIterative(5n, 6n), 0n)
			assert.equal(permutationsBigIntIterative(10n, 1000n), 0n)
			const huge = 10n ** 60n
			assert.equal(permutationsBigIntIterative(huge, huge + 1n), 0n)
		})

		it('handles very large BigInt n with small k efficiently and exactly', () => {
			const n = 10n ** 30n
			const expected = n * (n - 1n) * (n - 2n)
			assert.equal(permutationsBigIntIterative(n, 3n), expected)
		})

		it('handles large intermediate products accurately (P(50n, 50n) = 50!)', () => {
			const expected50Fact =
				30414093201713378043612608166064768844377641568960512000000000000n
			assert.equal(permutationsBigIntIterative(50n, 50n), expected50Fact)
			assert.equal(permutationsBigIntIterative(50n, 49n), expected50Fact)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when n is not a BigInt', () => {
			const invalidValues = [5, 0, '5', null, undefined, NaN, true, {}, []]
			for (const bad of invalidValues) {
				assert.throws(
					() => permutationsBigIntIterative(bad, 2n),
					TypeError,
				)
			}
		})

		it('throws TypeError when k is not a BigInt', () => {
			const invalidValues = [2, 0, '2', null, undefined, NaN, false, {}, []]
			for (const bad of invalidValues) {
				assert.throws(
					() => permutationsBigIntIterative(5n, bad),
					TypeError,
				)
			}
		})

		it('throws RangeError when n or k is negative', () => {
			assert.throws(() => permutationsBigIntIterative(-1n, 0n), RangeError)
			assert.throws(() => permutationsBigIntIterative(-100n, 5n), RangeError)
			assert.throws(() => permutationsBigIntIterative(0n, -1n), RangeError)
			assert.throws(() => permutationsBigIntIterative(5n, -3n), RangeError)
			assert.throws(() => permutationsBigIntIterative(-5n, -2n), RangeError)
		})
	})

	describe('independent cross-checks and algebraic identities', () => {
		it('matches independent factorial ratio n! / (n - k)! for all 0 <= k <= n <= 25', () => {
			for (let n = 0n; n <= 25n; n += 1n) {
				const nFact = referenceFactorial(n)
				for (let k = 0n; k <= n; k += 1n) {
					const denom = referenceFactorial(n - k)
					assert.equal(nFact % denom, 0n)
					assert.equal(
						permutationsBigIntIterative(n, k),
						nFact / denom,
					)
				}
			}
		})

		it('satisfies the recurrence P(n, k) = P(n - 1, k) + k * P(n - 1, k - 1)', () => {
			for (let n = 1n; n <= 20n; n += 1n) {
				for (let k = 1n; k <= n; k += 1n) {
					const lhs = permutationsBigIntIterative(n, k)
					const rhs =
						permutationsBigIntIterative(n - 1n, k) +
						k * permutationsBigIntIterative(n - 1n, k - 1n)
					assert.equal(lhs, rhs)
				}
			}
		})

		it('satisfies the multiplicative chain identity P(n, a + b) = P(n, a) * P(n - a, b)', () => {
			const cases = [
				[10n, 3n, 4n],
				[20n, 7n, 8n],
				[35n, 12n, 15n],
				[100n, 20n, 30n],
				[10n ** 20n, 4n, 5n],
			]
			for (const [n, a, b] of cases) {
				const lhs = permutationsBigIntIterative(n, a + b)
				const rhs =
					permutationsBigIntIterative(n, a) *
					permutationsBigIntIterative(n - a, b)
				assert.equal(lhs, rhs)
			}
		})

		it('matches Pascal triangle binomial identity P(n, k) = C(n, k) * k! for 0 <= k <= n <= 20', () => {
			const pascal = buildPascalTable(20)
			for (let n = 0; n <= 20; n++) {
				for (let k = 0; k <= n; k++) {
					const expected = pascal[n][k] * referenceFactorial(BigInt(k))
					assert.equal(
						permutationsBigIntIterative(BigInt(n), BigInt(k)),
						expected,
					)
				}
			}
		})
	})
})
