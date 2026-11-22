import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { divideDecimalRecursive } from './divideDecimalRecursive.js'

/**
 * Independent reference implementation using BigInt scaled `/` operator
 * for cross-checking divideDecimalRecursive.
 */
function referenceBigIntDivide(a, b, precision = 20) {
	const parse = (s) => {
		const neg = s.startsWith('-')
		const clean = s.replace(/^[+-]/, '')
		const [i, f = ''] = clean.split('.')
		const value = BigInt((i + f).replace(/^0+/, '') || '0')
		return { neg: value === 0n ? false : neg, value, scale: f.length }
	}
	const num = parse(a)
	const den = parse(b)
	if (num.value === 0n) return '0'
	const exp = precision + den.scale - num.scale
	const q =
		exp >= 0
			? (num.value * (10n ** BigInt(exp))) / den.value
			: num.value / (den.value * (10n ** BigInt(-exp)))
	if (q === 0n) return '0'
	const sign = num.neg !== den.neg ? '-' : ''
	const digits = q.toString()
	if (precision === 0) return sign + digits
	const padded = digits.padStart(precision + 1, '0')
	const intPart = padded.slice(0, padded.length - precision)
	const fracPart = padded.slice(padded.length - precision).replace(/0+$/, '')
	return fracPart ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`
}

/**
 * Parse a normalized decimal string into an exact rational { num, scale }
 * such that value = num / 10^scale.
 */
function toScaledBigInt(s) {
	const neg = s.startsWith('-')
	const clean = s.replace(/^[+-]/, '')
	const [i, f = ''] = clean.split('.')
	const mag = BigInt((i + f).replace(/^0+/, '') || '0')
	return { num: neg ? -mag : mag, scale: f.length }
}

describe('divideDecimalRecursive', () => {
	test('handles normal integer and terminating decimal divisions', () => {
		assert.equal(divideDecimalRecursive('10', '2'), '5')
		assert.equal(divideDecimalRecursive('1', '2'), '0.5')
		assert.equal(divideDecimalRecursive('1', '4'), '0.25')
		assert.equal(divideDecimalRecursive('1', '8'), '0.125')
		assert.equal(divideDecimalRecursive('7', '2'), '3.5')
		assert.equal(divideDecimalRecursive('1.5', '0.25'), '6')
		assert.equal(divideDecimalRecursive('0.75', '0.5'), '1.5')
		assert.equal(divideDecimalRecursive('123.456', '100'), '1.23456')
		assert.equal(divideDecimalRecursive('1000', '8'), '125')
	})

	test('uses default precision of 20 digits', () => {
		assert.equal(divideDecimalRecursive('1', '3'), '0.' + '3'.repeat(20))
		assert.equal(divideDecimalRecursive('2', '3'), '0.' + '6'.repeat(20))
	})

	test('computes repeating decimals accurately at high precision (40+ digits)', () => {
		assert.equal(divideDecimalRecursive('1', '3', 45), '0.' + '3'.repeat(45))
		assert.equal(divideDecimalRecursive('2', '3', 45), '0.' + '6'.repeat(45))
		assert.equal(divideDecimalRecursive('1', '7', 42), '0.' + '142857'.repeat(7))
		assert.equal(divideDecimalRecursive('22', '7', 48), '3.' + '142857'.repeat(8))
		assert.equal(divideDecimalRecursive('1', '9', 50), '0.' + '1'.repeat(50))
		assert.equal(divideDecimalRecursive('1', '11', 44), '0.' + '09'.repeat(22))
		assert.equal(divideDecimalRecursive('1', '6', 45), '0.1' + '6'.repeat(44))
	})

	test('handles signs and zero normalization correctly', () => {
		assert.equal(divideDecimalRecursive('-10', '2'), '-5')
		assert.equal(divideDecimalRecursive('10', '-2'), '-5')
		assert.equal(divideDecimalRecursive('-10', '-2'), '5')
		assert.equal(divideDecimalRecursive('+10', '+4'), '2.5')
		assert.equal(divideDecimalRecursive('+10', '-4'), '-2.5')
		assert.equal(divideDecimalRecursive('-1', '3', 10), '-0.3333333333')
		assert.equal(divideDecimalRecursive('0', '5'), '0')
		assert.equal(divideDecimalRecursive('-0', '5'), '0')
		assert.equal(divideDecimalRecursive('0', '-5'), '0')
		assert.equal(divideDecimalRecursive('-0.000', '-0.001'), '0')
		// Negative tiny quotient truncated to zero must normalize to "0", never "-0"
		assert.equal(divideDecimalRecursive('-0.001', '1', 2), '0')
		assert.equal(divideDecimalRecursive('-1', '1000', 2), '0')
	})

	test('throws RangeError on division by zero', () => {
		assert.throws(() => divideDecimalRecursive('1', '0'), { name: 'RangeError', message: /zero/i })
		assert.throws(() => divideDecimalRecursive('1', '-0'), { name: 'RangeError', message: /zero/i })
		assert.throws(() => divideDecimalRecursive('1', '+0.000'), { name: 'RangeError', message: /zero/i })
		assert.throws(() => divideDecimalRecursive('0', '0'), { name: 'RangeError', message: /zero/i })
		assert.throws(() => divideDecimalRecursive('-0.0', '.00'), { name: 'RangeError', message: /zero/i })
	})

	test('handles edge cases: formatting variants, precision 0, powers of 2, and huge/tiny numbers', () => {
		// Leading/trailing zeros and shorthand decimal notation
		assert.equal(divideDecimalRecursive('00012.3400', '00.0200'), '617')
		assert.equal(divideDecimalRecursive('.5', '.25'), '2')
		assert.equal(divideDecimalRecursive('5.', '2.'), '2.5')
		assert.equal(divideDecimalRecursive('-.5', '2.'), '-0.25')

		// Precision 0 (integer truncation toward zero)
		assert.equal(divideDecimalRecursive('7', '2', 0), '3')
		assert.equal(divideDecimalRecursive('-7', '2', 0), '-3')
		assert.equal(divideDecimalRecursive('2', '7', 0), '0')
		assert.equal(divideDecimalRecursive('100', '3', 0), '33')

		// Divisor = 1, power of 2, 2^k - 1, 2^k + 1 (reciprocal boundary cases)
		assert.equal(divideDecimalRecursive('12345.6789', '1', 10), '12345.6789')
		assert.equal(divideDecimalRecursive('1', '16', 10), '0.0625')
		assert.equal(divideDecimalRecursive('1', '31', 40), referenceBigIntDivide('1', '31', 40))
		assert.equal(divideDecimalRecursive('1', '33', 40), referenceBigIntDivide('1', '33', 40))

		// Very large and very small magnitudes
		const bigA = '9'.repeat(80)
		const bigB = '3'.repeat(40)
		assert.equal(divideDecimalRecursive(bigA, bigB, 30), referenceBigIntDivide(bigA, bigB, 30))

		const tinyA = '0.' + '0'.repeat(30) + '1'
		const tinyB = '0.' + '0'.repeat(35) + '4'
		assert.equal(divideDecimalRecursive(tinyA, tinyB, 10), '25000')
	})

	test('validates invalid operand types, malformed strings, and invalid precision', () => {
		// Non-string operands -> TypeError
		for (const bad of [123, 1n, null, undefined, {}, []]) {
			assert.throws(() => divideDecimalRecursive(bad, '1'), TypeError)
			assert.throws(() => divideDecimalRecursive('1', bad), TypeError)
		}

		// Malformed decimal strings -> RangeError
		const malformed = [
			'',
			'   ',
			'.',
			'+',
			'-',
			'+.',
			'-.',
			'abc',
			'1.2.3',
			'1e5',
			'1E-5',
			'NaN',
			'Infinity',
			' 12',
			'12 ',
			'1_000',
			'--1',
		]
		for (const bad of malformed) {
			assert.throws(() => divideDecimalRecursive(bad, '1'), RangeError)
			assert.throws(() => divideDecimalRecursive('1', bad), RangeError)
		}

		// Invalid precision types -> TypeError
		for (const badPrec of ['10', null, {}, true, 10n]) {
			assert.throws(() => divideDecimalRecursive('1', '2', badPrec), TypeError)
		}

		// Invalid precision values -> RangeError
		for (const badPrec of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => divideDecimalRecursive('1', '2', badPrec), RangeError)
		}
	})

	test('cross-checks against independent BigInt scaled division across diverse cases', () => {
		const cases = [
			['1', '7', 100],
			['22', '7', 100],
			['1', '97', 120],
			['355', '113', 80],
			['-98765432109876543210987654321.123456789', '1234567890123456789.987654321', 60],
			['0.00000000000000000012345', '7654321.0000009', 50],
			['1234567890123456789012345678901234567890', '99999999999999999999', 45],
			['1', '1048576', 30], // 2^20
			['1', '1048575', 50], // 2^20 - 1
			['1', '1048577', 50], // 2^20 + 1
			['-42.5', '-0.007', 35],
			['999.999', '1000', 0],
			['999.999', '1000', 1],
			['999.999', '1000', 3],
		]

		for (const [a, b, prec] of cases) {
			assert.equal(
				divideDecimalRecursive(a, b, prec),
				referenceBigIntDivide(a, b, prec),
				`Mismatch for ${a} / ${b} at precision ${prec}`
			)
		}
	})

	test('satisfies exact multiplicative invariant: quotient * divisor approximates dividend within 10^-precision', () => {
		const cases = [
			['1', '3', 40],
			['22', '7', 50],
			['355', '113', 60],
			['-123456789.012345', '0.000789123', 45],
			['0.0000123456789', '-987654321.12345', 50],
			['999999999999999999999999999999', '7777777777777777777', 40],
		]

		for (const [aStr, bStr, precision] of cases) {
			const qStr = divideDecimalRecursive(aStr, bStr, precision)
			const a = toScaledBigInt(aStr)
			const b = toScaledBigInt(bStr)
			const q = toScaledBigInt(qStr)

			// Compare |a - q * b| against |b| * 10^-precision in a common integer scale:
			// a = a.num / 10^a.scale
			// q * b = (q.num * b.num) / 10^(q.scale + b.scale)
			// bound = |b.num| / 10^(b.scale + precision)
			const commonScale = Math.max(a.scale, q.scale + b.scale, b.scale + precision)
			const aScaled = a.num * (10n ** BigInt(commonScale - a.scale))
			const qbScaled = q.num * b.num * (10n ** BigInt(commonScale - q.scale - b.scale))
			const maxErrScaled =
				(b.num < 0n ? -b.num : b.num) * (10n ** BigInt(commonScale - b.scale - precision))

			const diff = aScaled - qbScaled
			const absDiff = diff < 0n ? -diff : diff

			// Truncation toward zero guarantees 0 <= |a| - |q * b| < |b| * 10^-precision
			// and |q * b| <= |a|
			const absA = aScaled < 0n ? -aScaled : aScaled
			const absQB = qbScaled < 0n ? -qbScaled : qbScaled
			assert.ok(absQB <= absA, `Expected |q*b| <= |a| for ${aStr} / ${bStr}`)
			assert.ok(absDiff < maxErrScaled, `Expected |a - q*b| < |b|*10^-${precision} for ${aStr} / ${bStr}`)
		}
	})
})
