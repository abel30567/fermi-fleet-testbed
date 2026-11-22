import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { productDecimalRecursive } from './productDecimalRecursive.js'

describe('productDecimalRecursive', () => {
	describe('normal cases', () => {
		test('multiplies integers including values beyond Number.MAX_SAFE_INTEGER', () => {
			assert.equal(productDecimalRecursive(['2', '3', '4', '5']), '120')
			assert.equal(
				productDecimalRecursive(['9007199254740993', '9007199254740995']),
				'81129638414606717724586024108035',
			)
		})

		test('multiplies decimals without IEEE 754 floating-point drift', () => {
			assert.equal(productDecimalRecursive(['0.1', '0.2']), '0.02')
			assert.equal(productDecimalRecursive(['1.25', '0.8']), '1')
			assert.equal(productDecimalRecursive(['2.5', '4.00', '0.1']), '1')
			assert.equal(productDecimalRecursive(['12.34', '56.78', '0.01']), '7.006652')
		})

		test('handles negative and signed decimal inputs correctly', () => {
			assert.equal(productDecimalRecursive(['-2', '3', '4']), '-24')
			assert.equal(productDecimalRecursive(['-2', '-3', '4']), '24')
			assert.equal(productDecimalRecursive(['-1.5', '-2.5', '-0.4']), '-1.5')
			assert.equal(productDecimalRecursive(['+1.5', '+2.0', '-3.25']), '-9.75')
			assert.equal(productDecimalRecursive(['-.5', '.5']), '-0.25')
			assert.equal(productDecimalRecursive(['5.', '-2.']), '-10')
		})

		test('preserves high precision beyond 25 decimal digits', () => {
			// 0.5^30 = 2^-30 has an exact 30-digit decimal expansion
			const thirtyHalves = Array.from({ length: 30 }, () => '0.5')
			assert.equal(
				productDecimalRecursive(thirtyHalves, 30),
				'0.000000000931322574615478515625',
			)

			// (1 + 10^-30)^2 = 1 + 2*10^-30 + 10^-60
			const a = '1.000000000000000000000000000001'
			assert.equal(
				productDecimalRecursive([a, a], 60),
				'1.000000000000000000000000000002000000000000000000000000000001',
			)

			// 32-digit * 32-digit product truncated/rounded at 40 digits
			assert.equal(
				productDecimalRecursive(
					['0.00000000000000000001', '0.00000000000000000001'],
					40,
				),
				'0.0000000000000000000000000000000000000001',
			)
		})

		test('respects configurable precision and round-half-away-from-zero semantics', () => {
			// Exact product is 0.123456789 * 1 = 0.123456789
			assert.equal(productDecimalRecursive(['0.123456789'], 0), '0')
			assert.equal(productDecimalRecursive(['0.123456789'], 2), '0.12')
			assert.equal(productDecimalRecursive(['0.123456789'], 4), '0.1235')
			assert.equal(productDecimalRecursive(['0.123456789'], 9), '0.123456789')
			assert.equal(productDecimalRecursive(['0.123456789'], 30), '0.123456789')

			// Exact ties round half away from zero
			assert.equal(productDecimalRecursive(['1.25', '1'], 1), '1.3')
			assert.equal(productDecimalRecursive(['-1.25', '1'], 1), '-1.3')
			assert.equal(productDecimalRecursive(['2.5', '1'], 0), '3')
			assert.equal(productDecimalRecursive(['-2.5', '1'], 0), '-3')

			// Carry across decimal boundary and strip trailing zeros
			assert.equal(productDecimalRecursive(['0.999', '1'], 2), '1')
			assert.equal(productDecimalRecursive(['-0.999', '1'], 2), '-1')

			// Negative value rounding down to zero must produce "0", never "-0"
			assert.equal(productDecimalRecursive(['-0.004', '1'], 2), '0')
			assert.equal(productDecimalRecursive(['-0.000000000000000000001', '1']), '0')
		})
	})

	describe('edge cases', () => {
		test('empty product returns "1"', () => {
			assert.equal(productDecimalRecursive([]), '1')
			assert.equal(productDecimalRecursive([], 0), '1')
			assert.equal(productDecimalRecursive([], 50), '1')
		})

		test('single element normalizes and respects precision', () => {
			assert.equal(productDecimalRecursive(['42']), '42')
			assert.equal(productDecimalRecursive(['+007.5000']), '7.5')
			assert.equal(productDecimalRecursive(['-0.00']), '0')
			assert.equal(productDecimalRecursive(['3.14159'], 3), '3.142')
		})

		test('any zero factor yields "0" regardless of position or signs', () => {
			assert.equal(productDecimalRecursive(['0']), '0')
			assert.equal(productDecimalRecursive(['-0']), '0')
			assert.equal(productDecimalRecursive(['0.00000']), '0')
			assert.equal(productDecimalRecursive(['0', '123.45', '-67.89']), '0')
			assert.equal(productDecimalRecursive(['123.45', '-0.0', '-67.89']), '0')
			assert.equal(productDecimalRecursive(['123.45', '-67.89', '+0']), '0')
		})

		test('handles odd and even array lengths consistently across tree shapes', () => {
			for (let len = 1; len <= 17; len += 1) {
				const factors = Array.from({ length: len }, () => '1.1')
				const expected = (11n ** BigInt(len)).toString().padStart(len + 1, '0')
				const intPart = expected.slice(0, expected.length - len)
				const fracPart = expected.slice(expected.length - len)
				assert.equal(productDecimalRecursive(factors, len), `${intPart}.${fracPart}`)
			}
		})

		test('throws on invalid inputs including invalid elements after zero', () => {
			assert.throws(() => productDecimalRecursive(null), TypeError)
			assert.throws(() => productDecimalRecursive(undefined), TypeError)
			assert.throws(() => productDecimalRecursive('123'), TypeError)
			assert.throws(() => productDecimalRecursive({ 0: '1' }), TypeError)

			assert.throws(() => productDecimalRecursive([123]), TypeError)
			assert.throws(() => productDecimalRecursive(['1', null]), TypeError)
			assert.throws(() => productDecimalRecursive(['1', undefined]), TypeError)

			const badDecimals = [
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
				' 1.5',
				'1.5 ',
				'1_000',
				'abc',
			]
			for (const bad of badDecimals) {
				assert.throws(
					() => productDecimalRecursive(['2', bad]),
					RangeError,
					`Expected RangeError for "${bad}"`,
				)
			}

			// Must validate all elements even when an earlier element is "0"
			assert.throws(() => productDecimalRecursive(['0', 'not-a-number']), RangeError)
			assert.throws(() => productDecimalRecursive(['0', 42]), TypeError)

			// Invalid precision values
			assert.throws(() => productDecimalRecursive(['1'], -1), RangeError)
			assert.throws(() => productDecimalRecursive(['1'], 1.5), RangeError)
			assert.throws(() => productDecimalRecursive(['1'], Number.NaN), RangeError)
			assert.throws(() => productDecimalRecursive(['1'], Number.POSITIVE_INFINITY), RangeError)
			assert.throws(() => productDecimalRecursive(['1'], Number.NEGATIVE_INFINITY), RangeError)
			assert.throws(() => productDecimalRecursive(['1'], '20'), TypeError)
			assert.throws(() => productDecimalRecursive(['1'], null), TypeError)
		})
	})

	describe('cross-checks against independent computations', () => {
		test('factorial identity: 1 * 2 * ... * 50 === 50!', () => {
			const n = 50
			const factors = Array.from({ length: n }, (_, i) => String(i + 1))

			let expectedFactorial = 1n
			for (let i = 2n; i <= BigInt(n); i += 1n) {
				expectedFactorial *= i
			}

			assert.equal(productDecimalRecursive(factors), expectedFactorial.toString())
		})

		test('telescoping product: (2/1)*(3/2)*...*(20/19) === 20 at high precision', () => {
			// Compute each ratio (k+1)/k to 60 decimal places independently via BigInt division
			const factorScale = 60
			const factorScalePow = 10n ** BigInt(factorScale)
			const ratios = []
			for (let k = 1; k <= 19; k += 1) {
				const num = BigInt(k + 1) * factorScalePow
				const den = BigInt(k)
				const q = num / den
				const rem = num % den
				const rounded = rem * 2n >= den ? q + 1n : q
				const raw = rounded.toString().padStart(factorScale + 1, '0')
				const intPart = raw.slice(0, raw.length - factorScale)
				const fracPart = raw.slice(raw.length - factorScale)
				ratios.push(`${intPart}.${fracPart}`)
			}

			// With 60 digits per factor, the product of 19 ratios is accurate well past 40 digits
			assert.equal(productDecimalRecursive(ratios, 40), '20')
		})

		test('matches independent iterative BigInt decimal product oracle', () => {
			const values = [
				'3.14159265358979323846',
				'-2.71828182845904523536',
				'1.4142135623730950488',
				'0.5772156649015328606',
				'-12345.6789012345',
				'0.00000987654321',
				'7',
				'-0.125',
				'1000000000000000000001.000001',
				'0.333333333333333333333333333333',
				'-1.000000000000000000000000001',
			]

			// Independent left-to-right iterative BigInt product oracle
			let accDigits = 1n
			let accScale = 0
			for (const str of values) {
				const neg = str.startsWith('-')
				const body = neg || str.startsWith('+') ? str.slice(1) : str
				const dot = body.indexOf('.')
				const scale = dot === -1 ? 0 : body.length - dot - 1
				const digits = BigInt(body.replace('.', '')) * (neg ? -1n : 1n)
				accDigits *= digits
				accScale += scale
			}

			function formatOracle(digits, scale, precision) {
				if (digits === 0n) return '0'
				const neg = digits < 0n
				let abs = neg ? -digits : digits
				let s = scale
				if (s > precision) {
					const d = 10n ** BigInt(s - precision)
					abs = abs / d + ((abs % d) * 2n >= d ? 1n : 0n)
					s = precision
				}
				if (abs === 0n) return '0'
				const raw = abs.toString().padStart(s + 1, '0')
				const intPart = s === 0 ? raw : raw.slice(0, raw.length - s)
				const fracPart = s === 0 ? '' : raw.slice(raw.length - s).replace(/0+$/, '')
				return `${neg ? '-' : ''}${intPart}${fracPart ? `.${fracPart}` : ''}`
			}

			for (const precision of [0, 5, 20, 35, 60]) {
				assert.equal(
					productDecimalRecursive(values, precision),
					formatOracle(accDigits, accScale, precision),
				)
			}
		})
	})
})
