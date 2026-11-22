import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sqrtDecimalRecursive } from './sqrtDecimalRecursive.js'

/**
 * Parse a non-negative decimal string (including scientific notation) into
 * `{ num: bigint, den: bigint }` representing exact rational `num / den`.
 */
function parseToRational(str) {
	const m = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(str.trim())
	assert.ok(m, `Invalid test decimal: ${str}`)
	const intPart = m[2] ?? ''
	const fracPart = m[3] ?? m[4] ?? ''
	const exp = (m[5] ? Number(m[5]) : 0) - fracPart.length
	const digits = (intPart + fracPart).replace(/^0+/, '') || '0'
	const num = BigInt(digits)
	if (exp >= 0) {
		return { num: num * 10n ** BigInt(exp), den: 1n }
	}
	return { num, den: 10n ** BigInt(-exp) }
}

/**
 * Verify that `resultStr` is the exact half-up rounded square root of `inputStr`
 * at `precision` decimal places by squaring the half-ULP bounds:
 *   max(0, r - 0.5 * 10^-p)^2 <= x < (r + 0.5 * 10^-p)^2
 */
function assertExactRoundedSqrt(inputStr, resultStr, precision) {
	const x = parseToRational(inputStr)
	const r = parseToRational(resultStr)

	// Express r as R / 10^p where R is an integer
	const scale = 10n ** BigInt(precision)
	assert.equal(
		(r.num * scale) % r.den,
		0n,
		`Result ${resultStr} has more than ${precision} decimal places`,
	)
	const R = (r.num * scale) / r.den

	// Multiply inequality by 4 * 10^(2p) * x.den:
	//   (max(0, 2R - 1))^2 * x.den <= 4 * x.num * 10^(2p) < (2R + 1)^2 * x.den
	const lowerRoot = R === 0n ? 0n : 2n * R - 1n
	const upperRoot = 2n * R + 1n
	const target = 4n * x.num * scale * scale
	const lowerBound = lowerRoot * lowerRoot * x.den
	const upperBound = upperRoot * upperRoot * x.den

	assert.ok(
		lowerBound <= target && target < upperBound,
		`Bounds failed for sqrt(${inputStr}, ${precision}) = ${resultStr}`,
	)
}

