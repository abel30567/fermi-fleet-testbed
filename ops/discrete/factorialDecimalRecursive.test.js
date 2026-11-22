import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { factorialDecimalRecursive } from './factorialDecimalRecursive.js'

/**
 * Independent naive iterative BigInt factorial used for cross-checking.
 *
 * @param {bigint} n
 * @returns {bigint}
 */
function naiveIterativeFactorial(n) {
	let acc = 1n
	for (let i = 2n; i <= n; i += 1n) {
		acc *= i
	}
	return acc
}

/**
 * Computes the number of trailing zeros in n! using Legendre's formula.
 *
 * @param {number} n
 * @returns {number}
 */
function legendreTrailingZeros(n) {
	let count = 0
	for (let p = 5; p <= n; p *= 5) {
		count += Math.floor(n / p)
	}
	return count
}

describe('factorialDecimalRecursive', () => {
	describe('normal cases', () => {
		test('computes small and medium exact factorials', () => {
			assert.equal(factorialDecimalRecursive('0'), '1')
			assert.equal(factorialDecimalRecursive('1'), '1')
			assert.equal(factorialDecimalRecursive('2'), '2')
			assert.equal(factorialDecimalRecursive('3'), '6')
			assert.equal(factorialDecimalRecursive('5'), '120')
			assert.equal(factorialDecimalRecursive('10'), '3628800')
		})

		test('computes 20!, 50!, and 100! accurately beyond Number.MAX_SAFE_INTEGER', () => {
			assert.equal(factorialDecimalRecursive('20'), '2432902008176640000')
			assert.equal(
				factorialDecimalRecursive('50'),
				'30414093201713378043612608166064768844377641568960512000000000000',
			)
			assert.equal(
				factorialDecimalRecursive('100'),
				'93326215443944152681699238856266700490715968264381621468592963895217599993229915608941463976156518286253697920827223758251185210916864000000000000000000000000',
			)
		})

		test('accepts decimal integer strings with trailing zero fractional parts and whitespace', () => {
			assert.equal(factorialDecimalRecursive('0.0'), '1')
			assert.equal(factorialDecimalRecursive('0.0000'), '1')
			assert.equal(factorialDecimalRecursive('5.00'), '120')
			assert.equal(factorialDecimalRecursive('10.000'), '3628800')
			assert.equal(factorialDecimalRecursive('+6.00'), '720')
			assert.equal(factorialDecimalRecursive('0007.0'), '5040')
			assert.equal(factorialDecimalRecursive('  8.00  '), '40320')
		})

		test('honors configurable precision argument', () => {
			assert.equal(factorialDecimalRecursive('5', 0), '120')
			assert.equal(factorialDecimalRecursive('5', 1), '120.0')
			assert.equal(factorialDecimalRecursive('5', 2), '120.00')
			assert.equal(factorialDecimalRecursive('0', 4), '1.0000')
			assert.equal(factorialDecimalRecursive('10.000', 3), '3628800.000')
			assert.equal(
				factorialDecimalRecursive('20', 6),
				'2432902008176640000.000000',
			)
		})
	})

	describe('edge cases and large factorials', () => {
		test('computes very large factorials beyond Number.MAX_SAFE_INTEGER with exact digit counts and trailing zeros', () => {
			const fact21 = factorialDecimalRecursive('21')
			assert.equal(fact21, '51090942171709440000')
			assert.ok(BigInt(fact21) > BigInt(Number.MAX_SAFE_INTEGER))

			const fact1000 = factorialDecimalRecursive('1000')
			assert.equal(fact1000.length, 2568)
			assert.ok(fact1000.startsWith('40238726007709377354'))

			const trailingZerosMatch = fact1000.match(/0+$/)
			assert.ok(trailingZerosMatch)
			assert.equal(trailingZerosMatch[0].length, legendreTrailingZeros(1000))
		})

		test('verifies trailing zero counts via Legendre formula across multiple inputs', () => {
			for (const n of [5, 10, 24, 25, 50, 100, 125, 250, 500]) {
				const result = factorialDecimalRecursive(String(n))
				const zeros = result.match(/0+$/)?.[0].length ?? 0
				assert.equal(
					zeros,
					legendreTrailingZeros(n),
					`trailing zero count mismatch for ${n}!`,
				)
			}
		})

		test('handles "-0" and "-0.00" as zero without error', () => {
			assert.equal(factorialDecimalRecursive('-0'), '1')
			assert.equal(factorialDecimalRecursive('-0.00', 2), '1.00')
		})

		test('throws RangeError on negative numbers', () => {
			for (const bad of ['-1', '-5', '-10.00', '-100', '-0.5']) {
				assert.throws(
					() => factorialDecimalRecursive(bad),
					RangeError,
					`expected RangeError for negative input "${bad}"`,
				)
			}
		})

		test('throws RangeError on non-integer fractional decimal strings', () => {
			for (const bad of ['0.5', '2.5', '3.5', '10.0001', '99.9']) {
				assert.throws(
					() => factorialDecimalRecursive(bad),
					RangeError,
					`expected RangeError for non-integer input "${bad}"`,
				)
			}
		})

		test('throws TypeError on non-string n inputs', () => {
			for (const bad of [5, 5n, null, undefined, {}, [], true]) {
				assert.throws(
					() => factorialDecimalRecursive(bad),
					TypeError,
					`expected TypeError for non-string input ${String(bad)}`,
				)
			}
		})

		test('throws RangeError on malformed decimal strings', () => {
			for (const bad of [
				'',
				'   ',
				'abc',
				'1e3',
				'5.',
				'.5',
				'.0',
				'1,000',
				'1_000',
				'NaN',
				'Infinity',
				'1.2.3',
				'--5',
				'++5',
			]) {
				assert.throws(
					() => factorialDecimalRecursive(bad),
					RangeError,
					`expected RangeError for malformed string "${bad}"`,
				)
			}
		})

		test('throws on invalid precision values', () => {
			for (const bad of [-1, -10, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(
					() => factorialDecimalRecursive('5', bad),
					RangeError,
					`expected RangeError for precision=${String(bad)}`,
				)
			}

			for (const bad of ['2', null, 2n, {}, [], true]) {
				assert.throws(
					() => factorialDecimalRecursive('5', bad),
					TypeError,
					`expected TypeError for precision=${String(bad)}`,
				)
			}
		})
	})

	describe('independent cross-checks', () => {
		test('matches naive iterative BigInt loop for n = 0..100 and selected large values', () => {
			for (let n = 0; n <= 100; n += 1) {
				const actual = factorialDecimalRecursive(String(n))
				const expected = naiveIterativeFactorial(BigInt(n)).toString()
				assert.equal(actual, expected, `mismatch at n=${n}`)
			}

			for (const n of [200, 350, 500]) {
				const actual = factorialDecimalRecursive(`${n}.00`, 3)
				const expected = `${naiveIterativeFactorial(BigInt(n)).toString()}.000`
				assert.equal(actual, expected, `mismatch at n=${n}`)
			}
		})

		test('satisfies recurrence relation n! = n * (n - 1)! for n = 1..150', () => {
			let prev = BigInt(factorialDecimalRecursive('0'))
			for (let n = 1; n <= 150; n += 1) {
				const currStr = factorialDecimalRecursive(String(n))
				const curr = BigInt(currStr)
				assert.equal(curr, BigInt(n) * prev, `recurrence failed at n=${n}`)
				prev = curr
			}
		})
	})
})
