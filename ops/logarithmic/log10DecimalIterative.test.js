import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { log10DecimalIterative } from './log10DecimalIterative.js'

/**
 * Helper to add two decimal strings with exact arbitrary precision
 * (used for independent cross-checks of logarithmic identities).
 *
 * @param {string} a
 * @param {string} b
 * @param {number} decimals
 * @returns {string}
 */
function addDecimalStrings(a, b, decimals) {
	const toScaled = (s) => {
		const neg = s.startsWith('-')
		const body = neg ? s.slice(1) : s
		const [intPart, fracPart = ''] = body.split('.')
		const padded = fracPart.padEnd(decimals, '0').slice(0, decimals)
		const val = BigInt(intPart + padded)
		return neg ? -val : val
	}
	const sum = toScaled(a) + toScaled(b)
	const neg = sum < 0n
	const abs = neg ? -sum : sum
	if (abs === 0n) return '0'
	const padded = abs.toString().padStart(decimals + 1, '0')
	const intPart = padded.slice(0, padded.length - decimals)
	const fracPart = padded.slice(padded.length - decimals).replace(/0+$/, '')
	const sign = neg ? '-' : ''
	return fracPart.length > 0 ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`
}

describe('log10DecimalIterative', () => {
	describe('exact powers of 10', () => {
		test('computes exact integer logs for powers of 10', () => {
			assert.equal(log10DecimalIterative('1'), '0')
			assert.equal(log10DecimalIterative('10'), '1')
			assert.equal(log10DecimalIterative('1000'), '3')
			assert.equal(log10DecimalIterative('0.001'), '-3')
			assert.equal(log10DecimalIterative('0.1'), '-1')
			assert.equal(log10DecimalIterative('100000000000000000000'), '20')
		})

		test('supports formatting variations and scientific notation for powers of 10', () => {
			assert.equal(log10DecimalIterative('  +100.000  '), '2')
			assert.equal(log10DecimalIterative('.0001'), '-4')
			assert.equal(log10DecimalIterative('10.'), '1')
			assert.equal(log10DecimalIterative('1e500'), '500')
			assert.equal(log10DecimalIterative('1E-500'), '-500')
			assert.equal(log10DecimalIterative('0.001e+6'), '3')
		})
	})

	describe('irrational logarithms and high precision', () => {
		// Known 60-digit reference for log10(2):
		// 0.301029995663981195213738894724493026768189881462108541310427...
		const LOG10_2_50 = '0.30102999566398119521373889472449302676818988146211'
		const LOG10_2_40 = '0.3010299956639811952137388947244930267682'
		// Known 40-digit reference for log10(3):
		// 0.47712125471966243729502790325511530920012886419...
		const LOG10_3_40 = '0.4771212547196624372950279032551153092001'

		test('matches 40-digit and 50-digit references for log10(2)', () => {
			assert.equal(log10DecimalIterative('2'), '0.30102999566398119521')
			assert.equal(log10DecimalIterative('2', 40), LOG10_2_40)
			assert.equal(log10DecimalIterative('2', 50), LOG10_2_50)
		})

		test('matches 40-digit reference for log10(3)', () => {
			assert.equal(log10DecimalIterative('3', 40), LOG10_3_40)
		})

		test('handles negative results for non-power-of-10 values less than 1', () => {
			// log10(0.2) = -1 + log10(2) = -0.6989700043360188047862611052755069732318...
			assert.equal(
				log10DecimalIterative('0.2', 40),
				'-0.6989700043360188047862611052755069732318',
			)
			// log10(0.5) = -log10(2)
			assert.equal(log10DecimalIterative('0.5', 40), `-${LOG10_2_40}`)
		})

		test('respects precision = 0 and small precisions', () => {
			assert.equal(log10DecimalIterative('2', 0), '0')
			assert.equal(log10DecimalIterative('5', 0), '1')
			assert.equal(log10DecimalIterative('0.2', 0), '-1')
			assert.equal(log10DecimalIterative('2', 5), '0.30103')
		})
	})

	describe('edge cases and extreme magnitudes', () => {
		test('handles very large and very small numbers beyond IEEE-754 float range', () => {
			assert.equal(
				log10DecimalIterative('2e1000', 20),
				'1000.30102999566398119521',
			)
			assert.equal(
				log10DecimalIterative('2e-1000', 20),
				'-999.69897000433601880479',
			)
			assert.equal(
				log10DecimalIterative('1e100000000000000000000', 10),
				'100000000000000000000',
			)
		})

		test('handles values extremely close to 1 without producing -0', () => {
			assert.equal(log10DecimalIterative('0.999999999999999999999999999', 10), '0')
			assert.equal(log10DecimalIterative('1.000000000000000000000000001', 10), '0')
			// log10(1 + 1e-30) ≈ 1e-30 / ln(10) ≈ 4.34294481903251827651...e-31
			assert.equal(
				log10DecimalIterative('1.000000000000000000000000000001', 45),
				'0.000000000000000000000000000000434294481903252',
			)
		})

		test('handles values very close to 10 (rounding up across integer boundary)', () => {
			assert.equal(log10DecimalIterative('9.999999999999999999999999999', 10), '1')
		})

		test('throws RangeError for zero and negative values', () => {
			for (const invalid of ['0', '-0', '0.0000', '0e10', '-1', '-0.0001', '-1e-100']) {
				assert.throws(
					() => log10DecimalIterative(invalid),
					RangeError,
					`expected RangeError for "${invalid}"`,
				)
			}
		})

		test('throws TypeError or RangeError for malformed inputs', () => {
			for (const nonString of [null, undefined, 10, 10n, {}, []]) {
				assert.throws(() => log10DecimalIterative(nonString), TypeError)
			}
			for (const malformed of ['', '   ', '.', '+.', 'abc', 'NaN', 'Infinity', '1e', '1.2.3', '1_000']) {
				assert.throws(() => log10DecimalIterative(malformed), RangeError)
			}
		})

		test('throws TypeError or RangeError for invalid precision', () => {
			for (const nonNumber of ['20', null, 20n, {}]) {
				assert.throws(() => log10DecimalIterative('2', nonNumber), TypeError)
			}
			for (const badPrecision of [-1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => log10DecimalIterative('2', badPrecision), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		test('satisfies product rule log10(a * b) == log10(a) + log10(b) to 35+ digits', () => {
			const pairs = [
				['2', '3', '6'],
				['2', '5', '10'],
				['7', '13', '91'],
				['123.456', '789.125', '97422.216'],
				['0.0035', '42000', '147'],
			]
			const computePrecision = 45
			const checkDigits = 38

			for (const [a, b, product] of pairs) {
				const logA = log10DecimalIterative(a, computePrecision)
				const logB = log10DecimalIterative(b, computePrecision)
				const logProd = log10DecimalIterative(product, computePrecision)
				const sumLogs = addDecimalStrings(logA, logB, computePrecision)

				// Compare truncated to 38 decimal places (ignoring rounding in final digit of 45)
				assert.equal(
					logProd.slice(0, logProd.indexOf('.') === -1 ? logProd.length : logProd.indexOf('.') + 1 + checkDigits),
					sumLogs.slice(0, sumLogs.indexOf('.') === -1 ? sumLogs.length : sumLogs.indexOf('.') + 1 + checkDigits),
					`log10(${a} * ${b}) should equal log10(${a}) + log10(${b})`,
				)
			}
		})

		test('satisfies reciprocal rule log10(1/x) == -log10(x) and power rule log10(2^10) == 10 * log10(2)', () => {
			const log8 = log10DecimalIterative('8', 40)
			const logRecip8 = log10DecimalIterative('0.125', 40)
			assert.equal(logRecip8, `-${log8}`)

			const log2 = log10DecimalIterative('2', 45)
			const log1024 = log10DecimalIterative('1024', 45)
			// 10 * log10(2) shifts decimal point right by 1
			const shifted = `${log2.slice(2, 3)}.${log2.slice(3, 42)}`
			assert.equal(log1024.slice(0, shifted.length), shifted)
		})

		test('agrees with Math.log10 across diverse positive inputs', () => {
			const samples = ['0.00042', '0.3333333333', '1.5', '2.718281828459045', '3.141592653589793', '42', '987654321.123']
			for (const s of samples) {
				const expected = Math.log10(Number(s))
				const actual = Number(log10DecimalIterative(s, 20))
				assert.ok(
					Math.abs(actual - expected) <= 1e-14,
					`expected ${actual} to be within 1e-14 of Math.log10(${s}) = ${expected}`,
				)
			}
		})
	})
})
