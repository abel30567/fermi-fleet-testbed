import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { divideDecimalIterative } from './divideDecimalIterative.js'

/**
 * Independent reference implementation using single-shot scaled BigInt division
 * with half-away-from-zero rounding, used to cross-check divideDecimalIterative.
 */
function referenceBigIntScaledDivide(a, b, precision) {
	const parse = (s) => {
		const t = s.trim()
		const neg = t.startsWith('-')
		const unsigned = t.replace(/^[+-]/, '')
		const [intPart = '', fracPart = ''] = unsigned.split('.')
		return {
			neg,
			num: BigInt((intPart + fracPart) || '0'),
			scale: fracPart.length,
		}
	}

	const pa = parse(a)
	const pb = parse(b)
	if (pa.num === 0n) return '0'

	const neg = pa.neg !== pb.neg
	const netPower = precision + pb.scale - pa.scale
	const numerator = netPower >= 0 ? pa.num * 10n ** BigInt(netPower) : pa.num
	const denominator = netPower >= 0 ? pb.num : pb.num * 10n ** BigInt(-netPower)

	// Round half away from zero: floor((2 * numerator + denominator) / (2 * denominator))
	const scaled = (numerator * 2n + denominator) / (denominator * 2n)
	if (scaled === 0n) return '0'

	const digits = scaled.toString()
	if (precision === 0) {
		return `${neg ? '-' : ''}${digits}`
	}

	const padded = digits.padStart(precision + 1, '0')
	const intPart = padded.slice(0, padded.length - precision)
	const fracPart = padded.slice(padded.length - precision).replace(/0+$/, '')

	return fracPart.length > 0
		? `${neg ? '-' : ''}${intPart}.${fracPart}`
		: `${neg ? '-' : ''}${intPart}`
}