describe('sqrtDecimalRecursive', () => {
	test('handles zero and signed zero forms', () => {
		assert.equal(sqrtDecimalRecursive('0'), '0')
		assert.equal(sqrtDecimalRecursive('0.0'), '0')
		assert.equal(sqrtDecimalRecursive('0.0000000000'), '0')
		assert.equal(sqrtDecimalRecursive('-0'), '0')
		assert.equal(sqrtDecimalRecursive('-0.000'), '0')
		assert.equal(sqrtDecimalRecursive('+0'), '0')
		assert.equal(sqrtDecimalRecursive('0e100'), '0')
		assert.equal(sqrtDecimalRecursive('0e-100'), '0')
		assert.equal(sqrtDecimalRecursive('0', 0), '0')
		assert.equal(sqrtDecimalRecursive('0', 50), '0')
		assert.equal(sqrtDecimalRecursive(0), '0')
		assert.equal(sqrtDecimalRecursive(-0), '0')
		assert.equal(sqrtDecimalRecursive(0n), '0')
	})

	test('computes exact perfect squares (integers, decimals, and large values)', () => {
		assert.equal(sqrtDecimalRecursive('1'), '1')
		assert.equal(sqrtDecimalRecursive('4'), '2')
		assert.equal(sqrtDecimalRecursive('9'), '3')
		assert.equal(sqrtDecimalRecursive('16'), '4')
		assert.equal(sqrtDecimalRecursive('25'), '5')
		assert.equal(sqrtDecimalRecursive('144'), '12')
		assert.equal(sqrtDecimalRecursive('625'), '25')
		assert.equal(sqrtDecimalRecursive('15241578750190521'), '123456789')

		assert.equal(sqrtDecimalRecursive('0.25'), '0.5')
		assert.equal(sqrtDecimalRecursive('.25'), '0.5')
		assert.equal(sqrtDecimalRecursive('4.'), '2')
		assert.equal(sqrtDecimalRecursive('+9'), '3')
		assert.equal(sqrtDecimalRecursive('  16  '), '4')
		assert.equal(sqrtDecimalRecursive('2.25'), '1.5')
		assert.equal(sqrtDecimalRecursive('0.01'), '0.1')
		assert.equal(sqrtDecimalRecursive('0.000625'), '0.025')
		assert.equal(sqrtDecimalRecursive('1e-6'), '0.001')
		assert.equal(sqrtDecimalRecursive('4e10'), '200000')
		assert.equal(sqrtDecimalRecursive(49), '7')
		assert.equal(sqrtDecimalRecursive(81n), '9')

		// 60-digit perfect square
		const root = '987654321098765432109876543210987654321098765432109876543210'
		const square = (BigInt(root) * BigInt(root)).toString()
		assert.equal(sqrtDecimalRecursive(square, 20), root)
	})

	test('computes irrational sqrt(2) to default 20, 50, and 100 decimal places', () => {
		// Exact digits of sqrt(2):
		// 1.414213562373095048801688724209698078569671875376948073176679737990732478462107038850387534327641572735...
		// At 20 digits, 20th digit is 0 (21st is 1), so trailing zero is stripped.
		assert.equal(sqrtDecimalRecursive('2'), '1.4142135623730950488')
		// At 50 digits, 50th digit is 4 and 51st is 8 -> rounds half-up to ...695
		const sqrt2To50 = '1.41421356237309504880168872420969807856967187537695'
		assert.equal(sqrtDecimalRecursive('2', 50), sqrt2To50)
		assertExactRoundedSqrt('2', sqrt2To50, 50)

		// At 100 digits, 100th digit is 7 and 101st is 3 -> stays ...727
		const sqrt2To100 =
			'1.4142135623730950488016887242096980785696718753769480731766797379907324784621070388503875343276415727'
		assert.equal(sqrtDecimalRecursive('2', 100), sqrt2To100)
		assertExactRoundedSqrt('2', sqrt2To100, 100)
	})

	test('computes other known irrational roots to 50 decimal places', () => {
		// sqrt(3) = 1.732050807568877293527446341505872366942805253810380628...
		const sqrt3To50 = '1.73205080756887729352744634150587236694280525381038'
		assert.equal(sqrtDecimalRecursive('3', 50), sqrt3To50)
		assertExactRoundedSqrt('3', sqrt3To50, 50)

		// sqrt(5) = 2.236067977499789696409173668731276235440618359611525724...
		const sqrt5To50 = '2.23606797749978969640917366873127623544061835961153'
		assert.equal(sqrtDecimalRecursive('5', 50), sqrt5To50)
		assertExactRoundedSqrt('5', sqrt5To50, 50)

		// sqrt(10) = 3.162277660168379331998893544432718533719555139325216826...
		const sqrt10To50 = '3.16227766016837933199889354443271853371955513932522'
		assert.equal(sqrtDecimalRecursive('10', 50), sqrt10To50)
		assertExactRoundedSqrt('10', sqrt10To50, 50)
	})

	test('handles precision = 0 and exact half-up rounding boundaries', () => {
		assert.equal(sqrtDecimalRecursive('2', 0), '1')
		assert.equal(sqrtDecimalRecursive('3', 0), '2')
		assert.equal(sqrtDecimalRecursive('0.25', 0), '1')
		assert.equal(sqrtDecimalRecursive('0.24999999', 0), '0')
		assert.equal(sqrtDecimalRecursive('2.25', 0), '2')
		assert.equal(sqrtDecimalRecursive('2.24999999', 0), '1')

		// Halfway boundary at fractional precision
		assert.equal(sqrtDecimalRecursive('0.000025', 2), '0.01')
		assert.equal(sqrtDecimalRecursive('0.000024999999', 2), '0')

		// Rounding carry across decimal point
		assert.equal(sqrtDecimalRecursive('0.9999999999', 2), '1')
		assert.equal(sqrtDecimalRecursive('99.99999999', 2), '10')
	})

	test('handles very small and very large decimals', () => {
		// 4 * 10^-40 -> 2 * 10^-20
		const smallExact = `0.${'0'.repeat(39)}4`
		assert.equal(sqrtDecimalRecursive(smallExact, 20), `0.${'0'.repeat(19)}2`)

		// 2 * 10^-40 -> sqrt(2) * 10^-20 to 60 decimal places
		const smallIrrational = `0.${'0'.repeat(39)}2`
		const smallResult = sqrtDecimalRecursive(smallIrrational, 60)
		assert.equal(
			smallResult,
			`0.${'0'.repeat(19)}14142135623730950488016887242096980785697`,
		)
		assertExactRoundedSqrt(smallIrrational, smallResult, 60)

		// Extremely small value well below target precision underflows cleanly to '0'
		assert.equal(sqrtDecimalRecursive('1e-100000', 20), '0')

		// 4 * 10^100 -> 2 * 10^50
		const largeExact = `4${'0'.repeat(100)}`
		assert.equal(sqrtDecimalRecursive(largeExact, 20), `2${'0'.repeat(50)}`)

		// 2 * 10^100 -> sqrt(2) * 10^50 to 30 decimal places
		const largeIrrational = `2${'0'.repeat(100)}`
		const largeResult = sqrtDecimalRecursive(largeIrrational, 30)
		assert.equal(
			largeResult,
			'141421356237309504880168872420969807856967187537694.807317667973799073247846210704',
		)
		assertExactRoundedSqrt(largeIrrational, largeResult, 30)

		// Mixed large integer + many fractional digits
		const mixed = '123456789012345678901234567890.098765432109876543210987654321'
		const mixedResult = sqrtDecimalRecursive(mixed, 40)
		assertExactRoundedSqrt(mixed, mixedResult, 40)
	})

	test('cross-checks squaring the result back across many inputs and precisions', () => {
		const inputs = [
			'0.00000007',
			'0.1',
			'0.5',
			'0.9999',
			'1.5',
			'2',
			'3.141592653589793238462643383279',
			'7',
			'10.25',
			'99.99',
			'123456.789012345',
			'99999999999999999999999999999999',
			'1.23456789e-25',
			'9.87654321e+35',
		]
		const precisions = [0, 1, 5, 20, 45]

		for (const input of inputs) {
			for (const p of precisions) {
				const res = sqrtDecimalRecursive(input, p)
				assertExactRoundedSqrt(input, res, p)
			}
		}

		// Exhaustive check over integers 0..100
		for (let i = 0; i <= 100; i++) {
			const s = String(i)
			assertExactRoundedSqrt(s, sqrtDecimalRecursive(s, 0), 0)
			assertExactRoundedSqrt(s, sqrtDecimalRecursive(s, 15), 15)
		}
	})

	test('throws on negative inputs', () => {
		for (const neg of ['-1', '-0.000001', '-1e-50', '-4', '-999999999999999999999', -1, -0.5, -4n]) {
			assert.throws(() => sqrtDecimalRecursive(neg), RangeError)
		}
	})

	test('throws on invalid decimal formats and invalid types', () => {
		for (const bad of [
			'',
			'   ',
			'abc',
			'1.2.3',
			'.',
			'+.',
			'-.',
			'--4',
			'++4',
			'1e',
			'1e+',
			'1e-',
			'e5',
			'1_000',
			'NaN',
			'Infinity',
			'-Infinity',
			'1 2',
		]) {
			assert.throws(() => sqrtDecimalRecursive(bad), SyntaxError)
		}

		for (const badType of [null, undefined, {}, [], true, false, Symbol('x')]) {
			assert.throws(() => sqrtDecimalRecursive(badType), TypeError)
		}

		for (const nonFinite of [NaN, Infinity, -Infinity]) {
			assert.throws(() => sqrtDecimalRecursive(nonFinite), RangeError)
		}
	})

	test('throws on invalid precision values', () => {
		for (const badPrec of [-1, -100, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => sqrtDecimalRecursive('4', badPrec), RangeError)
		}
		for (const badType of ['20', null, {}, true]) {
			assert.throws(() => sqrtDecimalRecursive('4', badType), TypeError)
		}
	})
})
