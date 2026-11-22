import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { subtractDecimalIterative } from './subtractDecimalIterative.js'

/**
 * Independent reference implementation using BigInt scaled integers
 * to cross-check the iterative digit-by-digit implementation.
 *
 * @param {string} a
 * @param {string} b
 * @param {number} [precision]
 * @returns {string}
 */
function subtractViaBigInt(a, b, precision) {
	const split = (s) => {
		let sign = 1n
		let body = s
		if (body.startsWith('-')) {
			sign = -1n
			body = body.slice(1)
		} else if (body.startsWith('+')) {
			body = body.slice(1)
		}
		const dot = body.indexOf('.')
		const intStr = dot === -1 ? body : body.slice(0, dot) || '0'
		const fracStr = dot === -1 ? '' : body.slice(dot + 1)
		return { sign, intStr, fracStr }
	}

	const pa = split(a)
	const pb = split(b)
	const scale = Math.max(pa.fracStr.length, pb.fracStr.length)

	const toScaled = (p) => {
		const digits = p.intStr + p.fracStr.padEnd(scale, '0')
		return p.sign * BigInt(digits)
	}

	let diff = toScaled(pa) - toScaled(pb)
	if (diff === 0n) {
		return '0'
	}

	let effectiveScale = scale
	if (precision !== undefined && precision < scale) {
		const drop = scale - precision
		const divisor = 10n ** BigInt(drop)
		const half = divisor / 2n
		const isNeg = diff < 0n
		const absDiff = isNeg ? -diff : diff
		const quotient = absDiff / divisor
		const remainder = absDiff % divisor
		const roundedAbs = remainder >= half ? quotient + 1n : quotient
		diff = isNeg ? -roundedAbs : roundedAbs
		effectiveScale = precision
	}

	if (diff === 0n) {
		return '0'
	}

	const isNeg = diff < 0n
	const absStr = (isNeg ? -diff : diff).toString()

	let intPart
	let fracPart
	if (effectiveScale === 0) {
		intPart = absStr
		fracPart = ''
	} else {
		const padded = absStr.padStart(effectiveScale + 1, '0')
		intPart = padded.slice(0, padded.length - effectiveScale)
		fracPart = padded.slice(padded.length - effectiveScale).replace(/0+$/, '')
	}

	return `${isNeg ? '-' : ''}${intPart}${fracPart ? `.${fracPart}` : ''}`
}

