import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sqrtDualIterative } from './sqrtDualIterative.js'

function assertRelClose(actual, expected, relTol = 1e-14, absTol = 0, label = '') {
	if (expected === 0) {
		assert.ok(
			Math.abs(actual) <= absTol,
			`${label}: expected ${actual} to be within ${absTol} of 0`
		)
		return
	}
	const diff = Math.abs(actual - expected)
	const limit = Math.max(relTol * Math.abs(expected), absTol)
	assert.ok(
		diff <= limit,
		`${label}: expected ${actual} ≈ ${expected} (diff=${diff}, limit=${limit})`
	)
}

describe('sqrtDualIterative', () => {
	describe('normal cases', () => {
		it('computes exact square roots and derivatives for perfect squares', () => {
			const cases = [
				{ x: { v: 1, d: 1 }, expected: { v: 1, d: 0.5 } },
				{ x: { v: 4, d: 1 }, expected: { v: 2, d: 0.25 } },
				{ x: { v: 9, d: 6 }, expected: { v: 3, d: 1 } },
				{ x: { v: 16, d: -8 }, expected: { v: 4, d: -1 } },
				{ x: { v: 0.25, d: 3 }, expected: { v: 0.5, d: 3 } },
				{ x: { v: 100, d: 0 }, expected: { v: 10, d: 0 } },
			]

			for (const { x, expected } of cases) {
				const res = sqrtDualIterative(x)
				assertRelClose(res.v, expected.v, 4 * Number.EPSILON, 0, `v for ${JSON.stringify(x)}`)
				assertRelClose(res.d, expected.d, 8 * Number.EPSILON, 0, `d for ${JSON.stringify(x)}`)
			}
		})

		it('computes accurate results for irrational square roots and arbitrary derivatives', () => {
			const samples = [
				{ v: 2, d: 1 },
				{ v: 3, d: -2.5 },
				{ v: 0.5, d: 0.75 },
				{ v: Math.PI, d: Math.E },
				{ v: 12345.6789, d: -987.654 },
				{ v: 1e-7, d: 3.14e-4 },
				{ v: 1e12, d: 5e6 },
			]

			for (const x of samples) {
				const res = sqrtDualIterative(x)
				const refV = Math.sqrt(x.v)
				const refD = x.d / (2 * refV)
				assertRelClose(res.v, refV, 4 * Number.EPSILON, 0, `v for ${JSON.stringify(x)}`)
				assertRelClose(res.d, refD, 8 * Number.EPSILON, 0, `d for ${JSON.stringify(x)}`)
			}
		})

		it('does not mutate the input object', () => {
			const input = Object.freeze({ v: 9, d: 6 })
			const res = sqrtDualIterative(input)
			assert.deepStrictEqual(res, { v: 3, d: 1 })
			assert.notEqual(res, input)
		})
	})

	describe('edge cases and extreme magnitudes', () => {
		it('returns { v: 0, d: 0 } for { v: 0, d: 0 } and normalizes -0', () => {
			assert.deepStrictEqual(sqrtDualIterative({ v: 0, d: 0 }), { v: 0, d: 0 })
			assert.deepStrictEqual(sqrtDualIterative({ v: -0, d: 0 }), { v: 0, d: 0 })
			assert.deepStrictEqual(sqrtDualIterative({ v: -0, d: -0 }), { v: 0, d: 0 })

			const res = sqrtDualIterative({ v: 4, d: -0 })
			assert.ok(Object.is(res.v, 2))
			assert.ok(Object.is(res.d, 0))
		})

		it('handles extreme IEEE-754 magnitudes including subnormals and Number.MAX_VALUE', () => {
			const extremes = [
				{ v: Number.MIN_VALUE, d: 1 },
				{ v: Number.MIN_VALUE, d: Number.MIN_VALUE },
				{ v: 2.225073858507201e-308, d: -1e-150 }, // largest subnormal
				{ v: 2.2250738585072014e-308, d: 1e-154 }, // smallest normal
				{ v: 1e-308, d: 2e154 }, // near-MAX_VALUE derivative without overflow
				{ v: Number.MAX_VALUE, d: 1 },
				{ v: Number.MAX_VALUE, d: Number.MAX_VALUE },
				{ v: Number.MAX_VALUE, d: -Number.MAX_VALUE },
			]

			for (const x of extremes) {
				const res = sqrtDualIterative(x)
				const refV = Math.sqrt(x.v)
				const refD = Math.abs(x.d) > 1 ? (0.5 * x.d) / refV : 0.5 * (x.d / refV)
				assertRelClose(res.v, refV, 4 * Number.EPSILON, 0, `v for ${JSON.stringify(x)}`)
				assertRelClose(res.d, refD, 8 * Number.EPSILON, Number.MIN_VALUE, `d for ${JSON.stringify(x)}`)
			}
		})
	})

	describe('cross-checks: algebraic identities, analytic formula, and finite differences', () => {
		it('satisfies dual squaring identity y * y === x', () => {
			const samples = [
				{ v: 0.1, d: -0.3 },
				{ v: 2, d: 1 },
				{ v: 7.5, d: 4.2 },
				{ v: 1e-40, d: 1e-20 },
				{ v: 1e40, d: -1e25 },
			]

			for (const x of samples) {
				const y = sqrtDualIterative(x)
				const sqV = y.v * y.v
				const sqD = 2 * y.v * y.d
				assertRelClose(sqV, x.v, 8 * Number.EPSILON, 0, `sqV for ${JSON.stringify(x)}`)
				assertRelClose(sqD, x.d, 16 * Number.EPSILON, 0, `sqD for ${JSON.stringify(x)}`)
			}
		})

		it('matches analytic derivative d / (2 * sqrt(v)) across log-spaced grid', () => {
			for (let exp = -100; exp <= 100; exp += 13) {
				const v = 3.7 * 10 ** exp
				const d = (exp % 2 === 0 ? 1 : -1) * 2.3 * 10 ** (exp / 2)
				const res = sqrtDualIterative({ v, d })
				const refV = Math.sqrt(v)
				const refD = d / (2 * refV)
				assertRelClose(res.v, refV, 4 * Number.EPSILON, 0, `grid v exp=${exp}`)
				assertRelClose(res.d, refD, 8 * Number.EPSILON, 0, `grid d exp=${exp}`)
			}
		})

		it('matches central finite differences for directional and composite derivatives', () => {
			const h = 1e-6
			const points = [
				{ v: 0.25, d: 1 },
				{ v: 1.5, d: 2.3 },
				{ v: 5.0, d: -1.7 },
				{ v: 42.0, d: 0.5 },
				{ v: 1000.0, d: -12.4 },
			]

			for (const { v, d } of points) {
				const res = sqrtDualIterative({ v, d })
				const fd = (Math.sqrt(v + h * d) - Math.sqrt(v - h * d)) / (2 * h)
				assertRelClose(res.d, fd, 1e-8, 1e-10, `central FD for v=${v}, d=${d}`)
			}

			// Composite function f(t) = sqrt(sqrt(t^2 + 3t + 5)) at several t
			const evalF = (t) => Math.sqrt(Math.sqrt(t * t + 3 * t + 5))
			for (const t of [-2.5, 0, 1.2, 4.7]) {
				const inner = { v: t * t + 3 * t + 5, d: 2 * t + 3 }
				const outer = sqrtDualIterative(sqrtDualIterative(inner))
				const fd = (evalF(t + h) - evalF(t - h)) / (2 * h)
				assertRelClose(outer.v, evalF(t), 8 * Number.EPSILON, 0, `composite v at t=${t}`)
				assertRelClose(outer.d, fd, 1e-8, 1e-10, `composite FD at t=${t}`)
			}
		})
	})

	describe('input validation and domain errors', () => {
		it('throws TypeError for invalid input types', () => {
			const badInputs = [
				null,
				undefined,
				4,
				'4',
				true,
				[4, 1],
				{},
				{ v: 4 },
				{ d: 1 },
				{ v: '4', d: 1 },
				{ v: 4, d: '1' },
				{ v: 4, d: null },
			]

			for (const bad of badInputs) {
				assert.throws(
					() => sqrtDualIterative(bad),
					TypeError,
					`Expected TypeError for ${JSON.stringify(bad)}`
				)
			}
		})

		it('throws RangeError for non-finite components', () => {
			const nonFinite = [
				{ v: NaN, d: 1 },
				{ v: 4, d: NaN },
				{ v: Infinity, d: 1 },
				{ v: -Infinity, d: 1 },
				{ v: 4, d: Infinity },
				{ v: 4, d: -Infinity },
			]

			for (const bad of nonFinite) {
				assert.throws(
					() => sqrtDualIterative(bad),
					RangeError,
					`Expected RangeError for ${JSON.stringify(bad)}`
				)
			}
		})

		it('throws RangeError for negative primal value v < 0', () => {
			assert.throws(() => sqrtDualIterative({ v: -1, d: 0 }), RangeError)
			assert.throws(() => sqrtDualIterative({ v: -0.0001, d: 1 }), RangeError)
			assert.throws(() => sqrtDualIterative({ v: -Number.MIN_VALUE, d: 0 }), RangeError)
		})

		it('throws RangeError for singular derivative at v === 0 with d !== 0', () => {
			assert.throws(() => sqrtDualIterative({ v: 0, d: 1 }), RangeError)
			assert.throws(() => sqrtDualIterative({ v: 0, d: -1 }), RangeError)
			assert.throws(() => sqrtDualIterative({ v: -0, d: 1e-300 }), RangeError)
		})

		it('throws RangeError when derivative overflows finite double precision', () => {
			assert.throws(
				() => sqrtDualIterative({ v: Number.MIN_VALUE, d: Number.MAX_VALUE }),
				RangeError
			)
			assert.throws(
				() => sqrtDualIterative({ v: 1e-308, d: 1e155 }),
				RangeError
			)
		})
	})
})
