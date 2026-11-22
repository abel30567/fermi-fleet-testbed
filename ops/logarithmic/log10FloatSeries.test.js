import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { log10FloatSeries } from './log10FloatSeries.js'

/**
 * Helper to assert two numbers are within a tight relative/absolute tolerance.
 * @param {number} actual
 * @param {number} expected
 * @param {number} [relTol=1e-15]
 * @param {number} [absTol=1e-15]
 */
function assertClose(actual, expected, relTol = 1e-15, absTol = 1e-15) {
	assert.equal(typeof actual, 'number')
	assert.ok(Number.isFinite(actual), `Expected finite result, got ${actual}`)
	const diff = Math.abs(actual - expected)
	const bound = Math.max(absTol, relTol * Math.abs(expected))
	assert.ok(
		diff <= bound,
		`Expected ${actual} to be close to ${expected} (diff=${diff}, bound=${bound})`
	)
}

describe('log10FloatSeries', () => {
	describe('exact and canonical values', () => {
		it('returns exact +0 for x = 1', () => {
			const res = log10FloatSeries(1)
			assert.ok(Object.is(res, 0), `Expected +0, got ${res}`)
		})

		it('matches integer powers of 10 across the full float64 exponent range', () => {
			for (let exp = -307; exp <= 308; exp++) {
				const x = Number(`1e${exp}`)
				const actual = log10FloatSeries(x)
				assertClose(actual, exp, 1e-15, 1e-15)
			}
		})

		it('matches common non-power-of-10 values against Math.log10', () => {
			const values = [
				0.00123456789,
				0.1,
				0.25,
				0.5,
				Math.SQRT1_2,
				Math.SQRT2,
				2,
				Math.E,
				Math.PI,
				5,
				7,
				12.3456789,
				42,
				100.5,
				999.999,
				1024,
				65536,
				1e6 + 0.12345,
			]
			for (const x of values) {
				assertClose(log10FloatSeries(x), Math.log10(x), 1e-15, 1e-15)
			}
		})
	})

	describe('values near 1 and precision sensitivity', () => {
		it('retains accuracy for values very close to 1 (above and below)', () => {
			const deltas = [
				1e-1, 1e-2, 1e-3, 1e-5, 1e-7, 1e-9, 1e-11, 1e-13, 1e-15,
				Number.EPSILON,
				-Number.EPSILON / 2,
				-1e-15, -1e-13, -1e-11, -1e-9, -1e-7, -1e-5, -1e-3, -1e-1,
			]
			for (const d of deltas) {
				const x = 1 + d
				const actual = log10FloatSeries(x)
				const expected = Math.log10(x)
				assertClose(actual, expected, 1e-14, 1e-30)
			}
		})

		it('retains accuracy across range-reduction boundary near sqrt(2) and sqrt(1/2)', () => {
			const boundaries = [
				Math.SQRT2 - 1e-15,
				Math.SQRT2,
				Math.SQRT2 + 1e-15,
				Math.SQRT1_2 - 1e-15,
				Math.SQRT1_2,
				Math.SQRT1_2 + 1e-15,
				2 - Number.EPSILON,
				2,
				2 + 2 * Number.EPSILON,
			]
			for (const x of boundaries) {
				assertClose(log10FloatSeries(x), Math.log10(x), 1e-15, 1e-15)
			}
		})
	})

	describe('extreme magnitudes and IEEE-754 subnormals', () => {
		it('handles very large positive floats up to Number.MAX_VALUE', () => {
			const largeValues = [
				1e100,
				1e200,
				1e300,
				1e308,
				Number.MAX_VALUE / 2,
				Number.MAX_VALUE,
			]
			for (const x of largeValues) {
				assertClose(log10FloatSeries(x), Math.log10(x), 1e-15, 1e-15)
			}
		})

		it('handles very small positive normal floats down to 2^-1022', () => {
			const minNormal = 2 ** -1022
			const smallValues = [1e-100, 1e-200, 1e-300, 1e-307, minNormal * 2, minNormal]
			for (const x of smallValues) {
				assertClose(log10FloatSeries(x), Math.log10(x), 1e-15, 1e-15)
			}
		})

		it('handles subnormal positive floats down to Number.MIN_VALUE (2^-1074)', () => {
			const subnormals = [
				2 ** -1023,
				2 ** -1030,
				2 ** -1050,
				2 ** -1070,
				Number.MIN_VALUE * 1000,
				Number.MIN_VALUE * 10,
				Number.MIN_VALUE * 2,
				Number.MIN_VALUE,
				1e-310,
				1e-320,
				1e-323,
			]
			for (const x of subnormals) {
				assert.ok(x > 0 && x < 2 ** -1022, `Expected subnormal, got ${x}`)
				assertClose(log10FloatSeries(x), Math.log10(x), 1e-15, 1e-15)
			}
		})
	})

	describe('algebraic identities and inverse cross-checks', () => {
		it('satisfies 10^log10FloatSeries(x) ≈ x across wide-ranging inputs', () => {
			const samples = [
				1e-300,
				1e-150,
				1e-12,
				0.00073,
				0.3333333333333333,
				0.99999,
				1,
				1.00001,
				3.141592653589793,
				987654.321,
				1e50,
				1e150,
				1e300,
			]
			for (const x of samples) {
				const y = log10FloatSeries(x)
				const reconstructed = 10 ** y
				assertClose(reconstructed, x, 1e-12, 0)
			}
		})

		it('satisfies product and quotient identities: log10(a*b) ≈ log10(a) + log10(b)', () => {
			const pairs = [
				[2, 5],
				[3.5, 7.25],
				[0.0125, 800],
				[1e-40, 1e65],
				[Math.PI, Math.E],
			]
			for (const [a, b] of pairs) {
				assertClose(
					log10FloatSeries(a * b),
					log10FloatSeries(a) + log10FloatSeries(b),
					1e-14,
					1e-14
				)
				assertClose(
					log10FloatSeries(a / b),
					log10FloatSeries(a) - log10FloatSeries(b),
					1e-14,
					1e-14
				)
			}
		})

		it('is strictly monotonically increasing across dense samples', () => {
			let prev = -Infinity
			for (let i = -300; i <= 300; i += 7) {
				for (const mult of [1, 1.5, 3.7, 8.9]) {
					const x = mult * Number(`1e${i}`)
					const y = log10FloatSeries(x)
					assert.ok(y > prev, `Expected monotonic increase at x=${x}: ${y} <= ${prev}`)
					assertClose(y, Math.log10(x), 1e-15, 1e-15)
					prev = y
				}
			}
		})
	})

	describe('input validation and error handling', () => {
		it('throws RangeError for x <= 0 (0, -0, negative values)', () => {
			for (const bad of [0, -0, -Number.MIN_VALUE, -1e-100, -1, -10, -Number.MAX_VALUE]) {
				assert.throws(
					() => log10FloatSeries(bad),
					{ name: 'RangeError' },
					`Expected RangeError for ${bad}`
				)
			}
		})

		it('throws RangeError for non-finite numbers (NaN, Infinity, -Infinity)', () => {
			for (const bad of [NaN, Infinity, -Infinity]) {
				assert.throws(
					() => log10FloatSeries(bad),
					{ name: 'RangeError' },
					`Expected RangeError for ${bad}`
				)
			}
		})

		it('throws TypeError for non-number inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				'10',
				'1',
				'',
				true,
				false,
				10n,
				{},
				[10],
				Symbol('10'),
				() => 10,
			]
			for (const bad of invalidInputs) {
				assert.throws(
					() => log10FloatSeries(bad),
					{ name: 'TypeError' },
					`Expected TypeError for ${String(bad)}`
				)
			}
		})
	})
})
