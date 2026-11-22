import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { log10FloatIterative } from './log10FloatIterative.js'

const REL_TOL = 1e-14
const ABS_TOL = 1e-14

function assertClose(actual, expected, label = '') {
	const diff = Math.abs(actual - expected)
	const limit = Math.max(ABS_TOL, REL_TOL * Math.abs(expected))
	assert.ok(
		diff <= limit,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${limit} of ${expected} (diff=${diff})`,
	)
}

describe('log10FloatIterative', () => {
	describe('normal cases: powers of 10', () => {
		const exponents = [-15, -10, -6, -3, -2, -1, 1, 2, 3, 6, 10, 15, 50, 100, -100]
		for (const exp of exponents) {
			it(`computes log10(1e${exp}) ≈ ${exp}`, () => {
				const x = 10 ** exp
				const actual = log10FloatIterative(x)
				assertClose(actual, exp, `log10(1e${exp})`)
			})
		}
	})

	describe('normal cases: arbitrary positive numbers', () => {
		const samples = [
			0.0075,
			0.25,
			0.5,
			Math.SQRT1_2,
			0.999999999999,
			1.000000000001,
			Math.SQRT2,
			2,
			Math.E,
			3,
			Math.PI,
			5,
			7.5,
			42.123456789,
			123456.789,
			9876543210.123,
		]

		for (const x of samples) {
			it(`matches Math.log10(${x})`, () => {
				const actual = log10FloatIterative(x)
				const expected = Math.log10(x)
				assertClose(actual, expected, `log10(${x})`)
			})
		}
	})

	describe('edge cases: special valid inputs', () => {
		it('returns exact +0 for x = 1', () => {
			const result = log10FloatIterative(1)
			assert.ok(Object.is(result, 0), `expected +0, got ${result}`)
		})

		it('handles tiny positive numbers including subnormals', () => {
			const tinyValues = [
				1 + Number.EPSILON,
				1 - Number.EPSILON,
				1e-200,
				1e-300,
				2.2250738585072014e-308, // smallest positive normal float64
				1e-315, // subnormal
				Number.MIN_VALUE, // 5e-324, smallest positive subnormal float64
			]
			for (const x of tinyValues) {
				const actual = log10FloatIterative(x)
				const expected = Math.log10(x)
				assertClose(actual, expected, `log10(${x})`)
			}
		})

		it('handles huge positive numbers up to Number.MAX_VALUE', () => {
			const hugeValues = [
				Number.MAX_SAFE_INTEGER,
				1e150,
				1e300,
				1e308,
				Number.MAX_VALUE,
			]
			for (const x of hugeValues) {
				const actual = log10FloatIterative(x)
				const expected = Math.log10(x)
				assertClose(actual, expected, `log10(${x})`)
			}
		})

		it('returns Infinity for +Infinity', () => {
			assert.equal(log10FloatIterative(Infinity), Infinity)
		})

		it('returns NaN for NaN', () => {
			assert.ok(Number.isNaN(log10FloatIterative(NaN)))
		})
	})

	describe('edge cases: domain errors (x <= 0)', () => {
		const nonPositives = [0, -0, -Number.MIN_VALUE, -0.5, -1, -10, -1e300, -Infinity]
		for (const x of nonPositives) {
			it(`throws RangeError for ${Object.is(x, -0) ? '-0' : String(x)}`, () => {
				assert.throws(() => log10FloatIterative(x), RangeError)
			})
		}
	})

	describe('edge cases: invalid input types', () => {
		const invalidInputs = [
			['string', '10'],
			['empty string', ''],
			['null', null],
			['undefined', undefined],
			['boolean true', true],
			['boolean false', false],
			['object', {}],
			['array', [10]],
			['bigint', 10n],
			['symbol', Symbol('10')],
			['function', () => 10],
		]
		for (const [label, value] of invalidInputs) {
			it(`throws TypeError for ${label}`, () => {
				assert.throws(() => log10FloatIterative(value), TypeError)
			})
		}
	})

	describe('cross-checks against Math.log10 and inverse 10 ** y ≈ x', () => {
		it('matches Math.log10 and satisfies 10 ** y ≈ x across a wide sweep', () => {
			const testValues = []
			for (let exp = -250; exp <= 250; exp += 17) {
				for (const mantissa of [1.0, 1.37, 2.718281828459045, 5.5, 9.99]) {
					testValues.push(mantissa * 10 ** exp)
				}
			}

			for (const x of testValues) {
				const y = log10FloatIterative(x)
				const expected = Math.log10(x)
				assertClose(y, expected, `Math.log10 cross-check for ${x}`)

				const reconstructed = 10 ** y
				const relErr = Math.abs(reconstructed - x) / x
				assert.ok(
					relErr < 1e-12,
					`10 ** log10(${x}) = ${reconstructed} differed from ${x} (relErr=${relErr})`,
				)
			}
		})
	})
})
