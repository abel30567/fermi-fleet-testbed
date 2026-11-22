import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { log2FloatSeries } from './log2FloatSeries.js'

/**
 * Asserts that `actual` is close to `expected` within a relative/absolute tolerance.
 */
function assertClose(actual, expected, relTol = 1e-14, absTol = 1e-15, label = '') {
	const diff = Math.abs(actual - expected)
	const limit = Math.max(absTol, relTol * Math.abs(expected))
	assert.ok(
		diff <= limit,
		`${label ? label + ': ' : ''}expected ${actual} to be within ${limit} of ${expected} (diff=${diff})`
	)
}

describe('log2FloatSeries', () => {
	describe('exact powers of 2 and x = 1', () => {
		it('returns exact 0 for x = 1', () => {
			assert.equal(log2FloatSeries(1), 0)
			assert.ok(!Object.is(log2FloatSeries(1), -0))
		})

		it('returns exact integer exponents for positive and negative powers of 2', () => {
			for (let k = -1022; k <= 1023; k += 1) {
				if (
					k === -1022 ||
					k === -1000 ||
					k === -500 ||
					k === -53 ||
					k === -10 ||
					(k >= -8 && k <= 8) ||
					k === 10 ||
					k === 53 ||
					k === 500 ||
					k === 1000 ||
					k === 1023
				) {
					const x = 2 ** k
					assert.equal(log2FloatSeries(x), k, `failed for 2^${k}`)
				}
			}
		})

		it('returns exact integer exponents for subnormal powers of 2', () => {
			for (let k = -1074; k <= -1023; k += 1) {
				const x = 2 ** k
				assert.equal(log2FloatSeries(x), k, `failed for subnormal 2^${k}`)
			}
		})
	})

	describe('normal positive values and cross-checks', () => {
		const samples = [
			0.001,
			0.1,
			0.25,
			0.3,
			0.5,
			0.75,
			0.9,
			1.1,
			1.5,
			Math.SQRT2,
			Math.E,
			Math.PI,
			3,
			5,
			7,
			10,
			42,
			100,
			1000,
			123456.789,
			1e12,
			1e50,
			1e150,
			1e-12,
			1e-50,
			1e-150
		]

		it('matches Math.log2 to near float64 precision across normal values', () => {
			for (const x of samples) {
				const actual = log2FloatSeries(x)
				const expected = Math.log2(x)
				assertClose(actual, expected, 1e-14, 1e-15, `x=${x}`)
			}
		})

		it('satisfies round-trip identity 2^y ≈ x', () => {
			for (const x of samples) {
				const y = log2FloatSeries(x)
				const reconstructed = 2 ** y
				assertClose(reconstructed, x, 1e-12, 0, `round-trip x=${x}`)
			}
		})

		it('satisfies logarithm algebraic identities', () => {
			const pairs = [
				[3, 7],
				[Math.PI, Math.E],
				[0.12345, 9876.5],
				[1e-40, 1e60]
			]
			for (const [a, b] of pairs) {
				// log2(a * b) = log2(a) + log2(b)
				assertClose(
					log2FloatSeries(a * b),
					log2FloatSeries(a) + log2FloatSeries(b),
					1e-13,
					1e-14,
					`product (${a}, ${b})`
				)
				// log2(1 / a) = -log2(a)
				assertClose(log2FloatSeries(1 / a), -log2FloatSeries(a), 1e-14, 1e-15, `reciprocal ${a}`)
			}
		})

		it('is strictly monotonically increasing', () => {
			const xs = [
				Number.MIN_VALUE,
				1e-320,
				1e-308,
				1e-100,
				0.5,
				0.999999999999,
				1,
				1.000000000001,
				Math.SQRT2,
				2,
				10,
				1e100,
				Number.MAX_VALUE
			]
			for (let i = 1; i < xs.length; i += 1) {
				assert.ok(
					log2FloatSeries(xs[i]) > log2FloatSeries(xs[i - 1]),
					`expected log2(${xs[i]}) > log2(${xs[i - 1]})`
				)
			}
		})
	})

	describe('values near 1 (cancellation resistance)', () => {
		const deltas = [
			Number.EPSILON,
			Number.EPSILON * 2,
			1e-15,
			1e-12,
			1e-9,
			1e-6,
			1e-3,
			0.05,
			-Number.EPSILON / 2,
			-Number.EPSILON,
			-1e-15,
			-1e-12,
			-1e-9,
			-1e-6,
			-1e-3,
			-0.05
		]

		it('preserves high relative accuracy near x = 1 from both above and below', () => {
			for (const d of deltas) {
				const x = 1 + d
				const actual = log2FloatSeries(x)
				const expected = Math.log2(x)
				assertClose(actual, expected, 1e-14, 0, `x=1+(${d})`)
			}
		})

		it('handles values near the √2 reduction boundary accurately', () => {
			const boundaryValues = [
				Math.SQRT2 - 1e-12,
				Math.SQRT2 - Number.EPSILON,
				Math.SQRT2,
				Math.SQRT2 + Number.EPSILON,
				Math.SQRT2 + 1e-12,
				Math.SQRT1_2 - 1e-12,
				Math.SQRT1_2,
				Math.SQRT1_2 + 1e-12
			]
			for (const x of boundaryValues) {
				assertClose(log2FloatSeries(x), Math.log2(x), 1e-14, 1e-15, `boundary x=${x}`)
			}
		})
	})

	describe('very large, very small, and subnormal positive floats', () => {
		it('handles very large positive floats up to Number.MAX_VALUE', () => {
			const larges = [1e200, 1e300, 1e308, Number.MAX_VALUE * 0.5, Number.MAX_VALUE]
			for (const x of larges) {
				const actual = log2FloatSeries(x)
				const expected = Math.log2(x)
				assertClose(actual, expected, 1e-15, 1e-15, `large x=${x}`)
			}
		})

		it('handles very small normal floats down to 2^-1022', () => {
			const minNormal = 2 ** -1022
			const smallNormals = [1e-200, 1e-300, 1e-307, minNormal * 1.5, minNormal]
			for (const x of smallNormals) {
				const actual = log2FloatSeries(x)
				const expected = Math.log2(x)
				assertClose(actual, expected, 1e-15, 1e-15, `small normal x=${x}`)
			}
		})

		it('handles subnormal positive floats accurately', () => {
			const maxSubnormal = 2 ** -1022 - Number.MIN_VALUE
			const subnormals = [
				Number.MIN_VALUE,
				Number.MIN_VALUE * 2,
				Number.MIN_VALUE * 3,
				Number.MIN_VALUE * 17,
				1e-322,
				1e-320,
				1e-315,
				1e-310,
				2 ** -1050 * 1.375,
				maxSubnormal
			]
			for (const x of subnormals) {
				const actual = log2FloatSeries(x)
				const expected = Math.log2(x)
				assertClose(actual, expected, 1e-15, 1e-15, `subnormal x=${x}`)
				assertClose(2 ** actual, x, 1e-12, 0, `subnormal round-trip x=${x}`)
			}
		})
	})

	describe('input validation and domain errors', () => {
		it('throws RangeError for x <= 0 (including +0 and -0)', () => {
			for (const bad of [0, -0, -Number.MIN_VALUE, -1e-10, -1, -42, -Number.MAX_VALUE]) {
				assert.throws(() => log2FloatSeries(bad), RangeError, `expected RangeError for ${bad}`)
			}
		})

		it('throws RangeError for non-finite numbers', () => {
			for (const bad of [NaN, Infinity, -Infinity]) {
				assert.throws(() => log2FloatSeries(bad), RangeError, `expected RangeError for ${bad}`)
			}
		})

		it('throws TypeError for non-number inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				'2',
				'1',
				'',
				true,
				false,
				2n,
				{},
				[2],
				() => 2,
				Symbol('x')
			]
			for (const bad of invalidInputs) {
				assert.throws(() => log2FloatSeries(bad), TypeError, `expected TypeError for ${String(bad)}`)
			}
		})
	})

	describe('dense sweep against Math.log2', () => {
		it('matches Math.log2 across 1000 logarithmically spaced values', () => {
			let maxRelErr = 0
			for (let i = 0; i < 1000; i += 1) {
				// Span exponents from -1070 (subnormal) to +1020 (near MAX_VALUE)
				const exp = -1070 + (i / 999) * 2090
				const x = 2 ** exp
				if (x === 0 || !Number.isFinite(x)) continue
				const actual = log2FloatSeries(x)
				const expected = Math.log2(x)
				const relErr = expected === 0 ? Math.abs(actual) : Math.abs(actual - expected) / Math.abs(expected)
				if (relErr > maxRelErr) maxRelErr = relErr
				assertClose(actual, expected, 1e-14, 1e-15, `sweep i=${i}, x=${x}`)
			}
			assert.ok(maxRelErr < 1e-14, `maxRelErr too high: ${maxRelErr}`)
		})
	})
})
