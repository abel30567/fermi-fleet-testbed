import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { nthRootDecimalRecursive } from './nthRootDecimalRecursive.js'

/**
 * Parses a plain decimal string (with optional sign and scientific notation)
 * into an exact rational `{ num, den }` with `den = 10 ** k`.
 */
function parseRational(str) {
	const match = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(str.trim())
	assert.ok(match, `Expected valid decimal string, got: ${str}`)
	const [, sign, intPart, fracA, fracB, expStr] = match
	const frac = fracA ?? fracB ?? ''
	const digits = `${intPart ?? ''}${frac}`
	const exp = (expStr ? Number(expStr) : 0) - frac.length
	let num = BigInt(digits)
	if (sign === '-') num = -num
	if (exp >= 0) {
		return { num: num * 10n ** BigInt(exp), den: 1n }
	}
	return { num, den: 10n ** BigInt(-exp) }
}

/**
 * Verifies that `resultStr` is the exact `n`-th root of `inputStr` rounded to
 * `precision` decimal places by raising `(result - 0.5*10^-p)` and
 * `(result + 0.5*10^-p)` to the `n`-th power and confirming they bracket `inputStr`.
 */
function assertRootBracketed(inputStr, n, precision, resultStr) {
	const x = parseRational(inputStr)
	const r = parseRational(resultStr)
	const deg = BigInt(n)

	// Half-ulp = 1 / (2 * 10 ** precision)
	const halfUlpDen = 2n * 10n ** BigInt(precision)

	// Common denominator for r ± halfUlp
	const commonDen = r.den * halfUlpDen
	const rScaled = r.num * halfUlpDen
	const loNum = rScaled - r.den
	const hiNum = rScaled + r.den

	const loPowNum = loNum ** deg
	const hiPowNum = hiNum ** deg
	const powDen = commonDen ** deg

	// Check lo^n <= x <= hi^n via cross-multiplication (powDen > 0, x.den > 0)
	// For even n and negative loNum (when result is near 0), clamp lo to 0.
	const effectiveLoPowNum = deg % 2n === 0n && loNum < 0n ? 0n : loPowNum

	assert.ok(
		effectiveLoPowNum * x.den <= x.num * powDen,
		`Lower bound check failed for nthRoot(${inputStr}, ${n}, ${precision}) = ${resultStr}`,
	)
	assert.ok(
		x.num * powDen <= hiPowNum * x.den,
		`Upper bound check failed for nthRoot(${inputStr}, ${n}, ${precision}) = ${resultStr}`,
	)
}

