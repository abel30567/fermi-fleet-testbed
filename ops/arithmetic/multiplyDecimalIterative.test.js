import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { multiplyDecimalIterative } from './multiplyDecimalIterative.js'

/**
 * Independent reference implementation using BigInt scaled integer arithmetic
 * with round-half-away-from-zero for cross-checking.
 */
function multiplyViaBigIntReference(a, b, precision) {
	const parse = (s) => {
		const negative = s.startsWith('-')
		const unsigned = s.startsWith('-') || s.startsWith('+') ? s.slice(1) : s
		const dot = unsigned.indexOf('.')
		const scale = dot === -1 ? 0 : unsigned.length - dot - 1
		const intStr = dot === -1 ? unsigned : unsigned.slice(0, dot) + unsigned.slice(dot + 1)
		return { negative, value: BigInt(intStr || '0'), scale }
	}

	const pa = parse(a)
	const pb = parse(b)
	let absProduct = pa.value * pb.value
	if (absProduct === 0n) {
		return '0'
	}

	const negative = pa.negative !== pb.negative
	let scale = pa.scale + pb.scale

	if (precision !== undefined && precision < scale) {
		const drop = scale - precision
		const divisor = 10n ** BigInt(drop)
		const half = divisor / 2n
		const quotient = absProduct / divisor
		const remainder = absProduct % divisor
		absProduct = remainder >= half ? quotient + 1n : quotient
		scale = precision
	}

	if (absProduct === 0n) {
		return '0'
	}

	const raw = absProduct.toString().padStart(scale + 1, '0')
	const intPart = scale === 0 ? raw : raw.slice(0, raw.length - scale)
	const fracPart = scale === 0 ? '' : raw.slice(raw.length - scale).replace(/0+$/, '')
	const prefix = negative ? '-' : ''
	return fracPart ? `${prefix}${intPart}.${fracPart}` : `${prefix}${intPart}`
}

