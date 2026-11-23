import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { divideDecimalLazy } from './divideDecimalLazy.js'

/**
 * Independent reference implementation of positive decimal division using
 * digit-by-digit long division (completely independent of scaled-BigInt shift).
 *
 * @param {string} aStr - Non-negative integer/decimal string without scientific notation
 * @param {string} bStr - Positive integer/decimal string without scientific notation
 * @param {number} precision - Non-negative integer precision
 * @returns {string}
 */
function referenceLongDivision(aStr, bStr, precision) {
	const splitDec = (s) => {
		const [i, f = ''] = s.split('.')
		return { digits: i + f, fracLen: f.length }
	}
	const a = splitDec(aStr)
	const b = splitDec(bStr)
	const maxFrac = Math.max(a.fracLen, b.fracLen)
	const num = BigInt(a.digits + '0'.repeat(maxFrac - a.fracLen))
	const den = BigInt(b.digits + '0'.repeat(maxFrac - b.fracLen))

	const intPart = num / den
	let rem = num % den

	// Compute precision + 1 fractional digits to perform half-up rounding
	const fracDigits = []
	for (let i = 0; i <= precision; i++) {
		rem *= 10n
		fracDigits.push(Number(rem / den))
		rem %= den
	}

	const guardDigit = fracDigits.pop()
	let carry = guardDigit >= 5 ? 1 : 0

	for (let i = fracDigits.length - 1; i >= 0 && carry > 0; i--) {
		const sum = fracDigits[i] + carry
		if (sum === 10) {
			fracDigits[i] = 0
		} else {
			fracDigits[i] = sum
			carry = 0
		}
	}

	const finalInt = intPart + BigInt(carry)
	const fracStr = fracDigits.join('').replace(/0+$/, '')
	return fracStr.length > 0 ? `${finalInt}.${fracStr}` : finalInt.toString()
}

