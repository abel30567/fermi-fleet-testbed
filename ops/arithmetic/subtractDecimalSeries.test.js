import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { subtractDecimalSeries } from './subtractDecimalSeries.js'

/**
 * Independent digit-by-digit schoolbook subtraction reference for non-negative
 * fixed-point decimal strings (without using BigInt) to cross-check results.
 */
function schoolbookSubtractNonNeg(a, b) {
	const [aInt = '0', aFrac = ''] = a.split('.')
	const [bInt = '0', bFrac = ''] = b.split('.')
	const fracLen = Math.max(aFrac.length, bFrac.length)
	const aDigits = aInt + aFrac.padEnd(fracLen, '0')
	const bDigits = bInt + bFrac.padEnd(fracLen, '0')
	const totalLen = Math.max(aDigits.length, bDigits.length)
	const x = aDigits.padStart(totalLen, '0')
	const y = bDigits.padStart(totalLen, '0')

	let negative = false
	let hi = x
	let lo = y
	if (x < y) {
		negative = true
		hi = y
		lo = x
	}

	const out = new Array(totalLen)
	let borrow = 0
	for (let i = totalLen - 1; i >= 0; i--) {
		let d = Number(hi[i]) - Number(lo[i]) - borrow
		if (d < 0) {
			d += 10
			borrow = 1
		} else {
			borrow = 0
		}
		out[i] = String(d)
	}

	const raw = out.join('')
	const intPart = raw.slice(0, totalLen - fracLen).replace(/^0+/, '') || '0'
	const fracPart = fracLen > 0 ? raw.slice(totalLen - fracLen).replace(/0+$/, '') : ''
	if (intPart === '0' && fracPart === '') {
		return '0'
	}
	const body = fracPart ? `${intPart}.${fracPart}` : intPart
	return negative ? `-${body}` : body
}

