import { describe, test } from 'node:test'
import assert from 'node:assert'
import { addDecimalRecursive } from './addDecimalRecursive.js'

/**
 * Independent BigInt-scaled reference implementation for cross-checking.
 *
 * @param {string} a
 * @param {string} b
 * @param {number} [precision=20]
 * @returns {string}
 */
function addDecimalBigIntOracle(a, b, precision = 20) {
	const parse = (s) => {
		const trimmed = s.trim()
		const neg = trimmed.startsWith('-')
		const unsigned = trimmed.replace(/^[+-]/, '')
		const [i = '0', f = ''] = unsigned.split('.')
		return { neg, intPart: i || '0', fracPart: f }
	}

	const pa = parse(a)
	const pb = parse(b)
	const scale = Math.max(pa.fracPart.length, pb.fracPart.length)

	const toScaledBigInt = ({ neg, intPart, fracPart }) => {
		const mag = BigInt(intPart + fracPart.padEnd(scale, '0'))
		return neg ? -mag : mag
	}

	let sum = toScaledBigInt(pa) + toScaledBigInt(pb)
	if (sum === 0n) return '0'

	const neg = sum < 0n
	let mag = neg ? -sum : sum
	let outScale = scale

	if (outScale > precision) {
		const drop = BigInt(outScale - precision)
		const factor = 10n ** drop
		const quotient = mag / factor
		const remainder = mag % factor
		const half = factor / 2n
		mag = remainder >= half ? quotient + 1n : quotient
		outScale = precision
	}

	if (mag === 0n) return '0'

	const digits = mag.toString().padStart(outScale + 1, '0')
	const intOut = outScale === 0 ? digits : digits.slice(0, digits.length - outScale)
	const fracOut = outScale === 0 ? '' : digits.slice(digits.length - outScale).replace(/0+$/, '')

	return `${neg ? '-' : ''}${intOut}${fracOut ? '.' + fracOut : ''}`
}