describe('divideDecimalLazy', () => {
	describe('cumulative (single-iterable) mode', () => {
		test('computes running exact quotients for integers and decimals', () => {
			assert.deepEqual([...divideDecimalLazy(['100', '2', '5'], 10)], ['100', '50', '10'])
			assert.deepEqual([...divideDecimalLazy(['10', '4', '5'], 6)], ['10', '2.5', '0.5'])
			assert.deepEqual([...divideDecimalLazy(['1', '2', '2', '2'], 10)], ['1', '0.5', '0.25', '0.125'])
		})

		test('handles repeating decimals and configurable precision with half-away-from-zero rounding', () => {
			assert.deepEqual([...divideDecimalLazy(['1', '3'], 5)], ['1', '0.33333'])
			assert.deepEqual([...divideDecimalLazy(['2', '3'], 5)], ['2', '0.66667'])
			assert.deepEqual([...divideDecimalLazy(['1', '3'])], ['1', '0.33333333333333333333'])
			assert.deepEqual([...divideDecimalLazy(['5', '2'], 0)], ['5', '3'])
			assert.deepEqual([...divideDecimalLazy(['-5', '2'], 0)], ['-5', '-3'])
		})

		test('handles negative numbers, signs, and normalization', () => {
			assert.deepEqual(
				[...divideDecimalLazy(['-100.00', '4', '-5'], 4)],
				['-100', '-25', '5']
			)
			assert.deepEqual(
				[...divideDecimalLazy(['+0012.3400', '+2'], 4)],
				['12.34', '6.17']
			)
			assert.deepEqual([...divideDecimalLazy(['.5', '.25'], 4)], ['0.5', '2'])
			assert.deepEqual([...divideDecimalLazy(['5.', '2.'], 4)], ['5', '2.5'])
		})

		test('handles scientific notation inputs', () => {
			assert.deepEqual([...divideDecimalLazy(['1e6', '2.5e2'], 4)], ['1000000', '4000'])
			assert.deepEqual([...divideDecimalLazy(['1.5e-3', '3e-1'], 6)], ['0.0015', '0.005'])
			assert.deepEqual([...divideDecimalLazy(['-4.2E+2', '2.1E-1'], 2)], ['-420', '-2000'])
		})

		test('handles arbitrary precision far beyond Number.MAX_SAFE_INTEGER', () => {
			const huge = '1' + '0'.repeat(60)
			const results = [...divideDecimalLazy([huge, '3'], 40)]
			assert.equal(results[0], huge)
			assert.equal(results[1], '3'.repeat(60) + '.' + '3'.repeat(40))
		})
	})

	describe('pairwise (two-iterable) mode', () => {
		test('divides corresponding pairs lazily', () => {
			const dividends = ['10', '1', '-7', '0.0001']
			const divisors = ['4', '3', '2', '0.0002']
			assert.deepEqual(
				[...divideDecimalLazy(dividends, divisors, 6)],
				['2.5', '0.333333', '-3.5', '0.5']
			)
		})

		test('uses default precision of 20 when omitted', () => {
			const [res] = [...divideDecimalLazy(['2'], ['3'])]
			assert.equal(res, '0.' + '6'.repeat(19) + '7')
		})

		test('stops when shorter iterable ends without pulling extra elements', () => {
			let pulledA = 0
			let pulledB = 0
			function* genA() {
				for (const v of ['10', '20']) {
					pulledA++
					yield v
				}
			}
			function* genB() {
				for (const v of ['2', '4', '5', '6']) {
					pulledB++
					yield v
				}
			}

			assert.deepEqual([...divideDecimalLazy(genA(), genB(), 4)], ['5', '5'])
			assert.equal(pulledA, 2)
			assert.equal(pulledB, 2)
		})
	})

	describe('edge cases', () => {
		test('empty and single-element iterables', () => {
			assert.deepEqual([...divideDecimalLazy([], 5)], [])
			assert.deepEqual([...divideDecimalLazy([], ['1', '2'], 5)], [])
			assert.deepEqual([...divideDecimalLazy(['1', '2'], [], 5)], [])
			assert.deepEqual([...divideDecimalLazy(['0042.500'], 2)], ['42.5'])
			assert.deepEqual([...divideDecimalLazy(['-0.000'], 4)], ['0'])
		})

		test('zero dividend and negative-zero suppression', () => {
			assert.deepEqual([...divideDecimalLazy(['0', '5', '-3'], 10)], ['0', '0', '0'])
			assert.deepEqual([...divideDecimalLazy(['-0.0', '7'], 5)], ['0', '0'])
			assert.deepEqual([...divideDecimalLazy(['-1'], ['1000'], 2)], ['0'])
			assert.deepEqual([...divideDecimalLazy(['-1'], ['3'], 0)], ['0'])
		})

		test('rounding carry propagation across decimal point', () => {
			assert.deepEqual([...divideDecimalLazy(['9.999'], ['1'], 2)], ['10'])
			assert.deepEqual([...divideDecimalLazy(['-9.999'], ['1'], 2)], ['-10'])
			assert.deepEqual([...divideDecimalLazy(['0.9995'], ['1'], 3)], ['1'])
			assert.deepEqual([...divideDecimalLazy(['1.9999'], ['2'], 3)], ['1'])
		})

		test('division by zero throws RangeError for all zero representations', () => {
			for (const zero of ['0', '-0', '+0', '0.0', '-0.0000', '0e10', '0.0e-5']) {
				assert.throws(
					() => [...divideDecimalLazy(['10', zero], 5)],
					{ name: 'RangeError', message: /Division by zero/ }
				)
				assert.throws(
					() => [...divideDecimalLazy(['0'], [zero], 5)],
					{ name: 'RangeError', message: /Division by zero/ }
				)
			}
		})

		test('validates arguments and input elements strictly', () => {
			assert.throws(() => divideDecimalLazy(null), TypeError)
			assert.throws(() => divideDecimalLazy(undefined), TypeError)
			assert.throws(() => divideDecimalLazy(123), TypeError)
			assert.throws(() => divideDecimalLazy('100'), TypeError)
			assert.throws(() => divideDecimalLazy(['10'], '2'), TypeError)
			assert.throws(() => divideDecimalLazy(['10'], null), TypeError)
			assert.throws(() => divideDecimalLazy(['10'], 5, 5), TypeError)
			assert.throws(() => divideDecimalLazy(['10'], ['2'], '5'), TypeError)

			assert.throws(() => divideDecimalLazy(['10'], -1), RangeError)
			assert.throws(() => divideDecimalLazy(['10'], 1.5), RangeError)
			assert.throws(() => divideDecimalLazy(['10'], NaN), RangeError)
			assert.throws(() => divideDecimalLazy(['10'], Infinity), RangeError)
			assert.throws(() => divideDecimalLazy(['10'], ['2'], -3), RangeError)

			assert.throws(() => [...divideDecimalLazy([10, '2'], 4)], TypeError)
			assert.throws(() => [...divideDecimalLazy(['10', 2n], 4)], TypeError)
			assert.throws(() => [...divideDecimalLazy([''], 4)], SyntaxError)
			assert.throws(() => [...divideDecimalLazy([' 10 '], 4)], SyntaxError)
			assert.throws(() => [...divideDecimalLazy(['NaN'], 4)], SyntaxError)
			assert.throws(() => [...divideDecimalLazy(['Infinity'], 4)], SyntaxError)
			assert.throws(() => [...divideDecimalLazy(['1.2.3'], 4)], SyntaxError)
			assert.throws(() => [...divideDecimalLazy(['.'], 4)], SyntaxError)
			assert.throws(() => [...divideDecimalLazy(['1e'], 4)], SyntaxError)
			assert.throws(() => [...divideDecimalLazy(['1e999999999'], 4)], RangeError)
		})
	})

	describe('lazy consumption verification', () => {
		test('consumes infinite generator strictly on demand and cleans up on early exit', () => {
			let pulled = 0
			let closed = false

			function* infiniteHalvers() {
				try {
					pulled++
					yield '1024'
					while (true) {
						pulled++
						yield '2'
					}
				} finally {
					closed = true
				}
			}

			const gen = divideDecimalLazy(infiniteHalvers(), 4)
			assert.equal(pulled, 0, 'must not pull before first .next()')

			const collected = []
			for (const val of gen) {
				collected.push(val)
				assert.equal(pulled, collected.length)
				if (collected.length === 5) break
			}

			assert.deepEqual(collected, ['1024', '512', '256', '128', '64'])
			assert.equal(pulled, 5)
			assert.equal(closed, true, 'underlying generator must be closed on early break')
		})

		test('consumes two infinite generators lazily in pairwise mode and closes both on early exit', () => {
			let pulledA = 0
			let pulledB = 0
			let closedA = false
			let closedB = false

			function* naturals() {
				try {
					let n = 1n
					while (true) {
						pulledA++
						yield (n++).toString()
					}
				} finally {
					closedA = true
				}
			}

			function* twos() {
				try {
					while (true) {
						pulledB++
						yield '2'
					}
				} finally {
					closedB = true
				}
			}

			const gen = divideDecimalLazy(naturals(), twos(), 2)
			assert.equal(pulledA, 0)
			assert.equal(pulledB, 0)

			const out = []
			for (const q of gen) {
				out.push(q)
				assert.equal(pulledA, out.length)
				assert.equal(pulledB, out.length)
				if (out.length === 4) break
			}

			assert.deepEqual(out, ['0.5', '1', '1.5', '2'])
			assert.equal(closedA, true)
			assert.equal(closedB, true)
		})

		test('yields valid prefixes before encountering an error lazily', () => {
			let pulled = 0
			function* streamWithZero() {
				for (const item of ['100', '4', '0', '999']) {
					pulled++
					yield item
				}
			}

			const gen = divideDecimalLazy(streamWithZero(), 4)
			assert.deepEqual(gen.next(), { value: '100', done: false })
			assert.equal(pulled, 1)
			assert.deepEqual(gen.next(), { value: '25', done: false })
			assert.equal(pulled, 2)
			assert.throws(() => gen.next(), RangeError)
			assert.equal(pulled, 3, 'must not pull elements past the failing element')
		})
	})

	describe('independent cross-checks', () => {
		test('matches independent digit-by-digit long division across precisions', () => {
			const cases = [
				['1', '7'],
				['22', '7'],
				['355', '113'],
				['123456789012345678901234567890.12345', '9876543210987654321.5'],
				['0.00001234567', '0.003456789'],
				['99999999999999999999999999', '97'],
				['1', '998001'],
			]

			for (const precision of [0, 1, 5, 20, 55]) {
				const dividends = cases.map(([a]) => a)
				const divisors = cases.map(([, b]) => b)
				const actual = [...divideDecimalLazy(dividends, divisors, precision)]
				const expected = cases.map(([a, b]) => referenceLongDivision(a, b, precision))
				assert.deepEqual(actual, expected, `mismatch at precision=${precision}`)
			}
		})

		test('satisfies exact half-ULP error bound |a - q * b| <= |b| * 10^(-p) / 2', () => {
			const toRational = (s) => {
				const neg = s.startsWith('-')
				const clean = neg ? s.slice(1) : s
				const [i, f = ''] = clean.split('.')
				const mag = BigInt(i + f)
				return { num: neg ? -mag : mag, den: 10n ** BigInt(f.length) }
			}

			const pairs = [
				['-31415926535897932384626433832795', '2718281828459045235360287471352'],
				['123.456789', '-0.000789123'],
				['-0.00000012345', '-9876543.21'],
				['7', '13'],
			]

			for (const precision of [0, 3, 18, 40]) {
				const quotients = [
					...divideDecimalLazy(
						pairs.map(([a]) => a),
						pairs.map(([, b]) => b),
						precision
					),
				]

				const scale = 10n ** BigInt(precision)
				for (let idx = 0; idx < pairs.length; idx++) {
					const a = toRational(pairs[idx][0])
					const b = toRational(pairs[idx][1])
					const q = toRational(quotients[idx])

					// |a - q * b| <= |b| / (2 * 10^precision)
					// Cross-multiply positive denominators:
					// |a.num * q.den * b.den - q.num * b.num * a.den| * 2 * scale <= |b.num| * a.den * q.den
					const diffNum = a.num * q.den * b.den - q.num * b.num * a.den
					const absDiffNum = diffNum < 0n ? -diffNum : diffNum
					const absB = b.num < 0n ? -b.num : b.num

					const lhs = absDiffNum * 2n * scale
					const rhs = absB * a.den * q.den

					assert.ok(
						lhs <= rhs,
						`half-ULP bound violated for ${pairs[idx][0]} / ${pairs[idx][1]} at p=${precision}`
					)
				}
			}
		})
	})
})
