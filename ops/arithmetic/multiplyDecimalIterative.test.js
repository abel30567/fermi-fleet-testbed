import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { multiplyDecimalIterative } from './multiplyDecimalIterative.js'

/**
 * Independent reference implementation using BigInt scaled arithmetic
 * to cross-check multiplyDecimalIterative.
 *
 * @param {string} a
 * @param {string} b
 * @param {number} [precision]
 * @returns {string}
 */
function multiplyViaBigInt(a, b, precision) {
	const parse = (s) => {
		const neg = s.startsWith('-')
		const unsigned = neg || s.startsWith('+') ? s.slice(1) : s
		const parts = unsigned.split('.')
		const intPart = parts[0] || '0'
		const fracPart = parts[1] || ''
		const scale = fracPart.length
		const big = BigInt(intPart + fracPart)
		return { neg: neg && big !== 0n, value: big, scale }
	}

	const pa = parse(a)
	const pb = parse(b)
	const prod = pa.value * pb.value
	const scale = pa.scale + pb.scale
	const isNeg = pa.neg !== pb.neg

	if (prod === 0n) {
		if (precision === undefined || precision === 0) return '0'
		return `0.${'0'.repeat(precision)}`
	}

	const formatScaled = (val, sc, stripTrailing) => {
		let digits = val.toString()
		if (sc === 0) return digits
		if (digits.length <= sc) {
			digits = '0'.repeat(sc - digits.length + 1) + digits
		}
		const intPart = digits.slice(0, digits.length - sc)
		let fracPart = digits.slice(digits.length - sc)
		if (stripTrailing) {
			fracPart = fracPart.replace(/0+$/, '')
		}
		return fracPart.length > 0 ? `${intPart}.${fracPart}` : intPart
	}

	if (precision === undefined) {
		const mag = formatScaled(prod, scale, true)
		return isNeg ? `-${mag}` : mag
	}

	if (scale <= precision) {
		const shifted = prod * (10n ** BigInt(precision - scale))
		const mag = formatScaled(shifted, precision, false)
		return isNeg ? `-${mag}` : mag
	}

	const diff = scale - precision
	const divisor = 10n ** BigInt(diff)
	const half = divisor / 2n
	const quotient = prod / divisor
	const remainder = prod % divisor
	const rounded = remainder >= half ? quotient + 1n : quotient

	if (rounded === 0n) {
		return precision === 0 ? '0' : `0.${'0'.repeat(precision)}`
	}

	const mag = formatScaled(rounded, precision, false)
	return isNeg ? `-${mag}` : mag
}