describe('divideDecimalIterative', () => {
	test('handles normal integer and exact decimal divisions', () => {
		assert.equal(divideDecimalIterative('10', '2'), '5')
		assert.equal(divideDecimalIterative('1', '2'), '0.5')
		assert.equal(divideDecimalIterative('1', '4'), '0.25')
		assert.equal(divideDecimalIterative('1', '8'), '0.125')
		assert.equal(divideDecimalIterative('7.5', '2.5'), '3')
		assert.equal(divideDecimalIterative('1.5', '0.03'), '50')
		assert.equal(divideDecimalIterative('0.005', '2'), '0.0025')
		assert.equal(divideDecimalIterative('123456.789', '1000'), '123.456789')
		assert.equal(divideDecimalIterative('.5', '.25'), '2')
		assert.equal(divideDecimalIterative('5.', '2.'), '2.5')
		assert.equal(divideDecimalIterative('00042.000', '006.00'), '7')
		assert.equal(divideDecimalIterative('  9.6  ', '  1.2  '), '8')
	})

	test('handles repeating decimals to default and high (40+ digits) precision', () => {
		assert.equal(divideDecimalIterative('1', '3'), '0.' + '3'.repeat(20))
		assert.equal(divideDecimalIterative('2', '3'), '0.' + '6'.repeat(19) + '7')

		// 1/3 to 50 fractional digits
		assert.equal(divideDecimalIterative('1', '3', 50), '0.' + '3'.repeat(50))
		// 2/3 to 50 fractional digits
		assert.equal(divideDecimalIterative('2', '3', 50), '0.' + '6'.repeat(49) + '7')

		// 1/7 has repeating block "142857" (length 6)
		// 42 digits = 7 exact cycles, next digit is 1 -> no round up
		assert.equal(divideDecimalIterative('1', '7', 42), '0.' + '142857'.repeat(7))
		// 40 digits = 6 cycles + "1428", next digit is 5 -> rounds up to "1429"
		assert.equal(divideDecimalIterative('1', '7', 40), '0.' + '142857'.repeat(6) + '1429')
		// 48 digits = 8 exact cycles
		assert.equal(divideDecimalIterative('1', '7', 48), '0.' + '142857'.repeat(8))

		// 1/9 and 1/11 to 45 digits
		assert.equal(divideDecimalIterative('1', '9', 45), '0.' + '1'.repeat(45))
		assert.equal(divideDecimalIterative('5', '9', 45), '0.' + '5'.repeat(44) + '6')
		assert.equal(divideDecimalIterative('1', '11', 44), '0.' + '09'.repeat(22))
	})

	test('handles signs correctly including explicit plus and negative zero normalization', () => {
		assert.equal(divideDecimalIterative('+10', '+4'), '2.5')
		assert.equal(divideDecimalIterative('-10', '4'), '-2.5')
		assert.equal(divideDecimalIterative('10', '-4'), '-2.5')
		assert.equal(divideDecimalIterative('-10', '-4'), '2.5')
		assert.equal(divideDecimalIterative('-1', '3', 6), '-0.333333')
		assert.equal(divideDecimalIterative('-2', '3', 6), '-0.666667')
		assert.equal(divideDecimalIterative('-0.001', '1', 2), '0')
		assert.equal(divideDecimalIterative('0.001', '-1', 2), '0')
	})

	test('handles rounding, tie-breaking, carry propagation, and precision = 0', () => {
		// Exact half ties (half away from zero)
		assert.equal(divideDecimalIterative('1', '2', 0), '1')
		assert.equal(divideDecimalIterative('3', '2', 0), '2')
		assert.equal(divideDecimalIterative('-1', '2', 0), '-1')
		assert.equal(divideDecimalIterative('-3', '2', 0), '-2')
		assert.equal(divideDecimalIterative('1', '20', 1), '0.1')
		assert.equal(divideDecimalIterative('1.25', '1', 1), '1.3')
		assert.equal(divideDecimalIterative('-1.25', '1', 1), '-1.3')

		// Just below half does not round up
		assert.equal(divideDecimalIterative('4999', '10000', 0), '0')
		assert.equal(divideDecimalIterative('1.249999', '1', 1), '1.2')

		// Carry propagation across fractional and integer boundaries
		assert.equal(divideDecimalIterative('0.999', '1', 2), '1')
		assert.equal(divideDecimalIterative('9.999', '1', 2), '10')
		assert.equal(divideDecimalIterative('99.995', '1', 2), '100')
		assert.equal(divideDecimalIterative('-99.995', '1', 2), '-100')
		assert.equal(divideDecimalIterative('999.5', '1', 0), '1000')
		assert.equal(divideDecimalIterative('199.9999999', '2', 4), '100')
		assert.equal(divideDecimalIterative('1', '1000', 2), '0')
		assert.equal(divideDecimalIterative('5', '1000', 2), '0.01')
	})

	test('handles zero numerator and extreme scales / arbitrary-precision operands', () => {
		assert.equal(divideDecimalIterative('0', '1'), '0')
		assert.equal(divideDecimalIterative('-0', '5'), '0')
		assert.equal(divideDecimalIterative('+0.000', '-3.14'), '0')
		assert.equal(divideDecimalIterative('0.0', '0.0000001', 0), '0')

		// Very large integer quotient beyond Number.MAX_SAFE_INTEGER
		const bigA = '9'.repeat(60)
		const bigB = '3'.repeat(30)
		assert.equal(divideDecimalIterative(bigA, bigB, 10), '3' + '0'.repeat(29) + '3')

		// Very small / large decimal scales
		assert.equal(
			divideDecimalIterative('1', '0.' + '0'.repeat(29) + '1', 5),
			'1' + '0'.repeat(30),
		)
		assert.equal(
			divideDecimalIterative('0.' + '0'.repeat(29) + '1', '1', 30),
			'0.' + '0'.repeat(29) + '1',
		)
	})

	test('rejects division by zero in all representations', () => {
		for (const zero of ['0', '-0', '+0', '0.0', '-0.000', '.0', '0.', ' 0.00 ']) {
			assert.throws(
				() => divideDecimalIterative('1', zero),
				{ name: 'RangeError', message: /Division by zero/ },
			)
		}
		assert.throws(
			() => divideDecimalIterative('0', '0'),
			{ name: 'RangeError', message: /Division by zero/ },
		)
	})

	test('validates invalid inputs for a, b, and precision', () => {
		// Non-string a or b
		for (const bad of [123, 10n, null, undefined, {}, [], true]) {
			assert.throws(() => divideDecimalIterative(bad, '1'), { name: 'TypeError' })
			assert.throws(() => divideDecimalIterative('1', bad), { name: 'TypeError' })
		}

		// Malformed decimal strings
		for (const bad of ['', '   ', 'abc', '.', '+', '-', '+.', '-.', '1.2.3', '1e5', 'NaN', 'Infinity', '1,000', '1 2', '--1']) {
			assert.throws(() => divideDecimalIterative(bad, '1'), { name: 'SyntaxError' })
			assert.throws(() => divideDecimalIterative('1', bad), { name: 'SyntaxError' })
		}

		// Invalid precision
		for (const badType of ['10', null, 10n, {}, true]) {
			assert.throws(() => divideDecimalIterative('1', '2', badType), { name: 'TypeError' })
		}
		for (const badRange of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => divideDecimalIterative('1', '2', badRange), { name: 'RangeError' })
		}
	})

	test('cross-checks against independent BigInt scaled division computation', () => {
		const cases = [
			['1', '3', 45],
			['2', '7', 60],
			['355', '113', 50],
			['-355', '113', 50],
			['123456789012345678901234567890.123456789', '9876543210987654321.987654321', 45],
			['-0.00000000000000123456789', '0.0000007654321', 55],
			['999999999999999999999999.999999', '0.000000000001', 10],
			['1', '999999999999999999999999999999', 60],
			['99.995', '1', 2],
			['7', '2', 0],
			['-7', '2', 0],
			['0.0000000000000000000001', '3', 40],
			['31415926535897932384626433832795028841971', '27182818284590452353602874713526624977572', 64],
		]

		for (const [a, b, prec] of cases) {
			const actual = divideDecimalIterative(a, b, prec)
			const expected = referenceBigIntScaledDivide(a, b, prec)
			assert.equal(actual, expected, `Mismatch for ${a} / ${b} at precision ${prec}`)
		}
	})
})
