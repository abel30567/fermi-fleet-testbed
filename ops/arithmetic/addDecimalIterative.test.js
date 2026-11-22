import { describe, test } from 'node:test'
import assert from 'node:assert'
import { addDecimalIterative } from './addDecimalIterative.js'

/**
 * Independent reference implementation using BigInt scaled integer arithmetic.
 *
 * @param {string} a
 * @param {string} b
 * @param {number} [precision]
 * @returns {string}
 */
function addDecimalViaBigInt(a, b, precision) {
	const parse = (s) => {
		const sign = s.startsWith('-') ? -1n : 1n
		const body = s.startsWith('-') || s.startsWith('+') ? s.slice(1) : s
		const [intPart = '0', fracPart = ''] = body.split('.')
		const digits = (intPart || '0') + fracPart
		return { sign, value: sign * BigInt(digits), scale: fracPart.length }
	}

	const pa = parse(a)
	const pb = parse(b)
	const scale = Math.max(pa.scale, pb.scale)

	let sum =
		pa.value * 10n ** BigInt(scale - pa.scale) +
		pb.value * 10n ** BigInt(scale - pb.scale)

	let outScale = scale
	if (precision !== undefined && scale > precision) {
		const factor = 10n ** BigInt(scale - precision)
		const half = factor / 2n
		const neg = sum < 0n
		const absSum = neg ? -sum : sum
		const q = absSum / factor
		const r = absSum % factor
		const roundedAbs = r >= half ? q + 1n : q
		sum = neg ? -roundedAbs : roundedAbs
		outScale = precision
	}

	if (sum === 0n) {
		return '0'
	}

	const neg = sum < 0n
	const absStr = (neg ? -sum : sum).toString()

	let intStr
	let fracStr
	if (outScale === 0) {
		intStr = absStr
		fracStr = ''
	} else {
		const padded = absStr.padStart(outScale + 1, '0')
		intStr = padded.slice(0, padded.length - outScale)
		fracStr = padded.slice(padded.length - outScale).replace(/0+$/, '')
	}

	const prefix = neg ? '-' : ''
	return fracStr.length > 0 ? `${prefix}${intStr}.${fracStr}` : `${prefix}${intStr}`
}

