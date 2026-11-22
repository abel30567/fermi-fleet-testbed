import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { nthRootDecimalIterative } from './nthRootDecimalIterative.js'

/**
 * Independent helper: parses a decimal string into an exact rational `num / 10^scale`
 * (signed BigInt numerator, non-negative integer scale).
 */
function parseExactRational(str) {
	const trimmed = str.trim()
	const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(trimmed)
	assert.ok(match, `Failed to parse decimal string in test helper: ${str}`)
	const [, signStr, intPart = '', frac1 = '', frac2 = '', expStr] = match
	const frac = frac1 || frac2
	const sign = signStr === '-' ? -1n : 1n
	let num = BigInt(intPart + frac) * sign
	let exp = -frac.length + (expStr ? Number(expStr) : 0)

	if (exp >= 0) {
		return { num: num * (10n ** BigInt(exp)), scale: 0 }
	}
	return { num, scale: -exp }
}

/**
 * Independently verifies that `rootStr` is within 0.5 * 10^(-precision) of the true
 * real n-th root of `valueStr` by raising the lower and upper bounds to the n-th
 * power using exact BigInt arithmetic:
 *   (|root| - 0.5 * 10^-p)^n <= |value| <= (|root| + 0.5 * 10^-p)^n
 */
function assertRootWithinHalfUlp(valueStr, n, precision, rootStr) {
	const val = parseExactRational(valueStr)
	const root = parseExactRational(rootStr)

	if (val.num < 0n) {
		assert.equal(n % 2, 1, 'Odd root expected for negative input')
		assert.ok(root.num <= 0n, `Expected non-positive root for ${valueStr}, got ${rootStr}`)
	} else {
		assert.ok(root.num >= 0n, `Expected non-negative root for ${valueStr}, got ${rootStr}`)
	}

	const absValNum = val.num < 0n ? -val.num : val.num
	const absRootNum = root.num < 0n ? -root.num : root.num

	// Express |root| at scale `precision + 1` so 0.5 * 10^-precision is 5 units
	const targetScale = precision + 1
	assert.ok(
		root.scale <= precision,
		`Result "${rootStr}" has ${root.scale} fractional digits, exceeding precision ${precision}`,
	)

	const rootScaled = absRootNum * (10n ** BigInt(targetScale - root.scale))
	const lowScaled = rootScaled >= 5n ? rootScaled - 5n : 0n
	const highScaled = rootScaled + 5n

	// Compare lowScaled^n / 10^(n * targetScale) <= absValNum / 10^val.scale <= highScaled^n / 10^(n * targetScale)
	const bigN = BigInt(n)
	const powScale = n * targetScale
	const lowPow = lowScaled ** bigN
	const highPow = highScaled ** bigN

	let lhsLow = lowPow
	let lhsHigh = highPow
	let rhsVal = absValNum

	if (powScale >= val.scale) {
		rhsVal = absValNum * (10n ** BigInt(powScale - val.scale))
	} else {
		const factor = 10n ** BigInt(val.scale - powScale)
		lhsLow = lowPow * factor
		lhsHigh = highPow * factor
	}

	assert.ok(
		lhsLow <= rhsVal && rhsVal <= lhsHigh,
		`Cross-check failed for (${valueStr})^(1/${n}) at precision ${precision}: got ${rootStr}`,
	)
}

