import { describe, test } from 'node:test'
import assert from 'node:assert'
import { factorialBigIntRecursive } from './factorialBigIntRecursive.js'

/**
 * Independent iterative factorial implementation for cross-checking.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function iterativeFactorial(n) {
	let result = 1n
	for (let i = 2n; i <= n; i += 1n) {
		result *= i
	}
	return result
}

/**
 * Count trailing zeros of n! using Legendre's formula (v_5(n!)).
 *
 * @param {bigint} n
 * @returns {number}
 */
function expectedTrailingZeros(n) {
	let count = 0n
	let divisor = 5n
	while (divisor <= n) {
		count += n / divisor
		divisor *= 5n
	}
	return Number(count)
}

describe('factorialBigIntRecursive', () => {
	test('handles base cases 0n and 1n', () => {
		assert.strictEqual(factorialBigIntRecursive(0n), 1n)
		assert.strictEqual(factorialBigIntRecursive(1n), 1n)
	})

	test('computes small and medium exact factorials', () => {
		const known = [
			[2n, 2n],
			[3n, 6n],
			[4n, 24n],
			[5n, 120n],
			[6n, 720n],
			[7n, 5040n],
			[10n, 3628800n],
			[12n, 479001600n],
			[20n, 2432902008176640000n],
			[21n, 51090942171709440000n],
			[30n, 265252859812191058636308480000000n],
		]

		for (const [input, expected] of known) {
			assert.strictEqual(factorialBigIntRecursive(input), expected)
		}
	})

	test('computes large factorials accurately (100n, 500n, 1000n)', () => {
		const fact100 = factorialBigIntRecursive(100n)
		const expected100 =
			93326215443944152681699238856266700490715968264381621468592963895217599993229915608941463976156518286253697920827223758251185210916864000000000000000000000000n
		assert.strictEqual(fact100, expected100)

		for (const n of [100n, 500n, 1000n]) {
			const val = factorialBigIntRecursive(n)
			assert.strictEqual(typeof val, 'bigint')
			assert.strictEqual(val, iterativeFactorial(n))

			const str = val.toString()
			const trailingZeros = str.length - str.replace(/0+$/, '').length
			assert.strictEqual(trailingZeros, expectedTrailingZeros(n))
		}
	})

	test('satisfies recurrence relation n! = n * (n - 1)!', () => {
		for (const n of [1n, 2n, 7n, 25n, 100n, 500n]) {
			assert.strictEqual(
				factorialBigIntRecursive(n),
				n * factorialBigIntRecursive(n - 1n),
			)
		}
	})

	test('cross-checks against independent iterative product for 0n..60n and 250n', () => {
		for (let n = 0n; n <= 60n; n += 1n) {
			assert.strictEqual(factorialBigIntRecursive(n), iterativeFactorial(n))
		}
		assert.strictEqual(factorialBigIntRecursive(250n), iterativeFactorial(250n))
	})

	test('throws RangeError for negative BigInt inputs', () => {
		for (const neg of [-1n, -2n, -10n, -1000000000000000000n]) {
			assert.throws(() => factorialBigIntRecursive(neg), RangeError)
		}
	})

	test('throws TypeError for non-BigInt inputs', () => {
		const invalidInputs = [
			undefined,
			null,
			0,
			1,
			5,
			-1,
			1.5,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
			'5',
			'5n',
			'',
			true,
			false,
			{},
			[],
			[5n],
			Symbol('5'),
		]

		for (const bad of invalidInputs) {
			assert.throws(() => factorialBigIntRecursive(bad), TypeError)
		}

		assert.throws(() => factorialBigIntRecursive(), TypeError)
	})
})