describe('subtractDecimalSeries', () => {
	test('handles basic positive, negative, and decimal subtractions', () => {
		assert.equal(subtractDecimalSeries('10', '3'), '7')
		assert.equal(subtractDecimalSeries('3', '10'), '-7')
		assert.equal(subtractDecimalSeries('0.3', '0.1'), '0.2')
		assert.equal(subtractDecimalSeries('12.345', '0.345'), '12')
		assert.equal(subtractDecimalSeries('-5.25', '-2.75'), '-2.5')
		assert.equal(subtractDecimalSeries('-5.25', '2.75'), '-8')
		assert.equal(subtractDecimalSeries('5.25', '-2.75'), '8')
	})

	test('handles zero, signed zeros, whitespace, and shorthand decimals', () => {
		assert.equal(subtractDecimalSeries('0', '0'), '0')
		assert.equal(subtractDecimalSeries('-0', '0'), '0')
		assert.equal(subtractDecimalSeries('0', '-0'), '0')
		assert.equal(subtractDecimalSeries('42.5000', '42.5'), '0')
		assert.equal(subtractDecimalSeries('  +10.5 ', ' .5 '), '10')
		assert.equal(subtractDecimalSeries('5.', '.25'), '4.75')
		assert.equal(subtractDecimalSeries('0', '0.0004', 3), '0')
	})

	test('handles scientific notation and huge arbitrary-precision values', () => {
		assert.equal(subtractDecimalSeries('1e5', '1'), '99999')
		assert.equal(subtractDecimalSeries('1.5e-3', '5e-4'), '0.001')
		assert.equal(subtractDecimalSeries('-2.5E+2', '-1.5e2'), '-100')
		assert.equal(
			subtractDecimalSeries(
				'10000000000000000000000000000000000000000.0000000000000000000000000000000000000001',
				'10000000000000000000000000000000000000000',
				50
			),
			'0.0000000000000000000000000000000000000001'
		)
	})

	test('applies configurable precision with half-away-from-zero rounding', () => {
		assert.equal(subtractDecimalSeries('1.235', '0', 2), '1.24')
		assert.equal(subtractDecimalSeries('0', '1.235', 2), '-1.24')
		assert.equal(subtractDecimalSeries('1.234', '0', 2), '1.23')
		assert.equal(subtractDecimalSeries('0.9996', '0', 3), '1')
		assert.equal(subtractDecimalSeries('10.6', '3.1', 0), '8')
		assert.equal(subtractDecimalSeries('3.1', '10.6', 0), '-8')
		assert.equal(subtractDecimalSeries('1', '0.000000000000000000001', 20), '1')
		assert.equal(
			subtractDecimalSeries('1', '0.000000000000000000001', 21),
			'0.999999999999999999999'
		)
	})

	test('validates inputs and throws TypeError / RangeError on invalid arguments', () => {
		assert.throws(() => subtractDecimalSeries(10, '5'), TypeError)
		assert.throws(() => subtractDecimalSeries('10', 5), TypeError)
		assert.throws(() => subtractDecimalSeries(null, '5'), TypeError)
		assert.throws(() => subtractDecimalSeries('10', '5', '2'), TypeError)
		assert.throws(() => subtractDecimalSeries('10', '5', null), TypeError)

		assert.throws(() => subtractDecimalSeries('', '1'), RangeError)
		assert.throws(() => subtractDecimalSeries('   ', '1'), RangeError)
		assert.throws(() => subtractDecimalSeries('abc', '1'), RangeError)
		assert.throws(() => subtractDecimalSeries('1.2.3', '1'), RangeError)
		assert.throws(() => subtractDecimalSeries('.', '1'), RangeError)
		assert.throws(() => subtractDecimalSeries('NaN', '1'), RangeError)
		assert.throws(() => subtractDecimalSeries('Infinity', '1'), RangeError)
		assert.throws(() => subtractDecimalSeries('1e', '1'), RangeError)
		assert.throws(() => subtractDecimalSeries('1', '2', -1), RangeError)
		assert.throws(() => subtractDecimalSeries('1', '2', 1.5), RangeError)
		assert.throws(() => subtractDecimalSeries('1', '2', Number.NaN), RangeError)
		assert.throws(() => subtractDecimalSeries('1', '2', Number.POSITIVE_INFINITY), RangeError)
	})

	test('independent cross-check: matches digit-by-digit schoolbook subtraction', () => {
		const pairs = [
			['98765432109876543210.1234567890123456789012345', '12345678901234567890.9876543210987654321098765'],
			['0.0000000000000000000000001', '0.0000000000000000000000009'],
			['1000000000000000000000000', '0.000000000000000000000001'],
			['31415926535897932384626433.8327950288419716939937510', '27182818284590452353602874.7135266249775724709369995'],
		]

		for (const [a, b] of pairs) {
			const expected = schoolbookSubtractNonNeg(a, b)
			assert.equal(subtractDecimalSeries(a, b, 60), expected)
		}
	})

	test('independent cross-check: satisfies geometric series and anti-symmetry identities', () => {
		// Closed-form geometric series identity: 10^n - 10^(-n) = sum_{k=-n}^{n-1} 9 * 10^k
		for (const n of [1, 10, 35, 60]) {
			const expected = `${'9'.repeat(n)}.${'9'.repeat(n)}`
			assert.equal(subtractDecimalSeries(`1e${n}`, `1e-${n}`, n), expected)
		}

		// Anti-commutativity: (a - b) === -(b - a), including rounding tie cases
		const cases = [
			['123.456789', '98.765432', 4],
			['0.005', '0.000', 2],
			['1e-30', '2e-30', 30],
			['-42.125', '17.000', 2],
		]
		for (const [a, b, p] of cases) {
			const ab = subtractDecimalSeries(a, b, p)
			const ba = subtractDecimalSeries(b, a, p)
			const negBa = ba === '0' ? '0' : ba.startsWith('-') ? ba.slice(1) : `-${ba}`
			assert.equal(ab, negBa)
		}
	})
})
