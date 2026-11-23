import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { factorialRationalStable } from './factorialRationalStable.js'

/**
 * Independent reference implementation using naive iterative multiplication.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function iterativeFactorial(n) {
	let acc = 1n
	for (let k = 2n; k <= n; k += 1n) {
		acc *= k
	}
	return acc
}

describe('factorialRationalStable', () => {
	test('base cases 0! and 1!', () => {
		assert.deepEqual(factorialRationalStable({ num: 0n, den: 1n }), { num: 1n, den: 1n })
		assert.deepEqual(factorialRationalStable({ num: 0n, den: 7n }), { num: 1n, den: 1n })
		assert.deepEqual(factorialRationalStable({ num: 0n, den: -9n }), { num: 1n, den: 1n })
		assert.deepEqual(factorialRationalStable({ num: 1n, den: 1n }), { num: 1n, den: 1n })
		assert.deepEqual(factorialRationalStable({ num: 5n, den: 5n }), { num: 1n, den: 1n })
	})

	test('small non-negative integers in canonical form', () => {
		const expected = [
			[2n, 2n],
			[3n, 6n],
			[4n, 24n],
			[5n, 120n],
			[6n, 720n],
			[7n, 5040n],
			[10n, 3628800n],
			[12n, 479001600n],
		]

		for (const [n, fact] of expected) {
			const res = factorialRationalStable({ num: n, den: 1n })
			assert.deepEqual(res, { num: fact, den: 1n })
			assert.equal(res.den > 0n, true)
		}
	})

	test('unreduced rational integers including double-negative fractions', () => {
		// 10 / 2 = 5 -> 5! = 120
		assert.deepEqual(factorialRationalStable({ num: 10n, den: 2n }), { num: 120n, den: 1n })
		// 12 / 3 = 4 -> 4! = 24
		assert.deepEqual(factorialRationalStable({ num: 12n, den: 3n }), { num: 24n, den: 1n })
		// -18 / -3 = 6 -> 6! = 720
		assert.deepEqual(factorialRationalStable({ num: -18n, den: -3n }), { num: 720n, den: 1n })
		// Large common factor: (13 * 10^18) / 10^18 = 13 -> 13! = 6227020800
		const scale = 10n ** 18n
		assert.deepEqual(
			factorialRationalStable({ num: 13n * scale, den: scale }),
			{ num: 6227020800n, den: 1n },
		)
	})

	test('large n (50!, 100!, 500!) exactness and lowest-terms output', () => {
		const fact50 = 30414093201713378043612608166064768844377641568960512000000000000n
		assert.deepEqual(factorialRationalStable({ num: 50n, den: 1n }), { num: fact50, den: 1n })
		assert.deepEqual(factorialRationalStable({ num: 150n, den: 3n }), { num: fact50, den: 1n })

		const res100 = factorialRationalStable({ num: 100n, den: 1n })
		assert.equal(res100.den, 1n)
		assert.equal(res100.num, iterativeFactorial(100n))

		const res500 = factorialRationalStable({ num: 500n, den: 1n })
		assert.equal(res500.den, 1n)
		assert.equal(res500.num, iterativeFactorial(500n))
	})

	test('independent cross-check against iterative product and recurrence n! = n * (n-1)!', () => {
		let prev = factorialRationalStable({ num: 0n, den: 1n })
		assert.deepEqual(prev, { num: 1n, den: 1n })

		for (let n = 1n; n <= 80n; n += 1n) {
			const cur = factorialRationalStable({ num: n, den: 1n })
			assert.equal(cur.den, 1n)
			// Recurrence check: n! === n * (n - 1)!
			assert.equal(cur.num, n * prev.num)
			// Iterative product cross-check
			assert.equal(cur.num, iterativeFactorial(n))
			prev = cur
		}
	})

	test('rejects negative rationals', () => {
		assert.throws(() => factorialRationalStable({ num: -1n, den: 1n }), RangeError)
		assert.throws(() => factorialRationalStable({ num: 1n, den: -1n }), RangeError)
		assert.throws(() => factorialRationalStable({ num: -12n, den: 3n }), RangeError)
		assert.throws(() => factorialRationalStable({ num: 12n, den: -3n }), RangeError)
		assert.throws(() => factorialRationalStable({ num: -3n, den: 2n }), RangeError)
	})

	test('rejects non-integer rationals', () => {
		assert.throws(() => factorialRationalStable({ num: 1n, den: 2n }), RangeError)
		assert.throws(() => factorialRationalStable({ num: 7n, den: 3n }), RangeError)
		assert.throws(() => factorialRationalStable({ num: 10n, den: 4n }), RangeError)
		assert.throws(() => factorialRationalStable({ num: -7n, den: -2n }), RangeError)
	})

	test('rejects zero denominator', () => {
		assert.throws(() => factorialRationalStable({ num: 0n, den: 0n }), RangeError)
		assert.throws(() => factorialRationalStable({ num: 5n, den: 0n }), RangeError)
		assert.throws(() => factorialRationalStable({ num: -5n, den: 0n }), RangeError)
	})

	test('rejects invalid input types', () => {
		assert.throws(() => factorialRationalStable(null), TypeError)
		assert.throws(() => factorialRationalStable(undefined), TypeError)
		assert.throws(() => factorialRationalStable(5), TypeError)
		assert.throws(() => factorialRationalStable(5n), TypeError)
		assert.throws(() => factorialRationalStable('5'), TypeError)
		assert.throws(() => factorialRationalStable([5n, 1n]), TypeError)
		assert.throws(() => factorialRationalStable({}), TypeError)
		assert.throws(() => factorialRationalStable({ num: 5, den: 1n }), TypeError)
		assert.throws(() => factorialRationalStable({ num: 5n, den: 1 }), TypeError)
		assert.throws(() => factorialRationalStable({ num: 5n }), TypeError)
		assert.throws(() => factorialRationalStable({ den: 1n }), TypeError)
	})
})