describe('addDecimalRecursive', () => {
	test('handles normal integer and decimal addition', () => {
		assert.strictEqual(addDecimalRecursive('2', '3'), '5')
		assert.strictEqual(addDecimalRecursive('0.1', '0.2'), '0.3')
		assert.strictEqual(addDecimalRecursive('123.45', '67.89'), '191.34')
		assert.strictEqual(addDecimalRecursive('1.5', '2.5'), '4')
		assert.strictEqual(addDecimalRecursive('9999', '1'), '10000')
		assert.strictEqual(addDecimalRecursive('0.9999', '0.0001'), '1')
		assert.strictEqual(addDecimalRecursive('+12.3400', '  000.660 '), '13')
		assert.strictEqual(addDecimalRecursive('.5', '5.'), '5.5')
	})

	test('handles high-precision numbers (>30 digits)', () => {
		const a = '123456789012345678901234567890123456.123456789012345678901234567890123456'
		const b = '987654321098765432109876543210987654.876543210987654321098765432109876544'
		assert.strictEqual(
			addDecimalRecursive(a, b, 40),
			'1111111110111111111011111111101111111',
		)

		const pi50 = '3.14159265358979323846264338327950288419716939937510'
		const e50 = '2.71828182845904523536028747135266249775724709369995'
		assert.strictEqual(
			addDecimalRecursive(pi50, e50, 50),
			'5.85987448204883847382293085463216538195441649307505',
		)

		// Deep recursion / multi-limb carry cascade across 250 digits
		const nines = '9'.repeat(250)
		assert.strictEqual(addDecimalRecursive(nines, '1', 0), '1' + '0'.repeat(250))

		// Deep fractional precision (120 digits)
		const tinyA = '0.' + '0'.repeat(119) + '7'
		const tinyB = '0.' + '0'.repeat(119) + '8'
		assert.strictEqual(
			addDecimalRecursive(tinyA, tinyB, 120),
			'0.' + '0'.repeat(118) + '15',
		)
	})

	test('handles negative numbers and mixed signs', () => {
		assert.strictEqual(addDecimalRecursive('-5', '-7'), '-12')
		assert.strictEqual(addDecimalRecursive('-10.5', '3.25'), '-7.25')
		assert.strictEqual(addDecimalRecursive('3.25', '-10.5'), '-7.25')
		assert.strictEqual(addDecimalRecursive('10.5', '-3.25'), '7.25')
		assert.strictEqual(addDecimalRecursive('-3.25', '10.5'), '7.25')
		assert.strictEqual(addDecimalRecursive('-42.125', '42.125'), '0')
		assert.strictEqual(addDecimalRecursive('42.125', '-42.125'), '0')
		assert.strictEqual(addDecimalRecursive('-0.1', '-0.2'), '-0.3')
		// Borrow cascade across limb boundaries (including chunk diff === -base)
		assert.strictEqual(addDecimalRecursive('100000000000', '-99990001'), '99900009999')
		assert.strictEqual(addDecimalRecursive('-100000000000', '99990001'), '-99900009999')
	})

	test('handles precision rounding and truncation', () => {
		// Default precision is 20
		assert.strictEqual(
			addDecimalRecursive('0.123456789012345678904', '0'),
			'0.1234567890123456789',
		)
		assert.strictEqual(
			addDecimalRecursive('0.123456789012345678905', '0'),
			'0.12345678901234567891',
		)

		// Half-away-from-zero for positive and negative values
		assert.strictEqual(addDecimalRecursive('1.2345', '0', 3), '1.235')
		assert.strictEqual(addDecimalRecursive('1.2344', '0', 3), '1.234')
		assert.strictEqual(addDecimalRecursive('-1.2345', '0', 3), '-1.235')
		assert.strictEqual(addDecimalRecursive('-1.2344', '0', 3), '-1.234')

		// Rounding carry propagation into integer part
		assert.strictEqual(addDecimalRecursive('9.995', '0', 2), '10')
		assert.strictEqual(addDecimalRecursive('-9.995', '0', 2), '-10')
		assert.strictEqual(addDecimalRecursive('0.9999', '0', 2), '1')

		// Precision = 0 rounds to integer
		assert.strictEqual(addDecimalRecursive('1.4', '0', 0), '1')
		assert.strictEqual(addDecimalRecursive('1.5', '0', 0), '2')
		assert.strictEqual(addDecimalRecursive('-1.5', '0', 0), '-2')
		assert.strictEqual(addDecimalRecursive('99999999999999999999999999999999.5', '0', 0), '100000000000000000000000000000000')

		// Rounding small negative value down to zero must not yield "-0"
		assert.strictEqual(addDecimalRecursive('-0.004', '0', 2), '0')
		assert.strictEqual(addDecimalRecursive('-0.4', '0', 0), '0')
	})

	test('handles edge cases', () => {
		assert.strictEqual(addDecimalRecursive('0', '0'), '0')
		assert.strictEqual(addDecimalRecursive('-0', '-0'), '0')
		assert.strictEqual(addDecimalRecursive('-0.000', '+0.0'), '0')
		assert.strictEqual(addDecimalRecursive('00000', '000.000'), '0')
		assert.strictEqual(addDecimalRecursive('100000000000000000000', '0.00000000000000000001', 20), '100000000000000000000.00000000000000000001')
		assert.strictEqual(addDecimalRecursive('0.00000000000000000001', '-100000000000000000000', 20), '-99999999999999999999.99999999999999999999')
	})

	test('rejects invalid inputs with appropriate errors', () => {
		// Non-string operands -> TypeError
		for (const bad of [123, null, undefined, {}, [], 10n, true]) {
			assert.throws(() => addDecimalRecursive(bad, '1'), TypeError)
			assert.throws(() => addDecimalRecursive('1', bad), TypeError)
		}

		// Malformed decimal strings -> RangeError
		for (const bad of ['', '   ', '.', '+', '-', '-.', '+.', 'abc', '1.2.3', 'NaN', 'Infinity', '1e5', '1_000', '1 2']) {
			assert.throws(() => addDecimalRecursive(bad, '1'), RangeError)
			assert.throws(() => addDecimalRecursive('1', bad), RangeError)
		}

		// Invalid precision -> TypeError / RangeError
		for (const badType of ['2', null, {}, []]) {
			assert.throws(() => addDecimalRecursive('1', '2', badType), TypeError)
		}
		for (const badRange of [-1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => addDecimalRecursive('1', '2', badRange), RangeError)
		}
	})

	test('cross-checks against independent BigInt scaled oracle', () => {
		const fixedCases = [
			['12345678901234567890123456789012345.678901234567890123456789012345', '98765432109876543210987654321098765.432109876543210987654321098765', 30],
			['-9999999999999999999999999999999999.999999999999999999999999999999', '0.000000000000000000000000000001', 35],
			['-5000000000000000000000000000000.0000000000000000000000000000005', '5000000000000000000000000000000.0000000000000000000000000000001', 30],
			['123456789012345678901234567890.9999999999999999999999999999995', '0', 10],
			['-0.00000000000000000000000000000049999', '0', 30],
		]

		for (const [a, b, p] of fixedCases) {
			assert.strictEqual(addDecimalRecursive(a, b, p), addDecimalBigIntOracle(a, b, p))
		}

		// Deterministic LCG pseudo-random fuzzing across wide digit lengths and precisions
		let seed = 0x12345678
		const nextRand = () => {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
			return seed
		}
		const randomDecimal = () => {
			const sign = nextRand() % 2 === 0 ? '' : '-'
			const intLen = 1 + (nextRand() % 45)
			const fracLen = nextRand() % 45
			let intStr = ''
			for (let i = 0; i < intLen; i++) intStr += String(nextRand() % 10)
			if (fracLen === 0) return sign + intStr
			let fracStr = ''
			for (let i = 0; i < fracLen; i++) fracStr += String(nextRand() % 10)
			return `${sign}${intStr}.${fracStr}`
		}

		for (let i = 0; i < 200; i++) {
			const a = randomDecimal()
			const b = randomDecimal()
			const p = nextRand() % 50
			const actual = addDecimalRecursive(a, b, p)
			const expected = addDecimalBigIntOracle(a, b, p)
			assert.strictEqual(
				actual,
				expected,
				`Mismatch on iteration ${i}: a=${a}, b=${b}, precision=${p}`,
			)
		}
	})
})
