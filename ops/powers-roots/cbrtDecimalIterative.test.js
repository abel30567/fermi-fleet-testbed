import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { cbrtDecimalIterative } from './cbrtDecimalIterative.js'

/**
 * Parses a plain decimal string (no scientific notation) into `{ value, scale }`
 * where the exact rational value is `value / 10^scale`.
 */
function parsePlainDecimal(str) {
	const negative = str.startsWith('-')
	const body = negative || str.startsWith('+') ? str.slice(1) : str
	const dot = body.indexOf('.')
	const scale = dot === -1 ? 0 : body.length - dot - 1
	const digits = dot === -1 ? body : body.slice(0, dot) + body.slice(dot + 1)
	const magnitude = BigInt(digits)
	return { value: negative ? -magnitude : magnitude, scale }
}

/**
 * Independent BigInt cross-check: verifies that the returned decimal `y` at
 * `precision` satisfies `(y - 0.5 * 10^-p)^3 <= x <= (y + 0.5 * 10^-p)^3`
 * in exact rational arithmetic (scaled by 8 * 10^(maxScale)).
 */
function assertRoundedCubeRootBracket(inputStr, precision) {
	const resultStr = cbrtDecimalIterative(inputStr, precision)
	const x = parsePlainDecimal(inputStr)
	const y = parsePlainDecimal(resultStr)

	assert.ok(y.scale <= precision, `result "${resultStr}" exceeded precision ${precision}`)

	// Express y as yScaled / 10^precision
	const yScaled = y.value * (10n ** BigInt(precision - y.scale))
	const lowNum = 2n * yScaled - 1n // (y - 0.5 * 10^-p) * 2 * 10^p
	const highNum = 2n * yScaled + 1n // (y + 0.5 * 10^-p) * 2 * 10^p

	// Compare lowNum^3 / (8 * 10^(3p)) <= x.value / 10^(x.scale) <= highNum^3 / (8 * 10^(3p))
	const expDiff = 3 * precision - x.scale
	let lowCubed = lowNum * lowNum * lowNum
	let highCubed = highNum * highNum * highNum
	let xScaled = 8n * x.value

	if (expDiff >= 0) {
		xScaled *= 10n ** BigInt(expDiff)
	} else {
		const factor = 10n ** BigInt(-expDiff)
		lowCubed *= factor
		highCubed *= factor
	}

	assert.ok(
		lowCubed <= xScaled && xScaled <= highCubed,
		`Bracket check failed for cbrt("${inputStr}", ${precision}) = "${resultStr}"`
	)
}

