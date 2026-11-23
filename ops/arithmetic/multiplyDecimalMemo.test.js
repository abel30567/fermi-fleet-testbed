import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { multiplyDecimalMemo } from './multiplyDecimalMemo.js'

/**
 * Independent BigInt-based reference implementation for cross-checking.
 * Uses native BigInt scaling and rounding (completely separate from the
 * base-100 table-driven implementation under test).
 */
function referenceMultiplyDecimal(a, b, precision) {
	const parse = (str) => {
		const s = str.trim()
		const m = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(s)
		if (!m) throw new Error(`Invalid: ${str}`)
		const neg = m[1] === '-'
		const intPart = m[2] ?? ''
		const fracPart = m[3] ?? m[4] ?? ''
		const exp = m[5] ? Number(m[5]) : 0
		const num = BigInt(intPart + fracPart)
		const scale = fracPart.length - exp
		return { num: neg && num !== 0n ? -num : num, scale }
	}

	const pa = parse(a)
	const pb = parse(b)
	const prod = pa.num * pb.num
	const scale = pa.scale + pb.scale

	if (prod === 0n) {
		return precision === undefined || precision === 0
			? '0'
			: `0.${'0'.repeat(precision)}`
	}

	const neg = prod < 0n
	let mag = neg ? -prod : prod
	let effScale = scale

	if (precision === undefined) {
		if (effScale <= 0) {
			return `${neg ? '-' : ''}${mag}${'0'.repeat(-effScale)}`
		}
		while (effScale > 0 && mag % 10n === 0n) {
			mag /= 10n
			effScale--
		}
		if (effScale === 0) {
			return `${neg ? '-' : ''}${mag}`
		}
		const s = mag.toString().padStart(effScale + 1, '0')
		const split = s.length - effScale
		return `${neg ? '-' : ''}${s.slice(0, split)}.${s.slice(split)}`
	}

	// Fixed precision: scale magnitude to `precision` fractional digits with round half away from zero.
	if (effScale <= precision) {
		mag *= 10n ** BigInt(precision - effScale)
	} else {
		const drop = effScale - precision
		const divisor = 10n ** BigInt(drop)
		const q = mag / divisor
		const r = mag % divisor
		mag = r * 2n >= divisor ? q + 1n : q
	}

	if (mag === 0n) {
		return precision === 0 ? '0' : `0.${'0'.repeat(precision)}`
	}

	if (precision === 0) {
		return `${neg ? '-' : ''}${mag}`
	}

	const s = mag.toString().padStart(precision + 1, '0')
	const split = s.length - precision
	return `${neg ? '-' : ''}${s.slice(0, split)}.${s.slice(split)}`
}

