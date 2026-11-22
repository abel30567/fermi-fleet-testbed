import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { lnTypedSeries } from './lnTypedSeries.js'

function assertClose(actual, expected, relTol = 1e-14, absTol = 1e-15, label = '') {
	const diff = Math.abs(actual - expected)
	const bound = Math.max(absTol, relTol * Math.abs(expected))
	assert.ok(
		diff <= bound,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${bound} of ${expected} (diff=${diff})`
	)
}

describe('lnTypedSeries', () => {
	test('computes known exact and standard values without mutating input', () => {
		const input = new Float64Array([1, Math.E, Math.E ** 2, 2, 0.5, 10, 0.1, Math.SQRT2])
		const snapshot = new Float64Array(input)
		const result = lnTypedSeries(input)

		assert.ok(result instanceof Float64Array)
		assert.equal(result.length, input.length)
		assert.deepEqual(input, snapshot)

		assert.equal(result[0], 0)
		assertClose(result[1], 1, 1e-15, 1e-15, 'ln(e)')
		assertClose(result[2], 2, 1e-15, 1e-15, 'ln(e^2)')
		assertClose(result[3], Math.LN2, 1e-15, 1e-15, 'ln(2)')
		assertClose(result[4], -Math.LN2, 1e-15, 1e-15, 'ln(0.5)')
		assertClose(result[5], Math.LN10, 1e-15, 1e-15, 'ln(10)')
		assertClose(result[6], -Math.LN10, 1e-15, 1e-15, 'ln(0.1)')
		assertClose(result[7], Math.LN2 / 2, 1e-15, 1e-15, 'ln(sqrt(2))')
	})

	test('handles empty Float64Array', () => {
		const result = lnTypedSeries(new Float64Array(0))
		assert.ok(result instanceof Float64Array)
		assert.equal(result.length, 0)
	})

	test('handles very small, subnormal, near-one, and very large finite values', () => {
		const values = new Float64Array([
			Number.MIN_VALUE, // smallest positive subnormal (~5e-324)
			1e-315, // mid-range subnormal
			Number.MIN_VALUE * 2 ** 52, // subnormal/normal boundary
			1e-300,
			1 - 1e-12,
			1 + 1e-12,
			1 + Number.EPSILON,
			1e100,
			1e300,
			Number.MAX_VALUE
		])
		const result = lnTypedSeries(values)

		for (let i = 0; i < values.length; i += 1) {
			assertClose(result[i], Math.log(values[i]), 1e-14, 1e-15, `x=${values[i]}`)
		}
	})

	test('handles IEEE-754 special values (0, -0, negative, NaN, Infinity)', () => {
		const input = new Float64Array([
			0,
			-0,
			-1,
			-1e-300,
			Number.NEGATIVE_INFINITY,
			Number.NaN,
			Number.POSITIVE_INFINITY
		])
		const result = lnTypedSeries(input)

		assert.equal(result[0], Number.NEGATIVE_INFINITY)
		assert.equal(result[1], Number.NEGATIVE_INFINITY)
		assert.ok(Number.isNaN(result[2]))
		assert.ok(Number.isNaN(result[3]))
		assert.ok(Number.isNaN(result[4]))
		assert.ok(Number.isNaN(result[5]))
		assert.equal(result[6], Number.POSITIVE_INFINITY)
	})

	test('cross-checks against Math.log across a log-spaced grid', () => {
		const samples = []
		for (let exp = -250; exp <= 250; exp += 5) {
			for (const coeff of [1, 1.37, 2.718281828459045, 5.5, 9.99]) {
				samples.push(coeff * 10 ** exp)
			}
		}
		const input = new Float64Array(samples)
		const result = lnTypedSeries(input)

		for (let i = 0; i < input.length; i += 1) {
			assertClose(result[i], Math.log(input[i]), 1e-14, 1e-15, `grid[${i}]=${input[i]}`)
		}
	})

	test('satisfies algebraic identities ln(a*b) = ln(a) + ln(b) and ln(1/a) = -ln(a)', () => {
		const a = new Float64Array([0.003, 0.75, 1.25, 3.141592653589793, 42, 1e12])
		const b = new Float64Array([0.125, 2.5, 7.7, 19.3, 0.0004, 1e-9])
		const prod = new Float64Array(a.length)
		const inv = new Float64Array(a.length)
		for (let i = 0; i < a.length; i += 1) {
			prod[i] = a[i] * b[i]
			inv[i] = 1 / a[i]
		}

		const lnA = lnTypedSeries(a)
		const lnB = lnTypedSeries(b)
		const lnProd = lnTypedSeries(prod)
		const lnInv = lnTypedSeries(inv)

		for (let i = 0; i < a.length; i += 1) {
			assertClose(lnProd[i], lnA[i] + lnB[i], 1e-13, 1e-14, `product[${i}]`)
			assertClose(lnInv[i], -lnA[i], 1e-14, 1e-15, `reciprocal[${i}]`)
		}
	})

	test('throws TypeError for non-Float64Array inputs', () => {
		const invalidInputs = [
			null,
			undefined,
			123,
			'123',
			{},
			[1, 2, 3],
			new Float32Array([1, 2, 3]),
			new Int32Array([1, 2, 3]),
			new Uint8Array([1, 2, 3]),
			new ArrayBuffer(16)
		]

		for (const bad of invalidInputs) {
			assert.throws(() => lnTypedSeries(bad), TypeError)
		}
	})
})
