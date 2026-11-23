import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { divideDecimalRecursive } from './divideDecimalRecursive.js'

/**
 * Independent BigInt-based decimal division oracle used solely for cross-checking.
 *
 * @param {string} a
 * @param {string} b
 * @param {number} precision
 * @returns {string}
 */
function divideDecimalBigIntOracle(a, b, precision = 20) {
	const parse = (s) => {
		const neg = s.startsWith('-')
		const body = s.startsWith('-') || s.startsWith('+') ? s.slice(1) : s
		const [iPart, fPart = ''] = body.split('.')
		return { neg, intVal: BigInt(iPart + fPart || '0'), scale: fPart.length }
	}
	const pa = parse(a)
	const pb = parse(b)
	if (pa.intVal === 0n) return '0'
	const shift = pb.scale - pa.scale + precision
	const num = shift >= 0 ? pa.intVal * 10n ** BigInt(shift) : pa.intVal
	const den = shift >= 0 ? pb.intVal : pb.intVal * 10n ** BigInt(-shift)
	const q = num / den
	if (q === 0n) return '0'
	const qStr = q.toString()
	const prefix = pa.neg !== pb.neg ? '-' : ''
	if (precision === 0) return prefix + qStr
	const padded = qStr.padStart(precision + 1, '0')
	const intPart = padded.slice(0, padded.length - precision)
	const fracPart = padded.slice(padded.length - precision).replace(/0+$/, '')
	return fracPart.length === 0 ? prefix + intPart : `${prefix}${intPart}.${fracPart}`
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible stress tests.
 *
 * @param {number} seed
 */
function createRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * Generates a random decimal string with given digit count and scale.
 */
function randomDecimal(rng, digitCount, scale, allowNegative = true) {
	let digits = ''
	for (let i = 0; i < digitCount; i++) {
		const d = Math.floor(rng() * 10)
		digits += String(i === 0 && d === 0 ? 1 + Math.floor(rng() * 9) : d)
	}
	const sign = allowNegative && rng() < 0.45 ? '-' : ''
	if (scale === 0) return sign + digits
	if (scale >= digits.length) {
		return `${sign}0.${'0'.repeat(scale - digits.length)}${digits}`
	}
	const split = digits.length - scale
	return `${sign}${digits.slice(0, split)}.${digits.slice(split)}`
}

describe('divideDecimalRecursive', () => {
	describe('normal cases', () => {
		test('exact integer division', () => {
			assert.equal(divideDecimalRecursive('10', '2'), '5')
			assert.equal(divideDecimalRecursive('100', '25'), '4')
			assert.equal(divideDecimalRecursive('99999999999999999999', '3'), '33333333333333333333')
		})

		test('terminating decimal division', () => {
			assert.equal(divideDecimalRecursive('1', '4'), '0.25')
			assert.equal(divideDecimalRecursive('1', '8'), '0.125')
			assert.equal(divideDecimalRecursive('3.5', '0.5'), '7')
			assert.equal(divideDecimalRecursive('0.0005', '0.00002'), '25')
			assert.equal(divideDecimalRecursive('123.456', '0.12'), '1028.8')
		})

		test('repeating decimals with default and configurable precision', () => {
			assert.equal(divideDecimalRecursive('1', '3'), '0.33333333333333333333')
			assert.equal(divideDecimalRecursive('1', '3', 5), '0.33333')
			assert.equal(divideDecimalRecursive('2', '3', 6), '0.666666')
			assert.equal(divideDecimalRecursive('1', '7', 12), '0.142857142857')
			assert.equal(divideDecimalRecursive('22', '7', 10), '3.1428571428')
		})

		test('signed operands and non-canonical decimal syntax', () => {
			assert.equal(divideDecimalRecursive('-10', '4', 4), '-2.5')
			assert.equal(divideDecimalRecursive('10', '-4', 4), '-2.5')
			assert.equal(divideDecimalRecursive('-10', '-4', 4), '2.5')
			assert.equal(divideDecimalRecursive('+10.500', '+002.50', 4), '4.2')
			assert.equal(divideDecimalRecursive('.5', '2.', 4), '0.25')
			assert.equal(divideDecimalRecursive('-.75', '.25', 4), '-3')
		})
	})

	describe('edge cases', () => {
		test('zero dividend never produces negative zero', () => {
			assert.equal(divideDecimalRecursive('0', '5'), '0')
			assert.equal(divideDecimalRecursive('-0', '5'), '0')
			assert.equal(divideDecimalRecursive('0', '-5'), '0')
			assert.equal(divideDecimalRecursive('-0.000', '-123.45', 10), '0')
			assert.equal(divideDecimalRecursive('.0', '1', 0), '0')
		})

		test('negative quotient truncated to zero returns "0", not "-0"', () => {
			assert.equal(divideDecimalRecursive('-0.001', '10', 2), '0')
			assert.equal(divideDecimalRecursive('-1', '1000', 2), '0')
			assert.equal(divideDecimalRecursive('1', '-2', 0), '0')
		})

		test('precision = 0 returns integer quotient truncated toward zero', () => {
			assert.equal(divideDecimalRecursive('7', '2', 0), '3')
			assert.equal(divideDecimalRecursive('-7', '2', 0), '-3')
			assert.equal(divideDecimalRecursive('123.999', '1', 0), '123')
			assert.equal(divideDecimalRecursive('-123.999', '1', 0), '-123')
		})

		test('precision smaller than dividend scale', () => {
			assert.equal(divideDecimalRecursive('1.23456', '1', 2), '1.23')
			assert.equal(divideDecimalRecursive('0.0001234', '0.0001', 2), '1.23')
		})

		test('very small quotient with leading fractional zeros', () => {
			assert.equal(divideDecimalRecursive('1', '1000000000', 12), '0.000000001')
			assert.equal(divideDecimalRecursive('-1', '1000000000', 12), '-0.000000001')
		})

		test('Burnikel-Ziegler adversarial branches (A1 == D1 and negative remainder adjustments)', () => {
			// Triggers A1 == D1 in div3n2n and downward q adjustments across multi-limb boundaries
			const cases = [
				['99999999999999999999999999999999', '10000000000000001', 16],
				['100000000000000000000000000000000', '10000000000000001', 20],
				['5000000000000000000000000000000000000000', '5000000099999999', 24],
				['4999999999999999999999999999999999999999', '5000000099999999', 24],
				['500000000000000000000000000000000000000000000000', '50000000000000009999999999999999', 30],
				[
					'1' + '0'.repeat(160),
					'1' + '0'.repeat(79) + '1',
					40,
				],
				[
					'5' + '0'.repeat(199),
					'5' + '0'.repeat(63) + '9'.repeat(64),
					50,
				],
			]
			for (const [a, b, p] of cases) {
				assert.equal(
					divideDecimalRecursive(a, b, p),
					divideDecimalBigIntOracle(a, b, p),
					`Failed on ${a} / ${b} (precision=${p})`,
				)
			}
		})

		test('deep recursion with 300+ digit operands and Karatsuba threshold (> 64 digits)', () => {
			const a = '9'.repeat(260) + '.' + '123456789'.repeat(10)
			const b = '7'.repeat(140) + '.' + '987654321'.repeat(5)
			const precision = 80
			assert.equal(
				divideDecimalRecursive(a, b, precision),
				divideDecimalBigIntOracle(a, b, precision),
			)
		})
	})

	describe('input validation', () => {
		test('throws TypeError for non-string dividend or divisor', () => {
			for (const bad of [123, null, undefined, {}, [], 10n, true]) {
				assert.throws(() => divideDecimalRecursive(bad, '1'), TypeError)
				assert.throws(() => divideDecimalRecursive('1', bad), TypeError)
			}
		})

		test('throws RangeError for malformed decimal strings', () => {
			const malformed = [
				'',
				'   ',
				'.',
				'+.',
				'-.',
				'abc',
				'1.2.3',
				'1e5',
				'1E-5',
				'NaN',
				'Infinity',
				'-Infinity',
				' 12',
				'12 ',
				'--1',
				'++1',
				'1_000',
			]
			for (const bad of malformed) {
				assert.throws(() => divideDecimalRecursive(bad, '1'), RangeError, `dividend="${bad}"`)
				assert.throws(() => divideDecimalRecursive('1', bad), RangeError, `divisor="${bad}"`)
			}
		})

		test('throws RangeError on division by zero (including when dividend is zero)', () => {
			for (const zero of ['0', '-0', '+0', '0.0', '0.0000', '.0', '0.', '-0.00']) {
				assert.throws(() => divideDecimalRecursive('10', zero), /Division by zero/)
				assert.throws(() => divideDecimalRecursive('0', zero), /Division by zero/)
			}
		})

		test('throws TypeError or RangeError for invalid precision', () => {
			for (const badType of ['10', null, 10n, {}, []]) {
				assert.throws(() => divideDecimalRecursive('1', '2', badType), TypeError)
			}
			for (const badVal of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
				assert.throws(() => divideDecimalRecursive('1', '2', badVal), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		test('matches independent BigInt oracle across 100 deterministic pseudo-random cases', () => {
			const rng = createRng(0xdec1da7a)
			for (let i = 0; i < 100; i++) {
				const aLen = 1 + Math.floor(rng() * 140)
				const bLen = 1 + Math.floor(rng() * 120)
				const aScale = Math.floor(rng() * 40)
				const bScale = Math.floor(rng() * 40)
				const precision = Math.floor(rng() * 60)
				const a = randomDecimal(rng, aLen, aScale)
				const b = randomDecimal(rng, bLen, bScale)

				const actual = divideDecimalRecursive(a, b, precision)
				const expected = divideDecimalBigIntOracle(a, b, precision)
				assert.equal(actual, expected, `Case #${i}: ${a} / ${b} (p=${precision})`)
			}
		})

		test('satisfies truncation bounds |q * d| <= |n| < (|q| + 10^-p) * |d|', () => {
			const toScaledBigInt = (s) => {
				const body = s.startsWith('-') || s.startsWith('+') ? s.slice(1) : s
				const [iPart, fPart = ''] = body.split('.')
				return { val: BigInt(iPart + fPart || '0'), scale: fPart.length }
			}

			const pairs = [
				['355', '113', 30],
				['-98765432109876543210987654321.12345', '12345678901234567890.98765', 25],
				['0.0000000000123456789', '98765432100000000', 40],
				['1'.repeat(120), '3'.repeat(70), 35],
			]

			for (const [a, b, p] of pairs) {
				const qStr = divideDecimalRecursive(a, b, p)
				const pa = toScaledBigInt(a)
				const pb = toScaledBigInt(b)
				const pq = toScaledBigInt(qStr)

				// Compare in common scale S = max(pa.scale, pb.scale + max(pq.scale, p))
				const commonScale = Math.max(pa.scale, pb.scale + Math.max(pq.scale, p))
				const absN = pa.val * 10n ** BigInt(commonScale - pa.scale)
				const qTimesD = pq.val * pb.val * 10n ** BigInt(commonScale - pq.scale - pb.scale)
				const ulpTimesD = pb.val * 10n ** BigInt(commonScale - p - pb.scale)

				assert.ok(qTimesD <= absN, `Lower bound failed for ${a} / ${b}`)
				assert.ok(absN < qTimesD + ulpTimesD, `Upper bound failed for ${a} / ${b}`)
			}
		})
	})
})