describe('multiplyDecimalIterative', () => {
	test('handles normal integer and decimal multiplication', () => {
		assert.equal(multiplyDecimalIterative('2', '3'), '6')
		assert.equal(multiplyDecimalIterative('12', '34'), '408')
		assert.equal(multiplyDecimalIterative('0.1', '0.2'), '0.02')
		assert.equal(multiplyDecimalIterative('1.5', '2.0'), '3')
		assert.equal(multiplyDecimalIterative('12.34', '56.78'), '700.6652')
		assert.equal(multiplyDecimalIterative('0.005', '0.02'), '0.0001')
		assert.equal(multiplyDecimalIterative('.5', '.5'), '0.25')
		assert.equal(multiplyDecimalIterative('5.', '2.'), '10')
		assert.equal(multiplyDecimalIterative('00012.3400', '002.000'), '24.68')
	})

	test('handles positive and negative signs correctly', () => {
		assert.equal(multiplyDecimalIterative('+3.5', '+2'), '7')
		assert.equal(multiplyDecimalIterative('-3.5', '2'), '-7')
		assert.equal(multiplyDecimalIterative('3.5', '-2'), '-7')
		assert.equal(multiplyDecimalIterative('-3.5', '-2'), '7')
		assert.equal(multiplyDecimalIterative('-.25', '+4'), '-1')
		assert.equal(multiplyDecimalIterative('-.25', '-.4'), '0.1')
	})

	test('handles very large numbers (>50 digits) accurately', () => {
		const a = '123456789012345678901234567890123456789012345678901234567890'
		const b = '987654321098765432109876543210987654321098765432109876543210'
		const expected = (BigInt(a) * BigInt(b)).toString()
		assert.equal(multiplyDecimalIterative(a, b), expected)

		// All-9s stress test (maximizes carries across >60 digits)
		const ninesA = '9'.repeat(65)
		const ninesB = '9'.repeat(60)
		const expectedNines = (BigInt(ninesA) * BigInt(ninesB)).toString()
		assert.equal(multiplyDecimalIterative(ninesA, ninesB), expectedNines)

		// Large high-precision fractional decimals (>50 digits each)
		const decA = '123456789012345678901234567890.098765432109876543210987654321'
		const decB = '-999999999999999999999999999999.111111111111111111111111111111'
		assert.equal(
			multiplyDecimalIterative(decA, decB),
			multiplyViaBigIntReference(decA, decB),
		)
	})

	test('applies configurable fractional precision rounding (round-half-away-from-zero)', () => {
		assert.equal(multiplyDecimalIterative('1.234', '2', 2), '2.47')
		assert.equal(multiplyDecimalIterative('1.232', '2', 2), '2.46')
		assert.equal(multiplyDecimalIterative('1.2325', '2', 2), '2.47')
		assert.equal(multiplyDecimalIterative('-1.2325', '2', 2), '-2.47')

		// Halfway ties round away from zero
		assert.equal(multiplyDecimalIterative('0.5', '1', 0), '1')
		assert.equal(multiplyDecimalIterative('-0.5', '1', 0), '-1')
		assert.equal(multiplyDecimalIterative('2.5', '1', 0), '3')
		assert.equal(multiplyDecimalIterative('-2.5', '1', 0), '-3')

		// Carry cascading across decimal point and creating a new leading digit
		assert.equal(multiplyDecimalIterative('9.995', '1', 2), '10')
		assert.equal(multiplyDecimalIterative('-9.995', '1', 2), '-10')
		assert.equal(multiplyDecimalIterative('99.9999', '1', 3), '100')
		assert.equal(multiplyDecimalIterative('0.9999', '1', 0), '1')

		// Precision larger than fractional digits returns exact normalized value
		assert.equal(multiplyDecimalIterative('1.5', '2', 10), '3')
		assert.equal(multiplyDecimalIterative('0.1', '0.2', 10), '0.02')
	})

	test('handles zero edge cases and negative zero normalization', () => {
		assert.equal(multiplyDecimalIterative('0', '0'), '0')
		assert.equal(multiplyDecimalIterative('-0', '0'), '0')
		assert.equal(multiplyDecimalIterative('0', '-0'), '0')
		assert.equal(multiplyDecimalIterative('-0', '12345.6789'), '0')
		assert.equal(multiplyDecimalIterative('12345.6789', '-0.0000'), '0')
		assert.equal(multiplyDecimalIterative('-0.0', '-0.0'), '0')
		assert.equal(multiplyDecimalIterative('+.0', '-.0'), '0')
		assert.equal(multiplyDecimalIterative('-0', '5', 4), '0')

		// Non-zero negative product that rounds to zero must normalize to "0"
		assert.equal(multiplyDecimalIterative('-0.0001', '0.0001', 4), '0')
		assert.equal(multiplyDecimalIterative('-0.4', '1', 0), '0')
		assert.equal(multiplyDecimalIterative('0.004', '-1', 2), '0')
	})

	test('rejects invalid inputs with descriptive TypeError/RangeError', () => {
		// Non-string operands -> TypeError
		assert.throws(() => multiplyDecimalIterative(123, '2'), TypeError)
		assert.throws(() => multiplyDecimalIterative('2', 123), TypeError)
		assert.throws(() => multiplyDecimalIterative(null, '2'), TypeError)
		assert.throws(() => multiplyDecimalIterative('2', undefined), TypeError)
		assert.throws(() => multiplyDecimalIterative(10n, '2'), TypeError)
		assert.throws(() => multiplyDecimalIterative({}, '2'), TypeError)

		// Malformed decimal strings -> RangeError
		const invalidStrings = [
			'',
			'   ',
			'.',
			'+',
			'-',
			'+.',
			'-.',
			'1.2.3',
			'1e5',
			'1E-5',
			'NaN',
			'Infinity',
			'-Infinity',
			' 1.5',
			'1.5 ',
			'1,000',
			'abc',
			'--1',
			'++1',
		]
		for (const bad of invalidStrings) {
			assert.throws(
				() => multiplyDecimalIterative(bad, '1'),
				RangeError,
				`Expected RangeError for a="${bad}"`,
			)
			assert.throws(
				() => multiplyDecimalIterative('1', bad),
				RangeError,
				`Expected RangeError for b="${bad}"`,
			)
		}

		// Invalid precision -> TypeError or RangeError
		assert.throws(() => multiplyDecimalIterative('1', '2', '2'), TypeError)
		assert.throws(() => multiplyDecimalIterative('1', '2', null), TypeError)
		assert.throws(() => multiplyDecimalIterative('1', '2', -1), RangeError)
		assert.throws(() => multiplyDecimalIterative('1', '2', 1.5), RangeError)
		assert.throws(() => multiplyDecimalIterative('1', '2', Number.NaN), RangeError)
		assert.throws(() => multiplyDecimalIterative('1', '2', Number.POSITIVE_INFINITY), RangeError)
		assert.throws(
			() => multiplyDecimalIterative('1', '2', Number.MAX_SAFE_INTEGER + 1),
			RangeError,
		)
	})

	test('cross-checks against independent BigInt scaled integer computation', () => {
		const cases = [
			['0.0000000000000000000123456789', '98765432100000000000000000000', undefined],
			['31415926535897932384626433832795028841971693993751.058209749445923', '27182818284590452353602874713526624977572470936999.595749669676277', undefined],
			['31415926535897932384626433832795028841971693993751.058209749445923', '27182818284590452353602874713526624977572470936999.595749669676277', 20],
			['31415926535897932384626433832795028841971693993751.058209749445923', '-27182818284590452353602874713526624977572470936999.595749669676277', 0],
			['-99999999999999999999999999.99999999999999999999999999', '-0.0000000000000000000000000099999999999999999999999999', 15],
			['-0.000000000000000000000000005', '0.000000000000000000000000001', 53],
			['-0.000000000000000000000000005', '0.000000000000000000000000001', 52],
			['77777777777777777777777777777777777777777777777777777.5', '88888888888888888888888888888888888888888888888888888.5', 1],
			['000000000.0000000000000000000000000000000000000000000000000001', '10000000000000000000000000000000000000000000000000000', 5],
		]

		for (const [a, b, precision] of cases) {
			const actual = multiplyDecimalIterative(a, b, precision)
			const expected = multiplyViaBigIntReference(a, b, precision)
			assert.equal(
				actual,
				expected,
				`Mismatch for (${a}) * (${b}) with precision=${precision}`,
			)
		}
	})
})