describe('multiplyDecimalMemo', () => {
	test('handles basic integer and decimal multiplication', () => {
		assert.equal(multiplyDecimalMemo('2', '3'), '6')
		assert.equal(multiplyDecimalMemo('12', '34'), '408')
		assert.equal(multiplyDecimalMemo('0.1', '0.2'), '0.02')
		assert.equal(multiplyDecimalMemo('1.25', '0.8'), '1')
		assert.equal(multiplyDecimalMemo('12.34', '56.78'), '700.6652')
		assert.equal(multiplyDecimalMemo('99', '99'), '9801')
		assert.equal(multiplyDecimalMemo('999', '999'), '998001')
	})

	test('handles signs, leading/trailing zeros, shorthand decimals, and whitespace', () => {
		assert.equal(multiplyDecimalMemo('-2.5', '4'), '-10')
		assert.equal(multiplyDecimalMemo('2.5', '-4'), '-10')
		assert.equal(multiplyDecimalMemo('-2.5', '-4'), '10')
		assert.equal(multiplyDecimalMemo('+2.5', '+4.0'), '10')
		assert.equal(multiplyDecimalMemo('00012.3400', '00.50'), '6.17')
		assert.equal(multiplyDecimalMemo('.5', '.5'), '0.25')
		assert.equal(multiplyDecimalMemo('5.', '2.'), '10')
		assert.equal(multiplyDecimalMemo('  -0.125  ', '\t8\n'), '-1')
	})

	test('handles zero operands and avoids negative zero', () => {
		assert.equal(multiplyDecimalMemo('0', '0'), '0')
		assert.equal(multiplyDecimalMemo('-0', '123.45'), '0')
		assert.equal(multiplyDecimalMemo('123.45', '-0.000'), '0')
		assert.equal(multiplyDecimalMemo('-0.0', '-0.0'), '0')
		assert.equal(multiplyDecimalMemo('0', '5', 0), '0')
		assert.equal(multiplyDecimalMemo('0', '5', 3), '0.000')
		assert.equal(multiplyDecimalMemo('-0.001', '0.001', 2), '0.00')
		assert.equal(multiplyDecimalMemo('-0.001', '0.001', 0), '0')
		assert.equal(multiplyDecimalMemo('-0.004', '1', 2), '0.00')
	})

	test('handles configurable precision and round-half-away-from-zero', () => {
		assert.equal(multiplyDecimalMemo('1.234', '5.678', 4), '7.0067')
		assert.equal(multiplyDecimalMemo('1.234', '5.678', 2), '7.01')
		assert.equal(multiplyDecimalMemo('1.234', '5.678', 0), '7')
		assert.equal(multiplyDecimalMemo('1.5', '2', 3), '3.000')
		assert.equal(multiplyDecimalMemo('0.25', '0.25', 6), '0.062500')

		// Exact half tie-breaking (away from zero)
		assert.equal(multiplyDecimalMemo('0.5', '1', 0), '1')
		assert.equal(multiplyDecimalMemo('-0.5', '1', 0), '-1')
		assert.equal(multiplyDecimalMemo('0.05', '1', 1), '0.1')
		assert.equal(multiplyDecimalMemo('-0.05', '1', 1), '-0.1')
		assert.equal(multiplyDecimalMemo('0.005', '1', 2), '0.01')

		// Carry propagation across 9s
		assert.equal(multiplyDecimalMemo('0.999', '1', 2), '1.00')
		assert.equal(multiplyDecimalMemo('-0.999', '1', 2), '-1.00')
		assert.equal(multiplyDecimalMemo('9.995', '1', 2), '10.00')
		assert.equal(multiplyDecimalMemo('0.095', '1', 1), '0.1')
		assert.equal(multiplyDecimalMemo('0.095', '1', 2), '0.10')
		assert.equal(multiplyDecimalMemo('0.995', '1', 0), '1')
	})

	test('handles scientific notation and extreme scales', () => {
		assert.equal(multiplyDecimalMemo('1.5e2', '2e-1'), '30')
		assert.equal(multiplyDecimalMemo('1.23E+5', '1E+5'), '12300000000')
		assert.equal(
			multiplyDecimalMemo('1e-20', '1e-20'),
			'0.0000000000000000000000000000000000000001'
		)
		assert.equal(multiplyDecimalMemo('2.5e-3', '-4e-2', 4), '-0.0001')
		assert.equal(multiplyDecimalMemo('0e100', '9.99e50'), '0')
	})

	test('handles arbitrary-precision numbers beyond IEEE-754 double limits', () => {
		// (10^30 - 1) * (10^30 + 1) = 10^60 - 1
		const a = '9'.repeat(30)
		const b = '1' + '0'.repeat(29) + '1'
		assert.equal(multiplyDecimalMemo(a, b), '9'.repeat(60))

		// 2^64 * 5^64 = 10^64
		const pow2_64 = (2n ** 64n).toString()
		const pow5_64 = (5n ** 64n).toString()
		assert.equal(multiplyDecimalMemo(pow2_64, pow5_64), '1' + '0'.repeat(64))

		// High-precision decimals
		const x = '3.1415926535897932384626433832795028841971'
		const y = '2.7182818284590452353602874713526624977572'
		assert.equal(
			multiplyDecimalMemo(x, y),
			referenceMultiplyDecimal(x, y)
		)
		assert.equal(
			multiplyDecimalMemo(x, y, 30),
			referenceMultiplyDecimal(x, y, 30)
		)
	})

	test('validates inputs and throws appropriate errors', () => {
		assert.throws(() => multiplyDecimalMemo(123, '1'), TypeError)
		assert.throws(() => multiplyDecimalMemo('1', 456), TypeError)
		assert.throws(() => multiplyDecimalMemo(null, '1'), TypeError)
		assert.throws(() => multiplyDecimalMemo('1', undefined), TypeError)
		assert.throws(() => multiplyDecimalMemo('1', '2', '2'), TypeError)
		assert.throws(() => multiplyDecimalMemo('1', '2', null), TypeError)

		assert.throws(() => multiplyDecimalMemo('', '1'), RangeError)
		assert.throws(() => multiplyDecimalMemo('   ', '1'), RangeError)
		assert.throws(() => multiplyDecimalMemo('.', '1'), RangeError)
		assert.throws(() => multiplyDecimalMemo('-.', '1'), RangeError)
		assert.throws(() => multiplyDecimalMemo('1.2.3', '1'), RangeError)
		assert.throws(() => multiplyDecimalMemo('NaN', '1'), RangeError)
		assert.throws(() => multiplyDecimalMemo('Infinity', '1'), RangeError)
		assert.throws(() => multiplyDecimalMemo('1_000', '2'), RangeError)
		assert.throws(() => multiplyDecimalMemo('1e', '2'), RangeError)

		assert.throws(() => multiplyDecimalMemo('1', '2', -1), RangeError)
		assert.throws(() => multiplyDecimalMemo('1', '2', 1.5), RangeError)
		assert.throws(() => multiplyDecimalMemo('1', '2', NaN), RangeError)
		assert.throws(() => multiplyDecimalMemo('1', '2', Infinity), RangeError)
	})

	test('memoization returns consistent results across repeated, commutative, and evicted entries', () => {
		const pairs = [
			['123.456', '789.012'],
			['789.012', '123.456'],
			['00123.4560', '789.01200'],
			['1.23456e2', '7.89012e2'],
		]
		const expectedExact = referenceMultiplyDecimal('123.456', '789.012')
		const expectedP2 = referenceMultiplyDecimal('123.456', '789.012', 2)
		const expectedP8 = referenceMultiplyDecimal('123.456', '789.012', 8)

		for (const [x, y] of pairs) {
			assert.equal(multiplyDecimalMemo(x, y), expectedExact)
			assert.equal(multiplyDecimalMemo(x, y, 2), expectedP2)
			assert.equal(multiplyDecimalMemo(x, y, 8), expectedP8)
		}

		// Exceed LRU cache capacity (1024) to verify eviction and re-computation correctness
		for (let i = 1; i <= 1200; i++) {
			const a = `${i}.${String(i % 100).padStart(2, '0')}`
			const b = `${i + 7}.5`
			assert.equal(
				multiplyDecimalMemo(a, b, 2),
				referenceMultiplyDecimal(a, b, 2)
			)
		}

		// Re-query early entry after eviction
		assert.equal(multiplyDecimalMemo('123.456', '789.012'), expectedExact)
	})

	test('independent BigInt reference cross-check across diverse matrix and algebraic identities', () => {
		const operands = [
			'0',
			'-0',
			'1',
			'-1',
			'0.1',
			'0.2',
			'-0.5',
			'0.9999',
			'-99.995',
			'12345678901234567890.09876543210987654321',
			'-0.000000000123456789',
			'99999999999999999999999999',
			'1.5e-12',
			'-4.25e8',
			'007.500',
		]
		const precisions = [undefined, 0, 1, 2, 5, 12, 25]

		for (const a of operands) {
			for (const b of operands) {
				for (const p of precisions) {
					const actual = multiplyDecimalMemo(a, b, p)
					const expected = referenceMultiplyDecimal(a, b, p)
					assert.equal(
						actual,
						expected,
						`Mismatch for multiplyDecimalMemo(${a}, ${b}, ${p})`
					)
				}
				// Commutativity check
				assert.equal(
					multiplyDecimalMemo(a, b),
					multiplyDecimalMemo(b, a),
					`Commutativity failed for (${a}, ${b})`
				)
			}
		}

		// Associativity cross-check (exact mode)
		const triples = [
			['1.234', '5.678', '9.012'],
			['-0.125', '0.04', '200.5'],
			['999999999999999999.1', '0.000000000000000001', '7.77'],
		]
		for (const [x, y, z] of triples) {
			const left = multiplyDecimalMemo(multiplyDecimalMemo(x, y), z)
			const right = multiplyDecimalMemo(x, multiplyDecimalMemo(y, z))
			assert.equal(left, right)
		}
	})
})