describe('multiplyDecimalIterative', () => {
	test('multiplies basic positive integers and decimals', () => {
		assert.equal(multiplyDecimalIterative('2', '3'), '6')
		assert.equal(multiplyDecimalIterative('12', '34'), '408')
		assert.equal(multiplyDecimalIterative('99', '99'), '9801')
		assert.equal(multiplyDecimalIterative('0.1', '0.2'), '0.02')
		assert.equal(multiplyDecimalIterative('1.25', '4'), '5')
		assert.equal(multiplyDecimalIterative('12.34', '56.78'), '700.6652')
	})

	test('handles signs correctly', () => {
		assert.equal(multiplyDecimalIterative('-3', '4'), '-12')
		assert.equal(multiplyDecimalIterative('3', '-4'), '-12')
		assert.equal(multiplyDecimalIterative('-3', '-4'), '12')
		assert.equal(multiplyDecimalIterative('+1.5', '+2.0'), '3')
		assert.equal(multiplyDecimalIterative('+1.5', '-2.5'), '-3.75')
		assert.equal(multiplyDecimalIterative('-0.5', '-0.5'), '0.25')
	})

	test('handles zero operands and avoids negative zero', () => {
		assert.equal(multiplyDecimalIterative('0', '0'), '0')
		assert.equal(multiplyDecimalIterative('0', '12345.6789'), '0')
		assert.equal(multiplyDecimalIterative('-0', '12345.6789'), '0')
		assert.equal(multiplyDecimalIterative('12345.6789', '-0.000'), '0')
		assert.equal(multiplyDecimalIterative('+0.0', '-0.0'), '0')
		assert.equal(multiplyDecimalIterative('-0', '5', 0), '0')
		assert.equal(multiplyDecimalIterative('-0', '5', 3), '0.000')
		assert.equal(multiplyDecimalIterative('0.000', '-99.99', 4), '0.0000')
	})

	test('handles edge decimal formats (leading/trailing zeros and dots)', () => {
		assert.equal(multiplyDecimalIterative('00012.3400', '00.010'), '0.1234')
		assert.equal(multiplyDecimalIterative('.5', '.5'), '0.25')
		assert.equal(multiplyDecimalIterative('+.25', '-.4'), '-0.1')
		assert.equal(multiplyDecimalIterative('5.', '2.'), '10')
		assert.equal(multiplyDecimalIterative('1', '42.42'), '42.42')
		assert.equal(multiplyDecimalIterative('-1', '42.42'), '-42.42')
		assert.equal(
			multiplyDecimalIterative('0.0000000001', '0.0000000001'),
			'0.00000000000000000001'
		)
	})

	test('supports configurable precision with rounding and zero-padding', () => {
		// Truncate / round down
		assert.equal(multiplyDecimalIterative('1.234', '1', 2), '1.23')
		assert.equal(multiplyDecimalIterative('-1.234', '1', 2), '-1.23')
		// Round half away from zero
		assert.equal(multiplyDecimalIterative('1.235', '1', 2), '1.24')
		assert.equal(multiplyDecimalIterative('-1.235', '1', 2), '-1.24')
		assert.equal(multiplyDecimalIterative('1.234', '5.678', 2), '7.01')
		assert.equal(multiplyDecimalIterative('1.234', '5.678', 4), '7.0067')
		// Zero-padding when precision exceeds exact fractional length
		assert.equal(multiplyDecimalIterative('2', '3', 2), '6.00')
		assert.equal(multiplyDecimalIterative('1.2', '3.4', 5), '4.08000')
		assert.equal(multiplyDecimalIterative('-1.5', '2', 3), '-3.000')
	})

	test('handles rounding carry propagation and rounding to zero', () => {
		assert.equal(multiplyDecimalIterative('0.995', '1', 2), '1.00')
		assert.equal(multiplyDecimalIterative('9.995', '1', 2), '10.00')
		assert.equal(multiplyDecimalIterative('-9.995', '1', 2), '-10.00')
		assert.equal(multiplyDecimalIterative('99.9999', '1', 3), '100.000')
		assert.equal(multiplyDecimalIterative('0.5', '1', 0), '1')
		assert.equal(multiplyDecimalIterative('-0.5', '1', 0), '-1')
		assert.equal(multiplyDecimalIterative('9.5', '1', 0), '10')
		// Rounding down to zero never emits negative zero
		assert.equal(multiplyDecimalIterative('-0.4', '1', 0), '0')
		assert.equal(multiplyDecimalIterative('-0.004', '1', 2), '0.00')
		assert.equal(multiplyDecimalIterative('-0.005', '1', 2), '-0.01')
	})

	test('computes high-precision arbitrary-length products accurately', () => {
		// Beyond Number.MAX_SAFE_INTEGER
		const a = '900719925474099312345678901234567890'
		const b = '987654321098765432109876543210987654'
		assert.equal(
			multiplyDecimalIterative(a, b),
			(BigInt(a) * BigInt(b)).toString()
		)

		// (10^60 - 1)^2 = (10^60 - 2) * 10^60 + 1
		const nines60 = '9'.repeat(60)
		const expectedNinesSq = `${'9'.repeat(59)}8${'0'.repeat(59)}1`
		assert.equal(multiplyDecimalIterative(nines60, nines60), expectedNinesSq)

		// High-precision pi * e
		const pi = '3.14159265358979323846264338327950288419716939937510'
		const e = '2.71828182845904523536028747135266249775724709369995'
		assert.equal(
			multiplyDecimalIterative(pi, e),
			multiplyViaBigInt(pi, e)
		)
		assert.equal(
			multiplyDecimalIterative(pi, e, 50),
			multiplyViaBigInt(pi, e, 50)
		)
		assert.equal(
			multiplyDecimalIterative(pi, e, 80),
			multiplyViaBigInt(pi, e, 80)
		)
		assert.equal(
			multiplyDecimalIterative(pi, e, 120),
			multiplyViaBigInt(pi, e, 120)
		)
	})

	test('rejects invalid operand types and malformed strings', () => {
		for (const bad of [123, 12n, null, undefined, {}, [], true, Symbol('x')]) {
			assert.throws(() => multiplyDecimalIterative(bad, '1'), TypeError)
			assert.throws(() => multiplyDecimalIterative('1', bad), TypeError)
		}

		const malformed = [
			'',
			' ',
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
			' 1.2',
			'1.2 ',
			'1,000',
			'1_000',
			'0x10',
			'abc',
			'--1',
			'++1',
			'+-1'
		]
		for (const bad of malformed) {
			assert.throws(() => multiplyDecimalIterative(bad, '1'), RangeError)
			assert.throws(() => multiplyDecimalIterative('1', bad), RangeError)
		}
	})

	test('rejects invalid precision arguments', () => {
		for (const bad of ['2', null, 2n, {}, [], true]) {
			assert.throws(() => multiplyDecimalIterative('1.5', '2.5', bad), TypeError)
		}

		for (const bad of [-1, -100, 1.5, 0.1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => multiplyDecimalIterative('1.5', '2.5', bad), RangeError)
		}
	})

	test('cross-checks 200 seeded pseudo-random cases against BigInt scaled arithmetic', () => {
		// Deterministic LCG PRNG
		let seed = 0x5eed1234
		const nextInt = (max) => {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
			return seed % max
		}

		const randomDecimal = () => {
			const signChoice = nextInt(5)
			const sign = signChoice === 0 ? '-' : signChoice === 1 ? '+' : ''
			const intLen = nextInt(35)
			const fracLen = nextInt(35)
			let intPart = ''
			for (let i = 0; i < intLen; i++) {
				intPart += String(nextInt(10))
			}
			let fracPart = ''
			for (let i = 0; i < fracLen; i++) {
				fracPart += String(nextInt(10))
			}
			if (intLen === 0 && fracLen === 0) {
				return `${sign}0`
			}
			if (fracLen === 0) {
				return `${sign}${intPart}`
			}
			return `${sign}${intPart}.${fracPart}`
		}

		const precisions = [undefined, 0, 1, 2, 5, 15, 40, 80]

		for (let i = 0; i < 200; i++) {
			const a = randomDecimal()
			const b = randomDecimal()
			const p = precisions[nextInt(precisions.length)]

			const actual = multiplyDecimalIterative(a, b, p)
			const expected = multiplyViaBigInt(a, b, p)
			assert.equal(actual, expected, `mismatch for a=${a}, b=${b}, p=${p}`)

			// Also verify commutativity
			const swapped = multiplyDecimalIterative(b, a, p)
			assert.equal(actual, swapped, `commutativity mismatch for a=${a}, b=${b}, p=${p}`)
		}
	})
})