describe('cbrtDecimalIterative', () => {
	test('computes exact perfect cubes (positive and negative)', () => {
		assert.equal(cbrtDecimalIterative('1'), '1')
		assert.equal(cbrtDecimalIterative('8'), '2')
		assert.equal(cbrtDecimalIterative('27'), '3')
		assert.equal(cbrtDecimalIterative('64'), '4')
		assert.equal(cbrtDecimalIterative('125'), '5')
		assert.equal(cbrtDecimalIterative('1000'), '10')
		assert.equal(cbrtDecimalIterative('+27'), '3')

		assert.equal(cbrtDecimalIterative('-1'), '-1')
		assert.equal(cbrtDecimalIterative('-8'), '-2')
		assert.equal(cbrtDecimalIterative('-27'), '-3')
		assert.equal(cbrtDecimalIterative('-1728'), '-12')
		assert.equal(cbrtDecimalIterative('-1000000000000000000000000000'), '-1000000000')
	})

	test('handles very large arbitrary-precision perfect cubes', () => {
		const root = 123456789012345678901234567890n
		const cube = (root * root * root).toString()
		assert.equal(cbrtDecimalIterative(cube, 10), root.toString())
		assert.equal(cbrtDecimalIterative(`-${cube}`, 10), `-${root.toString()}`)
	})

	test('computes fractional and scientific-notation inputs', () => {
		assert.equal(cbrtDecimalIterative('0.125'), '0.5')
		assert.equal(cbrtDecimalIterative('-0.125'), '-0.5')
		assert.equal(cbrtDecimalIterative('.125'), '0.5')
		assert.equal(cbrtDecimalIterative('27.'), '3')
		assert.equal(cbrtDecimalIterative('0.000000001'), '0.001')
		assert.equal(cbrtDecimalIterative('0.000027'), '0.03')
		assert.equal(cbrtDecimalIterative('1e-9'), '0.001')
		assert.equal(cbrtDecimalIterative('-1.25e-1'), '-0.5')
		assert.equal(cbrtDecimalIterative('1.728e3'), '12')
		assert.equal(cbrtDecimalIterative(' 27.000 '), '3')
	})

	test('matches known high-precision reference digits of cbrt(2)', () => {
		// Known reference: cbrt(2) = 1.259921049894873164767210607278228350570251464701507980081975...
		assert.equal(cbrtDecimalIterative('2'), '1.25992104989487316477')
		assert.equal(
			cbrtDecimalIterative('2', 40),
			'1.2599210498948731647672106072782283505703'
		)
		assert.equal(
			cbrtDecimalIterative('2', 50),
			'1.25992104989487316476721060727822835057025146470151'
		)
		assert.equal(
			cbrtDecimalIterative('-2', 50),
			'-1.25992104989487316476721060727822835057025146470151'
		)
	})

	test('handles zero, negative zero, and tiny inputs', () => {
		assert.equal(cbrtDecimalIterative('0'), '0')
		assert.equal(cbrtDecimalIterative('-0'), '0')
		assert.equal(cbrtDecimalIterative('+0'), '0')
		assert.equal(cbrtDecimalIterative('0.00000'), '0')
		assert.equal(cbrtDecimalIterative('-0.0'), '0')
		assert.equal(cbrtDecimalIterative('0e100'), '0')
		assert.equal(cbrtDecimalIterative('1e-1000', 20), '0')
		assert.equal(cbrtDecimalIterative('-1e-1000', 20), '0')
	})

	test('handles precision = 0 and rounding boundaries', () => {
		assert.equal(cbrtDecimalIterative('2', 0), '1')
		assert.equal(cbrtDecimalIterative('7', 0), '2')
		assert.equal(cbrtDecimalIterative('-7', 0), '-2')
		assert.equal(cbrtDecimalIterative('0.125', 0), '1') // exact 0.5 rounds half away from zero
		assert.equal(cbrtDecimalIterative('-0.125', 0), '-1')
		assert.equal(cbrtDecimalIterative('0.124999999', 0), '0')
		assert.equal(cbrtDecimalIterative('-0.124999999', 0), '0') // never "-0"
		assert.equal(cbrtDecimalIterative('0.2', 0), '1')
	})

	test('cross-checks results by cubing in exact BigInt arithmetic', () => {
		const cases = [
			['2', 0],
			['2', 10],
			['2', 45],
			['3', 35],
			['-3', 35],
			['10', 30],
			['0.5', 40],
			['-0.5', 40],
			['0.0000007', 30],
			['123456.789012345', 25],
			['-999999999999999999999.123456789', 25],
			['0.0000000000000000000123456', 10],
		]

		for (const [input, prec] of cases) {
			assertRoundedCubeRootBracket(input, prec)
		}
	})

	test('validates inputs and throws descriptive errors', () => {
		// Non-string value -> TypeError
		for (const badValue of [null, undefined, 8, 8n, {}, [], true]) {
			assert.throws(() => cbrtDecimalIterative(badValue), TypeError)
		}

		// Malformed decimal string -> RangeError
		for (const badString of [
			'',
			'   ',
			'.',
			'+.',
			'-.',
			'abc',
			'NaN',
			'Infinity',
			'-Infinity',
			'1.2.3',
			'1e',
			'1e+',
			'1e1.5',
			'1_000',
			'0x8',
			'1 2',
		]) {
			assert.throws(() => cbrtDecimalIterative(badString), RangeError)
		}

		// Invalid precision types -> TypeError
		for (const badPrec of ['20', null, NaN, {}, []]) {
			assert.throws(() => cbrtDecimalIterative('8', badPrec), TypeError)
		}

		// Out-of-range precision -> RangeError
		for (const badPrec of [-1, -100, 1.5, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => cbrtDecimalIterative('8', badPrec), RangeError)
		}
	})
})