describe('nthRootDecimalIterative', () => {
	describe('normal cases', () => {
		test('computes exact integer and decimal roots for 2nd, 3rd, 5th, and 10th roots', () => {
			assert.equal(nthRootDecimalIterative('4', 2), '2')
			assert.equal(nthRootDecimalIterative('9', 2), '3')
			assert.equal(nthRootDecimalIterative('0.25', 2), '0.5')
			assert.equal(nthRootDecimalIterative('27', 3), '3')
			assert.equal(nthRootDecimalIterative('0.008', 3), '0.2')
			assert.equal(nthRootDecimalIterative('32', 5), '2')
			assert.equal(nthRootDecimalIterative('243', 5), '3')
			assert.equal(nthRootDecimalIterative('0.00032', 5), '0.2')
			assert.equal(nthRootDecimalIterative('1024', 10), '2')
			assert.equal(nthRootDecimalIterative('59049', 10), '3')
			assert.equal(nthRootDecimalIterative('0.0000000001', 10), '0.1')
		})

		test('uses default precision of 20 decimal places', () => {
			// sqrt(2) = 1.4142135623730950488016887... -> rounded to 20 dp = ...4880 -> stripped to ...488
			assert.equal(nthRootDecimalIterative('2', 2), '1.4142135623730950488')
			// cbrt(2) = 1.2599210498948731647672106... -> rounded to 20 dp = ...6477
			assert.equal(nthRootDecimalIterative('2', 3), '1.25992104989487316477')
		})

		test('computes high-precision roots (35+ to 50 digits)', () => {
			// sqrt(2) to 50 decimal places:
			// 1.41421356237309504880168872420969807856967187537694807...
			assert.equal(
				nthRootDecimalIterative('2', 2, 50),
				'1.41421356237309504880168872420969807856967187537695',
			)

			// cbrt(2) to 40 decimal places:
			// 1.2599210498948731647672106072782283505702514647...
			assert.equal(
				nthRootDecimalIterative('2', 3, 40),
				'1.2599210498948731647672106072782283505703',
			)

			// 5th root of 2 to 40 decimal places:
			// 1.148698354997035006798626946777927589443850889...
			assert.equal(
				nthRootDecimalIterative('2', 5, 40),
				'1.1486983549970350067986269467779275894439',
			)

			// 10th root of 2 to 40 decimal places:
			// 1.071773462536293164213006325023342022906384604...
			assert.equal(
				nthRootDecimalIterative('2', 10, 40),
				'1.0717734625362931642130063250233420229064',
			)
		})

		test('supports scientific notation, optional plus sign, leading/trailing dots, and whitespace', () => {
			assert.equal(nthRootDecimalIterative('1e-6', 3), '0.01')
			assert.equal(nthRootDecimalIterative('1E10', 10), '10')
			assert.equal(nthRootDecimalIterative('+16', 2), '4')
			assert.equal(nthRootDecimalIterative('.25', 2), '0.5')
			assert.equal(nthRootDecimalIterative('16.', 2), '4')
			assert.equal(nthRootDecimalIterative('  81  ', 4), '3')
		})

		test('handles very large arbitrary-precision inputs', () => {
			// (10^30)^3 = 10^90
			const huge = '1' + '0'.repeat(90)
			assert.equal(nthRootDecimalIterative(huge, 3, 10), '1' + '0'.repeat(30))
		})
	})

	describe('edge cases', () => {
		test('handles zero and signed zero', () => {
			assert.equal(nthRootDecimalIterative('0', 2), '0')
			assert.equal(nthRootDecimalIterative('0', 3), '0')
			assert.equal(nthRootDecimalIterative('0', 1), '0')
			assert.equal(nthRootDecimalIterative('-0', 2), '0')
			assert.equal(nthRootDecimalIterative('-0.000', 4), '0')
			assert.equal(nthRootDecimalIterative('0.0000', 5, 35), '0')
		})

		test('handles 1 and -1', () => {
			assert.equal(nthRootDecimalIterative('1', 1), '1')
			assert.equal(nthRootDecimalIterative('1', 2), '1')
			assert.equal(nthRootDecimalIterative('1', 10, 40), '1')
			assert.equal(nthRootDecimalIterative('1.0000', 5), '1')
			assert.equal(nthRootDecimalIterative('-1', 1), '-1')
			assert.equal(nthRootDecimalIterative('-1', 3), '-1')
			assert.equal(nthRootDecimalIterative('-1', 9, 30), '-1')
			assert.throws(() => nthRootDecimalIterative('-1', 2), RangeError)
		})

		test('handles n = 1 with rounding and formatting', () => {
			assert.equal(nthRootDecimalIterative('123.456', 1, 10), '123.456')
			assert.equal(nthRootDecimalIterative('123.45600', 1, 10), '123.456')
			assert.equal(nthRootDecimalIterative('1.2345', 1, 3), '1.235')
			assert.equal(nthRootDecimalIterative('-1.2345', 1, 3), '-1.235')
			assert.equal(nthRootDecimalIterative('0.5', 1, 0), '1')
			assert.equal(nthRootDecimalIterative('-0.0001', 1, 2), '0')
		})

		test('supports odd roots of negative values', () => {
			assert.equal(nthRootDecimalIterative('-8', 3), '-2')
			assert.equal(nthRootDecimalIterative('-27', 3), '-3')
			assert.equal(nthRootDecimalIterative('-32', 5), '-2')
			assert.equal(nthRootDecimalIterative('-0.000125', 3), '-0.05')
			assert.equal(nthRootDecimalIterative('-2', 3, 20), '-1.25992104989487316477')
			// Tiny negative value that rounds to 0 must not return "-0"
			assert.equal(nthRootDecimalIterative('-0.000000001', 3, 2), '0')
		})

		test('rejects even roots of negative values', () => {
			assert.throws(() => nthRootDecimalIterative('-4', 2), RangeError)
			assert.throws(() => nthRootDecimalIterative('-16', 4), RangeError)
			assert.throws(() => nthRootDecimalIterative('-0.0001', 10), RangeError)
		})

		test('handles precision = 0 and rounding carry propagation', () => {
			assert.equal(nthRootDecimalIterative('2', 2, 0), '1')
			assert.equal(nthRootDecimalIterative('3', 2, 0), '2')
			// Exact midpoint: sqrt(0.25) = 0.5 -> rounds half-away-from-zero to 1
			assert.equal(nthRootDecimalIterative('0.25', 2, 0), '1')
			// Exact midpoint negative: cbrt(-0.000125) = -0.05 -> at precision 1 rounds to -0.1
			assert.equal(nthRootDecimalIterative('-0.000125', 3, 1), '-0.1')
			// Carry propagation across all 9s: sqrt(0.999999) ~= 0.9999995 -> at precision 2 rounds to 1
			assert.equal(nthRootDecimalIterative('0.999999', 2, 2), '1')
		})

		test('rejects invalid inputs with appropriate error types', () => {
			// Invalid value type
			assert.throws(() => nthRootDecimalIterative(4, 2), TypeError)
			assert.throws(() => nthRootDecimalIterative(null, 2), TypeError)
			assert.throws(() => nthRootDecimalIterative(undefined, 2), TypeError)
			assert.throws(() => nthRootDecimalIterative(4n, 2), TypeError)

			// Invalid decimal strings
			assert.throws(() => nthRootDecimalIterative('', 2), RangeError)
			assert.throws(() => nthRootDecimalIterative('   ', 2), RangeError)
			assert.throws(() => nthRootDecimalIterative('abc', 2), RangeError)
			assert.throws(() => nthRootDecimalIterative('NaN', 2), RangeError)
			assert.throws(() => nthRootDecimalIterative('Infinity', 2), RangeError)
			assert.throws(() => nthRootDecimalIterative('-Infinity', 2), RangeError)
			assert.throws(() => nthRootDecimalIterative('1.2.3', 2), RangeError)
			assert.throws(() => nthRootDecimalIterative('.', 2), RangeError)
			assert.throws(() => nthRootDecimalIterative('1e', 2), RangeError)

			// Invalid n
			assert.throws(() => nthRootDecimalIterative('4', '2'), TypeError)
			assert.throws(() => nthRootDecimalIterative('4', null), TypeError)
			assert.throws(() => nthRootDecimalIterative('4', 2n), TypeError)
			assert.throws(() => nthRootDecimalIterative('4', 0), RangeError)
			assert.throws(() => nthRootDecimalIterative('4', -2), RangeError)
			assert.throws(() => nthRootDecimalIterative('4', -3), RangeError)
			assert.throws(() => nthRootDecimalIterative('4', 2.5), RangeError)
			assert.throws(() => nthRootDecimalIterative('4', Number.NaN), RangeError)
			assert.throws(() => nthRootDecimalIterative('4', Number.POSITIVE_INFINITY), RangeError)

			// Invalid precision
			assert.throws(() => nthRootDecimalIterative('4', 2, '20'), TypeError)
			assert.throws(() => nthRootDecimalIterative('4', 2, null), TypeError)
			assert.throws(() => nthRootDecimalIterative('4', 2, -1), RangeError)
			assert.throws(() => nthRootDecimalIterative('4', 2, 1.5), RangeError)
			assert.throws(() => nthRootDecimalIterative('4', 2, Number.NaN), RangeError)
			assert.throws(() => nthRootDecimalIterative('4', 2, Number.POSITIVE_INFINITY), RangeError)
		})
	})

	describe('independent BigInt power cross-checks', () => {
		test('raising computed roots to the n-th power brackets the input within 0.5 ulp', () => {
			const cases = [
				['2', 2, 20],
				['2', 2, 45],
				['3', 2, 35],
				['7', 3, 40],
				['-7', 3, 40],
				['10', 5, 38],
				['-123.456789', 5, 35],
				['98765432109876543210.123456789', 7, 36],
				['2', 10, 40],
				['0.0000123456789', 4, 40],
				['-0.0000123456789', 5, 40],
				['3.141592653589793238462643383279', 3, 42],
				['1e-25', 5, 35],
				['1e30', 6, 30],
			]

			for (const [value, n, precision] of cases) {
				const root = nthRootDecimalIterative(value, n, precision)
				assertRootWithinHalfUlp(value, n, precision, root)
			}
		})
	})
})
