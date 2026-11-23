import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { summationDecimalLazy } from './summationDecimalLazy.js'

describe('summationDecimalLazy', () => {
	test('sums standard positive decimal strings accurately without float drift', () => {
		assert.equal(summationDecimalLazy(['0.1', '0.2']), '0.3')
		assert.equal(summationDecimalLazy(['1.25', '2.75', '3.5']), '7.5')
		assert.equal(summationDecimalLazy(['10', '20', '30']), '60')
		assert.equal(summationDecimalLazy(['.5', '5.', '+0.5']), '6')
		assert.equal(summationDecimalLazy(['  1.100 ', '\t2.900\n']), '4')
	})

	test('handles empty sequences and single-element sequences', () => {
		assert.equal(summationDecimalLazy([]), '0')
		assert.equal(summationDecimalLazy(new Set()), '0')
		assert.equal(summationDecimalLazy((function* () {})()), '0')
		assert.equal(summationDecimalLazy(['42.000']), '42')
		assert.equal(summationDecimalLazy(['-0.0000']), '0')
		assert.equal(summationDecimalLazy(['+0']), '0')
	})

	test('handles negative numbers, cancellation, and signed zero', () => {
		assert.equal(summationDecimalLazy(['-1.5', '-2.5', '-0.25']), '-4.25')
		assert.equal(summationDecimalLazy(['10.5', '-10.5']), '0')
		assert.equal(summationDecimalLazy(['-0.5', '0.5']), '0')
		assert.equal(summationDecimalLazy(['-100', '25.75', '74.25']), '0')
		// Catastrophic cancellation case that fails in IEEE-754 float64
		assert.equal(
			summationDecimalLazy(['1e30', '0.00000000000000000001', '-1e30'], 25),
			'0.00000000000000000001',
		)
	})

	test('supports scientific notation inputs', () => {
		assert.equal(summationDecimalLazy(['1e3', '2.5e2', '-5E1']), '1200')
		assert.equal(summationDecimalLazy(['1.5e-4', '2.5E-4']), '0.0004')
		assert.equal(summationDecimalLazy(['1e-25', '2e-25'], 30), '0.0000000000000000000000003')
		assert.equal(summationDecimalLazy(['0e-99999', '1.25']), '1.25')
	})

	test('respects configurable precision with round-half-away-from-zero', () => {
		assert.equal(summationDecimalLazy(['1.234', '0.001'], 2), '1.24')
		assert.equal(summationDecimalLazy(['1.234', '0.0009'], 2), '1.23')
		assert.equal(summationDecimalLazy(['-1.234', '-0.001'], 2), '-1.24')
		assert.equal(summationDecimalLazy(['-1.234', '-0.0009'], 2), '-1.23')
		assert.equal(summationDecimalLazy(['1.4', '1.4'], 0), '3')
		assert.equal(summationDecimalLazy(['-1.4', '-1.4'], 0), '-3')
		assert.equal(summationDecimalLazy(['9.99', '0.006'], 1), '10')
		// Rounding tiny negative number to zero must yield '0', not '-0'
		assert.equal(summationDecimalLazy(['-0.0004'], 3), '0')
		assert.equal(summationDecimalLazy(['-0.0005'], 3), '-0.001')
	})

	test('handles very high precision and huge arbitrary-precision integers', () => {
		const a = '1234567890123456789012345678901234567890.0000000000000000000000000000000000000001'
		const b = '8765432109876543210987654321098765432109.9999999999999999999999999999999999999999'
		assert.equal(
			summationDecimalLazy([a, b], 50),
			'10000000000000000000000000000000000000000',
		)

		const c = '0.' + '1'.repeat(60)
		const d = '0.' + '2'.repeat(60)
		assert.equal(summationDecimalLazy([c, d], 60), '0.' + '3'.repeat(60))
		assert.equal(summationDecimalLazy([c, d], 10), '0.' + '3'.repeat(10))
	})

	test('consumes generators and custom iterables lazily without buffering', () => {
		const events = []
		let closed = false

		function* lazyGen() {
			try {
				events.push('yield-1')
				yield '1.25'
				events.push('yield-2')
				yield 'invalid'
				events.push('yield-3')
				yield '99.99'
			} finally {
				closed = true
			}
		}

		assert.throws(() => summationDecimalLazy(lazyGen()), SyntaxError)
		// Lazy consumption must stop at the invalid element and close the generator
		assert.deepEqual(events, ['yield-1', 'yield-2'])
		assert.equal(closed, true)

		// Custom iterable object (not an Array or Generator)
		const customIterable = {
			[Symbol.iterator]() {
				let i = 0
				const items = ['0.1', '0.2', '0.3', '0.4']
				return {
					next() {
						if (i < items.length) {
							return { value: items[i++], done: false }
						}
						return { value: undefined, done: true }
					},
				}
			},
		}
		assert.equal(summationDecimalLazy(customIterable), '1')
	})

	test('streams large lazy sequences accurately without intermediate rounding loss', () => {
		// 10,000 copies of 0.0001 summed with precision=2 must equal '1', not '0'
		function* tenThousandTiny() {
			for (let i = 0; i < 10_000; i++) {
				yield '0.0001'
			}
		}
		assert.equal(summationDecimalLazy(tenThousandTiny(), 2), '1')
	})

	test('independent cross-check: Gauss arithmetic series at 30 decimal places', () => {
		const n = 500
		const scale = 30
		function* scaledRange() {
			for (let k = 1; k <= n; k++) {
				yield `0.${String(k).padStart(scale, '0')}`
			}
		}

		// Closed-form: sum_{k=1}^n k = n*(n+1)/2 = 125250, scaled by 10^-30
		const expectedUnscaled = (BigInt(n) * BigInt(n + 1)) / 2n
		const expectedFrac = expectedUnscaled.toString().padStart(scale, '0').replace(/0+$/, '')
		const expected = `0.${expectedFrac}`

		assert.equal(summationDecimalLazy(scaledRange(), scale), expected)
	})

	test('independent cross-check: exact geometric series sum_{k=1}^{40} 2^-k = 1 - 2^-40', () => {
		const terms = 40
		// 2^-k = 5^k * 10^-k has an exact terminating decimal expansion of k digits
		function* inversePowersOfTwo() {
			let fivePow = 1n
			for (let k = 1; k <= terms; k++) {
				fivePow *= 5n
				yield `0.${fivePow.toString().padStart(k, '0')}`
			}
		}

		// Closed-form: 1 - 2^-40 = (10^40 - 5^40) / 10^40
		const expectedUnscaled = 10n ** BigInt(terms) - 5n ** BigInt(terms)
		const expected = `0.${expectedUnscaled.toString().padStart(terms, '0')}`

		assert.equal(summationDecimalLazy(inversePowersOfTwo(), terms), expected)
	})

	test('independent cross-check: permutation invariance across orderings', () => {
		const terms = [
			'12345678901234567890.00000000000000000001',
			'-12345678901234567890',
			'0.99999999999999999999',
			'-0.5',
			'2.5e-20',
			'-1.5e-20',
		]
		const forward = summationDecimalLazy(terms, 25)
		const reversed = summationDecimalLazy([...terms].reverse(), 25)
		const shuffled = summationDecimalLazy([terms[2], terms[5], terms[0], terms[3], terms[1], terms[4]], 25)

		assert.equal(forward, '0.50000000000000000001')
		assert.equal(reversed, forward)
		assert.equal(shuffled, forward)
	})

	test('validates invalid iterable, element, and precision arguments', () => {
		// Non-iterable or string inputs
		assert.throws(() => summationDecimalLazy(null), TypeError)
		assert.throws(() => summationDecimalLazy(undefined), TypeError)
		assert.throws(() => summationDecimalLazy(123), TypeError)
		assert.throws(() => summationDecimalLazy({}), TypeError)
		assert.throws(() => summationDecimalLazy('123'), TypeError)

		// Invalid precision
		assert.throws(() => summationDecimalLazy(['1'], -1), RangeError)
		assert.throws(() => summationDecimalLazy(['1'], 1.5), RangeError)
		assert.throws(() => summationDecimalLazy(['1'], Infinity), RangeError)
		assert.throws(() => summationDecimalLazy(['1'], 10_000_000), RangeError)
		assert.throws(() => summationDecimalLazy(['1'], NaN), TypeError)
		assert.throws(() => summationDecimalLazy(['1'], '2'), TypeError)
		assert.throws(() => summationDecimalLazy(['1'], null), TypeError)

		// Invalid elements
		assert.throws(() => summationDecimalLazy([1]), TypeError)
		assert.throws(() => summationDecimalLazy([1n]), TypeError)
		assert.throws(() => summationDecimalLazy([null]), TypeError)
		assert.throws(() => summationDecimalLazy([undefined]), TypeError)
		assert.throws(() => summationDecimalLazy(['']), SyntaxError)
		assert.throws(() => summationDecimalLazy(['   ']), SyntaxError)
		assert.throws(() => summationDecimalLazy(['.']), SyntaxError)
		assert.throws(() => summationDecimalLazy(['NaN']), SyntaxError)
		assert.throws(() => summationDecimalLazy(['Infinity']), SyntaxError)
		assert.throws(() => summationDecimalLazy(['1.2.3']), SyntaxError)
		assert.throws(() => summationDecimalLazy(['1e']), SyntaxError)
		assert.throws(() => summationDecimalLazy(['0x10']), SyntaxError)
		assert.throws(() => summationDecimalLazy(['1_000']), SyntaxError)
		assert.throws(() => summationDecimalLazy(['1e2000000']), RangeError)
		assert.throws(() => summationDecimalLazy(['1e-2000000']), RangeError)
	})
})
