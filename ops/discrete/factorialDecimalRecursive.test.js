import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { factorialDecimalRecursive } from './factorialDecimalRecursive.js'

/**
 * Independent iterative BigInt factorial oracle for cross-checking.
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
 * Independent Legendre's formula oracle for counting trailing zeros of n!.
 *
 * @param {number} n
 * @returns {number}
 */
function countTrailingZerosLegendre(n) {
	let count = 0
	for (let p = 5; p <= n; p *= 5) {
		count += Math.floor(n / p)
	}
	return count
}

describe('factorialDecimalRecursive', () => {
	it('computes base cases 0!, 1!, and 2!', () => {
		assert.equal(factorialDecimalRecursive('0'), '1')
		assert.equal(factorialDecimalRecursive('1'), '1')
		assert.equal(factorialDecimalRecursive('2'), '2')
	})

	it('computes small and medium factorials accurately', () => {
		assert.equal(factorialDecimalRecursive('3'), '6')
		assert.equal(factorialDecimalRecursive('4'), '24')
		assert.equal(factorialDecimalRecursive('5'), '120')
		assert.equal(factorialDecimalRecursive('6'), '720')
		assert.equal(factorialDecimalRecursive('10'), '3628800')
		assert.equal(factorialDecimalRecursive('12'), '479001600')
		assert.equal(factorialDecimalRecursive('20'), '2432902008176640000')
	})

	it('accepts equivalent integer decimal string formats', () => {
		assert.equal(factorialDecimalRecursive('5.0'), '120')
		assert.equal(factorialDecimalRecursive('5.000'), '120')
		assert.equal(factorialDecimalRecursive('5.'), '120')
		assert.equal(factorialDecimalRecursive('0005.00'), '120')
		assert.equal(factorialDecimalRecursive('+5'), '120')
		assert.equal(factorialDecimalRecursive('+5.00'), '120')
		assert.equal(factorialDecimalRecursive('  6.000  '), '720')
		assert.equal(factorialDecimalRecursive('\t7\n'), '5040')
		assert.equal(factorialDecimalRecursive('0.000'), '1')
		assert.equal(factorialDecimalRecursive('.0'), '1')
		assert.equal(factorialDecimalRecursive('.000'), '1')
		assert.equal(factorialDecimalRecursive('+0'), '1')
		assert.equal(factorialDecimalRecursive('-0'), '1')
		assert.equal(factorialDecimalRecursive('-0.00'), '1')
	})

	it('formats output according to the precision argument', () => {
		assert.equal(factorialDecimalRecursive('0', 0), '1')
		assert.equal(factorialDecimalRecursive('0', 3), '1.000')
		assert.equal(factorialDecimalRecursive('5', undefined), '120')
		assert.equal(factorialDecimalRecursive('5', 0), '120')
		assert.equal(factorialDecimalRecursive('5', 1), '120.0')
		assert.equal(factorialDecimalRecursive('5', 4), '120.0000')
		assert.equal(factorialDecimalRecursive('10.00', 2), '3628800.00')
		assert.equal(factorialDecimalRecursive('25', 6), '15511210043330985984000000.000000')
	})

	it('computes large arbitrary-precision factorials accurately without stack overflow', () => {
		assert.equal(
			factorialDecimalRecursive('50'),
			'30414093201713378043612608166064768844377641568960512000000000000'
		)
		assert.equal(
			factorialDecimalRecursive('100'),
			'93326215443944152681699238856266700490715968264381621468592963895217599993229915608941463976156518286253697920827223758251185210916864000000000000000000000000'
		)

		const f1000 = factorialDecimalRecursive('1000')
		assert.equal(f1000.length, 2568)
		assert.equal(f1000, iterativeFactorial(1000n).toString())

		const f5000 = factorialDecimalRecursive('5000')
		assert.equal(f5000.length, 16326)
	})

	it('satisfies independent recurrence relation n! / (n-1)! === n', () => {
		let prev = BigInt(factorialDecimalRecursive('0'))
		for (let n = 1; n <= 60; n += 1) {
			const curr = BigInt(factorialDecimalRecursive(String(n)))
			assert.equal(curr % prev, 0n)
			assert.equal(curr / prev, BigInt(n))
			prev = curr
		}

		for (const large of [100, 250, 500]) {
			const curr = BigInt(factorialDecimalRecursive(String(large)))
			const prior = BigInt(factorialDecimalRecursive(String(large - 1)))
			assert.equal(curr % prior, 0n)
			assert.equal(curr / prior, BigInt(large))
		}
	})

	it('matches independent iterative BigInt oracle and Legendre trailing-zero count', () => {
		for (let n = 0; n <= 120; n += 1) {
			assert.equal(
				factorialDecimalRecursive(String(n)),
				iterativeFactorial(BigInt(n)).toString()
			)
		}

		for (const n of [25, 100, 300, 1000]) {
			const str = factorialDecimalRecursive(String(n))
			const trailingZeros = str.length - str.replace(/0+$/, '').length
			assert.equal(trailingZeros, countTrailingZerosLegendre(n))
		}
	})

	it('rejects negative numbers and non-integer decimal strings', () => {
		for (const invalid of ['-1', '-5', '-5.00', '-100', '-0.5', '-2.5', '0.5', '2.5', '5.0001', '.1']) {
			assert.throws(() => factorialDecimalRecursive(invalid), RangeError)
		}
	})

	it('rejects malformed strings and non-string inputs for n', () => {
		for (const malformed of ['', '   ', 'abc', '1.2.3', '.', '+', '-', 'NaN', 'Infinity', '-Infinity', '1e3', '1_000', '5 0']) {
			assert.throws(() => factorialDecimalRecursive(malformed), RangeError)
		}

		for (const nonString of [5, 5n, null, undefined, {}, [], true, NaN]) {
			assert.throws(() => factorialDecimalRecursive(nonString), TypeError)
		}
	})

	it('validates the precision argument', () => {
		for (const badRange of [-1, -10, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => factorialDecimalRecursive('5', badRange), RangeError)
		}

		for (const badType of ['2', null, 2n, {}, [], true]) {
			assert.throws(() => factorialDecimalRecursive('5', badType), TypeError)
		}
	})
})
