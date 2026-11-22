import { describe, test } from 'node:test'
import assert from 'node:assert'
import { sqrtDualSeries } from './sqrtDualSeries.js'

function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-12, message) {
	const diff = Math.abs(actual - expected)
	const bound = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= bound,
		`${message ?? 'Values not close'}: actual=${actual}, expected=${expected}, diff=${diff}, bound=${bound}`
	)
}

function mulDual(a, b) {
	return {
		v: a.v * b.v,
		d: a.v * b.d + a.d * b.v,
	}
}

describe('sqrtDualSeries', () => {
	test('computes exact values for perfect squares', () => {
		assert.deepStrictEqual(sqrtDualSeries({ v: 1, d: 1 }), { v: 1, d: 0.5 })
		assert.deepStrictEqual(sqrtDualSeries({ v: 4, d: 1 }), { v: 2, d: 0.25 })
		assert.deepStrictEqual(sqrtDualSeries({ v: 9, d: 6 }), { v: 3, d: 1 })
		assert.deepStrictEqual(sqrtDualSeries({ v: 16, d: -8 }), { v: 4, d: -1 })
		assert.deepStrictEqual(sqrtDualSeries({ v: 25, d: 0 }), { v: 5, d: 0 })
		assert.deepStrictEqual(sqrtDualSeries({ v: 0.25, d: 1 }), { v: 0.5, d: 1 })
	})

	test('computes accurate values for irrational roots and extreme scales', () => {
		const r2 = sqrtDualSeries({ v: 2, d: 1 })
		assertClose(r2.v, Math.SQRT2)
		assertClose(r2.d, 1 / (2 * Math.SQRT2))

		const small = sqrtDualSeries({ v: 1e-12, d: 2e-6 })
		assertClose(small.v, 1e-6)
		assertClose(small.d, 1)

		const large = sqrtDualSeries({ v: 1e16, d: 2e8 })
		assertClose(large.v, 1e8)
		assertClose(large.d, 1)

		const subnormal = sqrtDualSeries({ v: Number.MIN_VALUE, d: 1 })
		assert.ok(Number.isFinite(subnormal.v) && subnormal.v > 0)
		assert.ok(Number.isFinite(subnormal.d) && subnormal.d > 0)
	})

	test('handles v === 0 edge cases cleanly', () => {
		assert.deepStrictEqual(sqrtDualSeries({ v: 0, d: 0 }), { v: 0, d: 0 })
		assert.deepStrictEqual(sqrtDualSeries({ v: -0, d: -0 }), { v: 0, d: 0 })
		assert.deepStrictEqual(sqrtDualSeries({ v: 4, d: -0 }), { v: 2, d: 0 })

		assert.throws(() => sqrtDualSeries({ v: 0, d: 1 }), RangeError)
		assert.throws(() => sqrtDualSeries({ v: 0, d: -1 }), RangeError)
		assert.throws(() => sqrtDualSeries({ v: 0, d: 1e-300 }), RangeError)
	})

	test('rejects negative primal values v < 0', () => {
		assert.throws(() => sqrtDualSeries({ v: -1, d: 0 }), RangeError)
		assert.throws(() => sqrtDualSeries({ v: -4, d: 1 }), RangeError)
		assert.throws(() => sqrtDualSeries({ v: -1e-15, d: -2 }), RangeError)
	})

	test('rejects invalid inputs and non-finite components', () => {
		for (const bad of [null, undefined, 4, '4', true, [4, 1], () => {}]) {
			assert.throws(() => sqrtDualSeries(bad), TypeError)
		}

		for (const bad of [{}, { v: 4 }, { d: 1 }, { v: '4', d: 1 }, { v: 4, d: null }]) {
			assert.throws(() => sqrtDualSeries(bad), TypeError)
		}

		for (const bad of [
			{ v: Number.NaN, d: 1 },
			{ v: 4, d: Number.NaN },
			{ v: Number.POSITIVE_INFINITY, d: 1 },
			{ v: Number.NEGATIVE_INFINITY, d: 1 },
			{ v: 4, d: Number.POSITIVE_INFINITY },
			{ v: 4, d: Number.NEGATIVE_INFINITY },
		]) {
			assert.throws(() => sqrtDualSeries(bad), RangeError)
		}

		// Extreme derivative overflow
		assert.throws(() => sqrtDualSeries({ v: 1e-300, d: 1e300 }), RangeError)
	})

	test('cross-check: squaring the dual result recovers the input', () => {
		const samples = [
			{ v: 0.01, d: -0.3 },
			{ v: 2, d: 3.5 },
			{ v: 7.25, d: -11.4 },
			{ v: 123.456, d: 0.789 },
			{ v: 1e6, d: 42 },
		]

		for (const input of samples) {
			const root = sqrtDualSeries(input)
			const squared = mulDual(root, root)
			assertClose(squared.v, input.v, 1e-12, 1e-12, `squared.v for v=${input.v}`)
			assertClose(squared.d, input.d, 1e-12, 1e-12, `squared.d for v=${input.v}, d=${input.d}`)
		}
	})

	test('cross-check: derivative matches central finite difference', () => {
		const h = 1e-6
		const samples = [
			{ v: 0.5, d: 1 },
			{ v: 2.5, d: -3 },
			{ v: 10, d: 4.2 },
			{ v: 42.7, d: 0.15 },
		]

		for (const input of samples) {
			const res = sqrtDualSeries(input)
			const fd = (Math.sqrt(input.v + h * input.d) - Math.sqrt(input.v - h * input.d)) / (2 * h)
			assertClose(res.d, fd, 1e-8, 1e-8, `finite diff for v=${input.v}, d=${input.d}`)
		}
	})

	test('cross-check: chain rule and nested composition (fourth root)', () => {
		// f(x) = sqrt(x^2 + 3x + 1), f'(x) = (2x + 3) / (2 * sqrt(x^2 + 3x + 1))
		const x = 2.5
		const g = { v: x * x + 3 * x + 1, d: 2 * x + 3 }
		const fg = sqrtDualSeries(g)
		const expectedVal = Math.sqrt(g.v)
		const expectedDeriv = g.d / (2 * expectedVal)
		assertClose(fg.v, expectedVal)
		assertClose(fg.d, expectedDeriv)

		// Nested sqrtDualSeries(sqrtDualSeries({ v, d })) == v^(1/4) with d/dv = (1/4) * v^(-3/4) * d
		const input = { v: 16, d: 3 }
		const fourth = sqrtDualSeries(sqrtDualSeries(input))
		assertClose(fourth.v, 2)
		assertClose(fourth.d, (3 / 4) * Math.pow(16, -0.75))
	})
})
