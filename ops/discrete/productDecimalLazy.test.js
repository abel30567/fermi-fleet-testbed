import { describe, test } from 'node:test'
import assert from 'node:assert'
import { productDecimalLazy } from './productDecimalLazy.js'

describe('productDecimalLazy', () => {
	test('computes basic integer and decimal products', () => {
		assert.strictEqual(productDecimalLazy(['2', '3', '4']), '24')
		assert.strictEqual(productDecimalLazy(['1.5', '2.5']), '3.75')
		assert.strictEqual(productDecimalLazy(['0.1', '0.2']), '0.02')
		assert.strictEqual(productDecimalLazy(['2.5', '0.4']), '1')
		assert.strictEqual(productDecimalLazy(['1.2500', '2.00']), '2.5')
	})

	test('supports scientific notation, leading signs, optional digits around dot, and whitespace', () => {
		assert.strictEqual(productDecimalLazy(['1.5e-20', '2e20']), '3')
		assert.strictEqual(productDecimalLazy(['+12.5', ' 4 ', '1E+2']), '5000')
		assert.strictEqual(productDecimalLazy(['.5', '5.']), '2.5')
		assert.strictEqual(productDecimalLazy(['.25e2', '4.e-1']), '10')
	})

	test('handles empty sequences and single-element sequences', () => {
		function* emptyGen() {}

		assert.strictEqual(productDecimalLazy([]), '1')
		assert.strictEqual(productDecimalLazy(emptyGen()), '1')
		assert.strictEqual(productDecimalLazy(new Set()), '1')
		assert.strictEqual(productDecimalLazy(['-42.125']), '-42.125')
		assert.strictEqual(productDecimalLazy(['3.14159265'], 4), '3.1416')
	})

	test('applies configurable precision with round-half-to-even (banker\'s rounding)', () => {
		// Ties to even at precision 0
		assert.strictEqual(productDecimalLazy(['2.5', '1'], 0), '2')
		assert.strictEqual(productDecimalLazy(['3.5', '1'], 0), '4')
		assert.strictEqual(productDecimalLazy(['-2.5', '1'], 0), '-2')
		assert.strictEqual(productDecimalLazy(['-3.5', '1'], 0), '-4')
		assert.strictEqual(productDecimalLazy(['0.5', '1'], 0), '0')
		assert.strictEqual(productDecimalLazy(['1.5', '1'], 0), '2')

		// Ties to even at fractional precision
		assert.strictEqual(productDecimalLazy(['1.225', '1'], 2), '1.22')
		assert.strictEqual(productDecimalLazy(['1.235', '1'], 2), '1.24')
		assert.strictEqual(productDecimalLazy(['1.23456', '2.34567'], 4), '2.8959')
		assert.strictEqual(productDecimalLazy(['1.999', '1'], 2), '2')
		assert.strictEqual(productDecimalLazy(['0.33333333333333333333', '0.33333333333333333333'], 10), '0.1111111111')
	})

	test('handles negative numbers and normalizes negative zero to "0"', () => {
		assert.strictEqual(productDecimalLazy(['-2', '3', '4']), '-24')
		assert.strictEqual(productDecimalLazy(['-2', '-3', '4']), '24')
		assert.strictEqual(productDecimalLazy(['-2', '-3', '-4']), '-24')
		assert.strictEqual(productDecimalLazy(['-0', '5']), '0')
		assert.strictEqual(productDecimalLazy(['-5', '0.000']), '0')
		assert.strictEqual(productDecimalLazy(['-0.0001', '0.0001'], 2), '0')
	})

	test('consumes lazy generators and custom iterables without materializing', () => {
		let pulled = 0
		function* lazyFactors() {
			const data = ['1.1', '2.2', '3.3', '4.4']
			for (const item of data) {
				pulled += 1
				yield item
			}
		}

		assert.strictEqual(productDecimalLazy(lazyFactors(), 10), '35.1384')
		assert.strictEqual(pulled, 4)

		const mapValues = new Map([
			['a', '1.5'],
			['b', '2'],
			['c', '3.5'],
		]).values()
		assert.strictEqual(productDecimalLazy(mapValues), '10.5')

		let nextCalls = 0
		const singlePassIterable = {
			[Symbol.iterator]() {
				const items = ['2.5', '4', '0.5']
				let idx = 0
				return {
					next() {
						nextCalls += 1
						if (idx < items.length) {
							return { value: items[idx++], done: false }
						}
						return { value: undefined, done: true }
					},
				}
			},
		}
		assert.strictEqual(productDecimalLazy(singlePassIterable), '5')
		assert.strictEqual(nextCalls, 4)
	})

	test('short-circuits immediately on zero, runs generator cleanup, and handles infinite streams', () => {
		let pulled = 0
		let cleanedUp = false

		function* infiniteWithZero() {
			try {
				pulled += 1
				yield '12345678901234567890.12345'
				pulled += 1
				yield '0.000e5'
				while (true) {
					pulled += 1
					yield '999'
				}
			} finally {
				cleanedUp = true
			}
		}

		assert.strictEqual(productDecimalLazy(infiniteWithZero()), '0')
		assert.strictEqual(pulled, 2)
		assert.strictEqual(cleanedUp, true)

		// Zero at first position never pulls a throwing second step
		function* zeroThenThrow() {
			yield '-0'
			throw new Error('Should not be evaluated after zero')
		}
		assert.strictEqual(productDecimalLazy(zeroThenThrow()), '0')
	})

	test('preserves arbitrary high precision beyond IEEE 754 float64 limits', () => {
		const a = '123456789012345678901234567890.00000000000000000001'
		const b = '987654321098765432109876543210.00000000000000000002'
		// Independent BigInt computation at scale 10^20 * 10^20 = 10^40
		const aInt = 12345678901234567890123456789000000000000000000001n
		const bInt = 98765432109876543210987654321000000000000000000002n
		const prodStr = (aInt * bInt).toString()
		const expected = `${prodStr.slice(0, -40)}.${prodStr.slice(-40)}`

		assert.strictEqual(productDecimalLazy([a, b], 40), expected)

		// Very small product at high precision
		assert.strictEqual(
			productDecimalLazy(['1e-50', '1e-50'], 100),
			`0.${'0'.repeat(99)}1`,
		)
	})

	test('handles extreme exponents and long streaming reciprocals cleanly', () => {
		// Tiny underflow rounds to 0 without allocating huge powers of 10
		assert.strictEqual(productDecimalLazy(['1e-1000000', '1e-1000000'], 20), '0')

		// Cancelling extreme exponents
		assert.strictEqual(productDecimalLazy(['1e1000000', '1e-1000000', '7.5'], 5), '7.5')

		// Long stream of exact reciprocals (2.5 * 0.4 = 1 repeated 500 times)
		function* reciprocals(pairs) {
			for (let i = 0; i < pairs; i += 1) {
				yield '2.5'
				yield '0.4'
			}
		}
		assert.strictEqual(productDecimalLazy(reciprocals(500), 10), '1')
	})

	test('validates inputs and throws appropriate TypeError / RangeError', () => {
		// Invalid values container
		for (const badValues of [null, undefined, 123, true, {}, '123']) {
			assert.throws(() => productDecimalLazy(badValues), TypeError)
		}

		// Invalid precision types
		for (const badPrecision of [null, '10', {}, true, 10n]) {
			assert.throws(() => productDecimalLazy(['1'], badPrecision), TypeError)
		}

		// Invalid precision ranges
		for (const badPrecision of [-1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => productDecimalLazy(['1'], badPrecision), RangeError)
		}

		// Non-string elements in sequence
		for (const badSeq of [[1, 2], ['1', null], ['1', undefined], ['1', 2n], ['1', {}]]) {
			assert.throws(() => productDecimalLazy(badSeq), TypeError)
		}

		// Malformed decimal strings
		for (const badStr of ['', '   ', 'abc', 'NaN', 'Infinity', '-Infinity', '1.2.3', '.', '+.', 'e5', '1e', '1e+', '1_000', '0x10', '1 2']) {
			assert.throws(() => productDecimalLazy(['2', badStr]), RangeError)
		}

		// Exponent overflow
		assert.throws(() => productDecimalLazy(['1e99999999999999999999']), RangeError)
		assert.throws(
			() => productDecimalLazy([`1e${Number.MAX_SAFE_INTEGER}`, '1e10']),
			RangeError,
		)
	})

	test('independent cross-check: factorial identity and exact BigInt fixed-point oracle', () => {
		// Cross-check 1: prod_{k=1..35} k == 35! computed independently with BigInt
		let expectedFactorial = 1n
		for (let k = 1n; k <= 35n; k += 1n) {
			expectedFactorial *= k
		}
		function* rangeStrings(n) {
			for (let k = 1; k <= n; k += 1) {
				yield String(k)
			}
		}
		assert.strictEqual(productDecimalLazy(rangeStrings(35), 0), expectedFactorial.toString())

		// Cross-check 2: Telescoping product prod_{k=1..25} ((k+1)/k) == 26
		// Using exact decimal reciprocals via powers of 2 and 5:
		// prod_{k=1..12} (2^k / 5^k) * prod_{k=1..12} (5^k / 2^k) == 1
		function* telescopingPowers() {
			for (let k = 1; k <= 12; k += 1) {
				const up = (2n ** BigInt(k)).toString()
				const down = (5n ** BigInt(k)).toString()
				yield up
				yield down
				// 1 / 2^k = 5^k * 10^-k and 1 / 5^k = 2^k * 10^-k
				yield `${down}e-${k}`
				yield `${up}e-${k}`
			}
		}
		assert.strictEqual(productDecimalLazy(telescopingPowers(), 30), '1')

		// Cross-check 3: Independent BigInt fixed-point oracle over fixed 3-decimal-place terms
		const terms = ['-12.345', '0.678', '91.002', '-0.050', '4.125']
		let oracleNumerator = 1n
		for (const term of terms) {
			const negative = term.startsWith('-')
			const unsigned = negative ? term.slice(1) : term
			const [whole, frac = ''] = unsigned.split('.')
			const scaled = BigInt(whole + frac.padEnd(3, '0'))
			oracleNumerator *= negative ? -scaled : scaled
		}
		// 5 terms each scaled by 10^3 => total scale 10^15
		const oracleSign = oracleNumerator < 0n ? '-' : ''
		const oracleDigits = (oracleNumerator < 0n ? -oracleNumerator : oracleNumerator).toString().padStart(16, '0')
		const oracleInt = oracleDigits.slice(0, -15).replace(/^0+(?=\d)/, '')
		const oracleFrac = oracleDigits.slice(-15).replace(/0+$/, '')
		const oracleExpected = oracleFrac ? `${oracleSign}${oracleInt}.${oracleFrac}` : `${oracleSign}${oracleInt}`

		assert.strictEqual(productDecimalLazy(terms, 15), oracleExpected)
	})
})
