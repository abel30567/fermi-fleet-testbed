import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { factorialRationalRecursive } from './factorialRationalRecursive.js'

/**
 * Independent iterative BigInt factorial used for cross-checking.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function iterativeFactorial(n) {
	let acc = 1n
	for (let i = 2n; i <= n; i += 1n) {
		acc *= i
	}
	return acc
}

describe('factorialRationalRecursive', () => {
	test('handles base cases 0! and 1!', () => {
		assert.deepEqual(factorialRationalRecursive({ num: 0n, den: 1n }), {
			num: 1n,
			den: 1n,
		})
		assert.deepEqual(factorialRationalRecursive({ num: 1n, den: 1n }), {
			num: 1n,
			den: 1n,
		})
	})

	test('computes standard small and medium factorials accurately', () => {
		assert.deepEqual(factorialRationalRecursive({ num: 2n, den: 1n }), {
			num: 2n,
			den: 1n,
		})
		assert.deepEqual(factorialRationalRecursive({ num: 3n, den: 1n }), {
			num: 6n,
			den: 1n,
		})
		assert.deepEqual(factorialRationalRecursive({ num: 5n, den: 1n }), {
			num: 120n,
			den: 1n,
		})
		assert.deepEqual(factorialRationalRecursive({ num: 10n, den: 1n }), {
			num: 3628800n,
			den: 1n,
		})
		assert.deepEqual(factorialRationalRecursive({ num: 20n, den: 1n }), {
			num: 2432902008176640000n,
			den: 1n,
		})
	})

	test('accepts unreduced and double-negative integer rationals without mutating input', () => {
		const input = { num: 6n, den: 2n }
		assert.deepEqual(factorialRationalRecursive(input), {
			num: 6n,
			den: 1n,
		})
		assert.deepEqual(input, { num: 6n, den: 2n })

		assert.deepEqual(factorialRationalRecursive({ num: 25n, den: 5n }), {
			num: 120n,
			den: 1n,
		})
		assert.deepEqual(factorialRationalRecursive({ num: 0n, den: 42n }), {
			num: 1n,
			den: 1n,
		})
		assert.deepEqual(factorialRationalRecursive({ num: 0n, den: -7n }), {
			num: 1n,
			den: 1n,
		})
		assert.deepEqual(factorialRationalRecursive({ num: -6n, den: -2n }), {
			num: 6n,
			den: 1n,
		})
		assert.deepEqual(factorialRationalRecursive({ num: -100n, den: -20n }), {
			num: 120n,
			den: 1n,
		})
	})

	test('computes large factorials in lowest terms with positive denominator', () => {
		const fact50 = factorialRationalRecursive({ num: 50n, den: 1n })
		assert.equal(
			fact50.num,
			30414093201713378043612608166064768844377641568960512000000000000n,
		)
		assert.equal(fact50.den, 1n)
		assert.ok(fact50.den > 0n)

		const fact100 = factorialRationalRecursive({ num: 100n, den: 1n })
		assert.equal(
			fact100.num,
			93326215443944152681699238856266700490715968264381621468592963895217599993229915608941463976156518286253697920827223758251185210916864000000000000000000000000n,
		)
		assert.equal(fact100.den, 1n)
	})

	test('cross-checks against an independent iterative BigInt factorial', () => {
		for (let n = 0n; n <= 200n; n += 1n) {
			const expected = { num: iterativeFactorial(n), den: 1n }
			assert.deepEqual(
				factorialRationalRecursive({ num: n, den: 1n }),
				expected,
			)
			assert.deepEqual(
				factorialRationalRecursive({ num: n * 7n, den: 7n }),
				expected,
			)
		}

		for (const largeN of [500n, 1000n, 2000n]) {
			const actual = factorialRationalRecursive({ num: largeN, den: 1n })
			assert.deepEqual(actual, {
				num: iterativeFactorial(largeN),
				den: 1n,
			})
		}
	})

	test('rejects zero denominators with RangeError', () => {
		for (const invalid of [
			{ num: 0n, den: 0n },
			{ num: 1n, den: 0n },
			{ num: -5n, den: 0n },
		]) {
			assert.throws(
				() => factorialRationalRecursive(invalid),
				RangeError,
			)
		}
	})

	test('rejects negative integer rationals with RangeError', () => {
		for (const negative of [
			{ num: -1n, den: 1n },
			{ num: -6n, den: 2n },
			{ num: 6n, den: -2n },
			{ num: -100n, den: 1n },
		]) {
			assert.throws(
				() => factorialRationalRecursive(negative),
				RangeError,
			)
		}
	})

	test('rejects non-integer rationals with RangeError', () => {
		for (const nonInteger of [
			{ num: 1n, den: 2n },
			{ num: 5n, den: 2n },
			{ num: 7n, den: 3n },
			{ num: -1n, den: 2n },
			{ num: 5n, den: -2n },
			{ num: -7n, den: -3n },
		]) {
			assert.throws(
				() => factorialRationalRecursive(nonInteger),
				RangeError,
			)
		}
	})

	test('rejects malformed or non-bigint inputs with TypeError', () => {
		for (const invalid of [
			null,
			undefined,
			5,
			5n,
			'5',
			[],
			[5n, 1n],
			{},
			{ num: 5, den: 1n },
			{ num: 5n, den: 1 },
			{ num: 5, den: 1 },
			{ num: '5', den: '1' },
			{ num: 5n },
			{ den: 1n },
		]) {
			assert.throws(
				() => factorialRationalRecursive(invalid),
				TypeError,
			)
		}
	})
})