describe('nthRootDecimalRecursive', () => {
	test('computes exact integer and decimal roots', () => {
		assert.equal(nthRootDecimalRecursive('0', 2), '0')
		assert.equal(nthRootDecimalRecursive('0', 3), '0')
		assert.equal(nthRootDecimalRecursive('-0.000', 2), '0')
		assert.equal(nthRootDecimalRecursive('1', 2), '1')
		assert.equal(nthRootDecimalRecursive('1', 7), '1')
		assert.equal(nthRootDecimalRecursive('4', 2), '2')
		assert.equal(nthRootDecimalRecursive('9', 2), '3')
		assert.equal(nthRootDecimalRecursive('27', 3), '3')
		assert.equal(nthRootDecimalRecursive('81', 4), '3')
		assert.equal(nthRootDecimalRecursive('32', 5), '2')
		assert.equal(nthRootDecimalRecursive('1024', 10), '2')
		assert.equal(nthRootDecimalRecursive('0.25', 2), '0.5')
		assert.equal(nthRootDecimalRecursive('0.0001', 2), '0.01')
		assert.equal(nthRootDecimalRecursive('0.000001', 3), '0.01')
		assert.equal(nthRootDecimalRecursive('0.00000001', 4), '0.01')
		assert.equal(nthRootDecimalRecursive('15.625', 3), '2.5')
		assert.equal(nthRootDecimalRecursive('1000000000000000000000000000000', 3), '10000000000')
		assert.equal(nthRootDecimalRecursive('+64', 6), '2')
		assert.equal(nthRootDecimalRecursive('.0625', 4), '0.5')
		assert.equal(nthRootDecimalRecursive('16.', 4), '2')
		assert.equal(nthRootDecimalRecursive('1.6e-7', 4, 10), '0.02')
	})

	test('computes huge exact roots requiring deep recursion', () => {
		const base = 123456789012345678901234567890n
		const cubed = (base ** 3n).toString()
		assert.equal(nthRootDecimalRecursive(cubed, 3, 20), base.toString())

		const fifth = (base ** 5n).toString()
		assert.equal(nthRootDecimalRecursive(fifth, 5, 10), base.toString())
	})

	test('handles n = 1 accurately with rounding and arbitrary precision', () => {
		assert.equal(nthRootDecimalRecursive('0', 1), '0')
		assert.equal(nthRootDecimalRecursive('42', 1), '42')
		assert.equal(nthRootDecimalRecursive('-42.125', 1), '-42.125')
		assert.equal(nthRootDecimalRecursive('123.456789', 1, 4), '123.4568')
		assert.equal(nthRootDecimalRecursive('-123.45675', 1, 4), '-123.4568')
		assert.equal(nthRootDecimalRecursive('0.5', 1, 0), '1')
		assert.equal(nthRootDecimalRecursive('0.49999999999999999999', 1, 0), '0')
	})

	test('supports odd roots of negative values', () => {
		assert.equal(nthRootDecimalRecursive('-1', 3), '-1')
		assert.equal(nthRootDecimalRecursive('-8', 3), '-2')
		assert.equal(nthRootDecimalRecursive('-27', 3), '-3')
		assert.equal(nthRootDecimalRecursive('-32', 5), '-2')
		assert.equal(nthRootDecimalRecursive('-0.008', 3), '-0.2')
		assert.equal(nthRootDecimalRecursive('-2187', 7), '-3')

		const negCbrt2 = nthRootDecimalRecursive('-2', 3, 50)
		assert.equal(negCbrt2, '-1.25992104989487316476721060727822835057025146470151')
		assertRootBracketed('-2', 3, 50, negCbrt2)

		const negFifth7 = nthRootDecimalRecursive('-7', 5, 45)
		assert.ok(negFifth7.startsWith('-1.47577316159455206927'))
		assertRootBracketed('-7', 5, 45, negFifth7)
	})

	test('computes irrational roots to 40+ digits matching known constants', () => {
		// sqrt(2) to 50 decimal places
		const sqrt2 = nthRootDecimalRecursive('2', 2, 50)
		assert.equal(sqrt2, '1.41421356237309504880168872420969807856967187537695')
		assertRootBracketed('2', 2, 50, sqrt2)

		// sqrt(3) to 50 decimal places
		const sqrt3 = nthRootDecimalRecursive('3', 2, 50)
		assert.equal(sqrt3, '1.73205080756887729352744634150587236694280525381038')
		assertRootBracketed('3', 2, 50, sqrt3)

		// sqrt(5) to 50 decimal places
		const sqrt5 = nthRootDecimalRecursive('5', 2, 50)
		assert.equal(sqrt5, '2.23606797749978969640917366873127623544061835961153')
		assertRootBracketed('5', 2, 50, sqrt5)

		// cbrt(2) to 50 decimal places
		const cbrt2 = nthRootDecimalRecursive('2', 3, 50)
		assert.equal(cbrt2, '1.25992104989487316476721060727822835057025146470151')
		assertRootBracketed('2', 3, 50, cbrt2)

		// Default precision (20 decimal places; trailing 0 in 20th place of sqrt(2) trimmed)
		assert.equal(nthRootDecimalRecursive('2', 2), '1.4142135623730950488')
	})

	test('cross-checks diverse irrational roots by raising result to the nth power', () => {
		const cases = [
			['10', 2, 45],
			['0.5', 2, 45],
			['0.000123456', 3, 42],
			['999999.123456789', 4, 40],
			['17', 5, 50],
			['12345.6789', 7, 45],
			['2', 11, 45],
			['-100.25', 5, 42],
			['0.000000007', 3, 50],
			['2', 2, 100],
		]

		for (const [val, n, prec] of cases) {
			const root = nthRootDecimalRecursive(val, n, prec)
			assertRootBracketed(val, n, prec, root)
		}
	})

	test('handles rounding edge cases and precision = 0', () => {
		assert.equal(nthRootDecimalRecursive('0.5', 2, 0), '1')
		assert.equal(nthRootDecimalRecursive('0.25', 2, 0), '1')
		assert.equal(nthRootDecimalRecursive('0.24999999999999999999', 2, 0), '0')
		assert.equal(nthRootDecimalRecursive('1e-500', 5, 20), '0')
		assert.equal(nthRootDecimalRecursive('-1e-500', 5, 20), '0')
		assert.equal(nthRootDecimalRecursive('2', 50, 40), nthRootDecimalRecursive(2, 50n, 40))
		assertRootBracketed('2', 50, 40, nthRootDecimalRecursive('2', 50, 40))
	})

	test('rejects invalid inputs with appropriate errors', () => {
		// Even root of negative number
		assert.throws(() => nthRootDecimalRecursive('-1', 2), RangeError)
		assert.throws(() => nthRootDecimalRecursive('-16', 4), RangeError)
		assert.throws(() => nthRootDecimalRecursive('-0.0001', 2), RangeError)
		assert.throws(() => nthRootDecimalRecursive('-4', 6, 10), RangeError)

		// n <= 0 or non-integer n
		assert.throws(() => nthRootDecimalRecursive('8', 0), RangeError)
		assert.throws(() => nthRootDecimalRecursive('0', 0), RangeError)
		assert.throws(() => nthRootDecimalRecursive('8', -3), RangeError)
		assert.throws(() => nthRootDecimalRecursive('8', 2.5), RangeError)
		assert.throws(() => nthRootDecimalRecursive('8', NaN), RangeError)
		assert.throws(() => nthRootDecimalRecursive('8', Infinity), RangeError)
		assert.throws(() => nthRootDecimalRecursive('8', 0n), RangeError)
		assert.throws(() => nthRootDecimalRecursive('8', -2n), RangeError)
		assert.throws(() => nthRootDecimalRecursive('8', '2'), TypeError)
		assert.throws(() => nthRootDecimalRecursive('8', null), TypeError)

		// Invalid value
		assert.throws(() => nthRootDecimalRecursive('', 2), RangeError)
		assert.throws(() => nthRootDecimalRecursive('   ', 2), RangeError)
		assert.throws(() => nthRootDecimalRecursive('abc', 2), RangeError)
		assert.throws(() => nthRootDecimalRecursive('1.2.3', 2), RangeError)
		assert.throws(() => nthRootDecimalRecursive('.', 2), RangeError)
		assert.throws(() => nthRootDecimalRecursive('-', 3), RangeError)
		assert.throws(() => nthRootDecimalRecursive(NaN, 2), RangeError)
		assert.throws(() => nthRootDecimalRecursive(Infinity, 2), RangeError)
		assert.throws(() => nthRootDecimalRecursive(-Infinity, 3), RangeError)
		assert.throws(() => nthRootDecimalRecursive(null, 2), TypeError)
		assert.throws(() => nthRootDecimalRecursive(undefined, 2), TypeError)
		assert.throws(() => nthRootDecimalRecursive({}, 2), TypeError)
		assert.throws(() => nthRootDecimalRecursive(true, 2), TypeError)

		// Invalid precision
		assert.throws(() => nthRootDecimalRecursive('2', 2, -1), RangeError)
		assert.throws(() => nthRootDecimalRecursive('2', 2, 1.5), RangeError)
		assert.throws(() => nthRootDecimalRecursive('2', 2, NaN), RangeError)
		assert.throws(() => nthRootDecimalRecursive('2', 2, Infinity), RangeError)
		assert.throws(() => nthRootDecimalRecursive('2', 2, '20'), TypeError)
		assert.throws(() => nthRootDecimalRecursive('2', 2, null), TypeError)
	})
})
