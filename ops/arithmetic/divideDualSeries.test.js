import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { divideDualSeries } from './divideDualSeries.js'

function multiplyDual(x, y) {
	return {
		v: x.v * y.v,
		d: x.v * y.d + x.d * y.v,
	}
}

describe('divideDualSeries', () => {
	test('divides typical positive dual numbers', () => {
		// (6 + 5ε) / (2 + 1ε) = 3 + ((5*2 - 6*1) / 4)ε = 3 + 1ε
		const res = divideDualSeries({ v: 6, d: 5 }, { v: 2, d: 1 })
		assert.deepEqual(res, { v: 3, d: 1 })
	})

	test('handles constant divisor (b.d = 0) and constant numerator (a.d = 0)', () => {
		assert.deepEqual(divideDualSeries({ v: 10, d: -6 }, { v: 2, d: 0 }), {
			v: 5,
			d: -3,
		})
		// Reciprocal rule: (1 + 0ε) / (4 + 2ε) = 0.25 + (-2/16)ε = 0.25 - 0.125ε
		assert.deepEqual(divideDualSeries({ v: 1, d: 0 }, { v: 4, d: 2 }), {
			v: 0.25,
			d: -0.125,
		})
	})

	test('dividing a non-zero dual number by itself yields { v: 1, d: 0 }', () => {
		const a = { v: -7.5, d: 3.25 }
		const res = divideDualSeries(a, a)
		assert.equal(res.v, 1)
		assert.equal(res.d, 0)
	})

	test('handles zero numerator and normalizes -0 to 0', () => {
		assert.deepEqual(divideDualSeries({ v: 0, d: 4 }, { v: -2, d: 3 }), {
			v: 0,
			d: -2,
		})
		assert.deepEqual(divideDualSeries({ v: 0, d: 0 }, { v: -5, d: 7 }), {
			v: 0,
			d: 0,
		})
	})

	test('handles negative values and derivatives across sign combinations', () => {
		// (-12 + 3ε) / (-4 - 2ε) = 3 + ((3*(-4) - (-12)*(-2)) / 16)ε = 3 + (-36 / 16)ε = 3 - 2.25ε
		const res = divideDualSeries({ v: -12, d: 3 }, { v: -4, d: -2 })
		assert.deepEqual(res, { v: 3, d: -2.25 })

		// (9 - 6ε) / (-3 + 1ε) = -3 + (((-6)*(-3) - 9*1) / 9)ε = -3 + 1ε
		const res2 = divideDualSeries({ v: 9, d: -6 }, { v: -3, d: 1 })
		assert.deepEqual(res2, { v: -3, d: 1 })
	})

	test('handles extreme scales where b.v^2 overflows or underflows', () => {
		const large = divideDualSeries({ v: 6e200, d: 5e200 }, { v: 2e200, d: 1e200 })
		assert.ok(Math.abs(large.v - 3) < 1e-12)
		assert.ok(Math.abs(large.d - 1) < 1e-12)

		const small = divideDualSeries({ v: 6e-200, d: 5e-200 }, { v: 2e-200, d: 1e-200 })
		assert.ok(Math.abs(small.v - 3) < 1e-12)
		assert.ok(Math.abs(small.d - 1) < 1e-12)
	})

	test('throws RangeError on division by zero (b.v === 0 or -0)', () => {
		assert.throws(
			() => divideDualSeries({ v: 1, d: 2 }, { v: 0, d: 1 }),
			RangeError
		)
		assert.throws(
			() => divideDualSeries({ v: 0, d: 0 }, { v: -0, d: 0 }),
			RangeError
		)
	})

	test('validates input types and throws TypeError / RangeError for invalid inputs', () => {
		for (const bad of [null, undefined, 42, 'dual', true, [1, 2]]) {
			assert.throws(() => divideDualSeries(bad, { v: 1, d: 0 }), TypeError)
			assert.throws(() => divideDualSeries({ v: 1, d: 0 }, bad), TypeError)
		}

		assert.throws(() => divideDualSeries({ v: '1', d: 0 }, { v: 1, d: 0 }), TypeError)
		assert.throws(() => divideDualSeries({ v: 1 }, { v: 1, d: 0 }), TypeError)
		assert.throws(() => divideDualSeries({ v: 1, d: 0 }, { d: 0 }), TypeError)
		assert.throws(() => divideDualSeries({ v: 1, d: 0 }, { v: 1, d: null }), TypeError)

		for (const nonFinite of [NaN, Infinity, -Infinity]) {
			assert.throws(
				() => divideDualSeries({ v: nonFinite, d: 0 }, { v: 1, d: 0 }),
				RangeError
			)
			assert.throws(
				() => divideDualSeries({ v: 1, d: nonFinite }, { v: 1, d: 0 }),
				RangeError
			)
			assert.throws(
				() => divideDualSeries({ v: 1, d: 0 }, { v: nonFinite, d: 0 }),
				RangeError
			)
			assert.throws(
				() => divideDualSeries({ v: 1, d: 0 }, { v: 1, d: nonFinite }),
				RangeError
			)
		}
	})

	test('cross-check: multiplying quotient by divisor recovers dividend', () => {
		const pairs = [
			[{ v: 3.5, d: -1.2 }, { v: 2.1, d: 0.7 }],
			[{ v: -0.75, d: 4.4 }, { v: -1.5, d: -3.2 }],
			[{ v: 17, d: 0 }, { v: 3, d: 9 }],
			[{ v: 0, d: 5.5 }, { v: 4.2, d: -1.1 }],
		]

		for (const [a, b] of pairs) {
			const q = divideDualSeries(a, b)
			const recovered = multiplyDual(q, b)
			assert.ok(
				Math.abs(recovered.v - a.v) < 1e-12,
				`Expected v=${a.v}, got ${recovered.v}`
			)
			assert.ok(
				Math.abs(recovered.d - a.d) < 1e-12,
				`Expected d=${a.d}, got ${recovered.d}`
			)
		}
	})

	test('cross-check: matches central finite-difference derivatives for smooth ratios', () => {
		const h = 1e-6
		const cases = [
			{
				name: '(x^3 - 2x + 1) / (sin(x) + 2)',
				f: (x) => x ** 3 - 2 * x + 1,
				df: (x) => 3 * x ** 2 - 2,
				g: (x) => Math.sin(x) + 2,
				dg: (x) => Math.cos(x),
				xs: [-2.5, -0.4, 0, 1.2, 3.1],
			},
			{
				name: 'exp(x) / (x^2 + 1)',
				f: (x) => Math.exp(x),
				df: (x) => Math.exp(x),
				g: (x) => x * x + 1,
				dg: (x) => 2 * x,
				xs: [-1.5, 0.25, 1.0, 2.0],
			},
		]

		for (const c of cases) {
			for (const x of c.xs) {
				const dual = divideDualSeries(
					{ v: c.f(x), d: c.df(x) },
					{ v: c.g(x), d: c.dg(x) }
				)
				const expectedV = c.f(x) / c.g(x)
				const fd = (c.f(x + h) / c.g(x + h) - c.f(x - h) / c.g(x - h)) / (2 * h)

				assert.ok(
					Math.abs(dual.v - expectedV) < 1e-12,
					`${c.name} at x=${x}: value mismatch`
				)
				assert.ok(
					Math.abs(dual.d - fd) < 1e-7,
					`${c.name} at x=${x}: dual.d=${dual.d} vs finite-diff=${fd}`
				)
			}
		}
	})

	test('cross-check: agrees with explicit truncated geometric series multiplication', () => {
		const a = { v: 4.2, d: -1.7 }
		const b = { v: 2.5, d: 0.9 }
		// 1/b = (1/b.v) * (1 - (b.d/b.v)ε)
		const invB = { v: 1 / b.v, d: -(b.d / (b.v * b.v)) }
		const seriesProduct = multiplyDual(a, invB)
		const res = divideDualSeries(a, b)

		assert.ok(Math.abs(res.v - seriesProduct.v) < 1e-15)
		assert.ok(Math.abs(res.d - seriesProduct.d) < 1e-15)
	})
})
