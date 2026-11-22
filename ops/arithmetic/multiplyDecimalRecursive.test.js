import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { multiplyDecimalRecursive } from './multiplyDecimalRecursive.js'

describe('multiplyDecimalRecursive', () => {
	test('multiplies normal integers and decimals', () => {
		assert.equal(multiplyDecimalRecursive('2', '3'), '6')
		assert.equal(multiplyDecimalRecursive('12', '34'), '408')
		assert.equal(multiplyDecimalRecursive('0.1', '0.2'), '0.02')
		assert.equal(multiplyDecimalRecursive('1.5', '2.5'), '3.75')
		assert.equal(multiplyDecimalRecursive('123.45', '67.89'), '8381.0205')
		assert.equal(multiplyDecimalRecursive('1.5', '2.0'), '3')
		assert.equal(multiplyDecimalRecursive('12.5', '0.08'), '1')
	})

	test('handles signs accurately', () => {
		assert.equal(multiplyDecimalRecursive('-3.5', '2'), '-7')
		assert.equal(multiplyDecimalRecursive('3.5', '-2'), '-7')
		assert.equal(multiplyDecimalRecursive('-3.5', '-2'), '7')
		assert.equal(multiplyDecimalRecursive('+3.5', '+2.5'), '8.75')
		assert.equal(multiplyDecimalRecursive('+3.5', '-2.5'), '-8.75')
	})

	test('handles zeros without producing negative zero', () => {
		assert.equal(multiplyDecimalRecursive('0', '0'), '0')
		assert.equal(multiplyDecimalRecursive('0', '12345.6789'), '0')
		assert.equal(multiplyDecimalRecursive('-12345.6789', '0'), '0')
		assert.equal(multiplyDecimalRecursive('-0', '42.5'), '0')
		assert.equal(multiplyDecimalRecursive('-0.000', '-0.000'), '0')
		assert.equal(multiplyDecimalRecursive('+0.0', '999999999999999999999999999'), '0')
	})

	test('handles edge-case decimal formats and leading/trailing zeros', () => {
		assert.equal(multiplyDecimalRecursive('.5', '.5'), '0.25')
		assert.equal(multiplyDecimalRecursive('5.', '2.'), '10')
		assert.equal(multiplyDecimalRecursive('-.25', '+4.'), '-1')
		assert.equal(multiplyDecimalRecursive('00012.3400', '000.5000'), '6.17')
		assert.equal(multiplyDecimalRecursive('  1.25  ', '  4  '), '5')
		assert.equal(multiplyDecimalRecursive('0.', '.0'), '0')
	})

	test('rounds accurately to configurable precision (round half away from zero)', () => {
		// Default precision = 20
		assert.equal(
			multiplyDecimalRecursive('0.000000000000001', '0.0000005'),
			'0',
		)
		assert.equal(
			multiplyDecimalRecursive('0.00000000000001', '0.0000005'),
			'0.00000000000000000001',
		)

		// Explicit precision rounding
		assert.equal(multiplyDecimalRecursive('1.23456', '1', 2), '1.23')
		assert.equal(multiplyDecimalRecursive('1.235', '1', 2), '1.24')
		assert.equal(multiplyDecimalRecursive('1.2349999', '1', 2), '1.23')
		assert.equal(multiplyDecimalRecursive('-1.235', '1', 2), '-1.24')
		assert.equal(multiplyDecimalRecursive('-1.234', '1', 2), '-1.23')

		// Carry propagation through multiple 9s
		assert.equal(multiplyDecimalRecursive('9.9999', '1', 2), '10')
		assert.equal(multiplyDecimalRecursive('-99.995', '1', 2), '-100')

		// Precision = 0 (round to integer)
		assert.equal(multiplyDecimalRecursive('1.5', '1', 0), '2')
		assert.equal(multiplyDecimalRecursive('-1.5', '1', 0), '-2')
		assert.equal(multiplyDecimalRecursive('1.49999999', '1', 0), '1')
		assert.equal(multiplyDecimalRecursive('0.4', '1', 0), '0')

		// Negative tiny product rounding to zero must normalize to "0"
		assert.equal(multiplyDecimalRecursive('-0.0001', '0.0001', 4), '0')
		assert.equal(multiplyDecimalRecursive('-0.005', '1', 2), '-0.01')
	})

	test('computes high-precision (>40 digits) products accurately', () => {
		const pi50 = '3.14159265358979323846264338327950288419716939937510'
		const e50 = '2.71828182845904523536028747135266249775724709369995'

		// Exact 100-digit scale result cross-checked via BigInt
		const piBig = BigInt(pi50.replace('.', ''))
		const eBig = BigInt(e50.replace('.', ''))
		const exactStr = (piBig * eBig).toString().padStart(101, '0')
		const expectedFull = `${exactStr.slice(0, exactStr.length - 100)}.${exactStr.slice(exactStr.length - 100).replace(/0+$/, '')}`

		assert.equal(multiplyDecimalRecursive(pi50, e50, 100), expectedFull)
		// Rounded to 50 and 49 fractional digits
		assert.equal(
			multiplyDecimalRecursive(pi50, e50, 50),
			'8.53973422267356706546355086954657449503488853576507',
		)
		assert.equal(
			multiplyDecimalRecursive(pi50, e50, 49),
			'8.5397342226735670654635508695465744950348885357651',
		)

		// >40-digit integers (deep Karatsuba recursion)
		const bigA = '98765432109876543210987654321098765432109876543210'
		const bigB = '12345678901234567890123456789012345678901234567890'
		assert.equal(
			multiplyDecimalRecursive(bigA, bigB, 0),
			(BigInt(bigA) * BigInt(bigB)).toString(),
		)

		// Highly asymmetric lengths (>50 digits * 3 digits)
		const asymA = '1234567890123456789012345678901234567890123456789012345'
		const asymB = '987'
		assert.equal(
			multiplyDecimalRecursive(asymA, asymB, 0),
			(BigInt(asymA) * BigInt(asymB)).toString(),
		)
	})

	test('cross-checks many large and fractional operands against native BigInt multiplication', () => {
		const cases = [
			['123456789012345678901234567890123456789012345', '987654321098765432109876543210987654321098765'],
			['-99999999999999999999999999999999999999999999', '99999999999999999999999999999999999999999999'],
			['1000000000000000000000000000000000000000000001', '1000000000000000000000000000000000000000000001'],
			['-4829104829104829104829104829104829104829104829104829', '-77777777777777777777777777777777777777777777777777'],
			['3141592653589793238462643383279502884197169399375105820974944', '2718281828459045235360287471352662497757247093699959574966967'],
		]

		for (const [a, b] of cases) {
			const expected = (BigInt(a) * BigInt(b)).toString()
			assert.equal(multiplyDecimalRecursive(a, b, 0), expected)
		}

		// Fractional cross-check: shift by 10^25 each -> total scale 50
		const fa = '1234567890123456789012345.6789012345678901234567891'
		const fb = '-9876543210987654321098765.4321098765432109876543219'
		const rawProduct = BigInt(fa.replace('.', '')) * BigInt(fb.replace('.', ''))
		const neg = rawProduct < 0n
		const absStr = (neg ? -rawProduct : rawProduct).toString().padStart(51, '0')
		const intPart = absStr.slice(0, absStr.length - 50)
		const fracPart = absStr.slice(absStr.length - 50).replace(/0+$/, '')
		const expectedFrac = `${neg ? '-' : ''}${intPart}${fracPart ? '.' + fracPart : ''}`

		assert.equal(multiplyDecimalRecursive(fa, fb, 50), expectedFrac)
	})

	test('rejects invalid operand types and malformed decimal strings', () => {
		const nonStrings = [123, null, undefined, {}, [], true, 10n]
		for (const bad of nonStrings) {
			assert.throws(() => multiplyDecimalRecursive(bad, '1'), TypeError)
			assert.throws(() => multiplyDecimalRecursive('1', bad), TypeError)
		}

		const malformed = [
			'',
			'   ',
			'.',
			'+',
			'-',
			'+.',
			'-.',
			'1.2.3',
			'abc',
			'12a',
			'NaN',
			'Infinity',
			'-Infinity',
			'1e5',
			'1_000',
			'--1',
			'++1',
			'+-1',
			'1 2',
		]
		for (const bad of malformed) {
			assert.throws(() => multiplyDecimalRecursive(bad, '1'), RangeError)
			assert.throws(() => multiplyDecimalRecursive('1', bad), RangeError)
		}
	})

	test('rejects invalid precision arguments', () => {
		for (const badType of ['20', null, {}, [], true, 20n]) {
			assert.throws(() => multiplyDecimalRecursive('1', '2', badType), TypeError)
		}
		for (const badRange of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => multiplyDecimalRecursive('1', '2', badRange), RangeError)
		}
	})
})
