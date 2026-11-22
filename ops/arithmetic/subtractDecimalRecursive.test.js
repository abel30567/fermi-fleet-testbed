import { describe, test } from 'node:test'
import assert from 'node:assert'
import { subtractDecimalRecursive } from './subtractDecimalRecursive.js'

/**
 * Independent BigInt-scaled reference oracle for decimal subtraction (half-away-from-zero).
 *
 * @param {string} a
 * @param {string} b
 * @param {number} [precision=20]
 * @returns {string}
 */
function referenceBigIntSubtract(a, b, precision = 20) {
	const parse = (s) => {
		const neg = s.startsWith('-')
		const clean = s.replace(/^[+-]/, '')
		const [intPart = '0', fracPart = ''] = clean.split('.')
		return { neg, intPart: intPart || '0', fracPart }
	}

	const pa = parse(a)
	const pb = parse(b)
	const scale = Math.max(pa.fracPart.length, pb.fracPart.length)
	const toScaled = (p) => {
		const mag = BigInt(p.intPart + p.fracPart.padEnd(scale, '0'))
		return p.neg ? -mag : mag
	}

	let diff = toScaled(pa) - toScaled(pb)
	if (diff === 0n) return '0'

	const neg = diff < 0n
	let mag = neg ? -diff : diff
	let outScale = scale

	if (scale > precision) {
		const factor = 10n ** BigInt(scale - precision)
		const half = factor / 2n
		const quotient = mag / factor
		const remainder = mag % factor
		mag = remainder >= half ? quotient + 1n : quotient
		outScale = precision
	}

	if (mag === 0n) return '0'

	const digits = mag.toString()
	if (outScale === 0) {
		return neg ? `-${digits}` : digits
	}

	const padded = digits.padStart(outScale + 1, '0')
	const split = padded.length - outScale
	const intPart = padded.slice(0, split)
	const fracPart = padded.slice(split).replace(/0+$/, '')
	const unsigned = fracPart ? `${intPart}.${fracPart}` : intPart
	return neg ? `-${unsigned}` : unsigned
}