describe('subtractDecimalIterative', () => {
	test('handles normal decimal subtraction including floating-point pitfalls', () => {
		assert.equal(subtractDecimalIterative('0.3', '0.1'), '0.2')
		assert.equal(subtractDecimalIterative('1.0', '0.9'), '0.1')
		assert.equal(subtractDecimalIterative('10.5', '3.25'), '7.25')
		assert.equal(subtractDecimalIterative('0.1', '0.3'), '-0.2')
		assert.equal(subtractDecimalIterative('123.456', '23.456'), '100')
		assert.equal(subtractDecimalIterative('.5', '.25'), '0.25')
		assert.equal(subtractDecimalIterative('5.', '.5'), '4.5')
		assert.equal(subtractDecimalIterative('00012.3400', '00002.3400'), '10')
	})

	test('handles borrows across decimal points and carries across digit boundaries', () => {
		assert.equal(subtractDecimalIterative('100', '0.001'), '99.999')
		assert.equal(subtractDecimalIterative('1000.0001', '999.9999'), '0.0002')
		assert.equal(subtractDecimalIterative('1', '0.999999999999'), '0.000000000001')
		assert.equal(subtractDecimalIterative('9.99', '-0.01'), '10')
		assert.equal(subtractDecimalIterative('-9.99', '0.01'), '-10')
		assert.equal(subtractDecimalIterative('0.001', '100'), '-99.999')
	})

	test('handles all sign combinations', () => {
		assert.equal(subtractDecimalIterative('+5.5', '+2.25'), '3.25')
		assert.equal(subtractDecimalIterative('5.5', '-2.25'), '7.75')
		assert.equal(subtractDecimalIterative('+5.5', '-2.25'), '7.75')
		assert.equal(subtractDecimalIterative('-5.5', '2.25'), '-7.75')
		assert.equal(subtractDecimalIterative('-5.5', '+2.25'), '-7.75')
		assert.equal(subtractDecimalIterative('-5.5', '-2.25'), '-3.25')
		assert.equal(subtractDecimalIterative('-2.25', '-5.5'), '3.25')
		assert.equal(subtractDecimalIterative('-0.1', '-0.3'), '0.2')
	})

	test('handles very large numbers (>50 digits)', () => {
		const bigPow10 = `1${'0'.repeat(60)}`
		const sixtyNines = '9'.repeat(60)
		assert.equal(subtractDecimalIterative(bigPow10, '1'), sixtyNines)
		assert.equal(subtractDecimalIterative('1', bigPow10), `-${sixtyNines}`)

		const a = `${'9'.repeat(55)}.${'1'.repeat(60)}`
		const b = `${'8'.repeat(55)}.${'9'.repeat(60)}`
		const expected = `${'1'.repeat(54)}0.${'1'.repeat(59)}2`
		assert.equal(subtractDecimalIterative(a, b), expected)

		const highFracA = `1.${'0'.repeat(60)}5`
		const highFracB = `0.${'0'.repeat(60)}7`
		assert.equal(subtractDecimalIterative(highFracA, highFracB), `0.${'9'.repeat(60)}8`)
	})

	test('handles configurable fractional precision rounding', () => {
		assert.equal(subtractDecimalIterative('1.234', '0', 2), '1.23')
		assert.equal(subtractDecimalIterative('1.235', '0', 2), '1.24')
		assert.equal(subtractDecimalIterative('1.236', '0', 2), '1.24')
		assert.equal(subtractDecimalIterative('-1.234', '0', 2), '-1.23')
		assert.equal(subtractDecimalIterative('-1.235', '0', 2), '-1.24')
		assert.equal(subtractDecimalIterative('9.996', '0.001', 2), '10')
		assert.equal(subtractDecimalIterative('-9.996', '-0.001', 2), '-10')
		assert.equal(subtractDecimalIterative('2.6', '0.1', 0), '3')
		assert.equal(subtractDecimalIterative('2.4', '0', 0), '2')
		assert.equal(subtractDecimalIterative('-2.5', '0', 0), '-3')
		assert.equal(subtractDecimalIterative('-0.004', '0', 2), '0')
		assert.equal(subtractDecimalIterative('0.004', '0', 2), '0')
		assert.equal(subtractDecimalIterative('-0.005', '0', 2), '-0.01')
		assert.equal(subtractDecimalIterative('0.3', '0.1', 10), '0.2')
	})

	test('handles zero and identity (a - a = "0") edge cases', () => {
		assert.equal(subtractDecimalIterative('0', '0'), '0')
		assert.equal(subtractDecimalIterative('-0', '0'), '0')
		assert.equal(subtractDecimalIterative('0', '-0'), '0')
		assert.equal(subtractDecimalIterative('-0.000', '+0.00'), '0')
		assert.equal(subtractDecimalIterative('0', '5.25'), '-5.25')
		assert.equal(subtractDecimalIterative('5.25', '0'), '5.25')
		assert.equal(subtractDecimalIterative('0', '-5.25'), '5.25')

		const identities = [
			'0',
			'42',
			'-42',
			'0.000001',
			'-123456.7890123456789',
			`${'7'.repeat(65)}.${'3'.repeat(65)}`,
			`-${'8'.repeat(65)}.${'2'.repeat(65)}`,
		]
		for (const val of identities) {
			assert.equal(subtractDecimalIterative(val, val), '0')
			assert.equal(subtractDecimalIterative(val, val, 0), '0')
			assert.equal(subtractDecimalIterative(val, val, 5), '0')
		}
	})

	test('validates invalid inputs strictly', () => {
		// Non-string operands -> TypeError
		for (const bad of [123, null, undefined, {}, [], true, 10n]) {
			assert.throws(() => subtractDecimalIterative(bad, '1'), TypeError)
			assert.throws(() => subtractDecimalIterative('1', bad), TypeError)
		}

		// Malformed decimal strings -> RangeError
		const malformed = [
			'',
			' ',
			' 1.2',
			'1.2 ',
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
			'1_000',
			'abc',
			'--1',
			'++1',
		]
		for (const bad of malformed) {
			assert.throws(() => subtractDecimalIterative(bad, '1'), RangeError)
			assert.throws(() => subtractDecimalIterative('1', bad), RangeError)
		}

		// Invalid precision -> TypeError / RangeError
		for (const badType of ['2', null, {}, [], true, 2n]) {
			assert.throws(() => subtractDecimalIterative('1', '2', badType), TypeError)
		}
		for (const badRange of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => subtractDecimalIterative('1', '2', badRange), RangeError)
		}
	})

	test('cross-checks against independent BigInt scaled integer computation', () => {
		const cases = [
			['0.3', '0.1', undefined],
			['1000000000000000000000000000000000000000000000000000.0000000001', '999999999999999999999999999999999999999999999999999.9999999999', undefined],
			['-9876543210987654321098765432109876543210987654321098765.1234567890123456789012345', '1234567890123456789012345678901234567890123456789012345.9876543210987654321098765', undefined],
			['-9876543210987654321098765432109876543210987654321098765.1234567890123456789012345', '1234567890123456789012345678901234567890123456789012345.9876543210987654321098765', 10],
			['-9876543210987654321098765432109876543210987654321098765.1234567890123456789012345', '1234567890123456789012345678901234567890123456789012345.9876543210987654321098765', 0],
			['0.000000000000000000000000000000000000000000000000000012345', '-0.000000000000000000000000000000000000000000000000000087655', undefined],
			['99999999999999999999999999999999999999999999999999999.9995', '0', 3],
			['-0.00005', '0', 4],
			['-0.000049999999999999999999', '0', 4],
		]

		for (const [a, b, prec] of cases) {
			assert.equal(
				subtractDecimalIterative(a, b, prec),
				subtractViaBigInt(a, b, prec),
				`Mismatch for (${a}) - (${b}) with precision=${prec}`,
			)
		}

		// Deterministic pseudo-random sweep across 100 pairs of up to 70-digit decimals
		let seed = 0x5f3759df
		const nextRand = () => {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
			return seed
		}
		const makeDecimal = () => {
			const sign = nextRand() % 2 === 0 ? '' : '-'
			const intLen = 1 + (nextRand() % 65)
			const fracLen = nextRand() % 40
			let intStr = ''
			for (let i = 0; i < intLen; i++) {
				intStr += String(nextRand() % 10)
			}
			let fracStr = ''
			for (let i = 0; i < fracLen; i++) {
				fracStr += String(nextRand() % 10)
			}
			return fracLen > 0 ? `${sign}${intStr}.${fracStr}` : `${sign}${intStr}`
		}

		for (let i = 0; i < 100; i++) {
			const a = makeDecimal()
			const b = makeDecimal()
			assert.equal(subtractDecimalIterative(a, b), subtractViaBigInt(a, b))
			const prec = nextRand() % 20
			assert.equal(subtractDecimalIterative(a, b, prec), subtractViaBigInt(a, b, prec))
		}
	})
})
