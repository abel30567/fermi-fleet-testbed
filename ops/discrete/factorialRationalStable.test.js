import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { factorialRationalStable } from './factorialRationalStable.js'

/**
 * Independent reference implementation using a straightforward iterative BigInt loop.
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

describe('factorialRationalStable', () => {
	test('computes exact values for standard non-negative integers (0!, 1!, 5!, 20!, 50!)', () => {
		assert.deepEqual(factorialRationalStable({ num: 0n, den: 1n }), {
			num: 1n,
			den: 1n,
		})
		assert.deepEqual(factorialRationalStable({ num: 1n, den: 1n }), {
			num: 1n,
			den: 1n,
		})
		assert.deepEqual(factorialRationalStable({ num: 5n, den: 1n }), {
			num: 120n,
			den: 1n,
		})
		assert.deepEqual(factorialRationalStable({ num: 20n, den: 1n }), {
			num: 2432902008176640000n,
			den: 1n,
		})
		assert.deepEqual(factorialRationalStable({ num: 50n, den: 1n }), {
			num: 30414093201713378043612608166064768844377641568960512000000000000n,
			den: 1n,
		})
	})

	test('handles unreduced integer rationals and negative denominators', () => {
		assert.deepEqual(factorialRationalStable({ num: 6n, den: 2n }), {
			num: 6n,
			den: 1n,
		})
		assert.deepEqual(factorialRationalStable({ num: 10n, den: 2n }), {
			num: 120n,
			den: 1n,
		})
		assert.deepEqual(factorialRationalStable({ num: -6n, den: -2n }), {
			num: 6n,
			den: 1n,
		})
		assert.deepEqual(factorialRationalStable({ num: -20n, den: -4n }), {
			num: 120n,
			den: 1n,
		})
		assert.deepEqual(factorialRationalStable({ num: 0n, den: 7n }), {
			num: 1n,
			den: 1n,
		})
		assert.deepEqual(factorialRationalStable({ num: 0n, den: -9n }), {
			num: 1n,
			den: 1n,
		})
		assert.deepEqual(
			factorialRationalStable({
				num: 100000000000000000000n,
				den: 10000000000000000000n,
			}),
			{ num: 3628800n, den: 1n }
		)
	})

	test('rejects negative rationals with RangeError', () => {
		assert.throws(() => factorialRationalStable({ num: -1n, den: 1n }), RangeError)
		assert.throws(() => factorialRationalStable({ num: -6n, den: 2n }), RangeError)
		assert.throws(() => factorialRationalStable({ num: 6n, den: -2n }), RangeError)
		assert.throws(() => factorialRationalStable({ num: -50n, den: 1n }), RangeError)
	})

	test('rejects non-integer rationals with RangeError', () => {
		assert.throws(() => factorialRationalStable({ num: 1n, den: 2n }), RangeError)
		assert.throws(() => factorialRationalStable({ num: 5n, den: 2n }), RangeError)
		assert.throws(() => factorialRationalStable({ num: -5n, den: 2n }), RangeError)
		assert.throws(() => factorialRationalStable({ num: 7n, den: -3n }), RangeError)
		assert.throws(() => factorialRationalStable({ num: -7n, den: -3n }), RangeError)
	})

	test('rejects zero denominator with RangeError', () => {
		assert.throws(() => factorialRationalStable({ num: 0n, den: 0n }), RangeError)
		assert.throws(() => factorialRationalStable({ num: 5n, den: 0n }), RangeError)
		assert.throws(() => factorialRationalStable({ num: -5n, den: 0n }), RangeError)
	})

	test('rejects invalid input types with TypeError', () => {
		assert.throws(() => factorialRationalStable(null), TypeError)
		assert.throws(() => factorialRationalStable(undefined), TypeError)
		assert.throws(() => factorialRationalStable(5), TypeError)
		assert.throws(() => factorialRationalStable(5n), TypeError)
		assert.throws(() => factorialRationalStable('5'), TypeError)
		assert.throws(() => factorialRationalStable([5n, 1n]), TypeError)
		assert.throws(() => factorialRationalStable({}), TypeError)
		assert.throws(() => factorialRationalStable({ num: 5, den: 1n }), TypeError)
		assert.throws(() => factorialRationalStable({ num: 5n, den: 1 }), TypeError)
	})

	test('cross-checks against iterative BigInt loop and recurrence n! === n * (n-1)!', () => {
		let prev = factorialRationalStable({ num: 0n, den: 1n })
		assert.deepEqual(prev, { num: 1n, den: 1n })

		for (let n = 1n; n <= 120n; n += 1n) {
			const res = factorialRationalStable({ num: n, den: 1n })
			assert.equal(res.den, 1n)

			// Independent iterative BigInt loop check
			const expected = iterativeFactorial(n)
			assert.equal(res.num, expected, `iterative mismatch at n=${n}`)

			// Recurrence identity: n! === n * (n - 1)!
			assert.equal(res.num, n * prev.num, `recurrence mismatch at n=${n}`)

			// Equivalence under scaling by positive and negative factors
			const scale = n + 3n
			const scaledPos = factorialRationalStable({ num: n * scale, den: scale })
			const scaledNeg = factorialRationalStable({
				num: -(n * scale),
				den: -scale,
			})
			assert.deepEqual(scaledPos, res)
			assert.deepEqual(scaledNeg, res)

			prev = res
		}
	})

	test('cross-checks larger factorial (200!) against iterative computation', () => {
		const res200 = factorialRationalStable({ num: 200n, den: 1n })
		const res199 = factorialRationalStable({ num: 199n, den: 1n })
		assert.equal(res200.den, 1n)
		assert.equal(res200.num, iterativeFactorial(200n))
		assert.equal(res200.num, 200n * res199.num)
	})
})
