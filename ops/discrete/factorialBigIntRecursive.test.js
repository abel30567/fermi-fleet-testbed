import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { factorialBigIntRecursive } from './factorialBigIntRecursive.js'

/**
 * Independent iterative reference implementation of factorial.
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

/**
 * Computes the exponent of prime p in n! via Legendre's formula.
 *
 * @param {bigint} n
 * @param {bigint} p
 * @returns {bigint}
 */
function legendreValuation(n, p) {
	let count = 0n
	let power = p
	while (power <= n) {
		count += n / power
		power *= p
	}
	return count
}

describe('factorialBigIntRecursive', () => {
	it('computes edge and small base cases correctly', () => {
		assert.equal(factorialBigIntRecursive(0n), 1n)
		assert.equal(factorialBigIntRecursive(1n), 1n)
		assert.equal(factorialBigIntRecursive(2n), 2n)
		assert.equal(factorialBigIntRecursive(3n), 6n)
		assert.equal(factorialBigIntRecursive(4n), 24n)
		assert.equal(factorialBigIntRecursive(5n), 120n)
		assert.equal(factorialBigIntRecursive(6n), 720n)
	})

	it('matches known exact factorials including values beyond Number.MAX_SAFE_INTEGER', () => {
		assert.equal(factorialBigIntRecursive(10n), 3628800n)
		assert.equal(factorialBigIntRecursive(20n), 2432902008176640000n)
		assert.equal(factorialBigIntRecursive(21n), 51090942171709440000n)
		assert.equal(
			factorialBigIntRecursive(50n),
			30414093201713378043612608166064768844377641568960512000000000000n,
		)
	})

	it('handles large inputs without call stack overflow via O(log n) recursion depth', () => {
		const f1000 = factorialBigIntRecursive(1000n)
		const digits = f1000.toString()
		// 1000! has 2568 decimal digits, starts with 4023872600, and ends with 249 zeros.
		assert.equal(digits.length, 2568)
		assert.ok(digits.startsWith('4023872600'))
		assert.ok(digits.endsWith('0'.repeat(249)))
		assert.notEqual(digits[digits.length - 250], '0')
	})

	it('throws RangeError for negative BigInt inputs', () => {
		assert.throws(() => factorialBigIntRecursive(-1n), RangeError)
		assert.throws(() => factorialBigIntRecursive(-25n), RangeError)
		assert.throws(() => factorialBigIntRecursive(-1000000000000000000n), RangeError)
	})

	it('throws TypeError for non-BigInt inputs', () => {
		const invalidInputs = [
			0,
			5,
			-1,
			3.14,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
			'5',
			'0',
			null,
			undefined,
			true,
			false,
			{},
			[],
		]
		for (const input of invalidInputs) {
			assert.throws(() => factorialBigIntRecursive(input), TypeError)
		}
	})

	it('cross-checks against an independent iterative implementation for 0n..100n and 500n', () => {
		for (let n = 0n; n <= 100n; n += 1n) {
			assert.equal(factorialBigIntRecursive(n), iterativeFactorial(n))
		}
		assert.equal(factorialBigIntRecursive(500n), iterativeFactorial(500n))
	})

	it('satisfies the recurrence n! = n * (n - 1)! and Wilson theorem for primes', () => {
		for (let n = 1n; n <= 60n; n += 1n) {
			assert.equal(factorialBigIntRecursive(n), n * factorialBigIntRecursive(n - 1n))
		}
		assert.equal(factorialBigIntRecursive(250n), 250n * factorialBigIntRecursive(249n))

		// Wilson's theorem: for any prime p, (p - 1)! ≡ p - 1 (mod p).
		for (const p of [2n, 3n, 5n, 7n, 13n, 31n, 97n, 199n]) {
			assert.equal(factorialBigIntRecursive(p - 1n) % p, p - 1n)
		}
	})

	it('cross-checks prime-power valuations against Legendre formula', () => {
		for (const n of [100n, 250n, 1000n]) {
			const fact = factorialBigIntRecursive(n)
			for (const p of [2n, 5n, 7n]) {
				const expectedExp = legendreValuation(n, p)
				const pPow = p ** expectedExp
				assert.equal(fact % pPow, 0n)
				assert.notEqual(fact % (pPow * p), 0n)
			}
		}
	})
})