describe('subtractDecimalRecursive', () => {
	test('handles normal integer and decimal subtraction', () => {
		assert.strictEqual(subtractDecimalRecursive('10', '3'), '7')
		assert.strictEqual(subtractDecimalRecursive('0.3', '0.1'), '0.2')
		assert.strictEqual(subtractDecimalRecursive('123.456', '23.456'), '100')
		assert.strictEqual(subtractDecimalRecursive('100.5', '0.25'), '100.25')
		assert.strictEqual(subtractDecimalRecursive('1000', '1'), '999')
	})

	test('handles negative results and all sign combinations', () => {
		assert.strictEqual(subtractDecimalRecursive('3', '10'), '-7')
		assert.strictEqual(subtractDecimalRecursive('0.1', '0.3'), '-0.2')
		// + minus -
		assert.strictEqual(subtractDecimalRecursive('5.25', '-4.75'), '10')
		// - minus +
		assert.strictEqual(subtractDecimalRecursive('-5.25', '4.75'), '-10')
		// - minus - (negative result)
		assert.strictEqual(subtractDecimalRecursive('-10.5', '-3.2'), '-7.3')
		// - minus - (positive result)
		assert.strictEqual(subtractDecimalRecursive('-3.2', '-10.5'), '7.3')
		// - minus - (zero)
		assert.strictEqual(subtractDecimalRecursive('-7.125', '-7.125'), '0')
		// explicit leading plus signs
		assert.strictEqual(subtractDecimalRecursive('+12.5', '+2.5'), '10')
		assert.strictEqual(subtractDecimalRecursive('+2.5', '-0'), '2.5')
		assert.strictEqual(subtractDecimalRecursive('+2.5', '-7.5'), '10')
	})

	test('preserves high precision (>30 digits) and multi-limb borrow cascades', () => {
		const a = '10000000000000000000000000000000000000000'
		const b = '0.0000000000000000000000000000000000000001'
		const expected = '9999999999999999999999999999999999999999.9999999999999999999999999999999999999999'
		assert.strictEqual(subtractDecimalRecursive(a, b, 40), expected)

		const c = '3.14159265358979323846264338327950288419716939937510'
		const d = '2.71828182845904523536028747135266249775724709369995'
		assert.strictEqual(
			subtractDecimalRecursive(c, d, 50),
			'0.42331082513074800310235591192684038643992230567515'
		)
	})

	test('rounds accurately to configured precision (half away from zero)', () => {
		assert.strictEqual(subtractDecimalRecursive('1.23456', '0', 3), '1.235')
		assert.strictEqual(subtractDecimalRecursive('1.23449', '0', 3), '1.234')
		assert.strictEqual(subtractDecimalRecursive('1.2345', '0', 3), '1.235')
		assert.strictEqual(subtractDecimalRecursive('0', '1.2345', 3), '-1.235')
		assert.strictEqual(subtractDecimalRecursive('0', '1.2344', 3), '-1.234')
		// Carry across decimal point and limb boundaries during rounding
		assert.strictEqual(subtractDecimalRecursive('9.9995', '0', 3), '10')
		assert.strictEqual(subtractDecimalRecursive('99999999999999.999', '0', 2), '100000000000000')
		// Precision = 0 rounds to integer
		assert.strictEqual(subtractDecimalRecursive('5.6', '0.1', 0), '6')
		assert.strictEqual(subtractDecimalRecursive('5.4', '0.1', 0), '5')
		assert.strictEqual(subtractDecimalRecursive('0', '0.5', 0), '-1')
		assert.strictEqual(subtractDecimalRecursive('0', '0.499999999999', 0), '0')
		// Default precision = 20 rounds >20 fractional digits
		assert.strictEqual(
			subtractDecimalRecursive('1.000000000000000000005', '0'),
			'1.00000000000000000001'
		)
		assert.strictEqual(
			subtractDecimalRecursive('1.000000000000000000004', '0'),
			'1'
		)
	})

	test('handles edge cases (zeros, shorthand decimals, leading/trailing zeros)', () => {
		assert.strictEqual(subtractDecimalRecursive('0', '0'), '0')
		assert.strictEqual(subtractDecimalRecursive('-0', '0'), '0')
		assert.strictEqual(subtractDecimalRecursive('0', '-0'), '0')
		assert.strictEqual(subtractDecimalRecursive('-0.000', '-0.000'), '0')
		assert.strictEqual(subtractDecimalRecursive('-0', '5'), '-5')
		assert.strictEqual(subtractDecimalRecursive('-5', '-0'), '-5')
		assert.strictEqual(subtractDecimalRecursive('.5', '-.5'), '1')
		assert.strictEqual(subtractDecimalRecursive('5.', '2.'), '3')
		assert.strictEqual(subtractDecimalRecursive('000042.5000', '00000.50000'), '42')
		assert.strictEqual(subtractDecimalRecursive('0.0004', '0.0005', 2), '0')
	})

	test('validates inputs and throws on invalid arguments', () => {
		assert.throws(() => subtractDecimalRecursive(10, '5'), TypeError)
		assert.throws(() => subtractDecimalRecursive('10', 5), TypeError)
		assert.throws(() => subtractDecimalRecursive(null, '5'), TypeError)
		assert.throws(() => subtractDecimalRecursive('10', undefined), TypeError)
		assert.throws(() => subtractDecimalRecursive('10', '5', '2'), TypeError)

		assert.throws(() => subtractDecimalRecursive('', '5'), RangeError)
		assert.throws(() => subtractDecimalRecursive('   ', '5'), RangeError)
		assert.throws(() => subtractDecimalRecursive('1.2.3', '5'), RangeError)
		assert.throws(() => subtractDecimalRecursive('.', '5'), RangeError)
		assert.throws(() => subtractDecimalRecursive('+', '5'), RangeError)
		assert.throws(() => subtractDecimalRecursive('-', '5'), RangeError)
		assert.throws(() => subtractDecimalRecursive('NaN', '5'), RangeError)
		assert.throws(() => subtractDecimalRecursive('Infinity', '5'), RangeError)
		assert.throws(() => subtractDecimalRecursive('1e5', '5'), RangeError)
		assert.throws(() => subtractDecimalRecursive(' 1.5 ', '5'), RangeError)
		assert.throws(() => subtractDecimalRecursive('10', '5', -1), RangeError)
		assert.throws(() => subtractDecimalRecursive('10', '5', 1.5), RangeError)
		assert.throws(() => subtractDecimalRecursive('10', '5', Number.NaN), RangeError)
		assert.throws(() => subtractDecimalRecursive('10', '5', Number.POSITIVE_INFINITY), RangeError)
	})

	test('matches independent BigInt scaled reference across diverse high-precision pairs', () => {
		const cases = [
			[
				'9876543210987654321098765432109876543210.12345678901234567890123456789012345',
				'1234567890123456789012345678901234567890.98765432109876543210987654321098765',
				35,
			],
			[
				'1234567890123456789012345678901234567890.98765432109876543210987654321098765',
				'9876543210987654321098765432109876543210.12345678901234567890123456789012345',
				35,
			],
			[
				'-45678901234567890123456789012345.000000000000000000000000000000123456789',
				'-45678901234567890123456789012345.000000000000000000000000000000987654321',
				40,
			],
			[
				'-99999999999999999999999999999999999999.999999999999999999999999999999',
				'0.000000000000000000000000000001',
				30,
			],
			[
				'1000000000000000000000000000000.000000000000000000005000000001',
				'0.000000000000000000000000000001',
				20,
			],
			[
				'0.000000000000000000000000000000000001',
				'100000000000000000000000000000000000',
				36,
			],
			[
				'-77777777777777777777777777777777777.5555555555555555555555555555555',
				'22222222222222222222222222222222222.4444444444444444444444444444445',
				10,
			],
			[
				'99999999999999999999999999999999999.9999999999999999999999999999999',
				'0.0000000000000000000000000000001',
				0,
			],
		]

		for (const [a, b, precision] of cases) {
			assert.strictEqual(
				subtractDecimalRecursive(a, b, precision),
				referenceBigIntSubtract(a, b, precision),
				`Mismatch for (${a}) - (${b}) at precision ${precision}`
			)
		}
	})
})
