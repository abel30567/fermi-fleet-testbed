import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { sqrtDualIterative } from './sqrtDualIterative.js'

function assertClose(actual, expected, relTol = 1e-14, absTol = 1e-15, label = '') {
	const diff = Math.abs(actual - expected)
	const bound = Math.max(absTol, relTol * Math.abs(expected))
	assert.ok(
		diff <= bound,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${bound} of ${expected} (diff=${diff})`
	)
}

describe('sqrtDualIterative', () => {
	describe('normal cases', () => {
		it('computes exact value and derivative for perfect squares', () => {
			const cases = [
				{ input: { v: 1, d: 1 }, expected: { v: 1, d: 0.5 } },
				{ input: { v: 4, d: 1 }, expected: { v: 2, d: 0.25 } },
				{ input: { v: 9, d: 6 }, expected: { v: 3, d: 1 } },
				{ input: { v: 25, d: -10 }, expected: { v: 5, d: -1 } },
				{ input: { v: 0.25, d: 3 }, expected: { v: 0.5, d: 3 } },
			]

			for (const { input, expected } of cases) {
				const res = sqrtDualIterative(input)
				assertClose(res.v, expected.v, 1e-15, 1e-15, `v for ${JSON.stringify(input)}`)
				assertClose(res.d, expected.d, 1e-15, 1e-15, `d for ${JSON.stringify(input)}`)
			}
		})

		it('computes accurate value and derivative for irrational roots', () => {
			for (const [v, d] of [
				[2, 1],
				[3, -2.5],
				[10, 7.25],
				[0.123456789, 4.2],
				[12345.6789, -0.003],
			]) {
				const res = sqrtDualIterative({ v, d })
				const expectedV = Math.sqrt(v)
				const expectedD = d / (2 * expectedV)
				assertClose(res.v, expectedV, 1e-14, 1e-15, `v(${v})`)
				assertClose(res.d, expectedD, 1e-14, 1e-15, `d(${v}, ${d})`)
			}
		})

		it('handles zero derivative d = 0 and normalizes -0', () => {
			const res1 = sqrtDualIterative({ v: 16, d: 0 })
			assert.equal(res1.v, 4)
			assert.ok(Object.is(res1.d, 0))

			const res2 = sqrtDualIterative({ v: 16, d: -0 })
			assert.equal(res2.v, 4)
			assert.ok(Object.is(res2.d, 0))
		})

		it('satisfies chain rule for composed functions f(x) = sqrt(x^2 + 3x + 1)', () => {
			for (const x of [0.5, 1, 2.5, 10]) {
				const inner = { v: x * x + 3 * x + 1, d: 2 * x + 3 }
				const res = sqrtDualIterative(inner)
				const expectedV = Math.sqrt(x * x + 3 * x + 1)
				const expectedD = (2 * x + 3) / (2 * expectedV)
				assertClose(res.v, expectedV, 1e-14, 1e-15, `chain v at x=${x}`)
				assertClose(res.d, expectedD, 1e-14, 1e-15, `chain d at x=${x}`)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('matches central finite-difference derivatives across diverse inputs', () => {
			const points = [
				{ v: 0.01, d: 1 },
				{ v: 0.5, d: -3.2 },
				{ v: 2, d: 1 },
				{ v: 7.5, d: 4.5 },
				{ v: 100, d: -12 },
				{ v: 5000, d: 0.75 },
			]

			for (const { v, d } of points) {
				const h = Math.cbrt(Number.EPSILON) * v
				const fdDeriv = ((Math.sqrt(v + h) - Math.sqrt(v - h)) / (2 * h)) * d
				const res = sqrtDualIterative({ v, d })
				assertClose(res.d, fdDeriv, 1e-8, 1e-10, `finite-diff for v=${v}, d=${d}`)
			}
		})

		it('satisfies the dual-number algebraic identity (sqrt(x))^2 === x', () => {
			for (const [v, d] of [
				[2, 5],
				[0.007, -0.3],
				[42.195, 1.618],
				[1e12, -1e9],
				[1e-12, 1e-9],
			]) {
				const { v: u, d: t } = sqrtDualIterative({ v, d })
				// Dual multiplication: (u + t*e)^2 = u^2 + (2*u*t)*e
				assertClose(u * u, v, 1e-14, 0, `u^2 for v=${v}`)
				assertClose(2 * u * t, d, 1e-14, 0, `2*u*t for v=${v}, d=${d}`)
			}
		})
	})

	describe('edge cases', () => {
		it('returns { v: 0, d: 0 } for { v: 0, d: 0 } and { v: -0, d: -0 }', () => {
			const r1 = sqrtDualIterative({ v: 0, d: 0 })
			assert.ok(Object.is(r1.v, 0))
			assert.ok(Object.is(r1.d, 0))

			const r2 = sqrtDualIterative({ v: -0, d: -0 })
			assert.ok(Object.is(r2.v, 0))
			assert.ok(Object.is(r2.d, 0))
		})

		it('handles extreme magnitudes without spurious overflow or underflow', () => {
			const large = sqrtDualIterative({ v: 1e300, d: 2e300 })
			assertClose(large.v, 1e150, 1e-14, 0, 'large v')
			assertClose(large.d, 1e150, 1e-14, 0, 'large d')

			const maxV = sqrtDualIterative({ v: Number.MAX_VALUE, d: Number.MAX_VALUE })
			assertClose(maxV.v, Math.sqrt(Number.MAX_VALUE), 1e-14, 0, 'MAX_VALUE v')
			assertClose(maxV.d, Number.MAX_VALUE / (2 * Math.sqrt(Number.MAX_VALUE)), 1e-14, 0, 'MAX_VALUE d')

			const small = sqrtDualIterative({ v: 1e-300, d: 2e-300 })
			assertClose(small.v, 1e-150, 1e-14, 0, 'small v')
			assertClose(small.d, 1e-150, 1e-14, 0, 'small d')

			const subnormal = sqrtDualIterative({ v: Number.MIN_VALUE, d: 1e-300 })
			assertClose(subnormal.v, Math.sqrt(Number.MIN_VALUE), 1e-14, 0, 'MIN_VALUE v')
			assertClose(subnormal.d, 1e-300 / (2 * Math.sqrt(Number.MIN_VALUE)), 1e-14, 0, 'MIN_VALUE d')
		})

		it('supports custom tolerance and maxIterations options', () => {
			const exact = sqrtDualIterative({ v: 2, d: 3 }, { tolerance: 0, maxIterations: 50 })
			assertClose(exact.v, Math.SQRT2, 1e-15, 0)
			assertClose(exact.d, 3 / (2 * Math.SQRT2), 1e-15, 0)

			// Verify exact 2nd dual Newton iterate from u0 = 1, t0 = 0:
			// iter 1 -> (3/2, 3/2), iter 2 -> (17/12, 13/12)
			const twoSteps = sqrtDualIterative({ v: 2, d: 3 }, { tolerance: 0, maxIterations: 2 })
			assertClose(twoSteps.v, 17 / 12, 1e-15, 0)
			assertClose(twoSteps.d, 13 / 12, 1e-15, 0)

			const coarse = sqrtDualIterative({ v: 2, d: 3 }, { tolerance: 1e-6 })
			assertClose(coarse.v, Math.SQRT2, 1e-6, 0)
			assertClose(coarse.d, 3 / (2 * Math.SQRT2), 1e-6, 0)
		})

		it('does not mutate the input object', () => {
			const input = Object.freeze({ v: 9, d: 4 })
			const res = sqrtDualIterative(input)
			assert.deepEqual(res, { v: 3, d: 4 / 6 })
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-object or malformed dual inputs', () => {
			for (const bad of [null, undefined, 4, '4', true, [4, 1]]) {
				assert.throws(() => sqrtDualIterative(bad), TypeError)
			}
			for (const bad of [{ v: 4 }, { d: 1 }, { v: '4', d: 1 }, { v: 4, d: '1' }, { v: 4, d: null }]) {
				assert.throws(() => sqrtDualIterative(bad), TypeError)
			}
		})

		it('throws RangeError for non-finite v or d', () => {
			for (const bad of [
				{ v: Number.NaN, d: 1 },
				{ v: 4, d: Number.NaN },
				{ v: Infinity, d: 1 },
				{ v: -Infinity, d: 1 },
				{ v: 4, d: Infinity },
				{ v: 4, d: -Infinity },
			]) {
				assert.throws(() => sqrtDualIterative(bad), RangeError)
			}
		})

		it('throws RangeError for negative v', () => {
			assert.throws(() => sqrtDualIterative({ v: -1, d: 0 }), RangeError)
			assert.throws(() => sqrtDualIterative({ v: -1e-15, d: 1 }), RangeError)
		})

		it('throws RangeError for singular zero v = 0 with d != 0', () => {
			assert.throws(() => sqrtDualIterative({ v: 0, d: 1 }), RangeError)
			assert.throws(() => sqrtDualIterative({ v: 0, d: -1e-12 }), RangeError)
			assert.throws(() => sqrtDualIterative({ v: -0, d: 0.5 }), RangeError)
		})

		it('validates options argument and fields', () => {
			assert.throws(() => sqrtDualIterative({ v: 4, d: 1 }, null), TypeError)
			assert.throws(() => sqrtDualIterative({ v: 4, d: 1 }, []), TypeError)
			assert.throws(() => sqrtDualIterative({ v: 4, d: 1 }, 'fast'), TypeError)

			assert.throws(() => sqrtDualIterative({ v: 4, d: 1 }, { tolerance: '1e-6' }), TypeError)
			assert.throws(() => sqrtDualIterative({ v: 4, d: 1 }, { tolerance: -1e-6 }), RangeError)
			assert.throws(() => sqrtDualIterative({ v: 4, d: 1 }, { tolerance: Number.NaN }), RangeError)
			assert.throws(() => sqrtDualIterative({ v: 4, d: 1 }, { tolerance: Infinity }), RangeError)

			assert.throws(() => sqrtDualIterative({ v: 4, d: 1 }, { maxIterations: '10' }), TypeError)
			assert.throws(() => sqrtDualIterative({ v: 4, d: 1 }, { maxIterations: 0 }), RangeError)
			assert.throws(() => sqrtDualIterative({ v: 4, d: 1 }, { maxIterations: -5 }), RangeError)
			assert.throws(() => sqrtDualIterative({ v: 4, d: 1 }, { maxIterations: 2.5 }), RangeError)
			assert.throws(() => sqrtDualIterative({ v: 4, d: 1 }, { maxIterations: Infinity }), RangeError)
		})
	})
})
