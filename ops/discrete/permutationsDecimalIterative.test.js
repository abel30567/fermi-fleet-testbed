import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { permutationsDecimalIterative } from './permutationsDecimalIterative.js'

/**
 * Independent BigInt factorial helper used for cross-checking P(n, k) = n! / (n - k)!.
 *
 * @param {bigint} m
 * @returns {bigint}
 */
function factorialBigInt(m) {
	let acc = 1n
	for (let i = 2n; i <= m; i += 1n) {
		acc *= i
	}
	return acc
}

describe('permutationsDecimalIterative', () => {
	test('computes standard small and medium permutations', () => {
		assert.equal(permutationsDecimalIterative('5', '3'), '60')
		assert.equal(permutationsDecimalIterative('5', '1'), '5')
		assert.equal(permutationsDecimalIterative('6', '2'), '30')
		assert.equal(permutationsDecimalIterative('10', '4'), '5040')
		assert.equal(permutationsDecimalIterative('12', '5'), '95040')
	})

	test('handles boundary edge cases: k=0, k=n, n=0 k=0, and k>n', () => {
		assert.equal(permutationsDecimalIterative('0', '0'), '1')
		assert.equal(permutationsDecimalIterative('5', '0'), '1')
		assert.equal(permutationsDecimalIterative('999999999999999999999999', '0'), '1')
		assert.equal(permutationsDecimalIterative('1', '1'), '1')
		assert.equal(permutationsDecimalIterative('5', '5'), '120')
		assert.equal(permutationsDecimalIterative('10', '10'), '3628800')
		assert.equal(permutationsDecimalIterative('0', '1'), '0')
		assert.equal(permutationsDecimalIterative('5', '6'), '0')
		assert.equal(permutationsDecimalIterative('10', '100'), '0')
	})

	test('handles arbitrary-precision large n and large results', () => {
		// P(100, 30) = 100! / 70!
		const expected100_30 = (factorialBigInt(100n) / factorialBigInt(70n)).toString()
		assert.equal(permutationsDecimalIterative('100', '30'), expected100_30)
		assert.equal(
			permutationsDecimalIterative('100', '30'),
			'7791097137057804874587232499277321440358327700684800000000'
		)

		// Very large n with small k: avoids computing n! directly
		const hugeN = 10n ** 30n
		const expectedHuge = (hugeN * (hugeN - 1n) * (hugeN - 2n)).toString()
		assert.equal(
			permutationsDecimalIterative('1000000000000000000000000000000', '3'),
			expectedHuge
		)
	})

	test('accepts trailing decimal zeros, leading zeros, explicit plus sign, signed zero, and whitespace', () => {
		assert.equal(permutationsDecimalIterative('10.0', '3.00'), '720')
		assert.equal(permutationsDecimalIterative('0005.000', '003.0'), '60')
		assert.equal(permutationsDecimalIterative('+7.0', '+2.00'), '42')
		assert.equal(permutationsDecimalIterative('  6.00  ', '  2  '), '30')
		assert.equal(permutationsDecimalIterative('-0', '-0.00'), '1')
		assert.equal(permutationsDecimalIterative('5', '-0.0'), '1')
	})

	test('formats output according to configurable precision argument', () => {
		assert.equal(permutationsDecimalIterative('5', '3', 0), '60')
		assert.equal(permutationsDecimalIterative('5', '3', 2), '60.00')
		assert.equal(permutationsDecimalIterative('5', '3', 5), '60.00000')
		assert.equal(permutationsDecimalIterative('0', '0', 3), '1.000')
		assert.equal(permutationsDecimalIterative('3', '5', 4), '0.0000')
		assert.equal(permutationsDecimalIterative('10.0', '4.0', 1), '5040.0')
	})

	test('rejects invalid input types and malformed, negative, or fractional values', () => {
		// Non-string n or k
		for (const bad of [5, 5n, null, undefined, {}, [], true]) {
			assert.throws(() => permutationsDecimalIterative(bad, '2'), TypeError)
			assert.throws(() => permutationsDecimalIterative('5', bad), TypeError)
		}

		// Malformed strings
		for (const bad of ['', '   ', 'abc', '1e5', '10.', '.0', '1_000', 'NaN', 'Infinity', '--5', '+-5']) {
			assert.throws(() => permutationsDecimalIterative(bad, '2'), RangeError)
			assert.throws(() => permutationsDecimalIterative('5', bad), RangeError)
		}

		// Negative integers
		for (const bad of ['-1', '-5.0', '-100']) {
			assert.throws(() => permutationsDecimalIterative(bad, '2'), RangeError)
			assert.throws(() => permutationsDecimalIterative('5', bad), RangeError)
		}

		// Non-integer fractional strings
		for (const bad of ['3.5', '0.1', '10.0001', '-0.5']) {
			assert.throws(() => permutationsDecimalIterative(bad, '2'), RangeError)
			assert.throws(() => permutationsDecimalIterative('5', bad), RangeError)
		}

		// Invalid precision
		for (const bad of ['2', null, {}, true, 2n]) {
			assert.throws(() => permutationsDecimalIterative('5', '2', bad), TypeError)
		}
		for (const bad of [-1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => permutationsDecimalIterative('5', '2', bad), RangeError)
		}
	})

	test('independent cross-check against factorial identity P(n, k) = n! / (n - k)!', () => {
		const cases = [
			[0, 0],
			[1, 0],
			[1, 1],
			[7, 3],
			[15, 6],
			[25, 10],
			[50, 25],
			[80, 40],
			[100, 30],
			[100, 100],
		]

		for (const [n, k] of cases) {
			const expected = (factorialBigInt(BigInt(n)) / factorialBigInt(BigInt(n - k))).toString()
			assert.equal(
				permutationsDecimalIterative(String(n), String(k)),
				expected,
				`Mismatch for P(${n}, ${k})`
			)
		}
	})

	test('independent cross-check against recurrence relations P(n, k) = n * P(n - 1, k - 1) and multiplicative split', () => {
		for (let n = 1; n <= 20; n += 1) {
			for (let k = 1; k <= n; k += 1) {
				const lhs = BigInt(permutationsDecimalIterative(String(n), String(k)))
				const rhsRecurrence =
					BigInt(n) * BigInt(permutationsDecimalIterative(String(n - 1), String(k - 1)))
				assert.equal(lhs, rhsRecurrence, `Recurrence failed for P(${n}, ${k})`)

				const rhsStep =
					BigInt(n - k + 1) * BigInt(permutationsDecimalIterative(String(n), String(k - 1)))
				assert.equal(lhs, rhsStep, `Step recurrence failed for P(${n}, ${k})`)
			}
		}

		// Multiplicative identity: P(n, k) = P(n, m) * P(n - m, k - m)
		const p60_25 = BigInt(permutationsDecimalIterative('60', '25'))
		const p60_10 = BigInt(permutationsDecimalIterative('60', '10'))
		const p50_15 = BigInt(permutationsDecimalIterative('50', '15'))
		assert.equal(p60_25, p60_10 * p50_15)
	})
})