describe('addDecimalIterative', () => {
	test('normal decimal and integer addition without IEEE 754 drift', () => {
		assert.strictEqual(addDecimalIterative('0.1', '0.2'), '0.3')
		assert.strictEqual(addDecimalIterative('0.14', '0.28'), '0.42')
		assert.strictEqual(addDecimalIterative('123', '456'), '579')
		assert.strictEqual(addDecimalIterative('999', '1'), '1000')
		assert.strictEqual(addDecimalIterative('1.5', '2.5'), '4')
		assert.strictEqual(addDecimalIterative('12.345', '0.655'), '13')
		assert.strictEqual(addDecimalIterative('+12.50', '+007.500'), '20')
		assert.strictEqual(addDecimalIterative('.5', '5.'), '5.5')
		assert.strictEqual(addDecimalIterative('00042.0100', '008.9900'), '51')
	})

	test('signed arithmetic across all sign and magnitude combinations', () => {
		assert.strictEqual(addDecimalIterative('-0.1', '-0.2'), '-0.3')
		assert.strictEqual(addDecimalIterative('10.5', '-3.25'), '7.25')
		assert.strictEqual(addDecimalIterative('3.25', '-10.5'), '-7.25')
		assert.strictEqual(addDecimalIterative('-10.5', '3.25'), '-7.25')
		assert.strictEqual(addDecimalIterative('-3.25', '10.5'), '7.25')
		assert.strictEqual(addDecimalIterative('100.001', '-99.999'), '0.002')
		assert.strictEqual(addDecimalIterative('-100.001', '99.999'), '-0.002')
		assert.strictEqual(addDecimalIterative('42.125', '-42.125'), '0')
		assert.strictEqual(addDecimalIterative('-42.125', '42.125'), '0')
	})

	test('very large numbers (>50 digits) with deep carries and borrows', () => {
		const bigA = '9'.repeat(65)
		const bigB = '1'
		assert.strictEqual(addDecimalIterative(bigA, bigB), `1${'0'.repeat(65)}`)

		const pow60 = `1${'0'.repeat(60)}`
		assert.strictEqual(addDecimalIterative(pow60, '-1'), '9'.repeat(60))

		const fracA = `0.${'9'.repeat(55)}`
		const fracB = `0.${'0'.repeat(54)}1`
		assert.strictEqual(addDecimalIterative(fracA, fracB), '1')

		const largeDecA = '123456789012345678901234567890123456789012345678901234567890.1234567890123456789012345678901234567890123456789012345'
		const largeDecB = '876543210987654321098765432109876543210987654321098765432109.8765432109876543210987654321098765432109876543210987655'
		assert.strictEqual(addDecimalIterative(largeDecA, largeDecB), `1${'0'.repeat(60)}`)
	})

	test('configurable fractional precision rounding (half away from zero)', () => {
		assert.strictEqual(addDecimalIterative('1.234', '0.001', 2), '1.24')
		assert.strictEqual(addDecimalIterative('1.234', '0.0009', 2), '1.23')
		assert.strictEqual(addDecimalIterative('-1.234', '-0.001', 2), '-1.24')
		assert.strictEqual(addDecimalIterative('-1.234', '-0.0009', 2), '-1.23')
		assert.strictEqual(addDecimalIterative('9.995', '0', 2), '10')
		assert.strictEqual(addDecimalIterative('-9.995', '0', 2), '-10')
		assert.strictEqual(addDecimalIterative('0.4', '0.1', 0), '1')
		assert.strictEqual(addDecimalIterative('-0.4', '-0.1', 0), '-1')
		assert.strictEqual(addDecimalIterative('1.49', '0', 0), '1')
		assert.strictEqual(addDecimalIterative('0.1', '0.2', 10), '0.3')
		assert.strictEqual(addDecimalIterative('1.99999999999999999999', '0.00000000000000000001', 5), '2')
	})

	test('zero and negative zero normalization', () => {
		assert.strictEqual(addDecimalIterative('0', '0'), '0')
		assert.strictEqual(addDecimalIterative('-0', '0'), '0')
		assert.strictEqual(addDecimalIterative('-0', '-0'), '0')
		assert.strictEqual(addDecimalIterative('-0.0000', '+0.000'), '0')
		assert.strictEqual(addDecimalIterative('-0.004', '0', 2), '0')
		assert.strictEqual(addDecimalIterative('-0.49', '0', 0), '0')
		assert.strictEqual(addDecimalIterative('-0.005', '0', 2), '-0.01')
	})

	test('input validation rejects invalid decimal strings and precision arguments', () => {
		for (const bad of [123, null, undefined, {}, [], 10n, true]) {
			assert.throws(() => addDecimalIterative(bad, '1'), TypeError)
			assert.throws(() => addDecimalIterative('1', bad), TypeError)
		}

		for (const bad of ['', ' ', 'abc', '1.2.3', '.', '+', '-', '+.', '-.', '1e5', ' 1.2', '1.2 ', '1_000', 'NaN', 'Infinity', '--1', '+-1']) {
			assert.throws(() => addDecimalIterative(bad, '1'), RangeError)
			assert.throws(() => addDecimalIterative('1', bad), RangeError)
		}

		for (const badPrec of ['2', null, {}, true, 2n]) {
			assert.throws(() => addDecimalIterative('1', '2', badPrec), TypeError)
		}

		for (const badPrec of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => addDecimalIterative('1', '2', badPrec), RangeError)
		}
	})

	test('cross-check against independent BigInt scaled integer computation', () => {
		const cases = [
			['0.1', '0.2', undefined],
			['-0.1', '0.2', undefined],
			['123456789012345678901234567890123456789012345678901234.98765432109876543210987654321', '987654321098765432109876543210987654321098765432109876.12345678901234567890123456789', undefined],
			['123456789012345678901234567890123456789012345678901234.98765432109876543210987654321', '-987654321098765432109876543210987654321098765432109876.12345678901234567890123456789', 15],
			['-99999999999999999999999999999999999999999999999999999.9999995', '-0.0000005', 6],
			['-99999999999999999999999999999999999999999999999999999.9999994', '-0.0000001', 6],
			['0.00000000000000000000000000000000000000000000000000005', '-0.00000000000000000000000000000000000000000000000000004', 52],
			['0.00000000000000000000000000000000000000000000000000005', '-0.00000000000000000000000000000000000000000000000000006', 50],
			['50000000000000000000000000000000000000000000000000000.5', '-50000000000000000000000000000000000000000000000000000.5', 0],
			['+00000.123456789', '-00000.987654321', 4],
			['.99999', '.00001', 3],
			['999999999999999999999999999999999999999999999999999999.5', '0', 0],
		]

		for (const [a, b, precision] of cases) {
			const actual = addDecimalIterative(a, b, precision)
			const expected = addDecimalViaBigInt(a, b, precision)
			assert.strictEqual(actual, expected, `mismatch for (${a}, ${b}, ${precision})`)
		}

		// Deterministic pseudo-random fuzzing cross-checked against BigInt
		let seed = 0x12345678
		const nextRand = () => {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
			return seed
		}
		const randDecimal = () => {
			const neg = (nextRand() & 1) === 1
			const intLen = 1 + (nextRand() % 70)
			const fracLen = nextRand() % 40
			let intStr = ''
			for (let i = 0; i < intLen; i += 1) {
				intStr += String(nextRand() % 10)
			}
			let fracStr = ''
			for (let i = 0; i < fracLen; i += 1) {
				fracStr += String(nextRand() % 10)
			}
			const prefix = neg ? '-' : ''
			return fracLen > 0 ? `${prefix}${intStr}.${fracStr}` : `${prefix}${intStr}`
		}

		for (let i = 0; i < 100; i += 1) {
			const a = randDecimal()
			const b = randDecimal()
			const precision = i % 3 === 0 ? undefined : nextRand() % 25
			assert.strictEqual(
				addDecimalIterative(a, b, precision),
				addDecimalViaBigInt(a, b, precision),
				`fuzz mismatch #${i} for (${a}, ${b}, ${precision})`,
			)
		}
	})
})
